// ══════════════════════════════════════════════════════
// Kliensoldali biztonság (külső audit 3. kör)
//
// - tárolt XSS: a tanár által írt szószám a diák felületén nem lehet nyers HTML
// - a feladatlap URL-je csak https Storage-cím lehet (javascript: nem)
// - PWA: a service worker akkor is bejegyződik, ha a load már lefutott
// - beadás: feltöltés alatt a képlista nem módosítható
//
// A kliens lapjai böngészős DOM-ot igényelnek, ezért a lapokra forrásszintű
// ellenőrzés van (a jellegzetes hibaminták hiánya), a tiszta modulokra valódi futtatás.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PUBLIC = new URL("../public/", import.meta.url);
const forras = (f) => readFileSync(new URL(f, PUBLIC), "utf8").replace(/\r\n/g, "\n");

// ── biztonsagosUrl ──
const { biztonsagosUrl } = await import(new URL("js/biztonsag.js", PUBLIC));

test("biztonsagosUrl: a Storage https-címe átmegy", () => {
  const u = "https://firebasestorage.googleapis.com/v0/b/proj.appspot.com/o/lap.jpg?alt=media&token=abc";
  assert.equal(biztonsagosUrl(u), u);
});

test("biztonsagosUrl: javascript:, data:, http, idegen host, nem szöveg elutasítva", () => {
  for (const rossz of [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>",
    "http://firebasestorage.googleapis.com/x", "https://evil.example/lap.jpg",
    "https://firebasestorage.googleapis.com.evil.example/x", "//firebasestorage.googleapis.com/x",
    "", "nem url", null, undefined, 42, {}
  ]) {
    assert.equal(biztonsagosUrl(rossz), "", String(rossz));
  }
});

// ── XSS: a szószám a diák listájában ──
test("diak.html: a szószám-szöveg escape-elve kerül az innerHTML-be", () => {
  const diak = forras("diak.html");
  assert.match(diak, /esc\(t\('diak\.szo_tartomany'/);
  assert.equal(/\$\{t\('diak\.szo_tartomany'/.test(diak), false,
    "a t() kimenete (benne a tanár által írt szám-mező) nyersen kerülne a HTML-be");
});

test("a feladatlap URL-jét egyik oldal sem rendereli ellenőrzés nélkül", () => {
  for (const lap of ["beadas.html", "feladatok.html"]) {
    const src = forras(lap);
    assert.match(src, /biztonsagosUrl\(/, `${lap}: nincs URL-ellenőrzés`);
    assert.equal(/esc\(feladat\.feladatlap\.url\)/.test(src), false, `${lap}: nyers feladatlap-URL`);
    assert.equal(/const url = f\.feladatlap\?\.url;/.test(src), false, `${lap}: nyers feladatlap-URL`);
  }
});

// ── PWA ──
function pwaKornyezet(readyState) {
  const hivasok = { register: 0, loadFigyelo: [] };
  Object.defineProperty(globalThis, "navigator", {
    value: { serviceWorker: { register: () => { hivasok.register++; return Promise.resolve(); } } },
    configurable: true, writable: true
  });
  globalThis.window = {
    isSecureContext: true,
    addEventListener: (esemeny, fn) => { if (esemeny === "load") hivasok.loadFigyelo.push(fn); }
  };
  globalThis.document = {
    readyState, documentElement: {}, addEventListener() {},
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null
  };
  return hivasok;
}

// a modul betöltéskor a window-hoz nyúl: előbb a hamis környezet
pwaKornyezet("complete");
const { swRegisztracio } = await import(new URL("js/pwa.js", PUBLIC));

test("PWA: ha a load már lefutott, azonnal regisztrál", () => {
  const h = pwaKornyezet("complete");
  swRegisztracio();
  assert.equal(h.register, 1);
  assert.equal(h.loadFigyelo.length, 0);
});

test("PWA: ha a load még nem futott le, arra vár, és utána regisztrál", () => {
  const h = pwaKornyezet("loading");
  swRegisztracio();
  assert.equal(h.register, 0);
  assert.equal(h.loadFigyelo.length, 1);
  h.loadFigyelo[0]();
  assert.equal(h.register, 1);
});

// ── Beadás: feltöltés alatt a képlista zárolt ──
test("beadas.html: a feltöltés másolatból dolgozik, és közben a lista nem módosítható", () => {
  const src = forras("beadas.html");
  assert.match(src, /let feltoltesFut = false;/);
  assert.match(src, /const lista = \[\.\.\.fajlok\];/);
  assert.equal(/for \(let i = 0; i < fajlok\.length; i\+\+\)/.test(src), false,
    "a feltöltési ciklus a közben módosítható tömbből dolgozik");
  assert.match(src, /if \(!b \|\| feltoltesFut\) return;/, "a törlés nincs zárolva");
  assert.match(src, /if \(feltoltesFut\) return;\s*\n\s*uzenetTorles/, "a fájlválasztás nincs zárolva");
});

// ── Javítóablak: a korábbi lekérés nem írhatja felül az újabbat ──
test("javitas.html: a megnyitás kérésazonosítót használ, a bezárás érvényteleníti", () => {
  // A kikommentezett védelem nem védelem: a megjegyzéseket előbb eltávolítjuk
  // (a `//` csak sor elején / szóköz után, hogy az URL-eket ne vágja le).
  const src = forras("javitas.html")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
  assert.match(src, /const sorszam = \+\+megnyitasSzam;/);
  assert.match(src, /const bezar = \(\) => \{ megnyitasSzam\+\+;/);
  assert.ok((src.match(/if \(elavult\(\)\) return;/g) || []).length >= 5, "nem minden await után van ellenőrzés");
});

// ── Feladatszerkesztés: a feladatlap cseréje mentődik ──
test("feladatok.html: a szerkesztés a feladatlapot is menti, ha van", () => {
  const src = forras("feladatok.html");
  assert.match(src, /mezok\.feladatlap = \{/);
  assert.match(src, /updateDoc\(feladatRef, mezok\)/);
  assert.match(src, /batch\.update\(feladatRef, mezok\)/);
});
