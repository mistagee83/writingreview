// ══════════════════════════════════════════════════════
// Érettségi feladattár – a tartalombetöltő és az átalakítás (functions/feladattar.js), emulátor nélkül.
// A tests/fixtures/feladattar/erettsegi/ mintái a terv 4. fejezetének formátumában készültek (kézzel,
// a valódi kinyerésig; a 2024. májusi a terv példája, a többi kitalált szöveg).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.GCLOUD_PROJECT = "wr-feladattar-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const ft = require("./feladattar.js");
const kredit = require("./kredit.js");
const { _teszt: t } = require("./index.js");

const FIXTURE = fileURLToPath(new URL("./fixtures/feladattar/erettsegi", import.meta.url));
const tar = () => ft.betoltes(FIXTURE);

test("a betöltő a mintamappát olvassa: öt feladat, négy sablon, hiba nélkül; a sorrend: legújabb év elöl", () => {
  const t0 = tar();
  assert.deepEqual(t0.hibak, []);
  assert.equal(t0.feladatsorok.length, 3);
  assert.deepEqual([...t0.sablonok.keys()].sort(), [...ft.SABLON_IDK].sort());
  assert.deepEqual(ft.lista(t0).map((f) => f.id),
    ["2024-maj-kozep-W2", "2023-okt-emelt-W1", "2023-okt-emelt-W2", "2006-febr-kozep-W1", "2006-febr-kozep-W2"]);
});

test("a négy sablon pontösszege a terv szerint 11, 22, 15, 15", () => {
  const s = tar().sablonok;
  assert.deepEqual(ft.SABLON_IDK.map((id) => ft.pontOsszeg(s.get(id))), [11, 22, 15, 15]);
});

test("az útvonal állítható: FELADATTAR_KONYVTAR, és a hiányzó mappa üres tárat ad (a kinyerés előtt)", () => {
  assert.equal(ft.konyvtar("x"), "x");
  const regi = process.env.FELADATTAR_KONYVTAR;
  process.env.FELADATTAR_KONYVTAR = "/valahol";
  try { assert.equal(ft.konyvtar(), "/valahol"); } finally {
    if (regi === undefined) delete process.env.FELADATTAR_KONYVTAR; else process.env.FELADATTAR_KONYVTAR = regi;
  }
  assert.match(ft.konyvtar(), /feladattar[\\/]erettsegi$/);
  const ures = ft.betoltes(join(tmpdir(), "nincs-ilyen-feladattar-mappa"));
  assert.equal(ures.feladatok.size, 0);
  assert.deepEqual(ft.lista(ures), []);
});

test("a hibás fájl és feladat kimarad (a hibalistában), a többi betöltődik; sablon nélkül nincs feladat", () => {
  const dir = mkdtempSync(join(tmpdir(), "wr-tar-"));
  copyFileSync(join(FIXTURE, "2024-maj-kozep.json"), join(dir, "2024-maj-kozep.json"));
  writeFileSync(join(dir, "rossz.json"), "{ nem json");
  const regi = JSON.parse(readFileSync(join(FIXTURE, "2023-okt-emelt.json"), "utf8"));
  regi.feladatok[1].sablon = "nincs-ilyen";
  writeFileSync(join(dir, "2023-okt-emelt.json"), JSON.stringify(regi));
  writeFileSync(join(dir, "2099-maj-kozep.json"), JSON.stringify({ ...regi, formatum_verzio: 2 }));
  let t1 = ft.betoltes(dir);
  // sablonok.json nélkül egyik feladat sem készíthető el
  assert.equal(t1.feladatok.size, 0);
  assert.ok(t1.hibak.some((h) => h.includes("rossz.json")));
  assert.ok(t1.hibak.some((h) => h.includes("formatum_verzio")));
  assert.ok(t1.hibak.some((h) => h.includes("2023-okt-emelt-W2")));
  copyFileSync(join(FIXTURE, "sablonok.json"), join(dir, "sablonok.json"));
  ft.gyorsitotarUrites();
  t1 = ft.betoltes(dir);
  assert.deepEqual([...t1.feladatok.keys()].sort(), ["2023-okt-emelt-W1", "2024-maj-kozep-W2"]);
});

test("a leírás: helyzet, bemeneti szöveg (cím, bekezdések, forrás), teendő + irányító szempontok, kezdés", () => {
  const f = tar().feladatok.get("2024-maj-kozep-W2").feladat;
  const l = ft.leirasEpites(f);
  const reszek = l.split("\n\n");
  assert.equal(reszek[0], f.helyzet);
  assert.ok(l.includes(f.bemenet.bekezdesek[0]) && l.includes(f.bemenet.bekezdesek[3]));
  assert.ok(l.includes(`${f.teendo}\n– of teenagers dying their hair,\n– of his mother's opinion,`));
  assert.ok(l.endsWith("Begin like this: Hi,"));
  // a sorrend: helyzet < bemenet < teendő < kezdés
  const hol = (x) => l.indexOf(x);
  assert.ok(hol(f.helyzet) < hol(f.bemenet.bekezdesek[0]) && hol(f.bemenet.bekezdesek[3]) < hol(f.teendo)
    && hol(f.teendo) < hol("Begin like this"));

  const hirdetes = ft.leirasEpites(tar().feladatok.get("2023-okt-emelt-W1").feladat);
  assert.match(hirdetes, /\n\nVolunteers wanted\n\n/);
  assert.match(hirdetes, /\(Source: https:\/\/example\.org\/teszt-forras\)/);
  assert.ok(!hirdetes.includes("Begin like this"), "kezdés nélkül nincs kezdősor");

  // bemenet nélkül, „about N words” szószámmal: a szószám a leírásban látszik
  const cikk = ft.leirasEpites(tar().feladatok.get("2023-okt-emelt-W2").feladat);
  assert.ok(cikk.endsWith("(about 200 words)"));
  assert.equal(cikk.split("\n\n").length, 3);
});

test("a létrehozandó feladat: a sablon szempontjai, a feladat saját típusa és szószáma, leírás, eredetjelző", () => {
  const a = ft.feladatAdat(tar(), "2024-maj-kozep-W2");
  assert.equal(a.cim, "Email to Pavel about his girlfriend's blue hair");
  const r = a.rubrika;
  assert.equal(r.nyelv, "angol");
  assert.equal(r.szint, "B1");
  assert.equal(r.tipus, "levél", "a feladat típusa felülírja a sablonét (esszé)");
  assert.equal(r.min_szo, 100);
  assert.equal(r.max_szo, 120);
  assert.deepEqual(r.szempontok.map((s) => [s.kulcs, s.suly]),
    [["feladat", 6], ["hangnem", 2], ["szovegalkotas", 4], ["szokincs", 5], ["nyelvhelyesseg", 5]]);
  assert.ok(r.egyeb_utasitas.length > 0);
  assert.equal(r.feladat_leiras, ft.leirasEpites(tar().feladatok.get("2024-maj-kozep-W2").feladat));
  assert.deepEqual(r.tar, { id: "2024-maj-kozep-W2", verzio: 1 });
  assert.equal(r.helyesiras_engedett, false);
  // a jegyskálát és a visszajelzés nyelvét a tanár választja az űrlapon
  assert.equal(r.skala, undefined);
  assert.equal(r.kimeneti_nyelv, undefined);
  // csak „about N words”: nincs kitalált szószám (és nem a sablon 2026-os értéke)
  const cikk = ft.feladatAdat(tar(), "2023-okt-emelt-W2").rubrika;
  assert.equal(cikk.min_szo, null);
  assert.equal(cikk.max_szo, null);
  assert.equal(cikk.tipus, "esszé");
  assert.equal(ft.feladatAdat(tar(), "nincs-ilyen"), null);
});

test("a lista nem hozza a bemeneti szöveget; az előnézet a diáknak szóló részt és a sablon pontjait adja", () => {
  const l = ft.lista(tar()).find((f) => f.id === "2024-maj-kozep-W2");
  assert.deepEqual(Object.keys(l).sort(), ["cim", "eredeti_jeloles", "ev", "feladatsor_id", "helyzet", "id", "idoszak",
    "mufaj", "sablon", "sorszam", "szint", "szoszam", "tipus"]);
  const e = ft.elonezet(tar(), "2024-maj-kozep-W2");
  assert.equal(e.bemenet.bekezdesek.length, 4);
  assert.equal(e.kezdes, "Hi,");
  assert.equal(e.sablon_adat.pont, 22);
  assert.equal(e.sablon_adat.szempontok.length, 5);
  assert.ok(!("egyeb_utasitas" in e.sablon_adat), "az AI-kérés nem megy ki az előnézetben");
  assert.equal(ft.elonezet(tar(), "nincs-ilyen"), null);
});

test("az érettségi sablon a sablonlistához: a mostani rubrika-alak, feladatleírás és eredetjelző nélkül", () => {
  const s = ft.sablonKimenet(tar().sablonok.get("emelt-level"));
  assert.equal(s.pont, 15);
  assert.deepEqual(Object.keys(s.rubrika).sort(), ["egyeb_utasitas", "max_szo", "min_szo", "nyelv", "szempontok", "szint", "tipus"]);
});

test("Hub pass: az erettsegi_tar a zárt funkciók között; hibakódok mindkét szótárban", async () => {
  assert.ok(kredit.HUB_PASS_FUNKCIOK.includes("erettsegi_tar"));
  const hu = (await import("../public/js/i18n-hu.js")).default;
  const en = (await import("../public/js/i18n-en.js")).default;
  for (const kod of ["erettsegi_tar_hub_pass_kell", "tar_feladat_id_kell", "tar_feladat_nincs"]) {
    assert.ok(t.HIBA_SZOVEG[kod], kod);
    assert.ok(hu[`szerver.${kod}`] && en[`szerver.${kod}`], kod);
  }
  // a sablonlista és a tár megjelenített sablonnevei
  for (const id of ft.SABLON_IDK) {
    const k = `tar.sablon_${id.replace(/-/g, "_")}`;
    assert.ok(hu[k] && en[k], k);
  }
  for (const i of ft.IDOSZAKOK) assert.ok(hu[`tar.idoszak_${i}`] && en[`tar.idoszak_${i}`], i);
});

test("a feladat-űrlap megőrzi a rubrika.tar mezőt szerkesztéskor és másoláskor, és megnyitja a ?szerkeszt= feladatot", () => {
  const html = readFileSync(new URL("../public/feladatok.html", import.meta.url), "utf8");
  assert.match(html, /betoltottTar = f\.rubrika\?\.tar \|\| null;/);
  assert.match(html, /if \(betoltottTar && mod !== 'uj'\) rubrika\.tar = betoltottTar;/);
  assert.match(html, /get\('szerkeszt'\)/);
  // az érettségi sablon nem törölhető és nem írható felül
  assert.match(html, /disabled = !sb \|\| sb\.erettsegi/);
  const tarHtml = readFileSync(new URL("../public/feladattar.html", import.meta.url), "utf8");
  assert.match(tarHtml, /feladatok\.html\?szerkeszt=\$\{encodeURIComponent\(data\.feladatId\)\}/);
  assert.match(tarHtml, /'erettsegi_tar_hub_pass_kell'/);
  assert.match(readFileSync(new URL("../public/js/nav.js", import.meta.url), "utf8"), /feladattar\.html/);
});
