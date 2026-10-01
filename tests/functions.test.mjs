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
  for (const koll of ["osztalyok", "kodok", "felhasznalok"]) {
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
  const ref = await beadasFelvetel({ rubrika: { szempontok: [{ kulcs: "tartalom", cim: "Tartalom" }] } });
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
