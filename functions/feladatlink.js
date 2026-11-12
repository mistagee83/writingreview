// ══════════════════════════════════════════════════════
// WritingReview – feladatlink (tiszta függvények)
//
// A tanár egy feladathoz 24 óráig élő linket indít; a diák ezen, fiók nélkül,
// becenévvel írja meg és adja be a szöveget (docs/prod-atalakitas-terv.md, 3–4.).
//
// A link egy véletlen, kitalálhatatlan token (iras.html?k=<token>). A
// Firestore-dokumentum azonosítója a token SHA-256 lenyomata (linkek/{hash}):
// a diákoldali függvények a kapott tokenből így találják meg, a tokent pedig
// csak a tanár olvashatja vissza (a megosztási oldalhoz), a szabályok szerint.
//
// Firestore és hálózat nélkül, hogy tesztelhető legyen: tests/feladatlink.test.mjs.
// ══════════════════════════════════════════════════════

const { randomBytes, createHash } = require("node:crypto");

/** A link élettartama: 24 óra. */
const LINK_ERVENYESSEG_MS = 24 * 60 * 60 * 1000;

/** Linkenként legfeljebb ennyi beadás (visszaélés elleni plafon; a tulajdonos döntése, 2026-11-12). */
const BEADAS_MAX = 60;

/** A token bájtjai: 24 bájt = 192 bit véletlen, base64url-ben 32 karakter. */
const TOKEN_BAJT = 24;
const TOKEN_MINTA = /^[A-Za-z0-9_-]{32}$/;

/** Új, véletlen token (base64url, 32 karakter). */
function tokenGeneralas(veletlen = randomBytes) {
  return veletlen(TOKEN_BAJT).toString("base64url");
}

/** A token alakja érvényes-e (a diák felől jövő bemenet ellenőrzéséhez, minden adatbázis-olvasás előtt). */
function tokenErvenyes(token) {
  return typeof token === "string" && TOKEN_MINTA.test(token);
}

/** A token SHA-256 lenyomata (hex) – ez a linkek/{id} dokumentum azonosítója. */
function tokenHash(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Időbélyeg (Firestore Timestamp, Date vagy ms) → ms; ismeretlen → NaN. */
function ms(ido) {
  if (ido == null) return NaN;
  if (typeof ido === "number") return ido;
  if (ido instanceof Date) return ido.getTime();
  if (typeof ido.toMillis === "function") return ido.toMillis();
  return NaN;
}

/**
 * A link állapota egy adott pillanatban:
 *   "lezarva" – a tanár lezárta (ez az erősebb: lejárat előtt is),
 *   "lejart"  – elmúlt a lejárat (vagy hiányzik / hibás: biztonsági okból lejártnak számít),
 *   "betelt"  – elérte a beadási plafont,
 *   "aktiv"   – beadható.
 */
function linkAllapot(link, most = Date.now()) {
  if (!link) return "lejart";
  if (link.lezarva === true) return "lezarva";
  const lejar = ms(link.lejar);
  if (!Number.isFinite(lejar) || most >= lejar) return "lejart";
  const max = Number.isFinite(link.beadas_max) ? link.beadas_max : BEADAS_MAX;
  if ((Number(link.beadas_db) || 0) >= max) return "betelt";
  return "aktiv";
}

/** Az új link dokumentuma (a hívó adja hozzá a szerver-időbélyeget). */
function ujLinkAdat({ feladatId, tanarId, token, most = Date.now() }) {
  return {
    feladat_id: feladatId,
    tanar_id: tanarId,
    token,
    lejar: new Date(most + LINK_ERVENYESSEG_MS),
    lezarva: false,
    beadas_db: 0,
    beadas_max: BEADAS_MAX
  };
}

module.exports = {
  LINK_ERVENYESSEG_MS,
  BEADAS_MAX,
  tokenGeneralas,
  tokenErvenyes,
  tokenHash,
  linkAllapot,
  ujLinkAdat
};
