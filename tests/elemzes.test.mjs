// ══════════════════════════════════════════════════════
// Osztályszintű elemzés – aggregálás
//
// A számokat kód számolja, nem a modell. Ezért itt tesztelhető is –
// és tesztelni KELL, mert egy elrontott átlag hibátlan kinézetű,
// mégis hamis képet ad a tanárnak az osztályáról.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-elemzes-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let agg, prompt;

before(() => {
  const t = require("./index.js")._teszt;
  agg = t.elemzesAggregalas;
  prompt = t.elemzesPrompt;
});

/** Egy értékelés, ahogy az ertekeles/ai dokumentum kinéz. */
const ert = (diak_id, szazalek, szempontok, hibak, olvashatosag = "jo") =>
  ({ diak_id, szazalek, szempontok, hibak, olvashatosag });

// ══════════════════════════════════════════
// ÁTLAGOK
// ══════════════════════════════════════════

test("osztályátlag a százalékok átlaga, kerekítve", () => {
  const r = agg([
    ert("d1", 80, [], []),
    ert("d2", 60, [], []),
    ert("d3", 71, [], [])
  ]);
  assert.equal(r.ertekelt_db, 3);
  assert.equal(r.atlag_szazalek, 70);   // (80+60+71)/3 = 70.33 → 70
});

test("hiányzó százalék esetén null, nem NaN", () => {
  const r = agg([ert("d1", undefined, [], [])]);
  assert.equal(r.atlag_szazalek, null);
});

test("szempontátlagok szempontonként, a legrosszabb elöl", () => {
  const r = agg([
    ert("d1", 50, [{ kulcs: "nyelvtan", pont: 10, max: 20 }, { kulcs: "tartalom", pont: 18, max: 20 }], []),
    ert("d2", 50, [{ kulcs: "nyelvtan", pont: 6, max: 20 }, { kulcs: "tartalom", pont: 16, max: 20 }], [])
  ]);

  assert.equal(r.szempontok.length, 2);
  // nyelvtan: (10+6)/2 = 8 / 20 = 40%  → ez a rosszabb, elöl kell lennie
  assert.equal(r.szempontok[0].kulcs, "nyelvtan");
  assert.equal(r.szempontok[0].atlag_pont, 8);
  assert.equal(r.szempontok[0].max_pont, 20);
  assert.equal(r.szempontok[0].szazalek, 40);
  // tartalom: (18+16)/2 = 17 / 20 = 85%
  assert.equal(r.szempontok[1].kulcs, "tartalom");
  assert.equal(r.szempontok[1].szazalek, 85);
});

// ══════════════════════════════════════════
// HIBASZÁMLÁLÁS
// ══════════════════════════════════════════

test("kategória szerint számol darabot ÉS érintett diákot", () => {
  const r = agg([
    ert("d1", 50, [], [
      { kategoria: "nyelvtan", tipus: "past_simple", idezet: "a", javaslat: "b" },
      { kategoria: "nyelvtan", tipus: "article", idezet: "c", javaslat: "d" }
    ]),
    ert("d2", 50, [], [
      { kategoria: "nyelvtan", tipus: "past_simple", idezet: "e", javaslat: "f" }
    ])
  ]);

  const nyelvtan = r.kategoriak.find((k) => k.kategoria === "nyelvtan");
  assert.equal(nyelvtan.db, 3, "három hiba összesen");
  assert.equal(nyelvtan.erintett_diak, 2, "két diáknál");
});

test("ugyanaz a diák kétszer is hibázhat, de csak egy érintettnek számít", () => {
  const r = agg([
    ert("d1", 50, [], [
      { kategoria: "szokincs", tipus: "x", idezet: "1", javaslat: "2" },
      { kategoria: "szokincs", tipus: "x", idezet: "3", javaslat: "4" }
    ])
  ]);
  const c = r.cimkek[0];
  assert.equal(c.db, 2);
  assert.equal(c.erintett_diak, 1);
});

test("a címkék gyakoriság szerint csökkenően rendezve", () => {
  const r = agg([
    ert("d1", 50, [], [{ kategoria: "nyelvtan", tipus: "ritka", idezet: "a", javaslat: "b" }]),
    ert("d2", 50, [], [{ kategoria: "nyelvtan", tipus: "gyakori", idezet: "c", javaslat: "d" }]),
    ert("d3", 50, [], [{ kategoria: "nyelvtan", tipus: "gyakori", idezet: "e", javaslat: "f" }])
  ]);
  assert.equal(r.cimkek[0].tipus, "gyakori");
  assert.equal(r.cimkek[0].db, 2);
});

test("olvashatóság összesítve", () => {
  const r = agg([
    ert("d1", 50, [], [], "jo"),
    ert("d2", 50, [], [], "gyenge"),
    ert("d3", 50, [], [], "gyenge")
  ]);
  assert.deepEqual(r.olvashatosag, { jo: 1, kozepes: 0, gyenge: 2 });
});

test("üres és hiányos értékelések nem buktatják el", () => {
  const r = agg([{ diak_id: "d1" }, ert("d2", 50, [], [])]);
  assert.equal(r.ertekelt_db, 2);
  assert.equal(r.kategoriak.length, 0);
  assert.equal(r.szempontok.length, 0);
});

// ══════════════════════════════════════════
// A PROMPT
// ══════════════════════════════════════════

const feladat = {
  cim: "Essay – My hometown",
  rubrika: { nyelv: "német", tipus: "esszé", szint: "B1", feladat_leiras: "Írj a városodról." }
};

test("a prompt tartalmazza a számokat és a nyelvet", () => {
  const a = agg([
    ert("d1", 70, [{ kulcs: "nyelvtan", pont: 10, max: 20 }], [
      { kategoria: "nyelvtan", tipus: "dativ_falsch", idezet: "mit der Haus", javaslat: "mit dem Haus" }
    ])
  ]);
  const p = prompt(feladat, a);

  assert.match(p, /tapasztalt némettanár/);
  assert.match(p, /Kiértékelt dolgozat: 1/);
  assert.match(p, /Osztályátlag: 70%/);
  assert.match(p, /nyelvtan: 10\/20 \(50%\)/);
  assert.match(p, /mit der Haus/, "a konkrét idézet is menjen át");
  assert.match(p, /dativ_falsch/);
});

test("a prompt figyelmeztet a címkék elcsúszására", () => {
  const p = prompt(feladat, agg([ert("d1", 50, [], [])]));
  assert.match(p, /ELCSÚSZHATNAK/);
  assert.match(p, /JELENTÉS szerint vond össze/);
});

test("a prompt kéri a kevés adat jelzését", () => {
  const p = prompt(feladat, agg([ert("d1", 50, [], [])]));
  assert.match(p, /3-nál kevesebb/);
});

test("a generált feladatok nyelve a rubrikából jön", () => {
  const p = prompt(feladat, agg([ert("d1", 50, [], [])]));
  assert.match(p, /generált\s+feladatok nyelve német legyen/);
});

test("nyelv nélküli feladat angolként elemződik", () => {
  const p = prompt({ cim: "Régi", rubrika: { tipus: "esszé" } }, agg([ert("d1", 50, [], [])]));
  assert.match(p, /tapasztalt angoltanár/);
});
