// ══════════════════════════════════════════════════════
// Az Érettségi feladattár ikonja („pecsétes lap”, a tulajdonos döntése 2026-11-26)
//
// Nem emoji és nem <img>: beágyazott SVG, hogy a színe a felület változóiból jöjjön (--ink: a lap,
// --accent: a pecsét), és így kövesse a tanár színválasztását. A menü (nav.js), a kezdőlap kártyája
// (tanar.html) és a feladattár oldala (feladattar.html) is ezt használja.
// ══════════════════════════════════════════════════════

export const FELADATTAR_IKON =
  '<svg class="tar-ikon" viewBox="0 0 44 44" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M10 5h17l8 8v26H10z" stroke="var(--ink)"/>' +
  '<path d="M27 5v8h8" stroke="var(--ink)"/>' +
  '<path d="M15 18h14M15 23h14M15 28h7" stroke="var(--ink)"/>' +
  '<circle cx="31" cy="33" r="6" stroke="var(--accent)" fill="var(--card)"/>' +
  '<path d="M28.5 33l1.8 1.8 3.2-3.4" stroke="var(--accent)"/>' +
  '</svg>';
