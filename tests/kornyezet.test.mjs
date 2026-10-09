// ══════════════════════════════════════════════════════
// Két környezet (pilot / prod) – konfig, build, szerver-CORS
//
// Miért: a két telepítés ugyanazt a kódot futtatja, az eltérés a
// konfigban van. Ha a két konfig szerkezete elcsúszik, vagy a pilot
// dist-je mást kap, mint a public/, az élesben derülne ki.
// Lásd docs/kornyezetek-terv.md.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  KORNYEZETEK, WEB_KONFIG_KULCSOK, konfigBetoltes, konfigHibak, kornyezetJs, firebaseConfigCsere,
  kornyezetValasztas, celProjekt, deployParameterHiba
} from "../scripts/kornyezet-config.mjs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { corsLista, beallitasok } = require("./kornyezet.js");

// A build a környezetet a WR_ENV-ből / a Firebase CLI célprojektjéből (GCLOUD_PROJECT) is
// veszi: az emulátoros futtatás (firebase emulators:exec) ezt a pilotra állítja, ezért a
// build-próbák tiszta környezetet kapnak.
const tisztaKornyezet = () => {
  const env = { ...process.env };
  delete env.GCLOUD_PROJECT;
  delete env.WR_ENV;
  return env;
};

const pilot = konfigBetoltes("pilot");
const prod = konfigBetoltes("prod");
const publikus = (f) => readFileSync(new URL(`../public/js/${f}`, import.meta.url), "utf8");

// ── konfigok ──

test("mindkét konfig szerkezete érvényes, a kulcskészletük azonos", () => {
  assert.deepEqual(konfigHibak(pilot), []);
  assert.deepEqual(konfigHibak(prod), []);
  assert.deepEqual(Object.keys(pilot).sort(), Object.keys(prod).sort());
  assert.deepEqual(Object.keys(pilot.webConfig).sort(), [...WEB_KONFIG_KULCSOK].sort());
  assert.deepEqual(KORNYEZETEK, [pilot.kornyezet, prod.kornyezet]);
});

test("a pilot teljesen kitöltött; a prod a B. lépésig üres lehet, de akkor nem épülhet", () => {
  assert.deepEqual(konfigHibak(pilot, { kitoltott: true }), []);
  const prodKesz = konfigHibak(prod, { kitoltott: true }).length === 0;
  const r = spawnSync(process.execPath, ["scripts/build.mjs", "--env", "prod"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", env: tisztaKornyezet()
  });
  // Kitöltetlen prod konfignál a build nem mehet át (különben üres Firebase-config kerülne ki).
  if (!prodKesz) assert.notEqual(r.status, 0);
  // Kitöltött prod konfignál ne ezen bukjon (a pilot dist-et a következő teszt újraépíti).
  else assert.equal(r.status, 0, r.stderr);
});

test("a kereskedelmi verzió jellemzői: angol alapnyelv és kvóta; a pilot magyar, kvóta nélkül; egyikben sincs TESZT sáv", () => {
  assert.equal(pilot.alapnyelv, "hu");
  // A pilotot a kollégák éles munkára is használják, ezért nincs rajta „TESZT” sáv.
  assert.equal(pilot.teszt_sav, false);
  assert.equal(pilot.kvota, false);
  assert.equal(prod.alapnyelv, "en");
  assert.equal(prod.teszt_sav, false);
  assert.equal(prod.kvota, true);
});

test("az önkiszolgáló tanári regisztráció csak a kereskedelmi verzióban él, a kliens és a szerver egyezően", () => {
  assert.equal(pilot.tanari_onregisztracio, false);
  assert.equal(prod.tanari_onregisztracio, true);
  // a szerver ugyanazt dönti el a KORNYEZET-ből, mint a kliens konfigja
  assert.equal(beallitasok({ KORNYEZET: "pilot" }).tanariOnregisztracio, pilot.tanari_onregisztracio);
  assert.equal(beallitasok({ KORNYEZET: "prod" }).tanariOnregisztracio, prod.tanari_onregisztracio);
  // ismeretlen/hiányzó környezet → pilot → kikapcsolva (a biztonságos irány)
  assert.equal(beallitasok({}).tanariOnregisztracio, false);
  // a public/ (helyi előnézet, pilot) kikapcsolva
  assert.match(publikus("kornyezet.js"), /export const TANARI_ONREGISZTRACIO = false;/);
});

test("a konfig-ellenőrzés elkapja a hibás értékeket", () => {
  const rossz = structuredClone(pilot);
  rossz.alapnyelv = "de";
  rossz.kvota = "igen";
  rossz.tanari_onregisztracio = 1;
  delete rossz.webConfig.appId;
  assert.equal(konfigHibak(rossz).length, 4);

  const eltero = structuredClone(pilot);
  eltero.webConfig.projectId = "masik-projekt";
  assert.ok(konfigHibak(eltero, { kitoltott: true }).some((h) => h.includes("nem egyezik")));
  assert.throws(() => konfigBetoltes("staging"), /Ismeretlen környezet/);
});

// ── a kliensbe kerülő fájlok ──

test("a public/ a pilot értékeit hordozza (helyi előnézet), és a build ugyanezt írja a pilotnak", () => {
  const kornyezet = publikus("kornyezet.js");
  assert.equal(kornyezetJs(pilot, kornyezet), kornyezet);

  const fc = publikus("firebase-config.js");
  assert.equal(firebaseConfigCsere(fc, pilot.webConfig), fc);
});

test("a prod konfig a kornyezet.js és a firebase-config.js megfelelő részeit cseréli, mást nem", () => {
  const kesz = structuredClone(prod);
  kesz.projekt = "wr-prod";
  Object.assign(kesz.webConfig, {
    apiKey: "k", authDomain: "wr-prod.firebaseapp.com", projectId: "wr-prod",
    storageBucket: "wr-prod.firebasestorage.app", messagingSenderId: "1", appId: "1:1:web:x"
  });
  assert.deepEqual(konfigHibak(kesz, { kitoltott: true }), []);

  const k = kornyezetJs(kesz, publikus("kornyezet.js"));
  assert.match(k, /export const KORNYEZET = "prod";/);
  assert.match(k, /export const ALAPNYELV = "en";/);
  assert.match(k, /export const KVOTA = true;/);
  assert.match(k, /export const TANARI_ONREGISZTRACIO = true;/);
  assert.match(k, /export const TESZT_SAV = false;/);

  const fc = firebaseConfigCsere(publikus("firebase-config.js"), kesz.webConfig);
  assert.match(fc, /projectId: "wr-prod"/);
  assert.ok(!fc.includes("writingreview-41e59"), "a pilot azonosítója nem maradhat a prod konfigban");
  assert.ok(fc.includes("export const REGION"), "a konfig körüli kód érintetlen");
});

test("az i18n az alapnyelvet a telepítés konfigjából veszi", () => {
  const i18n = publikus("i18n.js");
  assert.match(i18n, /import \{ ALAPNYELV \} from "\.\/kornyezet\.js"/);
  assert.match(i18n, /TARTALEK_NYELV = SZOTARAK\[ALAPNYELV\]/);
});

test("a pilot build dist-je a pilot Firebase-configját és alapnyelvét kapja", () => {
  const r = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", env: tisztaKornyezet()
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dist\/ elkészült \(pilot\)/);
});

// ── szerver ──

test("a CORS-lista a projektből áll össze, és csak https egyéni domaint fogad el", () => {
  const l = corsLista("wr-prod", "https://app.pelda.hu/, http://rossz.hu, *, https://masik.hu:8443,  ,https://app.pelda.hu");
  assert.deepEqual(l, [
    "http://127.0.0.1:5500", "http://localhost:5500",
    "https://wr-prod.web.app", "https://wr-prod.firebaseapp.com",
    "https://app.pelda.hu", "https://masik.hu:8443"
  ]);
  // domain nélkül csak a projekt két címe és a helyi előnézet
  assert.equal(corsLista("p").length, 4);
});

test("a pilot CORS-lista pontosan a korábbi, beégetett lista", () => {
  assert.deepEqual(corsLista("writingreview-41e59"), [
    "http://127.0.0.1:5500", "http://localhost:5500",
    "https://writingreview-41e59.web.app", "https://writingreview-41e59.firebaseapp.com"
  ]);
});

test("a szerver beállításai: alapból pilot, kvóta csak prodban; ismeretlen érték → pilot", () => {
  assert.equal(beallitasok({}).kornyezet, "pilot");
  assert.equal(beallitasok({}).kvota, false);
  assert.equal(beallitasok({}).projekt, "writingreview-41e59");
  const p = beallitasok({ KORNYEZET: "prod", GCLOUD_PROJECT: "wr-prod", ENGEDELYEZETT_DOMAINEK: "https://app.pelda.hu" });
  assert.equal(p.kvota, true);
  assert.ok(p.cors.includes("https://wr-prod.web.app") && p.cors.includes("https://app.pelda.hu"));
  assert.equal(beallitasok({ KORNYEZET: "staging" }).kornyezet, "pilot");
});

// ── deploy-bekötés ──

const json = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));

test("a hosting-cél mindkét projekten kötve van (különben a deploy elhasal), a prod külön oldalra megy", () => {
  const cel = json("firebase.json").hosting.target;
  assert.ok(cel, "a firebase.json hostingjának kell target");
  const rc = json(".firebaserc");
  for (const [alias, projekt] of [["pilot", pilot.projekt], ["prod", prod.projekt]]) {
    assert.equal(rc.projects[alias], projekt, `${alias} alias`);
    assert.ok(rc.targets[projekt]?.hosting?.[cel]?.length === 1, `${projekt}: a ${cel} cél nincs oldalhoz kötve`);
  }
  // A pilot a saját alapoldalán marad, a prod másik oldalon.
  assert.deepEqual(rc.targets[pilot.projekt].hosting[cel], [pilot.projekt]);
  assert.notEqual(rc.targets[prod.projekt].hosting[cel][0], prod.projekt);
});

test("a prod egyéni hosting-oldala (és a firebaseapp címe) a CORS-ban szerepel", () => {
  const env = readFileSync(new URL("../functions/.env.prod", import.meta.url), "utf8");
  const domainek = /^ENGEDELYEZETT_DOMAINEK=(.*)$/m.exec(env)?.[1] ?? "";
  const oldal = json(".firebaserc").targets[prod.projekt].hosting[json("firebase.json").hosting.target][0];
  const cors = corsLista(prod.projekt, domainek);
  assert.ok(cors.includes(`https://${oldal}.web.app`));
  assert.ok(cors.includes(`https://${oldal}.firebaseapp.com`));
  assert.ok(cors.includes(`https://${prod.projekt}.web.app`), "az alapoldal is marad");
});


// ── Külső audit 4. kör: a build/deploy környezet-kötése ──

test("környezetválasztás: a kért környezet és a Firebase célprojektje nem mondhat ellent", () => {
  // prod célprojekt + WR_ENV nélkül: a prod konfig épül (a közvetlen `firebase deploy --project prod` is)
  assert.equal(kornyezetValasztas({ gcloudProjekt: prod.projekt }), "prod");
  assert.equal(kornyezetValasztas({ gcloudProjekt: pilot.projekt }), "pilot");
  // egyező kérés
  assert.equal(kornyezetValasztas({ wrEnv: "prod", gcloudProjekt: prod.projekt }), "prod");
  assert.equal(kornyezetValasztas({ arg: "pilot", wrEnv: "prod" }), "pilot", "a --env erősebb a WR_ENV-nél");
  // ellentmondás: prodra telepítés pilot kéréssel, és fordítva
  assert.throws(() => kornyezetValasztas({ wrEnv: "pilot", gcloudProjekt: prod.projekt }), /célprojekt/);
  assert.throws(() => kornyezetValasztas({ arg: "prod", gcloudProjekt: pilot.projekt }), /célprojekt/);
  // ismeretlen célprojekt / ismeretlen környezet
  assert.throws(() => kornyezetValasztas({ gcloudProjekt: "valami-mas" }), /egyik környezet/);
  assert.throws(() => kornyezetValasztas({ arg: "staging" }), /Ismeretlen környezet/);
  // helyi build célprojekt nélkül: pilot
  assert.equal(kornyezetValasztas({}), "pilot");
});

test("a build a célprojekttel ellentmondó kérésre leáll, célprojekt alapján a prodot építi", () => {
  const fut = (env) => spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", env: { ...tisztaKornyezet(), ...env }
  });
  const ellentmondas = fut({ WR_ENV: "pilot", GCLOUD_PROJECT: prod.projekt });
  assert.notEqual(ellentmondas.status, 0, "a prodra szánt build pilot kéréssel nem mehet");
  assert.match(ellentmondas.stderr, /célprojekt/);
  // A tényleges kimenet: a prod célprojekt WR_ENV nélkül is a prod Firebase-configot kapja.
  // A dist/ fájlnevei hash-eltek; a végén a pilot buildet állítjuk vissza (a dist ne maradjon prodon).
  try {
    const prodBuild = fut({ GCLOUD_PROJECT: prod.projekt });
    assert.equal(prodBuild.status, 0, prodBuild.stderr);
    const js = new URL("../dist/js/", import.meta.url);
    const dist = (elo) => readFileSync(new URL(readdirSync(js).find((f) => f.startsWith(elo)), js), "utf8");
    const fc = dist("firebase-config.");
    assert.ok(fc.includes(prod.webConfig.projectId) && !fc.includes(pilot.webConfig.projectId),
      "a prod célprojekt pilot Firebase-configgal épült");
    assert.match(dist("kornyezet."), /export const KORNYEZET = "prod";/);
  } finally {
    assert.equal(fut({ WR_ENV: "pilot" }).status, 0);
  }
});

test("konfig-kötés: az átmásolt/felcserélt konfig elutasítva a kért környezetre és a .firebaserc szerint", () => {
  // helyes párok
  for (const k of KORNYEZETEK) {
    const c = konfigBetoltes(k);
    assert.deepEqual(konfigHibak(c, { kitoltott: true, elvartKornyezet: k, celProjekt: celProjekt(k) }), []);
  }
  // a pilot konfig a prod fájl helyén (érvényes, de nem prod)
  const hibak = konfigHibak(pilot, { kitoltott: true, elvartKornyezet: "prod", celProjekt: celProjekt("prod") });
  assert.ok(hibak.some((h) => /kornyezet/.test(h)), "a környezet-név eltérés nem jelzett");
  assert.ok(hibak.some((h) => /Firebase célprojekt/.test(h)), "a projekt-eltérés nem jelzett");
  // helyes környezetnév, de az aliastól eltérő (belül egyező) projekt
  const masProjekt = { ...prod, projekt: "masik-projekt", webConfig: { ...prod.webConfig, projectId: "masik-projekt" } };
  assert.ok(konfigHibak(masProjekt, { kitoltott: true, elvartKornyezet: "prod", celProjekt: celProjekt("prod") }).length > 0);
  // a .firebaserc aliasai a konfigok projektjeire mutatnak
  assert.equal(celProjekt("prod"), prod.projekt);
  assert.equal(celProjekt("pilot"), pilot.projekt);
});

test("deploy-paraméterek: a célprojektet/konfigot felülíró kapcsolók és a shell-metakarakterek tiltva", () => {
  for (const jo of ["--only", "hosting,functions,firestore:rules", "functions:szerepBeallitas", "--force", "--dry-run"]) {
    assert.equal(deployParameterHiba(jo), null, jo);
  }
  for (const rossz of ["--project", "--project=prod", "-P", "--config", "--config=x.json", "--token", "--account",
    "hosting & echo x", "hosting;rm", "$(whoami)", "a|b", "`x`", ">out", "\"x\""]) {
    assert.notEqual(deployParameterHiba(rossz), null, rossz);
  }
});
