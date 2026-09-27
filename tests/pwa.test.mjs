// ══════════════════════════════════════════════════════
// Telepíthető alkalmazás (PWA)
//
// Miért külön teszt: ebből a funkcióból szinte minden CSENDBEN romlik
// el. Ha egy ikon átnevezésre kerül, a telepítés egyszerűen nem
// ajánlódik fel – hibaüzenet nincs. Ha a sw.js bekerül a hashelt
// könyvtárba, a böngésző nem találja, és soha nem frissül. Ha a
// no-cache fejléc lemarad, egy hibás service workert nem tudunk
// visszavonni a felhasználóktól.
//
// Ezek nem elméleti kockázatok: mindegyik egy-egy elírás.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const GYOKER = new URL("../", import.meta.url);
const PUBLIC = new URL("public/", GYOKER);

const manifest = JSON.parse(
  readFileSync(new URL("manifest.webmanifest", PUBLIC), "utf8")
);
const sw = readFileSync(new URL("sw.js", PUBLIC), "utf8");
const hosting = JSON.parse(readFileSync(new URL("firebase.json", GYOKER), "utf8"));

/** Egy PNG tényleges mérete a fejlécéből (IHDR), nem a fájlnévből. */
function pngMeret(utvonal) {
  const b = readFileSync(utvonal);
  const alairas = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < alairas.length; i++) {
    assert.equal(b[i], alairas[i], `nem PNG: ${utvonal}`);
  }
  // 8 bájt aláírás + 4 hossz + 4 "IHDR" → 16-tól a szélesség
  return {
    szelesseg: b.readUInt32BE(16),
    magassag: b.readUInt32BE(20),
    szintipus: b[25]   // 6 = RGBA
  };
}

// ══════════════════════════════════════════
// MANIFEST
// ══════════════════════════════════════════

test("a manifest tartalmazza a telepítéshez kötelező mezőket", () => {
  // Ezek nélkül a böngésző nem ajánlja fel a telepítést, és nem is szól.
  for (const mezo of ["name", "short_name", "start_url", "icons", "display"]) {
    assert.ok(manifest[mezo], `hiányzó mező: ${mezo}`);
  }
  assert.ok(
    ["standalone", "fullscreen", "minimal-ui"].includes(manifest.display),
    `a display "${manifest.display}" nem telepíthető megjelenítés`
  );
  assert.equal(manifest.lang, "hu");
});

test("a rövid név elfér a főképernyőn", () => {
  // A telefonok kb. 12 karakter után elvágják az ikon feliratát.
  assert.ok(
    manifest.short_name.length <= 14,
    `a short_name túl hosszú (${manifest.short_name.length}): levágná a telefon`
  );
});

test("van 192-es és 512-es ikon, és van maszkolható is", () => {
  const meretek = manifest.icons.map((i) => i.sizes);
  assert.ok(meretek.includes("192x192"), "nincs 192x192 ikon");
  assert.ok(meretek.includes("512x512"), "nincs 512x512 ikon");
  // Maszkolható nélkül az Android a saját hátterére teszi a jelet,
  // és csúnya fehér keretet rajzol körbe.
  assert.ok(
    manifest.icons.some((i) => (i.purpose || "").includes("maskable")),
    "nincs maskable ikon"
  );
});

test("minden hivatkozott ikon LÉTEZIK és a megadott méretű", () => {
  // A "sizes" csak egy felirat – a böngésző a tényleges képet tölti be.
  // Ha a kettő elcsúszik, a telepítés elhasal vagy csúnya lesz.
  for (const ikon of manifest.icons) {
    const rel = ikon.src.replace(/^\//, "");
    const p = new URL(rel, PUBLIC);
    assert.ok(existsSync(p), `nincs ilyen ikonfájl: ${ikon.src}`);

    const { szelesseg, magassag, szintipus } = pngMeret(p);
    const [vart] = ikon.sizes.split("x").map(Number);
    assert.equal(szelesseg, vart, `${ikon.src}: a szélesség nem ${vart}`);
    assert.equal(magassag, vart, `${ikon.src}: a magasság nem ${vart}`);
    assert.equal(szintipus, 6, `${ikon.src}: nem RGBA (áttetszőség nélkül)`);
  }
});

test("a parancsok létező lapokra mutatnak", () => {
  for (const p of manifest.shortcuts || []) {
    const rel = p.url.replace(/^\//, "");
    assert.ok(
      existsSync(new URL(rel, PUBLIC)),
      `a "${p.name}" parancs nem létező lapra mutat: ${p.url}`
    );
  }
});

// ══════════════════════════════════════════
// STABIL URL-EK
// ══════════════════════════════════════════

test("a sw.js és a manifest NEM a hashelt könyvtárakban van", () => {
  // A build a css/ és js/ könyvtárban tartalom-hasht tesz a fájlnévbe.
  // A böngésző viszont fix URL-en keresi a service workert (/sw.js) és
  // a HTML-ben megadott manifestet – ha hashelődnének, 404 lenne.
  for (const fajl of ["sw.js", "manifest.webmanifest", "offline.html"]) {
    assert.ok(existsSync(new URL(fajl, PUBLIC)), `nincs public/${fajl}`);
  }
  const hasheltKonyvtarak = ["css", "js"];
  const buildKod = readFileSync(new URL("scripts/build.mjs", GYOKER), "utf8");
  const talalat = buildKod.match(/HASH_KONYVTARAK = \[([^\]]*)\]/);
  assert.ok(talalat, "nem találom a build hashelt könyvtárainak listáját");
  const tenyleges = talalat[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ""));
  assert.deepEqual(
    tenyleges, hasheltKonyvtarak,
    "megváltoztak a hashelt könyvtárak – a /sw.js is hashelődhet"
  );
});

test("a hosting nem engedi cache-elni a sw.js-t", () => {
  // Ez a visszavonás lehetősége. Ha a böngésző egy napig a régi
  // service workert használja, egy hibás változatot nem tudunk
  // visszahívni a felhasználóktól.
  const fejlec = hosting.hosting.headers.find((h) => h.source === "/sw.js");
  assert.ok(fejlec, "nincs fejléc-szabály a /sw.js-re");
  const cc = fejlec.headers.find((h) => h.key === "Cache-Control")?.value || "";
  assert.match(cc, /no-cache|max-age=0/, `a sw.js cache-elhető: "${cc}"`);
});

test("az ikonok nem kapnak örök cache-t", () => {
  // Nem tartalom-hasheltek, tehát egy ikoncsere sosem jutna ki.
  const fejlec = hosting.hosting.headers.find((h) => h.source === "/icons/**");
  assert.ok(fejlec, "nincs fejléc-szabály az ikonokra");
  const cc = fejlec.headers.find((h) => h.key === "Cache-Control")?.value || "";
  assert.equal(/immutable/.test(cc), false, "az ikonok immutable cache-t kapnak");
});

// ══════════════════════════════════════════
// SERVICE WORKER – AMIHEZ NEM NYÚLHAT
// ══════════════════════════════════════════

test("a service worker kihagyja az idegen eredetű kéréseket", () => {
  // A Firestore és az Auth saját folyamokat használ. Ha azokat
  // elkapnánk, néma, nehezen debugolható hibák lennének belőle.
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /method !== "GET"/);
  assert.match(sw, /startsWith\("\/__\/"\)/);
});

test("a HTML sosem jön elsőre a gyorsítótárból", () => {
  // Ez a frissítés útja: ha a HTML cache-first lenne, egy új telepítés
  // sosem jutna ki a már telepített appokhoz.
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /async function lapKeres/);
  // A lapKeres törzsében a fetch előbb van, mint a tar.match
  const torzs = sw.slice(sw.indexOf("async function lapKeres"));
  const fetchNel = torzs.indexOf("await fetch(kures)");
  const tarNal = torzs.indexOf("tar.match(kures)");
  assert.ok(fetchNel > -1 && tarNal > -1 && fetchNel < tarNal,
    "a lapKeres a gyorsítótárból szolgál ki elsőre");
});

test("csak a hashelt eszközök jönnek gyorsítótárból elsőre", () => {
  assert.match(sw, /\/\^\\\/\(css\|js\)\\\//);
  assert.match(sw, /async function eszkozKeres/);
});

test("a régi gyorsítótárak törlődnek aktiválásnál", () => {
  // Enélkül minden változatnál nő a felhasználó tárhelye.
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /clients\.claim/);
});

// ══════════════════════════════════════════
// A LAPOK BEKÖTÉSE
// ══════════════════════════════════════════

const lapok = readdirSync(new URL(".", PUBLIC))
  .filter((f) => f.endsWith(".html"));

test("MINDEN lap hivatkozik a manifestre és az ikonokra", () => {
  // Drift-védelem: egy később hozzávett lapról könnyű lemaradni, és
  // akkor arról a lapról nem telepíthető az app.
  assert.ok(lapok.length >= 10, `csak ${lapok.length} lapot találtam`);
  for (const lap of lapok) {
    const html = readFileSync(new URL(lap, PUBLIC), "utf8");
    assert.match(html, /rel="manifest"/, `${lap}: nincs manifest link`);
    assert.match(html, /rel="apple-touch-icon"/, `${lap}: nincs apple-touch-icon`);
    assert.match(html, /name="theme-color"/, `${lap}: nincs theme-color`);
  }
});

test("a theme-color egyezik a topbar színével", () => {
  // Telefonon az állapotsáv ezt a színt veszi fel. Ha elcsúszik a
  // topbartól, egy csík látszik a tetején.
  const css = readFileSync(new URL("css/app.css", PUBLIC), "utf8");
  const ink = css.match(/--ink:\s*(#[0-9a-f]{3,6})/i)?.[1];
  assert.ok(ink, "nem találom az --ink színt");
  assert.equal(manifest.theme_color.toLowerCase(), ink.toLowerCase());

  for (const lap of lapok) {
    const html = readFileSync(new URL(lap, PUBLIC), "utf8");
    const szin = html.match(/name="theme-color" content="(#[0-9a-f]{3,6})"/i)?.[1];
    assert.equal(szin?.toLowerCase(), ink.toLowerCase(), `${lap}: más theme-color`);
  }
});

test("a service worker bejegyzése nem akadályozhatja a belépést", () => {
  // Ha a regisztráció hibája feljebb bukna, egy service worker gond
  // kizárná a felhasználót a saját appjából.
  const pwa = readFileSync(new URL("js/pwa.js", PUBLIC), "utf8");
  assert.match(pwa, /\.catch\(/, "a register() hibája nincs elkapva");
  assert.match(pwa, /isSecureContext/);

  const guard = readFileSync(new URL("js/guard.js", PUBLIC), "utf8");
  assert.match(guard, /import\(["']\.\/pwa\.js["']\)[\s\S]{0,200}?\.catch\(/);
});

test("a telepítést nem user-agent alapján döntjük el", () => {
  // A UA-szimatolás törékeny: minden böngészőfrissítés elavulttá teszi.
  // A pwa.js a beforeinstallprompt eseményből tudja, van-e natív út.
  const pwa = readFileSync(new URL("js/pwa.js", PUBLIC), "utf8");
  assert.match(pwa, /beforeinstallprompt/);
  assert.equal(
    /userAgent|platform\b/.test(pwa), false,
    "a pwa.js user-agentet vizsgál"
  );
});
