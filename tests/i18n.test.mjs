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
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const ATALAKITOTT = [
  "diak.html", "index.html", "beadas.html", "visszajelzes.html",
  "tanar.html", "osztalyok.html", "admin.html", "javitas.html", "elemzes.html", "feladatok.html",
  "js/ui.js", "js/pwa.js", "js/nav.js", "js/fejlec.js",
  "js/kifejtos-urlap.js", "js/kifejtos-javitas.js", "js/skala-urlap.js",
  "js/tura.js", "js/tura-demo.js", "js/tura-lepesek.js"
];

// A táblázatokban (menü, státusz, fejléc-nevek) a kulcs nem t()-hívásban,
// hanem szó szerint, idézőjelek közt áll – azt is ellenőrizzük. Fájlnevek
// (pl. "tanar.html") nem kulcsok.
const NYELVTEREK = new Set(Object.keys(SZOTARAK[ALAP_NYELV]).map((k) => k.split(".")[0]));
const TABLAZATKULCS = /["']([a-z]+\.[\w.\-]*[\w])["']/g;
const FAJLNEV = /\.(html|js|mjs|css|json|png)$/;

test("az átalakított lapok minden kulcsa létezik a szótárban", () => {
  for (const f of ATALAKITOTT) {
    const src = readFileSync(new URL(f, PUBLIC), "utf8");
    const kulcsok = [
      ...[...src.matchAll(/\bt\(\s*['"]([\w.\-]+)['"]/g)].map((m) => m[1]),
      ...[...src.matchAll(/data-i18n[\w-]*="([\w.\-]+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(TABLAZATKULCS)].map((m) => m[1])
        .filter((k) => NYELVTEREK.has(k.split(".")[0]) && !FAJLNEV.test(k))
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
    // sorvégi komment (a "https://" előtt nincs szóköz, azt nem érinti)
    .replace(/\s\/\/\s.*$/gm, "")
    // a data-i18n elem a magyar tartalék szövegével együtt kivétel
    .replace(/<(\w+)\b[^>]*data-i18n[^>]*>[\s\S]*?<\/\1>/g, "")
    // az input placeholder tartaléka is
    .replace(/<input[^>]*data-i18n[^>]*>/g, "");
  const ekezetes = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
  for (const f of ATALAKITOTT) {
    const sorok = kod(readFileSync(new URL(f, PUBLIC), "utf8")).split("\n");
    const talalat = sorok.filter((s) => ekezetes.test(s) && !/Névtelen/.test(s) && !/console\.(error|warn|log)/.test(s)
      // az AI magyar kódszavai (adat, nem megjelenő szöveg)
      && !/['"](általános|szórványos)['"]/.test(s)
      // a magyar évfolyam-skála értékei (adat; a szerver ugyanezeket várja)
      && !/évfolyam|érettségi/.test(s));
    assert.deepEqual(talalat, [], `${f}: beégetett magyar szöveg`);
  }
});

test("az átalakított lapok modul-szkriptjei szintaktikailag érvényesek", () => {
  // A sztringben maradt ${t(...)} vagy egy elgépelt idézőjel nem dob hibát
  // a kulcs-ellenőrzésen – csak a böngészőben, a lap betöltésekor derülne ki.
  const dir = mkdtempSync(join(tmpdir(), "wr-i18n-"));
  for (const f of ATALAKITOTT.filter((x) => x.endsWith(".html"))) {
    const html = readFileSync(new URL(f, PUBLIC), "utf8");
    const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    if (!m) continue;
    const fajl = join(dir, f.replace(/\W/g, "_") + ".mjs");
    writeFileSync(fajl, m[1]);
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ["--check", fajl], { stdio: "pipe" }),
      `${f}: szintaxishiba a modul-szkriptben`
    );
  }
});

test("az átalakított .js modulok szintaktikailag érvényesek", () => {
  const dir = mkdtempSync(join(tmpdir(), "wr-i18n-js-"));
  for (const f of ATALAKITOTT.filter((x) => x.endsWith(".js"))) {
    const fajl = join(dir, f.replace(/\W/g, "_") + ".mjs");
    writeFileSync(fajl, readFileSync(new URL(f, PUBLIC), "utf8"));
    assert.doesNotThrow(
      () => execFileSync(process.execPath, ["--check", fajl], { stdio: "pipe" }),
      `${f}: szintaxishiba`
    );
  }
});

test("a megoldókulcs minden hibakódjához van szöveg mindkét nyelven", () => {
  // functions/kifejtos.js: hiba("kod", …) hívások és a KULCS_HIBA_HU táblázat
  const forras = readFileSync(new URL("../functions/kifejtos.js", import.meta.url), "utf8");
  const hivott = new Set([...forras.matchAll(/\bhiba\(\s*"(\w+)"/g)].map((m) => m[1]));
  const tablazat = forras.slice(forras.indexOf("const KULCS_HIBA_HU"), forras.indexOf("function hiba("));
  const definialt = new Set([...tablazat.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  assert.ok(hivott.size >= 15, "a hibakódok nem találhatók – a teszt reg. kifejezése elavult?");
  assert.deepEqual([...hivott].sort(), [...definialt].sort(), "hívott és definiált hibakódok eltérnek");
  for (const kod of hivott) {
    for (const nyelv of Object.keys(SZOTARAK)) {
      assert.ok(SZOTARAK[nyelv][`kulcshiba.${kod}`], `${nyelv}: hiányzó kulcshiba.${kod}`);
    }
  }
});

test("kulcsHibaSzoveg(): a hiba a saját nyelvén jelenik meg, kód nélkül a saját üzenet marad", async () => {
  const { kulcsHibaSzoveg } = i18n;
  const kulcs = await import("../public/js/kifejtos.js");
  const hibaEl = (kulcsAdat) => { try { kulcs.kulcsEllenorzes(kulcsAdat); } catch (e) { return e; } };

  const e1 = hibaEl({ kerdesek: [{ sorszam: "2", tipus: "valasztos", max_pont: 2,
    agak: [{ id: "x", elemek: [{ id: "e", allitas: "", pont: 1 }] }] }] });
  nyelvCsere("en");
  assert.equal(kulcsHibaSzoveg(e1), "Invalid answer key: question 2, branch x, e: empty statement.");
  nyelvCsere("hu");
  assert.equal(kulcsHibaSzoveg(e1), e1.message, "magyarul pontosan a szerver szövege");

  assert.equal(kulcsHibaSzoveg(new Error("más hiba")), "más hiba");
});

test("hibaSzoveg(): a szerver details.kod-ja alapján a felület nyelvén jelenik meg", async () => {
  const { hibaSzoveg } = await import("../public/js/ui.js");
  const hiba = (kod, extra = {}, message = "Magyar üzenet.") =>
    Object.assign(new Error(message), { code: "functions/not-found", details: { kod, ...extra } });

  nyelvCsere("en");
  assert.equal(hibaSzoveg(hiba("beadas_nincs")), "The submission was not found.");
  assert.equal(hibaSzoveg(hiba("statusz_nem_kuldheto", { statusz: "feltoltve" })),
    "It can't be sent in this state: feltoltve");
  assert.equal(hibaSzoveg(hiba("ai_hiba", { reszlet: "Gemini (x): HTTP 503" })),
    "The AI step failed: Gemini (x): HTTP 503");
  assert.equal(
    hibaSzoveg(hiba("kulcshiba", { kulcsKod: "nincs_kerdes", parameterek: {} })),
    "Invalid answer key: there are no questions."
  );
  // kód nélkül (vagy ismeretlen kóddal) az általános szöveg marad, nem a magyar üzenet
  assert.equal(hibaSzoveg(Object.assign(new Error("Magyar."), { code: "functions/not-found" })),
    "The item you are looking for was not found.");
  assert.equal(hibaSzoveg(hiba("ismeretlen_kod")), "The item you are looking for was not found.");

  nyelvCsere("hu");
  assert.equal(hibaSzoveg(hiba("beadas_nincs", {}, "A beadás nem található.")), "A beadás nem található.",
    "magyarul a szerver pontos üzenete jelenik meg");
});
