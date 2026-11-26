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
  // a Hub pass-kártya az elemzést, a fejlődéskövetést, a színválasztást és az érettségi feladattárat ígéri – pontosan
  // a zárt funkciókat. A feladattár pontja csak ott látszik, ahol a tár él (data-csak="erettsegi"; a prodban a jogi
  // válaszig ki van kapcsolva), így a nyitóoldal sehol nem ígér olyat, ami nem érhető el.
  const hubpass = html.slice(html.indexOf('data-i18n="landing.csomag_hubpass"'), html.indexOf('data-i18n="landing.csomag_kredit"'));
  for (const p of ["elemzes", "fejlodes", "szinek", "erettsegi"]) assert.ok(hubpass.includes(`landing.pont_${p}`), p);
  assert.match(hubpass, /<li data-csak="erettsegi" hidden data-i18n="landing.pont_erettsegi">/);
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
  assert.deepEqual([...ertekek].sort(), ["belepes-egyedul", "erettsegi", "fizetes", "hub-link", "regisztracio"]);
  // a szkript minden jelölést ismer (egy ismeretlen érték csendben rejtve maradna)
  const szkript = html.slice(html.indexOf("const latszik = {"), html.indexOf("};", html.indexOf("const latszik = {")));
  for (const e of ertekek) assert.ok(szkript.includes(`${e.includes("-") ? `'${e}'` : e}:`), e);
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

// ── az érettségi szakasz (#matura; terv: docs/erettsegi-feladattar-terv.md 6.) ──

test("#matura: a Matura linkje a nyitóoldal horgonyára mutat, és nem zavarja a hub #sso= átirányítását", () => {
  // a fej átirányító szkriptje: csak a #sso=-val kezdődő horgonyt viszi tovább a belépő oldalra
  const m = html.match(/<script>if \((\/[^/]+\/)\.test\(location\.hash\)\) location\.replace\("belepes\.html" \+ location\.hash\);<\/script>/);
  assert.ok(m, "megvan az #sso= átirányítás a fejben");
  assert.ok(html.indexOf(m[0]) < html.indexOf("<link"), "az átirányítás minden betöltés előtt fut");
  const minta = new Function(`return ${m[1]}`)();
  assert.ok(minta.test("#sso=abc123"));
  for (const h of ["#matura", "#matura?sso=x", "#csomagok", "", "#"]) assert.ok(!minta.test(h), `${h} nem irányít át`);
  assert.match(html, /<section class="lp-szakasz lp-matura" id="matura" data-csak="erettsegi" hidden/);
});

test("#matura: alapból rejtett, nem visz át azonosítót, nem diákbelépésre visz, és csak a feladattárral együtt látszik", () => {
  const szakasz = html.slice(html.indexOf('id="matura"'), html.indexOf("</section>", html.indexOf('id="matura"')));
  const linkek = [...szakasz.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(linkek.sort(), ["belepes.html", "belepes.html#tanar"]);
  assert.ok(!/[?&](utm_|sso|uid|kod|token)/i.test(szakasz), "nincs paraméter, követő- vagy azonosító-mező");
  // a diákoknak egy mondat: a tanáruktól kérjenek feladatot (diákbelépés nincs)
  assert.match(szakasz, /data-i18n="landing\.matura_diak"/);
  assert.match(en["landing.matura_diak"], /^Students: ask your teacher to set you an exam writing task\.$/);
  // a Hub pass-mondat csak ott, ahol a kredit él
  assert.match(szakasz, /data-csak="fizetes" hidden data-i18n="landing\.matura_hubpass"/);
  // a szakasz és a Hub pass-pont a tár kapcsolóját követi (kornyezet.js ERETTSEGI_TAR); a prodban 2026-11-26 óta él
  assert.match(html, /erettsegi: ERETTSEGI_TAR/);
  assert.equal(config.konfigBetoltes("prod").erettsegi_tar, true);
});

test("#matura: a rejtve induló szakaszhoz a láthatóság beállítása UTÁN görget az oldal (a Matura linkje oda vigyen)", () => {
  const szkript = html.slice(html.indexOf('<script type="module">'));
  const lathatosag = szkript.indexOf("el.hidden = !latszik[el.dataset.csak]");
  const gorgetes = szkript.indexOf("horgony.scrollIntoView()");
  assert.ok(lathatosag > 0 && gorgetes > lathatosag, "előbb a láthatóság, utána a görgetés");
  // csak egyszerű horgonyra (a #sso=… a fej szkriptjében már továbbment a belépő oldalra)
  assert.ok(szkript.includes(String.raw`/^#[\w-]+$/.test(location.hash)`), "csak egyszerű horgony");
});
