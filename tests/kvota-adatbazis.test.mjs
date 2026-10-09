// ══════════════════════════════════════════════════════
// AI-kvóta – az adatbázisos rész, valódi Firestore-emulátor ellen
// (a tiszta logikát a kvota.test.mjs fedi)
//
// Csak a kereskedelmi (prod) környezetben él: a pilotban ki van kapcsolva, ott
// semmi nem korlátozódik és semmi nem íródik. Az ingyenes csomag egyszeri
// 20 egység (nem újul meg), a fizetős havi.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
// Más projekt-azonosító, mint a többi emulátoros tesztben (azok törlik az adatot).
process.env.GCLOUD_PROJECT = "wr-kvota-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let firestore, logika;

before(() => {
  logika = require("./index.js")._teszt;
  firestore = require("firebase-admin/firestore").getFirestore();
});

after(async () => {
  await firestore?.terminate();
});

beforeEach(async () => {
  const tanarok = await firestore.collection("tanarok").get();
  for (const d of tanarok.docs) {
    const h = await d.ref.collection("hasznalat").get();
    await Promise.all(h.docs.map((x) => x.ref.delete()));
    await d.ref.delete();
  }
  for (const koll of ["beadasok", "feladatok"]) {
    const snap = await firestore.collection(koll).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

const BE = { kvota: true };
const KI = { kvota: false };
const hasznalat = async (uid, kulcs) =>
  (await firestore.collection("tanarok").doc(uid).collection("hasznalat").doc(kulcs).get()).data()?.egyseg ?? 0;

/** A kvóta bekapcsolása a tesztre: a beadás-feldolgozás a környezet beállítását olvassa. */
async function kvotaBekapcsolva(fn) {
  const eredeti = logika.BEALLITASOK.kvota;
  logika.BEALLITASOK.kvota = true;
  try {
    return await fn();
  } finally {
    logika.BEALLITASOK.kvota = eredeti;
  }
}

test("a pilotban (kikapcsolva) nincs foglalás, nem ír semmit, és nem korlátoz", async () => {
  assert.equal(await logika.kvotaFoglalas(firestore, "t1", "beadas", KI), null);
  let futott = 0;
  for (let i = 0; i < 50; i++) {
    await logika.kvotaval("t1", "beadas", async () => { futott++; }, KI);
  }
  assert.equal(futott, 50);
  assert.equal((await firestore.collection("tanarok").get()).size, 0, "a pilotban semmi sem íródik a tanarok alá");
  assert.deepEqual(await logika.kvotaAllapotLogika(firestore, "t1", KI), { kvota: false });
});

test("az ingyenes csomag pontosan 20 egységet enged, a 21. elutasítva, kódolt hibával", async () => {
  for (let i = 0; i < 20; i++) await logika.kvotaFoglalas(firestore, "t1", "beadas", BE);
  assert.equal(await hasznalat("t1", "osszes"), 20);
  await assert.rejects(
    () => logika.kvotaFoglalas(firestore, "t1", "beadas", BE),
    (e) => e.code === "resource-exhausted" && e.details.kod === "kvota_elfogyott_egyszeri"
      && e.details.limit === 20 && e.details.hasznalt === 20
  );
  assert.equal(await hasznalat("t1", "osszes"), 20, "az elutasított művelet nem fogyaszt");
});

test("az ingyenes keret NEM újul meg a következő hónapban", async () => {
  const okt = new Date("2026-10-15T10:00:00Z");
  const nov = new Date("2026-11-02T10:00:00Z");
  for (let i = 0; i < 20; i++) await logika.kvotaFoglalas(firestore, "t1", "beadas", BE, okt);
  await assert.rejects(
    () => logika.kvotaFoglalas(firestore, "t1", "beadas", BE, nov),
    (e) => e.details.kod === "kvota_elfogyott_egyszeri"
  );
});

test("a fizetős (alap) csomag havi: a hónap végén elfogy, a következő hónapban újraindul", async () => {
  await firestore.collection("tanarok").doc("t1").set({ csomag: "alap" });
  await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("2026-10").set({ egyseg: 150 });
  const okt = new Date("2026-10-31T23:00:00Z");
  const nov = new Date("2026-11-01T00:30:00Z");
  await assert.rejects(
    () => logika.kvotaFoglalas(firestore, "t1", "beadas", BE, okt),
    (e) => e.details.kod === "kvota_elfogyott" && e.details.limit === 150
  );
  await logika.kvotaFoglalas(firestore, "t1", "beadas", BE, nov);
  assert.equal(await hasznalat("t1", "2026-11"), 1);
});

test("a korlátlan csomag nem korlátoz; az ismeretlen csomagnév ingyenesként számít", async () => {
  await firestore.collection("tanarok").doc("t1").set({ csomag: "korlatlan" });
  await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc(new Date().toISOString().slice(0, 7)).set({ egyseg: 1e6 });
  await logika.kvotaFoglalas(firestore, "t1", "beadas", BE);

  await firestore.collection("tanarok").doc("t2").set({ csomag: "valami-kamu" });
  await firestore.collection("tanarok").doc("t2").collection("hasznalat").doc("osszes").set({ egyseg: 20 });
  await assert.rejects(() => logika.kvotaFoglalas(firestore, "t2", "beadas", BE), (e) => e.details.limit === 20);
});

test("a kétegységes művelet (kulcs) nem fér el, ha csak egy maradt", async () => {
  await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("osszes").set({ egyseg: 19 });
  await assert.rejects(() => logika.kvotaFoglalas(firestore, "t1", "kulcs", BE), (e) => e.details.kod === "kvota_elfogyott_egyszeri");
  await logika.kvotaFoglalas(firestore, "t1", "beadas", BE);
  assert.equal(await hasznalat("t1", "osszes"), 20);
});

test("párhuzamos kérések sem léphetnek túl a kereten (25 egyidejű → pontosan 20 jut át)", async () => {
  const eredmenyek = await Promise.allSettled(
    Array.from({ length: 25 }, () => logika.kvotaFoglalas(firestore, "t1", "beadas", BE))
  );
  assert.equal(eredmenyek.filter((r) => r.status === "fulfilled").length, 20);
  assert.equal(await hasznalat("t1", "osszes"), 20);
});

test("hibás AI-művelet nem fogyaszt (az egység visszakerül)", async () => {
  await assert.rejects(
    () => logika.kvotaval("t1", "beadas", async () => { throw new Error("Gemini elhasalt"); }, BE),
    /Gemini elhasalt/
  );
  assert.equal(await hasznalat("t1", "osszes"), 0);
  assert.equal(await logika.kvotaval("t1", "beadas", async () => "kész", BE), "kész");
  assert.equal(await hasznalat("t1", "osszes"), 1);
});

test("a kihagyott (nem foglalható) beadás-futás nem fogyaszt", async () => {
  const r = await logika.kvotaval("t1", "beadas", async () => ({ kihagyva: true }), BE);
  assert.deepEqual(r, { kihagyva: true });
  assert.equal(await hasznalat("t1", "osszes"), 0);
});

test("a tanári állapot az ingyenesnél egyszeri, a fizetősnél havi időszakot jelez; ismeretlen csomag nem állítható", async () => {
  const most = new Date("2026-10-09T10:00:00Z");
  await logika.kvotaFoglalas(firestore, "t1", "beadas", BE, most);
  assert.deepEqual(
    await logika.kvotaAllapotLogika(firestore, "t1", BE, most),
    { kvota: true, csomag: "ingyenes", limit: 20, hasznalt: 1, idoszak: "egyszeri", honap: null }
  );
  await logika.csomagBeallitasLogika(firestore, "t1", "alap");
  assert.deepEqual(
    await logika.kvotaAllapotLogika(firestore, "t1", BE, most),
    { kvota: true, csomag: "alap", limit: 150, hasznalt: 0, idoszak: "havi", honap: "2026-10" }
  );
  // az eltávolított "profi" csomag nem állítható be
  await assert.rejects(() => logika.csomagBeallitasLogika(firestore, "t1", "profi"), (e) => e.details.kod === "csomag_ervenytelen");
});

test("elfogyott keretnél a már kijavított beadás állapota érintetlen marad (újrafuttatás)", async () => {
  await firestore.collection("tanarok").doc("t1").collection("hasznalat").doc("osszes").set({ egyseg: 20 });
  await firestore.collection("beadasok").doc("b1").set({ tanar_id: "t1", statusz: "javitva" });
  await kvotaBekapcsolva(() =>
    assert.rejects(() => logika.feldolgozBeadas("b1"), (e) => e.details?.kod === "kvota_elfogyott_egyszeri")
  );
  assert.equal((await firestore.collection("beadasok").doc("b1").get()).data().statusz, "javitva");
  assert.equal(await hasznalat("t1", "osszes"), 20);
});

test("a beadás-feldolgozás kihagyott futása (másik fut / nem induló állapot) nem fogyaszt", async () => {
  await firestore.collection("feladatok").doc("f1").set({ tanar_id: "t1", osztaly_id: "o1", rubrika: { szempontok: [] } });
  await firestore.collection("beadasok").doc("b2").set({
    tanar_id: "t1", osztaly_id: "o1", diak_id: "d1", feladat_id: "f1",
    kep_paths: ["beadasok/d1/b2/1.jpg"], statusz: "javitva"
  });
  const r = await kvotaBekapcsolva(() => logika.feldolgozBeadas("b2", { csakFeltoltve: true }));
  assert.deepEqual(r, { kihagyva: true });
  assert.equal(await hasznalat("t1", "osszes"), 0, "kihagyott futásért nem jár levonás");
});
