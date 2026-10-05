// ══════════════════════════════════════════════════════
// WritingReview – csomagár-számoló (admin: AI-használat oldal)
//
// Tiszta függvények, hogy Node-ban tesztelhetők legyenek
// (tests/arszamolo.test.mjs). Az oldal (ai-hasznalat.html) csak az űrlap-
// mezőket olvassa be, és kirajzolja az eredményt.
//
// A modell: a vevő a BRUTTÓ árat fizeti (áfával). Ebből
//   nettó bevétel   = bruttó / (1 + áfa)
//   fizetési díj    = bruttó × díj% + fix díj      (a szolgáltató a TELJES, áfás összegből vonja)
//   AI-költség      = egy dolgozat költsége × a csomag dolgozatszáma
//   árrés           = nettó bevétel − fizetési díj − AI-költség
//   árrés %         = árrés / nettó bevétel
// Az ajánlott ár az a legkisebb bruttó ár, ahol az árrés % eléri a célt.
//
// NINCS benne: az ingyenes csomagok költsége, a nem kihasznált keret (az javít),
// könyvelés, hosting és egyéb működési költség.
// ══════════════════════════════════════════════════════

/**
 * Stripe (Magyarország), standard díjak – forrás: stripe.com/en-hu/pricing (2026-10).
 * A fix díj 85 Ft (≈ 0,25 €). Az előfizetés-kezelés (Stripe Billing) +0,7% a számlázott
 * forgalom után, a valutaváltás +2%, ha a fizetés devizája eltér a kifizetésétől.
 */
export const KARTYA_DIJAK = {
  eea: 1.5,        // standard EGT-s kártya
  premium: 2.8,    // prémium EGT-s kártya
  uk: 2.5,         // brit kártya
  nem_eea: 3.15    // nemzetközi kártya
};
export const STRIPE_FIX_FT = 85;
export const STRIPE_BILLING_SZAZALEK = 0.7;
export const STRIPE_VALUTAVALTAS_SZAZALEK = 2;

const pozitiv = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

/** A legkisebb `lepes` többszörös, ami nem kisebb az árnál (pl. 0,5 €-ra kerekítve felfelé). */
export function felfeleKerekit(ar, lepes = 0.5) {
  if (!Number.isFinite(ar)) return ar;
  return Math.ceil(ar / lepes - 1e-9) * lepes;
}

/**
 * Egy adott csomag (dolgozatszám) számai egy adott bruttó áron.
 * @param {object} p
 * @param {number} p.koltsegEur  egy dolgozat AI-költsége EUR-ban (a tanári pótlékkal, ha számít)
 * @param {number} p.db          dolgozat a csomagban
 * @param {number} p.ar          bruttó csomagár (EUR, áfával)
 * @param {number} p.afaSzazalek áfa %
 * @param {number} p.dijSzazalek fizetési díj % (kártya + előfizetés-kezelés + váltás összesen)
 * @param {number} p.fixEur      fix díj tranzakciónként (EUR)
 */
export function csomagSzamok({ koltsegEur, db, ar, afaSzazalek, dijSzazalek, fixEur }) {
  const brutto = pozitiv(ar);
  const netto = brutto / (1 + pozitiv(afaSzazalek) / 100);
  const fizetesiDij = brutto > 0 ? (brutto * pozitiv(dijSzazalek)) / 100 + pozitiv(fixEur) : 0;
  const aiKoltseg = pozitiv(koltsegEur) * Math.max(1, pozitiv(db));
  const arres = netto - fizetesiDij - aiKoltseg;
  // Nullpont: hány dolgozat fér a keretbe, mielőtt az árrés elfogy (a nem-AI tételek után).
  const nullpont = koltsegEur > 0 ? Math.max(0, Math.floor((netto - fizetesiDij) / koltsegEur)) : null;
  return {
    brutto, netto, fizetesiDij, aiKoltseg, arres,
    arresSzazalek: netto > 0 ? (arres / netto) * 100 : null,
    nullpont
  };
}

/**
 * A célárréshez szükséges legkisebb bruttó ár egy csomagmérethez; null, ha a
 * díjakkal és az áfával ez a célárrés nem érhető el (a nevező nem pozitív).
 *   árrés = P/(1+v) − (P·f + fix) − C  ≥  m · P/(1+v)
 *   ⇒ P ≥ (fix + C) / ((1 − m)/(1 + v) − f)
 */
export function ajanlottAr({ koltsegEur, db, celArresSzazalek, afaSzazalek, dijSzazalek, fixEur }) {
  const m = Math.min(Math.max(pozitiv(celArresSzazalek), 0), 99.9) / 100;
  const v = pozitiv(afaSzazalek) / 100;
  const f = pozitiv(dijSzazalek) / 100;
  const nevezo = (1 - m) / (1 + v) - f;
  if (nevezo <= 0) return null;
  const ar = (pozitiv(fixEur) + pozitiv(koltsegEur) * Math.max(1, pozitiv(db))) / nevezo;
  return Number.isFinite(ar) ? ar : null;
}

/** Az ajánlás egy csomagmérethez: nyers és felfelé kerekített ár, és az árrés a kerekített áron. */
export function ajanlas(p, lepes = 0.5) {
  const nyers = ajanlottAr(p);
  if (nyers === null) return null;
  const kerekitett = felfeleKerekit(nyers, lepes);
  const szamok = csomagSzamok({ ...p, ar: kerekitett });
  return { nyers, kerekitett, arPerDolgozat: kerekitett / Math.max(1, p.db), ...szamok };
}
