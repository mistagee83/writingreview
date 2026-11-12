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
import { csoportNevTisztitas, csoportRendezes, valaszthatoCsoportok, csoportDiakjai, CSOPORT_NEV_MAX } from "../public/js/csoport.js";

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

test("csoport diákjai (8b/2): a beadások a párosított diákhoz, a legújabb elöl; becenév-alakok ismétlés nélkül", () => {
  const diakok = [
    { id: "d1", nev: "Peti", becenevek: ["peti", "peter"] },
    { id: "d2", nev: "Anna", becenevek: ["anna"] },
    { id: "ures", nev: "Árva", becenevek: [] }
  ];
  const beadasok = [
    { id: "b1", csoport_diak_id: "d1", becenev: "Peti", letrehozva: { toMillis: () => 1000 } },
    { id: "b2", csoport_diak_id: "d1", becenev: "Peter", letrehozva: { toMillis: () => 3000 } },
    { id: "b3", csoport_diak_id: "d1", becenev: "peti", letrehozva: { toMillis: () => 2000 } },
    { id: "b4", csoport_diak_id: "d2", becenev: "Anna", letrehozva: { toMillis: () => 500 } },
    { id: "b5", csoport_diak_id: "meg-nem-jott", becenev: "X", letrehozva: { toMillis: () => 100 } }
  ];
  const { diakok: lista, parositatlan } = csoportDiakjai(diakok, beadasok);
  assert.deepEqual(lista.map((d) => d.id), ["d2", "d1"], "ábécérend; a beadás nélküli diák nem látszik");
  const peti = lista[1];
  assert.deepEqual(peti.beadasok.map((b) => b.id), ["b2", "b3", "b1"]);
  assert.deepEqual(peti.becenevAlakok, ["Peter", "peti"], "kis/nagybetű nem számít; a legújabb alak elöl");
  assert.equal(peti.utolso.toMillis(), 3000);
  assert.deepEqual(parositatlan.map((b) => b.id), ["b5"]);
});
