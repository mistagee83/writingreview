// ══════════════════════════════════════════════════════
// Havi AI-kvóta – a tiszta logika és a bekötés ellenőrzése
// (az adatbázisos részt a functions.test.mjs fedi, emulátorral)
//
// Miért: a kvótát minden AI-útvonalnak be kell tartania; ha egy új AI-művelet
// kimarad, a Gemini-költség korlátlan. Lásd docs/kornyezetek-terv.md 5.1.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const k = require("./kvota.js");

test("a hónap kulcsa ÉÉÉÉ-HH, UTC szerint", () => {
  assert.equal(k.honapKulcs(new Date("2026-10-05T12:00:00Z")), "2026-10");
  assert.equal(k.honapKulcs(new Date("2026-01-31T23:59:59Z")), "2026-01");
  assert.equal(k.honapKulcs(new Date("2026-02-01T00:00:00Z")), "2026-02");
  assert.equal(k.honapKulcs(new Date("2026-12-31T23:59:59Z")), "2026-12");
});

test("ismeretlen vagy hiányzó csomag az alapcsomag, sosem a korlátlan", () => {
  assert.equal(k.csomagNev(undefined), "ingyenes");
  assert.equal(k.csomagNev(null), "ingyenes");
  assert.equal(k.csomagNev("korlatlan "), "ingyenes");
  assert.equal(k.csomagNev("__proto__"), "ingyenes");
  assert.equal(k.csomagNev("toString"), "ingyenes");
  assert.equal(k.csomagNev("alap"), "alap");
  assert.equal(k.keret("valami"), k.CSOMAGOK.ingyenes.keret);
  assert.equal(k.keret("korlatlan"), null);
});

test("a Profi csomag: havi 500 egység, nagyobb az alapnál; a korlátlan marad az admin kézi csomagja", () => {
  const { alap, profi } = k.CSOMAGOK;
  assert.equal(profi.keret, 500);
  assert.equal(profi.idoszak, "havi");
  assert.ok(alap.keret < profi.keret);
  assert.equal(k.keret("profi"), 500);
  assert.equal(k.hasznalatKulcs("profi", new Date("2026-10-15T00:00:00Z")), "2026-10");
  assert.equal(k.kvotaDontes({ csomag: "profi", hasznalt: 499, koltseg: 1 }).engedett, true);
  assert.equal(k.kvotaDontes({ csomag: "profi", hasznalt: 500, koltseg: 1 }).engedett, false);
});

test("a csomagok: az ingyenes véges és egyszeri (nem újul meg), a fizetős havi és nagyobb", () => {
  const { ingyenes, alap } = k.CSOMAGOK;
  assert.equal(ingyenes.keret, 20);
  assert.equal(ingyenes.idoszak, "egyszeri");
  assert.equal(alap.keret, 150);
  assert.equal(alap.idoszak, "havi");
  assert.ok(Number.isInteger(ingyenes.keret) && ingyenes.keret > 0 && ingyenes.keret < alap.keret);
  assert.equal(k.ALAP_CSOMAG, "ingyenes");
  for (const [nev, c] of Object.entries(k.CSOMAGOK)) {
    assert.ok(["egyszeri", "havi"].includes(c.idoszak), `${nev}: ismeretlen időszak`);
  }
});

test("a használat kulcsa: az ingyenesnél állandó (nem nullázódik hónapváltáskor), a havinál a hónap", () => {
  const okt = new Date("2026-10-31T23:59:59Z");
  const nov = new Date("2026-11-01T00:00:00Z");
  assert.equal(k.hasznalatKulcs("ingyenes", okt), "osszes");
  assert.equal(k.hasznalatKulcs("ingyenes", nov), "osszes", "az ingyenes keret nem újul meg");
  assert.equal(k.hasznalatKulcs("alap", okt), "2026-10");
  assert.equal(k.hasznalatKulcs("alap", nov), "2026-11", "a fizetős keret havonta újraindul");
  assert.equal(k.hasznalatKulcs(undefined, nov), "osszes", "csomag nélküli tanár = ingyenes");
  assert.equal(k.idoszak("valami"), "egyszeri");
});

test("a műveletek ára pozitív egész egység", () => {
  for (const [nev, ar] of Object.entries(k.EGYSEG_KOLTSEG)) {
    assert.ok(Number.isInteger(ar) && ar > 0, `${nev}: ${ar}`);
  }
});

test("a döntés: pontosan a keretig engedett, utána nem", () => {
  const limit = k.CSOMAGOK.ingyenes.keret;
  assert.equal(k.kvotaDontes({ csomag: "ingyenes", hasznalt: 0, koltseg: 1 }).engedett, true);
  assert.equal(k.kvotaDontes({ csomag: "ingyenes", hasznalt: limit - 1, koltseg: 1 }).engedett, true, "az utolsó egység még belefér");
  assert.equal(k.kvotaDontes({ csomag: "ingyenes", hasznalt: limit, koltseg: 1 }).engedett, false);
  // a kétegységes művelet nem fér el, ha csak egy maradt
  assert.equal(k.kvotaDontes({ csomag: "ingyenes", hasznalt: limit - 1, koltseg: 2 }).engedett, false);
  assert.equal(k.kvotaDontes({ csomag: "ingyenes", hasznalt: limit - 2, koltseg: 2 }).engedett, true);
});

test("a döntés: korlátlan csomagnál mindig engedett; rossz használat-érték nullának számít", () => {
  assert.equal(k.kvotaDontes({ csomag: "korlatlan", hasznalt: 1e9, koltseg: 2 }).engedett, true);
  assert.equal(k.kvotaDontes({ csomag: "korlatlan", hasznalt: 5, koltseg: 1 }).limit, null);
  for (const rossz of [undefined, null, NaN, -5, "x"]) {
    assert.equal(k.kvotaDontes({ csomag: "ingyenes", hasznalt: rossz, koltseg: 1 }).hasznalt, 0, String(rossz));
  }
});

test("minden AI-művelet a kvótán át megy: a táblázat és a hívóhelyek egyeznek", () => {
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const hivasok = new Set([...forras.matchAll(/kvotaval\(\s*[^,]+?,\s*"(\w+)"/g)].map((m) => m[1]));
  assert.deepEqual([...hivasok].sort(), Object.keys(k.EGYSEG_KOLTSEG).sort(),
    "új AI-művelet felvételekor a kvotaval()-t és az EGYSEG_KOLTSEG-et is bővíteni kell");
});

test("a Gemini-hívás csak kvótával védett helyről indul", () => {
  // A geminiHivas() négy hívóhelye: a rubrika-javaslat, a beadás (két lépés, kétféle
  // mód), az osztályelemzés és a kulcskészítés – mind kvotaval()-on belül vagy a
  // kvotaval()-lal védett feldolgozBeadas()-ból. Ha új hívóhely jön, ezt a számot
  // tudatosan kell átírni (és ellenőrizni, hogy az új hívás védett-e).
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const hivasok = [...forras.matchAll(/await geminiHivas\(|=> geminiHivas\(|return geminiHivas\(/g)].length;
  assert.equal(hivasok, 7, "a geminiHivas() hívóhelyeinek száma változott – nézd át a kvóta-védelmet");
});
