// ══════════════════════════════════════════════════════
// Beírt dolgozat – írás közbeni jelzések (public/js/iras-jelzes.js)
// A tiszta részek és a DOM-os figyelő, kicserélt eseményforrásokkal.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

const m = await import("../public/js/iras-jelzes.js");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SZOVEG = "Dear Ben, I think your plan is great. It is a really long sentence that was pasted here. Bye.";
const BEILL = "It is a really long sentence that was pasted here.";

// ── tartományok ──

test("a beillesztett részlet a végleges szövegben megtalálva kiemelt tartományt ad", () => {
  const t = m.tartomanyok(SZOVEG, [BEILL]);
  assert.equal(t.length, 2);
  assert.equal(SZOVEG.slice(t[0], t[1]), BEILL);
});

test("ami közben átíródott, az már nem beillesztett (nincs tartomány)", () => {
  const atirt = SZOVEG.replace("really long", "very long");
  assert.deepEqual(m.tartomanyok(atirt, [BEILL]), []);
});

test("a rövid beillesztés nem kerül kiemelésre, a hosszabb ismétlődés minden előfordulása igen", () => {
  assert.deepEqual(m.tartomanyok("abc abc", ["abc"]), [], "8 karakter alatt nem emelünk ki");
  const ketszer = `${BEILL} És megint: ${BEILL}`;
  assert.equal(m.tartomanyok(ketszer, [BEILL]).length, 4);
});

test("az átfedő és a szomszédos tartományok összevonódnak, rendezetten", () => {
  const s = "aaaaaaaaaa bbbbbbbbbb";
  // a b-részlet (11–21), az a-részlet (0–10) és egy átfedő (0–12) együtt egyetlen 0–21 tartomány
  assert.deepEqual(m.tartomanyok(s, ["bbbbbbbbbb", "aaaaaaaaaa", "aaaaaaaaaa b"]), [0, 21]);
  // a két különálló részlet külön marad
  assert.deepEqual(m.tartomanyok("aaaaaaaaaa kozepe bbbbbbbbbb", ["aaaaaaaaaa", "bbbbbbbbbb"]), [0, 10, 18, 28]);
});

test("legfeljebb TARTOMANY_MAX tartomány tárolódik (a határ fölött levágva, rendezetten)", () => {
  const reszletek = Array.from({ length: m.TARTOMANY_MAX + 20 }, (_, i) => `reszlet-${String(i).padStart(4, "0")}`);
  const s = reszletek.join(" | ");
  const t = m.tartomanyok(s, reszletek);
  assert.equal(t.length, m.TARTOMANY_MAX * 2);
  assert.ok(m.tartomanyokRendben(t, s.length));
  assert.equal(s.slice(t[0], t[1]), reszletek[0], "a szöveg elejéről kezdi");
});

test("a tartomány-lista érvényessége: páros, egész, rendezett, nem átfedő, határon belül", () => {
  assert.equal(m.tartomanyokRendben([], 100), true);
  assert.equal(m.tartomanyokRendben([0, 10, 20, 30], 100), true);
  for (const rossz of [[1], [10, 5], [0, 10, 5, 20], [0, 101], [0.5, 3], ["0", "3"], null, "x"]) {
    assert.equal(m.tartomanyokRendben(rossz, 100), false, JSON.stringify(rossz));
  }
  assert.equal(m.tartomanyokRendben(Array(102).fill(0).map((_, i) => i * 2 + (i % 2)), 1e6), false, "túl sok tartomány");
});

test("a beillesztett rész aránya", () => {
  assert.equal(m.beillesztettArany([], 100), 0);
  assert.equal(m.beillesztettArany([0, 25, 50, 75], 100), 0.5);
  assert.equal(m.beillesztettArany([0, 200], 100), 1, "legfeljebb 100%");
  assert.equal(m.beillesztettArany([0, 10], 0), 0);
});

// ── jelölés ──

test("a szöveg jelölve: a beillesztett rész <mark>, minden más escape-elve", () => {
  const t = m.tartomanyok(SZOVEG, [BEILL]);
  const h = m.szovegJelolve(SZOVEG, t, esc);
  assert.match(h, new RegExp(`<mark class="beillesztett">${BEILL.replace(/\./g, "\\.")}</mark>`));
  assert.ok(h.startsWith("Dear Ben"));
});

test("a jelölés nem engedi át a HTML-t, és érvénytelen tartományt figyelmen kívül hagy", () => {
  const veszelyes = '<img src=x onerror=alert(1)> és ez egy hosszabb beillesztett rész &';
  const t = m.tartomanyok(veszelyes, ["és ez egy hosszabb beillesztett rész"]);
  const h = m.szovegJelolve(veszelyes, t, esc);
  assert.ok(!h.includes("<img"), h);
  assert.ok(h.includes("&lt;img"));
  // a kliens által küldött, érvénytelen tartományt nem használjuk
  assert.equal(m.szovegJelolve("abc", [0, 99], esc), "abc");
  assert.equal(m.szovegJelolve("<b>", [3, 1], esc), "&lt;b&gt;");
});

test("szószám", () => {
  assert.equal(m.szoszam(""), 0);
  assert.equal(m.szoszam("  egy  két\nhárom\t"), 3);
});

// ── az ablak elhagyása ──

test("a rövid távollét nem számít, a küszöböt elérő igen", () => {
  const f = new m.AwayFigyelo(2000);
  f.tavol(1000); assert.equal(f.vissza(2500), false, "1,5 mp");
  f.tavol(5000); assert.equal(f.vissza(7000), true, "2 mp");
  f.tavol(10000); assert.equal(f.vissza(15000), true, "5 mp");
  assert.deepEqual(f.allapot(20000), { elhagyas_db: 2, elhagyas_ms: 7000 });
});

test("a többszöri 'távol' jelzés egyetlen elhagyás; 'vissza' távollét nélkül semmi", () => {
  const f = new m.AwayFigyelo(2000);
  assert.equal(f.vissza(100), false);
  f.tavol(1000); f.tavol(1500); f.tavol(1800);   // pl. visibilitychange + blur ugyanarra
  assert.equal(f.vissza(5000), true);
  assert.equal(f.allapot(6000).elhagyas_db, 1);
});

test("beadáskor a még tartó távollét is beleszámít (ha elérte a küszöböt)", () => {
  const f = new m.AwayFigyelo(2000);
  f.tavol(1000);
  assert.deepEqual(f.allapot(1500), { elhagyas_db: 0, elhagyas_ms: 0 });
  assert.deepEqual(f.allapot(4000), { elhagyas_db: 1, elhagyas_ms: 3000 });
});

test("a mentett állapotból folytatódik (újratöltés nem nullázza)", () => {
  const f = new m.AwayFigyelo(2000, { elhagyas_db: 3, elhagyas_ms: 9000 });
  assert.deepEqual(f.allapot(0), { elhagyas_db: 3, elhagyas_ms: 9000 });
  const rossz = new m.AwayFigyelo(2000, { elhagyas_db: "x", elhagyas_ms: NaN });
  assert.deepEqual(rossz.allapot(0), { elhagyas_db: 0, elhagyas_ms: 0 });
});

// ── a Firestore-dokumentum ──

test("a jelzés-dokumentum csupa nemnegatív egész, tartományokkal", () => {
  const j = m.jelzesekDokumentum({
    elhagyas: { elhagyas_db: 2, elhagyas_ms: 7400 },
    beillesztes_db: 1, beillesztett_karakter: BEILL.length, szoveg: SZOVEG, beillesztettek: [BEILL]
  });
  assert.deepEqual(Object.keys(j).sort(), ["beillesztes_db", "beillesztett_karakter", "beillesztett_tartomanyok", "elhagyas_db", "elhagyas_mp"]);
  assert.equal(j.elhagyas_mp, 7);
  for (const [k, v] of Object.entries(j)) {
    if (k !== "beillesztett_tartomanyok") assert.ok(Number.isInteger(v) && v >= 0, k);
  }
  assert.ok(m.tartomanyokRendben(j.beillesztett_tartomanyok, SZOVEG.length));
});

// ── a DOM-os figyelő, kicserélt eseményforrásokkal ──

function dok() {
  const d = new EventTarget();
  d.visibilityState = "visible";
  d.fokusz = true;
  d.hasFocus = () => d.fokusz;
  return d;
}
const tarolo = () => {
  const adat = new Map();
  return { getItem: (k) => adat.get(k) ?? null, setItem: (k, v) => adat.set(k, v), removeItem: (k) => adat.delete(k), adat };
};

test("a figyelő számolja az elhagyást és a beillesztést, és a beadott szöveghez köti a tartományokat", () => {
  const d = dok(); const ablak = new EventTarget(); const mezo = new EventTarget(); const tar = tarolo();
  let most = 1000;
  const f = m.jelzesFigyelo(mezo, { kulcs: "k", tarolo: tar, ablak, dok: d, ora: () => most });

  // lapváltás 5 mp-re (visibilitychange + blur együtt)
  d.visibilityState = "hidden"; d.fokusz = false;
  d.dispatchEvent(new Event("visibilitychange")); ablak.dispatchEvent(new Event("blur"));
  most = 6000;
  d.visibilityState = "visible"; d.fokusz = true;
  d.dispatchEvent(new Event("visibilitychange")); ablak.dispatchEvent(new Event("focus"));

  // beillesztés
  mezo.dispatchEvent(Object.assign(new Event("paste"), { clipboardData: { getData: () => BEILL } }));
  // húzással bedobott szöveg is beillesztés
  mezo.dispatchEvent(Object.assign(new Event("drop"), { dataTransfer: { getData: () => "xy" } }));

  const j = f.dokumentum(SZOVEG);
  assert.equal(j.elhagyas_db, 1);
  assert.equal(j.elhagyas_mp, 5);
  assert.equal(j.beillesztes_db, 2);
  assert.equal(j.beillesztett_karakter, BEILL.length + 2);
  assert.equal(SZOVEG.slice(j.beillesztett_tartomanyok[0], j.beillesztett_tartomanyok[1]), BEILL);
  assert.ok(tar.adat.has("k"), "a számlálók mentődnek");
  f.torles();
  assert.ok(!tar.adat.has("k"));
  f.leallit();
});

test("újratöltés után a mentett számlálók folytatódnak", () => {
  const tar = tarolo();
  tar.setItem("k", JSON.stringify({ elhagyas_db: 2, elhagyas_ms: 8000, beillesztes_db: 1, beillesztett_karakter: 20, beillesztettek: [BEILL] }));
  const f = m.jelzesFigyelo(new EventTarget(), { kulcs: "k", tarolo: tar, ablak: new EventTarget(), dok: dok(), ora: () => 0 });
  const j = f.dokumentum(SZOVEG);
  assert.equal(j.elhagyas_db, 2);
  assert.equal(j.beillesztes_db, 1);
  assert.ok(j.beillesztett_tartomanyok.length === 2);
  f.leallit();
});

test("tároló nélkül (privát ablak) a figyelés hibátlanul működik", () => {
  const rossz = { getItem() { throw new Error("tiltott"); }, setItem() { throw new Error("tiltott"); }, removeItem() { throw new Error("tiltott"); } };
  const mezo = new EventTarget();
  const f = m.jelzesFigyelo(mezo, { kulcs: "k", tarolo: rossz, ablak: new EventTarget(), dok: dok(), ora: () => 0 });
  assert.doesNotThrow(() => mezo.dispatchEvent(Object.assign(new Event("paste"), { clipboardData: { getData: () => BEILL } })));
  assert.equal(f.dokumentum(SZOVEG).beillesztes_db, 1);
  assert.doesNotThrow(() => f.torles());
});
