// ══════════════════════════════════════════════════════
// Cloud Functions – tranzakciós logika tesztek
//
// A Gemini-hívást NEM teszteli (az külső szolgáltatás); azt a részt
// a séma és a prompt-sablon fedi. Itt a jóváhagyás, a tanári regisztráció,
// a feladatlink és a feldolgozás-foglalás van ellenőrizve, valódi
// Firestore emulátor ellen.
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
  for (const koll of ["felhasznalok", "ai_hasznalat", "feladatok", "linkek", "beadasok"]) {
    const snap = await firestore.collection(koll).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

beforeEach(async () => {
  await torolMindent();
  await firestore.collection("felhasznalok").doc("diak-uid").set({
    nev: "Diák Dóra", email: "diak@iskola.hu", szerep: "nincs"
  });
});

// ══════════════════════════════════════════
// VISSZAJELZÉS JÓVÁHAGYÁSA (visszajelzesJovahagyas)
// A skála betöltése, a jegy ellenőrzése és a tárolás bekötését ellenőrzi
// végponttól végpontig.
// ══════════════════════════════════════════

const kodja = async (fn) => {
  try { await fn(); } catch (e) { return e.details?.kod ?? `?${e.message}`; }
  return null;
};

async function beadasFelvetel({ rubrika, statusz = "javitva", ai } = {}) {
  await firestore.collection("feladatok").doc("f1").set({ tanar_id: "tanar-uid", rubrika: rubrika || {} });
  const ref = firestore.collection("beadasok").doc("b1");
  await ref.set({ tanar_id: "tanar-uid", feladat_id: "f1", statusz });
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
    nev: "Új Tanár", email: "uj@iskola.hu", szerep: "nincs", tanari_kerelem: true, ...extra
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
  assert.equal((await firestore.collection("felhasznalok").doc("uj-uid").get()).data().szerep, "nincs");
});

test("tanári regisztráció: megerősítetlen e-mail → nincs tanári jog", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: false });
  assert.equal(await kodja(() => tanariReg(auth)), "email_nincs_megerositve");
  assert.deepEqual(auth.hivasok, []);
  assert.equal((await firestore.collection("felhasznalok").doc("uj-uid").get()).data().szerep, "nincs");
});

test("tanári regisztráció: e-mail-cím nélküli fiók nem lehet tanár", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth)), "email_nincs_megerositve");
});

test("tanári regisztráció: tanári kérelem nélküli fiók nem léptethető elő", async () => {
  // a beforeEach-ben létrehozott diak-uid: kérelem nélküli profil
  const auth = hamisAuth({ email: "diak@iskola.hu", emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth, PROD, "diak-uid")), "tanari_kerelem_hianyzik");
  assert.deepEqual(auth.hivasok, []);
  assert.equal((await firestore.collection("felhasznalok").doc("diak-uid").get()).data().szerep, "nincs");
});

test("tanári regisztráció: profil nélküli fiók elutasítva", async () => {
  const auth = hamisAuth({ email: "x@iskola.hu", emailVerified: true });
  assert.equal(await kodja(() => tanariReg(auth, PROD, "nincs-profil")), "tanari_kerelem_hianyzik");
});

test("tanári regisztráció: az admin jelző és az idegen claim megmarad", async () => {
  await tanariKerelmesProfil();
  const auth = hamisAuth({ email: "uj@iskola.hu", emailVerified: true, customClaims: { admin: true, x: 1 } });
  await tanariReg(auth);
  assert.deepEqual(auth.hivasok[0].claimek, { admin: true, x: 1, szerep: "tanar" });
});

test("tanári regisztráció: ismételt hívás ártalmatlan, és a lemaradt tükröt javítja", async () => {
  await tanariKerelmesProfil(); // a tükör még 'nincs', a claim már 'tanar'
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
// A beadást a kliens írja, ezért a szerver nem bízik a tanar_id-ban és a feladat osztályában.
// 2026-11-12 óta a beadás mindig beírt szöveg (képút nincs).

const rendes = () => ({
  beadas: {
    tanar_id: "tanar-uid", feladat_id: "f1",
    forras: "szoveg", szoveg: "Dear Ben, thank you for your letter."
  },
  feladat: { tanar_id: "tanar-uid" }
});

test("beadás-összerendelés: a szabályos beadás átmegy", () => {
  const { beadas, feladat } = rendes();
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), null);
});

test("beadás-összerendelés: a fotós (képutas) beadás elutasítva", () => {
  const { beadas, feladat } = rendes();
  delete beadas.forras; delete beadas.szoveg;
  beadas.kep_paths = ["beadasok/diak-uid/b1/1.jpg"];
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "mod_nem_egyezik");
});

test("beadás-összerendelés: hamis tanár és hiányzó feladat elutasítva", () => {
  let { beadas, feladat } = rendes();
  beadas.tanar_id = "masik-tanar";
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "tanar_nem_egyezik");
  ({ beadas } = rendes());
  assert.equal(logika.beadasOsszerendeles("b1", beadas, undefined), "feladat_nincs");
  // mindkét oldalon hiányzó tanár nem számít egyezésnek
  ({ beadas, feladat } = rendes());
  delete beadas.tanar_id; delete feladat.tanar_id;
  assert.equal(logika.beadasOsszerendeles("b1", beadas, feladat), "tanar_nem_egyezik");
});

test("jóváhagyás: hamis tanar_id-jú beadást az idegen tanár nem hagyhat jóvá", async () => {
  const ref = await beadasFelvetel();
  // a beadást a kliens hamisította: a feladat másik tanáré
  await firestore.collection("feladatok").doc("f1").update({ tanar_id: "valodi-tanar" });
  assert.equal(await kodja(() => logika.jovahagyasLogika("tanar-uid", { beadasId: "b1", jegy: 4, szoveg: "x" })), "nem_a_te_beadasod");
  assert.equal((await ref.get()).data().statusz, "javitva");
  assert.equal(await tanariErtekeles(ref), undefined);
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
      () => logika.aiHivas("ertekeles", [], {}, { tanar_id: "t1", muvelet: "beadas_ertekeles", mod: "leveles" }),
      /nem érvényes JSON/
    );
  } finally {
    globalThis.fetch = eredeti;
  }
  const snap = await firestore.collection("ai_hasznalat").get();
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].data().ossz, 120);
});

// ══════════════════════════════════════════
// FELADATLINK (linkInditas / linkLezaras)
// ══════════════════════════════════════════

const linkFeladat = (felul = {}) =>
  firestore.collection("feladatok").doc("lf1").set({ tanar_id: "tanar-uid", cim: "Levél", aktiv: true, rubrika: {}, ...felul });

test("link indítása: a token lenyomata a dokumentum azonosítója, 24 óra, 60-as plafon, nyitva", async () => {
  await linkFeladat();
  const most = Date.UTC(2026, 10, 12, 9, 0, 0);
  const r = await logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" }, { most });
  const { createHash } = await import("node:crypto");
  assert.match(r.token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(r.linkId, createHash("sha256").update(r.token).digest("hex"));
  const d = (await firestore.collection("linkek").doc(r.linkId).get()).data();
  assert.equal(d.feladat_id, "lf1");
  assert.equal(d.tanar_id, "tanar-uid");
  assert.equal(d.token, r.token);
  assert.equal(d.lezarva, false);
  assert.equal(d.beadas_db, 0);
  assert.equal(d.beadas_max, 60);
  assert.equal(d.lejar.toMillis() - most, 24 * 3600 * 1000);
  assert.ok(d.letrehozva, "szerver-időbélyeg");
});

test("link indítása: idegen, nem létező és lezárt feladatra elutasítva, semmi nem jön létre", async () => {
  await linkFeladat();
  assert.equal(await kodja(() => logika.linkInditasLogika(firestore, "masik-tanar", { feladatId: "lf1" })), "nem_a_te_feladatod");
  assert.equal(await kodja(() => logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "nincs" })), "feladat_nincs");
  assert.equal(await kodja(() => logika.linkInditasLogika(firestore, "tanar-uid", {})), "feladat_id_kell");
  assert.equal(await kodja(() => logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: 42 })), "feladat_id_kell");
  await linkFeladat({ aktiv: false });
  assert.equal(await kodja(() => logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" })), "feladat_zart");
  assert.equal((await firestore.collection("linkek").get()).size, 0);
});

test("link indítása: egy feladathoz több link is indítható (pl. két csoport)", async () => {
  await linkFeladat();
  const a = await logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" });
  const b = await logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" });
  assert.notEqual(a.linkId, b.linkId);
  assert.equal((await firestore.collection("linkek").where("feladat_id", "==", "lf1").get()).size, 2);
});

test("link indítása: tokenütközésnél nem ír felül meglévő linket", async () => {
  await linkFeladat();
  const fix = () => "a".repeat(32);
  await logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" }, { tokenFn: fix });
  await assert.rejects(() => logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" }, { tokenFn: fix }));
  assert.equal((await firestore.collection("linkek").get()).size, 1);
});

test("link lezárása: a tulajdonos lezárhatja (ismételten is), idegen és rossz azonosító nem", async () => {
  await linkFeladat();
  const { linkId } = await logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "lf1" });
  assert.equal(await kodja(() => logika.linkLezarasLogika(firestore, "masik-tanar", { linkId })), "nem_a_te_linked");
  assert.equal((await firestore.collection("linkek").doc(linkId).get()).data().lezarva, false);
  assert.deepEqual(await logika.linkLezarasLogika(firestore, "tanar-uid", { linkId }), { lezarva: true });
  const d = (await firestore.collection("linkek").doc(linkId).get()).data();
  assert.equal(d.lezarva, true);
  assert.ok(d.lezarva_at);
  assert.deepEqual(await logika.linkLezarasLogika(firestore, "tanar-uid", { linkId }), { lezarva: true });
  assert.equal(await kodja(() => logika.linkLezarasLogika(firestore, "tanar-uid", { linkId: "f".repeat(64) })), "link_nincs");
  for (const rossz of [undefined, "", "x", "../" + "a".repeat(61), 42]) {
    assert.equal(await kodja(() => logika.linkLezarasLogika(firestore, "tanar-uid", { linkId: rossz })), "link_id_kell", String(rossz));
  }
});

// ══════════════════════════════════════════
// A DIÁK A FELADATLINKEN (linkAdatok / linkBeadas) – belépés nélkül
// ══════════════════════════════════════════

const JELZES_OK = { elhagyas_db: 1, elhagyas_mp: 5, beillesztes_db: 0, beillesztett_karakter: 0, beillesztett_tartomanyok: [] };

async function diakLink(feladatFelul = {}, { most = Date.now() } = {}) {
  await firestore.collection("feladatok").doc("df1").set({
    tanar_id: "tanar-uid", cim: "Letter to Ben", aktiv: true,
    rubrika: { nyelv: "angol", feladat_leiras: "Write a letter.", min_szo: 120, max_szo: 180, egyeb_utasitas: "TITKOS",
      szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvtan", suly: 10 }] },
    ...feladatFelul
  });
  return logika.linkInditasLogika(firestore, "tanar-uid", { feladatId: "df1" }, { most });
}
const beadas = (token, felul = {}) => logika.linkBeadasLogika(firestore, {
  token, becenev: "Kék Sárkány", szoveg: "Dear Ben,\r\nthank you for your letter.", jelzesek: JELZES_OK, ...felul
});

test("diák: a linkAdatok a feladat diáknak szóló részét adja, a tanár belső mezőit nem", async () => {
  const { token } = await diakLink();
  const r = await logika.linkAdatokLogika(firestore, { token });
  assert.equal(r.allapot, "aktiv");
  assert.equal(r.cim, "Letter to Ben");
  assert.equal(r.feladat.leiras, "Write a letter.");
  assert.equal(r.feladat.min_szo, 120);
  assert.deepEqual(r.feladat.szempontok, [{ cim: "Nyelvtan", suly: 10 }]);
  assert.ok(!JSON.stringify(r).includes("TITKOS"), "a tanár külön kérése az AI-nak nem megy ki");
  assert.ok(!JSON.stringify(r).includes("tanar-uid"), "a tanár azonosítója nem megy ki");
});

test("diák: lejárt, lezárt link és lezárt feladat – csak az állapot és a cím megy ki", async () => {
  const most = Date.now();
  const regi = await diakLink({}, { most: most - 25 * 3600 * 1000 });
  assert.deepEqual(await logika.linkAdatokLogika(firestore, { token: regi.token }), { allapot: "lejart", cim: "Letter to Ben" });
  const { token, linkId } = await diakLink();
  await logika.linkLezarasLogika(firestore, "tanar-uid", { linkId });
  assert.equal((await logika.linkAdatokLogika(firestore, { token })).allapot, "lezarva");
  const harmadik = await diakLink();
  await firestore.collection("feladatok").doc("df1").update({ aktiv: false });
  assert.equal((await logika.linkAdatokLogika(firestore, { token: harmadik.token })).allapot, "lezarva");
});

test("diák: ismeretlen token ugyanazt a hibát adja, mint a rossz alakú", async () => {
  assert.equal(await kodja(() => logika.linkAdatokLogika(firestore, { token: "a".repeat(32) })), "link_ervenytelen");
  assert.equal(await kodja(() => logika.linkAdatokLogika(firestore, { token: "rossz" })), "link_ervenytelen");
});

test("diák: a beadás létrejön (azonosító = a diák tokenjének lenyomata), nő a számláló, NEM indul AI", async () => {
  const { token, linkId } = await diakLink();
  const eredeti = globalThis.fetch;
  let aiHivas = 0;
  globalThis.fetch = async () => { aiHivas++; throw new Error("nem szabad AI-t hívni"); };
  try {
    const r = await beadas(token);
    const { createHash } = await import("node:crypto");
    assert.match(r.diakToken, /^[A-Za-z0-9_-]{32}$/);
    const id = createHash("sha256").update(r.diakToken).digest("hex");
    const b = (await firestore.collection("beadasok").doc(id).get()).data();
    assert.equal(b.feladat_id, "df1");
    assert.equal(b.tanar_id, "tanar-uid");
    assert.equal(b.link_id, linkId);
    assert.equal(b.becenev, "Kék Sárkány");
    assert.equal(b.szoveg, "Dear Ben,\nthank you for your letter.", "a sorvégek egységesítve");
    assert.equal(b.statusz, "feltoltve");
    assert.deepEqual(b.jelzesek, JELZES_OK);
    assert.ok(b.diaklink_lejar && b.letrehozva);
    assert.equal((await firestore.collection("linkek").doc(linkId).get()).data().beadas_db, 1);
    assert.equal(aiHivas, 0);
    assert.equal((await firestore.collection("ai_hasznalat").get()).size, 0);
  } finally {
    globalThis.fetch = eredeti;
  }
});

test("diák: a becenév linkenként egyedi (kis/nagybetű, ékezet, szóköz nem számít); másik linken szabad", async () => {
  const elso = await diakLink();
  await beadas(elso.token);
  for (const nev of ["kék sárkány", "KEK-SARKANY", " Kék  Sárkány "]) {
    assert.equal(await kodja(() => beadas(elso.token, { becenev: nev })), "becenev_foglalt", nev);
  }
  await beadas(elso.token, { becenev: "Kék Sárkány 2" });
  const masodik = await diakLink();
  await beadas(masodik.token);
  assert.equal((await firestore.collection("linkek").doc(elso.linkId).get()).data().beadas_db, 2);
});

test("diák: lejárt, lezárt, betelt link és lezárt feladat – nincs beadás, a számláló nem nő", async () => {
  const most = Date.now();
  const regi = await diakLink({}, { most: most - 25 * 3600 * 1000 });
  assert.equal(await kodja(() => beadas(regi.token)), "link_lejart");
  const lezart = await diakLink();
  await logika.linkLezarasLogika(firestore, "tanar-uid", { linkId: lezart.linkId });
  assert.equal(await kodja(() => beadas(lezart.token)), "link_lezarva");
  const tele = await diakLink();
  await firestore.collection("linkek").doc(tele.linkId).update({ beadas_db: 60 });
  assert.equal(await kodja(() => beadas(tele.token)), "link_betelt");
  const zartFeladat = await diakLink();
  await firestore.collection("feladatok").doc("df1").update({ aktiv: false });
  assert.equal(await kodja(() => beadas(zartFeladat.token)), "link_lezarva");
  assert.equal((await firestore.collection("beadasok").get()).size, 0);
});

test("diák: hibás bemenet adatbázis-írás előtt elutasítva", async () => {
  const { token } = await diakLink();
  assert.equal(await kodja(() => beadas("rossz")), "link_ervenytelen");
  assert.equal(await kodja(() => beadas(token, { becenev: "x" })), "becenev_ervenytelen");
  assert.equal(await kodja(() => beadas(token, { becenev: "a".repeat(31) })), "becenev_ervenytelen");
  assert.equal(await kodja(() => beadas(token, { szoveg: "   " })), "szoveg_ervenytelen");
  assert.equal(await kodja(() => beadas(token, { szoveg: "a".repeat(20001) })), "szoveg_ervenytelen");
  assert.equal(await kodja(() => beadas(token, { jelzesek: { ...JELZES_OK, extra: 1 } })), "jelzesek_ervenytelen");
  assert.equal(await kodja(() => beadas(token, { jelzesek: undefined })), "jelzesek_ervenytelen");
  assert.equal((await firestore.collection("beadasok").get()).size, 0);
});

test("diák: a beadás után a tanár „Értékelés indítása” gombja (beadasUjrafuttatas) feldolgozhatja – az összerendelés rendben", async () => {
  const { token } = await diakLink();
  const r = await beadas(token);
  const { createHash } = await import("node:crypto");
  const id = createHash("sha256").update(r.diakToken).digest("hex");
  const b = (await firestore.collection("beadasok").doc(id).get()).data();
  const f = (await firestore.collection("feladatok").doc("df1").get()).data();
  assert.equal(logika.beadasOsszerendeles(id, b, f), null);
});
