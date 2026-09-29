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
