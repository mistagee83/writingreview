// ══════════════════════════════════════════════════════
// Csomagár-számoló (admin): árrés és ajánlott ár célárrésből
//
// Miért: az árazási döntés erre épül. Egy elcsúszott képlet (pl. az áfa vagy a
// fix díj rossz kezelése) vagy túl olcsó, vagy riasztóan drága csomagot ajánlana.
// A számokat kézzel is kiszámolva ellenőrizzük.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KARTYA_DIJAK, STRIPE_FIX_FT, STRIPE_BILLING_SZAZALEK, STRIPE_VALUTAVALTAS_SZAZALEK,
  felfeleKerekit, csomagSzamok, ajanlottAr, ajanlas
} from "../public/js/arszamolo.js";

const kozel = (x, y, msg = "") => assert.ok(Math.abs(x - y) < 1e-9, `${msg} ${x} != ${y}`);

// Közös példa: 0,04 €/dolgozat, 100 dolgozat, 27% áfa, 1,5% + 0,7% díj, 0,22 € fix
const P = { koltsegEur: 0.04, db: 100, afaSzazalek: 27, dijSzazalek: 2.2, fixEur: 0.22 };

test("a Stripe-díjak a hivatalos magyar táblázat szerintiek", () => {
  assert.deepEqual(KARTYA_DIJAK, { eea: 1.5, premium: 2.8, uk: 2.5, nem_eea: 3.15 });
  assert.equal(STRIPE_FIX_FT, 85);
  assert.equal(STRIPE_BILLING_SZAZALEK, 0.7);
  assert.equal(STRIPE_VALUTAVALTAS_SZAZALEK, 2);
});

test("csomag-számok: az áfa a bevételből, a díj a teljes (áfás) összegből megy", () => {
  const r = csomagSzamok({ ...P, ar: 10 });
  kozel(r.netto, 10 / 1.27, "nettó");
  kozel(r.fizetesiDij, 10 * 0.022 + 0.22, "díj a bruttó után + fix");
  kozel(r.aiKoltseg, 4, "100 dolgozat × 0,04");
  kozel(r.arres, 10 / 1.27 - (0.22 + 0.22) - 4, "árrés");
  kozel(r.arresSzazalek, (r.arres / r.netto) * 100, "árrés %");
});

test("a nullpont: ahol az AI-költség már elviszi az egész maradékot", () => {
  const r = csomagSzamok({ ...P, ar: 10 });
  const vart = Math.floor((10 / 1.27 - 0.44) / 0.04);
  assert.equal(r.nullpont, vart);
  // pont a nullponton az árrés nem negatív, eggyel fölötte már az
  const ott = csomagSzamok({ ...P, db: r.nullpont, ar: 10 });
  assert.ok(ott.arres >= 0);
  assert.ok(csomagSzamok({ ...P, db: r.nullpont + 1, ar: 10 }).arres < 0);
});

test("0 Ft-os ár: nincs díj, nincs bevétel, nincs végtelen vagy NaN", () => {
  const r = csomagSzamok({ ...P, ar: 0 });
  assert.equal(r.fizetesiDij, 0);
  assert.equal(r.netto, 0);
  assert.equal(r.arresSzazalek, null);
  assert.ok(Number.isFinite(r.arres));
});

test("az ajánlott ár a célárrést pontosan eléri", () => {
  for (const cel of [30, 50, 60, 75]) {
    const ar = ajanlottAr({ ...P, celArresSzazalek: cel });
    const r = csomagSzamok({ ...P, ar });
    kozel(r.arresSzazalek, cel, `célárrés ${cel}%`);
  }
});

test("az ajánlott ár képlete kézzel: P = (fix + C) / ((1−m)/(1+v) − f)", () => {
  const ar = ajanlottAr({ ...P, celArresSzazalek: 60 });
  kozel(ar, (0.22 + 4) / (0.4 / 1.27 - 0.022));
});

test("magasabb célárrés, több AI-költség, nagyobb áfa vagy díj → drágább ajánlott ár", () => {
  const alap = ajanlottAr({ ...P, celArresSzazalek: 50 });
  assert.ok(ajanlottAr({ ...P, celArresSzazalek: 70 }) > alap);
  assert.ok(ajanlottAr({ ...P, koltsegEur: 0.08, celArresSzazalek: 50 }) > alap);
  assert.ok(ajanlottAr({ ...P, afaSzazalek: 5, celArresSzazalek: 50 }) < alap, "kisebb áfa olcsóbb");
  assert.ok(ajanlottAr({ ...P, dijSzazalek: 5, celArresSzazalek: 50 }) > alap);
  assert.ok(ajanlottAr({ ...P, fixEur: 1, celArresSzazalek: 50 }) > alap);
});

test("a fix díj a kis csomagnál nyom sokat: a dolgozatonkénti ár a kicsi csomagnál magasabb", () => {
  const kicsi = ajanlas({ ...P, db: 10, celArresSzazalek: 60 });
  const nagy = ajanlas({ ...P, db: 500, celArresSzazalek: 60 });
  assert.ok(kicsi.arPerDolgozat > nagy.arPerDolgozat);
});

test("ha a díjak és az áfa miatt a célárrés elérhetetlen, nincs ajánlat (nem negatív vagy végtelen ár)", () => {
  // nevező: (1 − m)/(1+v) − f ≤ 0  →  m = 99,9%, f = 5%
  assert.equal(ajanlottAr({ ...P, dijSzazalek: 5, celArresSzazalek: 99.9 }), null);
  assert.equal(ajanlas({ ...P, dijSzazalek: 90, celArresSzazalek: 10 }), null);
});

test("a célárrés határolt (100% és negatív érték sem ad ajánlatot vagy hibát)", () => {
  assert.notEqual(ajanlottAr({ ...P, celArresSzazalek: 100 }), undefined);
  assert.ok(ajanlottAr({ ...P, celArresSzazalek: -20 }) > 0, "negatív cél 0%-nak számít");
});

test("a kerekítés felfelé megy, így a kerekített áron az árrés legalább a cél", () => {
  assert.equal(felfeleKerekit(5.01), 5.5);
  assert.equal(felfeleKerekit(5.5), 5.5);
  assert.equal(felfeleKerekit(5.4999999999), 5.5);
  assert.equal(felfeleKerekit(5.0, 1), 5);
  assert.equal(felfeleKerekit(5.2, 1), 6);
  const a = ajanlas({ ...P, celArresSzazalek: 60 });
  assert.ok(a.kerekitett >= a.nyers);
  assert.ok(a.arresSzazalek >= 60 - 1e-9, "a kerekített ár nem rontja a célárrést");
  assert.ok(a.kerekitett - a.nyers < 0.5, "legfeljebb egy lépést kerekít");
});

test("az ai-hasznalat.html a közös számoló-modult használja (nincs másolt képlet)", () => {
  const html = readFileSync(new URL("../public/ai-hasznalat.html", import.meta.url), "utf8");
  assert.match(html, /from '\.\/js\/arszamolo\.js'/);
  assert.match(html, /ajanlas\(/);
  assert.match(html, /csomagSzamok\(/);
});
