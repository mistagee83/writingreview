// ══════════════════════════════════════════════════════
// Deploy egy környezetre – úgy, hogy a build és a projekt ne csúszhasson el.
//
//   node scripts/deploy.mjs pilot [firebase deploy további paraméterei]
//   node scripts/deploy.mjs prod --yes [...]
//
// A hosting a hozzá való környezeti konfiggal épül (WR_ENV), a functions a
// functions/.env.<alias> fájlt kapja (firebase --project <alias>). A prodra
// csak a --yes kapcsolóval megy (éles, fizető felhasználók). A pilot csak a `pilot`
// ágról, a prod csak a `main`-ről telepíthető (két külön termék, 2026-11-12 óta).
// Példa: node scripts/deploy.mjs pilot --only hosting,functions
// ══════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import { KORNYEZETEK, konfigBetoltes, konfigHibak, celProjekt, deployParameterHiba, deployAgHiba } from "./kornyezet-config.mjs";

const [kornyezet, ...tovabbi] = process.argv.slice(2);
if (!KORNYEZETEK.includes(kornyezet)) {
  console.error(`Használat: node scripts/deploy.mjs <${KORNYEZETEK.join("|")}> [--yes] [firebase deploy paraméterek]`);
  process.exit(1);
}

// A két környezet két külön ágon él (pilot: `pilot`, prod: `main`), lásd deployAgHiba.
const git = (...a) => spawnSync("git", a, { encoding: "utf8" });
const ag = git("rev-parse", "--abbrev-ref", "HEAD").stdout?.trim();
const mainOse = ["main", "origin/main"].some((m) => git("merge-base", "--is-ancestor", "HEAD", m).status === 0);
const agHiba = deployAgHiba(kornyezet, { ag, mainOse });
if (agHiba) {
  console.error(agHiba);
  process.exit(1);
}

// A konfig fájlja a kért környezethez és a .firebaserc szerinti projekthez kötött:
// egy átmásolt/felcserélt config/prod.json nem mehet ki.
const hibak = konfigHibak(konfigBetoltes(kornyezet), {
  kitoltott: true, elvartKornyezet: kornyezet, celProjekt: celProjekt(kornyezet)
});
if (hibak.length) {
  console.error(`A(z) ${kornyezet} konfigja nem teljes (config/${kornyezet}.json):`);
  hibak.forEach((h) => console.error("  " + h));
  process.exit(1);
}

const yes = tovabbi.includes("--yes");
const parameterek = tovabbi.filter((p) => p !== "--yes");
const rossz = parameterek.map(deployParameterHiba).filter(Boolean);
if (rossz.length) {
  console.error("Nem adható tovább a firebase deploy-nak:");
  rossz.forEach((h) => console.error("  " + h));
  process.exit(1);
}
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
