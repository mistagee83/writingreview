// ══════════════════════════════════════════════════════
// Cloud Functions – tranzakciós logika tesztek
//
// A Gemini-hívást NEM teszteli (az külső szolgáltatás); azt a részt
// a séma és a prompt-sablon fedi. Itt az osztálykód egyedisége és a
// csatlakozás tranzakciója van ellenőrizve, valódi Firestore
// emulátor ellen.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
// SZÁNDÉKOSAN más projekt-azonosító, mint a rules.test.mjs-ben: az
// ottani clearFirestore() különben kitörölné az itteni adatokat.
process.env.GCLOUD_PROJECT = "wr-functions-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

// A require-t a functions/ könyvtárhoz kötjük, hogy a firebase-admin
// a functions/node_modules-ból oldódjon fel, normál csomag-feloldással.
const require = createRequire(new URL("../functions/package.json", import.meta.url));

let firestore, logika;

before(async () => {
  const fs = require("firebase-admin/firestore");

  // A functions/index.js maga is meghívja az initializeApp()-ot.
  logika = require("./index.js")._teszt;

  firestore = fs.getFirestore();
});

after(async () => {
  await firestore?.terminate();
});

async function torolMindent() {
  // A felhasznalok alatti osztalyaim tükröt is takarítani kell, különben
  // átszivárog a következő tesztbe.
  const felh = await firestore.collection("felhasznalok").get();
  for (const d of felh.docs) {
    const sajat = await d.ref.collection("osztalyaim").get();
    await Promise.all(sajat.docs.map((x) => x.ref.delete()));
  }
  for (const koll of ["osztalyok", "kodok", "felhasznalok", "ai_hasznalat", "feladatok"]) {
    const snap = await firestore.collection(koll).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  // tagok alkollekció a szülővel együtt már nem elérhető, de a teszt
  // minden futásban új osztály-id-t kap, így nem zavar.
}

beforeEach(async () => {
  await torolMindent();
  await firestore.collection("felhasznalok").doc("diak-uid").set({
    nev: "Diák Dóra", email: "diak@iskola.hu", szerep: "diak"
  });
});

// ══════════════════════════════════════════
// KÓDGENERÁLÁS
// ══════════════════════════════════════════

test("a kód formátuma XXX-XXXX és nincs benne összetéveszthető karakter", () => {
  for (let i = 0; i < 500; i++) {
    const kod = logika.kodGeneralas();
    assert.match(kod, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{4}$/, `rossz kód: ${kod}`);
    assert.ok(!/[IO01]/.test(kod), `összetéveszthető karakter: ${kod}`);
  }
});

// ══════════════════════════════════════════
// OSZTÁLY LÉTREHOZÁSA
// ══════════════════════════════════════════

test("osztály létrehozása kódot is regisztrál a kodok nyilvántartóba", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "9.B angol"
  );

  const osztaly = (await firestore.collection("osztalyok").doc(osztalyId).get()).data();
  assert.equal(osztaly.nev, "9.B angol");
  assert.equal(osztaly.tanar_id, "tanar-uid");
  assert.equal(osztaly.kod, kod);
  assert.equal(osztaly.aktiv, true);
  assert.equal(osztaly.diak_szam, 0);

  const kodDoc = (await firestore.collection("kodok").doc(kod).get()).data();
  assert.equal(kodDoc.osztaly_id, osztalyId, "a kód az osztályra mutat");
});

test("20 osztály létrehozása után is minden kód egyedi", async () => {
  const kodok = [];
  for (let i = 0; i < 20; i++) {
    const { kod } = await logika.osztalyLetrehozasLogika(firestore, "tanar-uid", `Osztály ${i}`);
    kodok.push(kod);
  }
  assert.equal(new Set(kodok).size, 20, "van duplikált kód");
});

test("már létező kód nem írható felül (a tranzakció újrapróbál)", async () => {
  // Minden lehetséges kódot "foglaltnak" jelölünk, egy kivétellel:
  // így a ciklus kényszerűen ütközik, majd talál egy szabadot.
  const elsoKod = logika.kodGeneralas();
  await firestore.collection("kodok").doc(elsoKod).set({ osztaly_id: "idegen-osztaly" });

  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "Ütközés teszt"
  );

  assert.notEqual(kod, elsoKod, "nem használhatta fel a foglalt kódot");

  // A foglalt kód továbbra is az idegen osztályra mutat
  const foglalt = (await firestore.collection("kodok").doc(elsoKod).get()).data();
  assert.equal(foglalt.osztaly_id, "idegen-osztaly", "felülírta a foglalt kódot");

  const ujKod = (await firestore.collection("kodok").doc(kod).get()).data();
  assert.equal(ujKod.osztaly_id, osztalyId);
});

// ══════════════════════════════════════════
// CSATLAKOZÁS
// ══════════════════════════════════════════

test("csatlakozás létrehozza a tag bejegyzést és növeli a létszámot", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "9.B angol"
  );

  const eredmeny = await logika.csatlakozasLogika(firestore, "diak-uid", kod);
  assert.equal(eredmeny.osztalyId, osztalyId);
  assert.equal(eredmeny.mar_tag, false);
  assert.equal(eredmeny.nev, "9.B angol");

  const tag = (
    await firestore.collection("osztalyok").doc(osztalyId)
      .collection("tagok").doc("diak-uid").get()
  ).data();
  assert.equal(tag.nev, "Diák Dóra", "a nevet denormalizálva kell menteni");
  assert.equal(tag.email, "diak@iskola.hu");

  const osztaly = (await firestore.collection("osztalyok").doc(osztalyId).get()).data();
  assert.equal(osztaly.diak_szam, 1);

  // Tükör a felhasználó alatt – ebből listázza a diák az osztályait
  const tukor = (
    await firestore.collection("felhasznalok").doc("diak-uid")
      .collection("osztalyaim").doc(osztalyId).get()
  ).data();
  assert.ok(tukor, "a tükör bejegyzésnek létre kell jönnie");
  assert.equal(tukor.nev, "9.B angol");
  assert.equal(tukor.kod, kod);
  assert.equal(tukor.tanar_id, "tanar-uid");
});

test("a diák több osztályt is kilistázhat a tükörből", async () => {
  const a = await logika.osztalyLetrehozasLogika(firestore, "tanar-uid", "9.B angol");
  const b = await logika.osztalyLetrehozasLogika(firestore, "tanar-2", "Szakmai angol");

  await logika.csatlakozasLogika(firestore, "diak-uid", a.kod);
  await logika.csatlakozasLogika(firestore, "diak-uid", b.kod);

  const snap = await firestore.collection("felhasznalok").doc("diak-uid")
    .collection("osztalyaim").get();
  assert.equal(snap.size, 2);
  assert.deepEqual(
    snap.docs.map((d) => d.data().nev).sort(),
    ["9.B angol", "Szakmai angol"]
  );
});

test("kétszeri csatlakozás nem duplázza a létszámot", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "9.B angol"
  );

  await logika.csatlakozasLogika(firestore, "diak-uid", kod);
  const masodik = await logika.csatlakozasLogika(firestore, "diak-uid", kod);

  assert.equal(masodik.mar_tag, true, "jelezni kell, hogy már tag");

  const osztaly = (await firestore.collection("osztalyok").doc(osztalyId).get()).data();
  assert.equal(osztaly.diak_szam, 1, "a létszám nem növekedhet újra");
});

test("három diák csatlakozása után a létszám 3", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "9.B angol"
  );

  for (const uid of ["diak-1", "diak-2", "diak-3"]) {
    await firestore.collection("felhasznalok").doc(uid).set({
      nev: `Diák ${uid}`, email: `${uid}@iskola.hu`, szerep: "diak"
    });
    await logika.csatlakozasLogika(firestore, uid, kod);
  }

  const osztaly = (await firestore.collection("osztalyok").doc(osztalyId).get()).data();
  assert.equal(osztaly.diak_szam, 3);
});

test("ismeretlen kóddal a csatlakozás elhasal", async () => {
  await assert.rejects(
    () => logika.csatlakozasLogika(firestore, "diak-uid", "ZZZ-9999"),
    /nem találtam|not-found/i
  );
});

test("inaktív osztályhoz nem lehet csatlakozni", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "Lezárt osztály"
  );
  await firestore.collection("osztalyok").doc(osztalyId).update({ aktiv: false });

  await assert.rejects(
    () => logika.csatlakozasLogika(firestore, "diak-uid", kod),
    /nem fogad|failed-precondition/i
  );
});

test("törölt osztály kódjával a csatlakozás elhasal", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "Törlendő"
  );
  await firestore.collection("osztalyok").doc(osztalyId).delete();

  await assert.rejects(
    () => logika.csatlakozasLogika(firestore, "diak-uid", kod),
    /már nem létezik|not-found/i
  );
});

test("profil nélküli felhasználó is csatlakozhat, 'Névtelen' néven", async () => {
  const { osztalyId, kod } = await logika.osztalyLetrehozasLogika(
    firestore, "tanar-uid", "9.B angol"
  );

  await logika.csatlakozasLogika(firestore, "profil-nelkuli", kod);

  const tag = (
    await firestore.collection("osztalyok").doc(osztalyId)
      .collection("tagok").doc("profil-nelkuli").get()
  ).data();
  assert.equal(tag.nev, "Névtelen");
});

// ══════════════════════════════════════════
// VISSZAJELZÉS JÓVÁHAGYÁSA (visszajelzesJovahagyas)
// A diák egyedül itt láthat bármit: a skála betöltése, a jegy
// ellenőrzése és a tárolás bekötését ellenőrzi végponttól végpontig.
// ══════════════════════════════════════════

const kodja = async (fn) => {
  try { await fn(); } catch (e) { return e.details?.kod ?? `?${e.message}`; }
  return null;
};

async function beadasFelvetel({ rubrika, statusz = "javitva", ai } = {}) {
  await firestore.collection("feladatok").doc("f1").set({ tanar_id: "tanar-uid", osztaly_id: "o1", rubrika: rubrika || {} });
  const ref = firestore.collection("beadasok").doc("b1");
  await ref.set({ tanar_id: "tanar-uid", feladat_id: "f1", osztaly_id: "o1", statusz });
  await ref.collection("ertekeles").doc("ai").set(ai || {
    szempontok: [
      { kulcs: "tartalom", pont: 8, max: 10, megjegyzes: "jó" },
      { kulcs: "nyelvtan", pont: 6, max: 10, megjegyzes: "közepes" }
    ]
  });
  await ref.collection("ertekeles").doc("tanari").delete();
  return ref;
}

const tanariErtekeles = async (ref) => (await ref.collection("ertekeles").doc("tanari").get()).data();

test("jóváhagyás: a tanári értékelés tárolódik és a státusz 'elkuldve' lesz", async () => {
  const ref = await beadasFelvetel({ rubrika: { szempontok: [
    { kulcs: "tartalom", cim: "Tartalom", suly: 10 }, { kulcs: "nyelvtan", cim: "Nyelvtan", suly: 10 }
  ] } });
  const v = await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 4, szoveg: "  Szép munka  " });
  assert.deepEqual(v, { siker: true });

  assert.equal((await ref.get()).data().statusz, "elkuldve");
  const t = await tanariErtekeles(ref);
  assert.equal(t.jegy, 4);
  assert.equal(t.szoveg, "Szép munka");
  assert.equal(t.tanar_id, "tanar-uid");
  assert.equal(t.osszpontszam, 14);
  assert.equal(t.max_pontszam, 20);
  assert.equal(t.szazalek, 70);
  assert.equal(t.szempontok[0].cim, "Tartalom");
  assert.ok(t.jovahagyva_at);
});

test("jóváhagyás: a jegy a feladat skáláján értelmeződik és kanonikus alakban tárolódik", async () => {
  // A–F skála: a "b" nem szerepel (kisbetű), az "B" igen
  const ref = await beadasFelvetel({ rubrika: { skala: { tipus: "fokozat", sablon: "af", fokozatok: [
    { cimke: "F", min: 0 }, { cimke: "C", min: 50 }, { cimke: "B", min: 70 }, { cimke: "A", min: 90 }
  ] } } });
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 4, szoveg: "x" })), "jegy_ertek");
  assert.equal((await ref.get()).data().statusz, "javitva", "hibás jegynél nem változhat a státusz");
  assert.equal((await tanariErtekeles(ref)), undefined, "hibás jegynél nem íródhat értékelés");

  await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: " B ", szoveg: "x" });
  const t = await tanariErtekeles(ref);
  assert.equal(t.jegy, "B");
  assert.equal(t.jegy_tipus, "fokozat");
});

test("jóváhagyás: százalékos skálán 0–100 egész a jegy", async () => {
  const ref = await beadasFelvetel({ rubrika: { skala: { tipus: "szazalek" } } });
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 101, szoveg: "x" })), "jegy_ertek");
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 7.5, szoveg: "x" })), "jegy_ertek");
  await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: "85", szoveg: "x" });
  const t = await tanariErtekeles(ref);
  assert.equal(t.jegy, 85);
  assert.equal(t.jegy_tipus, "szazalek");
});

test("jóváhagyás: jegy nélkül (null) is elküldhető", async () => {
  const ref = await beadasFelvetel();
  await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: null, szoveg: "Csak szöveg" });
  assert.equal((await tanariErtekeles(ref)).jegy, null);
});

test("jóváhagyás: a régi (skála nélküli) feladat magyar 1–5 skálát kap", async () => {
  const ref = await beadasFelvetel({ rubrika: {} });
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 6, szoveg: "x" })), "jegy_ertek");
  await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: "5", szoveg: "x" });
  assert.equal((await tanariErtekeles(ref)).jegy, 5);
});

test("jóváhagyás: a tanár módosíthatja a szempontpontot, de a határt nem léphetheti át", async () => {
  const ref = await beadasFelvetel();
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", {
    beadasId: "b1", szoveg: "x", szempontok: [{ kulcs: "tartalom", pont: 11 }]
  })), "pont_hatar");
  assert.equal((await ref.get()).data().statusz, "javitva");

  await logika.jovahagyasLogika("tanar-uid", {
    beadasId: "b1", szoveg: "x", szempontok: [{ kulcs: "tartalom", pont: 10, megjegyzes: "kiváló" }]
  });
  const t = await tanariErtekeles(ref);
  assert.equal(t.osszpontszam, 16);
  assert.equal(t.szempontok[0].megjegyzes, "kiváló");
});

test("jóváhagyás: üres szöveg, hiányzó azonosító, idegen és rossz státuszú beadás elutasítva", async () => {
  const ref = await beadasFelvetel();
  const h = (adat, uid = "tanar-uid") => kodja(() => logika.jovahagyasLogika(uid, adat));
  assert.equal(await h({ jegy: 4, szoveg: "x" }), "beadas_id_kell");
  assert.equal(await h({ beadasId: "b1", jegy: 4, szoveg: "   " }), "visszajelzes_ures");
  assert.equal(await h({ beadasId: "nincs", jegy: 4, szoveg: "x" }), "beadas_nincs");
  assert.equal(await h({ beadasId: "b1", jegy: 4, szoveg: "x" }, "masik-tanar"), "nem_a_te_beadasod");

  await ref.update({ statusz: "feldolgozas" });
  assert.equal(await h({ beadasId: "b1", jegy: 4, szoveg: "x" }), "statusz_nem_kuldheto");
  assert.equal((await tanariErtekeles(ref)), undefined);
});

test("jóváhagyás: már elküldött beadás újra jóváhagyható (javítás)", async () => {
  const ref = await beadasFelvetel({ statusz: "elkuldve" });
  await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 3, szoveg: "Javítva" });
  assert.equal((await tanariErtekeles(ref)).szoveg, "Javítva");
});

// ══════════════════════════════════════════
// ÖNKISZOLGÁLÓ TANÁRI REGISZTRÁCIÓ
//
// Az Auth-ot egy kis hamis kliens helyettesíti (az emulátor csak a
// Firestore-t indítja); a tesztelt rész a döntési logika: ki kaphat
// tanári szerepet, és mi marad érintetlen.
// ══════════════════════════════════════════

const PROD = { tanariOnregisztracio: true };
const PILOT = { tanariOnregisztracio: false };

function hamisAuth(user) {
  const hivasok = [];
  return {
    hivasok,
    async getUser(uid) {
      if (!user) { const e = new Error("nincs"); e.code = "auth/user-not-found"; throw e; }
      return { uid, ...user };
    },
    async setCustomUserClaims(uid, claimek) { hivasok.push({ uid, claimek }); }
  };
}

async function tanariKerelmesProfil(extra = {}) {
  await firestore.collection("felhasznalok").doc("uj-uid").set({
    nev: "Új Tanár", email: "uj@iskola.hu", szerep: "diak", tanari_kerelem: true, ...extra
  });
}

const tanariReg = (auth, beall = PROD, uid = "uj-uid") =>
  logika.tanariRegisztracioLogika(firestore, auth, uid, beall);

test("tanári regisztráció: megerősített e-mail + tanári kérelem → claim és tükör tanár", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: true, customClaims: {} });

  const r = await tanariReg(auth);
  assert.deepEqual(r, { szerep: "tanar", mar_tanar: false });
  assert.deepEqual(auth.hivasok, [{ uid: "uj-uid", claimek: { szerep: "tanar" } }]);

  const profil = (await firestore.collection("felhasznalok").doc("uj-uid").get()).data();
  assert.equal(profil.szerep, "tanar");
  assert.ok(profil.tanar_regisztralt, "a regisztráció időpontja rögzítve");
  assert.equal(profil.nev, "Új Tanár", "a profil többi mezője érintetlen");
});

test("tanári regisztráció: a pilotban (kikapcsolva) elutasítva, semmi nem változik", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth, PILOT)), "onregisztracio_ki");
  assert.deepEqual(auth.hivasok, []);
  assert.equal((await firestore.collection("felhasznalok").doc("uj-uid").get()).data().szerep, "diak");
});

test("tanári regisztráció: megerősítetlen e-mail → nincs tanári jog", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: false });
  assert.equal(await kodja(() => tanariReg(auth)), "email_nincs_megerositve");
  assert.deepEqual(auth.hivasok, []);
  assert.equal((await firestore.collection("felhasznalok").doc("uj-uid").get()).data().szerep, "diak");
});

test("tanári regisztráció: e-mail-cím nélküli fiók nem lehet tanár", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth)), "email_nincs_megerositve");
});

test("tanári regisztráció: tanári kérelem nélküli (meglévő diák-) fiók nem léptethető elő", async () => {
  // a beforeEach-ben létrehozott diak-uid: kérelem nélküli profil
  const auth = hamisAuth({ email: "diak@iskola.hu", emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth, PROD, "diak-uid")), "tanari_kerelem_hianyzik");
  assert.deepEqual(auth.hivasok, []);
  assert.equal((await firestore.collection("felhasznalok").doc("diak-uid").get()).data().szerep, "diak");
});

test("tanári regisztráció: profil nélküli fiók elutasítva", async () => {
  const auth = hamisAuth({ email: "x@iskola.hu", emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth, PROD, "nincs-profil")), "tanari_kerelem_hianyzik");
});

test("tanári regisztráció: aki már tagja osztálynak (diákként használta), nem lehet tanár", async () => {
  await tanariKerelmesProfil();
  await firestore.collection("felhasznalok").doc("uj-uid")
    .collection("osztalyaim").doc("o1").set({ nev: "9.B", kod: "AAA-BBBB", tanar_id: "t" });
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth)), "mar_diak_hasznalo");
  assert.deepEqual(auth.hivasok, []);
});

test("tanári regisztráció: az admin jelző és az idegen claim megmarad", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: true, customClaims: { admin: true, x: 1 } });
  await tanariReg(auth);
  assert.deepEqual(auth.hivasok[0].claimek, { admin: true, x: 1, szerep: "tanar" });
});

test("tanári regisztráció: ismételt hívás ártalmatlan, és a lemaradt tükröt javítja", async () => {
  await tanariKerelmesProfil(); // a tükör még 'diak', a claim már 'tanar'
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: true, customClaims: { szerep: "tanar" } });
  const r = await tanariReg(auth);
  assert.deepEqual(r, { szerep: "tanar", mar_tanar: true });
  assert.deepEqual(auth.hivasok, [], "a claimet nem írja újra");
  assert.equal((await firestore.collection("felhasznalok").doc("uj-uid").get()).data().szerep, "tanar");
});

test("tanári regisztráció: nem létező Auth-felhasználó → nincs_felhasznalo", async () => {
  assert.equal(await kodja(() => tanariReg(hamisAuth(null))), "nincs_felhasznalo");
});

// ══════════════════════════════════════════
// AI-HASZNÁLAT MÉRÉSE: rögzítés és jelentés
// ══════════════════════════════════════════

const ADAT = (prompt, kimenet, gondolkodas = 0) => ({
  modell: "gemini-3.8-flash", fo_modell: "gemini-3.8-flash", probalkozas: 1,
  hasznalat: { prompt, kimenet, gondolkodas, ossz: prompt + kimenet + gondolkodas },
  parts: [{ text: "x" }, { inline_data: { mime_type: "image/jpeg", data: "AAAA" } }]
});

test("mérés: a hívás rekordot hagy az ai_hasznalat gyűjteményben (tartalom nélkül)", async () => {
  await logika.aiHasznalatNaplo(
    { tanar_id: "tanar-uid", muvelet: "beadas_atiras", mod: "leveles", feladat_id: "f1", beadas_id: "b1" },
    ADAT(1000, 200, 300)
  );
  const snap = await firestore.collection("ai_hasznalat").get();
  assert.equal(snap.size, 1);
  const r = snap.docs[0].data();
  assert.equal(r.tanar_id, "tanar-uid");
  assert.equal(r.muvelet, "beadas_atiras");
  assert.equal(r.prompt, 1000);
  assert.equal(r.gondolkodas, 300);
  assert.equal(r.kep_db, 1);
  assert.ok(r.ido, "szerver-időbélyeg");
  assert.equal(r.kornyezet, "pilot", "a tesztkörnyezetben pilot a KORNYEZET alapértéke");
});

test("mérés: a jelentés a hónap rekordjaiból összesít, a más hónapét kihagyja, a neveket feloldja", async () => {
  await firestore.collection("felhasznalok").doc("tanar-uid").set({ nev: "Tanár Tamás", email: "t@x.hu", szerep: "tanar" });
  await firestore.collection("feladatok").doc("f1").set({ cim: "Levél a barátnak", tanar_id: "tanar-uid" });

  const rogzit = (muvelet, adat, ido, extra = {}) => firestore.collection("ai_hasznalat").add({
    tanar_id: "tanar-uid", muvelet, mod: "leveles", feladat_id: "f1", beadas_id: "b1",
    modell: "gemini-3.8-flash", prompt: adat.prompt, kimenet: adat.kimenet, gondolkodas: adat.gondolkodas || 0,
    ido, ...extra
  });
  await rogzit("beadas_atiras", { prompt: 10000, kimenet: 500 }, new Date("2026-10-03T10:00:00Z"));
  await rogzit("beadas_ertekeles", { prompt: 2000, kimenet: 900, gondolkodas: 2000 }, new Date("2026-10-03T10:00:30Z"));
  await rogzit("beadas_atiras", { prompt: 99999, kimenet: 9999 }, new Date("2026-09-30T23:59:59Z"));   // szeptember
  await rogzit("beadas_atiras", { prompt: 99999, kimenet: 9999 }, new Date("2026-11-01T00:00:00Z"));   // november

  const j = await logika.aiHasznalatJelentesLogika(firestore, "2026-10");
  assert.equal(j.honap, "2026-10");
  assert.equal(j.rekord_db, 2, "csak az októberi rekordok");
  assert.equal(j.csonkolt, false);
  assert.equal(j.beadas.mind.futas_db, 1);
  assert.equal(j.tanar[0].nev, "Tanár Tamás");
  assert.equal(j.feladat[0].cim, "Levél a barátnak");
  const ar = { be: 0.75, ki: 3.75 };
  const vart = (10000 * ar.be + 500 * ar.ki + 2000 * ar.be + (900 + 2000) * ar.ki) / 1e6;
  assert.ok(Math.abs(j.osszes.koltseg_usd - vart) < 1e-9, `${j.osszes.koltseg_usd} != ${vart}`);

  const szept = await logika.aiHasznalatJelentesLogika(firestore, "2026-09");
  assert.equal(szept.rekord_db, 1);
  const ures = await logika.aiHasznalatJelentesLogika(firestore, "2025-01");
  assert.equal(ures.rekord_db, 0);
  assert.equal(ures.osszes.hivas, 0);
});


// ── A beadás hivatkozásainak ellenőrzése (audit 1. kör, 2026-10-06) ──
// A beadást a kliens írja, ezért a szerver nem bízik a tanar_id-ban, a
// feladat osztályában és a képutakban (az Admin SDK nem ismeri a Storage-szabályokat).

const rendes = () => ({
  beadas: {
    diak_id: "diak-uid", osztaly_id: "o1", tanar_id: "tanar-uid", feladat_id: "f1",
    kep_paths: ["beadasok/diak-uid/b1/1_dolgozat.jpg", "beadasok/diak-uid/b1/2_dolgozat.jpg"]
  },
  feladat: { osztaly_id: "o1", tanar_id: "tanar-uid" }
});

test("beadás-összerendelés: a szabályos beadás átmegy", () => {
  const { beadas, feladat } = rendes();
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), null);
});

test("beadás-összerendelés: idegen Storage-útvonal elutasítva (másik diák, tananyag, más beadás)", () => {
  for (const ut of [
    "beadasok/masik-diak/x1/1.jpg",
    "tananyagok/tanar-uid/123_anyag.pdf",
    "feladatlapok/tanar-uid/123_lap.jpg",
    "beadasok/diak-uid/masik-beadas/1.jpg",
    "beadasok/diak-uid/b1/",
    "beadasok/diak-uid/b1/../../masik-diak/x/1.jpg"
  ]) {
    const { beadas, feladat } = rendes();
    beadas.kep_paths = ["beadasok/diak-uid/b1/1.jpg", ut];
    assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "kep_ut_idegen", ut);
  }
});

test("beadás-összerendelés: nem szöveg képút, üres és hiányzó lista elutasítva", () => {
  for (const kep_paths of [[42], [null], [{ a: 1 }], "beadasok/diak-uid/b1/1.jpg", [], undefined]) {
    const { beadas, feladat } = rendes();
    beadas.kep_paths = kep_paths;
    assert.notEqual(logika.beadasOsszerendeles("b1", beadas, feladat), null, JSON.stringify(kep_paths));
  }
});

test("beadás-összerendelés: hamis tanár, másik osztály, hiányzó feladat elutasítva", () => {
  let { beadas, feladat } = rendes();
  beadas.tanar_id = "masik-tanar";
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "tanar_nem_egyezik");
  ({ beadas, feladat } = rendes());
  feladat.osztaly_id = "masik-osztaly";
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "osztaly_nem_egyezik");
  ({ beadas } = rendes());
  assert.equal(logika.beadasOsszerendeles("b1", beadas, undefined), "feladat_nincs");
  // mindkét oldalon hiányzó mező nem számít egyezésnek
  ({ beadas, feladat } = rendes());
  delete beadas.osztaly_id; delete feladat.osztaly_id;
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "osztaly_nem_egyezik");
});

test("jóváhagyás: hamis tanar_id-jú beadást az idegen tanár nem hagyhat jóvá", async () => {
  const ref = await beadasFelvetel();
  // a beadást a kliens hamisította: a feladat másik tanáré
  await firestore.collection("feladatok").doc("f1").update({ tanar_id: "valodi-tanar" });
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 4, szoveg: "x" })), "nem_a_te_beadasod");
  assert.equal((await ref.get()).data().statusz, "javitva");
  assert.equal(await tanariErtekeles(ref), undefined);
});

test("jóváhagyás: másik osztály feladatára hivatkozó beadás elutasítva", async () => {
  await beadasFelvetel();
  await firestore.collection("feladatok").doc("f1").update({ osztaly_id: "masik-osztaly" });
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 4, szoveg: "x" })), "nem_a_te_beadasod");
});


// ── Külső audit 2. kör, A csomag (2026-10-07) ──

const eltelt = (perc) => new Date(Date.now() - perc * 60 * 1000);

async function foglalasHoz(statusz, { perc = 0, futas_id } = {}) {
  const ref = firestore.collection("beadasok").doc("bf1");
  await ref.set({ statusz, frissitve: eltelt(perc), ...(futas_id ? { futas_id } : {}) });
  return ref;
}

test("foglalás: az induló állapotból sikerül, a másodikra már nem (duplikált esemény)", async () => {
  const ref = await foglalasHoz("feltoltve");
  const id = await logika.beadasFoglalas(firestore, ref, { csakFeltoltve: true });
  assert.equal(typeof id, "string");
  const d = (await ref.get()).data();
  assert.equal(d.statusz, "folyamatban");
  assert.equal(d.futas_id, id);
  assert.equal(await logika.beadasFoglalas(firestore, ref, { csakFeltoltve: true }), null);
});

test("foglalás: párhuzamos kísérletből pontosan egy nyer", async () => {
  const ref = await foglalasHoz("feltoltve");
  const eredmenyek = await Promise.all([1, 2, 3, 4].map(() => logika.beadasFoglalas(firestore, ref, {})));
  assert.equal(eredmenyek.filter(Boolean).length, 1);
});

test("foglalás: a trigger csak 'feltoltve'-ből indul; az újrafuttatás hibából és javítottból is", async () => {
  const ref = await foglalasHoz("javitva");
  assert.equal(await logika.beadasFoglalas(firestore, ref, { csakFeltoltve: true }), null);
  assert.ok(await logika.beadasFoglalas(firestore, ref, {}));
  await foglalasHoz("hiba");
  assert.ok(await logika.beadasFoglalas(firestore, ref, {}));
});

test("foglalás: a friss 'folyamatban' védett, a lejárt foglalás újrafoglalható (megszakadt futás)", async () => {
  const ref = await foglalasHoz("folyamatban", { perc: 1, futas_id: "regi" });
  assert.equal(await logika.beadasFoglalas(firestore, ref, {}), null);
  await foglalasHoz("folyamatban", { perc: logika.FOGLALAS_LEJARAT_MS / 60000 + 1, futas_id: "regi" });
  const id = await logika.beadasFoglalas(firestore, ref, {});
  assert.ok(id);
  assert.equal((await ref.get()).data().futas_id, id);
});

test("hibaállapot: az elavult futás hibája nem írja felül az újabbat; a gazdáé igen", async () => {
  const ref = await foglalasHoz("folyamatban", { futas_id: "uj" });
  await logika.hibaraAllit("bf1", new Error("régi futás hibája"), "regi");
  assert.equal((await ref.get()).data().statusz, "folyamatban");
  await logika.hibaraAllit("bf1", new Error("a gazda hibája"), "uj");
  const d = (await ref.get()).data();
  assert.equal(d.statusz, "hiba");
  assert.equal(d.hiba, "a gazda hibája");
});

test("hibaállapot: futásazonosító nélküli (korai) hiba nem írja felül a másik élő futást", async () => {
  const ref = await foglalasHoz("folyamatban", { futas_id: "x" });
  await logika.hibaraAllit("bf1", new Error("korai hiba"));
  assert.equal((await ref.get()).data().statusz, "folyamatban");
  await foglalasHoz("feltoltve");
  await logika.hibaraAllit("bf1", new Error("korai hiba"));
  assert.equal((await ref.get()).data().statusz, "hiba");
});

const RUBRIKA = { szempontok: [
  { kulcs: "tartalom", cim: "Tartalom", suly: 10 },
  { kulcs: "nyelvtan", cim: "Nyelvtan", suly: 5 }
] };

test("szempont-tisztítás: a maximum a rubrikából jön, a pont 0..max közé szorul", () => {
  const r = logika.szempontokTisztitas([
    { kulcs: "tartalom", pont: 999, max: 1, megjegyzes: "x" },
    { kulcs: "nyelvtan", pont: -3, max: 100, megjegyzes: "y" }
  ], RUBRIKA, { hianyHiba: true });
  assert.deepEqual(r.map((x) => [x.kulcs, x.pont, x.max]), [["tartalom", 10, 10], ["nyelvtan", 0, 5]]);
});

test("szempont-tisztítás: nem szám pont/max, ismeretlen és dupla kulcs kezelve", () => {
  const r = logika.szempontokTisztitas([
    { kulcs: "tartalom", pont: "NaN", max: null },
    { kulcs: "tartalom", pont: 10, max: 10 },
    { kulcs: "nyelvtan", pont: Infinity, max: 5 },
    { kulcs: "kitalalt", pont: 50, max: 50 }
  ], RUBRIKA, { hianyHiba: true });
  assert.equal(r.length, 2, "ismeretlen kulcs eldobva, kulcsonként egy tétel");
  assert.deepEqual(r.map((x) => x.pont), [0, 0], "az első tétel számít, a nem véges pont 0");
});

test("szempont-tisztítás: hiányzó szempont – új feldolgozásnál hiba, jóváhagyásnál 0 pont", () => {
  const ai = [{ kulcs: "tartalom", pont: 7, max: 10 }];
  assert.throws(() => logika.szempontokTisztitas(ai, RUBRIKA, { hianyHiba: true }), /nyelvtan/);
  const r = logika.szempontokTisztitas(ai, RUBRIKA);
  assert.deepEqual(r.map((x) => [x.kulcs, x.pont, x.max]), [["tartalom", 7, 10], ["nyelvtan", 0, 5]]);
});

test("szempont-tisztítás: rubrika-szempontok nélkül csak a számokat szorítja", () => {
  const r = logika.szempontokTisztitas([{ kulcs: "a", pont: 99, max: 4 }, { kulcs: "b", pont: "x", max: -2 }], {});
  assert.deepEqual(r.map((x) => [x.pont, x.max]), [[4, 4], [0, 0]]);
  assert.deepEqual(logika.szempontokTisztitas(undefined, {}), []);
});

test("jóváhagyás: az AI túlzó pontjai a mentett adatból sem jutnak át a diáknak", async () => {
  const ref = await beadasFelvetel({ rubrika: RUBRIKA, ai: { szempontok: [
    { kulcs: "tartalom", pont: 999, max: 1, megjegyzes: "" },
    { kulcs: "nyelvtan", pont: 5, max: 5, megjegyzes: "" }
  ] } });
  await logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 5, szoveg: "x" });
  const t = await tanariErtekeles(ref);
  assert.equal(t.osszpontszam, 15);
  assert.equal(t.max_pontszam, 15);
  assert.equal(t.szazalek, 100);
});

test("AI-használat: hibás JSON válasznál is rögzül a tokenadat (egyszer)", async () => {
  const eredeti = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "ez nem json" }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 }
    })
  });
  try {
    await assert.rejects(
      () => logika.geminiHivas("atiras", [], {}, { tanar_id: "t1", muvelet: "beadas_atiras", mod: "leveles" }),
      /nem érvényes JSON/
    );
  } finally {
    globalThis.fetch = eredeti;
  }
  const snap = await firestore.collection("ai_hasznalat").get();
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].data().ossz, 120);
});
