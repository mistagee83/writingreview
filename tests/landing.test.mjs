// ══════════════════════════════════════════════════════
// Nyitóoldal (index.html): szótári kulcsok, a kredit- és Hub pass-állítások a kóddal egyezően, hivatkozások, és hogy az oldal nem állít
// semmit a jogilag nyitott témákról (kiskorúak, EU-s feldolgozás, adatkezelés: docs/kovetkezo-munkamenet.md).
// Emulátor nélkül fut.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

process.env.GCLOUD_PROJECT = "wr-landing-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const kredit = require("./kredit.js");
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
  // a szkriptben használt kulcs
  for (const k of ["landing.hero_ingyenes"]) assert.ok(hu[k] !== undefined && en[k] !== undefined, k);
  // a három kártya: ingyenes kezdés, Hub pass, kreditcsomag
  const kartyak = [...html.matchAll(/data-i18n="landing\.csomag_(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(kartyak, ["kezdes", "hubpass", "kredit"]);
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

test("a szövegek állításai egyeznek a kóddal: nyolc nyelv, kreditből fogy minden AI-művelet, a Hub pass tartalma", () => {
  assert.equal(szerver.NYELVEK.length, 8);
  // a GYIK szerint a javítás, a feladatlap és az elemzés is kreditbe kerül
  assert.deepEqual(Object.keys(kredit.AKCIOK).sort(), ["beadas", "elemzes", "feladatlap"]);
  // a Hub pass-kártya az elemzést, a fejlődéskövetést, a színválasztást és az érettségi feladattárat ígéri – pontosan a zárt funkciókat
  const hubpass = html.slice(html.indexOf('data-i18n="landing.csomag_hubpass"'), html.indexOf('data-i18n="landing.csomag_kredit"'));
  for (const p of ["elemzes", "fejlodes", "szinek", "erettsegi"]) assert.ok(hubpass.includes(`landing.pont_${p}`), p);
  assert.deepEqual([...kredit.HUB_PASS_FUNKCIOK].sort(), ["erettsegi_tar", "fejlodes", "osztaly_elemzes", "szinvalasztas"]);
  // a nyitóoldal nem ír ki árat vagy kreditszámot: a számok a hub fiókoldalán vannak
  for (const [nyelv, szotar] of [["hu", hu], ["en", en]]) {
    for (const k of landingKulcsok(szotar).filter((k) => /csomag|pont_|hero_ingyenes|gyik[456]/.test(k))) {
      assert.ok(!/\d+\s*(EUR|USD|\$|€|Ft|kredit|credit)/i.test(szotar[k]), `${nyelv} ${k}: szám az árazásban`);
    }
  }
});

test("a build a kredit-kapcsolót és a hub címét írja a kornyezet.js-be; a public/ a pilot alapja", () => {
  const pubKorny = olvas("../public/js/kornyezet.js");
  const pilotCfg = config.konfigBetoltes("pilot");
  const prodCfg = config.konfigBetoltes("prod");
  assert.equal(config.kornyezetJs(pilotCfg, pubKorny), pubKorny, "a public/ a pilot alapértékeit hordozza");
  const prod = config.kornyezetJs(prodCfg, pubKorny);
  assert.match(prod, /export const KREDIT = true;/);
  assert.match(prod, /export const HUB_URL = "https:\/\/[^"]+";/);
  assert.doesNotMatch(prod, /FIZETES|ARAK|KERETEK/);
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
  assert.deepEqual([...ertekek].sort(), ["belepes-egyedul", "fizetes", "hub-link", "regisztracio"]);
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

// ── a Matura-szakasz (#matura; docs/erettsegi-feladattar-terv.md 6.) ──

/** A fejléc első (átirányító) szkriptje egy hamis location-nel futtatva: hova irányít át, ha egyáltalán. */
function elsoSzkript(hash) {
  const forras = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let cel = null;
  const location = { hash, replace: (u) => { cel = u; } };
  new Function("location", forras)(location);
  return cel;
}

test("#sso=: a fejléc első szkriptje a belépőoldalra küld; a #matura és más horgony nem irányít át", () => {
  // az átirányítás a <head> legelső szkriptje, minden más (stílus, modul) előtt
  assert.ok(html.indexOf("<script>") < html.indexOf("<link"), "az #sso= átirányítás a fej első eleme");
  assert.equal(elsoSzkript("#sso=abc123"), "belepes.html#sso=abc123");
  for (const h of ["#matura", "#csomagok", "", "#matura#sso=x", "#x-sso=1"]) assert.equal(elsoSzkript(h), null, h);
  // a lap végi görgető csak sima horgonyra illik (az #sso= kód nem azonosító)
  const modul = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  assert.ok(modul.includes(String.raw`/^#([\w-]+)$/`), "a görgető horgonymintája");
  const minta = /^#([\w-]+)$/;
  assert.ok(minta.test("#matura"));
  assert.ok(!minta.test("#sso=abc123"));
});

test("#matura: létezik, a Hub passos részekkel együtt látszik, tanári regisztrációra és a tárra visz, azonosítót nem visz át", () => {
  const eleje = html.indexOf('id="matura"');
  assert.ok(eleje > 0, "van #matura szakasz");
  const szakasz = html.slice(html.lastIndexOf("<section", eleje), html.indexOf("</section>", eleje));
  assert.match(szakasz, /data-csak="fizetes" hidden/);
  const hivatkozasok = [...szakasz.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(hivatkozasok, ["belepes.html#tanar", "feladattar.html"]);
  assert.ok(!/[?&](utm_|uid|token|becenev|k=)/.test(szakasz), "nincs paraméter a hivatkozásokban");
  for (const k of ["matura_cim", "matura_leiras", "matura_hubpass", "matura_diakok", "matura_fiok", "matura_feladattar"]) {
    assert.ok(szakasz.includes(`landing.${k}`), k);
  }
  // a szakasz angol szövege a diákokat a tanárhoz küldi (diákgyakorlás tanár nélkül nincs)
  assert.match(en["landing.matura_diakok"], /^Students: ask your teacher/);
});
