// ══════════════════════════════════════════════════════
// Érettségi feladattár – a kinyert feladatsorok olvasása (terv: docs/erettsegi-feladattar-terv.md 2., 4.)
//
// A tartalom a functions/feladattar/erettsegi/ JSON-fájljaiban van (a scripts/erettsegi/kinyer.mjs állítja elő),
// a függvényekkel együtt települ, és csak a Hub pass-zár mögötti hívható függvényeken át érhető el (index.js).
// Ez a modul tiszta: nem hív Firestore-t, csak a fájlokból épít listát, előnézetet és a tanár feladatának rubrikáját.
// ══════════════════════════════════════════════════════

const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const MAPPA = join(__dirname, "feladattar", "erettsegi");
const SABLON_FAJL = "sablonok.json";

// Az időszakok sorrendje egy éven belül (a lista rendezéséhez).
const IDOSZAK_SORREND = { febr: 0, maj: 1, maj2: 2, okt: 3, nov: 4 };
const FELADAT_ID = /^\d{4}-[a-z0-9]+-(kozep|emelt)-W[12]$/;

let tar = null;

/** A fájlok beolvasása egyszer (a függvénypéldány élete alatt a tartalom nem változik). */
function betolt(mappa = MAPPA) {
  if (tar && tar.mappa === mappa) return tar;
  const sorok = [];
  for (const f of readdirSync(mappa).filter((x) => x.endsWith(".json") && x !== SABLON_FAJL).sort()) {
    sorok.push(JSON.parse(readFileSync(join(mappa, f), "utf8")));
  }
  sorok.sort((a, b) => b.ev - a.ev
    || (IDOSZAK_SORREND[b.idoszak] ?? 9) - (IDOSZAK_SORREND[a.idoszak] ?? 9)
    || a.szint.localeCompare(b.szint));
  const sablonok = JSON.parse(readFileSync(join(mappa, SABLON_FAJL), "utf8")).sablonok;
  const feladatok = new Map();
  for (const sor of sorok) for (const f of sor.feladatok) feladatok.set(f.id, { sor, feladat: f });
  tar = { mappa, sorok, sablonok, feladatok };
  return tar;
}

/** A vizsga azonosító adatai (a felület ebből írja ki: „2024. május, középszint”). */
function vizsga(sor) {
  return { id: sor.id, ev: sor.ev, idoszak: sor.idoszak, szint: sor.szint };
}

/** A felület nyelve: "en" vagy (minden más esetben) "hu". */
const nyelvKod = (n) => (n === "en" ? "en" : "hu");

/**
 * A szempontok a kért nyelven: a „cim” a hivatalos magyar név, vagy angolul a „cim_en”. A kimenetben csak
 * kulcs, cim és suly van (a WR rubrikájának alakja), a cim_en nem kerül ki.
 */
function szempontok(rubrika, nyelv) {
  const en = nyelvKod(nyelv) === "en";
  return rubrika.szempontok.map(({ kulcs, cim, cim_en, suly }) => ({ kulcs, cim: en && cim_en ? cim_en : cim, suly }));
}

/** A sablon szempontjai a pontjaikkal (a tanár és a diák is ezt látja), a kért nyelven. */
function sablonNezet(s, nyelv) {
  return {
    id: s.id,
    szempontok: szempontok(s.rubrika, nyelv),
    osszpont: s.rubrika.szempontok.reduce((a, sz) => a + sz.suly, 0)
  };
}

/** A tár listája: feladatonként a szűréshez és a kereséshez kellő adatok (a teljes szöveg az előnézetben jön). */
function lista(mappa) {
  const { sorok } = betolt(mappa);
  const ki = [];
  for (const sor of sorok) {
    for (const f of sor.feladatok) {
      ki.push({
        id: f.id,
        vizsga: vizsga(sor),
        sorszam: f.sorszam,
        sablon: f.sablon,
        cim: f.cim,
        mufaj: f.mufaj,
        tipus: f.tipus,
        szoszam: f.szoszam.szoveg,
        helyzet: f.helyzet
      });
    }
  }
  return ki;
}

/**
 * A diák feladatleírása egy szövegben (a rubrika feladat_leiras mezője: a diák a feladatlinken látja, az MI az
 * értékelésnél kapja). A sorrend a feladatlapé: helyzet, bemeneti szöveg, teendő, irányító szempontok, záró
 * utasítás, kezdés.
 */
function leiras(f) {
  const reszek = [f.helyzet];
  if (f.bemenet) {
    const b = [];
    if (f.bemenet.cim) b.push(f.bemenet.cim);
    b.push(...f.bemenet.bekezdesek);
    reszek.push(b.join("\n\n"));
  }
  reszek.push([f.teendo, ...f.iranyito_szempontok.map((sz) => `• ${sz}`)].join("\n"));
  if (f.zaro_utasitas) reszek.push(f.zaro_utasitas);
  if (f.kezdes) reszek.push(`Begin like this:\n${f.kezdes}`);
  return reszek.filter(Boolean).join("\n\n");
}

/** Egy tárbeli feladat (vagy null, ha nincs ilyen azonosító). */
function keres(id, mappa) {
  if (typeof id !== "string" || !FELADAT_ID.test(id)) return null;
  const t = betolt(mappa);
  const talalat = t.feladatok.get(id);
  if (!talalat) return null;
  const sablon = t.sablonok.find((s) => s.id === talalat.feladat.sablon);
  return sablon ? { ...talalat, sablon } : null;
}

/** Az előnézet: a diáknak szóló feladat és a sablon szempontjai (a szempontok a felület nyelvén). */
function elonezet(id, { nyelv } = {}, mappa) {
  const k = keres(id, mappa);
  if (!k) return null;
  const f = k.feladat;
  return {
    id: f.id,
    vizsga: vizsga(k.sor),
    sorszam: f.sorszam,
    cim: f.cim,
    mufaj: f.mufaj,
    tipus: f.tipus,
    szoszam: f.szoszam,
    helyzet: f.helyzet,
    bemenet: f.bemenet ? { fajta: f.bemenet.fajta, cim: f.bemenet.cim, bekezdesek: f.bemenet.bekezdesek } : null,
    teendo: f.teendo,
    iranyito_szempontok: f.iranyito_szempontok,
    zaro_utasitas: f.zaro_utasitas,
    kezdes: f.kezdes,
    sablon: sablonNezet(k.sablon, nyelv)
  };
}

/**
 * A tanár új feladatának rubrikája: az érettségi sablon, a feladat saját típusával, szószámával és leírásával,
 * és az eredetjelzővel (rubrika.tar). A jegyskálát a tanár a feladat-űrlapon választja (hiányában az alapskála).
 * A szempontok neve a visszajelzés nyelvén kerül a feladatba (angolul a cim_en): a diák is ezt látja a linken.
 */
function rubrikaTarbol(id, { kimenetiNyelv = "hu" } = {}, mappa) {
  const k = keres(id, mappa);
  if (!k) return null;
  const f = k.feladat;
  const r = structuredClone(k.sablon.rubrika);
  return {
    ...r,
    szempontok: szempontok(r, kimenetiNyelv),
    tipus: f.tipus,
    min_szo: f.szoszam.min ?? null,
    max_szo: f.szoszam.max ?? null,
    feladat_leiras: leiras(f),
    kimeneti_nyelv: kimenetiNyelv === "en" ? "en" : "hu",
    tar: { id: f.id, verzio: k.sor.formatum_verzio }
  };
}

/** A négy érettségi sablon a feladat-űrlap sablonlistájához (csak olvasható), a szempontok a kért nyelven. */
function sablonok({ nyelv } = {}, mappa) {
  return betolt(mappa).sablonok.map((s) => ({
    id: s.id, nev: s.nev, rubrika: { ...structuredClone(s.rubrika), szempontok: szempontok(s.rubrika, nyelv) }
  }));
}

module.exports = { FELADAT_ID, betolt, lista, leiras, keres, elonezet, rubrikaTarbol, sablonok };
