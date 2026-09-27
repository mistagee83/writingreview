// ══════════════════════════════════════════════════════
// Szintkezelés – a mérce, amihez az AI értékel
//
// Miért külön teszt: ha a szint elcsúszik, a rendszer TOVÁBBRA IS
// működik. Nem hibát ad, hanem csendben rossz mércéhez pontoz – egy
// magyar dolgozatot "B1 szinthez" mér, ami anyanyelvnél értelmetlen és
// felfelé tolja a pontokat. Ez a fajta hiba csak teszttel látszik.
//
// A konkrét eset, ami miatt ez a fájl megszületett: a rubrika-séma
// KÖTELEZŐVÉ tette a szintet CEFR enum-mal, tehát a strukturált kimenet
// arra kényszerítette a modellt, hogy magyar feladatlapra is találjon ki
// egy CEFR-szintet – és az értékelés utána ahhoz mért.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

process.env.GCLOUD_PROJECT = "wr-szint-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let t;

before(() => {
  t = require("./index.js")._teszt;
});

const feladat = (nyelv, szint) => ({
  cim: "Teszt feladat",
  rubrika: {
    nyelv,
    tipus: "esszé",
    ...(szint === undefined ? {} : { szint }),
    szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvhelyesség", suly: 50 }]
  }
});

const agg = {
  ertekelt_db: 5,
  atlag_szazalek: 62,
  szempontok: [{ kulcs: "nyelvtan", atlag_pont: 31, max_pont: 50, szazalek: 62 }],
  cimkek: [],
  hibaMinta: []
};

// ══════════════════════════════════════════
// szintInfo() – mit írunk a promptba
// ══════════════════════════════════════════

test("szint nélkül nincs mit a promptba írni", () => {
  assert.equal(t.szintInfo(undefined), null);
  assert.equal(t.szintInfo({}), null);
  assert.equal(t.szintInfo({ nyelv: "angol", szint: null }), null);
  assert.equal(t.szintInfo({ nyelv: "angol", szint: "" }), null);
  assert.equal(t.szintInfo({ nyelv: "angol", szint: "   " }), null);
});

test("idegen nyelvnél a szint CEFR-címkét kap", () => {
  const sz = t.szintInfo({ nyelv: "német", szint: "B2" });
  assert.deepEqual(sz, { cimke: "Célszint (CEFR)", ertek: "B2", anyanyelv: false });
});

test("magyarnál a szint évfolyam, nem CEFR", () => {
  const sz = t.szintInfo({ nyelv: "magyar", szint: "9-10. évfolyam" });
  assert.deepEqual(sz, {
    cimke: "Évfolyam",
    ertek: "9-10. évfolyam",
    anyanyelv: true
  });
});

test("magyar szint nélkül is null – nem talál ki évfolyamot", () => {
  assert.equal(t.szintInfo({ nyelv: "magyar" }), null);
});

test("anyanyelvu(): a magyar az, a többi nem", () => {
  assert.equal(t.anyanyelvu({ nyelv: "magyar" }), true);
  for (const ny of t.NYELVEK.filter((n) => n !== "magyar")) {
    assert.equal(t.anyanyelvu({ nyelv: ny }), false, `${ny} nem anyanyelv`);
  }
  // Régi adat nyelv nélkül = angol = idegen nyelv
  assert.equal(t.anyanyelvu({}), false);
});

// ══════════════════════════════════════════
// szintSzures() – az AI válaszának szűrése
// ══════════════════════════════════════════

test("magyar dolgozatra a CEFR-szintet ELDOBJUK", () => {
  // Ez volt a valódi hiba: a séma kikényszerítette a "B1"-et, és
  // az értékelés utána ahhoz mért egy anyanyelvi dolgozatot.
  assert.equal(t.szintSzures("magyar", "B1"), null);
  assert.equal(t.szintSzures("magyar", "C1"), null);
});

test("idegen nyelvre az évfolyamot eldobjuk", () => {
  assert.equal(t.szintSzures("angol", "9-10. évfolyam"), null);
});

test("a saját skálán lévő szint átmegy", () => {
  for (const sz of t.CEFR_SZINTEK) {
    assert.equal(t.szintSzures("angol", sz), sz, `${sz} nem ment át`);
  }
  for (const sz of t.EVFOLYAMOK) {
    assert.equal(t.szintSzures("magyar", sz), sz, `${sz} nem ment át`);
  }
});

test("üres és hiányzó szintből null lesz, nem üres string", () => {
  // A null a Firestore-ban "nincs mérce"; az üres string csak zaj,
  // és a `szint || ...` mintákban ugyanúgy hamis, de kiírva látszik.
  assert.equal(t.szintSzures("angol", ""), null);
  assert.equal(t.szintSzures("angol", null), null);
  assert.equal(t.szintSzures("angol", undefined), null);
  assert.equal(t.szintSzures("magyar", "  "), null);
});

test("kitalált szintet nem fogad el", () => {
  assert.equal(t.szintSzures("angol", "C2"), null);
  assert.equal(t.szintSzures("angol", "középfok"), null);
  assert.equal(t.szintSzures("magyar", "8. osztály"), null);
});

// ══════════════════════════════════════════
// A rubrika sémája – a strukturált kimenet kényszere
// ══════════════════════════════════════════

test("a szint NEM kötelező mező", () => {
  // Kötelező enum mellett a modellnek választania KELL egyet, akkor is,
  // ha a feladatlapból semmi nem utal szintre.
  for (const ny of ["angol", "magyar"]) {
    const s = t.rubrikaSchema(ny);
    assert.equal(s.required.includes("szint"), false, `${ny}: kötelező maradt`);
  }
});

test("a séma szint-enumja nyelvfüggő", () => {
  assert.deepEqual(t.rubrikaSchema("angol").properties.szint.enum, t.CEFR_SZINTEK);
  assert.deepEqual(t.rubrikaSchema("német").properties.szint.enum, t.CEFR_SZINTEK);
  assert.deepEqual(t.rubrikaSchema("magyar").properties.szint.enum, t.EVFOLYAMOK);
});

test("a séma többi kötelező mezője megmaradt", () => {
  const s = t.rubrikaSchema("angol");
  for (const mezo of ["cim_javaslat", "nyelv", "tipus", "szempontok", "feladat_leiras"]) {
    assert.ok(s.required.includes(mezo), `${mezo} kiesett a kötelezők közül`);
  }
  assert.deepEqual(s.properties.nyelv.enum, t.NYELVEK);
});

// ══════════════════════════════════════════
// Az értékelés promptja – itt dől el a pontozás
// ══════════════════════════════════════════

test("idegen nyelvnél a CEFR-mérce változatlan", () => {
  const p = t.ertekelesPrompt(feladat("angol", "B1"), "My holiday was great.");
  assert.match(p, /Célszint \(CEFR\): B1/);
  assert.match(p, /A B1 szinthez mérj, ne anyanyelvi szinthez/);
});

test("magyar dolgozatnál NEM mondjuk, hogy ne anyanyelvi szinthez mérjen", () => {
  // A diáknak ez az anyanyelve – ez az utasítás felfelé tolja a pontokat.
  const p = t.ertekelesPrompt(feladat("magyar", "9-10. évfolyam"), "A szülőföldem.");
  assert.equal(
    /ne anyanyelvi szinthez/.test(p), false,
    "anyanyelvi dolgozatra nem-anyanyelvi mércét ad"
  );
  assert.match(p, /ANYANYELVI dolgozat/);
  assert.match(p, /Évfolyam: 9-10\. évfolyam/);
  assert.equal(/Célszint/.test(p), false, "CEFR-címke anyanyelvi dolgozaton");
});

test("szint nélkül a prompt nem ír szintet, és megtiltja a kitalálást", () => {
  const p = t.ertekelesPrompt(feladat("angol"), "Some text.");
  assert.equal(/Célszint \(CEFR\)/.test(p), false, "kiírja a szint sort szint nélkül");
  assert.equal(/Évfolyam:/.test(p), false);
  assert.match(p, /nem adott meg célszintet/);
  assert.match(p, /ne találj ki/);
});

test("magyar + szint nélkül: sem CEFR, sem kitalált évfolyam", () => {
  const p = t.ertekelesPrompt(feladat("magyar"), "Valami szöveg.");
  assert.match(p, /nem adott meg évfolyamot/);
  assert.match(p, /ne CEFR-skálán gondolkodj/);
  assert.equal(/ne anyanyelvi szinthez/.test(p), false);
});

test("a szint egyetlen nyelven sem szivárog be 'nincs megadva'-ként", () => {
  // A "nincs megadva" felirat is bátorítás: az AI kitölti magának.
  for (const ny of t.NYELVEK) {
    const p = t.ertekelesPrompt(feladat(ny), "minta");
    assert.equal(
      /(Célszint|Évfolyam).*nincs megadva/.test(p), false,
      `${ny}: "nincs megadva" szintet ír ki`
    );
  }
});

// ══════════════════════════════════════════
// A rubrika-javaslat promptja
// ══════════════════════════════════════════

test("magyar feladatlapnál évfolyamot kér, nem CEFR-t", () => {
  const p = t.rubrikaPrompt("magyar");
  assert.match(p, /ÉVFOLYAMNAK szól/);
  assert.match(p, /CEFR-szintet NE adj meg/);
  assert.equal(/Milyen CEFR-szintet céloz/.test(p), false);
});

test("idegen nyelvnél CEFR-szintet kér", () => {
  const p = t.rubrikaPrompt("német");
  assert.match(p, /Milyen CEFR-szintet céloz/);
  assert.equal(/ÉVFOLYAMNAK/.test(p), false);
});

test("minden nyelvnél engedi üresen hagyni a szintet", () => {
  for (const ny of t.NYELVEK) {
    const p = t.rubrikaPrompt(ny);
    assert.match(p, /HAGYD ÜRESEN/, `${ny}: nem engedi üresen`);
  }
});

test("a 'józan alapértelmezés' nem terjed ki a szintre", () => {
  // E nélkül a prompt vége felülírja a fenti utasítást.
  for (const ny of t.NYELVEK) {
    const p = t.rubrikaPrompt(ny);
    assert.match(p, /KIVÉVE a szintet/, `${ny}: a szintre is tippel`);
  }
});

// ══════════════════════════════════════════
// Az osztályszintű elemzés promptja
// ══════════════════════════════════════════

test("az elemzés is évfolyamot ír magyarnál", () => {
  const p = t.elemzesPrompt(feladat("magyar", "11-12. évfolyam"), agg);
  assert.match(p, /Évfolyam: 11-12\. évfolyam/);
  assert.equal(/Célszint/.test(p), false);
});

test("az elemzés szint nélkül nem kér szintet a generáló promptba", () => {
  const nelkul = t.elemzesPrompt(feladat("angol"), agg);
  assert.equal(/Célszint \(CEFR\)/.test(nelkul), false);
  assert.equal(/a szintet/.test(nelkul), false, "nem létező szintet kér a promptba");

  const szinttel = t.elemzesPrompt(feladat("angol", "B2"), agg);
  assert.match(szinttel, /Célszint \(CEFR\): B2/);
  assert.match(szinttel, /a szintet/);
});

// ══════════════════════════════════════════
// Kliens ↔ szerver egyezés
//
// A szint-listák a feladatok.html-ben is szerepelnek (a select
// feltöltéséhez). Ha elcsúsznak, a tanár olyan értéket választ, amit a
// szerver csendben eldob – a szint eltűnik, és senki nem tudja, miért.
// ══════════════════════════════════════════

test("a kliens szint-listái egyeznek a szerverrel", () => {
  const html = readFileSync(new URL("../public/feladatok.html", import.meta.url), "utf8");

  for (const sz of [...t.CEFR_SZINTEK, ...t.EVFOLYAMOK]) {
    assert.ok(
      html.includes(`'${sz}'`),
      `a feladatok.html nem ajánlja fel: ${sz}`
    );
  }
  for (const ny of t.ANYANYELVEK) {
    assert.ok(
      html.includes(`ANYANYELVEK = ['${ny}']`) || html.includes(`'${ny}'`),
      `a kliens nem tudja, hogy a ${ny} anyanyelv`
    );
  }
});
