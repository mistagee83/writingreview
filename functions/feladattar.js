// ══════════════════════════════════════════════════════
// Érettségi feladattár – a tartalom betöltése és átalakítása (docs/erettsegi-feladattar-terv.md)
//
// A tartalom a functions/feladattar/erettsegi/ mappa JSON-fájljaiban van (a terv 4. fejezetének
// formátumában: feladatsoronként egy <év>-<időszak>-<szint>.json, és a négy sablon a
// sablonok.json-ban). A fájlok a függvényekkel együtt települnek, és csak tanári, Hub passos
// hívható függvényen át érhetők el (functions/index.js, „ÉRETTSÉGI FELADATTÁR”).
//
// Ez a modul tiszta: nem hív Firestore-t. A mappa útja állítható (FELADATTAR_KONYVTAR
// környezeti változó, vagy a betoltes() paramétere), hogy a tesztek a tests/fixtures/
// mintáit olvassák. A hiányzó mappa üres tárat ad (a kinyerés előtt ez az állapot).
// ══════════════════════════════════════════════════════
const { readdirSync, readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const ALAP_KONYVTAR = join(__dirname, "feladattar", "erettsegi");
const SABLON_FAJL = "sablonok.json";
const FORMATUM_VERZIO = 1;
const SABLON_IDK = Object.freeze(["kozep-level", "kozep-fogalmazas", "emelt-level", "emelt-fogalmazas"]);
const SZINTEK = Object.freeze(["kozep", "emelt"]);
const IDOSZAKOK = Object.freeze(["maj", "okt", "nov", "febr", "maj2"]);
const WR_TIPUSOK = Object.freeze(["levél", "vélemény", "esszé", "egyéb"]);

/** A tár mappája: a paraméter, a FELADATTAR_KONYVTAR környezeti változó, vagy a functions/feladattar/erettsegi/. */
function konyvtar(utvonal) {
  return utvonal || process.env.FELADATTAR_KONYVTAR || ALAP_KONYVTAR;
}

const szoveg = (x) => typeof x === "string" && x.trim().length > 0;
const szamVagyNull = (x) => x === null || (Number.isInteger(x) && x > 0);

/** Egy feladat (feladatok[]) alakja rendben van-e annyira, hogy a felület és a létrehozás használhassa. */
function feladatHiba(f, sor) {
  if (!f || typeof f !== "object") return "nem objektum";
  if (!szoveg(f.id) || !f.id.startsWith(`${sor.id}-W`)) return "id";
  if (![1, 2].includes(f.sorszam)) return "sorszam";
  if (!SABLON_IDK.includes(f.sablon)) return "sablon";
  if (!szoveg(f.cim)) return "cim";
  if (!WR_TIPUSOK.includes(f.tipus)) return "tipus";
  const sz = f.szoszam;
  if (!sz || !szamVagyNull(sz.min) || !szamVagyNull(sz.max)) return "szoszam";
  if (sz.min && sz.max && sz.min > sz.max) return "szoszam";
  if (!szoveg(f.helyzet) || !szoveg(f.teendo)) return "helyzet/teendo";
  if (!Array.isArray(f.iranyito_szempontok)) return "iranyito_szempontok";
  if (f.bemenet != null && !Array.isArray(f.bemenet.bekezdesek)) return "bemenet";
  return null;
}

/** Egy feladatsor-fájl alakja (a gyökér). */
function feladatsorHiba(s) {
  if (!s || typeof s !== "object") return "nem objektum";
  if (s.formatum_verzio !== FORMATUM_VERZIO) return "formatum_verzio";
  if (!szoveg(s.id) || !Number.isInteger(s.ev)) return "id/ev";
  if (!SZINTEK.includes(s.szint) || !IDOSZAKOK.includes(s.idoszak)) return "szint/idoszak";
  if (!Array.isArray(s.feladatok)) return "feladatok";
  return null;
}

/** A négy sablon alakja: id, nev, rubrika.szempontok (kulcs, cim, suly). */
function sablonHiba(s) {
  if (!s || !SABLON_IDK.includes(s.id) || !szoveg(s.nev)) return "id/nev";
  const sz = s.rubrika?.szempontok;
  if (!Array.isArray(sz) || !sz.length || !sz.every((x) => szoveg(x?.kulcs) && szoveg(x?.cim) && Number(x?.suly) > 0)) {
    return "szempontok";
  }
  return null;
}

const gyorsitotar = new Map();

/**
 * A tár betöltése (mappánként egyszer; a függvény-példány élete alatt a fájlok nem változnak).
 * A hibás fájl vagy feladat kimarad, és a `hibak` listába kerül (a felület nem omlik össze egy
 * rossz fájltól; a teljes ellenőrzés a scripts/ alatti ellenőrző dolga).
 * @returns {{ feladatsorok: object[], feladatok: Map<string, {feladat, feladatsor}>, sablonok: Map<string, object>, hibak: string[] }}
 */
function betoltes(utvonal) {
  const dir = konyvtar(utvonal);
  if (gyorsitotar.has(dir)) return gyorsitotar.get(dir);
  const tar = { feladatsorok: [], feladatok: new Map(), sablonok: new Map(), hibak: [] };
  if (existsSync(dir)) {
    const fajlok = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    for (const nev of fajlok) {
      let adat;
      try {
        adat = JSON.parse(readFileSync(join(dir, nev), "utf8"));
      } catch (e) {
        tar.hibak.push(`${nev}: nem olvasható JSON (${e.message})`);
        continue;
      }
      if (nev === SABLON_FAJL) {
        for (const s of Array.isArray(adat?.sablonok) ? adat.sablonok : []) {
          const h = sablonHiba(s);
          if (h) tar.hibak.push(`${nev}: hibás sablon (${s?.id ?? "?"}: ${h})`);
          else tar.sablonok.set(s.id, s);
        }
        continue;
      }
      const h = feladatsorHiba(adat);
      if (h) { tar.hibak.push(`${nev}: hibás feladatsor (${h})`); continue; }
      tar.feladatsorok.push(adat);
      for (const f of adat.feladatok) {
        const fh = feladatHiba(f, adat);
        if (fh) { tar.hibak.push(`${nev}: hibás feladat (${f?.id ?? "?"}: ${fh})`); continue; }
        if (tar.feladatok.has(f.id)) { tar.hibak.push(`${nev}: ismétlődő feladat-azonosító (${f.id})`); continue; }
        tar.feladatok.set(f.id, { feladat: f, feladatsor: adat });
      }
    }
  }
  // A sablon nélküli feladat nem készíthető el: kimarad a listából.
  for (const [id, { feladat }] of tar.feladatok) {
    if (!tar.sablonok.has(feladat.sablon)) {
      tar.hibak.push(`${id}: a sablon (${feladat.sablon}) nincs a ${SABLON_FAJL}-ban`);
      tar.feladatok.delete(id);
    }
  }
  gyorsitotar.set(dir, tar);
  return tar;
}

/** A gyorsítótár ürítése (teszteknek). */
function gyorsitotarUrites() {
  gyorsitotar.clear();
}

/**
 * A feladat leírása (rubrika.feladat_leiras) a diáknak és az AI-nak: helyzet, bemeneti szöveg,
 * teendő, irányító szempontok, kezdés – a feladatlap szavaival, angolul. Sima szöveg (a felület
 * textContent-ként mutatja, a diák linkje és a kivetítés is).
 */
function leirasEpites(f) {
  const reszek = [f.helyzet.trim()];
  const b = f.bemenet;
  if (b && Array.isArray(b.bekezdesek) && b.bekezdesek.length) {
    const sorok = [];
    if (szoveg(b.cim)) sorok.push(b.cim.trim());
    sorok.push(...b.bekezdesek.filter(szoveg).map((x) => x.trim()));
    if (szoveg(b.forras)) sorok.push(`(Source: ${b.forras.trim()})`);
    reszek.push(sorok.join("\n\n"));
  }
  const pontok = (f.iranyito_szempontok || []).filter(szoveg).map((x) => `– ${x.trim()}`);
  reszek.push([f.teendo.trim(), ...pontok].join("\n"));
  // Ha a lap csak „about N words”-t ad (min/max null), a szószám a leírásban látszik – hacsak a teendő már tartalmazza.
  const sz = f.szoszam || {};
  if (sz.min == null && sz.max == null && szoveg(sz.szoveg) && !f.teendo.includes(sz.szoveg.trim())) {
    reszek.push(`(${sz.szoveg.trim()})`);
  }
  if (szoveg(f.kezdes)) reszek.push(`Begin like this: ${f.kezdes.trim()}`);
  return reszek.join("\n\n");
}

/** A sablon pontösszege. */
const pontOsszeg = (sablon) => sablon.rubrika.szempontok.reduce((a, sz) => a + Number(sz.suly), 0);

/** A sablon szempontjai a felületnek (kulcs, cím, pont). */
const szempontLista = (sablon) => sablon.rubrika.szempontok.map(({ kulcs, cim, suly }) => ({ kulcs, cim, suly: Number(suly) }));

/** Egy feladat a tár listájához: a szűréshez és a kereséshez kell mezők (a bemeneti szöveg nélkül). */
function listaElem({ feladat: f, feladatsor: s }) {
  return {
    id: f.id,
    feladatsor_id: s.id,
    ev: s.ev,
    idoszak: s.idoszak,
    szint: s.szint,
    sorszam: f.sorszam,
    eredeti_jeloles: f.eredeti_jeloles ?? null,
    sablon: f.sablon,
    cim: f.cim,
    mufaj: f.mufaj ?? null,
    tipus: f.tipus,
    szoszam: { min: f.szoszam.min ?? null, max: f.szoszam.max ?? null, szoveg: f.szoszam.szoveg ?? null },
    helyzet: f.helyzet
  };
}

/** A tár listája: legújabb évvel elöl, azon belül szint, időszak, sorszám szerint. */
function lista(tar) {
  return [...tar.feladatok.values()].map(listaElem).sort((a, b) =>
    b.ev - a.ev || a.szint.localeCompare(b.szint) || a.idoszak.localeCompare(b.idoszak) || a.sorszam - b.sorszam);
}

/** Az érettségi sablon a feladat-űrlapnak (a sablonlista „csak olvasható” eleme). */
function sablonKimenet(sablon) {
  return { id: sablon.id, nev: sablon.nev, pont: pontOsszeg(sablon), rubrika: rubrikaSablonbol(sablon) };
}

/** A sablon rubrikája a mostani rubrika-alakban (csak az ismert mezők; a feladat leírása nélkül). */
function rubrikaSablonbol(sablon) {
  const r = sablon.rubrika;
  return {
    nyelv: r.nyelv || "angol",
    tipus: r.tipus ?? null,
    szint: r.szint ?? null,
    min_szo: Number.isInteger(r.min_szo) ? r.min_szo : null,
    max_szo: Number.isInteger(r.max_szo) ? r.max_szo : null,
    szempontok: szempontLista(sablon),
    egyeb_utasitas: typeof r.egyeb_utasitas === "string" ? r.egyeb_utasitas : ""
  };
}

/** Az előnézet: a diáknak szóló feladat és a sablon szempontjai a pontjaikkal. */
function elonezet(tar, id) {
  const elem = tar.feladatok.get(id);
  if (!elem) return null;
  const { feladat: f } = elem;
  const sablon = tar.sablonok.get(f.sablon);
  return {
    ...listaElem(elem),
    bemenet: f.bemenet ? {
      fajta: f.bemenet.fajta ?? null,
      cim: f.bemenet.cim ?? null,
      bekezdesek: f.bemenet.bekezdesek.filter(szoveg),
      forras: f.bemenet.forras ?? null
    } : null,
    teendo: f.teendo,
    iranyito_szempontok: f.iranyito_szempontok.filter(szoveg),
    kezdes: f.kezdes ?? null,
    leiras: leirasEpites(f),
    sablon_adat: { id: sablon.id, nev: sablon.nev, pont: pontOsszeg(sablon), szempontok: szempontLista(sablon) }
  };
}

/**
 * A tárból készülő tanári feladat (feladatok/{id}) adatai, a tanar_id és az időbélyeg nélkül.
 * A rubrika a feladathoz tartozó sablonból jön; a típus és a szószám a feladat sajátja (a terv 3.);
 * a jegyskálát és a visszajelzés nyelvét a tanár a feladat-űrlapon választja. Az eredetjelző:
 * rubrika.tar = { id, verzio } (verzio = a feladatsor formatum_verzio-ja).
 */
function feladatAdat(tar, id) {
  const elem = tar.feladatok.get(id);
  if (!elem) return null;
  const { feladat: f, feladatsor: s } = elem;
  const sablon = tar.sablonok.get(f.sablon);
  return {
    cim: f.cim.trim().slice(0, 200),
    rubrika: {
      ...rubrikaSablonbol(sablon),
      tipus: f.tipus,
      min_szo: f.szoszam.min ?? null,
      max_szo: f.szoszam.max ?? null,
      feladat_leiras: leirasEpites(f),
      helyesiras_engedett: false,
      tar: { id: f.id, verzio: s.formatum_verzio }
    }
  };
}

module.exports = {
  ALAP_KONYVTAR, SABLON_FAJL, SABLON_IDK, SZINTEK, IDOSZAKOK,
  konyvtar, betoltes, gyorsitotarUrites, leirasEpites, lista, listaElem, elonezet, feladatAdat,
  sablonKimenet, rubrikaSablonbol, pontOsszeg
};
