// ══════════════════════════════════════════════════════
// Az Érettségi feladattár oldalának (feladattar.html) tiszta segédfüggvényei: feliratok és szűrés.
// Külön modulban, hogy a tests/feladattar-tar.test.mjs böngésző nélkül is ellenőrizhesse.
// ══════════════════════════════════════════════════════

import { t, vanKulcs } from "./i18n.js";

/** A vizsga neve a felület nyelvén: „2024. május, középszint” / „May 2024, intermediate level”. */
export function vizsgaNev(v) {
  return t("tar.vizsga", {
    ev: v.ev,
    idoszak: t(`tar.idoszak_${v.idoszak}`),
    szint: t(`tar.szint_${v.szint}`)
  });
}

/** A műfaj kulcsa a szótárban (a szóköz aláhúzás lesz: "forum post" → tar.mufaj_forum_post). */
export const mufajKulcs = (m) => `tar.mufaj_${String(m).replace(/\W+/g, "_")}`;

/** A feladatlap műfaja a felület nyelvén; ismeretlen műfajnál az eredeti angol szó. */
export function mufajNev(m) {
  const k = mufajKulcs(m);
  return vanKulcs(k) ? t(k) : String(m);
}

/** Kisbetűs, ékezet nélküli alak a kereséshez. */
const normal = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * A lista szűrése. Üres szűrőérték: nincs szűrés. A keresés a címben és a helyzetben néz minden
 * szót (mind kell, sorrendtől függetlenül).
 */
export function szuresTar(feladatok, sz = {}) {
  const szavak = normal(sz.kereses).split(/\s+/).filter(Boolean);
  return feladatok.filter((f) =>
    (!sz.szint || f.vizsga.szint === sz.szint)
    && (!sz.ev || String(f.vizsga.ev) === String(sz.ev))
    && (!sz.idoszak || f.vizsga.idoszak === sz.idoszak)
    && (!sz.sorszam || String(f.sorszam) === String(sz.sorszam))
    && (!sz.mufaj || f.mufaj === sz.mufaj)
    && (szavak.length === 0 || szavak.every((w) => normal(`${f.cim} ${f.helyzet}`).includes(w))));
}
