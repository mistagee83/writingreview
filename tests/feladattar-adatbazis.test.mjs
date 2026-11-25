// ══════════════════════════════════════════════════════
// Érettségi feladattár – a függvények valódi Firestore-emulátor ellen (docs/erettsegi-feladattar-terv.md 8./3.)
//
// Amit védünk: a Hub pass-zár a szerveren (mind a négy függvényen, adatolvasás és -írás előtt),
// a hibás azonosító, és a tárból készült feladat a TELJES úton: létrehozás → a „már elkészítetted”
// jelzés → szerkesztés a kliensről (a szabályok változatlanok) → feladatlink → a diák látja a
// leírást → beadás → az értékelés indítása → az AI az érettségi szempontjai szerint értékel.
// A tartalom a tests/fixtures/feladattar/erettsegi/ mintáiból jön.
//
// Futtatás a tests/ könyvtárból: npm test
// ══════════════════════════════════════════════════════

import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, updateDoc } from "firebase/firestore";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
// Más projekt-azonosító, mint a többi emulátoros tesztben (azok törlik az adatot).
process.env.GCLOUD_PROJECT = "wr-feladattar-adatbazis-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/feladattar/erettsegi", import.meta.url));

const PROD = { kredit: true };
const PILOT = { kredit: false };
const HUB_PASS = { entitlements: { all: { status: "active", tier: "hub" } } };
const LEJART = { entitlements: { all: { status: "canceled" } } };
const ID = "2024-maj-kozep-W2";

let firestore, logika, ft, eredetiFetch, szabalyEnv;

before(async () => {
  logika = require("./index.js")._teszt;
  ft = require("./feladattar.js");
  logika.FELADATTAR.konyvtar = FIXTURE;
  firestore = require("firebase-admin/firestore").getFirestore();
  szabalyEnv = await initializeTestEnvironment({
    projectId: "wr-feladattar-szabaly-teszt",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: Number(String(process.env.FIRESTORE_EMULATOR_HOST).split(":").pop()) || 8080
    }
  });
});

after(async () => {
  await firestore?.terminate();
  await szabalyEnv?.cleanup();
});

beforeEach(async () => {
  eredetiFetch = globalThis.fetch;
  for (const koll of ["users", "feladatok", "beadasok", "linkek", "ai_hasznalat"]) {
    const snap = await firestore.collection(koll).get();
    for (const d of snap.docs) {
      for (const al of await d.ref.listCollections()) {
        const s = await al.get();
        await Promise.all(s.docs.map((x) => x.ref.delete()));
      }
      await d.ref.delete();
    }
  }
  await firestore.collection("users").doc("hub").set(HUB_PASS);
  await firestore.collection("users").doc("lejart").set(LEJART);
  await firestore.collection("users").doc("nincs").set({ entitlements: {} });
});
afterEach(() => { globalThis.fetch = eredetiFetch; });

async function kod(fn) {
  try { await fn(); } catch (e) { return e.details?.kod ?? e.message; }
  return "nem-hibazott";
}

const hivasok = (uid, b, adat = { id: ID }) => ({
  lista: () => logika.feladattarListaLogika(firestore, uid, b),
  elonezet: () => logika.feladattarElonezetLogika(firestore, uid, adat, b),
  keszit: () => logika.feladattarbolFeladatLogika(firestore, uid, adat, b),
  sablonok: () => logika.erettsegiSablonokLogika(firestore, uid, b)
});

test("Hub pass-zár: nélküle (nincs, lejárt, nincs users-dokumentum) mind a négy függvény elutasít, és nem jön létre feladat", async () => {
  for (const uid of ["nincs", "lejart", "nincs-ilyen-tanar"]) {
    for (const [nev, fn] of Object.entries(hivasok(uid, PROD))) {
      assert.equal(await kod(fn), "erettsegi_tar_hub_pass_kell", `${uid}: ${nev}`);
    }
  }
  // a zár a bemenet vizsgálata előtt jön: hibás azonosítóval is a zár szól
  assert.equal(await kod(hivasok("nincs", PROD, { id: "rossz" }).keszit), "erettsegi_tar_hub_pass_kell");
  assert.equal((await firestore.collection("feladatok").get()).size, 0);
});

test("Hub passszal mind a négy működik; a pilotban (kredit nélkül) nincs zár", async () => {
  for (const [uid, b] of [["hub", PROD], ["nincs", PILOT]]) {
    const h = hivasok(uid, b);
    assert.equal((await h.lista()).feladatok.length, 5, uid);
    assert.equal((await h.elonezet()).id, ID, uid);
    assert.match((await h.keszit()).feladatId, /^[A-Za-z0-9]{20}$/, uid);
    const s = (await h.sablonok()).sablonok;
    assert.deepEqual(s.map((x) => [x.id, x.pont]),
      [["kozep-level", 11], ["kozep-fogalmazas", 22], ["emelt-level", 15], ["emelt-fogalmazas", 15]], uid);
  }
});

test("hibás és ismeretlen tár-azonosító: adatbázis-írás nélkül elutasítva", async () => {
  for (const id of [undefined, "", 42, "../x", "2024-maj-kozep-W3", "2024-maj-kozep-W2 ", { id: ID }]) {
    assert.equal(await kod(hivasok("hub", PROD, { id }).keszit), "tar_feladat_id_kell", String(id));
    assert.equal(await kod(hivasok("hub", PROD, { id }).elonezet), "tar_feladat_id_kell", String(id));
  }
  assert.equal(await kod(hivasok("hub", PROD, { id: "2099-maj-emelt-W1" }).keszit), "tar_feladat_nincs");
  assert.equal(await kod(hivasok("hub", PROD, { id: "2099-maj-emelt-W1" }).elonezet), "tar_feladat_nincs");
  assert.equal((await firestore.collection("feladatok").get()).size, 0);
});

test("a tárból készült feladat a teljes úton: létrehozás, jelzés, szerkesztés, link, beadás, értékelés", async () => {
  // 1. létrehozás a szerveren
  const elotte = await logika.feladattarListaLogika(firestore, "hub", PROD);
  assert.deepEqual(elotte.keszitett, []);
  const { feladatId } = await logika.feladattarbolFeladatLogika(firestore, "hub", { id: ID }, PROD);
  const f = (await firestore.collection("feladatok").doc(feladatId).get()).data();
  assert.deepEqual(Object.keys(f).sort(), ["aktiv", "cim", "hatarido", "letrehozva", "rubrika", "tanar_id"],
    "ugyanazok a mezők, mint a kliens létrehozásánál (a szabály hasOnly-listája)");
  assert.equal(f.tanar_id, "hub");
  assert.equal(f.aktiv, true);
  assert.equal(f.hatarido, null);
  assert.equal(f.cim, "Email to Pavel about his girlfriend's blue hair");
  assert.deepEqual(f.rubrika.tar, { id: ID, verzio: 1 });
  assert.equal(f.rubrika.tipus, "levél");
  assert.equal(f.rubrika.min_szo, 100);
  assert.ok(f.rubrika.feladat_leiras.startsWith("You received the following email"));
  assert.equal(f.rubrika.szempontok.reduce((a, s) => a + s.suly, 0), 22);

  // 2. „már elkészítetted” – csak a saját feladatai közül
  await firestore.collection("feladatok").doc("idegen").set({ tanar_id: "mas", rubrika: { tar: { id: "2006-febr-kozep-W1", verzio: 1 } } });
  assert.deepEqual((await logika.feladattarListaLogika(firestore, "hub", PROD)).keszitett, [ID]);

  // 3. a tanár a kliensről szerkesztheti (a szabályok változatlanok): jegyskála, visszajelzés nyelve, a tar megmarad
  await szabalyEnv.clearFirestore();
  await szabalyEnv.withSecurityRulesDisabled(async (ctx) => {
    const { setDoc } = await import("firebase/firestore");
    await setDoc(doc(ctx.firestore(), "feladatok", feladatId), { ...f, letrehozva: new Date() });
  });
  const tanarDb = szabalyEnv.authenticatedContext("hub", { szerep: "tanar" }).firestore();
  await assertSucceeds(getDoc(doc(tanarDb, "feladatok", feladatId)));
  await assertSucceeds(updateDoc(doc(tanarDb, "feladatok", feladatId), {
    cim: "Pavel – blue hair", hatarido: null,
    rubrika: { ...f.rubrika, kimeneti_nyelv: "hu", skala: { tipus: "szazalek" } }
  }));
  const idegenDb = szabalyEnv.authenticatedContext("mas", { szerep: "tanar" }).firestore();
  await assertFails(getDoc(doc(idegenDb, "feladatok", feladatId)));

  // 4. link, a diák a leírást és a szempontokat látja (az AI-kérést és a tár-jelzőt nem)
  const { token } = await logika.linkInditasLogika(firestore, "hub", { feladatId });
  const adatok = await logika.linkAdatokLogika(firestore, { token });
  assert.equal(adatok.allapot, "aktiv");
  assert.equal(adatok.feladat.leiras, f.rubrika.feladat_leiras);
  assert.deepEqual(adatok.feladat.szempontok.map((s) => s.suly), [6, 2, 4, 5, 5]);
  assert.ok(!JSON.stringify(adatok).includes(f.rubrika.egyeb_utasitas), "az AI-kérés nem megy ki a diáknak");

  // 5. beadás
  const SZOVEG = "Hi Pavel, I think dying your hair is a personal choice. Your mum should relax a bit.";
  const { diakToken } = await logika.linkBeadasLogika(firestore, {
    token, becenev: "Kék Sárkány", szoveg: SZOVEG,
    jelzesek: { elhagyas_db: 0, elhagyas_mp: 0, beillesztes_db: 0, beillesztett_karakter: 0, beillesztett_tartomanyok: [],
      beillesztes_kiserlet_db: 0, nagy_betoldas_db: 0, irasi_mp: 300, osszes_mp: 320, esemenyek: [] }
  });
  const beadasId = createHash("sha256").update(diakToken).digest("hex");

  // 6. az értékelés indítása és a háttér-feldolgozás (AI-helyettesítővel)
  const kerek = [];
  globalThis.fetch = async (url, opts) => {
    kerek.push(JSON.parse(opts.body).contents[0].parts[0].text);
    return {
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          szempontok: f.rubrika.szempontok.map((s) => ({ kulcs: s.kulcs, pont: s.suly - 1, max: s.suly, megjegyzes: "Rendben." })),
          hibak: [], erossegek: ["Közvetlen hangnem"], fejlesztendo: [], diak_szoveg: "Szép munka!"
        }) }] } }],
        usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100, totalTokenCount: 600 }
      })
    };
  };
  const ind = await logika.ertekelesInditasLogika(firestore, "hub", { feladatId }, { beallitasok: PILOT });
  assert.equal(ind.inditva, 1);
  const r = await logika.sorFeldolgozas(beadasId);
  assert.equal(r.osszpontszam, 22 - 5);
  assert.equal(kerek.length, 1);
  assert.ok(kerek[0].includes(f.rubrika.feladat_leiras.split("\n")[0]), "az AI a tár leírását kapja");
  assert.ok(kerek[0].includes(f.rubrika.egyeb_utasitas), "és az érettségi sablon AI-kérését");
  assert.ok(kerek[0].includes("nyelvhelyesseg"), "az érettségi szempontjai szerint");
  assert.equal((await firestore.collection("beadasok").doc(beadasId).get()).data().statusz, "javitva");
});
