// ══════════════════════════════════════════════════════
// Beírt (szöveges) beadás – a tiszta szerveroldali rész (emulátor nélkül)
//
// 2026-11-12 óta a beadás mindig beírt szöveg (a fotós beadás és a tanári beadásimód-választó
// kikerült). A szöveget a kliens írja, ezért a szerver a feldolgozás előtt ellenőrzi.
// Az adatbázisos végigfutást a beirt-beadas-adatbazis.test.mjs fedi.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-beirt-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
let t;
before(() => { t = require("./index.js")._teszt; });

const feladat = (rubrika = {}) => ({ tanar_id: "t1", rubrika });
const beirt = (felul = {}) => ({
  tanar_id: "t1",
  forras: "szoveg", szoveg: "Dear Ben, I think your plan is great.", ...felul
});

test("beírt beadás: a feladat beadási módjától függetlenül elfogadott (a régi mező hatástalan)", () => {
  for (const rubrika of [{}, { beadasi_mod: "foto" }, { beadasi_mod: "szoveg" }, { beadasi_mod: "mindketto" }]) {
    assert.equal(t.beadasOsszerendeles("b1", beirt(), feladat(rubrika)), null, JSON.stringify(rubrika));
  }
});

test("a fotós (nem beírt) beadás elutasítva, régi feladatra is", () => {
  const fotos = { tanar_id: "t1", kep_paths: ["beadasok/d1/b1/1.jpg"] };
  assert.equal(t.beadasOsszerendeles("b1", fotos, feladat()), "mod_nem_egyezik");
  assert.equal(t.beadasOsszerendeles("b1", { ...fotos, forras: "foto" }, feladat()), "mod_nem_egyezik");
  assert.equal(t.beadasOsszerendeles("b1", beirt({ forras: undefined }), feladat()), "mod_nem_egyezik");
});

test("beírt beadás: üres, szóközös, túl hosszú vagy nem szöveg elutasítva; a határ még jó", () => {
  const f = feladat();
  for (const szoveg of ["", "   \n\t ", "a".repeat(t.BEIRT_SZOVEG_MAX + 1), 42, null, undefined, ["x"]]) {
    assert.equal(t.beadasOsszerendeles("b1", beirt({ szoveg }), f), "szoveg_nincs", JSON.stringify(szoveg)?.slice(0, 20));
  }
  assert.equal(t.beadasOsszerendeles("b1", beirt({ szoveg: "a".repeat(t.BEIRT_SZOVEG_MAX) }), f), null);
});

test("beírt beadás: a tanár összetartozását ellenőrzi (osztály és diákfiók 2026-11-12 óta nincs)", () => {
  const f = feladat();
  assert.equal(t.beadasOsszerendeles("b1", beirt({ tanar_id: "mas" }), f), "tanar_nem_egyezik");
  // a régi osztály/diák mező nem számít
  assert.equal(t.beadasOsszerendeles("b1", beirt({ osztaly_id: "mas", diak_id: "" }), f), null);
});

test("az értékelő prompt nem állítja, hogy kézírásból átírt, és nem említ olvashatatlan részt", () => {
  const f = { cim: "T", rubrika: { nyelv: "angol", szempontok: [{ kulcs: "a", cim: "A", suly: 5 }] } };
  const p = t.ertekelesPrompt(f, "szöveg");
  assert.match(p, /a diák beírta/);
  assert.doesNotMatch(p, /kézírás|átírva|[?]/);
});
