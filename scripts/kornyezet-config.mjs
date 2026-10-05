// ══════════════════════════════════════════════════════
// Környezeti konfig (config/<env>.json) – betöltés, ellenőrzés, és a
// kliensbe kerülő fájlok előállítása. A scripts/build.mjs és a
// tests/kornyezet.test.mjs használja. Lásd docs/kornyezetek-terv.md 4.
// ══════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");

export const KORNYEZETEK = ["pilot", "prod"];
export const ALAP_KORNYEZET = "pilot";
export const NYELVEK = ["hu", "en"];
export const WEB_KONFIG_KULCSOK = [
  "apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"
];

export function konfigBetoltes(nev, gyoker = GYOKER) {
  if (!KORNYEZETEK.includes(nev)) {
    throw new Error(`Ismeretlen környezet: "${nev}". Lehetséges: ${KORNYEZETEK.join(", ")}`);
  }
  return JSON.parse(readFileSync(join(gyoker, "config", `${nev}.json`), "utf8"));
}

/**
 * Hibák listája (üres, ha rendben). A `kitoltott` kapcsoló: a build csak
 * teljesen kitöltött konfiggal mehet; a prod-é a projekt létrehozásáig
 * (B. lépés) üres, ezért a szerkezetet és a kitöltöttséget külön kérdezzük.
 */
export function konfigHibak(cfg, { kitoltott = false } = {}) {
  const hibak = [];
  if (!KORNYEZETEK.includes(cfg?.kornyezet)) hibak.push("kornyezet: ismeretlen érték");
  if (!NYELVEK.includes(cfg?.alapnyelv)) hibak.push("alapnyelv: hu vagy en");
  if (typeof cfg?.teszt_sav !== "boolean") hibak.push("teszt_sav: logikai érték kell");
  if (typeof cfg?.kvota !== "boolean") hibak.push("kvota: logikai érték kell");
  if (typeof cfg?.tanari_onregisztracio !== "boolean") hibak.push("tanari_onregisztracio: logikai érték kell");
  if (typeof cfg?.projekt !== "string") hibak.push("projekt: szöveg kell");
  const wc = cfg?.webConfig;
  for (const k of WEB_KONFIG_KULCSOK) {
    if (typeof wc?.[k] !== "string") hibak.push(`webConfig.${k}: szöveg kell`);
    else if (kitoltott && !wc[k].trim()) hibak.push(`webConfig.${k}: üres`);
  }
  if (kitoltott) {
    if (!cfg.projekt) hibak.push("projekt: üres");
    if (wc?.projectId && cfg.projekt && wc.projectId !== cfg.projekt) {
      hibak.push("webConfig.projectId nem egyezik a projekt azonosítójával");
    }
  }
  return hibak;
}

/** A dist/js/kornyezet.js forrása (a public/js/kornyezet.js mintájára). */
export function kornyezetJs(cfg, sablon) {
  const csere = {
    KORNYEZET: JSON.stringify(cfg.kornyezet),
    ALAPNYELV: JSON.stringify(cfg.alapnyelv),
    KVOTA: JSON.stringify(cfg.kvota),
    TANARI_ONREGISZTRACIO: JSON.stringify(cfg.tanari_onregisztracio),
    TESZT_SAV: JSON.stringify(cfg.teszt_sav)
  };
  let ki = sablon;
  for (const [nev, ertek] of Object.entries(csere)) {
    const minta = new RegExp(`^export const ${nev} = .*;$`, "m");
    if (!minta.test(ki)) throw new Error(`kornyezet.js: hiányzik az "export const ${nev}" sor`);
    ki = ki.replace(minta, () => `export const ${nev} = ${ertek};`);
  }
  return ki;
}

/** A firebase-config.js `firebaseConfig` objektumának cseréje. */
export function firebaseConfigCsere(forras, webConfig) {
  const minta = /const firebaseConfig = \{[\s\S]*?\n\};/;
  if (!minta.test(forras)) throw new Error("firebase-config.js: nem található a firebaseConfig objektum");
  const torzs = WEB_KONFIG_KULCSOK
    .map((k) => `  ${k}: ${JSON.stringify(webConfig[k])}`)
    .join(",\n");
  return forras.replace(minta, () => `const firebaseConfig = {\n${torzs}\n};`);
}
