// ══════════════════════════════════════════════════════
// „Fejlődés az idő mentén” (Profi csomag): a tiszta számtan, a csomag-zár és a
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

const PROD = { kvota: true };
const PILOT = { kvota: false };

// ── a csomag-zár döntése ──

test("kvótás környezetben csak a Profi és a korlátlan csomag nyitja meg a nézetet", () => {
  assert.equal(f.fejlodesEngedelyezett(PROD, "profi"), true);
  assert.equal(f.fejlodesEngedelyezett(PROD, "korlatlan"), true);
  assert.equal(f.fejlodesEngedelyezett(PROD, "alap"), false);
  assert.equal(f.fejlodesEngedelyezett(PROD, "ingyenes"), false);
});

test("a hiányzó, ismeretlen vagy hamisított csomagnév ingyenesnek számít (zárt)", () => {
  for (const csomag of [undefined, null, "", "Profi", "profi ", "__proto__", "toString", "admin"]) {
    assert.equal(f.fejlodesEngedelyezett(PROD, csomag), false, String(csomag));
  }
});

test("a pilotban (nincs kvóta) mindenkinek elérhető", () => {
  assert.equal(f.fejlodesEngedelyezett(PILOT, "ingyenes"), true);
  assert.equal(f.fejlodesEngedelyezett(PILOT, undefined), true);
});

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

test("a diáklista névsorrendben van, a beadás nélküli tag is szerepel", () => {
  const lista = f.diakLista(
    [{ uid: "d2", nev: "Zoli" }, { uid: "d1", nev: "Ágnes" }, { uid: "d3", nev: "Béla" }],
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

const ADAT = {
  "tanarok/t1": { csomag: "profi" },
  "tanarok/t2": { csomag: "alap" },
  "osztalyok/o1": { tanar_id: "t1" },
  "osztalyok/o1/tagok/d1": { nev: "Anna" },
  "osztalyok/o1/tagok/d2": { nev: "Béla" },
  "feladatok/f1": { cim: "Levél", tanar_id: "t1" },
  "feladatok/f2": { cim: "Esszé", tanar_id: "t1" },
  "beadasok/b1": beadas({ osztaly_id: "o1", feladat_id: "f1" }),
  "beadasok/b1/ertekeles/tanari": { szazalek: 50, jovahagyva_at: 100 },
  "beadasok/b1/ertekeles/ai": { hibak: [{ kategoria: "nyelvtan", tipus: "past_simple" }] },
  "beadasok/b2": beadas({ osztaly_id: "o1", feladat_id: "f2" }),
  "beadasok/b2/ertekeles/tanari": { szazalek: 75, jovahagyva_at: 200 },
  "beadasok/b2/ertekeles/ai": { hibak: [{ kategoria: "nyelvtan", tipus: "past_simple" }] },
  // jóváhagyatlan: nem számít
  "beadasok/b3": beadas({ osztaly_id: "o1", feladat_id: "f2", statusz: "javitva", diak_id: "d2", diak_nev: "Béla" }),
  "beadasok/b3/ertekeles/tanari": { szazalek: 10 },
  // hamisított tanar_id: nem számít
  "beadasok/b4": beadas({ osztaly_id: "o1", feladat_id: "f2", tanar_id: "masik", diak_id: "d2", diak_nev: "Béla" }),
  "beadasok/b4/ertekeles/tanari": { szazalek: 99 }
};

const kod = async (futas) => {
  try { await futas(); } catch (e) { return e.details?.kod || e.code; }
  return "nem-hibazott";
};

test("kvótás környezetben az alap csomagú tanárt a szerver elutasítja (csomag_profi_kell)", async () => {
  const fs = hamisFirestore(ADAT);
  assert.equal(await kod(() => t.fejlodesListaLogika(fs, "t2", { osztalyId: "o1" }, PROD)), "csomag_profi_kell");
  assert.equal(await kod(() => t.fejlodesDiakLogika(fs, "t2", { osztalyId: "o1", diakId: "d1" }, PROD)), "csomag_profi_kell");
  assert.equal(await kod(() => t.fejlodesKapu(fs, "nincs-ilyen-tanar", PROD)), "csomag_profi_kell");
});

test("a Profi csomagú tanár megkapja a listát és az idővonalat", async () => {
  const fs = hamisFirestore(ADAT);
  const lista = await t.fejlodesListaLogika(fs, "t1", { osztalyId: "o1" }, PROD);
  assert.deepEqual(lista.diakok, [
    { diak_id: "d1", nev: "Anna", beadas_db: 2, utolso_szazalek: 75, trend: "fel" },
    { diak_id: "d2", nev: "Béla", beadas_db: 0, utolso_szazalek: null, trend: null }
  ]);

  const nezet = await t.fejlodesDiakLogika(fs, "t1", { osztalyId: "o1", diakId: "d1" }, PROD);
  assert.equal(nezet.nev, "Anna");
  assert.deepEqual(nezet.pontok.map((p) => [p.feladat_cim, p.szazalek]), [["Levél", 50], ["Esszé", 75]]);
  assert.equal(nezet.ismetlodo[0].tipus, "past_simple");
  assert.equal(nezet.pontok[0].diak_id, undefined, "a diák azonosítója nem szivárog a pontokba");
});

test("a pilotban a csomag nem számít", async () => {
  const fs = hamisFirestore(ADAT);
  const lista = await t.fejlodesListaLogika(fs, "t1", { osztalyId: "o1" }, PILOT);
  assert.equal(lista.diakok.length, 2);
  assert.equal(await kod(() => t.fejlodesKapu(fs, "t2", PILOT)), "nem-hibazott");
});

test("idegen osztályt Profi tanár sem kérhet le, a hiányzó paraméter és osztály hibát ad", async () => {
  const fs = hamisFirestore(ADAT);
  assert.equal(await kod(() => t.fejlodesListaLogika(fs, "t2", { osztalyId: "o1" }, PILOT)), "nem_a_te_osztalyod");
  assert.equal(await kod(() => t.fejlodesDiakLogika(fs, "t2", { osztalyId: "o1", diakId: "d1" }, PILOT)), "nem_a_te_osztalyod");
  assert.equal(await kod(() => t.fejlodesListaLogika(fs, "t1", { osztalyId: "nincs" }, PILOT)), "osztaly_nincs");
  assert.equal(await kod(() => t.fejlodesListaLogika(fs, "t1", {}, PILOT)), "osztaly_diak_id_kell");
  assert.equal(await kod(() => t.fejlodesDiakLogika(fs, "t1", { osztalyId: "o1" }, PILOT)), "osztaly_diak_id_kell");
  assert.equal(await kod(() => t.fejlodesDiakLogika(fs, "t1", { diakId: "d1" }, PILOT)), "osztaly_diak_id_kell");
});

test("a jóváhagyatlan és a hamisított tanar_id-jú beadás nem kerül az idővonalra", async () => {
  const fs = hamisFirestore(ADAT);
  const nezet = await t.fejlodesDiakLogika(fs, "t1", { osztalyId: "o1", diakId: "d2" }, PILOT);
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

// ── csomaghoz kötött funkciók: az osztályszintű elemzés az Alap csomagtól ──

const kvotaModul = require("./kvota.js");

test("az osztályszintű elemzés az Alaptól elérhető, az ingyenesnek nem; a fejlődés-követés csak a Profitól", () => {
  const ok = (csomag, funkcio) => kvotaModul.funkcioEngedelyezett(true, csomag, funkcio);
  assert.equal(ok("ingyenes", "osztaly_elemzes"), false);
  assert.equal(ok("alap", "osztaly_elemzes"), true);
  assert.equal(ok("profi", "osztaly_elemzes"), true);
  assert.equal(ok("korlatlan", "osztaly_elemzes"), true);
  assert.equal(ok("alap", "fejlodes"), false);
  assert.equal(ok("profi", "fejlodes"), true);
});

test("a hiányzó, hamisított csomag és az ismeretlen funkció zárt; kvóta nélkül (pilot) minden nyitott", () => {
  for (const csomag of [undefined, null, "", "Alap", "alap ", "__proto__", "toString"]) {
    assert.equal(kvotaModul.funkcioEngedelyezett(true, csomag, "osztaly_elemzes"), false, String(csomag));
  }
  assert.equal(kvotaModul.funkcioEngedelyezett(true, "korlatlan", "nincs_ilyen"), false);
  assert.equal(kvotaModul.funkcioEngedelyezett(true, "profi", "__proto__"), false);
  assert.equal(kvotaModul.funkcioEngedelyezett(false, "ingyenes", "osztaly_elemzes"), true);
});

test("minden fizetős csomag, ami a Profi szintje, az Alap funkcióit is megkapja", () => {
  // A csomagok egymásra épülnek: ami az Alapban van, az a Profiban és a korlátlanban is.
  const { FUNKCIOK } = kvotaModul;
  for (const csomag of FUNKCIOK.fejlodes) {
    assert.ok(FUNKCIOK.osztaly_elemzes.includes(csomag), csomag);
  }
});

test("az osztályelemzés zárja: az ingyenes tanárt a szerver elutasítja (csomag_alap_kell), az Alap és a Profi átmegy", async () => {
  const fs = hamisFirestore({
    "tanarok/ingyenes": { csomag: "ingyenes" },
    "tanarok/regi": {},
    "tanarok/alap": { csomag: "alap" },
    "tanarok/profi": { csomag: "profi" }
  });
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "ingyenes", PROD)), "csomag_alap_kell");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "regi", PROD)), "csomag_alap_kell", "csomag nélküli régi tanár = ingyenes");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "nincs-ilyen", PROD)), "csomag_alap_kell");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "alap", PROD)), "nem-hibazott");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "profi", PROD)), "nem-hibazott");
  assert.equal(await kod(() => t.osztalyElemzesKapu(fs, "ingyenes", PILOT)), "nem-hibazott", "a pilotban nincs zár");
});

test("a feladatElemzes a csomag-zárat az első adatolvasás és az AI-hívás előtt hívja", async () => {
  const { readFileSync } = await import("node:fs");
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const torzs = forras.slice(forras.indexOf("exports.feladatElemzes = onCall("));
  const kapu = torzs.indexOf("osztalyElemzesKapu(firestore, uid)");
  assert.ok(kapu > 0, "a zár nincs bekötve");
  assert.ok(kapu < torzs.indexOf('.collection("feladatok")'), "a zár az első olvasás után van");
  assert.ok(kapu < torzs.indexOf("geminiHivas("), "a zár az AI-hívás után van");
});

test("minden csomagnak van neve és tartalom-leírása a csomag-panelen, magyarul és angolul", async () => {
  const hu = (await import("../public/js/i18n-hu.js")).default;
  const en = (await import("../public/js/i18n-en.js")).default;
  for (const csomag of Object.keys(kvotaModul.CSOMAGOK)) {
    for (const [nyelv, szotar] of [["hu", hu], ["en", en]]) {
      assert.ok(szotar[`admin.csomag_${csomag}`], `${nyelv}: admin.csomag_${csomag}`);
      assert.ok(szotar[`tanar.csomag_fn_${csomag}`], `${nyelv}: tanar.csomag_fn_${csomag}`);
    }
  }
});
