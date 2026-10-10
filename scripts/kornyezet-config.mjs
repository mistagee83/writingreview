// ══════════════════════════════════════════════════════
// Környezeti konfig (config/<env>.json) – betöltés, ellenőrzés, és a
// kliensbe kerülő fájlok előállítása. A scripts/build.mjs és a
// tests/kornyezet.test.mjs használja. Lásd docs/kornyezetek-terv.md 4.
// ══════════════════════════════════════════════════════

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
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

/** A Firebase-projekt azonosítója a `.firebaserc` aliasából (pl. prod → writerev2). */
export function celProjekt(alias, gyoker = GYOKER) {
  const rc = JSON.parse(readFileSync(join(gyoker, ".firebaserc"), "utf8"));
  return rc.projects?.[alias];
}

/**
 * Melyik környezetre épüljön a kliens? A kért környezet (--env / WR_ENV) vagy – ha
 * nincs – a Firebase CLI által a predeploy hooknak átadott célprojekt (GCLOUD_PROJECT)
 * dönt. A kettő nem mondhat ellent: különben a prodra telepített kliens pilot
 * konfiggal épülne (vagy fordítva). Célprojekt és kérés nélkül (helyi build) a pilot.
 * @throws {Error} ellentmondás, ismeretlen környezet vagy ismeretlen célprojekt esetén
 */
export function kornyezetValasztas({ arg, wrEnv, gcloudProjekt } = {}, betolt = konfigBetoltes) {
  const kert = arg || wrEnv || "";
  if (kert) {
    const projekt = betolt(kert).projekt;   // ismeretlen névre dob
    if (gcloudProjekt && projekt !== gcloudProjekt) {
      throw new Error(
        `A build a(z) ${kert} környezetre készülne (${projekt}), de a Firebase célprojektje ${gcloudProjekt}. ` +
        `Használd a node scripts/deploy.mjs <pilot|prod> parancsot, vagy javítsd a WR_ENV értékét.`
      );
    }
    return kert;
  }
  if (gcloudProjekt) {
    const egyezo = KORNYEZETEK.find((k) => betolt(k).projekt === gcloudProjekt);
    if (!egyezo) {
      throw new Error(
        `A Firebase célprojektje (${gcloudProjekt}) egyik környezet konfigjához sem tartozik ` +
        `(${KORNYEZETEK.map((k) => `${k}: ${betolt(k).projekt}`).join(", ")}).`
      );
    }
    return egyezo;
  }
  return ALAP_KORNYEZET;
}

// A wrapper saját célprojektjét/konfigját felülíró vagy titkot hordozó kapcsolók, és a
// shell-metakaraktereket tartalmazó paraméterek (a deploy shell:true-val fut, Windowson
// a firebase egy .cmd).
const TILTOTT_KAPCSOLO = /^(--project|-P|--config|--token|--account|-c)(=|$)/;
const BIZTONSAGOS_PARAMETER = /^[A-Za-z0-9_:.,=/@+-]+$/;

/** @returns {string|null} a hiba oka, ha a firebase deploy paraméter nem adható tovább */
export function deployParameterHiba(p) {
  if (TILTOTT_KAPCSOLO.test(p)) return `${p}: a célprojektet/konfigot a wrapper adja`;
  if (!BIZTONSAGOS_PARAMETER.test(p)) return `${p}: nem engedélyezett karakterek (szóköz, shell-metakarakter)`;
  return null;
}

/**
 * Hibák listája (üres, ha rendben). A `kitoltott` kapcsoló: a build csak
 * teljesen kitöltött konfiggal mehet; a prod-é a projekt létrehozásáig
 * (B. lépés) üres, ezért a szerkezetet és a kitöltöttséget külön kérdezzük.
 * Az `elvartKornyezet` / `celProjekt` a konfig fájlját köti a kért környezethez
 * és a `.firebaserc` szerinti projekthez (egy felcserélt/átmásolt konfig ne épülhessen).
 */
export function konfigHibak(cfg, { kitoltott = false, elvartKornyezet, celProjekt: cel } = {}) {
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
  if (elvartKornyezet && cfg?.kornyezet !== elvartKornyezet) {
    hibak.push(`kornyezet: ${cfg?.kornyezet} (a kért környezet: ${elvartKornyezet})`);
  }
  if (cel && cfg?.projekt !== cel) {
    hibak.push(`projekt: ${cfg?.projekt} nem egyezik a Firebase célprojekttel (${cel}, .firebaserc)`);
  }
  if (cel && wc?.projectId && wc.projectId !== cel) {
    hibak.push(`webConfig.projectId: ${wc.projectId} nem egyezik a Firebase célprojekttel (${cel})`);
  }
  if (kitoltott) {
    if (!cfg.projekt) hibak.push("projekt: üres");
    if (wc?.projectId && cfg.projekt && wc.projectId !== cfg.projekt) {
      hibak.push("webConfig.projectId nem egyezik a projekt azonosítójával");
    }
  }
  return hibak;
}

/** Egy .env fájl KULCS=érték sorai (a kommentek és az üres sorok kimaradnak). */
export function envBetoltes(fajl) {
  const ki = {};
  if (!existsSync(fajl)) return ki;
  for (const sor of readFileSync(fajl, "utf8").split(/\r?\n/)) {
    const m = sor.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m) ki[m[1]] = m[2].trim();
  }
  return ki;
}

/** Ugyanaz a szabály, mint a szervernél (functions/kornyezet.js): csak érvényes Stripe-árazonosító számít. */
const ARAZONOSITO = /^price_[A-Za-z0-9_]+$/;

/**
 * A nyitóoldalon megjelenő csomag-adatok EGY forrásból: az árak szövege a functions/.env.<alias>-ból
 * (ugyanaz, amit a szerver a csomag-panelnek ad), a keretek a functions/kvota.js-ből. A fizetés csak ott él,
 * ahol a szerveren is (prod, beállított alap-ár); egyébként a nyitóoldal nem mutat árakat.
 */
export function csomagAdatok(alias, gyoker = GYOKER) {
  const env = envBetoltes(join(gyoker, "functions", `.env.${alias}`));
  const kvota = createRequire(import.meta.url)(join(gyoker, "functions", "kvota.js"));
  const szoveg = (kulcs) => String(env[kulcs] || "").trim().slice(0, 40);
  const fizetes = alias === "prod" && ARAZONOSITO.test(String(env.FIZETES_AR_ALAP || "").trim());
  const profiAr = ARAZONOSITO.test(String(env.FIZETES_AR_PROFI || "").trim());
  return {
    fizetes,
    arak: fizetes ? { alap: szoveg("FIZETES_AR_SZOVEG"), ...(profiAr ? { profi: szoveg("FIZETES_AR_PROFI_SZOVEG") } : {}) } : {},
    keretek: Object.fromEntries(["ingyenes", "alap", "profi"].map((n) => [n, kvota.CSOMAGOK[n].keret]))
  };
}

/** A public/js/kornyezet.js (pilot) alapértékei: a build nélküli helyi előnézet és a teszt ezzel egyezik. */
const PILOT_CSOMAG = { fizetes: false, arak: {}, keretek: { ingyenes: 20, alap: 150, profi: 500 } };

/** A dist/js/kornyezet.js forrása (a public/js/kornyezet.js mintájára). */
export function kornyezetJs(cfg, sablon, csomag = PILOT_CSOMAG) {
  const csere = {
    FIZETES: JSON.stringify(csomag.fizetes),
    ARAK: JSON.stringify(csomag.arak),
    KERETEK: JSON.stringify(csomag.keretek),
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
