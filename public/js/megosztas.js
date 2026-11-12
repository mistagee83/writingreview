// ══════════════════════════════════════════════════════
// WritingReview – a feladatlink megosztási oldalának tiszta részei
//
// A link állapotát a szerver dönti el (functions/feladatlink.js, linkAllapot);
// ez a böngészős példány CSAK megjelenítésre való, és a szerverével azonosan kell
// számolnia – a tests/megosztas.test.mjs a kettőt ugyanazokon az eseteken
// összeveti. A DOM-os rész a megosztas.html-ben van.
// ══════════════════════════════════════════════════════

import { qrcode } from "./qrcode-generator.js";

/** A diákoldal címe (4. lépés: iras.html). A token base64url, kódolni nem kell, de nem árt. */
export function linkUrl(origin, token) {
  return `${String(origin).replace(/\/+$/, "")}/iras.html?k=${encodeURIComponent(token)}`;
}

/** Időbélyeg (Firestore Timestamp, Date vagy ms) → ms; ismeretlen → NaN. */
function ms(ido) {
  if (ido == null) return NaN;
  if (typeof ido === "number") return ido;
  if (ido instanceof Date) return ido.getTime();
  if (typeof ido.toMillis === "function") return ido.toMillis();
  return NaN;
}

/** Ugyanaz, mint a szerver linkAllapot()-ja: "lezarva" | "lejart" | "betelt" | "aktiv". */
export function linkAllapot(link, most = Date.now()) {
  if (!link) return "lejart";
  if (link.lezarva === true) return "lezarva";
  const lejar = ms(link.lejar);
  if (!Number.isFinite(lejar) || most >= lejar) return "lejart";
  const max = Number.isFinite(link.beadas_max) ? link.beadas_max : 60;
  if ((Number(link.beadas_db) || 0) >= max) return "betelt";
  return "aktiv";
}

/** A hátralévő idő "ÓÓ:PP:MM" alakban (0-nál és múltban "00:00:00"). */
export function hatralevo(lejar, most = Date.now()) {
  const vege = ms(lejar);
  const mp = Number.isFinite(vege) ? Math.max(0, Math.floor((vege - most) / 1000)) : 0;
  const k = (n) => String(n).padStart(2, "0");
  return `${k(Math.floor(mp / 3600))}:${k(Math.floor((mp % 3600) / 60))}:${k(mp % 60)}`;
}

/** A legutóbbi még élő (aktív vagy betelt) link, vagy null. A lista a létrehozás szerint csökkenő. */
export function elsoElo(linkek, most = Date.now()) {
  return linkek.find((l) => ["aktiv", "betelt"].includes(linkAllapot(l, most))) || null;
}

/** QR-kód SVG-ként (M hibajavítás: kivetítve, telefonról is biztosan olvasható). */
export function qrSvg(szoveg, { cella = 6, margo = 4, cim = "" } = {}) {
  const q = qrcode(0, "M");
  q.addData(szoveg);
  q.make();
  return q.createSvgTag({ cellSize: cella, margin: margo * cella, title: cim, alt: cim, scalable: true });
}
