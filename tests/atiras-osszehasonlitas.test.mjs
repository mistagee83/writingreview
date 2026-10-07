// ══════════════════════════════════════════════════════
// scripts/atiras-osszehasonlitas.mjs – a tiszta részek és egy végigfutás
// kicserélt fetch-csel (valódi Gemini-hívás nincs).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.GCLOUD_PROJECT = "wr-atiras-osszehasonlitas-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const { szavak, kulonbseg, dolgozatokGyujtese, kapcsolok, futtat } =
  await import("../scripts/atiras-osszehasonlitas.mjs");

// 1×1 pixeles érvényes PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

test("a szavak a szóközökön és sortöréseken bontanak", () => {
  assert.deepEqual(szavak("Dear  Ben,\nI think"), ["Dear", "Ben,", "I", "think"]);
  assert.deepEqual(szavak(""), []);
  assert.deepEqual(szavak(undefined), []);
});

test("azonos szövegek eltérése 0", () => {
  const k = kulonbseg("a b c", "a\nb  c");
  assert.equal(k.tavolsag, 0);
  assert.equal(k.wer, 0);
  assert.deepEqual(k.kulonbsegek, []);
});

test("egy félreolvasott szó: 1 távolság, a különbség megnevezi a szavakat", () => {
  const k = kulonbseg("I want to be a doctor", "I want to be a docter");
  assert.equal(k.tavolsag, 1);
  assert.equal(k.wer, 1 / 6);
  assert.deepEqual(k.kulonbsegek, [{ a: "doctor", b: "docter" }]);
});

test("kihagyott és beszúrt szó is különbség", () => {
  const k = kulonbseg("a b c d", "a c d e");
  assert.equal(k.tavolsag, 2);
  assert.deepEqual(k.kulonbsegek, [{ a: "b", b: "" }, { a: "", b: "e" }]);
});

test("üres viszonyítás: a wer nem NaN", () => {
  assert.equal(kulonbseg("", "").wer, 0);
  assert.equal(kulonbseg("", "a").wer, 1);
});

test("a dolgozatok: egy kép = egy dolgozat, az almappa = többoldalas dolgozat", () => {
  const m = mkdtempSync(join(tmpdir(), "wr-atiras-"));
  try {
    writeFileSync(join(m, "anna.jpg"), PNG);
    writeFileSync(join(m, "jegyzet.txt"), "nem kép");
    writeFileSync(join(m, "anna.txt"), "I want a doctor");
    mkdirSync(join(m, "bela"));
    writeFileSync(join(m, "bela", "2.png"), PNG);
    writeFileSync(join(m, "bela", "10.png"), PNG);
    writeFileSync(join(m, "bela", "1.png"), PNG);
    const d = dolgozatokGyujtese(m);
    assert.deepEqual(d.map((x) => x.nev), ["anna", "bela"]);
    assert.equal(d[0].oldalak.length, 1);
    assert.equal(d[0].helyes, "I want a doctor", "az <név>.txt a helyes átirat");
    assert.equal(d[1].helyes, null, "nincs <név>.txt → nincs helyes átirat");
    assert.deepEqual(d[1].oldalak.map((f) => f.split(/[\\/]/).pop()), ["1.png", "2.png", "10.png"], "természetes sorrend");
  } finally {
    rmSync(m, { recursive: true, force: true });
  }
});

test("kapcsolók: alapértékek és hibák", () => {
  const b = kapcsolok(["mappa"]);
  assert.deepEqual(b.szintek, ["medium", "low"]);
  assert.equal(b.ismet, 2);
  assert.equal(b.nyelv, "angol");
  assert.deepEqual(kapcsolok(["m", "--szintek", "high,low", "--ismet", "3"]).szintek, ["high", "low"]);
  assert.throws(() => kapcsolok([]), /mappáját/);
  assert.throws(() => kapcsolok(["m", "--szintek", "lassu"]), /Ismeretlen gondolkodási szint/);
  assert.throws(() => kapcsolok(["m", "--ismet", "0"]), /--ismet/);
  assert.throws(() => kapcsolok(["m", "--valami"]), /Ismeretlen kapcsoló/);
});

test("végigfutás: az éles kérés megy ki szintenként, az eredmény fájlokba kerül", async () => {
  const m = mkdtempSync(join(tmpdir(), "wr-atiras-"));
  const ki = join(m, "ki");
  writeFileSync(join(m, "anna.png"), PNG);
  writeFileSync(join(m, "anna.txt"), "I want a doctor");
  const kerek = [];
  const eredeti = globalThis.fetch;
  const naplo = console.log;
  console.log = () => {};
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const szint = body.generationConfig.thinkingConfig?.thinkingLevel;
    kerek.push({ szint, szoveg: body.contents[0].parts[0].text, kepek: body.contents[0].parts.length - 1, schema: body.generationConfig.responseSchema });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ atirat: szint === "low" ? "I want a docter" : "I want a doctor", olvashatosag: "jo" }) }] } }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: szint === "low" ? 100 : 2000, totalTokenCount: 3100 }
      })
    };
  };
  try {
    const { futasok } = await futtat([m, "--ki", ki], { GEMINI_API_KEY: "teszt-kulcs" });
    // medium ×2, low ×2 – ebben a sorrendben
    assert.deepEqual(kerek.map((k) => k.szint), ["medium", "medium", "low", "low"]);
    assert.equal(kerek[0].kepek, 1);
    assert.match(kerek[0].szoveg, /Te egy pontos átíró vagy/, "az éles átírás-prompt");
    assert.deepEqual(Object.keys(kerek[0].schema.properties), ["atirat", "olvashatosag", "megjegyzes"], "az éles séma");
    // a low olcsóbb: kevesebb gondolkodási token
    const koltseg = (sz) => futasok.find((f) => f.szint === sz).koltseg;
    assert.ok(koltseg("low") < koltseg("medium"));
    const fajlok = readdirSync(ki).sort();
    assert.deepEqual(fajlok, ["anna.low.1.txt", "anna.low.2.txt", "anna.medium.1.txt", "anna.medium.2.txt", "osszegzes.txt"]);
    const osszegzes = readFileSync(join(ki, "osszegzes.txt"), "utf8");
    assert.match(osszegzes, /«doctor»\s+→\s+low: «docter»/);
    assert.match(osszegzes, /medium #2\s+0\.0%/, "a viszonyítás 2. futása a zaj");
    // pontosság a helyes átirathoz: medium 0%, low 1 hibás szó a 4-ből = 25%
    assert.match(osszegzes, /Pontosság az ellenőrzött átirathoz/);
    assert.match(osszegzes, /medium\s+0\.0%\s+\(2 futás\)/);
    assert.match(osszegzes, /low\s+25\.0%\s+\(2 futás\)/);
    assert.match(osszegzes, /helyes: «doctor»\s+→\s+AI: «docter»/);
  } finally {
    globalThis.fetch = eredeti;
    console.log = naplo;
    rmSync(m, { recursive: true, force: true });
  }
});

test("helyes átirat nélkül a szkript jelzi, hogy a jobbat így nem lehet eldönteni", async () => {
  const m = mkdtempSync(join(tmpdir(), "wr-atiras-"));
  writeFileSync(join(m, "anna.png"), PNG);
  const eredeti = globalThis.fetch;
  const naplo = console.log;
  console.log = () => {};
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ atirat: "a b", olvashatosag: "jo" }) }] } }] })
  });
  try {
    await futtat([m, "--ki", join(m, "ki"), "--ismet", "1"], { GEMINI_API_KEY: "k" });
    assert.match(readFileSync(join(m, "ki", "osszegzes.txt"), "utf8"), /nem dönthető el, melyik szint olvas jobban/);
  } finally {
    globalThis.fetch = eredeti;
    console.log = naplo;
    rmSync(m, { recursive: true, force: true });
  }
});

test("kulcs nélkül érthető hibát ad", async () => {
  await assert.rejects(() => futtat(["valami"], {}), /GEMINI_API_KEY/);
});
