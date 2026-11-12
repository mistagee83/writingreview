// ══════════════════════════════════════════════════════
// WritingReview – csoportok (8b): a tiszta, tesztelhető rész
//
// A csoport nevét a kliens tisztítja és a Firestore-szabály ellenőrzi (1–60 karakter);
// a sorrend ábécérendi (a felület nyelvén), az archiváltak a végén.
// A DOM-os rész a csoportok.html-ben és a megosztas.html-ben van.
// ══════════════════════════════════════════════════════

export const CSOPORT_NEV_MAX = 60;

/** A név szóközeit összevonja; üres vagy túl hosszú névre null. */
export function csoportNevTisztitas(nev) {
  const s = String(nev ?? "").replace(/\s+/g, " ").trim();
  return s && s.length <= CSOPORT_NEV_MAX ? s : null;
}

/** Ábécérend (számokat értelmesen: „9.B” a „10.A” előtt), az archiváltak a végén. */
export function csoportRendezes(csoportok, locale = "hu") {
  return [...csoportok].sort((a, b) =>
    (a.aktiv === false) - (b.aktiv === false)
    || String(a.nev || "").localeCompare(String(b.nev || ""), locale, { numeric: true, sensitivity: "base" }));
}

/** A linkindításnál választható csoportok: csak a nem archiváltak, rendezve. */
export function valaszthatoCsoportok(csoportok, locale = "hu") {
  return csoportRendezes(csoportok.filter((c) => c.aktiv !== false), locale);
}
