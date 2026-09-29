// ══════════════════════════════════════════════════════
// A szakmai pontozó modul böngészős változata
//
// A pontozás EGY helyen van megírva: functions/szakmai.js (CommonJS, a
// Cloud Functions ezt használja). A tanári felületnek ugyanez kell –
// mentés előtt ugyanazzal a kulcsEllenorzes()-sel validál, és a javító
// nézet ugyanazzal a kerdesPontozas()-sal számol újra, ha a tanár
// felülír egy elemet. Két kézzel karbantartott példány előbb-utóbb
// elcsúszna, és a tanár mást látna, mint amit a szerver számol.
//
// Ezért a public/js/szakmai.js GENERÁLT: ez a szkript a CommonJS
// exportot ES-modul exportra cseréli. A build (scripts/build.mjs)
// deploy előtt magától lefuttatja, a tests/szakmai.test.mjs pedig
// ellenőrzi, hogy a repóban lévő példány friss.
//
// Kézi futtatás:  node scripts/szakmai-kliens.mjs
// ══════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FORRAS = join(GYOKER, "functions", "szakmai.js");
export const CEL = join(GYOKER, "public", "js", "szakmai.js");

const FEJLEC = `// ══════════════════════════════════════════════════════
// GENERÁLT FÁJL – NE SZERKESZD KÉZZEL.
// Forrás: functions/szakmai.js
// Újragenerálás: node scripts/szakmai-kliens.mjs (a build is lefuttatja)
// ══════════════════════════════════════════════════════

`;

/** A CommonJS forrásból ES-modul. */
export function kliensKod(forras) {
  const szoveg = forras.replace(/\r\n/g, "\n");
  if (/\brequire\s*\(/.test(szoveg)) {
    throw new Error("A functions/szakmai.js nem használhat require()-t – a böngészőben is futnia kell.");
  }
  const minta = /\nmodule\.exports = \{/;
  if (!minta.test(szoveg)) {
    throw new Error("Nem találom a 'module.exports = {' sort a functions/szakmai.js végén.");
  }
  return FEJLEC + szoveg.replace(minta, "\nexport {");
}

export function generalas() {
  const kod = kliensKod(readFileSync(FORRAS, "utf8"));
  writeFileSync(CEL, kod);
  return kod;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generalas();
  console.log("public/js/szakmai.js újragenerálva.");
}
