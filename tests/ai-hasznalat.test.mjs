// ══════════════════════════════════════════════════════
// AI-használat mérése – tokenek, költség, jelentés
//
// Miért: a csomagárak csak mért adatból számolhatók. Ha a mérés hibás
// (rossz ár, elveszett token, rossz csoportosítás), az árazás is az lenne.
// Az adatbázisos részt a functions.test.mjs fedi (emulátorral).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const a = require("./ai-hasznalat.js");

const kozel = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-9, `${msg || ""} ${x} != ${y}`);

test("a tokenszámok a usageMetadata-ból jönnek; a hiányzó vagy rossz érték 0", () => {
  assert.deepEqual(
    a.hasznalatKinyeres({ usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 300, totalTokenCount: 1500 } }),
    { prompt: 1000, kimenet: 200, gondolkodas: 300, ossz: 1500 }
  );
  assert.deepEqual(a.hasznalatKinyeres({}), { prompt: 0, kimenet: 0, gondolkodas: 0, ossz: 0 });
  assert.deepEqual(a.hasznalatKinyeres(null), { prompt: 0, kimenet: 0, gondolkodas: 0, ossz: 0 });
  // gondolkodási token nélküli (régebbi/olcsóbb modell) válasz, összeg nélkül: az összeg kiszámolva
  assert.deepEqual(
    a.hasznalatKinyeres({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }),
    { prompt: 10, kimenet: 5, gondolkodas: 0, ossz: 15 }
  );
  const rossz = a.hasznalatKinyeres({ usageMetadata: { promptTokenCount: "x", candidatesTokenCount: -4, thoughtsTokenCount: NaN } });
  assert.deepEqual(rossz, { prompt: 0, kimenet: 0, gondolkodas: 0, ossz: 0 });
});

test("a költség: a bemenet a bemeneti, a kimenet ÉS a gondolkodás a kimeneti áron számolódik", () => {
  const ar = a.ARAK["gemini-3.8-flash"];
  kozel(a.koltsegUsd({ modell: "gemini-3.8-flash", prompt: 1e6, kimenet: 0, gondolkodas: 0 }), ar.be);
  kozel(a.koltsegUsd({ modell: "gemini-3.8-flash", prompt: 0, kimenet: 1e6, gondolkodas: 0 }), ar.ki);
  kozel(a.koltsegUsd({ modell: "gemini-3.8-flash", prompt: 0, kimenet: 0, gondolkodas: 1e6 }), ar.ki, "a gondolkodás is kimenet");
  kozel(
    a.koltsegUsd({ modell: "gemini-3.8-flash", prompt: 2000, kimenet: 500, gondolkodas: 1500 }),
    (2000 * ar.be + 2000 * ar.ki) / 1e6
  );
});

test("a 3.7-es tartalék modell ára megegyezik a 3.8-éval", () => {
  assert.deepEqual(a.ARAK["gemini-3.7-flash"], a.ARAK["gemini-3.8-flash"]);
  kozel(a.koltsegUsd({ modell: "gemini-3.7-flash", prompt: 1e6, kimenet: 1e6 }), 0.75 + 3.75);
});

test("ismeretlen modell költsége üres (null), nem nulla – a jelentés jelzi", () => {
  assert.equal(a.koltsegUsd({ modell: "gemini-ismeretlen", prompt: 1000, kimenet: 10 }), null);
  assert.equal(a.koltsegUsd({ modell: "__proto__", prompt: 1000, kimenet: 10 }), null);
  assert.equal(a.koltsegUsd({ prompt: 1000 }), null);
});

test("a bemenet jellemzői: a képek száma és a bájtok (base64-ből visszaszámolva)", () => {
  const b64 = (n) => "A".repeat(n);
  const parts = [
    { text: "prompt" },
    { inline_data: { mime_type: "image/jpeg", data: b64(400) } },
    { inline_data: { mime_type: "image/png", data: b64(800) } },
    { inline_data: { mime_type: "application/pdf", data: b64(40) } }
  ];
  assert.deepEqual(a.bemenetJellemzo(parts), { kep_db: 2, bemenet_bajt: 300 + 600 + 30 });
  assert.deepEqual(a.bemenetJellemzo([]), { kep_db: 0, bemenet_bajt: 0 });
  assert.deepEqual(a.bemenetJellemzo(undefined), { kep_db: 0, bemenet_bajt: 0 });
});

test("a rekord nem tartalmaz tartalmat, csak azonosítókat és számokat", () => {
  const r = a.rekordKeszites({
    kontextus: { tanar_id: "t1", muvelet: "beadas_atiras", mod: "leveles", feladat_id: "f1", beadas_id: "b1" },
    modell: "gemini-3.5-flash-lite", fo_modell: "gemini-3.8-flash",
    hasznalat: { prompt: 10, kimenet: 5, gondolkodas: 1, ossz: 16 }, probalkozas: 4,
    parts: [{ text: "SZIGORÚAN TITKOS DIÁKSZÖVEG" }, { inline_data: { mime_type: "image/jpeg", data: "AAAA" } }],
    kornyezet: "pilot"
  });
  assert.equal(r.tartalek, true, "tartalék modell jelölve");
  assert.equal(r.probalkozas, 4);
  assert.equal(r.kep_db, 1);
  assert.ok(!JSON.stringify(r).includes("TITKOS"), "a szöveg nem kerülhet a rekordba");
  assert.ok(Object.values(r).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v)), "csak egyszerű értékek");
  const fo = a.rekordKeszites({ kontextus: { tanar_id: "t", muvelet: "elemzes" }, modell: "m", fo_modell: "m", hasznalat: { prompt: 0, kimenet: 0, gondolkodas: 0, ossz: 0 } });
  assert.equal(fo.tartalek, false);
  assert.equal(fo.probalkozas, 1);
  assert.equal(fo.beadas_id, null);
});

test("a hónap határai UTC szerint; érvénytelen kulcsnál az aktuális hónap", () => {
  const h = a.honapHatarok("2026-12");
  assert.equal(h.tol.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(h.ig.toISOString(), "2027-01-01T00:00:00.000Z", "évváltás");
  const most = new Date("2026-10-05T12:00:00Z");
  for (const rossz of [undefined, "", "2026-13", "2026-1", "bármi", null, "2026-00"]) {
    assert.equal(a.honapHatarok(rossz, most).kulcs, "2026-10", String(rossz));
  }
});

// ── jelentés ──

const SZ = a.ARAK["gemini-3.8-flash"];
const usd = (p, k, g = 0) => (p * SZ.be + (k + g) * SZ.ki) / 1e6;
const rek = (extra) => ({ modell: "gemini-3.8-flash", prompt: 0, kimenet: 0, gondolkodas: 0, ...extra });

function mintaRekordok() {
  const futas = (tanar, feladat, beadas, mod, atir, ert) => [
    rek({ tanar_id: tanar, feladat_id: feladat, beadas_id: beadas, mod, muvelet: "beadas_atiras", ...atir }),
    rek({ tanar_id: tanar, feladat_id: feladat, beadas_id: beadas, mod, muvelet: "beadas_ertekeles", ...ert })
  ];
  return [
    ...futas("A", "F1", "b1", "leveles", { prompt: 10000, kimenet: 500 }, { prompt: 2000, kimenet: 1000, gondolkodas: 3000 }),
    ...futas("A", "F1", "b2", "leveles", { prompt: 12000, kimenet: 700 }, { prompt: 2200, kimenet: 900, gondolkodas: 2500 }),
    ...futas("B", "F2", "b3", "kifejtos", { prompt: 20000, kimenet: 1500 }, { prompt: 5000, kimenet: 2000, gondolkodas: 6000 }),
    rek({ tanar_id: "A", muvelet: "feladatlap", prompt: 4000, kimenet: 600 }),
    rek({ tanar_id: "A", feladat_id: "F1", muvelet: "elemzes", modell: "gemini-ismeretlen", prompt: 3000, kimenet: 800 })
  ];
}

test("jelentés: összesítés, ismeretlen ár jelzése", () => {
  const j = a.jelentesOsszeallitas(mintaRekordok());
  assert.equal(j.osszes.hivas, 8);
  assert.equal(j.osszes.ismeretlen_ar_hivas, 1, "az ismeretlen modell ára nem ismert");
  assert.equal(j.osszes.prompt, 10000 + 2000 + 12000 + 2200 + 20000 + 5000 + 4000 + 3000);
  const vart = usd(10000, 500) + usd(2000, 1000, 3000) + usd(12000, 700) + usd(2200, 900, 2500)
    + usd(20000, 1500) + usd(5000, 2000, 6000) + usd(4000, 600);
  kozel(j.osszes.koltseg_usd, vart, "az ismeretlen árú hívás nem számít bele");
  const m37 = j.modell.find((m) => m.modell === "gemini-ismeretlen");
  assert.equal(m37.ismert_ar, false);
  assert.equal(m37.atlag_koltseg_usd, null);
});

test("jelentés: dolgozatonkénti (javítási futásonkénti) költség típusonként", () => {
  const j = a.jelentesOsszeallitas(mintaRekordok());
  const lev1 = usd(10000, 500) + usd(2000, 1000, 3000);
  const lev2 = usd(12000, 700) + usd(2200, 900, 2500);
  const kif = usd(20000, 1500) + usd(5000, 2000, 6000);
  assert.equal(j.beadas.mind.futas_db, 3);
  assert.equal(j.beadas.leveles.futas_db, 2);
  assert.equal(j.beadas.kifejtos.futas_db, 1);
  kozel(j.beadas.leveles.atlag_koltseg_usd, (lev1 + lev2) / 2, "leveles átlag");
  kozel(j.beadas.kifejtos.atlag_koltseg_usd, kif, "kifejtős átlag");
  kozel(j.beadas.mind.atlag_koltseg_usd, (lev1 + lev2 + kif) / 3, "összesített átlag");
  // a tanári műveletek (feladatlap, elemzés) nem torzítják a dolgozat-átlagot
  assert.ok(j.beadas.mind.koltseg_usd < j.osszes.koltseg_usd);
});

test("jelentés: újrafuttatás újabb futás ugyanarra a beadásra (az átlagot emeli, nem tűnik el)", () => {
  const r = mintaRekordok();
  r.push(...r.slice(0, 2).map((x) => ({ ...x })));   // b1 még egyszer lefut
  assert.equal(a.jelentesOsszeallitas(r).beadas.mind.futas_db, 4);
});

test("jelentés: műveletenként, tanáronként (névvel) és feladatonként; a rendezés költség szerint csökkenő", () => {
  const j = a.jelentesOsszeallitas(mintaRekordok(), {
    tanarok: { A: { nev: "Anna", email: "a@x.hu" }, B: { nev: "Béla", email: "b@x.hu" } },
    feladatok: { F1: { cim: "Levél" }, F2: { cim: "Kifejtős" } }
  });
  assert.deepEqual(j.muvelet.map((m) => m.muvelet).sort(), ["beadas_atiras", "beadas_ertekeles", "elemzes", "feladatlap"]);
  for (let i = 1; i < j.muvelet.length; i++) assert.ok(j.muvelet[i - 1].koltseg_usd >= j.muvelet[i].koltseg_usd);

  const anna = j.tanar.find((t) => t.tanar_id === "A");
  assert.equal(anna.nev, "Anna");
  assert.equal(anna.futas_db, 2);
  assert.equal(j.tanar.find((t) => t.tanar_id === "B").futas_db, 1);

  const f1 = j.feladat.find((f) => f.feladat_id === "F1");
  assert.equal(f1.cim, "Levél");
  assert.equal(f1.futas_db, 2);
  kozel(f1.atlag_futas_usd, (usd(10000, 500) + usd(2000, 1000, 3000) + usd(12000, 700) + usd(2200, 900, 2500)) / 2,
    "a feladat átlaga csak a javítási futásokból, az elemzés nélkül");
  assert.equal(j.feladat.find((f) => f.feladat_id === "F2").mod, "kifejtos");
});

test("jelentés: üres bemenetre nem dob, és az átlagok üresek", () => {
  const j = a.jelentesOsszeallitas([]);
  assert.equal(j.osszes.hivas, 0);
  assert.equal(j.osszes.atlag_koltseg_usd, null);
  assert.equal(j.beadas.mind.atlag_koltseg_usd, null);
  assert.deepEqual(j.feladat, []);
});

test("a feladatok listája legfeljebb 25 sor", () => {
  const sok = Array.from({ length: 40 }, (_, i) => rek({ tanar_id: "A", feladat_id: `F${i}`, muvelet: "elemzes", prompt: 1000 + i }));
  assert.equal(a.jelentesOsszeallitas(sok).feladat.length, 25);
});

test("minden Gemini-hívóhely kontextust ad át (különben kimarad a mérésből)", () => {
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  // Három alak: közvetlen, kvotaval()-on belüli nyíl-függvény, és return (kulcskészítés).
  const hivasok = [...forras.matchAll(/await geminiHivas\(|=> geminiHivas\(|return geminiHivas\(/g)].length;
  const muveletek = [...forras.matchAll(/muvelet: "(\w+)"/g)].map((m) => m[1]);
  assert.equal(hivasok, 7, "a geminiHivas() hívóhelyeinek száma változott – nézd át a mérést");
  assert.equal(muveletek.length, hivasok, "minden hívóhelynek van műveletneve");
  for (const m of muveletek) assert.ok(a.MUVELETEK.includes(m), `ismeretlen művelet: ${m}`);
  assert.deepEqual([...new Set(muveletek)].sort(), [...a.MUVELETEK].sort(), "minden művelet előfordul");
});
