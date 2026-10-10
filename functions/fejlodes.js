// ══════════════════════════════════════════════════════
// „Fejlődés az idő mentén” – a Profi csomag diákonkénti követő nézete
//
// Itt csak a tiszta számtan és a csomag-zár döntése van (adatbázis nélkül,
// tesztelhetően); a Firestore-olvasás és a jogosultság a functions/index.js-ben
// (fejlodesLista, fejlodesDiak). Lásd docs/folytatas.md.
//
// Mi számít bele: csak a tanár által JÓVÁHAGYOTT (statusz: elkuldve) beadás, a
// pontszázalék a tanári értékelés `szazalek` mezője. A hibák az AI-értékelés
// `hibak[]` tömbjéből jönnek (a tanári oldalon nincs hibalista).
// ══════════════════════════════════════════════════════

const kvota = require("./kvota.js");

/** Ezeknél a csomagoknál nyílik meg a nézet (kvótás környezetben); a tábla a kvota.js-ben van. */
const FEJLODES_CSOMAGOK = kvota.FUNKCIOK.fejlodes;

/** Ennyi százalékpont változás alatt a trend „változatlan”. */
const TREND_KUSZOB = 5;

/**
 * A nézet elérhető-e. A kvóta nélküli környezetben (pilot) mindenkinek; egyébként
 * csak Profi és korlátlan csomagnál. Az ismeretlen/hiányzó csomag ingyenesnek számít.
 */
function fejlodesEngedelyezett(beallitasok, csomag) {
  return kvota.funkcioEngedelyezett(Boolean(beallitasok?.kvota), csomag, "fejlodes");
}

/** Firestore Timestamp / Date / szám → ezredmásodperc (egyébként 0). */
function idoMs(ido) {
  if (ido == null) return 0;
  if (typeof ido.toMillis === "function") return ido.toMillis();
  if (ido instanceof Date) return ido.getTime();
  return Number.isFinite(ido) ? ido : 0;
}

/**
 * Egy beadásból egy idővonal-pont, vagy null, ha nem számít bele (nincs jóváhagyva,
 * vagy a tanári értékelésben nincs pontszázalék – pl. a pontozás előtti jóváhagyások).
 * @param {{beadas: object, tanari: object|undefined, ai: object|undefined, feladatCim?: string}} p
 */
function idovonalPont({ beadas, tanari, ai, feladatCim }) {
  if (!beadas || beadas.statusz !== "elkuldve") return null;
  const szazalek = tanari?.szazalek;
  if (typeof szazalek !== "number" || !Number.isFinite(szazalek)) return null;

  const kategoriak = {};
  const tipusok = {};
  for (const h of ai?.hibak || []) {
    const kat = h?.kategoria || "egyeb";
    kategoriak[kat] = (kategoriak[kat] || 0) + 1;
    const tipus = String(h?.tipus || "").trim();
    if (!tipus) continue;
    const kulcs = `${kat}/${tipus}`;
    tipusok[kulcs] = tipusok[kulcs] || { kategoria: kat, tipus, db: 0 };
    tipusok[kulcs].db++;
  }

  return {
    feladat_id: beadas.feladat_id || null,
    feladat_cim: feladatCim || null,
    // a jóváhagyás ideje a mérvadó; régi rekordnál a beadásé
    ido: idoMs(tanari?.jovahagyva_at) || idoMs(beadas.letrehozva),
    szazalek: Math.round(szazalek),
    kategoriak,
    tipusok: Object.values(tipusok).sort((a, b) => b.db - a.db)
  };
}

/** Időrendbe rendezett pontok (azonos időnél a feladat azonosítója dönt, hogy stabil legyen). */
function idovonalRendezes(pontok) {
  return pontok
    .filter(Boolean)
    .sort((a, b) => a.ido - b.ido || String(a.feladat_id).localeCompare(String(b.feladat_id)));
}

/**
 * Az ismétlődő hibatípusok: azok, amelyek legalább két különböző feladatban előfordultak.
 * Gyakoriság szerint csökkenő (előbb a több feladatban szereplő, utána az összes darab).
 */
function ismetlodoHibak(pontok) {
  const osszes = {};
  pontok.forEach((p, i) => {
    for (const t of p.tipusok) {
      const kulcs = `${t.kategoria}/${t.tipus}`;
      osszes[kulcs] = osszes[kulcs] || { kategoria: t.kategoria, tipus: t.tipus, feladat_db: 0, db: 0, utolso: -1 };
      osszes[kulcs].feladat_db++;
      osszes[kulcs].db += t.db;
      osszes[kulcs].utolso = i;
    }
  });
  const utolsoIndex = pontok.length - 1;
  return Object.values(osszes)
    .filter((t) => t.feladat_db >= 2)
    .map(({ utolso, ...t }) => ({ ...t, legutobbi: utolso === utolsoIndex }))
    .sort((a, b) => b.feladat_db - a.feladat_db || b.db - a.db || a.tipus.localeCompare(b.tipus));
}

/** A trend az utolsó két pont különbségéből: "fel" | "le" | "valtozatlan" | null (kevés adat). */
function trend(pontok) {
  if (pontok.length < 2) return null;
  const kulonbseg = pontok[pontok.length - 1].szazalek - pontok[pontok.length - 2].szazalek;
  if (kulonbseg >= TREND_KUSZOB) return "fel";
  if (kulonbseg <= -TREND_KUSZOB) return "le";
  return "valtozatlan";
}

/** Egy diák teljes idővonal-nézete (a `pontok` már rendezett). */
function diakNezet(pontok) {
  return {
    pontok,
    ismetlodo: ismetlodoHibak(pontok),
    trend: trend(pontok)
  };
}

/**
 * Az osztály diáklistája. A névsor a tagokból jön (a nevet a tagok adják), a pontok
 * diákonként csoportosítva; a beadás nélküli tag is szerepel (db: 0).
 * @param {{uid: string, nev: string}[]} tagok
 * @param {Map<string, object[]>|Object<string, object[]>} pontokDiakonkent diak_id → rendezett pontok
 */
function diakLista(tagok, pontokDiakonkent) {
  const get = (uid) => (pontokDiakonkent instanceof Map ? pontokDiakonkent.get(uid) : pontokDiakonkent[uid]) || [];
  return tagok
    .map((t) => {
      const pontok = get(t.uid);
      const utolso = pontok[pontok.length - 1];
      return {
        diak_id: t.uid,
        nev: t.nev || "",
        beadas_db: pontok.length,
        utolso_szazalek: utolso ? utolso.szazalek : null,
        trend: trend(pontok)
      };
    })
    .sort((a, b) => a.nev.localeCompare(b.nev, "hu"));
}

module.exports = {
  FEJLODES_CSOMAGOK,
  TREND_KUSZOB,
  fejlodesEngedelyezett,
  idoMs,
  idovonalPont,
  idovonalRendezes,
  ismetlodoHibak,
  trend,
  diakNezet,
  diakLista
};
