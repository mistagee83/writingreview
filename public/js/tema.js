// ══════════════════════════════════════════════════════
// WritingReview – a tanári felület színtémája
//
// A téma a <html data-tema="…"> attribútumon át érvényesül (css/app.css: `:root[data-tema="…"]`).
// A szerver adja az igazságot (felhasznalok/{uid}.tema, a guard.js tölti be); a localStorage csak a
// villanásmentes betöltéshez van (js/tema-korai.js olvassa az oldal tetején). A névlistát a
// functions/tema.js és a tema-korai.js tükrözi; tests/tema.test.mjs ellenőrzi az egyezést.
// ══════════════════════════════════════════════════════

export const TEMAK = ["narancs", "kek", "zold", "lila", "bordo", "pala"];
export const ALAP_TEMA = "narancs";
export const TAR_KULCS = "wr_tema";

/** Beállítja a témát (ismeretlen vagy az alap → az alapszín) és megjegyzi a következő betöltésre. */
export function temaAlkalmaz(nev) {
  const tema = TEMAK.includes(nev) && nev !== ALAP_TEMA ? nev : null;
  if (tema) document.documentElement.setAttribute("data-tema", tema);
  else document.documentElement.removeAttribute("data-tema");
  try {
    if (tema) localStorage.setItem(TAR_KULCS, tema);
    else localStorage.removeItem(TAR_KULCS);
  } catch (_) { /* privát ablak, letiltott tárolás: a téma így is érvényes marad */ }
  allapotsavSzin();
}

/** A telefon állapotsorának színe kövesse a felső sávét (a témáét), hogy ne látszódjon csík a tetején. */
function allapotsavSzin() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const sav = document.querySelector(".topbar");
  if (!meta || !sav) return;
  const szin = getComputedStyle(sav).backgroundColor;
  if (szin) meta.setAttribute("content", szin);
}
