// ══════════════════════════════════════════════════════
// A visszajelzés nyelve (kimeneti_nyelv) és a kódolt szerverhibák
//
// Miért külön teszt: ha a prompt "MAGYARUL"-t kér, miközben a tanár angol
// visszajelzést állított be, a diák csendben rossz nyelvű szöveget kap –
// hiba nincs, a rendszer "működik". Ilyet csak teszt fog meg.
// A hibakódoknál ugyanez: ha egy kódhoz nincs szótári szöveg, az idegen
// nyelvű felhasználó a magyar üzenetet látja.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

process.env.GCLOUD_PROJECT = "wr-kimenet-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
let t;
let kf;
before(() => {
  t = require("./index.js")._teszt;
  kf = require("./kifejtos.js");
});

const feladat = (kimeneti) => ({
  cim: "Teszt",
  rubrika: {
    nyelv: "angol", tipus: "levél", szint: "B1",
    ...(kimeneti === undefined ? {} : { kimeneti_nyelv: kimeneti }),
    szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvhelyesség", suly: 50 }]
  }
});

// ── a prompt a kért nyelven kéri a kimenetet ──

test("alapértelmezés: a visszajelzés magyarul készül (régi feladatok)", () => {
  const p = t.ertekelesPrompt(feladat(undefined), "text");
  assert.match(p, /visszajelzés MAGYARUL/);
  assert.match(p, /magyar nyelvű indoklás/);
  assert.match(p, /magyar diákokat értékel/);
});

test("angol visszajelzés: a diák-szöveg és a magyarázatok angolul kértek", () => {
  const p = t.ertekelesPrompt(feladat("en"), "text");
  assert.match(p, /visszajelzés ANGOLUL/);
  assert.match(p, /angol nyelvű indoklás/);
  assert.doesNotMatch(p, /MAGYARUL/, "angol kérésnél sehol sem szabad MAGYARUL-t kérni");
  assert.doesNotMatch(p, /magyar nyelvű/);
  assert.doesNotMatch(p, /magyar diákokat/, "a diákok nem feltétlenül magyarok");
});

test("ismeretlen kimeneti nyelv magyarra esik vissza, nem találunk ki újat", () => {
  const p = t.ertekelesPrompt(feladat("fr"), "text");
  assert.match(p, /visszajelzés MAGYARUL/);
});

test("rubrika-javaslat: a szempontcímek és a leírás a kért nyelven", () => {
  assert.match(t.rubrikaPrompt("angol"), /magyar címekkel/);
  assert.match(t.rubrikaPrompt("angol", "hu"), /magyar címekkel/);
  const en = t.rubrikaPrompt("angol", "en");
  assert.match(en, /angol címekkel/);
  assert.match(en, /foglald össze angolul/);
  assert.doesNotMatch(en, /magyar címekkel|foglald össze magyarul/);
});

test("osztályelemzés: az összegzés, a címek és az instrukció a kért nyelven", () => {
  const agg = { ertekelt_db: 5, atlag_szazalek: 70, szempontok: [], cimkek: [], hibaMinta: [] };
  const hu = t.elemzesPrompt(feladat(undefined), agg);
  assert.match(hu, /a tanárnak, magyarul/);
  assert.match(hu, /Egy magyar\s+osztály/);
  const en = t.elemzesPrompt(feladat("en"), agg);
  assert.match(en, /a tanárnak, angolul/);
  assert.match(en, /A "cim" angolul/);
  assert.match(en, /Az instrukciót angolul írd/);
  assert.doesNotMatch(en, /magyarul|magyar\s+osztály/);
});

test("kifejtős dolgozat: értékelés és elemzés a kért nyelven", () => {
  const kulcs = kf.kulcsEllenorzes({ kerdesek: [{ sorszam: "1", tipus: "magyarazat", max_pont: 1,
    elemek: [{ id: "e1", allitas: "x", pont: 1 }] }] });
  const f = (k) => ({ cim: "T", rubrika: { mod: "kifejtos", ...(k ? { kimeneti_nyelv: k } : {}) } });
  const valaszok = new Map([["1", "válasz"]]);

  assert.match(kf.kifejtosErtekelesPrompt(f(), kulcs, valaszok), /visszajelzés MAGYARUL/);
  const en = kf.kifejtosErtekelesPrompt(f("en"), kulcs, valaszok);
  assert.match(en, /visszajelzés ANGOLUL/);
  assert.match(en, /a tanárnak, angolul/);
  assert.doesNotMatch(en, /MAGYARUL|magyarul/);

  const kfAgg = kf.kifejtosAggregalas(kulcs, []);
  const alap = { ertekelt_db: 0, atlag_szazalek: null };
  assert.match(kf.kifejtosElemzesPrompt(f(), alap, kfAgg, []), /a tanárnak, magyarul/);
  const elemzesEn = kf.kifejtosElemzesPrompt(f("en"), alap, kfAgg, []);
  assert.match(elemzesEn, /a tanárnak, angolul/);
  assert.doesNotMatch(elemzesEn, /magyarul/);
});

// ── kódolt szerverhibák ──

test("hiba(): a magyar üzenet a régi, és a details.kod ott van", () => {
  const e = t.hiba("not-found", "beadas_nincs");
  assert.equal(e.message, "A beadás nem található.");
  assert.equal(e.code, "not-found");
  assert.equal(e.details.kod, "beadas_nincs");

  const p = t.hiba("failed-precondition", "statusz_nem_kuldheto", { statusz: "feltoltve" });
  assert.equal(p.message, "Ebben az állapotban nem küldhető el: feltoltve");
  assert.equal(p.details.statusz, "feltoltve");
});

test("hibaAtvezet(): a kulcs-hiba és a kódolt hiba kódja nem vész el", () => {
  let kulcsHiba;
  try { kf.kulcsEllenorzes({ kerdesek: [] }); } catch (e) { kulcsHiba = e; }
  const a = t.hibaAtvezet("failed-precondition", kulcsHiba);
  assert.equal(a.details.kod, "kulcshiba");
  assert.equal(a.details.kulcsKod, "nincs_kerdes");
  assert.equal(a.message, kulcsHiba.message);

  let nemFeladatlap;
  try { kf.kulcsJavaslatTisztitas({ nem_feladatlap: true }, false); } catch (e) { nemFeladatlap = e; }
  assert.equal(t.hibaAtvezet("failed-precondition", nemFeladatlap).details.kod, "nem_feladatlap");
  assert.equal(t.hibaAtvezet("failed-precondition", nemFeladatlap).message, kf.NEM_FELADATLAP_UZENET);

  const sima = t.hibaAtvezet("invalid-argument", new Error("valami"));
  assert.equal(sima.details, undefined);

  const belso = t.belsoHiba(new Error("Gemini (x): HTTP 500"), "ai_hiba");
  assert.equal(belso.details.kod, "ai_hiba");
  assert.equal(belso.details.reszlet, "Gemini (x): HTTP 500");
});

test("a pontszám-hiba kódot és paramétereket kap, a magyar üzenet változatlan", () => {
  let hiba;
  try {
    t.pontTablazat(
      { szempontok: [{ kulcs: "a", pont: 1, max: 5 }] },
      { szempontok: [{ kulcs: "a", cim: "Tartalom" }] },
      [{ kulcs: "a", pont: 9 }]
    );
  } catch (e) { hiba = e; }
  assert.equal(hiba.message, "Érvénytelen pontszám – Tartalom: 0 és 5 között lehet.");
  assert.equal(hiba.kod, "pont_hatar");
  assert.deepEqual(hiba.parameterek, { cim: "Tartalom", max: 5 });
});

test("minden szerver-hibakódhoz van szöveg mindkét nyelven, és nincs árva kulcs", async () => {
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const kifejtosForras = readFileSync(new URL("../functions/kifejtos.js", import.meta.url), "utf8");
  const { SZOTARAK } = await import("../public/js/i18n.js");

  const hasznalt = new Set([
    ...[...forras.matchAll(/\bhiba\(\s*"[a-z-]+",\s*"(\w+)"/g)].map((m) => m[1]),
    ...[...forras.matchAll(/\bkod: "(\w+)"/g)].map((m) => m[1]),                 // pont_hatar
    ...[...kifejtosForras.matchAll(/\{ kod: "(\w+)" \}/g)].map((m) => m[1]),    // nem_feladatlap…
    ...[...forras.matchAll(/belsoHiba\(e, "(\w+)"\)/g)].map((m) => m[1]),
    "szerver_hiba"                                                               // belsoHiba alapértéke
  ]);
  // A "kulcshiba" külön szótári család (kulcshiba.*)
  hasznalt.delete("kulcshiba");
  assert.ok(hasznalt.size >= 38, `túl kevés hibakód található (${hasznalt.size}) – a teszt regex elavult?`);

  for (const kod of hasznalt) {
    for (const nyelv of Object.keys(SZOTARAK)) {
      assert.ok(SZOTARAK[nyelv][`szerver.${kod}`], `${nyelv}: hiányzik a szerver.${kod}`);
    }
  }
  const szotarKodok = Object.keys(SZOTARAK.hu)
    .filter((k) => k.startsWith("szerver.")).map((k) => k.slice(8));
  const arva = szotarKodok.filter((k) => !hasznalt.has(k));
  assert.deepEqual(arva, [], "szótári szerver.* kulcs, amit a szerver nem használ");

  // a HIBA_SZOVEG táblázat és a használt kódok egyezése
  for (const kod of Object.keys(t.HIBA_SZOVEG)) {
    assert.ok(hasznalt.has(kod), `HIBA_SZOVEG.${kod}: nincs rá hívás`);
  }
});
