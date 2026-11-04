// ══════════════════════════════════════════════════════
// Claude-hívás (AI_SZOLGALTATO=claude): kérés-átalakítás, válasz, hibák
//
// A fetch-et kicseréljük, tehát NEM hívunk valódi API-t.
// Futtatás: node --test tests/claude.test.mjs
// ══════════════════════════════════════════════════════

import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-claude-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";
process.env.ANTHROPIC_API_KEY = "teszt-kulcs";
process.env.AI_SZOLGALTATO = "claude";
process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_teszt123";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let t;
let eredetiFetch;
let keresek;

before(() => {
  t = require("./index.js")._teszt;
  t.UJRAPROBA.varakozasok = [1, 1];
});

beforeEach(() => {
  eredetiFetch = globalThis.fetch;
  keresek = [];
});

afterEach(() => {
  globalThis.fetch = eredetiFetch;
  t.AI.szolgaltato = "claude";
});

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" }
});

const OK = (adat, extra = {}) => json(200, {
  id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5",
  content: [{ type: "text", text: JSON.stringify(adat) }],
  stop_reason: "end_turn",
  usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ...extra
});

const HIBA = (status, message) => json(status, { type: "error", error: { type: "api_error", message } });

/** A fetch-mock: a válaszokat sorban adja, a kéréseket eltárolja. */
function mock(...valaszok) {
  globalThis.fetch = async (url, opciok) => {
    keresek.push({ url: String(url), body: JSON.parse(opciok.body), fejlec: new Headers(opciok.headers) });
    const v = valaszok.shift();
    if (!v) throw new Error("nincs több válasz");
    return v;
  };
}

const SEMA = { type: "object", properties: { atirat: { type: "string" } }, required: ["atirat"] };

test("a környezet beállítása: AI_SZOLGALTATO=claude → claude, minden más → gemini", () => {
  const k = require("./kornyezet.js");
  assert.equal(k.beallitasok({ AI_SZOLGALTATO: "claude" }).aiSzolgaltato, "claude");
  assert.equal(k.beallitasok({ AI_SZOLGALTATO: " Claude " }).aiSzolgaltato, "claude");
  assert.equal(k.beallitasok({}).aiSzolgaltato, "gemini");
  assert.equal(k.beallitasok({ AI_SZOLGALTATO: "valami" }).aiSzolgaltato, "gemini");
});

test("a séma-átalakítás: additionalProperties:false, a nem támogatott megszorítások nélkül, nullable → anyOf", () => {
  const s = t.claudeSema({
    type: "OBJECT",
    properties: {
      pont: { type: "integer", minimum: 0, maximum: 10 },
      lista: { type: "array", minItems: 1, items: { type: "object", properties: { maximum: { type: "string" } } } },
      megj: { type: "string", nullable: true, enum: ["a", "b"] }
    },
    required: ["pont"]
  });
  assert.equal(s.type, "object");
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.properties.pont, { type: "integer" });
  assert.equal(s.properties.lista.minItems, undefined);
  assert.equal(s.properties.lista.items.additionalProperties, false);
  assert.ok(s.properties.lista.items.properties.maximum, "a 'maximum' nevű MEZŐ megmarad");
  assert.deepEqual(s.properties.megj, { anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }] });
  assert.deepEqual(s.required, ["pont"]);
});

test("az éles sémák mind átalakíthatók (nem marad bennük tiltott kulcs, minden objektum zárt)", () => {
  const kifejtos = require("./kifejtos.js");
  const semak = [t.ATIRAT_SCHEMA, t.rubrikaSchema("magyar"), t.rubrikaSchema("angol"),
    ...Object.entries(kifejtos).filter(([n]) => /SCHEMA$/.test(n)).map(([, s]) => s)];
  const ellenoriz = (x, utvonal) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach((e, i) => ellenoriz(e, `${utvonal}[${i}]`));
    for (const k of ["minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "nullable"]) {
      assert.equal(Object.hasOwn(x, k) && typeof x[k] !== "object", false, `${utvonal}.${k}`);
    }
    if (x.type === "object") assert.equal(x.additionalProperties, false, utvonal);
    for (const [k, v] of Object.entries(x)) ellenoriz(v, `${utvonal}.${k}`);
  };
  semak.forEach((s, i) => ellenoriz(t.claudeSema(s), `sema${i}`));
});

test("a kérésrészek: szöveg → text, kép → image, PDF → document; üres szöveg kimarad", () => {
  const ki = t.claudeTartalom([
    { inline_data: { mime_type: "image/jpeg", data: "QUJD" } },
    { inline_data: { mime_type: "application/pdf", data: "UERG" } },
    { text: "" },
    { text: "Írd át." }
  ]);
  assert.deepEqual(ki, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: "UERG" } },
    { type: "text", text: "Írd át." }
  ]);
});

test("az átírás Sonnet 5.5-tel, alacsony efforttal, sémával megy; a válasz és a tokenszám visszajön", async () => {
  mock(OK({ atirat: "Dear John" }));
  const { eredmeny, modell, hasznalat } = await t.aiHivas("atiras", [{ text: "Írd át." }], SEMA);
  assert.deepEqual(eredmeny, { atirat: "Dear John" });
  assert.equal(modell, "claude-sonnet-5-5");
  assert.deepEqual(hasznalat, { prompt: 1000, kimenet: 200, gondolkodas: 0, ossz: 1200 });
  const b = keresek[0].body;
  assert.match(keresek[0].url, /\/v1\/messages$/);
  assert.equal(b.model, "claude-sonnet-5-5");
  assert.equal(b.output_config.effort, "low");
  assert.equal(b.output_config.format.type, "json_schema");
  assert.equal(b.output_config.format.schema.additionalProperties, false);
  assert.equal(b.temperature, undefined, "a temperature-t az új API elutasítja");
  assert.equal(b.thinking, undefined);
});

test("az értékelés nem kap effortot (a modell alapértelmezése marad)", async () => {
  mock(OK({ atirat: "x" }));
  await t.aiHivas("ertekeles", [{ text: "Értékeld." }], SEMA);
  assert.equal(keresek[0].body.output_config.effort, undefined);
});

test("regresszió: a rubrika és az elemzés medium efforttal, 32 000 tokenes kerettel megy (high-on kifutott a 16 000-ből)", async () => {
  for (const lepes of ["rubrika", "elemzes"]) {
    mock(OK({ atirat: "x" }));
    await t.aiHivas(lepes, [{ text: "x" }], SEMA);
  }
  for (const k of keresek) {
    assert.equal(k.body.output_config.effort, "medium");
    assert.equal(k.body.max_tokens, 32000);
  }
});

test("túlterhelés (529) után újrapróbál és sikerrel jár", async () => {
  mock(HIBA(529, "Overloaded"), OK({ atirat: "ok" }));
  const { eredmeny } = await t.aiHivas("ertekeles", [{ text: "x" }], SEMA);
  assert.deepEqual(eredmeny, { atirat: "ok" });
  assert.equal(keresek.length, 2);
});

test("400-as hibát NEM ismételget, és a hibában ott a modell neve", async () => {
  mock(HIBA(400, "invalid schema"), OK({ atirat: "nem kéne" }));
  await assert.rejects(t.aiHivas("atiras", [{ text: "x" }], SEMA), /Claude \(claude-sonnet-5-5\).*400/);
  assert.equal(keresek.length, 1);
});

test("elutasítás (refusal) beszédes hibát ad, a tokenadattal", async () => {
  mock(OK({}, { stop_reason: "refusal", content: [] }));
  await assert.rejects(t.aiHivas("atiras", [{ text: "x" }], SEMA), (e) => {
    assert.match(e.message, /refusal/);
    assert.equal(e.hasznalat.prompt, 1000);
    return true;
  });
});

test("a kapcsoló visszaállítható: gemini-re váltva a Gemini végpontját hívja", async () => {
  t.AI.szolgaltato = "gemini";
  globalThis.fetch = async (url) => {
    keresek.push(String(url));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "{\"atirat\":\"g\"}" }] } }] }) };
  };
  const { modell } = await t.aiHivas("atiras", [{ text: "x" }], SEMA);
  assert.match(keresek[0], /generativelanguage\.googleapis\.com/);
  assert.match(modell, /^gemini-/);
});

test("az ár ismert a Claude-modellre (a költségmérés nem 'ismeretlen ár')", () => {
  const ai = require("./ai-hasznalat.js");
  for (const m of Object.values(t.CLAUDE_MODELLEK)) assert.ok(ai.ARAK[m], m);
});

test("munkaterület-azonosító: a kérés anthropic-workspace-id fejlécet kap (nem munkaterülethez kötött kulcs)", async () => {
  mock(OK({ atirat: "x" }));
  await t.aiHivas("rubrika", [{ text: "x" }], SEMA);
  assert.equal(keresek[0].fejlec.get("anthropic-workspace-id"), "wrkspc_teszt123");
});

test("munkaterület-azonosító: csak a wrkspc_ alak fogadható el, üresen nincs fejléc", () => {
  const k = require("./kornyezet.js");
  assert.equal(k.beallitasok({ ANTHROPIC_WORKSPACE_ID: " wrkspc_AbC-1 " }).anthropicWorkspace, "wrkspc_AbC-1");
  assert.equal(k.beallitasok({ ANTHROPIC_WORKSPACE_ID: "valami" }).anthropicWorkspace, "");
  assert.equal(k.beallitasok({}).anthropicWorkspace, "");
});
