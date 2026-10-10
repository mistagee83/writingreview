// ══════════════════════════════════════════════════════
// Stripe-fizetés – a tiszta rész és a webhook-aláírás (emulátor és hálózat nélkül)
// Az adatbázisos folyamatot a fizetes-adatbazis.test.mjs fedi.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-fizetes-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const f = require("./fizetes.js");
const Stripe = require("stripe");
const kornyezet = require("./kornyezet.js");
let t;
before(() => { t = require("./index.js")._teszt; });

const AR = "price_alap_teszt";
const elofizetes = (felul = {}, kulso = {}) => ({
  id: "evt_1", type: "customer.subscription.updated", created: 1000,
  data: { object: {
    id: "sub_1", customer: "cus_1", status: "active", metadata: { uid: "tanar-1" },
    cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ price: { id: AR }, current_period_end: 5000 }] },
    ...felul
  } },
  ...kulso
});

// ── esemenyHatas ──

test("aktív előfizetés: alap csomag, a Stripe a forrás, az időszak vége az elemről", () => {
  const h = f.esemenyHatas(elofizetes(), { tanar: { csomag: "ingyenes" }, arAlap: AR });
  assert.equal(h.mezok.csomag, "alap");
  assert.equal(h.mezok.csomag_forras, "stripe");
  assert.equal(h.csomagValtozas, true);
  assert.deepEqual(h.mezok.elofizetes, {
    stripe_ugyfel_id: "cus_1", stripe_elofizetes_id: "sub_1", statusz: "active",
    periodus_vege: 5000, lemondva: false, esemeny_ido: 1000
  });
});

test("a régi API-alak (az előfizetésen lévő current_period_end) is működik", () => {
  const h = f.esemenyHatas(elofizetes({ items: { data: [{ price: { id: AR } }] }, current_period_end: 7000 }), { arAlap: AR });
  assert.equal(h.mezok.elofizetes.periodus_vege, 7000);
});

test("próbaidő és fizetési hiba (past_due) alatt marad az alap; az ismételt azonos csomag nem 'változás'", () => {
  for (const status of ["trialing", "past_due"]) {
    const h = f.esemenyHatas(elofizetes({ status }), { tanar: { csomag: "alap" }, arAlap: AR });
    assert.equal(h.mezok.csomag, "alap", status);
    assert.equal(h.csomagValtozas, false);
  }
});

test("lemondott, nem fizetett, megszűnt, szüneteltetett: visszaesik az ingyenesre", () => {
  for (const status of ["canceled", "unpaid", "incomplete_expired", "paused"]) {
    assert.equal(f.esemenyHatas(elofizetes({ status }), { tanar: { csomag: "alap" }, arAlap: AR }).mezok.csomag, "ingyenes", status);
  }
  const torolt = f.esemenyHatas(elofizetes({ status: "active" }, { type: "customer.subscription.deleted" }), { arAlap: AR });
  assert.equal(torolt.mezok.csomag, "ingyenes", "a deleted esemény mindig megszüntet");
  assert.equal(torolt.mezok.elofizetes.statusz, "canceled");
});

test("az 'incomplete' (az első fizetés még nem ment át) nem ad és nem vesz el csomagot", () => {
  const h = f.esemenyHatas(elofizetes({ status: "incomplete" }), { tanar: { csomag: "ingyenes" }, arAlap: AR });
  assert.ok(!("csomag" in h.mezok));
  assert.equal(h.csomagValtozas, false);
  assert.equal(h.mezok.elofizetes.statusz, "incomplete");
});

test("a lemondás (időszak végére vagy időpontra) 'lemondva'", () => {
  assert.equal(f.esemenyHatas(elofizetes({ cancel_at_period_end: true }), { arAlap: AR }).mezok.elofizetes.lemondva, true);
  assert.equal(f.esemenyHatas(elofizetes({ cancel_at: 9999 }), { arAlap: AR }).mezok.elofizetes.lemondva, true);
  assert.equal(f.esemenyHatas(elofizetes(), { arAlap: AR }).mezok.elofizetes.lemondva, false);
});

test("nem ismert árú előfizetést, vagy beállított ár nélkül minden előfizetést figyelmen kívül hagy", () => {
  assert.deepEqual(f.esemenyHatas(elofizetes({ items: { data: [{ price: { id: "price_masik" } }] } }), { arAlap: AR }), { kihagy: "ismeretlen_ar" });
  assert.deepEqual(f.esemenyHatas(elofizetes(), { arAlap: "" }), { kihagy: "ismeretlen_ar" });
});

test("a régebbi esemény nem írja felül az újabb állapotot; az egyenlő vagy újabb igen", () => {
  const tanar = { csomag: "alap", elofizetes: { esemeny_ido: 2000 } };
  assert.deepEqual(f.esemenyHatas(elofizetes({}, { created: 1999 }), { tanar, arAlap: AR }), { kihagy: "regebbi_esemeny" });
  assert.ok(f.esemenyHatas(elofizetes({}, { created: 2000 }), { tanar, arAlap: AR }).mezok);
  assert.ok(f.esemenyHatas(elofizetes({}, { created: 2001 }), { tanar, arAlap: AR }).mezok);
});

test("az admin által adott csomagot a Stripe nem írja át (az előfizetés adatai tárolódnak)", () => {
  const h = f.esemenyHatas(elofizetes({ status: "canceled" }), { tanar: { csomag: "korlatlan", csomag_forras: "admin" }, arAlap: AR });
  assert.ok(!("csomag" in h.mezok), "a csomag érintetlen");
  assert.equal(h.mezok.elofizetes.statusz, "canceled");
  assert.equal(h.csomagValtozas, false);
});

test("a fizetés befejezése (checkout.session.completed) csak összeköti a tanárt az ügyféllel", () => {
  const e = { id: "evt_c", type: "checkout.session.completed", created: 10, data: { object: {
    mode: "subscription", customer: "cus_9", subscription: "sub_9", client_reference_id: "tanar-1"
  } } };
  const h = f.esemenyHatas(e, { arAlap: AR });
  assert.deepEqual(h.mezok, { elofizetes: { stripe_ugyfel_id: "cus_9", stripe_elofizetes_id: "sub_9" } });
  assert.equal(h.csomagValtozas, false);
  assert.equal(h.ugyfel_id, "cus_9");
  assert.deepEqual(f.esemenyHatas({ ...e, data: { object: { ...e.data.object, mode: "payment" } } }, {}), { kihagy: "nem_elofizetes" });
});

test("ismeretlen eseménytípus kimarad", () => {
  assert.deepEqual(f.esemenyHatas({ type: "invoice.paid", data: { object: {} } }, { arAlap: AR }), { kihagy: "nem_kezelt_tipus" });
});

test("a tanár azonosítója az eseményből (client_reference_id / metadata), különben az ügyfél azonosítója", () => {
  assert.deepEqual(f.azonositok(elofizetes()), { uid: "tanar-1", ugyfel: "cus_1" });
  assert.deepEqual(f.azonositok(elofizetes({ metadata: {} })), { uid: null, ugyfel: "cus_1" });
  assert.deepEqual(f.azonositok({ type: "checkout.session.completed", data: { object: { client_reference_id: "t9", customer: "c9" } } }), { uid: "t9", ugyfel: "c9" });
  assert.equal(f.azonositok(elofizetes({ metadata: { uid: 42 } })).uid, null, "nem szöveg azonosító nem fogadható el");
});

test("az előfizetés-nézet csak a szükséges mezőket adja (az ügyfél-azonosítót nem)", () => {
  const n = f.elofizetesNezet({ elofizetes: { statusz: "active", periodus_vege: 5000, lemondva: true, stripe_ugyfel_id: "cus_1", stripe_elofizetes_id: "sub_1", esemeny_ido: 1 } });
  assert.deepEqual(n, { statusz: "active", periodus_vege: 5000, lemondva: true, van_ugyfel: true });
  assert.equal(f.elofizetesNezet({}), null);
  assert.equal(f.elofizetesNezet({ elofizetes: "rossz" }), null);
});

// ── a környezet kapcsolója ──

test("a fizetés csak a prodon és csak beállított árazonosítóval kapcsol be", () => {
  const be = (env) => kornyezet.beallitasok(env).fizetes;
  assert.equal(be({ KORNYEZET: "prod", FIZETES_AR_ALAP: "price_123" }), true);
  assert.equal(be({ KORNYEZET: "prod", FIZETES_AR_ALAP: "" }), false, "üres ár = ki");
  assert.equal(be({ KORNYEZET: "prod" }), false);
  assert.equal(be({ KORNYEZET: "pilot", FIZETES_AR_ALAP: "price_123" }), false, "a pilotban soha");
  assert.equal(be({ KORNYEZET: "prod", FIZETES_AR_ALAP: "prod_nem_ar" }), false, "csak price_ azonosító");
});

test("a visszatérési cím csak https-eredet lehet", () => {
  assert.equal(kornyezet.visszaUrl("p", "https://writing-review.web.app/"), "https://writing-review.web.app");
  assert.equal(kornyezet.visszaUrl("p", "http://rossz.hu"), "https://p.web.app");
  assert.equal(kornyezet.visszaUrl("p", "https://x.hu/utvonal"), "https://p.web.app");
  assert.equal(kornyezet.visszaUrl("p", ""), "https://p.web.app");
});

// ── a webhook: aláírás-ellenőrzés a nyers törzsön ──

const TITOK = "whsec_teszt_titok";
const stripe = new Stripe("sk_test_nem_valodi");
function valasz() {
  return { kod: null, torzs: null, status(k) { this.kod = k; return this; }, send(b) { this.torzs = b; return this; }, json(b) { this.torzs = b; return this; } };
}
const nemNyulhat = new Proxy({}, { get() { throw new Error("az adatbázishoz nem szabad nyúlni"); } });
const kerelem = (torzs, felul = {}) => {
  const payload = typeof torzs === "string" ? torzs : JSON.stringify(torzs);
  return { method: "POST", rawBody: Buffer.from(payload), headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: TITOK }) }, ...felul };
};

test("webhook: érvényes aláírású esemény feldolgozva, 200", async () => {
  const res = valasz();
  let kapott;
  const firestore = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => { kapott = true; return { alkalmazva: true }; } };
  await t.stripeWebhookKezeles(kerelem(elofizetes()), res, { stripe, titok: TITOK, firestore, beallitasok: { fizetesArAlap: AR } });
  assert.equal(res.kod, 200);
  assert.ok(kapott);
});

test("webhook: rossz titokkal aláírt, megváltoztatott törzsű, aláírás nélküli kérés 400, az adatbázishoz nem nyúl", async () => {
  const jo = kerelem(elofizetes());
  const esetek = {
    "rossz titok": { ...jo, headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(elofizetes()), secret: "whsec_masik" }) } },
    "megváltoztatott törzs": { ...jo, rawBody: Buffer.from(JSON.stringify(elofizetes({ status: "canceled" }))) },
    "nincs aláírás": { ...jo, headers: {} },
    "nincs törzs": { ...jo, rawBody: undefined }
  };
  for (const [nev, req] of Object.entries(esetek)) {
    const res = valasz();
    await t.stripeWebhookKezeles(req, res, { stripe, titok: TITOK, firestore: nemNyulhat, beallitasok: { fizetesArAlap: AR } });
    assert.equal(res.kod, 400, nev);
  }
});

test("webhook: nem POST kérés 405", async () => {
  const res = valasz();
  await t.stripeWebhookKezeles({ ...kerelem(elofizetes()), method: "GET" }, res, { stripe, titok: TITOK, firestore: nemNyulhat });
  assert.equal(res.kod, 405);
});

test("webhook: feldolgozási hiba 500 (a Stripe újrapróbálja)", async () => {
  const res = valasz();
  const firestore = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => { throw new Error("adatbázis nem elérhető"); } };
  await t.stripeWebhookKezeles(kerelem(elofizetes()), res, { stripe, titok: TITOK, firestore, beallitasok: { fizetesArAlap: AR } });
  assert.equal(res.kod, 500);
});
