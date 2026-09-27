// ══════════════════════════════════════════════════════
// Fejléc-navigáció
//
// Miért külön teszt: telefonon az oldalsáv rejtve van, telepített
// appban a böngésző vissza gombja sincs. Ilyenkor a fejléc az EGYETLEN
// navigáció – ha egy lap kimarad a hierarchiából, arról nincs visszaút,
// és ez semmilyen hibát nem dob. Éles hibaként derült ki, telefonon.
//
// A `history.back()` helyett logikai szülőt használunk, mert a history
// mélylinkről vagy telepített appból indulva nem oda visz, ahova a
// felhasználó számít. Ez a hierarchia viszont ellenőrizhető.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const PUBLIC = new URL("../public/", import.meta.url);

/**
 * Kód kommentek nélkül. A fejlec.js fejében a kommentek MAGYARÁZZÁK,
 * miért nem history.back()-et használunk – a szöveges keresés pedig
 * ettől hamis pozitívot adna.
 */
function kodCsak(szoveg) {
  return szoveg
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const { SZULO, KEZDOLAP, NEVEK, szuloLapja, kezdolapja } =
  await import("../public/js/fejlec.js");

const KEZDOLAPOK = Object.values(KEZDOLAP);

/** A kapuzott lapok: amelyik a guard vedettOldal() hívását használja. */
const kapuzottLapok = readdirSync(new URL(".", PUBLIC))
  .filter((f) => f.endsWith(".html"))
  .filter((f) => readFileSync(new URL(f, PUBLIC), "utf8").includes("vedettOldal("));

// ══════════════════════════════════════════
// A HIERARCHIA
// ══════════════════════════════════════════

test("MINDEN kapuzott lap vagy kezdőlap, vagy van szülője", () => {
  // Ez a lényegi védelem: egy később hozzávett lapról könnyű lemaradni,
  // és akkor arról telefonon nincs visszaút.
  assert.ok(kapuzottLapok.length >= 8, `csak ${kapuzottLapok.length} kapuzott lap`);
  for (const lap of kapuzottLapok) {
    const kezdo = KEZDOLAPOK.includes(lap);
    const szulo = szuloLapja(lap);
    assert.ok(
      kezdo || szulo,
      `${lap}: se nem kezdőlap, se nincs szülője – onnan nincs visszaút`
    );
  }
});

test("a kezdőlapoknak NINCS szülője", () => {
  // Kezdőlapon a vissza gomb félrevezető lenne: nincs hova felmenni.
  for (const lap of KEZDOLAPOK) {
    assert.equal(szuloLapja(lap), null, `${lap} kezdőlap, mégis van szülője`);
  }
});

test("minden szülő létező lap", () => {
  for (const [lap, szulo] of Object.entries(SZULO)) {
    assert.ok(existsSync(new URL(lap, PUBLIC)), `nincs ilyen lap: ${lap}`);
    assert.ok(existsSync(new URL(szulo, PUBLIC)), `${lap} szülője nem létezik: ${szulo}`);
  }
});

test("a szülő-lánc mindig kezdőlapon ér véget", () => {
  // Kör vagy zsákutca esetén a tanár körbe-körbe járna.
  for (const lap of Object.keys(SZULO)) {
    let mostani = lap;
    const jart = new Set([lap]);
    for (let i = 0; i < 10; i++) {
      const kov = szuloLapja(mostani);
      if (!kov) break;
      assert.equal(jart.has(kov), false, `kör a hierarchiában: ${lap} → ${kov}`);
      jart.add(kov);
      mostani = kov;
    }
    assert.ok(
      KEZDOLAPOK.includes(mostani),
      `${lap} lánca nem kezdőlapon ér véget, hanem: ${mostani}`
    );
  }
});

test("a lánc rövid – legfeljebb két lépés a kezdőlapig", () => {
  // Háromnál több szint egy telefonos appban már labirintus.
  //
  // A ciklus KORLÁTOS, nem `while (szuloLapja(...))`: egy körnél az
  // utóbbi végtelenségig futna, és a tesztfájl megállás helyett
  // lefagyna. (Ez nem elméleti: a negatív kontroll így akadt meg.)
  const KORLAT = 10;
  for (const lap of Object.keys(SZULO)) {
    let mostani = lap, lepes = 0;
    while (szuloLapja(mostani) && lepes < KORLAT) {
      mostani = szuloLapja(mostani);
      lepes++;
    }
    assert.ok(lepes < KORLAT, `${lap}: nem ér véget a lánc (kör?)`);
    assert.ok(lepes <= 2, `${lap}: ${lepes} lépés a kezdőlapig`);
  }
});

test("minden szülőnek van emberi neve a gombhoz", () => {
  for (const szulo of new Set(Object.values(SZULO))) {
    assert.ok(NEVEK[szulo], `nincs felirat ehhez: ${szulo}`);
  }
});

test("a diák lapjai a diák kezdőlapjára vezetnek, nem a tanáriba", () => {
  // Egy elrontott hierarchia a diákot a tanári felületre küldené, ahol
  // a guard visszairányítja – végtelen pattogás lenne belőle.
  for (const lap of ["beadas.html", "visszajelzes.html"]) {
    assert.equal(szuloLapja(lap), KEZDOLAP.diak, `${lap} rossz kezdőlapra vezet`);
  }
});

test("kezdolapja() ismeretlen szerepnél a belépőre esik vissza", () => {
  assert.equal(kezdolapja("tanar"), "tanar.html");
  assert.equal(kezdolapja("diak"), "diak.html");
  assert.equal(kezdolapja("valami"), "index.html");
  assert.equal(kezdolapja(undefined), "index.html");
});

// ══════════════════════════════════════════
// BEKÖTÉS ÉS MEGJELENÉS
// ══════════════════════════════════════════

test("a guard.js betölti a fejléc-navigációt", () => {
  const guard = kodCsak(readFileSync(new URL("js/guard.js", PUBLIC), "utf8"));
  assert.match(guard, /import\(["']\.\/fejlec\.js["']\)/);
  assert.match(guard, /fejlecBeallit/);
  // A hibája ne akadályozza a belépést
  assert.match(guard, /import\(["']\.\/fejlec\.js["']\)[\s\S]{0,200}?\.catch\(/);
});

test("a márkanév linkké válik, nem marad div", () => {
  // A tanár erre kattintva akar a főoldalra jutni – éles kérés volt.
  // Kommentek nélkül vizsgáljuk: egy kikommentezett sor is egyezett.
  const kod = kodCsak(readFileSync(new URL("js/fejlec.js", PUBLIC), "utf8"));
  assert.match(kod, /createElement\("a"\)/);
  assert.match(kod, /marka\.replaceWith\(link\)/);
});

test("a vissza gomb NEM history.back()-et használ", () => {
  const kod = kodCsak(readFileSync(new URL("js/fejlec.js", PUBLIC), "utf8"));
  assert.equal(
    /history\.back|history\.go/.test(kod), false,
    "history-alapú vissza: mélylinkről kivezetne az appból"
  );
});

test("nyitott modálnál a vissza gomb a modált zárja, nem navigál", () => {
  const kod = kodCsak(readFileSync(new URL("js/fejlec.js", PUBLIC), "utf8"));
  assert.match(kod, /\.modal\.show/);
  assert.match(kod, /preventDefault/);
});

test("a topbar bal oldala egy csoportban van", () => {
  // A topbar space-between-nel rendez: csoport nélkül a márkanév
  // középre sodródna a vissza gomb beszúrása után.
  const css = readFileSync(new URL("css/app.css", PUBLIC), "utf8");
  assert.match(css, /\.topbar-left\s*\{/);
  assert.match(css, /\.topbar-left[^}]*min-width:\s*0/);
  const kod = kodCsak(readFileSync(new URL("js/fejlec.js", PUBLIC), "utf8"));
  assert.match(kod, /topbar-left/);
});

test("szűk kijelzőn a feliratok helyet adnak a vissza gombnak", () => {
  // 375px-en a topbar korábban 14px tartalékkal fért el. A vissza gomb
  // 38px-et kér, tehát valaminek zsugorodnia kell – mérve ellenőrizve,
  // de a szabálynak itt is látszania kell.
  const css = readFileSync(new URL("css/app.css", PUBLIC), "utf8");
  const szuk = css.slice(css.lastIndexOf("@media (max-width: 500px)"));
  assert.match(szuk, /\.btn-vissza-nev\s*\{\s*display:\s*none/);
  assert.match(szuk, /\.btn-logout\s*\{[^}]*font-size:\s*0/);
});
