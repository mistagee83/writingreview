// ══════════════════════════════════════════════════════
// Érettségi feladattár – a kinyert fájlok ellenőrzése
//
// A functions/feladattar/erettsegi/ fájljait a scripts/erettsegi/kinyer.mjs állítja elő a feladatlapokból
// (kézzel nem szerkesztjük). Ez a teszt a scripts/feladattar-ellenorzes.mjs-t futtatja: a 91 feladatsor,
// a négy sablon és a képes oldalak döntései (docs/erettsegi-feladattar-terv.md, 4. fejezet, „Ellenőrzés”).
// Emulátor nem kell.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ellenoriz } from "../scripts/feladattar-ellenorzes.mjs";

const MAPPA = fileURLToPath(new URL("../functions/feladattar/erettsegi/", import.meta.url));

test("a kinyert feladattár hibátlan: 91 lap, minden írásfeladat a feladatok vagy a kimaradt listában", async () => {
  const { hibak, lapDb, feladatDb, kimaradtDb } = await ellenoriz(MAPPA);
  assert.deepEqual(hibak, []);
  assert.equal(lapDb, 91);
  assert.equal(feladatDb + kimaradtDb, 182);
});

test("a képes feladatok kimaradnak (terv 5. fejezet: a gépi felmérés négy esete)", () => {
  const ki = (id, n) => JSON.parse(readFileSync(join(MAPPA, id + ".json"), "utf8")).kimaradt.find((k) => k.sorszam === n);
  for (const [id, n] of [["2024-maj-kozep", 1], ["2015-okt-kozep", 1], ["2016-okt-kozep", 1], ["2018-okt-kozep", 1]]) {
    assert.equal(ki(id, n)?.ok, "kep", `${id} ${n}. feladat`);
  }
});

test("a sablonok pontjai a 2026. októberi útmutatóéi (11, 22, 15, 15)", () => {
  const s = JSON.parse(readFileSync(join(MAPPA, "sablonok.json"), "utf8")).sablonok;
  const osszeg = Object.fromEntries(s.map((x) => [x.id, x.rubrika.szempontok.reduce((a, y) => a + y.suly, 0)]));
  assert.deepEqual(osszeg, { "kozep-level": 11, "kozep-fogalmazas": 22, "emelt-level": 15, "emelt-fogalmazas": 15 });
});

test("az ellenőrző észreveszi a hibát (elrontott másolaton)", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "feladattar-"));
  try {
    cpSync(MAPPA, tmp, { recursive: true });
    const fajl = join(tmp, "2024-maj-kozep.json");
    const lap = JSON.parse(readFileSync(fajl, "utf8"));
    lap.kimaradt = [];                                   // az 1. feladat eltűnik
    lap.feladatok[0].sablon = "emelt-level";              // rossz sablon
    lap.feladatok[0].szoszam = { min: 120, max: 100, szoveg: "100-120 words" };   // min > max
    lap.feladatok[0].bemenet.bekezdesek.push("…………………………");   // válaszsor maradvány
    writeFileSync(fajl, JSON.stringify(lap));
    const { hibak } = await ellenoriz(tmp);
    const van = (re) => assert.ok(hibak.some((h) => re.test(h)), `várt hiba: ${re}\n${hibak.join("\n")}`);
    van(/2024-maj-kozep: az írásfeladatok sorszámai/);
    van(/2024-maj-kozep-W2: a sablon emelt-level/);
    van(/2024-maj-kozep-W2: hibás szószám/);
    van(/2024-maj-kozep-W2: gépi maradvány/);
    van(/2024-maj-kozep-W1: a döntés „kihagy”, de a feladat nincs a kimaradt listában/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("regresszió: a pdftotext CESU-8 emojija (2022. május közép, 2. feladat) UTF-8 lesz", async () => {
  const { cesu } = await import("../scripts/erettsegi/kinyer.mjs");
  // „anything 😊.” – a pdftotext a 😊 jelet helyettesítő párként (ED A0 BD ED B8 8A) írja ki
  const nyers = Buffer.from([0x61, 0x20, 0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x8a, 0x2e]);
  assert.equal(cesu(nyers), "a 😊.");
  const lap = JSON.parse(readFileSync(join(MAPPA, "2022-maj-kozep.json"), "utf8"));
  assert.match(lap.feladatok.find((t) => t.sorszam === 2).bemenet.bekezdesek[0], /anything 😊\./);
});
