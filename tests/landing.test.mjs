// ══════════════════════════════════════════════════════
// Nyitóoldal (index.html): szótári kulcsok, az árak egy forrásból, hivatkozások, és hogy az oldal nem állít
// semmit a jogilag nyitott témákról (kiskorúak, EU-s feldolgozás, adatkezelés: docs/kovetkezo-munkamenet.md).
// Emulátor nélkül fut.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.GCLOUD_PROJECT = "wr-landing-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const kvota = require("./kvota.js");
const { _teszt: szerver } = require("./index.js");
const config = await import("../scripts/kornyezet-config.mjs");
const hu = (await import("../public/js/i18n-hu.js")).default;
const en = (await import("../public/js/i18n-en.js")).default;
const olvas = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const html = olvas("../public/index.html");

const landingKulcsok = (szotar) => Object.keys(szotar).filter((k) => k.startsWith("landing."));

// ── szövegek ──

test("a nyitóoldal minden szótári kulcsa létezik magyarul és angolul, és a két nyelv kulcskészlete egyezik", () => {
  const hasznalt = [...html.matchAll(/data-i18n(?:-html|-aria)?="(landing\.[\w]+)"/g)].map((m) => m[1]);
  assert.ok(hasznalt.length > 30);
  for (const k of hasznalt) {
    assert.ok(hu[k] !== undefined, `hu: ${k}`);
    assert.ok(en[k] !== undefined, `en: ${k}`);
  }
  // a szkriptben sablonból épülő kulcsok: csomag_<név>, pont_<pont>
  const csomagNevek = [...html.matchAll(/nev: '(\w+)'/g)].map((m) => m[1]);
  const pontok = [...html.matchAll(/pontok: \[([^\]]+)\]/g)].flatMap((m) => m[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1)));
  assert.deepEqual(csomagNevek.sort(), ["alap", "ingyenes", "profi"]);
  assert.equal(pontok.length, 9);
  for (const n of csomagNevek) assert.ok(hu[`landing.csomag_${n}`] && en[`landing.csomag_${n}`], `csomag_${n}`);
  for (const p of pontok) assert.ok(hu[`landing.pont_${p}`] && en[`landing.pont_${p}`], `pont_${p}`);
  for (const k of ["landing.hero_ingyenes", "landing.per_ho", "landing.ingyenes_ar", "landing.keret_egyszeri", "landing.keret_havi"]) {
    assert.ok(hu[k] !== undefined && en[k] !== undefined, k);
  }
  assert.deepEqual(landingKulcsok(hu).sort(), landingKulcsok(en).sort());
});

test("a nyitóoldal nem állít semmit a jogilag nyitott témákról (kiskorúak, EU, adatkezelés, megfelelőség)", () => {
  // Ezek a témák jogi tisztázásra várnak (docs/folytatas.md 5/b, 5/c; adatvedelmi-kerdesek.md): az oldal nem ígérhet olyat.
  const tiltott = /kiskor|gyerek|gyermek|18 év|kamasz|fiatalkor|minor|child|under 18|\bGDPR\b|\bEU\b|európai|european|adatkezel|adatvéd|data protection|privacy|megfelel|compliant|biztonságos adat|hosted in/i;
  for (const [nyelv, szotar] of [["hu", hu], ["en", en]]) {
    for (const k of landingKulcsok(szotar)) {
      assert.ok(!tiltott.test(szotar[k]), `${nyelv} ${k}: tiltott állítás: "${szotar[k]}"`);
    }
  }
  // a lap látható szövege (a szkript kódja nem szöveg: pl. az appendChild nem "child")
  const forras = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  assert.ok(!tiltott.test(forras.replace(/<meta name="description"[^>]*>/, "")), "a HTML szövegében tiltott állítás van");
});

test("a szövegek állításai egyeznek a kóddal: nyolc nyelv, a dolgozat egy egység, a Profi és az Alap tartalma", () => {
  assert.equal(szerver.NYELVEK.length, 8);
  assert.equal(kvota.EGYSEG_KOLTSEG.beadas, 1, "a GYIK szerint egy dolgozat javítása egy egység");
  assert.ok(kvota.EGYSEG_KOLTSEG.feladatlap > 0 && kvota.EGYSEG_KOLTSEG.elemzes > 0 && kvota.EGYSEG_KOLTSEG.kulcs > 0,
    "a GYIK szerint a feladatlap, az elemzés és a kulcs is fogyaszt");
  // a csomag-pontok a funkciótáblát követik: az elemzés az Alaptól, a fejlődés-követés a Profitól, a színválasztás az Alaptól
  assert.ok(kvota.FUNKCIOK.osztaly_elemzes.includes("alap") && !kvota.FUNKCIOK.osztaly_elemzes.includes("ingyenes"));
  assert.ok(kvota.FUNKCIOK.fejlodes.includes("profi") && !kvota.FUNKCIOK.fejlodes.includes("alap"));
  assert.ok(kvota.FUNKCIOK.szinvalasztas.includes("alap") && !kvota.FUNKCIOK.szinvalasztas.includes("ingyenes"));
  assert.ok(kvota.CSOMAGOK.profi.keret > kvota.CSOMAGOK.alap.keret, "a Profi 'nagyobb havi keret'");
});

// ── az árak és keretek egy forrásból ──

test("a nyitóoldal árai a functions/.env.prod-ból, a keretek a kvota.js-ből jönnek; a pilotban nincs fizetés", () => {
  const prod = config.csomagAdatok("prod");
  const env = config.envBetoltes(fileURLToPath(new URL("../functions/.env.prod", import.meta.url)));
  assert.equal(prod.fizetes, true);
  assert.equal(prod.arak.alap, env.FIZETES_AR_SZOVEG);
  assert.equal(prod.arak.profi, env.FIZETES_AR_PROFI_SZOVEG);
  for (const nev of ["ingyenes", "alap", "profi"]) assert.equal(prod.keretek[nev], kvota.CSOMAGOK[nev].keret, nev);

  const pilot = config.csomagAdatok("pilot");
  assert.equal(pilot.fizetes, false);
  assert.deepEqual(pilot.arak, {});
});

test("fizetés csak érvényes árazonosítóval él, a Profi csak ha az ára is be van állítva (mint a szerveren)", () => {
  const gyoker = mkdtempSync(join(tmpdir(), "wr-landing-"));
  mkdirSync(join(gyoker, "functions"));
  copyFileSync(fileURLToPath(new URL("../functions/kvota.js", import.meta.url)), join(gyoker, "functions", "kvota.js"));
  const env = (tartalom, alias = "prod") => {
    writeFileSync(join(gyoker, "functions", `.env.${alias}`), tartalom);
    return config.csomagAdatok(alias, gyoker);
  };

  const csakAlap = env("FIZETES_AR_ALAP=price_abc\nFIZETES_AR_SZOVEG=5 EUR / hó\n");
  assert.equal(csakAlap.fizetes, true);
  assert.deepEqual(csakAlap.arak, { alap: "5 EUR / hó" }, "Profi-ár nélkül nincs Profi");

  const mindketto = env("# komment\nFIZETES_AR_ALAP=price_abc\nFIZETES_AR_SZOVEG=5 EUR / hó\nFIZETES_AR_PROFI=price_def\nFIZETES_AR_PROFI_SZOVEG=12 EUR / hó\n");
  assert.deepEqual(mindketto.arak, { alap: "5 EUR / hó", profi: "12 EUR / hó" });

  for (const rossz of ["", "FIZETES_AR_ALAP=\n", "FIZETES_AR_ALAP=hamis\n", "FIZETES_AR_ALAP=price_ab cd\n"]) {
    const r = env(rossz);
    assert.equal(r.fizetes, false, JSON.stringify(rossz));
    assert.deepEqual(r.arak, {}, "fizetés nélkül nincs ár");
  }
  // a pilotban az ár sem számít, ha be volt állítva
  assert.equal(env("FIZETES_AR_ALAP=price_abc\nFIZETES_AR_SZOVEG=5 EUR / hó\n", "pilot").fizetes, false);
  // hiányzó .env fájl: nincs fizetés, nem hiba
  const ures = mkdtempSync(join(tmpdir(), "wr-landing-ures-"));
  mkdirSync(join(ures, "functions"));
  copyFileSync(fileURLToPath(new URL("../functions/kvota.js", import.meta.url)), join(ures, "functions", "kvota.js"));
  assert.equal(config.csomagAdatok("prod", ures).fizetes, false);
});

test("a build a prod értékeit írja a kornyezet.js-be, a public/ és a pilot a fizetés nélküli alapot", () => {
  const pubKorny = olvas("../public/js/kornyezet.js");
  const pilotCfg = config.konfigBetoltes("pilot");
  const prodCfg = config.konfigBetoltes("prod");
  assert.equal(config.kornyezetJs(pilotCfg, pubKorny), pubKorny, "a public/ a pilot alapértékeit hordozza");
  assert.equal(config.kornyezetJs(pilotCfg, pubKorny, config.csomagAdatok("pilot")), pubKorny);

  const prod = config.kornyezetJs(prodCfg, pubKorny, config.csomagAdatok("prod"));
  assert.match(prod, /export const FIZETES = true;/);
  assert.match(prod, /export const ARAK = \{"alap":"[^"]+","profi":"[^"]+"\};/);
  assert.match(prod, /export const KERETEK = \{"ingyenes":20,"alap":150,"profi":500\};/);
});

// ── a lap szerkezete ──

test("a nyitóoldal helyi hivatkozásai létező oldalakra mutatnak, külső hivatkozás és Firebase-betöltés nincs", () => {
  for (const m of html.matchAll(/href="([^"#]+\.html)(#[\w-]*)?"/g)) {
    assert.ok(existsSync(new URL(`../public/${m[1]}`, import.meta.url)), `hiányzó oldal: ${m[1]}`);
  }
  for (const m of html.matchAll(/href="#([\w-]+)"/g)) {
    assert.ok(html.includes(`id="${m[1]}"`), `hiányzó horgony: #${m[1]}`);
  }
  assert.ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, "").replace(/xmlns='[^']*'/g, "")), "külső hivatkozás van az oldalon");
  assert.ok(!html.includes("firebase-config"), "a nyitóoldal nem tölt be Firebase-et (a belépés a belepes.html-en történik)");
  // a regisztrációs horgonyokat a belépő oldal ismeri
  const belepes = olvas("../public/belepes.html");
  assert.match(belepes, /horgony === 'regisztracio' \|\| horgony === 'tanar'/);
  for (const m of html.matchAll(/belepes\.html#(\w+)/g)) assert.ok(["tanar", "regisztracio"].includes(m[1]), m[1]);
});

test("a környezet-függő részek jelölése érvényes: csak ismert data-csak értékek", () => {
  const ertekek = new Set([...html.matchAll(/data-csak="([\w-]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...ertekek].sort(), ["belepes-egyedul", "fizetes", "regisztracio"]);
  // a fizetős szakaszok (árak, csomagok) alapból rejtettek: build nélkül sem villanhatnak fel
  assert.match(html, /id="csomagok" data-csak="fizetes" hidden/);
  assert.match(html, /<a href="#csomagok" data-csak="fizetes" hidden/);
});

test("a belépő oldal új helye: BELEPO_OLDAL, 404 és az app indulása a belepes.html-re mutat", () => {
  assert.ok(existsSync(new URL("../public/belepes.html", import.meta.url)));
  assert.match(olvas("../public/js/guard.js"), /export const BELEPO_OLDAL = "belepes\.html";/);
  assert.match(olvas("../public/404.html"), /href="belepes\.html"/);
  assert.equal(JSON.parse(olvas("../public/manifest.webmanifest")).start_url, "/belepes.html");
});
