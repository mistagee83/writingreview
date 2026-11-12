// ══════════════════════════════════════════════════════
// Feladatlink – token, lenyomat, állapot (functions/feladatlink.js)
//
// Miért teszt: a link az egyetlen kapu a diákoldalhoz. Ha a token kitalálható,
// a lejárat vagy a lezárás nem fog, vagy a plafon nem számít, akkor egy
// kiszivárgott link korlátlan beadást enged – csendben, hiba nélkül.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
let l;
before(() => { l = require("./feladatlink.js"); });

test("a token 32 karakteres base64url, és minden hívásra más", () => {
  const tokenek = new Set(Array.from({ length: 200 }, () => l.tokenGeneralas()));
  assert.equal(tokenek.size, 200);
  for (const t of tokenek) {
    assert.match(t, /^[A-Za-z0-9_-]{32}$/);
    assert.ok(l.tokenErvenyes(t));
  }
});

test("a token a megadott véletlenforrásból jön (192 bit)", () => {
  let kert = 0;
  const t = l.tokenGeneralas((n) => { kert = n; return Buffer.alloc(n, 7); });
  assert.equal(kert, 24);
  assert.equal(t.length, 32);
});

test("tokenErvenyes: rossz alak, típus és hossz elutasítva (adatbázis-olvasás előtt)", () => {
  for (const rossz of [undefined, null, 42, {}, "", "rovid", "a".repeat(31), "a".repeat(33),
    "a".repeat(31) + "=", "a".repeat(31) + "/", "a".repeat(31) + "+", "../".padEnd(32, "a"), " ".repeat(32)]) {
    assert.equal(l.tokenErvenyes(rossz), false, JSON.stringify(rossz));
  }
});

test("a lenyomat SHA-256 hex, determinisztikus, és nem maga a token", () => {
  const t = l.tokenGeneralas();
  const h = l.tokenHash(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(l.tokenHash(t), h);
  assert.notEqual(h, t);
  assert.notEqual(l.tokenHash(l.tokenGeneralas()), h);
  // ismert érték (sha256("abc"))
  assert.equal(l.tokenHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("az új link 24 óráig él, 60-as plafonnal, nyitva, nulla beadással", () => {
  const most = Date.UTC(2026, 10, 12, 8, 0, 0);
  const d = l.ujLinkAdat({ feladatId: "f1", tanarId: "t1", token: "x", most });
  assert.equal(d.lejar.getTime() - most, 24 * 60 * 60 * 1000);
  assert.deepEqual({ ...d, lejar: undefined }, {
    feladat_id: "f1", tanar_id: "t1", token: "x", lejar: undefined, lezarva: false, beadas_db: 0, beadas_max: 60
  });
});

test("linkAllapot: aktív, lejárt, lezárt, betelt; a lezárás a lejárat előtt is számít", () => {
  const most = 1_000_000;
  const alap = { lezarva: false, lejar: new Date(most + 1000), beadas_db: 0, beadas_max: 60 };
  assert.equal(l.linkAllapot(alap, most), "aktiv");
  assert.equal(l.linkAllapot({ ...alap, lejar: new Date(most) }, most), "lejart", "a lejárat pillanatában már lejárt");
  assert.equal(l.linkAllapot({ ...alap, lejar: new Date(most - 1) }, most), "lejart");
  assert.equal(l.linkAllapot({ ...alap, lezarva: true }, most), "lezarva");
  assert.equal(l.linkAllapot({ ...alap, lezarva: true, lejar: new Date(most - 1) }, most), "lezarva");
  assert.equal(l.linkAllapot({ ...alap, beadas_db: 59 }, most), "aktiv");
  assert.equal(l.linkAllapot({ ...alap, beadas_db: 60 }, most), "betelt");
  assert.equal(l.linkAllapot({ ...alap, beadas_max: undefined, beadas_db: 60 }, most), "betelt", "plafon nélkül is az alap 60 számít");
});

test("linkAllapot: hiányzó vagy hibás lejárat, hiányzó link → lejárt (biztonsági alapérték)", () => {
  assert.equal(l.linkAllapot(null), "lejart");
  assert.equal(l.linkAllapot(undefined), "lejart");
  assert.equal(l.linkAllapot({ lezarva: false }), "lejart");
  assert.equal(l.linkAllapot({ lezarva: false, lejar: "holnap" }), "lejart");
});

test("linkAllapot: Firestore Timestamp (toMillis) és ms is jó lejáratnak", () => {
  const most = 5000;
  assert.equal(l.linkAllapot({ lejar: { toMillis: () => 6000 }, beadas_db: 0 }, most), "aktiv");
  assert.equal(l.linkAllapot({ lejar: 6000, beadas_db: 0 }, most), "aktiv");
  assert.equal(l.linkAllapot({ lejar: 4000, beadas_db: 0 }, most), "lejart");
});
