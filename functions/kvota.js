// ══════════════════════════════════════════════════════
// Tanáronkénti AI-kvóta – a tiszta (adatbázis nélküli) része
//
// Mértékegység az „AI-egység”: minden AI-művelet fix egységet fogyaszt
// (EGYSEG_KOLTSEG), a tanár havonta a csomagja szerinti egységet használhatja
// el. A számlálót a szerver vezeti tranzakcióban, a Gemini-hívás ELŐTT
// (functions/index.js: kvotaFoglalas); ez a fájl csak a számokat és a döntést
// tartalmazza, hogy emulátor nélkül tesztelhető legyen.
//
// A kvóta csak a kereskedelmi (prod) környezetben él (kornyezet.js: kvota);
// a pilot nem korlátoz. Lásd docs/kornyezetek-terv.md 5.1.
//
// A számok ÜZLETI döntések: itt egy helyen állíthatók.
// ══════════════════════════════════════════════════════

/** Egy művelet ára egységben. A beadás (átírás + értékelés, két hívás képpel) a mérték. */
const EGYSEG_KOLTSEG = {
  beadas: 1,       // egy dolgozat javítása (új beadás vagy újrafuttatás)
  feladatlap: 1,   // feladatlap → rubrika-javaslat
  kulcs: 2,        // kifejtős megoldókulcs készítése (feladatlap + tananyag, nagy bemenet)
  elemzes: 1       // osztályszintű elemzés egy feladatra
};

/**
 * Csomagok: a keret egységben (null = korlátlan), és az időszak:
 *   "egyszeri" – összesen ennyi, soha nem újul meg (az ingyenes kipróbálás),
 *   "havi"     – minden hónap elején újraindul.
 * `ingyenes` az önkiszolgáló tanári regisztrációval létrejövő fiók alapcsomagja,
 * és az is, ami a csomag nélküli (régi) tanárra érvényes, ha a kvóta él.
 * A `korlatlan` az üzemeltető által kézzel adott csomag (pl. belső tesztfiók);
 * eladásra szánt "korlátlan" csomagnak is legyen magas, véges határa (költségvédelem).
 * Több/nagyobb csomag később egy sor hozzáadás (az admin csomagválasztó a táblát listázza).
 */
const CSOMAGOK = {
  ingyenes: { keret: 20, idoszak: "egyszeri" },
  alap: { keret: 150, idoszak: "havi" },
  // "Profi": a nagyobb csomag (a felületen "akár 500 dolgozat/hó"; a keret véges, hogy a költség fedezett maradjon)
  profi: { keret: 500, idoszak: "havi" },
  korlatlan: { keret: null, idoszak: "havi" }
};

const ALAP_CSOMAG = "ingyenes";

/** A hónap kulcsa (UTC). */
function honapKulcs(datum = new Date()) {
  return `${datum.getUTCFullYear()}-${String(datum.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ismeretlen vagy hiányzó csomagnév → az alapcsomag (soha nem „korlátlan”). */
function csomagNev(nev) {
  return Object.hasOwn(CSOMAGOK, nev) ? nev : ALAP_CSOMAG;
}

/** A csomag kerete; null = korlátlan. */
function keret(nev) {
  return CSOMAGOK[csomagNev(nev)].keret;
}

/** "egyszeri" vagy "havi". */
function idoszak(nev) {
  return CSOMAGOK[csomagNev(nev)].idoszak;
}

/**
 * A használat-dokumentum azonosítója (tanarok/{uid}/hasznalat/{kulcs}): az egyszeri
 * csomagnál egyetlen, állandó dokumentum ("osszes"), a havinál a hónap kulcsa.
 */
function hasznalatKulcs(nev, datum = new Date()) {
  return idoszak(nev) === "egyszeri" ? "osszes" : honapKulcs(datum);
}

/**
 * Elfér-e a művelet a keretben?
 * @returns {{engedett: boolean, limit: number|null, hasznalt: number}}
 */
function kvotaDontes({ csomag, hasznalt, koltseg }) {
  const limit = keret(csomag);
  const mar = Number.isFinite(hasznalt) && hasznalt > 0 ? hasznalt : 0;
  return { engedett: limit === null || mar + koltseg <= limit, limit, hasznalt: mar };
}

/**
 * Csomaghoz kötött funkciók: melyik csomagoknál érhetők el (kvótás környezetben).
 * Az ingyenes csomag egyiknél sem szerepel. Egy új, csomaghoz kötött funkció
 * ide kerül, a szerveroldali zár (functions/index.js, funkcioKapu) ezt olvassa.
 */
const FUNKCIOK = {
  // osztályszintű elemzés (feladatElemzes): az Alap csomagtól
  osztaly_elemzes: ["alap", "profi", "korlatlan"],
  // fejlődés-követés (fejlodesLista, fejlodesDiak): a Profi csomag része
  fejlodes: ["profi", "korlatlan"]
};

/**
 * Elérhető-e a funkció? Kvóta nélküli környezetben (pilot) mindenkinek; egyébként a
 * csomag szerint. Az ismeretlen csomag ingyenesnek, az ismeretlen funkció tiltottnak számít.
 */
function funkcioEngedelyezett(kvotaBe, csomag, funkcio) {
  if (!kvotaBe) return true;
  return Object.hasOwn(FUNKCIOK, funkcio) && FUNKCIOK[funkcio].includes(csomagNev(csomag));
}

module.exports = {
  EGYSEG_KOLTSEG, CSOMAGOK, ALAP_CSOMAG, FUNKCIOK, honapKulcs, csomagNev, keret, idoszak, hasznalatKulcs, kvotaDontes,
  funkcioEngedelyezett
};
