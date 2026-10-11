// ══════════════════════════════════════════════════════
// Elavult (tesztmódú) előfizetési adat az éles módra váltás után – emulátor nélkül, memóriabeli hamis Firestore-ral
//
// A hiba (v1.16.0 éles próba): a tanár dokumentumában tesztmódban kötött előfizetés maradt (aktív állapot, lejárati idő,
// Stripe-ügyfél), az éles Stripe-ban viszont nincs ilyen ügyfél. A felület "Előfizetés kezelése" gombot mutatott az
// előfizetés gombjai helyett, és az "aktív" állapot az új előfizetést is megállította. Az emulátoros párja:
// tests/fizetes-adatbazis.test.mjs.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-elavult-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { FieldValue } = require("firebase-admin/firestore");
let t;
before(() => { t = require("./index.js")._teszt; });

const BE = {
  kvota: true, fizetes: true, fizetesArAlap: "price_alap", fizetesArProfi: "price_profi",
  fizetesArSzoveg: "7 EUR / hó", fizetesArProfiSzoveg: "19 EUR / hó", visszaUrl: "https://writing-review.web.app"
};

// A hamis Firestore a `set(…, {merge})`-ben a FieldValue.delete()-et értelmezi (mezőtörlés), a többit eltárolja.
function hamisFirestore(kezdet = {}) {
  const tar = new Map(Object.entries(kezdet));
  const torles = FieldValue.delete();
  const egyesit = (cel, forras) => {
    const ki = { ...cel };
    for (const [k, v] of Object.entries(forras)) {
      if (v && typeof v.isEqual === "function" && v.isEqual(torles)) delete ki[k];
      else if (v && typeof v === "object" && !Array.isArray(v) && typeof v.isEqual !== "function") ki[k] = egyesit(ki[k] || {}, v);
      else ki[k] = v;
    }
    return ki;
  };
  return {
    tar,
    collection: (nev) => ({ doc: (id) => ({
      get: async () => ({ exists: tar.has(`${nev}/${id}`), data: () => tar.get(`${nev}/${id}`) }),
      set: async (adat, opt) => tar.set(`${nev}/${id}`, opt?.merge ? egyesit(tar.get(`${nev}/${id}`) || {}, adat) : adat)
    }) })
  };
}
const kerelem = (uid = "t1") => ({ auth: { uid, token: { szerep: "tanar", email: "tanar@iskola.hu" } } });
const eltunt = () => Object.assign(new Error("No such customer: 'cus_regi'"), { code: "resource_missing", param: "customer" });
const stripeStub = () => {
  const hivasok = [];
  return { hivasok, checkout: { sessions: { create: async (p) => { hivasok.push(p); return { url: "https://checkout.stripe.com/c/pay/cs_live_1" }; } } } };
};

test("Stripe-ügyfél nélküli 'aktív' előfizetés nem látszik a felületnek, és nem állítja meg az új előfizetést", async () => {
  const fs = hamisFirestore({ "tanarok/t1": { csomag: "ingyenes", elofizetes: { statusz: "active", periodus_vege: 1794000000 } } });
  assert.equal((await t.fizetesAllapotLogika(fs, "t1", BE)).elofizetes, null);
  const s = stripeStub();
  const r = await t.fizetesInditasLogika(fs, s, kerelem(), BE);
  assert.equal(r.url, "https://checkout.stripe.com/c/pay/cs_live_1");
  assert.equal(s.hivasok.length, 1);
});

test("az élő előfizetés (Stripe-ügyféllel) továbbra is látszik, és megállítja az újat", async () => {
  const fs = hamisFirestore({ "tanarok/t1": { csomag: "alap", elofizetes: { stripe_ugyfel_id: "cus_1", statusz: "active", periodus_vege: 1794000000 } } });
  const allapot = await t.fizetesAllapotLogika(fs, "t1", BE);
  assert.deepEqual([allapot.elofizetes.statusz, allapot.elofizetes.van_ugyfel], ["active", true]);
  await assert.rejects(() => t.fizetesInditasLogika(fs, stripeStub(), kerelem(), BE), (e) => e.details.kod === "mar_elofizetett");
});

test("az eltűnt Stripe-ügyfél kezelésekor az előfizetési adat törlődik, a Stripe-csomag ingyenesre áll", async () => {
  const fs = hamisFirestore({ "tanarok/t1": { csomag: "alap", csomag_forras: "stripe", elofizetes: { stripe_ugyfel_id: "cus_regi", statusz: "active" } } });
  const s = { billingPortal: { sessions: { create: async () => { throw eltunt(); } } } };
  await assert.rejects(() => t.fizetesKezelesLogika(fs, s, kerelem(), BE), (e) => e.details.kod === "nincs_ugyfel");
  const d = fs.tar.get("tanarok/t1");
  assert.ok(!("elofizetes" in d));
  assert.equal(d.csomag, "ingyenes");
});

test("az admin által adott csomagot az elavult ügyfél törlése nem bántja", async () => {
  const fs = hamisFirestore({ "tanarok/t1": { csomag: "korlatlan", csomag_forras: "admin", elofizetes: { stripe_ugyfel_id: "cus_regi", statusz: "active" } } });
  const s = { billingPortal: { sessions: { create: async () => { throw eltunt(); } } } };
  await assert.rejects(() => t.fizetesKezelesLogika(fs, s, kerelem(), BE), (e) => e.details.kod === "nincs_ugyfel");
  const d = fs.tar.get("tanarok/t1");
  assert.equal(d.csomag, "korlatlan");
  assert.ok(!("elofizetes" in d));
});

test("az összehasonlító táblázat adata: a funkciók egy forrásból (kvota.FUNKCIOK), az ingyenes keret, a kínált csomagok", async () => {
  const kvota = require("./kvota.js");
  const fs = hamisFirestore({ "tanarok/t1": { csomag: "ingyenes" } });
  const a = await t.fizetesAllapotLogika(fs, "t1", BE);
  assert.deepEqual(a.funkciok, kvota.FUNKCIOK);
  assert.equal(a.ingyenes_keret, kvota.keret("ingyenes"));
  assert.deepEqual(a.csomagok.map((c) => c.nev), ["profi", "alap"].filter((n) => ["alap", "profi"].includes(n)).sort((x, y) => (x === "alap" ? -1 : 1)));
});
