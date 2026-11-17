// ══════════════════════════════════════════════════════
// A hub közös moduljainak másolata (kreditek, jogosultság)
//
// A forrás a hub repója (Mr. Andrew's EdTech Hub: shared/credits.js, shared/entitlements.js);
// változtatni CSAK ott szabad, utána ezzel a szkripttel kell frissíteni a másolatokat.
// A másolatok a repóban vannak (a CI a hub repóját nem látja):
//   functions/hub/*.mjs  – a Cloud Functions (CommonJS) dinamikus import()-tal tölti be
// (a tanári felület nem számol: a kreditállapotot a kreditAllapot callable adja)
//
// Használat: node scripts/hub-masolat.mjs [a hub mappája]   (alapból: ../Edtechhub)
// Ellenőrzés (eltér-e a másolat a forrástól): node scripts/hub-masolat.mjs --ellenoriz
// ══════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GYOKER = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ellenoriz = args.includes("--ellenoriz");
const hub = resolve(args.find((a) => !a.startsWith("--")) ?? join(GYOKER, "..", "Edtechhub"));

const FAJLOK = ["credits", "entitlements"];
const CELOK = (nev) => [join(GYOKER, "functions", "hub", `${nev}.mjs`)];

if (!existsSync(join(hub, "shared", "credits.js"))) {
  console.error(`Nem találom a hub repót: ${hub} (add meg az útvonalát: node scripts/hub-masolat.mjs <mappa>)`);
  process.exit(1);
}

let elteres = 0;
for (const nev of FAJLOK) {
  const forras = readFileSync(join(hub, "shared", `${nev}.js`), "utf8");
  for (const cel of CELOK(nev)) {
    const regi = existsSync(cel) ? readFileSync(cel, "utf8") : null;
    if (regi === forras) continue;
    elteres++;
    if (ellenoriz) { console.error(`Eltér a forrástól: ${cel}`); continue; }
    mkdirSync(dirname(cel), { recursive: true });
    writeFileSync(cel, forras);
    console.log(`Frissítve: ${cel}`);
  }
}
if (ellenoriz && elteres) process.exit(1);
if (!elteres) console.log("A hub-másolatok naprakészek.");
