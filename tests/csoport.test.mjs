// ══════════════════════════════════════════════════════
// Csoportok (8b) – a kliens tiszta része (public/js/csoport.js)
//
// Miért teszt: a név szabályát a Firestore-szabály is ellenőrzi (1–60 karakter); ha a kliens
// mást engedne, a tanár érthetetlen hibát kapna. A linkindításnál archivált csoport nem
// választható (a szerver úgyis elutasítaná).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { csoportNevTisztitas, csoportRendezes, valaszthatoCsoportok, CSOPORT_NEV_MAX } from "../public/js/csoport.js";

test("a csoport neve: szóközök összevonva; üres és 60 karakternél hosszabb elutasítva", () => {
  assert.equal(csoportNevTisztitas("  9.B   angol "), "9.B angol");
  assert.equal(csoportNevTisztitas("   "), null);
  assert.equal(csoportNevTisztitas(undefined), null);
  assert.equal(csoportNevTisztitas("x".repeat(CSOPORT_NEV_MAX)), "x".repeat(60));
  assert.equal(csoportNevTisztitas("x".repeat(CSOPORT_NEV_MAX + 1)), null);
});

test("a kliens és a Firestore-szabály névhatára egyezik", () => {
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const blokk = rules.slice(rules.indexOf("match /csoportok/"));
  assert.match(blokk, new RegExp(`n\\.size\\(\\) <= ${CSOPORT_NEV_MAX}`));
});

test("sorrend: ábécé (számokat értelmesen), az archiváltak a végén; választani csak a nyitottat lehet", () => {
  const cs = [
    { id: "a", nev: "10.A angol" }, { id: "b", nev: "9.B angol" },
    { id: "c", nev: "Haladó", aktiv: false }, { id: "d", nev: "émelt csoport" }
  ];
  assert.deepEqual(csoportRendezes(cs).map((c) => c.id), ["b", "a", "d", "c"]);
  assert.deepEqual(valaszthatoCsoportok(cs).map((c) => c.id), ["b", "a", "d"]);
});
