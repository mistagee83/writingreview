// ══════════════════════════════════════════════════════
// Tanáronkénti havi AI-kvóta – a tiszta (adatbázis nélküli) része
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
 * Csomagok: a havi egységkeret (null = korlátlan).
 * `ingyenes` az önkiszolgáló tanári regisztrációval létrejövő fiók alapcsomagja,
 * és az is, ami a csomag nélküli (régi) tanárra érvényes, ha a kvóta él.
 * A `korlatlan` az üzemeltető által kézzel adott csomag (pl. belső tesztfiók).
 */
const CSOMAGOK = {
  ingyenes: { havi: 20 },
  alap: { havi: 150 },
  profi: { havi: 600 },
  korlatlan: { havi: null }
};

const ALAP_CSOMAG = "ingyenes";

/** A hónap kulcsa (UTC): a használat dokumentum azonosítója. */
function honapKulcs(datum = new Date()) {
  return `${datum.getUTCFullYear()}-${String(datum.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ismeretlen vagy hiányzó csomagnév → az alapcsomag (soha nem „korlátlan”). */
function csomagNev(nev) {
  return Object.hasOwn(CSOMAGOK, nev) ? nev : ALAP_CSOMAG;
}

/** A csomag havi kerete; null = korlátlan. */
function havikeret(nev) {
  return CSOMAGOK[csomagNev(nev)].havi;
}

/**
 * Elfér-e a művelet a keretben?
 * @returns {{engedett: boolean, limit: number|null, hasznalt: number}}
 */
function kvotaDontes({ csomag, hasznalt, koltseg }) {
  const limit = havikeret(csomag);
  const mar = Number.isFinite(hasznalt) && hasznalt > 0 ? hasznalt : 0;
  return { engedett: limit === null || mar + koltseg <= limit, limit, hasznalt: mar };
}

module.exports = { EGYSEG_KOLTSEG, CSOMAGOK, ALAP_CSOMAG, honapKulcs, csomagNev, havikeret, kvotaDontes };
