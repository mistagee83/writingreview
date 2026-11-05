// ══════════════════════════════════════════════════════
// beadas.html – a beadási felület a script VÉGÉN jelenik meg
//
// Hiba volt (v1.10.0 – 2026-11-05): a „van-e már beadásom?” döntés a script közepén
// hívta a beadasiFelulet()-et, a BEADASI_MOD és társai (const) csak utána jöttek létre.
// A hívás ReferenceError-ral elszállt („Cannot access 'BEADASI_MOD' before
// initialization”), így a diák sem fotós, sem beírós felületet nem látott – egyetlen
// új beadásnál sem. A teszt azt ellenőrzi, hogy a hívás minden legfelső szintű
// const/let deklaráció után van.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/beadas.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test("beadas.html: a beadasiFelulet() hívása minden legfelső szintű const/let után van", () => {
  // A modul legfelső szintje 2 szóközzel van behúzva.
  const hivas = [...script.matchAll(/^\s+beadasiFelulet\(\);/gm)];
  assert.equal(hivas.length, 1, "pontosan egy beadasiFelulet() hívás legyen");
  const hivasHely = hivas[0].index;

  const deklaraciok = [...script.matchAll(/^ {2}(?:const|let)\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)/gm)];
  assert.ok(deklaraciok.length > 5, "a deklarációk felismerése elromlott");
  const kesobbi = deklaraciok.filter((d) => d.index > hivasHely).map((d) => d[0].trim());
  assert.deepEqual(kesobbi, [],
    `a beadasiFelulet() hívása után még deklaráció jön (TDZ-hiba): ${kesobbi.join(", ")}`);
});

test("beadas.html: a beadasiFelulet() használja a BEADASI_MOD-ot (a teszt a valódi helyzetet nézi)", () => {
  const def = script.indexOf("function beadasiFelulet()");
  assert.ok(def > 0);
  assert.ok(script.indexOf("BEADASI_MOD", def) > def);
});
