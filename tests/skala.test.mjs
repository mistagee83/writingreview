// ══════════════════════════════════════════════════════
// Jegyskála-szerkesztő (public/js/skala-urlap.js) – a DOM-tól független rész
//
// Miért külön teszt: az űrlap szöveges mezőkből építi a skálát, és a
// szerver ugyanazt a skálát ellenőrzi újra. Ha a kettő elcsúszik (pl. a
// "4" címke szöveg marad, nem szám), a magyar 1–5-ös jegyek a régi,
// szám alakú jegyektől eltérnének, és a tanár mentése hibával elhasalna.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { skalaSorokra, skalaSorokbol, sablonNeve } from "../public/js/skala-urlap.js";
import { SKALA_SABLONOK, skalaFeloldas, jegyJavaslat } from "../public/js/kifejtos.js";

const sor = (cimke, min) => ({ cimke, min });

test("a sablonok oda-vissza alakíthatók: sorok → skála ugyanazt adja", () => {
  for (const nev of ["hu15", "af"]) {
    const s = SKALA_SABLONOK[nev];
    const r = skalaSorokbol(nev, skalaSorokra(s));
    assert.ok(r.skala, nev);
    assert.deepEqual(r.skala.fokozatok, s.fokozatok, nev);
    assert.equal(r.skala.sablon, nev);
  }
});

test("a számként írt címke számként tárolódik (a régi 1–5-ös jegyek miatt)", () => {
  const r = skalaSorokbol("egyeni", [sor("1", "0"), sor("2", "40"), sor("3", "70")]);
  assert.deepEqual(r.skala.fokozatok.map((f) => f.cimke), [1, 2, 3]);
  const betu = skalaSorokbol("egyeni", [sor("rossz", "0"), sor("jó", "50")]);
  assert.deepEqual(betu.skala.fokozatok.map((f) => f.cimke), ["rossz", "jó"]);
});

test("a százalékos skálának nincsenek sorai", () => {
  const r = skalaSorokbol("szazalek", []);
  assert.equal(r.skala.tipus, "szazalek");
  assert.deepEqual(skalaSorokra(r.skala), []);
});

test("hibás szerkesztői állapot → hiba, nem kivétel", () => {
  const rossz = [
    [sor("A", "0")],                               // kevés fokozat
    [sor("F", "0"), sor("A", "")],                 // üres határ
    [sor("F", "0"), sor("", "50")],                // üres címke
    [sor("F", "0"), sor("A", "50"), sor("B", "40")], // nem növekvő
    [sor("F", "0"), sor("F", "50")],               // ismétlődő címke
    [sor("F", "0"), sor("A", "abc")],              // nem szám
    [sor("F", "0"), sor("A", "120")],              // 100 fölött
    [sor("Túlhosszú-cimke", "0"), sor("A", "50")]  // 8 karakternél hosszabb
  ];
  for (const sorok of rossz) {
    const r = skalaSorokbol("egyeni", sorok);
    assert.ok(r.hiba && !r.skala, JSON.stringify(sorok));
  }
});

test("a címke szóközei lekerülnek, az egyéni skálának nincs sablonneve", () => {
  const r = skalaSorokbol("egyeni", [sor(" F ", "0"), sor(" A", "60")]);
  assert.deepEqual(r.skala.fokozatok.map((f) => f.cimke), ["F", "A"]);
  assert.equal(r.skala.sablon, undefined);
});

test("sablonNeve: felismeri a sablont, minden más egyéni", () => {
  assert.equal(sablonNeve(SKALA_SABLONOK.af), "af");
  assert.equal(sablonNeve(SKALA_SABLONOK.szazalek), "szazalek");
  assert.equal(sablonNeve(skalaFeloldas({})), "hu15", "a régi, ponthatár nélküli feladat magyar 1–5");
  // régi feladat saját ponthatárokkal: már nem a sablon
  assert.equal(sablonNeve(skalaFeloldas({ ponthatarok: { 2: 30, 3: 50, 4: 65, 5: 80 } })), "egyeni");
  // a sablon átírt határral egyéni
  const modositott = skalaSorokbol("af", skalaSorokra(SKALA_SABLONOK.af).map((s) => (s.cimke === "A" ? sor("A", "95") : s)));
  assert.equal(sablonNeve(modositott.skala), "egyeni");
});

test("az egyéni skálában nincs undefined mező (a Firestore nem fogadja el)", () => {
  const nincsUndefined = (o) => Object.values(o).every((v) => v !== undefined);
  const e = skalaSorokbol("egyeni", [sor("1", "0"), sor("2", "50")]);
  assert.ok(nincsUndefined(e.skala));
  assert.ok(!("sablon" in e.skala));
  const sz = skalaFeloldas({ skala: { tipus: "szazalek" } });
  assert.ok(nincsUndefined(sz));
});

test("a leveles javítás jegyjavaslata a feladat skáláján áll (77% → 4)", () => {
  assert.equal(jegyJavaslat(77, 100, SKALA_SABLONOK.hu15), 4);
  assert.equal(jegyJavaslat(77, 100, SKALA_SABLONOK.af), "C");
  assert.equal(jegyJavaslat(77, 100, { tipus: "szazalek" }), 77);
});
