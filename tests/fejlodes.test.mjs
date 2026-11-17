// ══════════════════════════════════════════════════════
// „Fejlődés az idő mentén” (Hub pass): a tiszta számtan, a Hub pass-zár és a
// tulajdonos-ellenőrzés. Emulátor nélkül fut: a Firestore-t egy kis memóriabeli
// hamis helyettesíti (a lekérdezés csak egyenlőséget ismer, ennyit használ a kód).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-fejlodes-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const f = require("./fejlodes.js");
const fn = require("./index.js");
const t = fn._teszt;

const PROD = { kredit: true };
const PILOT = { kredit: false };
const HUB_PASS = { entitlements: { all: { status: "active", tier: "hub" } } };

// ── az idővonal-pont ──

const beadas = (extra = {}) => ({
  feladat_id: "f1", statusz: "elkuldve", diak_id: "d1", diak_nev: "Anna", tanar_id: "t1", ...extra
});

test("csak a jóváhagyott beadás és a tanári pontszázalék számít", () => {
  assert.equal(f.idovonalPont({ beadas: beadas({ statusz: "javitva" }), tanari: { szazalek: 80 } }), null);
  assert.equal(f.idovonalPont({ beadas: beadas(), tanari: undefined }), null);
  assert.equal(f.idovonalPont({ beadas: beadas(), tanari: { szazalek: null } }), null);
  assert.equal(f.idovonalPont({ beadas: beadas(), tanari: { szazalek: "80" } }), null);
  assert.equal(f.idovonalPont({ beadas: beadas(), tanari: { szazalek: 79.6 } }).szazalek, 80);
});

test("a pont az AI-értékelés hibáit kategóriánként és típusonként összesíti; az AI pontja nem számít", () => {
  const p = f.idovonalPont({
    beadas: beadas(),
    tanari: { szazalek: 70, jovahagyva_at: new Date(2026, 8, 1) },
    ai: {
      szazalek: 99,
      hibak: [
        { kategoria: "nyelvtan", tipus: "past_simple" },
        { kategoria: "nyelvtan", tipus: "past_simple" },
        { kategoria: "nyelvtan", tipus: "articles" },
        { kategoria: "szokincs", tipus: "" },
        { tipus: "x" }
      ]
    },
    feladatCim: "Levél"
  });
  assert.equal(p.szazalek, 70);
  assert.equal(p.feladat_cim, "Levél");
  assert.deepEqual(p.kategoriak, { nyelvtan: 3, szokincs: 1, egyeb: 1 });
  assert.deepEqual(p.tipusok[0], { kategoria: "nyelvtan", tipus: "past_simple", db: 2 });
  assert.equal(p.tipusok.length, 3, "az üres típusú hiba nem lesz típus-sor");
});

// ── az idővonal és az ismétlődő hibák ──

const pont = (feladat, ido, szazalek, tipusok = []) => ({
  feladat_id: feladat, ido, szazalek, kategoriak: {},
  tipusok: tipusok.map(([tipus, db]) => ({ kategoria: "nyelvtan", tipus, db }))
});

test("az idővonal időrendben van, azonos időnél a feladat azonosítója dönt", () => {
  const r = f.idovonalRendezes([pont("b", 20, 1), pont("a", 20, 2), pont("c", 10, 3), null]);
  assert.deepEqual(r.map((x) => x.feladat_id), ["c", "a", "b"]);
});

test("ismétlődőnek az számít, ami legalább két különböző feladatban szerepel", () => {
  const pontok = [
    pont("f1", 1, 50, [["past_simple", 3], ["articles", 1]]),
    pont("f2", 2, 60, [["past_simple", 1]]),
    pont("f3", 3, 70, [["articles", 2], ["past_simple", 1]])
  ];
  const i = f.ismetlodoHibak(pontok);
  assert.deepEqual(i.map((x) => [x.tipus, x.feladat_db, x.db, x.legutobbi]), [
    ["past_simple", 3, 5, true],
    ["articles", 2, 3, true]
  ]);
  const csakEgy = f.ismetlodoHibak([pont("f1", 1, 50, [["a", 5]]), pont("f2", 2, 50, [["b", 5]])]);
  assert.deepEqual(csakEgy, [], "egy feladatban sokszor előfordulás nem ismétlődés");
});

test("a legutobbi jelző megmutatja, hogy a hiba az utolsó feladatban még megvolt-e", () => {
  const i = f.ismetlodoHibak([
    pont("f1", 1, 50, [["old", 1]]), pont("f2", 2, 55, [["old", 1]]), pont("f3", 3, 60, [])
  ]);
  assert.equal(i[0].legutobbi, false);
});

test("a trend az utolsó két pontból jön, 5 százalékpont alatt változatlan", () => {
  assert.equal(f.trend([pont("a", 1, 50)]), null);
  assert.equal(f.trend([pont("a", 1, 50), pont("b", 2, 55)]), "fel");
  assert.equal(f.trend([pont("a", 1, 50), pont("b", 2, 45)]), "le");
  assert.equal(f.trend([pont("a", 1, 50), pont("b", 2, 54)]), "valtozatlan");
  assert.equal(f.trend([pont("a", 1, 10), pont("b", 2, 90), pont("c", 3, 88)]), "valtozatlan");
});
test("a diáklista a csoport diákjaiból, névsorrendben; a jóváhagyott beadás nélküli diák is szerepel", () => {
  const lista = f.diakLista(
    [{ id: "d2", nev: "Zoli" }, { id: "d1", nev: "Ágnes" }, { id: "d3", nev: "Béla" }],
    new Map([["d1", [pont("f1", 1, 40), pont("f2", 2, 70)]]])
  );
  assert.deepEqual(lista.map((x) => x.nev), ["Ágnes", "Béla", "Zoli"]);
  assert.deepEqual(lista[0], { diak_id: "d1", nev: "Ágnes", beadas_db: 2, utolso_szazalek: 70, trend: "fel" });
  assert.deepEqual(lista[1], { diak_id: "d3", nev: "Béla", beadas_db: 0, utolso_szazalek: null, trend: null });
});

// ── a szerveroldali kapu: hamis Firestore ──

function hamisFirestore(dokumentumok) {
  const mélység = (ut) => ut.split("/").length;
  const doc = (ut) => ({
    id: ut.split("/").pop(),
    path: ut,
    get: async () => ({
      id: ut.split("/").pop(), exists: ut in dokumentumok, data: () => dokumentumok[ut], ref: doc(ut)
    }),
    collection: (nev) => gyujtemeny(`${ut}/${nev}`)
  });
  const gyujtemeny = (ut, szurok = []) => {
    const lista = async () => ({
      docs: Object.keys(dokumentumok)
        .filter((k) => k.startsWith(`${ut}/`) && mélység(k) === mélység(ut) + 1)
        .filter((k) => szurok.every(([mezo, ertek]) => dokumentumok[k][mezo] === ertek))
        .map((k) => ({ id: k.split("/").pop(), ref: doc(k), data: () => dokumentumok[k] }))
    });
    return {
      doc: (id) => doc(`${ut}/${id}`),
      where: (mezo, op, ertek) => {
        assert.equal(op, "==");
        return gyujtemeny(ut, [...szurok, [mezo, ertek]]);
      },
      get: lista
    };
  };
  return { collection: (nev) => gyujtemeny(nev) };
}

const csBeadas = (extra = {}) => ({
  feladat_id: "f1", statusz: "elkuldve", tanar_id: "t1", csoport_id: "cs1", csoport_diak_id: "d1", becenev: "Anna", ...extra
});

const ADAT = {
  "users/t1": HUB_PASS,
  "users/t2": { entitlements: { all: { status: "canceled" } } },
  "csoportok/cs1": { tanar_id: "t1", nev: "9.B" },
  "csoportok/cs1/diakok/d1": { nev: "Anna", becenevek: ["anna"] },
  "csoportok/cs1/diakok/d2": { nev: "Béla", becenevek: ["bela"] },
  "feladatok/f1": { cim: "Levél", tanar_id: "t1" },
  "feladatok/f2": { cim: "Esszé", tanar_id: "t1" },
  "beadasok/b1": csBeadas({ feladat_id: "f1" }),
  "beadasok/b1/ertekeles/tanari": { szazalek: 50, jovahagyva_at: 100 },
  "beadasok/b1/ertekeles/ai": { hibak: [{ kategoria: "nyelvtan", tipus: "past_simple" }] },
  "beadasok/b2": csBeadas({ feladat_id: "f2" }),
  "beadasok/b2/ertekeles/tanari": { szazalek: 75, jovahagyva_at: 200 },
  "beadasok/b2/ertekeles/ai": { hibak: [{ kategoria: "nyelvtan", tipus: "past_simple" }] },
  // jóváhagyatlan: nem számít
  "beadasok/b3": csBeadas({ feladat_id: "f2", statusz: "javitva", csoport_diak_id: "d2" }),
  "beadasok/b3/ertekeles/tanari": { szazalek: 10 },
  // másik csoport beadása: nem számít
  "beadasok/b4": csBeadas({ feladat_id: "f2", csoport_id: "cs2", csoport_diak_id: "d2" }),
  "beadasok/b4/ertekeles/tanari": { szazalek: 99 },
  // idegen tanár csoportja
  "csoportok/cs9": { tanar_id: "t9", nev: "Idegen" },
  "csoportok/cs9/diakok/x": { nev: "X" }
};

const kod = async (futas) => {
  try { await futas(); } catch (e) { return e.details?.kod || e.code; }
  return "nem-hibazott";
};

test("kredites környezetben a Hub pass nélküli tanárt a szerver elutasítja (fejlodes_hub_pass_kell), adatolvasás előtt", async () => {
  const fs = hamisFirestore(ADAT);
  assert.equal(await kod(() => t.csoportFejlodesListaLogika(fs, "t2", { csoportId: "cs1" }, PROD)), "fejlodes_hub_pass_kell");
  assert.equal(await kod(() => t.csoportFejlodesDiakLogika(fs, "t2", { csoportId: "cs1", diakId: "d1" }, PROD)), "fejlodes_hub_pass_kell");
  assert.equal(await kod(() => t.fejlodesKapu(fs, "nincs-ilyen-tanar", PROD)), "fejlodes_hub_pass_kell");
});

test("a Hub passos tanár megkapja a csoport listáját és a diák idővonalát", async () => {
  const fs = hamisFirestore(ADAT);
  const lista = await t.csoportFejlodesListaLogika(fs, "t1", { csoportId: "cs1" }, PROD);
  assert.deepEqual(lista.diakok, [
    { diak_id: "d1", nev: "Anna", beadas_db: 2, utolso_szazalek: 75, trend: "fel" },
    { diak_id: "d2", nev: "Béla", beadas_db: 0, utolso_szazalek: null, trend: null }
  ]);

  const nezet = await t.csoportFejlodesDiakLogika(fs, "t1", { csoportId: "cs1", diakId: "d1" }, PROD);
  assert.equal(nezet.nev, "Anna");
  assert.deepEqual(nezet.pontok.map((p) => [p.feladat_cim, p.szazalek]), [["Levél", 50], ["Esszé", 75]]);
  assert.equal(nezet.ismetlodo[0].tipus, "past_simple");
  assert.equal(nezet.trend, "fel");
  assert.equal(nezet.pontok[0].diak_id, undefined, "a diák azonosítója nem szivárog a pontokba");
});

test("kredit nélkül (pilot-beállítás) a Hub pass nem számít", async () => {
  const fs = hamisFirestore({ ...ADAT, "users/t1": {} });
  assert.equal((await t.csoportFejlodesListaLogika(fs, "t1", { csoportId: "cs1" }, PILOT)).diakok.length, 2);
  assert.equal(await kod(() => t.fejlodesKapu(fs, "t2", PILOT)), "nem-hibazott");
});

test("idegen csoportot Hub passos tanár sem kérhet le; hiányzó vagy ismeretlen csoport és diák hibát ad", async () => {
  const fs = hamisFirestore(ADAT);
  assert.equal(await kod(() => t.csoportFejlodesListaLogika(fs, "t1", { csoportId: "cs9" }, PROD)), "csoport_nincs");
  assert.equal(await kod(() => t.csoportFejlodesDiakLogika(fs, "t1", { csoportId: "cs9", diakId: "x" }, PROD)), "csoport_nincs");
  assert.equal(await kod(() => t.csoportFejlodesListaLogika(fs, "t1", { csoportId: "nincs" }, PROD)), "csoport_nincs");
  assert.equal(await kod(() => t.csoportFejlodesListaLogika(fs, "t1", {}, PROD)), "csoport_nincs");
  assert.equal(await kod(() => t.csoportFejlodesDiakLogika(fs, "t1", { csoportId: "cs1" }, PROD)), "csoport_diak_nincs");
  assert.equal(await kod(() => t.csoportFejlodesDiakLogika(fs, "t1", { csoportId: "cs1", diakId: "nincs" }, PROD)), "csoport_diak_nincs");
  // kredit nélkül is: a tulajdonos-ellenőrzés nem a Hub passon múlik
  assert.equal(await kod(() => t.csoportFejlodesListaLogika(fs, "t2", { csoportId: "cs1" }, PILOT)), "csoport_nincs");
});

test("a jóváhagyatlan és a másik csoportban született beadás nem kerül az idővonalra", async () => {
  const fs = hamisFirestore(ADAT);
  const nezet = await t.csoportFejlodesDiakLogika(fs, "t1", { csoportId: "cs1", diakId: "d2" }, PROD);
  assert.deepEqual(nezet.pontok, []);
  assert.equal(nezet.trend, null);
});

// ── a grafikon-modul: a sablonból épülő kulcsok (az i18n teszt a t(`...${x}`) hívásokat nem látja) ──

test("a grafikon minden hibakategóriájának van felirata magyarul és angolul, és a szerver kategóriái is bennük vannak", async () => {
  const { readFileSync } = await import("node:fs");
  const forras = readFileSync(new URL("../public/js/fejlodes-grafikon.js", import.meta.url), "utf8");
  const kategoriak = forras.match(/const KATEGORIAK = \[([^\]]+)\]/)[1].match(/"(\w+)"/g).map((s) => s.slice(1, -1));
  const hu = (await import("../public/js/i18n-hu.js")).default;
  const en = (await import("../public/js/i18n-en.js")).default;
  for (const kat of kategoriak) {
    assert.ok(hu[`diakok.kat_${kat}`], `hu: ${kat}`);
    assert.ok(en[`diakok.kat_${kat}`], `en: ${kat}`);
  }
  // a szerver zárt kategóriakészlete (docs/adatmodell.md) + az "egyeb" gyűjtő; legfeljebb 7 szín
  for (const kat of ["nyelvtan", "szokincs", "szerkezet", "tartalom", "helyesiras", "irasjelek", "egyeb"]) {
    assert.ok(kategoriak.includes(kat), `hiányzik a grafikonról: ${kat}`);
  }
  assert.ok(kategoriak.length <= 7);
});

// ── Hub passhoz kötött funkciók: az osztályszintű elemzés ──

test("az osztályelemzés zárja: Hub pass nélkül a szerver elutasítja (elemzes_hub_pass_kell), Hub passszal átmegy", async () => {
  const fs = hamisFirestore({
    "users/nincs": {},
    "users/lejart": { entitlements: { all: { status: "canceled" } } },
    "users/hub": HUB_PASS,
    "users/wr": { entitlements: { "writing-review": { status: "active", source: "admin" } } }
  });
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "nincs", PROD)), "elemzes_hub_pass_kell");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "lejart", PROD)), "elemzes_hub_pass_kell");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "nincs-ilyen", PROD)), "elemzes_hub_pass_kell");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "hub", PROD)), "nem-hibazott");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "wr", PROD)), "nem-hibazott", "a WR saját kulcsa is nyit");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "nincs", PILOT)), "nem-hibazott", "a pilotban nincs zár");
});

test("a feladatElemzes a Hub pass-zárat az első adatolvasás és az AI-hívás előtt hívja", async () => {
  const { readFileSync } = await import("node:fs");
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const torzs = forras.slice(forras.indexOf("exports.feladatElemzes = onCall("));
  const kapu = torzs.indexOf("osztalyElemzesKapu(firestore, uid)");
  assert.ok(kapu > 0, "a zár nincs bekötve");
  assert.ok(kapu < torzs.indexOf('.collection("feladatok")'), "a zár az első olvasás után van");
  assert.ok(kapu < torzs.indexOf("aiHivas("), "a zár az AI-hívás után van");
});

