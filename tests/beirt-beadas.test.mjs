// ══════════════════════════════════════════════════════
// Beírt (szöveges) beadás – a tiszta szerveroldali rész (emulátor nélkül)
//
// A feladat beadási módját a tanár állítja (rubrika.beadasi_mod: foto | szoveg | mindketto).
// A beírt beadás szövegét a kliens írja, ezért a szerver a feldolgozás előtt ellenőrzi.
// Az adatbázisos végigfutást a beirt-beadas-adatbazis.test.mjs fedi.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-beirt-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
let t;
before(() => { t = require("./index.js")._teszt; });

const feladat = (rubrika = {}) => ({ osztaly_id: "o1", tanar_id: "t1", rubrika });
const beirt = (felul = {}) => ({
  osztaly_id: "o1", tanar_id: "t1", diak_id: "d1",
  forras: "szoveg", szoveg: "Dear Ben, I think your plan is great.", kep_paths: [], ...felul
});
const fotos = (felul = {}) => ({
  osztaly_id: "o1", tanar_id: "t1", diak_id: "d1", kep_paths: ["beadasok/d1/b1/1.jpg"], ...felul
});

test("beadasiMod: hiányzó vagy ismeretlen érték fotó; szoveg és mindketto felismerve", () => {
  assert.equal(t.beadasiMod(feladat()), "foto");
  assert.equal(t.beadasiMod({}), "foto");
  assert.equal(t.beadasiMod(undefined), "foto");
  assert.equal(t.beadasiMod(feladat({ beadasi_mod: "valami" })), "foto");
  assert.equal(t.beadasiMod(feladat({ beadasi_mod: 5 })), "foto");
  assert.equal(t.beadasiMod(feladat({ beadasi_mod: "szoveg" })), "szoveg");
  assert.equal(t.beadasiMod(feladat({ beadasi_mod: "mindketto" })), "mindketto");
});

test("beírt beadás: engedett módnál rendben, fotós feladatnál elutasítva", () => {
  assert.equal(t.beadasOsszerendeles("b1", beirt(), feladat({ beadasi_mod: "szoveg" })), null);
  assert.equal(t.beadasOsszerendeles("b1", beirt(), feladat({ beadasi_mod: "mindketto" })), null);
  assert.equal(t.beadasOsszerendeles("b1", beirt(), feladat()), "mod_nem_egyezik");
  assert.equal(t.beadasOsszerendeles("b1", beirt(), feladat({ beadasi_mod: "foto" })), "mod_nem_egyezik");
});

test("beírt beadás: kifejtős feladatra elutasítva, akkor is, ha a mód szoveg", () => {
  assert.equal(
    t.beadasOsszerendeles("b1", beirt(), feladat({ mod: "kifejtos", beadasi_mod: "szoveg" })),
    "mod_nem_egyezik"
  );
});

test("beírt beadás: üres, szóközös, túl hosszú vagy nem szöveg elutasítva; a határ még jó", () => {
  const f = feladat({ beadasi_mod: "szoveg" });
  for (const szoveg of ["", "   \n\t ", "a".repeat(t.BEIRT_SZOVEG_MAX + 1), 42, null, undefined, ["x"]]) {
    assert.equal(t.beadasOsszerendeles("b1", beirt({ szoveg }), f), "szoveg_nincs", JSON.stringify(szoveg)?.slice(0, 20));
  }
  assert.equal(t.beadasOsszerendeles("b1", beirt({ szoveg: "a".repeat(t.BEIRT_SZOVEG_MAX) }), f), null);
});

test("beírt beadás: képpel vegyítve elutasítva", () => {
  assert.equal(
    t.beadasOsszerendeles("b1", beirt({ kep_paths: ["beadasok/d1/b1/1.jpg"] }), feladat({ beadasi_mod: "szoveg" })),
    "kep_es_szoveg"
  );
});

test("beírt beadás: az osztály/tanár/diák összetartozását ugyanúgy ellenőrzi", () => {
  const f = feladat({ beadasi_mod: "szoveg" });
  assert.equal(t.beadasOsszerendeles("b1", beirt({ tanar_id: "mas" }), f), "tanar_nem_egyezik");
  assert.equal(t.beadasOsszerendeles("b1", beirt({ osztaly_id: "mas" }), f), "osztaly_nem_egyezik");
  assert.equal(t.beadasOsszerendeles("b1", beirt({ diak_id: "" }), f), "diak_hianyzik");
});

test("fotós beadás: 'szoveg' módú feladatnál elutasítva, egyébként a régi szabályok érvényesek", () => {
  assert.equal(t.beadasOsszerendeles("b1", fotos(), feladat({ beadasi_mod: "szoveg" })), "mod_nem_egyezik");
  assert.equal(t.beadasOsszerendeles("b1", fotos(), feladat()), null);
  assert.equal(t.beadasOsszerendeles("b1", fotos(), feladat({ beadasi_mod: "mindketto" })), null);
  assert.equal(t.beadasOsszerendeles("b1", fotos({ kep_paths: [] }), feladat({ beadasi_mod: "mindketto" })), "kep_nincs");
  assert.equal(t.beadasOsszerendeles("b1", fotos({ kep_paths: ["beadasok/mas/b1/1.jpg"] }), feladat()), "kep_ut_idegen");
});

test("az értékelő prompt beírt szövegnél nem állítja, hogy kézírásból átírt", () => {
  const f = { cim: "T", rubrika: { nyelv: "angol", szempontok: [{ kulcs: "a", cim: "A", suly: 5 }] } };
  assert.match(t.ertekelesPrompt(f, "szöveg"), /kézírásból átírva/);
  const p = t.ertekelesPrompt(f, "szöveg", { beirt: true });
  assert.match(p, /a diák beírta/);
  assert.ok(!/kézírásból átírva/.test(p));
});
