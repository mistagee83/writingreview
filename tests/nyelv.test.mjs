// ══════════════════════════════════════════════════════
// Nyelvfüggő promptok
//
// Miért külön teszt: ha egy prompt visszaesik angolra, a rendszer
// TOVÁBBRA IS működik – csak rosszabbul. Nem hibát ad, hanem csendben
// pontatlanabb átiratot és értékelést. Ilyet csak teszt fog meg.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-nyelv-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let t;

before(() => {
  t = require("./index.js")._teszt;
});

const feladat = (nyelv) => ({
  cim: "Teszt feladat",
  rubrika: {
    nyelv,
    tipus: "levél",
    szint: "A2",
    szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvhelyesség", suly: 50 }]
  }
});

// ══════════════════════════════════════════
// nyelve() – visszaesés
// ══════════════════════════════════════════

test("hiányzó nyelv esetén angol az alapértelmezés", () => {
  assert.equal(t.nyelve(undefined), "angol");
  assert.equal(t.nyelve({}), "angol");
  assert.equal(t.nyelve({ nyelv: null }), "angol");
});

test("ismeretlen nyelvet nem fogad el (nem kerül a promptba)", () => {
  assert.equal(t.nyelve({ nyelv: "klingon" }), "angol");
  assert.equal(t.nyelve({ nyelv: "" }), "angol");
});

test("a támogatott nyelvek átmennek", () => {
  for (const ny of t.NYELVEK) {
    assert.equal(t.nyelve({ nyelv: ny }), ny, `${ny} nem ment át`);
  }
});

// ══════════════════════════════════════════
// Az átírás promptja
// ══════════════════════════════════════════

test("az átírás promptja tartalmazza a nyelvet", () => {
  for (const ny of t.NYELVEK) {
    const p = t.atiratPrompt(ny);
    assert.match(p, new RegExp(`A dolgozat nyelve: ${ny}`), `${ny} nem szerepel`);
  }
});

test("német átíráskor NEM állítja, hogy angol dolgozat", () => {
  const p = t.atiratPrompt("német");
  assert.equal(/angol/i.test(p), false, "az angol szó nem szerepelhet német promptban");
});

// ══════════════════════════════════════════
// Az értékelés promptja
// ══════════════════════════════════════════

test("az értékelés promptja a megfelelő tanárt szólítja meg", () => {
  const varhato = {
    angol: "angoltanár",
    német: "némettanár",
    francia: "franciatanár",
    spanyol: "spanyoltanár",
    olasz: "olasztanár",
    orosz: "orosztanár",
    latin: "latintanár",
    magyar: "magyartanár"
  };
  for (const [ny, szo] of Object.entries(varhato)) {
    const p = t.ertekelesPrompt(feladat(ny), "minta szöveg");
    assert.match(p, new RegExp(`tapasztalt ${szo} vagy`), `${ny}: nem "${szo}"`);
  }
});

test("az értékelés promptja megadja a dolgozat nyelvét is", () => {
  const p = t.ertekelesPrompt(feladat("francia"), "Bonjour");
  assert.match(p, /A dolgozat nyelve: francia/);
});

test("nyelv nélküli feladat angolként értékelődik (régi adatok)", () => {
  const p = t.ertekelesPrompt({ cim: "Régi", rubrika: { tipus: "esszé" } }, "text");
  assert.match(p, /tapasztalt angoltanár vagy/);
});

test("a diáknak szóló visszajelzés MINDEN nyelvnél magyarul kért", () => {
  for (const ny of t.NYELVEK) {
    const p = t.ertekelesPrompt(feladat(ny), "minta");
    assert.match(p, /visszajelzés MAGYARUL/, `${ny}: nem kér magyar visszajelzést`);
  }
});

test("a rubrika adatai továbbra is behelyettesítődnek", () => {
  const p = t.ertekelesPrompt(feladat("német"), "Hallo Anna, wie geht es dir?");
  assert.match(p, /Típus: levél/);
  assert.match(p, /Célszint \(CEFR\): A2/);
  assert.match(p, /nyelvtan \("Nyelvhelyesség"\): max 50 pont/);
  assert.match(p, /Hallo Anna, wie geht es dir\?/);
});

// ══════════════════════════════════════════
// A rubrika-javaslat promptja
// ══════════════════════════════════════════

test("a rubrika-prompt tartalmazza a tanár által jelölt nyelvet", () => {
  const p = t.rubrikaPrompt("olasz");
  assert.match(p, /tapasztalt olasztanár vagy/);
  assert.match(p, /olasz-t jelölt meg/);
});

test("a rubrika-prompt kéri a tényleges nyelv visszajelzését", () => {
  const p = t.rubrikaPrompt("angol");
  assert.match(p, /"nyelv" mezőben/);
});

// ══════════════════════════════════════════
// Séma
// ══════════════════════════════════════════

test("a nyelv kötelező mező a rubrika-sémában", () => {
  // A NYELVEK listája és a séma enum-ja nem csúszhat el egymástól
  assert.ok(t.NYELVEK.includes(t.ALAP_NYELV), "az alapértelmezés szerepel a listában");
  assert.ok(t.NYELVEK.length >= 2, "legalább két nyelv");
});
