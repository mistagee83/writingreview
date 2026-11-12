// ══════════════════════════════════════════════════════
// App Check a diákoldalon (8e, docs/prod-atalakitas-terv.md)
//
// Miért teszt: az App Check két feléből (a kliens küldi a tokent, a szerver megköveteli) ha
// csak a szerveroldal kapcsol be, minden diák-beadás elbukik; ha a kliens kulcs nélkül is
// betöltené a reCAPTCHA-t, a diák böngészője fölöslegesen a Google-hoz fordulna. Ezért:
// kulcs és kapcsoló nélkül semmi nem változhat, és a kettő csak a diákoldalt érinti.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

process.env.GCLOUD_PROJECT = "wr-app-check-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { beallitasok } = require("./kornyezet.js");
const { kornyezetJs, konfigHibak, envBetoltes } = await import("../scripts/kornyezet-config.mjs");
const olvas = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const DIAK_FUGGVENYEK = ["linkAdatok", "linkBeadas", "diakVisszajelzes"];

test("a szerver kapcsolója: csak APP_CHECK=igen kapcsolja be, minden más (és a hiánya) ki", () => {
  assert.equal(beallitasok({ KORNYEZET: "prod" }).appCheck, false);
  for (const ertek of ["", "nem", "true", "1", "yes"]) {
    assert.equal(beallitasok({ KORNYEZET: "prod", APP_CHECK: ertek }).appCheck, false, ertek);
  }
  assert.equal(beallitasok({ KORNYEZET: "prod", APP_CHECK: "igen" }).appCheck, true);
  assert.equal(beallitasok({ KORNYEZET: "prod", APP_CHECK: " Igen " }).appCheck, true);
});

test("a prod .env-ben a kapcsoló ki van kapcsolva, amíg nincs kliens-kulcs (különben minden beadás elbukna)", () => {
  const env = envBetoltes(fileURLToPath(new URL("../functions/.env.prod", import.meta.url)));
  assert.ok("APP_CHECK" in env, "a .env.prod beolvasható, és dokumentálja a kapcsolót");
  const prod = JSON.parse(olvas("../config/prod.json"));
  if (String(env.APP_CHECK || "").trim().toLowerCase() === "igen") {
    assert.ok(prod.app_check_kulcs, "APP_CHECK=igen csak akkor, ha a config/prod.json-ban van app_check_kulcs");
  }
});

test("csak a három diákoldali függvény kapja az App Check-es opciókat, a tanári függvények nem", () => {
  const src = olvas("../functions/index.js");
  assert.match(src, /const DIAK_HIVAS_OPCIOK = \{ \.\.\.HIVAS_OPCIOK, enforceAppCheck: BEALLITASOK\.appCheck \};/);
  for (const nev of DIAK_FUGGVENYEK) {
    assert.match(src, new RegExp(`exports\\.${nev} = onCall\\(DIAK_HIVAS_OPCIOK,`), nev);
  }
  const tobbi = [...src.matchAll(/exports\.(\w+) = onCall\(DIAK_HIVAS_OPCIOK,/g)].map((m) => m[1]);
  assert.deepEqual(tobbi.sort(), [...DIAK_FUGGVENYEK].sort(), "más függvény ne kapja meg");
});

test("a konfigban a kulcs szöveg (üres is lehet); a build a kornyezet.js-be írja", () => {
  for (const env of ["pilot", "prod"]) {
    const cfg = JSON.parse(olvas(`../config/${env}.json`));
    assert.equal(typeof cfg.app_check_kulcs, "string", env);
    assert.deepEqual(konfigHibak(cfg), [], env);
  }
  const pilot = JSON.parse(olvas("../config/pilot.json"));
  assert.deepEqual(konfigHibak({ ...pilot, app_check_kulcs: undefined }).filter((h) => h.startsWith("app_check")).length, 1);
  assert.equal(konfigHibak({ ...pilot, app_check_kulcs: "rossz kulcs\"; alert(1)" }).filter((h) => h.startsWith("app_check")).length, 1,
    "a kulcs a JS-be kerül: csak biztonságos karakterek");

  const sablon = olvas("../public/js/kornyezet.js");
  assert.match(sablon, /export const APP_CHECK_KULCS = "";/, "a public/ (pilot) példányban nincs kulcs");
  assert.match(kornyezetJs({ ...pilot, app_check_kulcs: "6LcAbC_d-1" }, sablon), /export const APP_CHECK_KULCS = "6LcAbC_d-1";/);
});

test("a kliens: kulcs nélkül semmit nem tölt be; csak a két diákoldal indítja, a hívások előtt", async () => {
  const fc = olvas("../public/js/firebase-config.js");
  assert.match(fc, /export async function appCheckInditas\(kulcs\) \{\n  if \(!kulcs\) return false;/);
  assert.ok(!/^import .*firebase-app-check/m.test(fc), "a reCAPTCHA csak dinamikusan, kulccsal töltődik be");

  for (const lap of ["iras.html", "visszajelzes.html"]) {
    const html = olvas(`../public/${lap}`);
    const inditas = html.indexOf("await appCheckInditas(APP_CHECK_KULCS)");
    assert.ok(inditas > 0, `${lap}: nincs App Check indítás`);
    const elsoHivas = html.search(/await (linkAdatok|linkBeadas|diakVisszajelzes)\(/);
    assert.ok(elsoHivas < 0 || inditas < elsoHivas, `${lap}: az App Check az első hívás előtt induljon`);
  }
  // tanári oldal nem indít App Checket (a reCAPTCHA csak a diákoldalon kell)
  for (const lap of ["javitas.html", "feladatok.html", "megosztas.html", "csoport.html", "tanar.html", "belepes.html"]) {
    assert.ok(!olvas(`../public/${lap}`).includes("appCheckInditas"), lap);
  }
});

// A követelményt a könyvtár a kérés kiszolgálásakor (HTTP-kezelő) érvényesíti, nem a .run()-ban: ezért valódi
// kérés-objektummal próbáljuk, külön folyamatban (a kapcsolót a függvények betöltése előtt kell beállítani).
const PROBA = `
const fn = require(process.env.WR_GYOKER + "/functions/index.js");
const h = { "content-type": "application/json", origin: "http://localhost:5500" };
const req = { method: "POST", url: "/", headers: h, header: (n) => h[n.toLowerCase()], get: (n) => h[n.toLowerCase()],
  body: { data: { token: "rossz" } }, rawBody: Buffer.from('{"data":{"token":"rossz"}}') };
const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; },
  getHeader(k) { return this.headers[k]; }, set(k, v) { this.headers[k] = v; return this; }, vary() { return this; },
  send() { process.stdout.write("STATUSZ:" + this.statusCode); return this; }, json(b) { return this.send(b); },
  end(b) { return this.send(b); }, on() {} };
fn.linkBeadas(req, res);`;

async function diakHivasStatusza(appCheck) {
  const { spawnSync } = await import("node:child_process");
  const gyoker = fileURLToPath(new URL("..", import.meta.url)).replace(/[\/]$/, "");
  const r = spawnSync(process.execPath, ["-e", PROBA], {
    encoding: "utf8",
    env: { ...process.env, WR_GYOKER: gyoker, GCLOUD_PROJECT: "wr-app-check-teszt", GEMINI_API_KEY: "x", APP_CHECK: appCheck }
  });
  return Number((r.stdout.match(/STATUSZ:(\d+)/) || [])[1]);
}

test("kérés-szinten: kapcsoló nélkül a diákhívás eljut a függvényig, APP_CHECK=igen mellett token nélkül 401", async () => {
  assert.equal(await diakHivasStatusza(""), 400, "a függvény maga utasítja el a rossz tokent (link_ervenytelen)");
  assert.equal(await diakHivasStatusza("igen"), 401, "App Check-token nélkül el sem jut a függvényig");
});
