// ══════════════════════════════════════════════════════
// Beírt (szöveges) beadás – a feldolgozás végigfutása, Firestore-emulátor ellen
//
// Amit védünk: a beírt szöveg NEM megy át az átíráson (nincs kép, nincs átíró AI-hívás),
// az értékelés pedig a diák szövegéből készül, és a beadás kijavított lesz.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
// Más projekt-azonosító, mint a többi emulátoros tesztben (azok törlik az adatot).
process.env.GCLOUD_PROJECT = "wr-beirt-adatbazis-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let firestore, logika, eredetiFetch;

before(() => {
  logika = require("./index.js")._teszt;
  firestore = require("firebase-admin/firestore").getFirestore();
});

after(async () => { await firestore?.terminate(); });

beforeEach(async () => {
  eredetiFetch = globalThis.fetch;
  // az AI-használat napló is: különben az előző teszt rekordja átszivárog a mérés-ellenőrzésbe
  const naplo = await firestore.collection("ai_hasznalat").get();
  await Promise.all(naplo.docs.map((d) => d.ref.delete()));
  for (const koll of ["beadasok", "feladatok"]) {
    const snap = await firestore.collection(koll).get();
    for (const d of snap.docs) {
      const al = await d.ref.collection("ertekeles").get();
      await Promise.all(al.docs.map((x) => x.ref.delete()));
      await d.ref.delete();
    }
  }
});
afterEach(() => { globalThis.fetch = eredetiFetch; });

const SZOVEG = "Dear Ben, I think your plan is great. I hope you will be a good teacher.";

/** Gemini-válasz, és a kérések naplója (mit hívott a rendszer). */
function geminiStub(kerek) {
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    kerek.push({ modell: /models\/([^:]+):/.exec(String(url))?.[1], parts: body.contents[0].parts });
    return {
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          szempontok: [{ kulcs: "nyelvtan", pont: 7, max: 10, megjegyzes: "Jó." }],
          hibak: [], erossegek: ["Világos szerkezet"], fejlesztendo: [], diak_szoveg: "Szép munka!"
        }) }] } }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100, thoughtsTokenCount: 200, totalTokenCount: 800 }
      })
    };
  };
}

async function beadasLetrehoz(beadas, rubrikaFelul = {}) {
  await firestore.collection("feladatok").doc("f1").set({
    tanar_id: "t1", osztaly_id: "o1", cim: "Levél Bennek", aktiv: true,
    rubrika: { nyelv: "angol", tipus: "levél", szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvtan", suly: 10 }], ...rubrikaFelul }
  });
  await firestore.collection("beadasok").doc("b1").set({
    feladat_id: "f1", osztaly_id: "o1", diak_id: "d1", tanar_id: "t1",
    statusz: "feltoltve", hiba: null, frissitve: new Date(), ...beadas
  });
}

test("beírt beadás: egyetlen AI-hívás (az értékelés), kép nélkül, és a beadás kijavított lesz", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: `  ${SZOVEG}  ` });
  const kerek = [];
  geminiStub(kerek);

  const r = await logika.feldolgozBeadas("b1");
  assert.equal(r.osszpontszam, 7);

  assert.equal(kerek.length, 1, "pontosan egy AI-hívás (az értékelés) – átírás nincs");
  assert.ok(!kerek[0].parts.some((p) => p.inline_data), "nem megy kép a kérésben");
  assert.match(kerek[0].parts[0].text, /a diák beírta/);
  assert.ok(kerek[0].parts[0].text.includes(SZOVEG), "az értékelés a diák szövegéből készül");

  const b = (await firestore.collection("beadasok").doc("b1").get()).data();
  assert.equal(b.statusz, "javitva");
  assert.equal(b.atirat, undefined, "átirat nincs: a beírt szöveg maga az értékelendő szöveg");
  const ai = (await firestore.collection("beadasok").doc("b1").collection("ertekeles").doc("ai").get()).data();
  assert.equal(ai.osszpontszam, 7);
  assert.equal(ai.atirat_model, undefined);
});

test("a mérésben csak az értékelés szerepel", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG });
  geminiStub([]);
  await logika.feldolgozBeadas("b1");
  const muveletek = (await firestore.collection("ai_hasznalat").get()).docs.map((d) => d.data().muvelet);
  assert.deepEqual(muveletek, ["beadas_ertekeles"]);
});

test("fotós (képutas) beadás: nem fut AI-hívás, a feldolgozás elutasítja (összerendelési hiba)", async () => {
  await beadasLetrehoz({ kep_paths: ["beadasok/d1/b1/1.jpg"] });
  const kerek = [];
  geminiStub(kerek);
  await assert.rejects(() => logika.feldolgozBeadas("b1"), /nem egyeznek/);
  assert.equal(kerek.length, 0, "érvénytelen beadásra nincs AI-hívás");
});

// ── 6. lépés: a tanár indítja az értékelést (sorba állítás + háttérfeldolgozás) ──

test("sorba állítás: a tanár beadottjai sorba kerülnek, az idegen és a már javított nem", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG });
  await firestore.collection("beadasok").doc("b2").set({ feladat_id: "f1", tanar_id: "t1", forras: "szoveg", szoveg: SZOVEG, statusz: "javitva" });
  await firestore.collection("beadasok").doc("b3").set({ feladat_id: "f1", tanar_id: "mas-tanar", forras: "szoveg", szoveg: SZOVEG, statusz: "feltoltve" });
  const kerek = [];
  geminiStub(kerek);
  const r = await logika.ertekelesInditasLogika(firestore, "t1", { feladatId: "f1" });
  assert.deepEqual(r, { inditva: 1, kimaradt: 0, kimaradt_ok: null });
  assert.equal(kerek.length, 0, "a sorba állítás maga nem hív AI-t");
  const b1 = (await firestore.collection("beadasok").doc("b1").get()).data();
  assert.equal(b1.statusz, "sorban");
  assert.ok(b1.sorba_allitva);
  assert.equal((await firestore.collection("beadasok").doc("b2").get()).data().statusz, "javitva");
  assert.equal((await firestore.collection("beadasok").doc("b3").get()).data().statusz, "feltoltve");
  // a kijelölt idegen beadás sem kerül sorba
  const idegen = await logika.ertekelesInditasLogika(firestore, "t1", { beadasIds: ["b3"] });
  assert.equal(idegen.inditva, 0);
});

test("sorba állítás: a hibás kijelölés-lista elutasítva", async () => {
  for (const beadasIds of [[], "b1", [42], Array(101).fill("b"), ["../x"]]) {
    await assert.rejects(() => logika.ertekelesInditasLogika(firestore, "t1", { beadasIds }),
      (e) => e.details?.kod === "ertekeles_lista_hibas", JSON.stringify(beadasIds).slice(0, 30));
  }
});

test("sor feldolgozása: a sorban lévő beadás egy értékeléssel javított lesz; a nem sorban lévőhöz nem nyúl", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG });
  const kerek = [];
  geminiStub(kerek);
  // nincs sorban: kihagyja, AI nélkül
  const kihagy = await logika.sorFeldolgozas("b1");
  assert.deepEqual(kihagy, { kihagyva: true });
  assert.equal(kerek.length, 0);
  await logika.ertekelesInditasLogika(firestore, "t1", { beadasIds: ["b1"] });
  const r = await logika.sorFeldolgozas("b1");
  assert.equal(r.osszpontszam, 7);
  assert.equal(kerek.length, 1);
  assert.equal((await firestore.collection("beadasok").doc("b1").get()).data().statusz, "javitva");
});

test("sor feldolgozása: elfogyott keretnél a beadás visszakerül a beadottak közé, nem hibára", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG });
  await logika.ertekelesInditasLogika(firestore, "t1", { beadasIds: ["b1"] });
  // a keret közben elfogyott (ingyenes csomag: 20 egység)
  await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("osszes").set({ egyseg: 20 });
  const kerek = [];
  geminiStub(kerek);
  const eredeti = logika.BEALLITASOK.kvota;
  logika.BEALLITASOK.kvota = true;
  try {
    const r = await logika.sorFeldolgozas("b1");
    assert.deepEqual(r, { kvota: true });
  } finally {
    logika.BEALLITASOK.kvota = eredeti;
    await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("osszes").delete();
  }
  assert.equal(kerek.length, 0);
  const b = (await firestore.collection("beadasok").doc("b1").get()).data();
  assert.equal(b.statusz, "feltoltve");
  assert.equal(b.hiba_kod, "kvota_elfogyott_egyszeri");
});

test("sorba állítás a maradék keretig: ami nem fér bele, beadott marad, és a válasz jelzi", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG });
  await firestore.collection("beadasok").doc("b2").set({ feladat_id: "f1", tanar_id: "t1", forras: "szoveg", szoveg: SZOVEG, statusz: "feltoltve" });
  await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("osszes").set({ egyseg: 19 });
  const eredeti = logika.BEALLITASOK.kvota;
  logika.BEALLITASOK.kvota = true;
  try {
    const r = await logika.ertekelesInditasLogika(firestore, "t1", { feladatId: "f1" });
    assert.deepEqual(r, { inditva: 1, kimaradt: 1, kimaradt_ok: "kvota" });
  } finally {
    logika.BEALLITASOK.kvota = eredeti;
    await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("osszes").delete();
  }
  const allapotok = (await firestore.collection("beadasok").get()).docs.map((d) => d.data().statusz).sort();
  assert.deepEqual(allapotok, ["feltoltve", "sorban"]);
});
