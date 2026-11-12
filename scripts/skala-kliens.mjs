// ══════════════════════════════════════════════════════
// A jegyskála-modul böngészős változata
//
// A jegyskála, a jegyjavaslat és a bekezdésekre tagolás EGY helyen van
// megírva: functions/skala.js (CommonJS, a Cloud Functions ezt használja).
// A tanári felületnek ugyanez kell (a jegyskála-űrlap ugyanazzal
// ellenőriz, a javító nézet ugyanazzal javasol jegyet). Két kézzel
// karbantartott példány előbb-utóbb elcsúszna.
//
// Ezért a public/js/skala.js GENERÁLT: ez a szkript a CommonJS exportot
// ES-modul exportra cseréli. A build (scripts/build.mjs) deploy előtt
// magától lefuttatja, a tests/skala-jegy.test.mjs pedig ellenőrzi, hogy a
// repóban lévő példány friss.
//
// Kézi futtatás:  node scripts/skala-kliens.mjs
// ══════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FORRAS = join(GYOKER, "functions", "skala.js");
export const CEL = join(GYOKER, "public", "js", "skala.js");

const FEJLEC = `// ══════════════════════════════════════════════════════
// GENERÁLT FÁJL – NE SZERKESZD KÉZZEL.
// Forrás: functions/skala.js
// Újragenerálás: node scripts/skala-kliens.mjs (a build is lefuttatja)
// ══════════════════════════════════════════════════════

`;

/** A CommonJS forrásból ES-modul. */
export function kliensKod(forras) {
  const szoveg = forras.replace(/\r\n/g, "\n");
  if (/\brequire\s*\(/.test(szoveg)) {
    throw new Error("A functions/skala.js nem használhat require()-t – a böngészőben is futnia kell.");
  }
  const minta = /\nmodule\.exports = \{/;
  if (!minta.test(szoveg)) {
    throw new Error("Nem találom a 'module.exports = {' sort a functions/skala.js végén.");
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
  console.log("public/js/skala.js újragenerálva.");
}
