// ══════════════════════════════════════════════════════
// i18n – szótárak és használat
//
// Miért külön teszt: egy hiányzó fordítás nem dob hibát, csak a
// magyar tartalék vagy a nyers kulcs jelenik meg az idegen nyelvű
// felhasználónak. Ez a teszt a hiányt és az elgépelt kulcsot már
// fejlesztéskor megfogja.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const PUBLIC = new URL("../public/", import.meta.url);
const i18n = await import("../public/js/i18n.js");
const { SZOTARAK, ALAP_NYELV, t, nyelvCsere, bongeszoNyelv } = i18n;

const helyorzok = (szoveg) =>
  [...szoveg.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("minden nyelv kulcskészlete megegyezik a magyarral", () => {
  const forras = Object.keys(SZOTARAK[ALAP_NYELV]).sort();
  for (const [kod, szotar] of Object.entries(SZOTARAK)) {
    assert.deepEqual(Object.keys(szotar).sort(), forras, `${kod} kulcsai eltérnek`);
  }
});

test("a {helyőrzők} minden nyelven azonosak, és nincs üres fordítás", () => {
  for (const [kod, szotar] of Object.entries(SZOTARAK)) {
    for (const [kulcs, szoveg] of Object.entries(szotar)) {
      assert.ok(szoveg.length > 0, `${kod}:${kulcs} üres`);
      assert.equal(
        helyorzok(szoveg),
        helyorzok(SZOTARAK[ALAP_NYELV][kulcs]),
        `${kod}:${kulcs} helyőrzői eltérnek`
      );
    }
  }
});

test("t(): helyettesítés, tartalék nyelv, tartalék kulcs", () => {
  nyelvCsere("en");
  assert.equal(t("diak.mar_tag", { nev: "A1" }), 'You are already a member of "A1".');
  nyelvCsere("hu");
  assert.equal(t("diak.mar_tag", { nev: "A1" }), 'Már tagja vagy a(z) "A1" osztálynak.');
  assert.equal(t("nincs.ilyen.kulcs"), "nincs.ilyen.kulcs");
  assert.equal(t("diak.szo_tartomany"), "{min}–{max} szó", "hiányzó paraméter nem tűnhet el");
});

test("a böngésző nyelvéből támogatott nyelv lesz, különben null", () => {
  assert.equal(bongeszoNyelv(["hu-HU", "en-US"]), "hu");
  assert.equal(bongeszoNyelv(["de-DE", "en-GB"]), "en");
  assert.equal(bongeszoNyelv(["fr-FR"]), null);
});

test("a státusz-táblák minden kulcsa létezik minden nyelven", async () => {
  const { STATUSZ_TANAR, STATUSZ_DIAK } = await import("../public/js/ui.js");
  for (const tabla of [STATUSZ_TANAR, STATUSZ_DIAK]) {
    for (const s of Object.values(tabla)) {
      for (const kod of Object.keys(SZOTARAK)) {
        assert.ok(SZOTARAK[kod][s.kulcs], `${kod}:${s.kulcs} hiányzik`);
      }
    }
  }
});

// ── a lapok használata ──
// Az átalakított lapok minden t('…') hívása és data-i18n* kulcsa
// létezik-e. Új lap átalakításakor add hozzá ide.
const ATALAKITOTT = ["diak.html", "index.html", "beadas.html", "js/ui.js", "js/pwa.js"];

test("az átalakított lapok minden kulcsa létezik a szótárban", () => {
  for (const f of ATALAKITOTT) {
    const src = readFileSync(new URL(f, PUBLIC), "utf8");
    const kulcsok = [
      ...[...src.matchAll(/\bt\(\s*['"]([\w.\-]+)['"]/g)].map((m) => m[1]),
      ...[...src.matchAll(/data-i18n[\w-]*="([\w.\-]+)"/g)].map((m) => m[1])
    ];
    assert.ok(kulcsok.length > 0 || f.endsWith("ui.js"), `${f}: nincs egyetlen kulcs sem`);
    for (const k of kulcsok) {
      assert.ok(SZOTARAK[ALAP_NYELV][k] !== undefined, `${f}: ismeretlen kulcs: ${k}`);
    }
  }
});

test("az átalakított lapokban nincs beégetett magyar szöveg a megjelenítésben", () => {
  // Kommentek, és a data-i18n elemek tartalék szövege kivétel.
  const kod = (s) => s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    // a data-i18n elem a magyar tartalék szövegével együtt kivétel
    .replace(/<(\w+)\b[^>]*data-i18n[^>]*>[\s\S]*?<\/\1>/g, "")
    // az input placeholder tartaléka is
    .replace(/<input[^>]*data-i18n[^>]*>/g, "");
  const ekezetes = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
  for (const f of ["diak.html", "index.html", "beadas.html"]) {
    const sorok = kod(readFileSync(new URL(f, PUBLIC), "utf8")).split("\n");
    const talalat = sorok.filter((s) => ekezetes.test(s) && !/Névtelen/.test(s) && !/console\.(error|warn|log)/.test(s));
    assert.deepEqual(talalat, [], `${f}: beégetett magyar szöveg`);
  }
});
