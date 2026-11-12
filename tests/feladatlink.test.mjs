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
    feladat_id: "f1", tanar_id: "t1", csoport_id: null, token: "x", lejar: undefined, lezarva: false, beadas_db: 0, beadas_max: 60
  });
  assert.equal(l.ujLinkAdat({ feladatId: "f1", tanarId: "t1", token: "x", csoportId: "cs1", most }).csoport_id, "cs1");
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

test("jelzések: pontosan a várt mezők, korlátos egészek, legfeljebb 100 tartomány-szám és 50 esemény", () => {
  const J = { elhagyas_db: 2, elhagyas_mp: 14, beillesztes_db: 1, beillesztett_karakter: 120, beillesztett_tartomanyok: [10, 130],
    beillesztes_kiserlet_db: 1, nagy_betoldas_db: 0, irasi_mp: 300, osszes_mp: 900,
    esemenyek: [{ t: 5, tipus: "beillesztes_kiserlet", ertek: 0 }, { t: 40, tipus: "elhagyas", ertek: 12 }] };
  assert.ok(l.jelzesekErvenyesek(J));
  assert.ok(l.jelzesekErvenyesek({ ...J, beillesztett_tartomanyok: [] }));
  const { elhagyas_db, ...hianyos } = J;
  for (const rossz of [
    null, undefined, [], "x", hianyos, { ...J, extra: 1 },
    { ...J, elhagyas_db: -1 }, { ...J, elhagyas_mp: 1.5 }, { ...J, beillesztes_db: "sok" },
    { ...J, beillesztett_karakter: 1e9 }, { ...J, beillesztett_tartomanyok: "10-130" },
    { ...J, beillesztett_tartomanyok: Array(101).fill(1) }, { ...J, beillesztett_tartomanyok: [1, "2"] },
    { ...J, beillesztett_tartomanyok: [1, 30000] },
    { ...J, beillesztes_kiserlet_db: -1 }, { ...J, irasi_mp: 1.5 }, { ...J, osszes_mp: "sok" },
    { ...J, esemenyek: "x" }, { ...J, esemenyek: Array(51).fill({ t: 1, tipus: "elhagyas", ertek: 1 }) },
    { ...J, esemenyek: [{ t: 1, tipus: "masolas", ertek: 1 }] },
    { ...J, esemenyek: [{ t: 1, tipus: "elhagyas", ertek: 1, extra: "x" }] },
    { ...J, esemenyek: [{ t: -1, tipus: "elhagyas", ertek: 1 }] },
    { ...J, esemenyek: [{ t: 1, tipus: "elhagyas" }] }
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
  assert.equal(b.csoport_id, null, "csoport nélküli link");
  const cs = l.ujBeadasAdat({ link: { feladat_id: "f1", tanar_id: "t1", csoport_id: "cs1" }, linkId: "h", becenev: "Pisti", szoveg: "x", jelzesek: {}, most });
  assert.equal(cs.csoport_id, "cs1", "a csoportos link beadása a csoporté");
});

test("a diák böngészőjének jelzés-dokumentumát (tiltással) a szerver elfogadja – a kettő alakja egyezik", async () => {
  const kliens = await import("../public/js/iras-jelzes.js");
  const n = new kliens.IrasNaplo();
  n.bevitel(0, 1); n.bevitel(5000, 80); n.kiserlet(6000); n.elhagyas(30000, 4000);
  const doku = kliens.jelzesekDokumentum({
    elhagyas: { elhagyas_db: 1, elhagyas_ms: 4000 }, beillesztes_db: 0, beillesztett_karakter: 0,
    szoveg: "Dear Ben", beillesztettek: [], naplo: n, most: 60000
  });
  assert.ok(l.jelzesekErvenyesek(JSON.parse(JSON.stringify(doku))), JSON.stringify(doku));
  assert.equal(kliens.ESEMENY_MAX, 50);
  // tiltás nélküli (régi alakú) dokumentumot a feladatlink nem fogad el
  const regi = kliens.jelzesekDokumentum({ elhagyas: { elhagyas_db: 0 }, szoveg: "x", beillesztettek: [] });
  assert.equal(l.jelzesekErvenyesek(regi), false);
});

test("diáklink jóváhagyáskor: ha 7 napnál kevesebb van hátra, a jóváhagyástól 7 nap; különben nem változik", () => {
  const most = Date.UTC(2026, 10, 12, 8, 0, 0);
  const NAP = 24 * 60 * 60 * 1000;
  assert.equal(l.diaklinkJovahagyasUtan(new Date(most + NAP), most).getTime(), most + 7 * NAP);
  assert.equal(l.diaklinkJovahagyasUtan(new Date(most - NAP), most).getTime(), most + 7 * NAP, "már lejárt: újra él 7 napig");
  assert.equal(l.diaklinkJovahagyasUtan({ toMillis: () => most + 2 * NAP }, most).getTime(), most + 7 * NAP, "Firestore-időbélyeg");
  assert.equal(l.diaklinkJovahagyasUtan(new Date(most + 10 * NAP), most), null);
  assert.equal(l.diaklinkJovahagyasUtan(undefined, most), null, "nem feladatlinkes beadás: nincs diáklink");
});

// ── A csoport diákjai (8b/2): párosítás becenév szerint ──

test("csoport-diák: az első beadás becenevéből; a kulcs ugyanaz, mint a linken belüli egyediségé", () => {
  assert.deepEqual(l.ujCsoportDiakAdat("  Kék   Sárkány "), { nev: "Kék Sárkány", becenevek: ["keksarkany"] });
  assert.equal(l.becenevKulcs("kek-SARKANY"), "keksarkany", "a „Kek-Sarkany” ugyanaz a diák");
});

test("összevonás: a cél neve marad, a becenevek uniója, a későbbi utolsó beadás", () => {
  const cel = { nev: "Peti", becenevek: ["peti"], utolso_beadas: new Date(1000) };
  const forras = { nev: "Peter", becenevek: ["peter", "peti"], utolso_beadas: new Date(5000) };
  const t = l.osszevonasTerv(cel, forras);
  assert.deepEqual(t.becenevek, ["peti", "peter"]);
  assert.equal(t.utolso_beadas.getTime(), 5000);
  assert.equal(l.osszevonasTerv({ ...cel, utolso_beadas: new Date(9000) }, forras).utolso_beadas.getTime(), 9000);
  assert.equal(l.osszevonasTerv({ becenevek: [] }, {}).utolso_beadas, null, "hiányzó adatnál sem hibázik");
});

test("leválasztás: egy téves összevonás visszacsinálható – a becenév az új diákhoz költözik", () => {
  const forras = { nev: "Peti", becenevek: ["peti", "peter"], utolso_beadas: new Date(9000) };
  const t = l.levalasztasTerv(forras, { becenev: "Peter", letrehozva: new Date(9000) },
    [{ becenev: "Peti", letrehozva: new Date(3000) }]);
  assert.equal(t.becenevViszi, true);
  assert.equal(t.kulcs, "peter");
  assert.deepEqual(t.uj, { nev: "Peter", becenevek: ["peter"] });
  assert.deepEqual(t.forras.becenevek, ["peti"]);
  assert.equal(t.forras.nev, "Peti");
  assert.equal(t.forras.utolso_beadas.getTime(), 3000, "az utolsó beadás a maradókból");
});

test("leválasztás: ugyanazzal a becenévvel írt két diák – az új diák becenév nélkül jön létre", () => {
  const forras = { nev: "Anna", becenevek: ["anna"], utolso_beadas: new Date(5000) };
  const t = l.levalasztasTerv(forras, { becenev: "anna", letrehozva: new Date(5000) },
    [{ becenev: "Anna", letrehozva: new Date(2000) }]);
  assert.equal(t.becenevViszi, false, "a következő „Anna” a régihez kerül");
  assert.deepEqual(t.uj, { nev: "anna", becenevek: [] });
  assert.deepEqual(t.forras.becenevek, ["anna"]);
  assert.equal(t.forras.nev, "Anna");
});

test("leválasztás: ha a forrás neve elköltözik, a legutóbbi maradó beadás becenevét kapja", () => {
  const forras = { nev: "Peter", becenevek: ["peter", "peti"] };
  const t = l.levalasztasTerv(forras, { becenev: "Peter" }, [
    { becenev: "Peti", letrehozva: new Date(1000) },
    { becenev: "Pityu", letrehozva: { toMillis: () => 7000 } }
  ]);
  assert.equal(t.forras.nev, "Pityu");
  assert.equal(t.forras.utolso_beadas.toMillis(), 7000);
});
