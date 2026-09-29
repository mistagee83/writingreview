// ══════════════════════════════════════════════════════
// Szakmai dolgozat mód – pontozás, idézet-ellenőrzés, kulcs, promptok
// Terv: docs/szakmai-mod-terv.md
//
// Miért külön teszt: szakmai módban a pontot a KÓD adja, nem az AI.
// Ha itt elcsúszik valami, a diák csendben rossz jegyet kap – a
// rendszer ettől még hibátlanul fut.
//
// A regressziós eset a valódi mintacsomagból jön (a dokumentumok nem
// kerülnek a repóba – diáknév, kézírás). A tanár pontjai: 3/3, 4/5, 1/5
// = 8/13 → 3-as. A 3. kérdésnél a tanár POZÍCIÓ szerint pontozott; az AI
// ezt nem tudhatta, ezért beállítás.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-szakmai-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let sz;

before(() => {
  sz = require("./szakmai.js");
});

// ── A minta (anonim átirat, a tanár pontjai) ──

const e = (id, allitas, extra = {}) => ({ id, allitas, pont: 1, ...extra });

const MINTA_KULCS = {
  kerdesek: [
    {
      sorszam: "1",
      szoveg: "Sorold fel az áruforgalmi folyamat szakaszait!",
      tipus: "zart_felsorolas",
      max_pont: 3,
      elemek: [e("e1", "Beszerzés"), e("e2", "Árutárolás"), e("e3", "Értékesítés")]
    },
    {
      sorszam: "2",
      szoveg: "Írj legalább 5 beszerzési szempontot!",
      tipus: "nyilt_felsorolas",
      max_pont: 5,
      elemek: [
        e("e1", "Ár"), e("e2", "Minőség"), e("e3", "Szállítási határidő"),
        e("e4", "Fizetési feltételek"), e("e5", "Megbízhatóság"), e("e6", "Választék")
      ]
    },
    {
      sorszam: "3",
      szoveg: "Írd le a beszerzés folyamatának szakaszait!",
      tipus: "sorrend",
      max_pont: 5,
      elemek: [
        e("e1", "Igényfelmérés", { elfogadhato: ["szükséglet megállapítása"] }),
        e("e2", "Beszerzési piackutatás"),
        e("e3", "Szállító kiválasztása"),
        e("e4", "Megrendelés"),
        e("e5", "Számlák kiegyenlítése")
      ],
      beallitas: { sorrend: "pozicio", szakszo: "pontos" }
    }
  ]
};

const MINTA_ATIRAS = {
  valaszok: [
    { kerdes: "1", valasz: "1. Beszerzés, árutárolás\n2. Értékesítés" },
    { kerdes: "2", valasz: "ár, minőség, határidő betartása, a szállító megbízhatósága, jó a reklámja" },
    { kerdes: "3", valasz: "igényfelmérés, Számlák kiegyenlítése, Piackutatás, szállító kiválasztása" }
  ],
  olvashatosag: "kozepes"
};

// Amit az értékelő modell a mintára adna (a próbák alapján).
const MINTA_AI = {
  kerdesek: [
    {
      sorszam: "1",
      elemek: [
        { id: "e1", statusz: "megvan", idezet: "Beszerzés" },
        { id: "e2", statusz: "megvan", idezet: "árutárolás" },
        { id: "e3", statusz: "megvan", idezet: "Értékesítés" }
      ],
      kulcson_kivul: [],
      visszajelzes: "Hibátlan."
    },
    {
      sorszam: "2",
      elemek: [
        { id: "e1", statusz: "megvan", idezet: "ár" },
        { id: "e2", statusz: "megvan", idezet: "minőség" },
        { id: "e3", statusz: "megvan", idezet: "határidő betartása" },
        { id: "e4", statusz: "hianyzik" },
        { id: "e5", statusz: "megvan", idezet: "a szállító megbízhatósága" },
        { id: "e6", statusz: "hianyzik" }
      ],
      kulcson_kivul: [
        { idezet: "jó a reklámja", szakmailag_helyes: false, megjegyzes: "Nem beszerzési szempont." }
      ],
      visszajelzes: "Négy helyes szempont."
    },
    {
      sorszam: "3",
      elemek: [
        { id: "e1", statusz: "megvan", idezet: "igényfelmérés", pozicio: 1 },
        { id: "e2", statusz: "reszben", idezet: "Piackutatás", pozicio: 3 },
        { id: "e3", statusz: "megvan", idezet: "szállító kiválasztása", pozicio: 4 },
        { id: "e4", statusz: "hianyzik" },
        { id: "e5", statusz: "megvan", idezet: "Számlák kiegyenlítése", pozicio: 2 }
      ],
      kulcson_kivul: [],
      visszajelzes: "A sorrend nem jó, a megrendelés hiányzik."
    }
  ],
  hibak: [
    { kategoria: "sorrend", kerdes: "3", idezet: "Számlák kiegyenlítése", javaslat: "a folyamat végére", magyarazat: "…" },
    { kategoria: "helyesiras", kerdes: "1", idezet: "x", javaslat: "y", magyarazat: "nem kell" }
  ],
  diak_szoveg: "Szép munka az első két kérdésben!"
};

const ertekel = (kulcs = MINTA_KULCS, ai = MINTA_AI, atiras = MINTA_ATIRAS, hatarok) =>
  sz.szakmaiErtekelesOsszeallitas(
    sz.kulcsEllenorzes(kulcs), ai, sz.valaszSzovegek(atiras), hatarok
  );

// ══════════════════════════════════════════
// REGRESSZIÓ: a minta
// ══════════════════════════════════════════

test("REGRESSZIÓ: a minta pozíciós pontozással 3/3 + 4/5 + 1/5 = 8/13 → 3-as", () => {
  const r = ertekel();
  assert.deepEqual(r.kerdesek.map((k) => [k.sorszam, k.pont, k.max]),
    [["1", 3, 3], ["2", 4, 5], ["3", 1, 5]]);
  assert.equal(r.osszpontszam, 8);
  assert.equal(r.max_pontszam, 13);
  assert.equal(r.szazalek, 62);
  assert.equal(r.javasolt_jegy, 3);
  assert.deepEqual(r.figyelmeztetesek, []);
});

test("a minta 3. kérdése a másik két sorrend-móddal", () => {
  const mod = (sorrend) => ({
    kerdesek: MINTA_KULCS.kerdesek.map((k) =>
      k.sorszam === "3" ? { ...k, beallitas: { ...k.beallitas, sorrend } } : k)
  });
  // 1, 5, 2(½), 3 → mind: 1 + 1 + 0,5 + 1
  assert.equal(ertekel(mod("nem_szamit")).kerdesek[2].pont, 3.5);
  // a leghosszabb helyes sorrendű részsorozat: 1, 2(½), 3
  assert.equal(ertekel(mod("relativ")).kerdesek[2].pont, 2.5);
});

// ══════════════════════════════════════════
// SORREND
// ══════════════════════════════════════════

const kulcs5 = ["e1", "e2", "e3", "e4", "e5"].map((id) => ({ id, pont: 1 }));
const allapot = (sorrend) =>
  new Map(sorrend.map((id, i) => [id, { statusz: "megvan", pozicio: i + 1 }]));

test("sorrend: a terv táblázata (1, 5, 2, 3)", () => {
  const a = allapot(["e1", "e5", "e2", "e3"]);
  assert.equal(sz.sorrendPontozas(kulcs5, a, "nem_szamit").size, 4);
  assert.deepEqual([...sz.sorrendPontozas(kulcs5, a, "relativ")].sort(), ["e1", "e2", "e3"]);
  assert.deepEqual([...sz.sorrendPontozas(kulcs5, a, "pozicio")], ["e1"]);
});

test("sorrend: hibátlan sorrend minden módban teljes pont", () => {
  const a = allapot(["e1", "e2", "e3", "e4", "e5"]);
  for (const mod of sz.SORREND_MODOK) {
    assert.equal(sz.sorrendPontozas(kulcs5, a, mod).size, 5, mod);
  }
});

test("sorrend: fordított sorrendnél relatív módban csak egy elem jár", () => {
  const a = allapot(["e5", "e4", "e3", "e2", "e1"]);
  assert.equal(sz.sorrendPontozas(kulcs5, a, "relativ").size, 1);
  // pozíció szerint a középső véletlenül a helyén van
  assert.deepEqual([...sz.sorrendPontozas(kulcs5, a, "pozicio")], ["e3"]);
});

test("sorrend: pozíció nélküli elem relatív és pozíciós módban nem jár", () => {
  const a = new Map([
    ["e1", { statusz: "megvan", pozicio: 1 }],
    ["e2", { statusz: "megvan" }]
  ]);
  assert.deepEqual([...sz.sorrendPontozas(kulcs5, a, "relativ")], ["e1"]);
  assert.deepEqual([...sz.sorrendPontozas(kulcs5, a, "pozicio")], ["e1"]);
  assert.equal(sz.sorrendPontozas(kulcs5, a, "nem_szamit").size, 2);
});

test("sorrend: relatív módban a többet érő részsorozat nyer, nem a hosszabb", () => {
  // Két egyforma hosszú lehetőség: (e1, e3) vagy (e2, e3) – e2 csak részben
  // van meg, tehát e1-es ágnak kell nyernie.
  const a = new Map([
    ["e2", { statusz: "reszben", pozicio: 1 }],
    ["e1", { statusz: "megvan", pozicio: 2 }],
    ["e3", { statusz: "megvan", pozicio: 3 }]
  ]);
  assert.deepEqual([...sz.sorrendPontozas(kulcs5, a, "relativ", 0.5)].sort(), ["e1", "e3"]);
});

test("sorrend: hiányzó és téves elem soha nem jár", () => {
  const a = new Map([
    ["e1", { statusz: "teves", pozicio: 1 }],
    ["e2", { statusz: "hianyzik", pozicio: 2 }]
  ]);
  for (const mod of sz.SORREND_MODOK) {
    assert.equal(sz.sorrendPontozas(kulcs5, a, mod).size, 0, mod);
  }
});

// ══════════════════════════════════════════
// KÉRDÉSPONTOZÁS
// ══════════════════════════════════════════

const kerdes = (extra) => sz.kulcsEllenorzes({
  kerdesek: [{ sorszam: "1", tipus: "zart_felsorolas", max_pont: 4, elemek: kulcs5.map((k) => e(k.id, k.id)), ...extra }]
}).kerdesek[0];

test("részpont: a 'reszben' elem a beállított arányt éri", () => {
  const eredmeny = { elemek: [{ id: "e1", statusz: "reszben" }, { id: "e2", statusz: "megvan" }] };
  assert.equal(sz.kerdesPontozas(kerdes({ beallitas: { reszpont: 0.5 } }), eredmeny).pont, 1.5);
  assert.equal(sz.kerdesPontozas(kerdes({ beallitas: { reszpont: 0 } }), eredmeny).pont, 1);
  assert.equal(sz.kerdesPontozas(kerdes({ beallitas: { reszpont: 1 } }), eredmeny).pont, 2);
});

test("téves állításért nincs levonás: 0 pont, a többi elem pontja marad", () => {
  const r = sz.kerdesPontozas(kerdes(), {
    elemek: [{ id: "e1", statusz: "teves" }, { id: "e2", statusz: "megvan" }, { id: "e3", statusz: "megvan" }]
  });
  assert.equal(r.pont, 2);
  assert.equal(r.elemek.find((x) => x.id === "e1").pont, 0);
});

test("a kérdés pontja nem lépheti túl a maximumot", () => {
  const r = sz.kerdesPontozas(kerdes(), {
    elemek: kulcs5.map((k) => ({ id: k.id, statusz: "megvan" }))
  });
  assert.equal(r.pont, 4);
});

test("nyílt felsorolás: az elfogadott kulcson kívüli tétel is ér, a függő nem", () => {
  const k = kerdes({ tipus: "nyilt_felsorolas" });
  const r = sz.kerdesPontozas(k, {
    elemek: [{ id: "e1", statusz: "megvan" }],
    kulcson_kivul: [{ elfogadva: true }, { elfogadva: null }, { elfogadva: false }]
  });
  assert.equal(r.pont, 2);
  // zárt felsorolásnál a kulcson kívüli nem ér pontot
  assert.equal(sz.kerdesPontozas(kerdes(), {
    elemek: [{ id: "e1", statusz: "megvan" }], kulcson_kivul: [{ elfogadva: true }]
  }).pont, 1);
});

test("választós kérdés: csak a választott ág számít", () => {
  const k = sz.kulcsEllenorzes({
    kerdesek: [{
      sorszam: "4", tipus: "valasztos", max_pont: 3,
      agak: [
        { id: "termek", cim: "Termék", elemek: [e("t1", "a"), e("t2", "b"), e("t3", "c")] },
        { id: "ar", cim: "Ár", elemek: [e("a1", "d"), e("a2", "e"), e("a3", "f")] }
      ]
    }]
  }).kerdesek[0];
  const eredmeny = {
    valasztott_ag: "ar",
    elemek: [{ id: "a1", statusz: "megvan" }, { id: "a2", statusz: "megvan" }, { id: "t1", statusz: "megvan" }]
  };
  const r = sz.kerdesPontozas(k, eredmeny);
  assert.equal(r.pont, 2);
  assert.equal(r.valasztott_ag, "ar");
  assert.equal(sz.kerdesPontozas(k, { ...eredmeny, valasztott_ag: "nincs" }).pont, 0);
});

// ══════════════════════════════════════════
// JEGYJAVASLAT
// ══════════════════════════════════════════

test("jegyjavaslat az alapértelmezett határokkal", () => {
  assert.equal(sz.jegyJavaslat(0, 13), 1);
  assert.equal(sz.jegyJavaslat(8, 13), 3);
  assert.equal(sz.jegyJavaslat(55, 100), 3, "a határ már a jobb jegy");
  assert.equal(sz.jegyJavaslat(54.9, 100), 2);
  assert.equal(sz.jegyJavaslat(13, 13), 5);
  assert.equal(sz.jegyJavaslat(0, 0), null);
});

test("jegyjavaslat: a pontos arány számít, nem a kerekített százalék", () => {
  // 71/130 = 54,6% → kerekítve 55 lenne, de a határ 55
  assert.equal(sz.jegyJavaslat(71, 130), 2);
});

test("egyéni ponthatárok, és rossz határok helyett az alapértelmezés", () => {
  assert.equal(sz.jegyJavaslat(50, 100, { 2: 30, 3: 50, 4: 65, 5: 80 }), 3);
  assert.deepEqual(sz.ponthatarokEllenorzes({ 2: 60, 3: 50, 4: 70, 5: 85 }), sz.ALAP_PONTHATAROK);
  assert.deepEqual(sz.ponthatarokEllenorzes({ 2: 40, 3: 55, 4: 70, 5: 120 }), sz.ALAP_PONTHATAROK);
  assert.deepEqual(sz.ponthatarokEllenorzes(null), sz.ALAP_PONTHATAROK);
});

// ══════════════════════════════════════════
// IDÉZET-ELLENŐRZÉS
// ══════════════════════════════════════════

test("idézet: kis- és nagybetű, írásjel, szóköz nem számít", () => {
  assert.ok(sz.idezetEllenorzes("számlák kiegyenlítése", "igényfelmérés,  Számlák   kiegyenlítése, Piackutatás"));
  assert.ok(sz.idezetEllenorzes("Beszerzés, árutárolás", "1. Beszerzés árutárolás"));
});

test("idézet: toldaléktűrő (a szószedet igazíthat a szóalakon)", () => {
  assert.ok(sz.idezetEllenorzes("a pénz alakulása", "A pénz alakulás története"));
  assert.ok(sz.idezetEllenorzes("kiegyenlítés", "Számlák kiegyenlítése"));
});

test("idézet: kitalált szöveg nem megy át", () => {
  assert.equal(sz.idezetEllenorzes("megrendelés", "igényfelmérés, Piackutatás"), false);
  assert.equal(sz.idezetEllenorzes("beszerzési piackutatás", "igényfelmérés, Piackutatás"), false);
  assert.equal(sz.idezetEllenorzes("", "bármi"), false);
  assert.equal(sz.idezetEllenorzes("valami", ""), false);
});

test("idézet: rövid szavak és számok pontos egyezést kérnek", () => {
  assert.equal(sz.idezetEllenorzes("1848", "1849-ben"), false);
  assert.ok(sz.idezetEllenorzes("1848", "1848-ban"));
  assert.equal(sz.idezetEllenorzes("ár", "áru"), false);
});

test("idézet: a kihagyásjel (...) utáni résznek később kell jönnie", () => {
  assert.ok(sz.idezetEllenorzes("a váltó ... hitelpapír", "A váltó egy olyan hitelpapír, amely"));
  assert.equal(sz.idezetEllenorzes("hitelpapír … a váltó", "A váltó egy olyan hitelpapír"), false);
});

test("az ékezet félreolvasása nem buktatja el az idézetet", () => {
  assert.ok(sz.idezetEllenorzes("árutárolás", "arutarolas"));
});

// ══════════════════════════════════════════
// AZ ÉRTÉKELÉS ÖSSZEÁLLÍTÁSA
// ══════════════════════════════════════════

test("hallucinált idézet: az elem nem jár, és a tanár jelzést kap", () => {
  const ai = structuredClone(MINTA_AI);
  ai.kerdesek[2].elemek[3] = { id: "e4", statusz: "megvan", idezet: "megrendelés", pozicio: 5 };
  const r = ertekel(MINTA_KULCS, ai);
  const e4 = r.kerdesek[2].elemek.find((x) => x.id === "e4");
  assert.equal(e4.statusz, "hianyzik");
  assert.equal(e4.ai_statusz, "megvan", "az AI eredeti döntése megmarad a tanárnak");
  assert.equal(e4.idezet_ok, false);
  assert.equal(e4.pont, 0);
  assert.deepEqual(r.figyelmeztetesek, [{ kerdes: "3", elem_id: "e4", tipus: "idezet_nem_talalhato" }]);
  assert.equal(r.osszpontszam, 8, "a pontszám nem változik");
});

test("téves állítás idézet nélkül nem kerül a diák elé", () => {
  const ai = structuredClone(MINTA_AI);
  ai.kerdesek[0].elemek[0] = { id: "e1", statusz: "teves", idezet: "Termelés" };
  const e1 = ertekel(MINTA_KULCS, ai).kerdesek[0].elemek[0];
  assert.equal(e1.statusz, "hianyzik");
});

test("a kulcson kívüli tétel: 'elfogad' módban a helyes jár, 'tanar_dont' módban függő", () => {
  const ai = structuredClone(MINTA_AI);
  ai.kerdesek[1].kulcson_kivul = [
    { idezet: "jó a reklámja", szakmailag_helyes: true, megjegyzes: "" }
  ];
  const elfogad = ertekel(MINTA_KULCS, ai).kerdesek[1];
  assert.equal(elfogad.kulcson_kivul[0].elfogadva, true);
  assert.equal(elfogad.pont, 5);

  const kulcs = structuredClone(MINTA_KULCS);
  kulcs.kerdesek[1].beallitas = { kulcson_kivul: "tanar_dont" };
  const fuggo = ertekel(kulcs, ai).kerdesek[1];
  assert.equal(fuggo.kulcson_kivul[0].elfogadva, null);
  assert.equal(fuggo.pont, 4);
});

test("kulcson kívüli tétel sem járhat kitalált idézettel", () => {
  const ai = structuredClone(MINTA_AI);
  ai.kerdesek[1].kulcson_kivul = [{ idezet: "raktározási költség", szakmailag_helyes: true, megjegyzes: "" }];
  const k = ertekel(MINTA_KULCS, ai).kerdesek[1];
  assert.equal(k.kulcson_kivul[0].elfogadva, false);
  assert.equal(k.pont, 4);
});

test("ismeretlen elemazonosítót és kérdést figyelmen kívül hagy, a hiányzót jelzi", () => {
  const ai = structuredClone(MINTA_AI);
  ai.kerdesek[0].elemek.push({ id: "kitalalt", statusz: "megvan", idezet: "Beszerzés" });
  ai.kerdesek.push({ sorszam: "99", elemek: [], visszajelzes: "" });
  ai.kerdesek.splice(1, 1);
  const r = ertekel(MINTA_KULCS, ai);
  assert.equal(r.kerdesek[0].elemek.length, 3);
  assert.equal(r.kerdesek.length, 3);
  assert.equal(r.kerdesek[1].pont, 0);
  assert.deepEqual(r.figyelmeztetesek, [{ kerdes: "2", tipus: "nincs_ertekeles" }]);
});

test("a helyesírási hiba nem kerül a hibák közé; a 'tipus' a kategória", () => {
  const r = ertekel();
  assert.deepEqual(r.hibak.map((h) => h.kategoria), ["sorrend"]);
  assert.equal(r.hibak[0].tipus, "sorrend");
});

test("kompatibilitás: a kérdésekből szempontok lesznek (táblázat, elemzés)", () => {
  const r = ertekel();
  assert.deepEqual(r.szempontok.map((s) => [s.kulcs, s.cim, s.pont, s.max]), [
    ["k1", "1. kérdés", 3, 3], ["k2", "2. kérdés", 4, 5], ["k3", "3. kérdés", 1, 5]
  ]);
  assert.equal(r.mod, "szakmai");
});

// ══════════════════════════════════════════
// KULCS
// ══════════════════════════════════════════

test("kulcs: a hiányzó beállítás alapértékkel töltődik", () => {
  const k = sz.kulcsEllenorzes(MINTA_KULCS);
  assert.deepEqual(k.kerdesek[0].beallitas, sz.ALAP_BEALLITAS);
  assert.equal(k.kerdesek[2].beallitas.sorrend, "pozicio");
  assert.equal(k.kerdesek[2].beallitas.reszpont, 0.5);
});

test("kulcs: a hibás kulcs olvasható üzenettel bukik", () => {
  const rossz = (kerdesek) => () => sz.kulcsEllenorzes({ kerdesek });
  assert.throws(rossz([]), /nincs egy kérdés sem/);
  assert.throws(rossz([{ sorszam: "1", tipus: "esszé", max_pont: 1, elemek: [e("a", "b")] }]), /ismeretlen típus/);
  assert.throws(rossz([{ sorszam: "1", tipus: "sorrend", max_pont: 0, elemek: [e("a", "b")] }]), /max pont/);
  assert.throws(rossz([{ sorszam: "1", tipus: "sorrend", max_pont: 1, elemek: [e("a", "b"), e("a", "c")] }]), /ismétlődő elem/);
  assert.throws(rossz([
    { sorszam: "1", tipus: "sorrend", max_pont: 1, elemek: [e("a", "b")] },
    { sorszam: "1", tipus: "sorrend", max_pont: 1, elemek: [e("a", "b")] }
  ]), /ismétlődő sorszám/);
  assert.throws(rossz([{ sorszam: "1", tipus: "sorrend", max_pont: 1, elemek: [e("a", "b")], beallitas: { sorrend: "mindegy" } }]), /sorrend-mód/);
  assert.throws(rossz([{ sorszam: "1", tipus: "sorrend", max_pont: 1, elemek: [e("a", "b")], beallitas: { reszpont: 2 } }]), /részpont/);
  assert.throws(rossz([{ sorszam: "1", tipus: "valasztos", max_pont: 1 }]), /ág/);
});

test("szószedet: az állítások és a szinonimák, ismétlés nélkül", () => {
  const s = sz.szoszedetGyujtes(sz.kulcsEllenorzes(MINTA_KULCS));
  assert.ok(s.includes("Beszerzési piackutatás"));
  assert.ok(s.includes("szükséglet megállapítása"));
  assert.equal(s.filter((x) => x.toLowerCase() === "beszerzés").length, 1);
});

// ══════════════════════════════════════════
// ÁTIRAT
// ══════════════════════════════════════════

test("átirat: a táblázat cellái is a kérdés válaszába kerülnek", () => {
  const m = sz.valaszSzovegek({
    valaszok: [{ kerdes: "1", valasz: "bevezető" }],
    tablazatok: [{ kerdes: "1", cellak: [{ sor: "Árupénz", oszlop: "Példa", ertek: "só, marha" }] }]
  });
  assert.ok(sz.idezetEllenorzes("só, marha", m.get("1")));
  assert.ok(sz.idezetEllenorzes("bevezető", m.get("1")));
});

test("átirat: az összefűzött szöveg kérdésenként, sorszámmal", () => {
  const s = sz.atiratOsszefuzes(MINTA_ATIRAS);
  assert.match(s, /^1\. 1\. Beszerzés/);
  assert.match(s, /\n3\. igényfelmérés/);
});

// ══════════════════════════════════════════
// PROMPTOK ÉS SÉMÁK
// ══════════════════════════════════════════

test("az értékelő séma NEM kér pontot (a pontot a kód adja)", () => {
  const json = JSON.stringify(sz.SZAKMAI_ERTEKELES_SCHEMA);
  assert.doesNotMatch(json, /"pont"/);
});

test("értékelő prompt: szakszó-szabály, pozíció, tananyag, nincs pont", () => {
  const kulcs = sz.kulcsEllenorzes(MINTA_KULCS);
  const p = sz.szakmaiErtekelesPrompt(
    { cim: "Beszerzés dolgozat", rubrika: { mod: "szakmai", tantargy: "kereskedelem" } },
    kulcs, sz.valaszSzovegek(MINTA_ATIRAS), "A beszerzés szakaszai: ..."
  );
  assert.match(p, /tantárgy: kereskedelem/);
  assert.match(p, /Szakszóhasználat: PONTOS/);
  assert.match(p, /"pozicio"/);
  assert.match(p, /# A TANANYAG/);
  assert.match(p, /PONTOT NE ADJ/);
  assert.doesNotMatch(p, /nyelvtanár/);
  // a sorrend-mód a modell elől rejtve: nem ő dönt róla
  assert.doesNotMatch(p, /pozicio"?\s*mód|relativ/);
});

test("értékelő prompt tananyag nélkül nem említ tananyagot", () => {
  const p = sz.szakmaiErtekelesPrompt(
    { cim: "x", rubrika: { mod: "szakmai" } },
    sz.kulcsEllenorzes(MINTA_KULCS), sz.valaszSzovegek(MINTA_ATIRAS), null
  );
  assert.doesNotMatch(p, /# A TANANYAG/);
  assert.match(p, /Te egy tapasztalt szakmai tanár vagy\./);
});

test("átíró prompt: szószedet figyelmeztetéssel, a kulcs pontjai nélkül", () => {
  const kulcs = sz.kulcsEllenorzes(MINTA_KULCS);
  const p = sz.szakmaiAtiratPrompt(kulcs, sz.szoszedetGyujtes(kulcs));
  assert.match(p, /NEM megoldókulcs/);
  assert.match(p, /TANÁRI JELÖLÉSEKET/);
  assert.match(p, /- Beszerzési piackutatás/);
  assert.match(p, /- 3\. Írd le a beszerzés/);
  assert.doesNotMatch(p, /\[e1\]/, "az elemazonosítók (a kulcs szerkezete) nem kellenek az átírónak");
});

test("mód: a hiányzó érték az íráskészség (a régi feladatok változatlanok)", () => {
  assert.equal(sz.feladatMod(undefined), "iras");
  assert.equal(sz.feladatMod({ tipus: "esszé" }), "iras");
  assert.equal(sz.feladatMod({ mod: "szakmai" }), "szakmai");
  assert.equal(sz.feladatMod({ mod: "valami" }), "iras");
});

// ══════════════════════════════════════════
// 2. FÁZIS: KULCSJAVASLAT, TANANYAG, PRÓBAJAVÍTÁS
// ══════════════════════════════════════════

const JAVASLAT = {
  cim_javaslat: "Beszerzés",
  feladat_leiras: "…",
  kerdesek: [
    {
      sorszam: "1.", szoveg: "Sorold fel…", tipus: "zart_felsorolas", max_pont: 0,
      elemek: [
        { allitas: "Beszerzés", pont: 1, forras: "tananyag", ellenorizendo: false },
        { allitas: "  ", pont: 1, forras: "tananyag", ellenorizendo: false },
        { allitas: "Értékesítés", pont: -3, forras: "altalanos", ellenorizendo: true, elfogadhato: [" eladás ", ""] }
      ]
    },
    { sorszam: "1", szoveg: "Ismétlődő sorszám", tipus: "ismeretlen", max_pont: 2,
      elemek: [{ allitas: "x", pont: 2, forras: "altalanos", ellenorizendo: false }] },
    { sorszam: "3", szoveg: "Üres", tipus: "sorrend", max_pont: 5, elemek: [] },
    {
      sorszam: "4", szoveg: "Fejts ki egy P-t", tipus: "valasztos", max_pont: 3,
      agak: [
        { cim: "Termék", elemek: [{ allitas: "a", pont: 1, forras: "tananyag", ellenorizendo: false }] },
        { cim: "", elemek: [] }
      ]
    }
  ]
};

test("kulcsjavaslat: a mi azonosítóink, üres elem ki, rossz pont 1, alapbeállítás", () => {
  const { kulcs, kihagyott } = sz.kulcsJavaslatTisztitas(JAVASLAT, true);
  const k1 = kulcs.kerdesek[0];
  assert.equal(k1.sorszam, "1", "a sorszám végi pont lemarad");
  assert.deepEqual(k1.elemek.map((e) => [e.id, e.allitas, e.pont]), [["e1", "Beszerzés", 1], ["e2", "Értékesítés", 1]]);
  assert.deepEqual(k1.elemek[1].elfogadhato, ["eladás"]);
  assert.equal(k1.max_pont, 2, "hiányzó max pont = az elemek összege");
  assert.deepEqual(k1.beallitas, sz.ALAP_BEALLITAS);
  assert.equal(k1.elemek[1].ellenorizendo, true);
  assert.equal(k1.elemek[0].forras, "tananyag");
  assert.deepEqual(kihagyott, ["3"], "az elem nélküli kérdést jelzi");
});

test("kulcsjavaslat: ismétlődő sorszám és ismeretlen típus javítva", () => {
  const { kulcs } = sz.kulcsJavaslatTisztitas(JAVASLAT, true);
  assert.equal(kulcs.kerdesek[1].sorszam, "1*");
  assert.equal(kulcs.kerdesek[1].tipus, "magyarazat");
});

test("kulcsjavaslat: választós kérdésnél az üres ág kimarad", () => {
  const { kulcs } = sz.kulcsJavaslatTisztitas(JAVASLAT, true);
  const k4 = kulcs.kerdesek.find((k) => k.sorszam === "4");
  assert.deepEqual(k4.agak.map((a) => [a.id, a.cim, a.elemek[0].id]), [["a1", "Termék", "a1e1"]]);
});

test("kulcsjavaslat: tananyag nélkül minden elem 'altalanos', bármit mond a modell", () => {
  const { kulcs } = sz.kulcsJavaslatTisztitas(JAVASLAT, false);
  const forrasok = kulcs.kerdesek.flatMap((k) => [...k.elemek, ...(k.agak || []).flatMap((a) => a.elemek)])
    .map((e) => e.forras);
  assert.ok(forrasok.every((f) => f === "altalanos"));
});

test("kulcsjavaslat: használható kérdés nélkül olvasható hiba", () => {
  assert.throws(() => sz.kulcsJavaslatTisztitas({ kerdesek: [] }, true), /egyetlen használható kérdést/);
  assert.throws(() => sz.kulcsJavaslatTisztitas(null, true), /egyetlen használható kérdést/);
});

test("a kulcsjavaslat sémája NEM kér beállítást (sorrend, szigor) – az a tanáré", () => {
  const kerdesMezok = Object.keys(sz.KULCS_JAVASLAT_SCHEMA.properties.kerdesek.items.properties);
  assert.ok(!kerdesMezok.includes("beallitas"), kerdesMezok.join(", "));
  assert.doesNotMatch(JSON.stringify(sz.KULCS_JAVASLAT_SCHEMA), /szakszo|reszpont|kulcson_kivul/);
});

test("kulcskészítő prompt: tananyaggal ahhoz igazodik, nélküle 'altalanos'", () => {
  const vele = sz.kulcsKeszitesPrompt("kereskedelem", "A beszerzés szakaszai: …");
  assert.match(vele, /# A TANANYAG/);
  assert.match(vele, /tantárgy: kereskedelem/);
  const nelkule = sz.kulcsKeszitesPrompt(null, null);
  assert.doesNotMatch(nelkule, /# A TANANYAG/);
  assert.match(nelkule, /Tananyag NINCS megadva/);
  assert.match(nelkule, /Te egy tapasztalt szakmai tanár vagy\./);
});

test("tananyag: a tulajdonos és a megosztott kolléga olvashatja, más nem", () => {
  const t = { tanar_id: "a", megosztva: ["b"] };
  assert.ok(sz.tananyagOlvashato(t, "a"));
  assert.ok(sz.tananyagOlvashato(t, "b"));
  assert.equal(sz.tananyagOlvashato(t, "c"), false);
  assert.equal(sz.tananyagOlvashato({ tanar_id: "a" }, "b"), false);
  assert.equal(sz.tananyagOlvashato(t, undefined), false);
});

test("tokenbecslés: ~4 karakter / token", () => {
  assert.equal(sz.tokenBecsles("x".repeat(60000 * 4)), sz.KIVONAT_FIGYELMEZTETES_TOKEN);
  assert.equal(sz.tokenBecsles(null), 0);
});

test("próbajavítás: csak a kulcs kérdései, üres válasz nélkül, levágva", () => {
  const t = require("./index.js")._teszt;
  const kulcs = sz.kulcsEllenorzes(MINTA_KULCS);
  const m = t.probaValaszok({ 1: " Beszerzés ", 2: "", 99: "idegen", 3: "x".repeat(9000) }, kulcs);
  assert.deepEqual([...m.keys()], ["1", "3"]);
  assert.equal(m.get("1"), "Beszerzés");
  assert.equal(m.get("3").length, 5000);
  assert.equal(t.probaValaszok(null, kulcs).size, 0);
});

// ══════════════════════════════════════════
// A BÖNGÉSZŐS PÉLDÁNY (public/js/szakmai.js)
// A kliens ugyanazzal validál és számol, mint a szerver – ha a generált
// fájl elavult, a tanár mást látna, mint amit a javítás ad.
// ══════════════════════════════════════════

test("a public/js/szakmai.js friss (node scripts/szakmai-kliens.mjs)", async () => {
  const { kliensKod, FORRAS, CEL } = await import("../scripts/szakmai-kliens.mjs");
  const { readFileSync } = await import("node:fs");
  const vart = kliensKod(readFileSync(FORRAS, "utf8"));
  const van = readFileSync(CEL, "utf8").replace(/\r\n/g, "\n");
  assert.equal(van, vart,
    "Elavult a public/js/szakmai.js – futtasd: node scripts/szakmai-kliens.mjs");
});

test("a böngészős példány ugyanazt pontozza: a minta 8/13 → 3-as", async () => {
  const kliens = await import("../public/js/szakmai.js");
  assert.deepEqual(Object.keys(kliens).sort(), Object.keys(sz).sort(), "ugyanazok az exportok");
  const r = kliens.szakmaiErtekelesOsszeallitas(
    kliens.kulcsEllenorzes(MINTA_KULCS), MINTA_AI, kliens.valaszSzovegek(MINTA_ATIRAS)
  );
  assert.equal(r.osszpontszam, 8);
  assert.equal(r.javasolt_jegy, 3);
});
