// ══════════════════════════════════════════════════════
// Hub-kredit – az adatbázisos rész, valódi Firestore-emulátor ellen (4d, 2026-11-17)
// (a régi kvota-adatbazis.test.mjs utódja; a kreditszámítást a hub shared/credits.js tesztjei fedik)
//
// Csak a kereskedelmi (prod) környezetben él: a pilotban ki van kapcsolva, ott semmi nem
// korlátozódik és semmi nem íródik. Az ár a settings/credits.prices["writing-review/<akció>"],
// az egyenleg a users/{uid}.credits, a napló a creditLedger.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
// Más projekt-azonosító, mint a többi emulátoros tesztben (azok törlik az adatot).
process.env.GCLOUD_PROJECT = "wr-kredit-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let firestore, logika, kredit, Timestamp;

before(() => {
  logika = require("./index.js")._teszt;
  kredit = require("./kredit.js");
  ({ Timestamp } = require("firebase-admin/firestore"));
  firestore = require("firebase-admin/firestore").getFirestore();
});

after(async () => {
  await firestore?.terminate();
});

const ARAK = { "writing-review/check": 1, "writing-review/rubric": 1, "writing-review/analysis": 2 };

beforeEach(async () => {
  for (const koll of ["users", "creditLedger", "beadasok", "feladatok", "settings"]) {
    const snap = await firestore.collection(koll).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await firestore.doc("settings/credits").set({ prices: ARAK });
});

const BE = { kredit: true, hubFiokUrl: "https://hub.example/account" };
const KI = { kredit: false };
const MESSZE = Timestamp.fromMillis(Date.now() + 30 * 24 * 3600 * 1000);
const egyenlegBeallit = (uid, included, extra = {}) =>
  firestore.collection("users").doc(uid).set({ credits: { included, includedExpiresAt: MESSZE, purchased: 0, ...extra } });
const egyenleg = async (uid) => {
  const c = (await firestore.collection("users").doc(uid).get()).data()?.credits ?? {};
  return (c.included ?? 0) + (c.purchased ?? 0);
};
const naplo = async (uid) => (await firestore.collection("creditLedger").where("uid", "==", uid).get()).docs.map((d) => d.data());

/** A kredit bekapcsolása a tesztre: a beadás-feldolgozás a környezet beállítását olvassa. */
async function kreditBekapcsolva(fn) {
  const eredeti = logika.BEALLITASOK.kredit;
  logika.BEALLITASOK.kredit = true;
  try {
    return await fn();
  } finally {
    logika.BEALLITASOK.kredit = eredeti;
  }
}

test("a pilotban (kikapcsolva) nincs levonás, nem ír semmit, és nem korlátoz", async () => {
  assert.equal(await logika.kreditLevonas(firestore, "t1", "beadas", KI), null);
  let futott = 0;
  for (let i = 0; i < 30; i++) await logika.kreditbol("t1", "beadas", async () => { futott++; }, KI);
  assert.equal(futott, 30);
  assert.equal((await firestore.collection("creditLedger").get()).size, 0, "a pilotban nincs naplósor");
  assert.deepEqual(await logika.kreditAllapotLogika(firestore, "t1", KI), { kredit: false });
});

test("a levonás az árlista szerint fogy, naplósorral; elfogyott egyenlegnél kódolt hiba", async () => {
  await egyenlegBeallit("t1", 3);
  await logika.kreditLevonas(firestore, "t1", "beadas", BE);
  await logika.kreditLevonas(firestore, "t1", "elemzes", BE);   // 2 kredit
  assert.equal(await egyenleg("t1"), 0);
  const sorok = await naplo("t1");
  assert.equal(sorok.length, 2);
  assert.ok(sorok.every((s) => s.reason === "spend" && s.app === "writing-review"));
  assert.deepEqual(sorok.map((s) => s.action).sort(), ["analysis", "check"]);
  await assert.rejects(
    () => logika.kreditLevonas(firestore, "t1", "beadas", BE),
    (e) => e.code === "resource-exhausted" && e.details.kod === "kredit_elfogyott" && e.details.egyenleg === 0 && e.details.ar === 1
  );
  assert.equal((await naplo("t1")).length, 2, "az elutasított művelet nem ír naplót");
});

test("users-dokumentum nélkül (nincs kredit) az első művelet elutasítva", async () => {
  await assert.rejects(() => logika.kreditLevonas(firestore, "t9", "beadas", BE), (e) => e.details.kod === "kredit_elfogyott");
});

test("az árlistán nem szereplő művelet nem indítható (kredit_ar_hianyzik)", async () => {
  await egyenlegBeallit("t1", 10);
  await firestore.doc("settings/credits").set({ prices: { "writing-review/check": 1 } });
  await assert.rejects(() => logika.kreditLevonas(firestore, "t1", "elemzes", BE), (e) => e.details.kod === "kredit_ar_hianyzik");
  assert.equal(await egyenleg("t1"), 10);
});

test("a korlátlan fiók nem fogy, de naplósort kap", async () => {
  await egyenlegBeallit("t1", 0, { unlimited: true });
  for (let i = 0; i < 5; i++) await logika.kreditLevonas(firestore, "t1", "beadas", BE);
  assert.equal(await egyenleg("t1"), 0);
  assert.equal((await naplo("t1")).length, 5);
});

test("párhuzamos kérések sem léphetnek túl az egyenlegen (25 egyidejű, 20 kredit → pontosan 20 jut át)", async () => {
  await egyenlegBeallit("t1", 20);
  const eredmenyek = await Promise.allSettled(
    Array.from({ length: 25 }, () => logika.kreditLevonas(firestore, "t1", "beadas", BE))
  );
  const sikeres = eredmenyek.filter((r) => r.status === "fulfilled").length;
  const hibak = eredmenyek.filter((r) => r.status === "rejected").map((r) => r.reason);
  assert.ok(sikeres <= 20, `az egyenleg átlépve: ${sikeres}`);
  assert.equal(await egyenleg("t1"), 20 - sikeres);
  // Egy osztály egyszerre adja be a dolgozatot: ütközés miatt NEM bukhat el kérés, csak kredit-hiba lehet.
  const nemKreditHiba = hibak.filter((e) => e?.details?.kod !== "kredit_elfogyott");
  assert.deepEqual(nemKreditHiba.map((e) => String(e?.message).slice(0, 80)), [], "ütközés miatt bukott kérés");
  assert.equal(sikeres, 20, "pontosan az egyenlegnyi kérés jut át");
});

test("hibás AI-művelet nem fogyaszt (a kredit visszaíródik, refund-sorral)", async () => {
  await egyenlegBeallit("t1", 5);
  await assert.rejects(
    () => logika.kreditbol("t1", "beadas", async () => { throw new Error("Gemini elhasalt"); }, BE),
    /Gemini elhasalt/
  );
  assert.equal(await egyenleg("t1"), 5);
  const sorok = await naplo("t1");
  assert.deepEqual(sorok.map((s) => s.reason).sort(), ["refund", "spend"]);
  assert.equal(await logika.kreditbol("t1", "beadas", async () => "kész", BE), "kész");
  assert.equal(await egyenleg("t1"), 4);
});

test("a visszaírás idempotens", async () => {
  await egyenlegBeallit("t1", 5);
  const b = await logika.kreditLevonas(firestore, "t1", "beadas", BE);
  await logika.kreditVisszairas(firestore, b);
  await logika.kreditVisszairas(firestore, b);
  assert.equal(await egyenleg("t1"), 5);
  assert.equal((await naplo("t1")).filter((s) => s.reason === "refund").length, 1);
});

test("a kihagyott beadás-futás nem fogyaszt", async () => {
  await egyenlegBeallit("t1", 5);
  const r = await logika.kreditbol("t1", "beadas", async () => ({ kihagyva: true }), BE);
  assert.deepEqual(r, { kihagyva: true });
  assert.equal(await egyenleg("t1"), 5);
});

test("a tanári állapot: egyenleg, árak, Hub pass és a hub fiókoldala", async () => {
  await egyenlegBeallit("t1", 7);
  let a = await logika.kreditAllapotLogika(firestore, "t1", BE);
  assert.equal(a.kredit, true);
  assert.equal(a.egyenleg, 7);
  assert.equal(a.korlatlan, false);
  assert.deepEqual(a.arak, { beadas: 1, feladatlap: 1, elemzes: 2 });
  assert.equal(a.hub_pass, false);
  assert.equal(a.fiok_url, "https://hub.example/account");
  await firestore.collection("users").doc("t1").set({ entitlements: { all: { status: "active", tier: "hub" } } }, { merge: true });
  a = await logika.kreditAllapotLogika(firestore, "t1", BE);
  assert.equal(a.hub_pass, true);
});

test("a Hub pass-zár: osztályelemzés és színválasztás csak aktív Hub passszal (a pilotban mindenkinek)", async () => {
  await assert.rejects(() => logika.osztalyElemzesKapu(firestore, "t1", BE), (e) => e.details.kod === "elemzes_hub_pass_kell");
  await assert.rejects(() => logika.szinvalasztasKapu(firestore, "t1", BE), (e) => e.details.kod === "szinvalasztas_hub_pass_kell");
  await logika.osztalyElemzesKapu(firestore, "t1", KI);
  await firestore.collection("users").doc("t1").set({ entitlements: { "writing-review": { status: "active" } } });
  await logika.osztalyElemzesKapu(firestore, "t1", BE);
  await firestore.collection("users").doc("t2").set({ entitlements: { all: { status: "canceled" } } });
  await assert.rejects(() => logika.szinvalasztasKapu(firestore, "t2", BE), (e) => e.details.kod === "szinvalasztas_hub_pass_kell");
});

test("elfogyott kreditnél a már kijavított beadás állapota érintetlen marad (újrafuttatás)", async () => {
  await firestore.collection("beadasok").doc("b1").set({ tanar_id: "t1", statusz: "javitva" });
  await kreditBekapcsolva(() =>
    assert.rejects(() => logika.feldolgozBeadas("b1"), (e) => e.details?.kod === "kredit_elfogyott")
  );
  assert.equal((await firestore.collection("beadasok").doc("b1").get()).data().statusz, "javitva");
});

test("a beadás-feldolgozás kihagyott futása nem fogyaszt", async () => {
  await egyenlegBeallit("t1", 5);
  await firestore.collection("feladatok").doc("f1").set({ tanar_id: "t1", osztaly_id: "o1", rubrika: { szempontok: [] } });
  await firestore.collection("beadasok").doc("b2").set({
    tanar_id: "t1", osztaly_id: "o1", diak_id: "d1", feladat_id: "f1",
    forras: "szoveg", szoveg: "Dear Ben.", statusz: "javitva"
  });
  const r = await kreditBekapcsolva(() => logika.feldolgozBeadas("b2", { csakFeltoltve: true }));
  assert.deepEqual(r, { kihagyva: true });
  assert.equal(await egyenleg("t1"), 5, "kihagyott futásért nem jár levonás");
});

test("hanyFer: az egyenlegből hány művelet indítható", () => {
  assert.equal(kredit.hanyFer({ korlatlan: true, egyenleg: 0, arak: { beadas: 1 } }, "beadas"), null);
  assert.equal(kredit.hanyFer({ korlatlan: false, egyenleg: 5, arak: { beadas: 2 } }, "beadas"), 2);
  assert.equal(kredit.hanyFer({ korlatlan: false, egyenleg: 5, arak: { beadas: null } }, "beadas"), 0);
  assert.equal(kredit.hanyFer({ korlatlan: false, egyenleg: 5, arak: { beadas: 0 } }, "beadas"), null);
});
