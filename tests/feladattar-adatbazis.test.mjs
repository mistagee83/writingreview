// ══════════════════════════════════════════════════════
// Érettségi feladattár – a zár és a tárból készült feladat a teljes úton, Firestore-emulátor ellen
// (terv: docs/erettsegi-feladattar-terv.md 2., 8. 3.)
//
// Amit védünk: Hub pass nélkül (és a prodban, amíg a tár ki van kapcsolva) semmi tartalom nem jön vissza;
// a szerver a tanár saját feladatát hozza létre az érettségi sablonnal; a feladat ugyanúgy megy végig a
// linken, mint egy kézzel készült (a diák a feladatot és a szempontokat látja, az MI-kérés nem megy ki),
// és az értékelő prompt az érettségi sávleírásokat kapja.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
// Más projekt-azonosító, mint a többi emulátoros tesztben (azok törlik az adatot).
process.env.GCLOUD_PROJECT = "wr-feladattar-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let firestore, logika;

before(() => {
  logika = require("./index.js")._teszt;
  firestore = require("firebase-admin/firestore").getFirestore();
});

after(async () => { await firestore?.terminate(); });

beforeEach(async () => {
  for (const koll of ["users", "feladatok", "linkek", "beadasok"]) {
    const snap = await firestore.collection(koll).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await firestore.collection("users").doc("hub").set({ entitlements: { all: { status: "active", tier: "hub" } } });
  await firestore.collection("users").doc("wr").set({ entitlements: { "writing-review": { status: "active" } } });
  await firestore.collection("users").doc("lejart").set({ entitlements: { all: { status: "canceled" } } });
});

// prod, bekapcsolt tárral · prod, kikapcsolt tárral (a kapcsoló hatása) · pilot (nincs kredit, nincs zár)
const PROD = { kredit: true, erettsegiTar: true };
const PROD_KI = { kredit: true, erettsegiTar: false };
const PILOT = { kredit: false, erettsegiTar: true };
const ID = "2024-maj-kozep-W2";

const kodja = async (fn) => {
  try { await fn(); } catch (e) { return e.details?.kod ?? `?${e.message}`; }
  return null;
};

test("a zár: Hub pass nélkül, lejárt passszal és kikapcsolt tárnál semmi sem jön vissza", async () => {
  const hivasok = {
    lista: (uid, b) => logika.feladattarListaLogika(firestore, uid, b),
    elonezet: (uid, b) => logika.feladattarElonezetLogika(firestore, uid, { id: ID }, b),
    keszites: (uid, b) => logika.feladattarbolFeladatLogika(firestore, uid, { id: ID }, b),
    sablonok: (uid, b) => logika.erettsegiSablonokLogika(firestore, uid, {}, b)
  };
  for (const [nev, h] of Object.entries(hivasok)) {
    assert.equal(await kodja(() => h("nincs-ilyen", PROD)), "erettsegi_hub_pass_kell", nev);
    assert.equal(await kodja(() => h("lejart", PROD)), "erettsegi_hub_pass_kell", nev);
    assert.equal(await kodja(() => h("hub", PROD_KI)), "erettsegi_tar_ki", `${nev}: a kapcsoló a Hub pass előtt`);
    assert.equal(await kodja(() => h("hub", PROD)), null, nev);
    assert.equal(await kodja(() => h("wr", PROD)), null, `${nev}: a WR saját kulcsa is nyit`);
    assert.equal(await kodja(() => h("nincs-ilyen", PILOT)), null, `${nev}: a pilotban nincs zár`);
  }
  // zárt hívás nem hoz létre feladatot
  await kodja(() => hivasok.keszites("lejart", PROD));
  assert.equal((await firestore.collection("feladatok").where("tanar_id", "==", "lejart").get()).size, 0);
});

test("ismeretlen tárbeli feladat: not-found, és nem jön létre semmi", async () => {
  for (const id of [undefined, "2099-maj-kozep-W1", "../sablonok", 7]) {
    assert.equal(await kodja(() => logika.feladattarElonezetLogika(firestore, "hub", { id }, PROD)), "tar_feladat_nincs");
    assert.equal(await kodja(() => logika.feladattarbolFeladatLogika(firestore, "hub", { id }, PROD)), "tar_feladat_nincs");
  }
  assert.equal((await firestore.collection("feladatok").get()).size, 0);
});

test("a feladat elkészítése: a tanár saját, nyitott feladata az érettségi sablonnal; a lista jelzi, hogy elkészült", async () => {
  const { feladatId } = await logika.feladattarbolFeladatLogika(firestore, "hub", { id: ID, kimenetiNyelv: "en" }, PROD);
  const f = (await firestore.collection("feladatok").doc(feladatId).get()).data();
  assert.equal(f.tanar_id, "hub");
  assert.equal(f.cim, "Email to Pavel about his girlfriend's blue hair");
  assert.equal(f.aktiv, true);
  assert.equal(f.hatarido, null);
  assert.ok(f.letrehozva);
  assert.deepEqual(f.rubrika.tar, { id: ID, verzio: 1 });
  assert.equal(f.rubrika.kimeneti_nyelv, "en");
  // angol felületről készült feladat: angol szempontnevek (a diák is ezt látja a linken)
  assert.equal(f.rubrika.szempontok[0].cim, "Task achievement, covering the given points");
  assert.deepEqual(f.rubrika.szempontok.map((sz) => [sz.kulcs, sz.suly]),
    [["feladat", 6], ["hangnem", 2], ["szovegalkotas", 4], ["szokincs", 5], ["nyelvhelyesseg", 5]]);
  // a kliens csak az engedett mezőket írhatja (firestore.rules feladatok create): a szerver se tegyen mást rá
  assert.deepEqual(Object.keys(f).sort(), ["aktiv", "cim", "hatarido", "letrehozva", "rubrika", "tanar_id"]);

  // a lista a tanár elkészített feladatait jelzi – a másik tanárét nem
  await firestore.collection("feladatok").add({ tanar_id: "wr", cim: "x", rubrika: { tar: { id: "2023-okt-emelt-W1", verzio: 1 } } });
  const lista = await logika.feladattarListaLogika(firestore, "hub", PROD);
  assert.equal(lista.feladatok.length, 176);
  assert.deepEqual(lista.elkeszitett, [ID]);
  // kétszer is elkészíthető (a felület rákérdez), a jelzés egyszer szerepel
  await logika.feladattarbolFeladatLogika(firestore, "hub", { id: ID }, PROD);
  assert.deepEqual((await logika.feladattarListaLogika(firestore, "hub", PROD)).elkeszitett, [ID]);
});

test("a tárból készült feladat a teljes úton: link, a diák nézete, beadás, értékelő prompt", async () => {
  const { feladatId } = await logika.feladattarbolFeladatLogika(firestore, "hub", { id: ID }, PROD);
  const { token } = await logika.linkInditasLogika(firestore, "hub", { feladatId });

  const nezet = await logika.linkAdatokLogika(firestore, { token });
  assert.equal(nezet.allapot, "aktiv");
  assert.equal(nezet.cim, "Email to Pavel about his girlfriend's blue hair");
  assert.ok(nezet.feladat.leiras.includes("• of his mother’s opinion,"));
  assert.equal(nezet.feladat.min_szo, 100);
  assert.equal(nezet.feladat.max_szo, 120);
  assert.equal(nezet.feladat.szempontok.reduce((a, sz) => a + sz.suly, 0), 22);
  const s = JSON.stringify(nezet);
  assert.ok(!s.includes("javítási-értékelési útmutató"), "az MI-nek szóló sávleírás nem megy ki a diáknak");
  assert.ok(!s.includes('"tar"'), "az eredetjelző sem");

  const JELZES_OK = { elhagyas_db: 0, elhagyas_mp: 0, beillesztes_db: 0, beillesztett_karakter: 0, beillesztett_tartomanyok: [],
    beillesztes_kiserlet_db: 0, nagy_betoldas_db: 0, irasi_mp: 120, osszes_mp: 300, esemenyek: [] };
  const eredeti = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("a beadás nem hívhat MI-t"); };
  try {
    await logika.linkBeadasLogika(firestore, { token, becenev: "Kék Sárkány", szoveg: "Hi Pavel, I think dyed hair is fine.", jelzesek: JELZES_OK });
  } finally {
    globalThis.fetch = eredeti;
  }
  const beadasok = await firestore.collection("beadasok").where("feladat_id", "==", feladatId).get();
  assert.equal(beadasok.size, 1);

  const feladat = (await firestore.collection("feladatok").doc(feladatId).get()).data();
  const prompt = logika.ertekelesPrompt(feladat, "Hi Pavel, I think dyed hair is fine.");
  assert.ok(prompt.includes("középszintű angol érettségi"), "a sávleírás az MI-hez kerül");
  assert.ok(prompt.includes("You received the following email from your 18-year-old Polish friend"), "a feladat leírása is");
});

test("az érettségi sablonok: a négy sablon a sablonlistához, a hivatalos pontokkal", async () => {
  const { sablonok } = await logika.erettsegiSablonokLogika(firestore, "hub", {}, PROD);
  // angol felületen angol szempontnevek
  const en = await logika.erettsegiSablonokLogika(firestore, "hub", { nyelv: "en" }, PROD);
  assert.equal(en.sablonok[0].rubrika.szempontok[0].cim, "Task achievement and text length");
  assert.equal(sablonok[0].rubrika.szempontok[0].cim, "A feladat teljesítése és a szöveg hosszúsága");
  assert.deepEqual(sablonok.map((s) => [s.id, s.rubrika.szempontok.reduce((a, sz) => a + sz.suly, 0)]),
    [["kozep-level", 11], ["kozep-fogalmazas", 22], ["emelt-level", 15], ["emelt-fogalmazas", 15]]);
});
