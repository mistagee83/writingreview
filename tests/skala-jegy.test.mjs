// ══════════════════════════════════════════════════════
// Jegyskála és jegyjavaslat (functions/skala.js)
//
// Miért teszt: a jegy a diákhoz megy. Ha a határ elcsúszik (54,6% → 3-as
// 55%-os határnál), vagy egy rossz skála nem esik vissza az alapra, a diák
// csendben rossz jegyet kap. A böngészős példány (public/js/skala.js) a
// generált másolat: ugyanígy kell számolnia.
//
// 2026-11-12 előtt ezek a tests/kifejtos.test.mjs-ben voltak (a kifejtős
// mód kikerült, a skála maradt).
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let sz;

before(() => {
  sz = require("./skala.js");
});

// ══════════════════════════════════════════
// JEGYJAVASLAT
// ══════════════════════════════════════════

test("jegyjavaslat az alapértelmezett határokkal", () => {
  assert.equal(sz.jegyJavaslat(0, 13), 1);
  assert.equal(sz.jegyJavaslat(8, 13), 3);
  assert.equal(sz.jegyJavaslat(55, 100), 3, "a határ már a jobb jegy");
  assert.equal(sz.jegyJavaslat(54.9, 100), 2);
  assert.equal(sz.jegyJavaslat(13, 13), 5);
  assert.equal(sz.jegyJavaslat(0, 0), null);
});

test("jegyjavaslat: a pontos arány számít, nem a kerekített százalék", () => {
  // 71/130 = 54,6% → kerekítve 55 lenne, de a határ 55
  assert.equal(sz.jegyJavaslat(71, 130), 2);
});

// ── Jegyskála: magyar 1–5, A–F, százalék, egyéni ──

test("skála-sablonok: a magyar 1–5 ugyanazt adja, mint a régi ponthatárok", () => {
  for (const [pont, max] of [[0, 13], [8, 13], [55, 100], [54.9, 100], [13, 13], [71, 130]]) {
    assert.equal(sz.jegyJavaslat(pont, max, sz.SKALA_SABLONOK.hu15), sz.jegyJavaslat(pont, max));
  }
  for (const [nev, s] of Object.entries(sz.SKALA_SABLONOK)) {
    assert.ok(sz.skalaEllenorzes(s), `a(z) ${nev} sablon érvényes`);
  }
});

test("A–F skála: a határ már a jobb fokozat, a legalsó a 0%", () => {
  const af = sz.SKALA_SABLONOK.af;
  assert.equal(sz.jegyJavaslat(90, 100, af), "A");
  assert.equal(sz.jegyJavaslat(89.9, 100, af), "B");
  assert.equal(sz.jegyJavaslat(60, 100, af), "D");
  assert.equal(sz.jegyJavaslat(59, 100, af), "F");
  assert.equal(sz.jegyJavaslat(0, 10, af), "F");
  assert.equal(sz.jegyJavaslat(0, 0, af), null);
});

test("százalékos skála: a kerekített százalék a jegy", () => {
  const sk = sz.SKALA_SABLONOK.szazalek;
  assert.equal(sz.jegyJavaslat(17, 20, sk), 85);
  assert.equal(sz.jegyJavaslat(71, 130, sk), 55);
  assert.equal(sz.jegyJavaslat(0, 5, sk), 0);
  assert.equal(sz.jegyJavaslat(5, 5, sk), 100);
});

test("egyéni skála: tetszőleges címkék és határok", () => {
  const sk = { tipus: "fokozat", fokozatok: [
    { cimke: "Elégtelen", min: 0 }, { cimke: "Jó", min: 50 }, { cimke: "Kiváló", min: 80 }
  ] };
  // a címke legfeljebb 8 karakter – az "Elégtelen" 9, ezért érvénytelen
  assert.equal(sz.skalaEllenorzes(sk), null);
  sk.fokozatok[0].cimke = "Nem felelt";
  assert.equal(sz.skalaEllenorzes(sk), null);
  sk.fokozatok[0].cimke = "Rossz";
  assert.equal(sz.jegyJavaslat(79, 100, sk), "Jó");
  assert.equal(sz.jegyJavaslat(80, 100, sk), "Kiváló");
  assert.equal(sz.jegyJavaslat(10, 100, sk), "Rossz");
});

test("rossz skála érvénytelen, a szerver ilyenkor az alap magyar 1–5-re esik vissza", () => {
  const f = (cimke, min) => ({ cimke, min });
  const rossz = [
    null, "A–F", {}, { tipus: "fokozat" }, { tipus: "valami" },
    { tipus: "fokozat", fokozatok: [f("A", 0)] },                       // kevés fokozat
    { tipus: "fokozat", fokozatok: [f("F", 10), f("A", 90)] },           // nem 0-val indul
    { tipus: "fokozat", fokozatok: [f("F", 0), f("A", 90), f("B", 80)] },// nem növekvő
    { tipus: "fokozat", fokozatok: [f("F", 0), f("F", 90)] },            // ismétlődő címke
    { tipus: "fokozat", fokozatok: [f("F", 0), f(1, 50), f("1", 60)] },  // az 1 és az "1" ugyanaz
    { tipus: "fokozat", fokozatok: [f("F", 0), f("A", 101)] },           // 100 fölött
    { tipus: "fokozat", fokozatok: [f("F", 0), f("A", "")] },            // üres határ
    { tipus: "fokozat", fokozatok: [f("", 0), f("A", 50)] },             // üres címke
    { tipus: "fokozat", fokozatok: [f("F", 0), f(NaN, 50)] }
  ];
  for (const s of rossz) {
    assert.equal(sz.skalaEllenorzes(s), null, JSON.stringify(s));
    assert.deepEqual(
      sz.skalaFeloldas({ skala: s }).fokozatok.map((x) => x.cimke), [1, 2, 3, 4, 5], JSON.stringify(s)
    );
  }
});

test("skalaFeloldas: saját skála, régi ponthatárok, vagy az alap", () => {
  assert.equal(sz.skalaFeloldas({ skala: sz.SKALA_SABLONOK.af }).fokozatok[4].cimke, "A");
  assert.equal(sz.skalaFeloldas({ skala: sz.SKALA_SABLONOK.szazalek }).tipus, "szazalek");
  // régi feladat: csak ponthatárok
  const regi = sz.skalaFeloldas({ ponthatarok: { 2: 30, 3: 50, 4: 65, 5: 80 } });
  assert.deepEqual(regi.fokozatok.map((x) => [x.cimke, x.min]), [[1, 0], [2, 30], [3, 50], [4, 65], [5, 80]]);
  // se skála, se ponthatár (vagy rossz ponthatár) → alap
  const alap = [[1, 0], [2, 40], [3, 55], [4, 70], [5, 85]];
  assert.deepEqual(sz.skalaFeloldas({}).fokozatok.map((x) => [x.cimke, x.min]), alap);
  assert.deepEqual(sz.skalaFeloldas(undefined).fokozatok.map((x) => [x.cimke, x.min]), alap);
  assert.deepEqual(
    sz.skalaFeloldas({ ponthatarok: { 2: 60, 3: 50, 4: 70, 5: 85 } }).fokozatok.map((x) => [x.cimke, x.min]), alap
  );
  // a sablon nem módosítható a feloldott példányon keresztül
  sz.skalaFeloldas({}).fokozatok[1].min = 99;
  assert.equal(sz.SKALA_SABLONOK.hu15.fokozatok[1].min, 40);
});

test("jegynormalizálás: a skála saját alakját adja, ami nincs rajta, az undefined", () => {
  const hu = sz.skalaFeloldas({});
  assert.equal(sz.jegyNormalizalas(4, hu), 4);
  assert.equal(sz.jegyNormalizalas("4", hu), 4, "a szöveges alak is jó, de számként tároljuk");
  assert.equal(sz.jegyNormalizalas(6, hu), undefined);
  assert.equal(sz.jegyNormalizalas(0, hu), undefined);
  assert.equal(sz.jegyNormalizalas(2.5, hu), undefined);
  assert.equal(sz.jegyNormalizalas("A", hu), undefined);
  assert.equal(sz.jegyNormalizalas({}, hu), undefined);
  const af = sz.SKALA_SABLONOK.af;
  assert.equal(sz.jegyNormalizalas("B", af), "B");
  assert.equal(sz.jegyNormalizalas(" B ", af), "B");
  assert.equal(sz.jegyNormalizalas("E", af), undefined);
  assert.equal(sz.jegyNormalizalas(4, af), undefined);
  const szaz = sz.SKALA_SABLONOK.szazalek;
  assert.equal(sz.jegyNormalizalas(85, szaz), 85);
  assert.equal(sz.jegyNormalizalas("85", szaz), 85);
  assert.equal(sz.jegyNormalizalas(0, szaz), 0);
  assert.equal(sz.jegyNormalizalas(101, szaz), undefined);
  assert.equal(sz.jegyNormalizalas(85.5, szaz), undefined);
  assert.equal(sz.jegyNormalizalas("", szaz), undefined);
  assert.equal(sz.jegyNormalizalas(-1, szaz), undefined);
});

test("egyéni ponthatárok, és rossz határok helyett az alapértelmezés", () => {
  assert.equal(sz.jegyJavaslat(50, 100, { 2: 30, 3: 50, 4: 65, 5: 80 }), 3);
  assert.deepEqual(sz.ponthatarokEllenorzes({ 2: 60, 3: 50, 4: 70, 5: 85 }), sz.ALAP_PONTHATAROK);
  assert.deepEqual(sz.ponthatarokEllenorzes({ 2: 40, 3: 55, 4: 70, 5: 120 }), sz.ALAP_PONTHATAROK);
  assert.deepEqual(sz.ponthatarokEllenorzes(null), sz.ALAP_PONTHATAROK);
});

// ══════════════════════════════════════════
// A BÖNGÉSZŐS PÉLDÁNY
// ══════════════════════════════════════════

test("a public/js/skala.js friss (node scripts/skala-kliens.mjs)", async () => {
  const { kliensKod, FORRAS, CEL } = await import("../scripts/skala-kliens.mjs");
  const vart = kliensKod(readFileSync(FORRAS, "utf8"));
  const van = readFileSync(CEL, "utf8").replace(/\r\n/g, "\n");
  assert.equal(van, vart, "Elavult a public/js/skala.js – futtasd: node scripts/skala-kliens.mjs");
});

test("a böngészős példány ugyanazokat exportálja, és ugyanúgy számol", async () => {
  const kliens = await import("../public/js/skala.js");
  assert.deepEqual(Object.keys(kliens).sort(), Object.keys(sz).sort());
  for (const [pont, max] of [[0, 13], [8, 13], [71, 130], [13, 13]]) {
    for (const nev of Object.keys(sz.SKALA_SABLONOK)) {
      assert.equal(kliens.jegyJavaslat(pont, max, sz.SKALA_SABLONOK[nev]), sz.jegyJavaslat(pont, max, sz.SKALA_SABLONOK[nev]));
    }
  }
});

test("a forrás nem használhat require()-t (a böngészőben is futnia kell)", async () => {
  const { kliensKod } = await import("../scripts/skala-kliens.mjs");
  assert.throws(() => kliensKod('const x = require("y");\nmodule.exports = { x };'), /require/);
});
