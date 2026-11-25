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

test("regresszió (Codex-ellenőrzés): az útmutató forráslistája oldalfejléc, sortörés és „és képek” mellett is átjön", async () => {
  const { utmutatoForrasokSzovegbol: ut } = await import("../scripts/erettsegi/kinyer.mjs");
  // 2024. október közép: a cím sorvégen, szóköz nélkül törik, a 2. feladat a letöltés dátuma után áll
  assert.deepEqual(ut([
    "ÍRÁSKÉSZSÉG", "integritásának megtartása mellett jöttek létre. Az eredeti szövegek forrása:",
    "1. feladat: https://www.pdffiller.com/497328158-", "?utm_term=%2Blet",
    "ter%20%2Binvitation&utm_content=US-0014LR Utolsó letöltés dátuma: 2022. december 20.",
    "2. feladat: https://www.nytimes.com/x.html Utolsó", "letöltés dátuma:2023. január 29.", "",
  ].join("\n")), { 1: "https://www.pdffiller.com/497328158-?utm_term=%2Bletter%20%2Binvitation&utm_content=US-0014LR", 2: "https://www.nytimes.com/x.html" });
  // 2024. május emelt: „Szövegek forrásai”, egymás alatti címek, oldalfejléc a két feladat között; a kép forrása nem kell
  assert.deepEqual(ut([
    "ÍRÁSKÉSZSÉG", "Az eredeti szövegek és képek forrása:", "1. feladat:", "Szövegek forrásai: https://a.org/1",
    "http://b.com/2", "Kép forrása: https://img.com/k-", "36637.jpg", "Utolsó letöltés dátuma: 2024. január 6.",
    "Javítási-értékelési útmutató", "Angol nyelv 12 / 17 emelt szintű írásbeli vizsga", "E2412 2024. május 9.",
    "2. feladat:", "A szöveg forrása és a kép forrása: https://c.net/3-", "flexible", "Az íráskészség feladatok értékelési útmutatója",
  ].join("\n")), { 1: "https://a.org/1 http://b.com/2", 2: "https://c.net/3-flexible" });
  const f = (lap, n) => JSON.parse(readFileSync(join(MAPPA, lap + ".json"), "utf8")).feladatok.find((t) => t.sorszam === n);
  assert.match(f("2024-okt-kozep", 1).bemenet.forras, /utm_term=%2Bletter%20%2Binvitation&utm_content=US-0014LR$/);
  for (const [lap, n] of [["2024-maj-emelt", 1], ["2024-maj-emelt", 2], ["2024-okt-emelt", 1], ["2024-okt-emelt", 2], ["2024-okt-kozep", 2],
    ["2025-okt-kozep", 1], ["2025-okt-kozep", 2], ["2026-maj-kozep", 2], ["2026-okt-kozep", 1], ["2026-okt-kozep", 2], ["2005-maj2-emelt", 1], ["2005-maj2-emelt", 2]]) {
    assert.ok(f(lap, n).bemenet.forras, `${lap} ${n}. feladat: van forrás`);
  }
});

test("regresszió (Codex-ellenőrzés): szerzői sor nem cím, szószám-tartomány „about”-tal, a 2007-es hirdetések sorrendje", () => {
  const f = (lap, n) => JSON.parse(readFileSync(join(MAPPA, lap + ".json"), "utf8")).feladatok.find((t) => t.sorszam === n);
  for (const [lap, szerzo] of [["2015-maj-emelt", "Nick 17"], ["2017-maj-emelt", "Emily 16, Oklahoma"], ["2020-maj-emelt", "Laura D"], ["2012-maj-kozep", "JODY"]]) {
    const b = f(lap, 2).bemenet;
    assert.equal(b.cim, null, lap); assert.equal(b.bekezdesek[0], szerzo, lap);
  }
  assert.equal(f("2025-okt-emelt", 2).bemenet.cim, "Schools let us down");
  assert.deepEqual(f("2015-maj-kozep", 2).szoszam, { min: 100, max: 120, szoveg: "about 100-120 words" });
  const kew = f("2007-okt-emelt", 1).bemenet;
  assert.equal(kew.cim, "Gardens and a Green - Historic Kew");
  assert.match(kew.bekezdesek[1], /Follow the Stars/);
  assert.equal(f("2009-okt-kozep", 2).bemenet.fajta, "letter");
  assert.equal(f("2011-okt-kozep", 2).bemenet.fajta, "post");
});

test("regresszió (Codex-ellenőrzés): a sablonok nullázási mondata nem nevezi 0 pontnak a részleges kidolgozást", () => {
  const s = JSON.parse(readFileSync(join(MAPPA, "sablonok.json"), "utf8")).sablonok;
  for (const x of s) assert.doesNotMatch(x.rubrika.egyeb_utasitas, /egyik irányító szempontot sem dolgozta ki megfelelően\)/, x.id);
  const emelt = s.find((x) => x.id === "emelt-level").rubrika.egyeb_utasitas;
  assert.match(emelt, /2 = [^;]*;[^;]*aránytalanul sok szót vesz át/);
});
