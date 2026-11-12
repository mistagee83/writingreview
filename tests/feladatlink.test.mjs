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

// ── A diák beadásának ellenőrzői ──

test("becenév: tisztítás (szélek, belső szóközök, láthatatlan és vezérlőkarakterek)", () => {
  assert.equal(l.becenevTisztitas("  Kis   Pisti  "), "Kis Pisti");
  assert.equal(l.becenevTisztitas("Pi​sti\u0007"), "Pisti");
  assert.equal(l.becenevTisztitas("a‮b"), "ab", "írásirány-váltó karakter nem maradhat benne");
  assert.equal(l.becenevTisztitas(42), "");
  assert.equal(l.becenevTisztitas(null), "");
});

test("becenév: 2–30 karakter, betűvel vagy számmal; a határ még jó", () => {
  for (const jo of ["Ab", "Ábel", "kis pisti", "Zsófi_2", "7B", "a".repeat(30)]) assert.ok(l.becenevErvenyes(jo), jo);
  for (const rossz of ["", " ", "a", "--", "!!", "a".repeat(31), 5, undefined, "​​"]) {
    assert.equal(l.becenevErvenyes(rossz), false, JSON.stringify(rossz));
  }
});

test("becenév kulcsa: kis- és nagybetű, ékezet, szóköz és írásjel nem különböztet meg; nincs benne /", () => {
  assert.equal(l.becenevKulcs("Kis Pisti"), "kispisti");
  assert.equal(l.becenevKulcs("kis-pisti!"), "kispisti");
  assert.equal(l.becenevKulcs("KISPISTI"), "kispisti");
  assert.equal(l.becenevKulcs("Ábel"), l.becenevKulcs("abel"));
  assert.equal(l.becenevKulcs("Őrs"), "ors");
  assert.equal(l.becenevKulcs("a/b"), "ab");
  assert.notEqual(l.becenevKulcs("Pisti1"), l.becenevKulcs("Pisti2"));
});

test("szöveg: nem üres, nem csak szóköz, legfeljebb 20 000 karakter", () => {
  assert.ok(l.szovegErvenyes("Dear Ben,"));
  assert.ok(l.szovegErvenyes("a".repeat(20000)));
  for (const rossz of ["", "   \n\t", "a".repeat(20001), 42, null, undefined, ["x"]]) {
    assert.equal(l.szovegErvenyes(rossz), false, JSON.stringify(rossz)?.slice(0, 20));
  }
});

test("jelzések: pontosan a várt mezők, korlátos egészek, legfeljebb 100 tartomány-szám", () => {
  const J = { elhagyas_db: 2, elhagyas_mp: 14, beillesztes_db: 1, beillesztett_karakter: 120, beillesztett_tartomanyok: [10, 130] };
  assert.ok(l.jelzesekErvenyesek(J));
  assert.ok(l.jelzesekErvenyesek({ ...J, beillesztett_tartomanyok: [] }));
  const { elhagyas_db, ...hianyos } = J;
  for (const rossz of [
    null, undefined, [], "x", hianyos, { ...J, extra: 1 },
    { ...J, elhagyas_db: -1 }, { ...J, elhagyas_mp: 1.5 }, { ...J, beillesztes_db: "sok" },
    { ...J, beillesztett_karakter: 1e9 }, { ...J, beillesztett_tartomanyok: "10-130" },
    { ...J, beillesztett_tartomanyok: Array(101).fill(1) }, { ...J, beillesztett_tartomanyok: [1, "2"] },
    { ...J, beillesztett_tartomanyok: [1, 30000] }
  ]) {
    assert.equal(l.jelzesekErvenyesek(rossz), false, JSON.stringify(rossz)?.slice(0, 60));
  }
});

test("az új beadás: a link feladatához és tanárához kötve, tisztított becenévvel, 14 napos diáklinkkel", () => {
  const most = Date.UTC(2026, 10, 12, 9, 0, 0);
  const b = l.ujBeadasAdat({
    link: { feladat_id: "f1", tanar_id: "t1" }, linkId: "h", becenev: "  Kis  Pisti ", szoveg: "Dear Ben", jelzesek: { x: 1 }, most
  });
  assert.equal(b.feladat_id, "f1");
  assert.equal(b.tanar_id, "t1");
  assert.equal(b.link_id, "h");
  assert.equal(b.becenev, "Kis Pisti");
  assert.equal(b.statusz, "feltoltve");
  assert.equal(b.forras, "szoveg");
  assert.equal(b.diaklink_lejar.getTime() - most, 14 * 24 * 3600 * 1000);
  assert.ok(!("diak_id" in b) && !("osztaly_id" in b), "diákfiók és osztály nincs");
});
