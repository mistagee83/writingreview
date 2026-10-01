// ══════════════════════════════════════════════════════
// Deploy egy környezetre – úgy, hogy a build és a projekt ne csúszhasson el.
//
//   node scripts/deploy.mjs pilot [firebase deploy további paraméterei]
//   node scripts/deploy.mjs prod --yes [...]
//
// A hosting a hozzá való környezeti konfiggal épül (WR_ENV), a functions a
// functions/.env.<alias> fájlt kapja (firebase --project <alias>). A prodra
// csak a --yes kapcsolóval megy (éles, fizető felhasználók).
// Példa: node scripts/deploy.mjs pilot --only hosting,functions
// ══════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import { KORNYEZETEK, konfigBetoltes, konfigHibak } from "./kornyezet-config.mjs";

const [kornyezet, ...tovabbi] = process.argv.slice(2);
if (!KORNYEZETEK.includes(kornyezet)) {
  console.error(`Használat: node scripts/deploy.mjs <${KORNYEZETEK.join("|")}> [--yes] [firebase deploy paraméterek]`);
  process.exit(1);
}

const hibak = konfigHibak(konfigBetoltes(kornyezet), { kitoltott: true });
if (hibak.length) {
  console.error(`A(z) ${kornyezet} konfigja nem teljes (config/${kornyezet}.json):`);
  hibak.forEach((h) => console.error("  " + h));
  process.exit(1);
}

const yes = tovabbi.includes("--yes");
const parameterek = tovabbi.filter((p) => p !== "--yes");
if (kornyezet === "prod" && !yes) {
  console.error("A prod éles környezet: add meg a --yes kapcsolót, ha biztosan telepíteni akarsz.");
  process.exit(1);
}

console.log(`Deploy: ${kornyezet}`);
const r = spawnSync("firebase", ["deploy", "--project", kornyezet, ...parameterek], {
  stdio: "inherit",
  shell: true, // Windowson a firebase egy .cmd
  env: { ...process.env, WR_ENV: kornyezet }
});
process.exit(r.status ?? 1);
