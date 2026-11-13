/**
 * HTML-escape – listákat ezzel rendereljünk, mert a feladatcímek, becenevek és szövegek
 * felhasználói input. Tiszta modul (nincs Firebase-függése), így tesztből is betölthető;
 * a guard.js innen adja tovább.
 */
export function esc(ertek) {
  return String(ertek ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}
