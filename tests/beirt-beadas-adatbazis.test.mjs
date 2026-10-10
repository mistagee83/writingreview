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

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
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
    statusz: "feltoltve", atirat: null, hiba: null, frissitve: new Date(), ...beadas
  });
}

test("beírt beadás: nincs átíró AI-hívás és nincs képletöltés, csak az értékelés fut, és a beadás kijavított lesz", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: `  ${SZOVEG}  `, kep_paths: [] }, { beadasi_mod: "szoveg" });
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
  assert.equal(b.atirat, SZOVEG, "az átirat a (levágott) beírt szöveg");
  assert.equal(b.atirat_model, null);
  assert.equal(b.atirat_olvashatosag, null);
  const ai = (await firestore.collection("beadasok").doc("b1").collection("ertekeles").doc("ai").get()).data();
  assert.equal(ai.osszpontszam, 7);
  assert.equal(ai.atirat_model, null);
});

test("a mérésben csak az értékelés szerepel (az átírás nem fogyaszt tokent)", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG, kep_paths: [] }, { beadasi_mod: "szoveg" });
  geminiStub([]);
  await logika.feldolgozBeadas("b1");
  const muveletek = (await firestore.collection("ai_hasznalat").get()).docs.map((d) => d.data().muvelet);
  assert.deepEqual(muveletek, ["beadas_ertekeles"]);
});

test("beírt beadás fotós feladatnál: nem fut AI-hívás, a beadás hibaállapotba kerülhet (összerendelési hiba)", async () => {
  await beadasLetrehoz({ forras: "szoveg", szoveg: SZOVEG, kep_paths: [] });   // nincs beadasi_mod → fotó
  const kerek = [];
  geminiStub(kerek);
  await assert.rejects(() => logika.feldolgozBeadas("b1"), /nem egyeznek/);
  assert.equal(kerek.length, 0, "érvénytelen beadásra nincs AI-hívás");
});
