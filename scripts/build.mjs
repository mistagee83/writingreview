// ══════════════════════════════════════════════════════
// WritingReview – deploy build
//
// A public/ fájlokat átmásolja a dist/-be, és a CSS/JS fájlokat
// tartalom-hash-sel átnevezi (app.css → app.a1b2c3d4.css), közben
// átírja a rájuk mutató hivatkozásokat.
//
// Miért: a hashelt fájlnév mellett a böngésző örökre cache-elheti a
// fájlt (immutable, 1 év), MÉGIS azonnal megkapja az újat deploy után,
// mert más lesz a neve. Hash nélkül vagy lassú (no-cache), vagy
// elavult tartalmat lát (max-age).
//
// A public/ marad a szerkeszthető forrás – lokális fejlesztéskor
// (.claude/launch.json) azt szolgáljuk ki, olvasható fájlnevekkel.
// A dist/ generált, nem kell verziókövetésbe.
//
// A firebase.json predeploy hookja hívja, tehát a `firebase deploy`
// magától lefuttatja.
// ══════════════════════════════════════════════════════

import { createHash } from "node:crypto";
import {
  cpSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync
} from "node:fs";
import { join, dirname, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generalas } from "./kifejtos-kliens.mjs";
import {
  ALAP_KORNYEZET, konfigBetoltes, konfigHibak, kornyezetJs, firebaseConfigCsere
} from "./kornyezet-config.mjs";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(GYOKER, "public");
const OUT = join(GYOKER, "dist");

// Ezekben a könyvtárakban hashelünk
const HASH_KONYVTARAK = ["css", "js"];

// ── segédek ──

const hash = (szoveg) =>
  createHash("sha256").update(szoveg).digest("hex").slice(0, 8);

/** Minden fájl relatív útvonala egy könyvtárban, rekurzívan. */
function fajlok(dir, alap = dir) {
  const ki = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ki.push(...fajlok(p, alap));
    else ki.push(relative(alap, p).replace(/\\/g, "/"));
  }
  return ki;
}

/** app.css + a1b2c3d4 → app.a1b2c3d4.css */
function hashNev(utvonal, h) {
  const ext = extname(utvonal);
  return utvonal.slice(0, -ext.length) + "." + h + ext;
}

/**
 * Kommentek nélküli kód. A modulok fejében példa importok vannak
 * dokumentációként (pl. "// import { vedettOldal } from './js/guard.js'") –
 * azok nem valódi hivatkozások, nem kell (és nem is szabad) átírni őket.
 *
 * A sor-komment minta sor ELEJÉHEZ van kötve, hogy egy "https://" ne
 * essen áldozatul.
 */
function kodCsak(tartalom) {
  return tartalom
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Egy JS fájl helyi (relatív) importjai, dist-relatív útvonalként.
 *
 * A DINAMIKUS importot is fel kell ismerni (`import("./tura.js")`),
 * nem csak a statikus `from "./x.js"` alakot. A sorrend ezen múlik: ha
 * a build nem tudja, hogy A függ B-től, akkor A-t hashelheti előbb, és
 * a benne lévő hivatkozás hash nélkül marad – a dist-ben 404.
 * A guard.js → tura.js pont ilyen volt.
 */
function helyiImportok(distUtvonal, tartalom) {
  const kod = kodCsak(tartalom);
  const dir = dirname(distUtvonal);
  const ki = new Set();
  const mintak = [
    /from\s*['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g
  ];
  for (const minta of mintak) {
    for (const m of kod.matchAll(minta)) {
      ki.add(join(dir, m[1]).replace(/\\/g, "/"));
    }
  }
  return [...ki];
}

/**
 * Egy hivatkozás átírása. Kétféle alakot kezel:
 *   "js/guard.js"          – HTML-ből, gyökér-relatívan
 *   "./firebase-config.js" – egy szomszédos JS modulból
 */
function hivatkozasAtir(tartalom, regi, uj, aktualisFajl) {
  let ki = tartalom.split(regi).join(uj);
  if (dirname(aktualisFajl) === dirname(regi)) {
    ki = ki.split("./" + basename(regi)).join("./" + basename(uj));
  }
  return ki;
}

// ══════════════════════════════════════════
// 0. GENERÁLT FORRÁSOK
// A kifejtős pontozó böngészős példánya a functions/kifejtos.js-ből
// készül – deploy előtt mindig frissen, hogy ne mehessen ki elavult.
// ══════════════════════════════════════════
generalas();

// ══════════════════════════════════════════
// 0/b. KÖRNYEZET
// `node scripts/build.mjs --env prod` vagy WR_ENV=prod. Alapból a pilot.
// A public/ a pilot értékeit hordozza; a dist/-be a kiválasztott
// környezet konfigja kerül (lásd docs/kornyezetek-terv.md 4.).
// ══════════════════════════════════════════
const envArgIdx = process.argv.indexOf("--env");
const KORNYEZET = (envArgIdx >= 0 ? process.argv[envArgIdx + 1] : process.env.WR_ENV) || ALAP_KORNYEZET;
const konfig = konfigBetoltes(KORNYEZET);
const konfigHiba = konfigHibak(konfig, { kitoltott: true });
if (konfigHiba.length) {
  console.error(`A(z) ${KORNYEZET} környezet konfigja (config/${KORNYEZET}.json) nem teljes:`);
  konfigHiba.forEach((h) => console.error("  " + h));
  process.exit(1);
}

// ══════════════════════════════════════════
// 1. TISZTA DIST
// ══════════════════════════════════════════
// A maxRetries/retryDelay pont az EPERM/EBUSY esetekre van: a OneDrive
// (és a Windows indexelő) egy ideig fogja a frissen írt fájlokat, ezért
// a dist törlése időnként elhasal. Enélkül a deploy véletlenszerűen bukik.
rmSync(OUT, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

// A környezet-függő fájlok felülírása – a hashelés előtt, hogy a hash a végleges tartalomé legyen.
for (const [fajl, atalakit] of [
  ["js/kornyezet.js", (src) => kornyezetJs(konfig, src)],
  ["js/firebase-config.js", (src) => firebaseConfigCsere(src, konfig.webConfig)]
]) {
  const f = join(OUT, fajl);
  writeFileSync(f, atalakit(readFileSync(f, "utf8")));
}

// ══════════════════════════════════════════
// 2. HASHELÉS FÜGGŐSÉGI SORRENDBEN
//
// A firebase-config.js-t előbb kell hashelni, mint a guard.js-t, mert
// az utóbbi hivatkozik rá – és a hivatkozás átírása megváltoztatja a
// guard.js tartalmát, tehát a hash-ét is.
// ══════════════════════════════════════════
const eszkozok = fajlok(OUT).filter(
  (f) => HASH_KONYVTARAK.includes(f.split("/")[0]) && /\.(css|js)$/.test(f)
);

const terkep = new Map(); // régi dist-relatív útvonal → új
let marad = [...eszkozok];

while (marad.length) {
  const kesz = [];

  for (const p of marad) {
    let tartalom = readFileSync(join(OUT, p), "utf8");

    // Csak akkor hashelhető, ha minden helyi függősége már hashelt
    const fuggosegek = p.endsWith(".js") ? helyiImportok(p, tartalom) : [];
    if (fuggosegek.some((d) => eszkozok.includes(d) && !terkep.has(d))) continue;

    for (const [regi, uj] of terkep) {
      tartalom = hivatkozasAtir(tartalom, regi, uj, p);
    }

    const ujUtvonal = hashNev(p, hash(tartalom));
    writeFileSync(join(OUT, p), tartalom);
    renameSync(join(OUT, p), join(OUT, ujUtvonal));

    terkep.set(p, ujUtvonal);
    kesz.push(p);
  }

  if (kesz.length === 0) {
    console.error("Feloldatlan vagy körkörös függőség:", marad);
    process.exit(1);
  }
  marad = marad.filter((p) => !kesz.includes(p));
}

// ══════════════════════════════════════════
// 3. HTML HIVATKOZÁSOK ÁTÍRÁSA
// ══════════════════════════════════════════
const htmlFajlok = fajlok(OUT).filter((f) => f.endsWith(".html"));

for (const h of htmlFajlok) {
  let tartalom = readFileSync(join(OUT, h), "utf8");
  for (const [regi, uj] of terkep) {
    tartalom = hivatkozasAtir(tartalom, regi, uj, h);
  }
  writeFileSync(join(OUT, h), tartalom);
}

// ══════════════════════════════════════════
// 4. ELLENŐRZÉS
// Ha maradt hash nélküli hivatkozás egy hashelt fájlra, az 404 lenne
// élesben – inkább most bukjunk el, mint deploy után.
// ══════════════════════════════════════════
const hibak = [];
for (const f of [...htmlFajlok, ...[...terkep.values()].filter((v) => v.endsWith(".js"))]) {
  const tartalom = kodCsak(readFileSync(join(OUT, f), "utf8"));
  for (const regi of terkep.keys()) {
    // "css/app.css" vagy "./firebase-config.js" alak maradt-e
    if (tartalom.includes(regi)) hibak.push(`${f} → ${regi}`);
    if (
      dirname(f) === dirname(regi) &&
      tartalom.includes("./" + basename(regi))
    ) {
      hibak.push(`${f} → ./${basename(regi)}`);
    }
  }
}

if (hibak.length) {
  console.error("Átíratlan hivatkozások maradtak:");
  hibak.forEach((h) => console.error("  " + h));
  process.exit(1);
}

// ══════════════════════════════════════════
// 5. ÖSSZEGZÉS
// ══════════════════════════════════════════
console.log(`dist/ elkészült (${KORNYEZET}) – ${fajlok(OUT).length} fájl`);
for (const [regi, uj] of terkep) {
  const kb = (statSync(join(OUT, uj)).size / 1024).toFixed(1);
  console.log(`  ${regi.padEnd(26)} → ${basename(uj).padEnd(34)} ${kb} kB`);
}
