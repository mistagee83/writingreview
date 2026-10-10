// ══════════════════════════════════════════════════════
// Stripe-fizetés – az adatbázisos folyamat, Firestore-emulátor ellen
//
// Amit védünk: az esemény pontosan egyszer hat (idempotencia), a régebbi esemény nem ír felül újabbat,
// az admin által adott csomagot a Stripe nem bántja, és az előfizetés tényleg a kvóta keretét adja.
// A Stripe hálózati hívásait (Checkout, portál) kicserélt kliens helyettesíti.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
// Más projekt-azonosító, mint a többi emulátoros tesztben (azok törlik az adatot).
process.env.GCLOUD_PROJECT = "wr-fizetes-adatbazis-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let firestore, t;
before(() => {
  t = require("./index.js")._teszt;
  firestore = require("firebase-admin/firestore").getFirestore();
});
after(async () => { await firestore?.terminate(); });

const AR = "price_alap_teszt";
const BE = { kvota: true, fizetes: true, fizetesArAlap: AR, fizetesArSzoveg: "7 EUR / hó", visszaUrl: "https://writing-review.web.app" };

beforeEach(async () => {
  for (const ref of await firestore.collection("tanarok").listDocuments()) {
    const h = await ref.collection("hasznalat").get();
    await Promise.all(h.docs.map((x) => x.ref.delete()));
    await ref.delete();
  }
  for (const koll of ["stripe_esemenyek", "stripe_ugyfelek"]) {
    const snap = await firestore.collection(koll).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

const tanarDok = async (uid = "t1") => (await firestore.collection("tanarok").doc(uid).get()).data();
let sorszam = 0;
const esemeny = (felul = {}, objFelul = {}) => ({
  id: `evt_${++sorszam}`, type: "customer.subscription.updated", created: 1000 + sorszam,
  data: { object: {
    id: "sub_1", customer: "cus_1", status: "active", metadata: { uid: "t1" },
    cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ price: { id: AR }, current_period_end: 5000 }] }, ...objFelul
  } }, ...felul
});
const alkalmaz = (e, beallitasok = BE) => t.stripeEsemenyFeldolgozas(firestore, e, beallitasok);

test("az aktív előfizetés alap csomagot ad, és a kvóta 150 egységes havi keretet mutat", async () => {
  const r = await alkalmaz(esemeny());
  assert.deepEqual(r, { alkalmazva: true, uid: "t1", csomag: "alap" });
  const d = await tanarDok();
  assert.equal(d.csomag, "alap");
  assert.equal(d.csomag_forras, "stripe");
  assert.equal(d.elofizetes.statusz, "active");
  assert.equal(d.elofizetes.stripe_ugyfel_id, "cus_1");
  assert.ok(d.csomag_modositva, "a csomagváltás időbélyeget kap");
  const k = await t.kvotaAllapotLogika(firestore, "t1", BE);
  assert.equal(k.csomag, "alap");
  assert.equal(k.limit, 150);
  assert.equal(k.idoszak, "havi");
});

test("idempotencia: ugyanaz az esemény másodszor nem hat (a Stripe többször is kézbesíthet)", async () => {
  const e = esemeny();
  assert.equal((await alkalmaz(e)).alkalmazva, true);
  // közben az admin visszaállítja ingyenesre: az ismételt esemény ezt NEM írhatja felül
  await firestore.collection("tanarok").doc("t1").set({ csomag: "ingyenes" }, { merge: true });
  assert.deepEqual(await alkalmaz(e), { kihagyva: "mar_feldolgozva" });
  assert.equal((await tanarDok()).csomag, "ingyenes");
  const naplo = await firestore.collection("stripe_esemenyek").doc(e.id).get();
  assert.equal(naplo.data().megjegyzes, "alkalmazva");
});

test("sorrend: a régebbi esemény nem írja felül az újabb állapotot", async () => {
  await alkalmaz(esemeny({ created: 5000 }, { status: "canceled" }));
  assert.equal((await tanarDok()).csomag, "ingyenes");
  // egy korábbi, késve érkező "active" nem támaszthatja fel
  const r = await alkalmaz(esemeny({ created: 4000 }, { status: "active" }));
  assert.deepEqual({ kihagyva: r.kihagyva }, { kihagyva: "regebbi_esemeny" });
  assert.equal((await tanarDok()).csomag, "ingyenes");
});

test("a törölt előfizetés visszaadja az ingyenes csomagot", async () => {
  await alkalmaz(esemeny({ created: 10 }));
  await alkalmaz(esemeny({ created: 20, type: "customer.subscription.deleted" }, { status: "canceled" }));
  const d = await tanarDok();
  assert.equal(d.csomag, "ingyenes");
  assert.equal(d.elofizetes.statusz, "canceled");
});

test("az admin által adott csomagot a Stripe nem bántja", async () => {
  await t.csomagBeallitasLogika(firestore, "t1", "korlatlan");
  assert.equal((await tanarDok()).csomag_forras, "admin");
  await alkalmaz(esemeny({ created: 10 }, { status: "canceled" }));
  const d = await tanarDok();
  assert.equal(d.csomag, "korlatlan", "a csomag érintetlen");
  assert.equal(d.elofizetes.statusz, "canceled", "az előfizetés adatai azért tárolódnak");
  // az ingyenesre állítás visszaadja a Stripe-nak
  await t.csomagBeallitasLogika(firestore, "t1", "ingyenes");
  assert.equal((await tanarDok()).csomag_forras, "stripe");
});

test("nem a mi termékünk (ismeretlen ár) és az ismeretlen ügyfél eseménye nem változtat, de naplózódik", async () => {
  const e1 = esemeny({}, { items: { data: [{ price: { id: "price_masik" }, current_period_end: 1 }] } });
  assert.equal((await alkalmaz(e1)).kihagyva, "ismeretlen_ar");
  assert.equal(await tanarDok(), undefined);

  const e2 = esemeny({}, { metadata: {}, customer: "cus_ismeretlen" });
  assert.deepEqual(await alkalmaz(e2), { kihagyva: "nincs_tanar" });
  assert.equal((await firestore.collection("stripe_esemenyek").doc(e2.id).get()).data().megjegyzes, "nincs_tanar");
});

test("a fizetés befejezése összeköti az ügyfelet, a későbbi, uid nélküli esemény az ügyfél alapján találja meg a tanárt", async () => {
  await alkalmaz({
    id: "evt_cs", type: "checkout.session.completed", created: 100,
    data: { object: { mode: "subscription", customer: "cus_77", subscription: "sub_77", client_reference_id: "t1" } }
  });
  assert.equal((await tanarDok()).elofizetes.stripe_ugyfel_id, "cus_77");
  assert.equal((await tanarDok()).csomag, undefined, "a befejezés önmagában még nem ad csomagot");
  assert.equal((await firestore.collection("stripe_ugyfelek").doc("cus_77").get()).data().uid, "t1");

  // a megújítási esemény metadata nélkül érkezik: az ügyfélből találjuk meg a tanárt
  const r = await alkalmaz(esemeny({ created: 200 }, { customer: "cus_77", metadata: {} }));
  assert.equal(r.uid, "t1");
  assert.equal((await tanarDok()).csomag, "alap");
});

test("a kvótát a csomagváltás követi: lemondás után a használat az ingyenes (egyszeri) számlálóra esik vissza", async () => {
  await alkalmaz(esemeny({ created: 10 }));
  assert.equal((await t.kvotaAllapotLogika(firestore, "t1", BE)).limit, 150);
  await alkalmaz(esemeny({ created: 20, type: "customer.subscription.deleted" }, { status: "canceled" }));
  const k = await t.kvotaAllapotLogika(firestore, "t1", BE);
  assert.equal(k.csomag, "ingyenes");
  assert.equal(k.limit, 20);
  assert.equal(k.idoszak, "egyszeri");
});

// ── fizetés indítása és kezelése (kicserélt Stripe-klienssel) ──

const kerelem = (uid = "t1", szerep = "tanar") => ({ auth: { uid, token: { szerep, email: "tanar@iskola.hu" } } });
function stripeStub() {
  const hivasok = { checkout: [], portal: [] };
  return {
    hivasok,
    checkout: { sessions: { create: async (p) => { hivasok.checkout.push(p); return { url: "https://checkout.stripe.com/c/pay/cs_test_1" }; } } },
    billingPortal: { sessions: { create: async (p) => { hivasok.portal.push(p); return { url: "https://billing.stripe.com/p/session/x" }; } } }
  };
}

test("fizetés indítása: előfizetéses Checkout a tanár uid-jához kötve, az árral és a visszatérési címmel", async () => {
  const s = stripeStub();
  const r = await t.fizetesInditasLogika(firestore, s, kerelem(), BE);
  assert.equal(r.url, "https://checkout.stripe.com/c/pay/cs_test_1");
  const p = s.hivasok.checkout[0];
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: AR, quantity: 1 }]);
  assert.equal(p.client_reference_id, "t1");
  assert.equal(p.subscription_data.metadata.uid, "t1");
  assert.equal(p.customer_email, "tanar@iskola.hu");
  assert.equal(p.success_url, "https://writing-review.web.app/tanar.html?fizetes=sikeres");
  assert.equal(p.cancel_url, "https://writing-review.web.app/tanar.html?fizetes=megszakitva");
  assert.equal(p.billing_address_collection, "required");
});

test("fizetés indítása: meglévő Stripe-ügyfelet újrahasznosít (nem küld e-mailt mellé)", async () => {
  await firestore.collection("tanarok").doc("t1").set({ elofizetes: { stripe_ugyfel_id: "cus_regi", statusz: "canceled" } });
  const s = stripeStub();
  await t.fizetesInditasLogika(firestore, s, kerelem(), BE);
  assert.equal(s.hivasok.checkout[0].customer, "cus_regi");
  assert.ok(!("customer_email" in s.hivasok.checkout[0]));
});

test("fizetés indítása: kikapcsolt fizetés, diák, aktív előfizetés, admin csomag → elutasítva, Stripe-hívás nélkül", async () => {
  const s = stripeStub();
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, kerelem(), { ...BE, fizetes: false }), (e) => e.details.kod === "fizetes_ki");
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, kerelem("d1", "diak"), BE), (e) => e.code === "permission-denied");
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, { auth: null }, BE), (e) => e.code === "unauthenticated");

  await firestore.collection("tanarok").doc("t1").set({ elofizetes: { statusz: "active" } });
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, kerelem(), BE), (e) => e.details.kod === "mar_elofizetett");
  await firestore.collection("tanarok").doc("t1").set({ elofizetes: { statusz: "past_due" } });
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, kerelem(), BE), (e) => e.details.kod === "mar_elofizetett");

  await firestore.collection("tanarok").doc("t2").set({ csomag: "korlatlan", csomag_forras: "admin" });
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, kerelem("t2"), BE), (e) => e.details.kod === "csomag_kezi");
  assert.equal(s.hivasok.checkout.length, 0);
});

test("fizetés indítása: a Stripe hibája kódolt belső hiba (a részlet nem a felhasználónak szól)", async () => {
  const s = { checkout: { sessions: { create: async () => { throw new Error("Stripe nem elérhető"); } } } };
  await assert.rejects(() => t.fizetesInditasLogika(firestore, s, kerelem(), BE), (e) => e.code === "internal" && e.details.kod === "fizetes_hiba");
});

test("előfizetés kezelése: a portál a tanár saját Stripe-ügyfelére nyílik; ügyfél nélkül elutasítva", async () => {
  const s = stripeStub();
  await assert.rejects(() => t.fizetesKezelesLogika(firestore, s, kerelem(), BE), (e) => e.details.kod === "nincs_ugyfel");
  await firestore.collection("tanarok").doc("t1").set({ elofizetes: { stripe_ugyfel_id: "cus_1" } });
  const r = await t.fizetesKezelesLogika(firestore, s, kerelem(), BE);
  assert.equal(r.url, "https://billing.stripe.com/p/session/x");
  assert.deepEqual(s.hivasok.portal[0], { customer: "cus_1", return_url: "https://writing-review.web.app/tanar.html" });
  await assert.rejects(() => t.fizetesKezelesLogika(firestore, s, kerelem(), { ...BE, fizetes: false }), (e) => e.details.kod === "fizetes_ki");
});

test("fizetés állapota a felületnek: kikapcsolva csak {fizetes:false}; bekapcsolva az ár és a biztonságos előfizetés-nézet", async () => {
  assert.deepEqual(await t.fizetesAllapotLogika(firestore, "t1", { ...BE, fizetes: false }), { fizetes: false });
  await alkalmaz(esemeny());
  const a = await t.fizetesAllapotLogika(firestore, "t1", BE);
  assert.deepEqual(a, {
    fizetes: true, ar: "7 EUR / hó", alap_keret: 150, csomag_forras: "stripe",
    elofizetes: { statusz: "active", periodus_vege: 5000, lemondva: false, van_ugyfel: true }
  });
  assert.ok(!JSON.stringify(a).includes("cus_1"), "az ügyfél-azonosító nem megy a kliensnek");
});
