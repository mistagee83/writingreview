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

// ══════════════════════════════════════════
// Gondolkodási szint (költség)
// ══════════════════════════════════════════

/** Rögzíti a kimenő kérések generationConfig-ját; a válasz mindig sikeres. */
function configFigyelo() {
  const configok = [];
  globalThis.fetch = async (url, opts) => {
    configok.push({ modell: modellUrlbol(url), config: JSON.parse(opts.body).generationConfig });
    return OK_VALASZ({ ok: true });
  };
  return configok;
}

test("az átírás (OCR) alacsony gondolkodási szinttel megy – a leveles és a kifejtős is ezt a lépést hívja", async () => {
  const configok = configFigyelo();
  await t.geminiHivas("atiras", [], {});
  assert.equal(configok.length, 1);
  assert.deepEqual(configok[0].config.thinkingConfig, { thinkingLevel: "low" });
  // a többi beállítás érintetlen
  assert.equal(configok[0].config.temperature, 0.2);
  assert.equal(configok[0].config.responseMimeType, "application/json");
});

test("az átírás tartalék modelljei is megkapják a szintet (a 'low' mindháromnál érvényes)", async () => {
  const configok = [];
  globalThis.fetch = async (url, opts) => {
    const modell = modellUrlbol(url);
    configok.push({ modell, config: JSON.parse(opts.body).generationConfig });
    // a fő modell és az első tartalék elhasal, a legutolsó sikerül
    return modell === t.TARTALEK.atiras.at(-1) ? OK_VALASZ({ ok: true }) : HIBA_VALASZ(503, HIGH_DEMAND, "UNAVAILABLE");
  };
  await t.geminiHivas("atiras", [], {});
  const modellek = new Set(configok.map((c) => c.modell));
  assert.deepEqual([...modellek], [t.MODELLEK.atiras, ...t.TARTALEK.atiras]);
  for (const c of configok) {
    assert.deepEqual(c.config.thinkingConfig, { thinkingLevel: "low" }, c.modell);
  }
});

test("az értékelés, a rubrika és az elemzés NEM kap gondolkodási beállítást (alapértelmezés marad)", async () => {
  for (const lepes of ["ertekeles", "rubrika", "elemzes"]) {
    const configok = configFigyelo();
    await t.geminiHivas(lepes, [], {});
    assert.ok(!("thinkingConfig" in configok[0].config), lepes);
  }
});

test("a beállított gondolkodási szintek mind olyanok, amit a használt modellek elfogadnak", () => {
  // Ha a "minimal"-t valaki felveszi az átíráshoz, a 3.8/3.7 Flash 400-ast dob – ez a teszt jelez.
  for (const [lepes, szint] of Object.entries(t.GONDOLKODAS)) {
    assert.ok(["low", "medium", "high"].includes(szint), `${lepes}: ${szint}`);
    assert.ok(lepes in t.MODELLEK, `${lepes} ismeretlen lépés`);
  }
});

// ══════════════════════════════════════════
// Tokenszám (AI-használat mérése)
// ══════════════════════════════════════════

test("a hívás visszaadja a tokenszámokat a usageMetadata-ból", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: 1 }) }] } }],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 150, thoughtsTokenCount: 800, totalTokenCount: 2150 }
    })
  });
  const r = await t.geminiHivas("ertekeles", [], {});
  assert.deepEqual(r.hasznalat, { prompt: 1200, kimenet: 150, gondolkodas: 800, ossz: 2150 });
});

test("usageMetadata nélküli válasz sem hiba: a tokenszámok 0", async () => {
  globalThis.fetch = async () => OK_VALASZ({ ok: true });
  const r = await t.geminiHivas("atiras", [], {});
  assert.deepEqual(r.hasznalat, { prompt: 0, kimenet: 0, gondolkodas: 0, ossz: 0 });
});

test("a mérés hibája nem akadályozza a javítást: a rögzítés sosem dob", async () => {
  const hibasAdatbazis = { collection: () => ({ add: async () => { throw new Error("nincs adatbázis"); } }) };
  const adat = { modell: "m", fo_modell: "m", hasznalat: { prompt: 1, kimenet: 1, gondolkodas: 0, ossz: 2 }, probalkozas: 1, parts: [] };
  await assert.doesNotReject(() => t.aiHasznalatNaplo({ tanar_id: "t", muvelet: "beadas_atiras" }, adat, hibasAdatbazis));
  // kontextus nélkül (vagy művelet nélkül) nem is próbál írni
  let irt = false;
  const figyelo = { collection: () => ({ add: async () => { irt = true; } }) };
  await t.aiHasznalatNaplo(undefined, adat, figyelo);
  await t.aiHasznalatNaplo({ tanar_id: "t" }, adat, figyelo);
  assert.equal(irt, false);
  // kontextussal ír, és a rekord időbélyeget kap
  let rekord;
  const rogzito = { collection: (nev) => ({ add: async (r) => { rekord = { nev, ...r }; } }) };
  await t.aiHasznalatNaplo({ tanar_id: "t", muvelet: "elemzes", feladat_id: "f" }, adat, rogzito);
  assert.equal(rekord.nev, "ai_hasznalat");
  assert.equal(rekord.muvelet, "elemzes");
  assert.ok(rekord.ido, "időbélyeg");
});
