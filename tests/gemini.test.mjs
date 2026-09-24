// ══════════════════════════════════════════════════════
// Gemini-hívás: újrapróbálkozás és tartalék modell
//
// A fetch-et kicseréljük, tehát NEM hívunk valódi API-t. Azt teszteljük,
// hogy egy átmeneti "high demand" hibából felépül-e a rendszer, és hogy
// egy véglegesnek tűnő hibát nem ismételget-e hiába.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-gemini-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let t;
let eredetiFetch;

before(() => {
  t = require("./index.js")._teszt;
  // A tesztek ne várjanak 10 másodpercet a backoff miatt
  t.UJRAPROBA.varakozasok = [1, 1];
});

beforeEach(() => {
  eredetiFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = eredetiFetch;
});

/** Modell-nevet nyer ki a kérés URL-jéből. */
function modellUrlbol(url) {
  return String(url).match(/models\/([^:]+):/)?.[1];
}

/** Sikeres Gemini-válasz. */
const OK_VALASZ = (adat = { ok: true }) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify(adat) }] } }]
  })
});

/** Hibás Gemini-válasz. */
const HIBA_VALASZ = (status, message, apiStatus) => ({
  ok: false,
  status,
  json: async () => ({ error: { code: status, message, status: apiStatus } })
});

const HIGH_DEMAND =
  "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.";

// ══════════════════════════════════════════
// atmenetiHiba osztályozás
// ══════════════════════════════════════════

test("a 'high demand' üzenet átmeneti hibának számít", () => {
  assert.equal(t.atmenetiHiba(503, { message: HIGH_DEMAND, status: "UNAVAILABLE" }), true);
});

test("a 429 (kvóta) átmeneti", () => {
  assert.equal(t.atmenetiHiba(429, { message: "Quota exceeded" }), true);
});

test("az 503 akkor is átmeneti, ha nincs status mező", () => {
  assert.equal(t.atmenetiHiba(503, { message: "Service Unavailable" }), true);
});

test("a 400 (hibás kérés) NEM átmeneti", () => {
  assert.equal(t.atmenetiHiba(400, { message: "Invalid JSON payload", status: "INVALID_ARGUMENT" }), false);
});

test("a 403 (jogosultság) NEM átmeneti", () => {
  assert.equal(t.atmenetiHiba(403, { message: "API key not valid", status: "PERMISSION_DENIED" }), false);
});

// ══════════════════════════════════════════
// Újrapróbálkozás
// ══════════════════════════════════════════

test("átmeneti hiba után újrapróbál és sikerrel jár", async () => {
  let hivas = 0;
  globalThis.fetch = async () => {
    hivas++;
    return hivas < 3 ? HIBA_VALASZ(503, HIGH_DEMAND, "UNAVAILABLE") : OK_VALASZ({ atirat: "kész" });
  };

  const { eredmeny, modell } = await t.geminiHivas("atiras", [], {});
  assert.equal(hivas, 3, "kétszer kell újrapróbálnia");
  assert.deepEqual(eredmeny, { atirat: "kész" });
  assert.equal(modell, t.MODELLEK.atiras, "a fő modell adta a választ");
});

test("véglegesnek tűnő hibát NEM ismételget", async () => {
  let hivas = 0;
  globalThis.fetch = async () => {
    hivas++;
    return HIBA_VALASZ(400, "Invalid JSON payload", "INVALID_ARGUMENT");
  };

  await assert.rejects(() => t.geminiHivas("atiras", [], {}), /Invalid JSON payload/);
  assert.equal(hivas, 1, "egyetlen hívás után fel kell adnia");
});

// ══════════════════════════════════════════
// Tartalék modell
// ══════════════════════════════════════════

test("ha a fő modell végig túlterhelt, tartalékra vált", async () => {
  const hivottModellek = [];
  globalThis.fetch = async (url) => {
    const m = modellUrlbol(url);
    hivottModellek.push(m);
    // a fő modell mindig elhasal, az első tartalék sikerül
    return m === t.MODELLEK.atiras
      ? HIBA_VALASZ(503, HIGH_DEMAND, "UNAVAILABLE")
      : OK_VALASZ({ atirat: "tartalékkal" });
  };

  const { eredmeny, modell } = await t.geminiHivas("atiras", [], {});

  assert.deepEqual(eredmeny, { atirat: "tartalékkal" });
  assert.equal(modell, t.TARTALEK.atiras[0], "az első tartalék modellt kell visszaadni");
  assert.equal(
    hivottModellek.filter((m) => m === t.MODELLEK.atiras).length,
    t.UJRAPROBA.kiserlet,
    "a fő modellt a beállított számú alkalommal próbálja"
  );
});

test("az ÉRTÉKELÉSNEK nincs tartaléka – inkább elhasal, mint más modellel pontozzon", async () => {
  const hivottModellek = [];
  globalThis.fetch = async (url) => {
    hivottModellek.push(modellUrlbol(url));
    return HIBA_VALASZ(503, HIGH_DEMAND, "UNAVAILABLE");
  };

  await assert.rejects(() => t.geminiHivas("ertekeles", [], {}), /high demand/);

  assert.deepEqual(
    [...new Set(hivottModellek)],
    [t.MODELLEK.ertekeles],
    "csak a fő modellt próbálhatta – tartalékkal sérülne az összehasonlíthatóság"
  );
});

test("minden modell elhasalása után az utolsó hibát adja vissza", async () => {
  globalThis.fetch = async () => HIBA_VALASZ(503, HIGH_DEMAND, "UNAVAILABLE");
  await assert.rejects(() => t.geminiHivas("rubrika", [], {}), /high demand/);
});

// ══════════════════════════════════════════
// Válasz-feldolgozás
// ══════════════════════════════════════════

test("üres válasz (finishReason) beszédes hibát ad", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ finishReason: "SAFETY" }] })
  });

  await assert.rejects(() => t.geminiHivas("atiras", [], {}), /SAFETY/);
});

test("nem-JSON válasz esetén a hibában ott van a szöveg eleje", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "ez nem json" }] } }]
    })
  });

  await assert.rejects(() => t.geminiHivas("atiras", [], {}), /ez nem json/);
});

test("a hibaüzenet tartalmazza a modell nevét", async () => {
  globalThis.fetch = async () => HIBA_VALASZ(400, "Valami baj van", "INVALID_ARGUMENT");
  await assert.rejects(
    () => t.geminiHivas("ertekeles", [], {}),
    new RegExp(t.MODELLEK.ertekeles.replace(/\./g, "\\."))
  );
});
