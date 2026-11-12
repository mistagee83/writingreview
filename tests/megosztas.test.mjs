// ══════════════════════════════════════════════════════
// Feladatlink megosztási oldala – a tiszta részek (public/js/megosztas.js)
//
// Miért teszt: a tanár ebből látja, él-e még a link, és ezt vetíti ki. Ha a
// böngészős állapot eltér a szerverétől, a tanár „aktív” linket mutat, amire
// a diák már nem tud beadni (vagy fordítva).
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { linkUrl, linkAllapot, hatralevo, elsoElo, qrSvg } from "../public/js/megosztas.js";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
let szerver;
before(() => { szerver = require("./feladatlink.js"); });

test("a böngészős linkAllapot ugyanazt adja, mint a szerveré", () => {
  const most = 10_000_000;
  const esetek = [
    null, undefined, {}, { lezarva: false }, { lejar: "x" },
    { lejar: new Date(most + 1), beadas_db: 0 },
    { lejar: new Date(most), beadas_db: 0 },
    { lejar: new Date(most - 1), beadas_db: 0 },
    { lejar: new Date(most + 1000), lezarva: true },
    { lejar: new Date(most + 1000), beadas_db: 59, beadas_max: 60 },
    { lejar: new Date(most + 1000), beadas_db: 60, beadas_max: 60 },
    { lejar: new Date(most + 1000), beadas_db: 60 },
    { lejar: new Date(most + 1000), beadas_db: 3, beadas_max: 3 },
    { lejar: { toMillis: () => most + 5 }, beadas_db: 0 },
    { lejar: most + 5, beadas_db: "2" }
  ];
  for (const e of esetek) {
    assert.equal(linkAllapot(e, most), szerver.linkAllapot(e, most), JSON.stringify(e));
  }
  assert.equal(szerver.BEADAS_MAX, 60, "a böngészős példány alapértéke 60 – ha a szerveré változik, ezt is írd át");
});

test("a diákoldal címe: origin + iras.html?k=<token>, a záró perjelek nélkül", () => {
  assert.equal(linkUrl("https://writing-review.web.app", "Ab_-9"), "https://writing-review.web.app/iras.html?k=Ab_-9");
  assert.equal(linkUrl("https://x.hu/", "t"), "https://x.hu/iras.html?k=t");
  assert.equal(linkUrl("https://x.hu", "a b&c"), "https://x.hu/iras.html?k=a%20b%26c");
});

test("a hátralévő idő ÓÓ:PP:MM, lejárt linknél nulla", () => {
  const most = 1_000_000;
  assert.equal(hatralevo(most + 24 * 3600 * 1000, most), "24:00:00");
  assert.equal(hatralevo(most + 3725 * 1000 + 999, most), "01:02:05");
  assert.equal(hatralevo(most, most), "00:00:00");
  assert.equal(hatralevo(most - 5000, most), "00:00:00");
  assert.equal(hatralevo(undefined, most), "00:00:00");
});

test("a kiemelt link a legutóbbi élő (aktív vagy betelt); lejárt és lezárt nem", () => {
  const most = 1_000_000;
  const el = (id, extra) => ({ id, lejar: new Date(most + 1000), beadas_db: 0, ...extra });
  assert.equal(elsoElo([el("a", { lezarva: true }), el("b"), el("c")], most).id, "b");
  assert.equal(elsoElo([el("a", { beadas_db: 60 })], most).id, "a", "a betelt link is látszik (a tanár lezárhatja)");
  assert.equal(elsoElo([el("a", { lejar: new Date(most - 1) })], most), null);
  assert.equal(elsoElo([], most), null);
});

test("a QR-kód SVG, és benne van a cím (akadálymentesség)", () => {
  const svg = qrSvg("https://writing-review.web.app/iras.html?k=AbCdEfGhIjKlMnOpQrStUvWxYz012345", { cim: "QR" });
  assert.match(svg, /^<svg[^>]*viewBox=/);
  assert.match(svg, /<title[^>]*>QR<\/title>/);
  assert.ok(svg.length > 1000);
});

test("a QR-könyvtár helyi, a forrása és a licence meg van jelölve", () => {
  const f = readFileSync(new URL("../public/js/qrcode-generator.js", import.meta.url), "utf8");
  assert.match(f, /qrcode-generator 1\.4\.4/);
  assert.match(f, /Kazuhiko Arase/);
  assert.match(f, /MIT/);
  assert.doesNotMatch(f, /\bfetch\(|XMLHttpRequest|\beval\(|new Function\(/, "a könyvtár ne töltsön le és ne futtasson kódot");
});
