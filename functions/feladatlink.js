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

/** A diák saját visszajelzés-linkje ennyi ideig él (a tulajdonos döntésére vár; a terv javaslata: 14 nap). */
const DIAKLINK_ERVENYESSEG_MS = 14 * 24 * 60 * 60 * 1000;

/** A beírt szöveg felső határa karakterben (a kliens is ezt tartja: public/js/iras-jelzes.js SZOVEG_MAX). */
const SZOVEG_MAX = 20000;

const BECENEV_MIN = 2;
const BECENEV_MAX = 30;

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

// ── A DIÁK BEADÁSA (a bemenet a diák böngészőjéből jön: semmiben nem bízunk) ──

/**
 * A becenév megjelenítési alakja: szélein levágva, a belső szóközök egyre vonva,
 * vezérlőkarakterek nélkül. Üres string, ha nem szöveg.
 */
function becenevTisztitas(nev) {
  if (typeof nev !== "string") return "";
  return nev.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Érvényes-e a (tisztított) becenév: 2–30 karakter, és van benne betű vagy szám. */
function becenevErvenyes(nev) {
  const t = becenevTisztitas(nev);
  return t.length >= BECENEV_MIN && t.length <= BECENEV_MAX && /[\p{L}\p{N}]/u.test(t);
}

/**
 * A becenév egyediségi kulcsa linken belül: kisbetűs, ékezet nélküli, szóköz és
 * írásjel nélkül ("Kis Pisti" = "kispisti" = "Kis-Pisti") – hogy két diák ne kapjon
 * összetéveszthető nevet. Ez egy Firestore-dokumentum azonosítója lesz (nem lehet / benne).
 */
function becenevKulcs(nev) {
  return becenevTisztitas(nev).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** A beírt szöveg: szöveg, nem csak szóköz, legfeljebb SZOVEG_MAX karakter. */
function szovegErvenyes(szoveg) {
  return typeof szoveg === "string" && szoveg.trim().length > 0 && szoveg.length <= SZOVEG_MAX;
}

const egeszHatarral = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

/**
 * Az írás közbeni jelzések alakja (public/js/iras-jelzes.js, jelzesekDokumentum, tiltas: true):
 * pontosan ezek a mezők, korlátos egész számok; a kiemelt tartományok legfeljebb 100 egész szám,
 * az időrend legfeljebb 50 esemény ({ t, tipus, ertek }). A szöveget a diák böngészője küldi:
 * semmiben nem bízunk, ami nem ilyen alakú.
 */
const JELZES_MEZOK = ["elhagyas_db", "elhagyas_mp", "beillesztes_db", "beillesztett_karakter", "beillesztett_tartomanyok",
  "beillesztes_kiserlet_db", "nagy_betoldas_db", "irasi_mp", "osszes_mp", "esemenyek"];
const ESEMENY_TIPUSOK = ["elhagyas", "beillesztes_kiserlet", "nagy_betoldas"];
const ESEMENY_MAX = 50;

function esemenyErvenyes(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  const k = Object.keys(e);
  return k.length === 3 && k.includes("t") && k.includes("tipus") && k.includes("ertek")
    && egeszHatarral(e.t, 10000000) && ESEMENY_TIPUSOK.includes(e.tipus) && egeszHatarral(e.ertek, 100000000);
}

function jelzesekErvenyesek(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return false;
  const kulcsok = Object.keys(j);
  if (kulcsok.length !== JELZES_MEZOK.length || !JELZES_MEZOK.every((k) => kulcsok.includes(k))) return false;
  return egeszHatarral(j.elhagyas_db, 100000)
    && egeszHatarral(j.elhagyas_mp, 10000000)
    && egeszHatarral(j.beillesztes_db, 100000)
    && egeszHatarral(j.beillesztett_karakter, 100000000)
    && Array.isArray(j.beillesztett_tartomanyok)
    && j.beillesztett_tartomanyok.length <= 100
    && j.beillesztett_tartomanyok.every((x) => egeszHatarral(x, SZOVEG_MAX))
    && egeszHatarral(j.beillesztes_kiserlet_db, 100000)
    && egeszHatarral(j.nagy_betoldas_db, 100000)
    && egeszHatarral(j.irasi_mp, 10000000)
    && egeszHatarral(j.osszes_mp, 10000000)
    && Array.isArray(j.esemenyek)
    && j.esemenyek.length <= ESEMENY_MAX
    && j.esemenyek.every(esemenyErvenyes);
}

/**
 * A beadás dokumentuma. Az azonosítója a DIÁK tokenjének lenyomata (beadasok/{hash}): a diák
 * a saját visszajelzés-linkjével (diaklink) ezt találja meg, a tanár pedig nem látja a tokent.
 */
function ujBeadasAdat({ link, linkId, becenev, szoveg, jelzesek, most = Date.now() }) {
  return {
    feladat_id: link.feladat_id,
    tanar_id: link.tanar_id,
    link_id: linkId,
    becenev: becenevTisztitas(becenev),
    forras: "szoveg",
    szoveg,
    jelzesek,
    statusz: "feltoltve",
    hiba: null,
    diaklink_lejar: new Date(most + DIAKLINK_ERVENYESSEG_MS)
  };
}

module.exports = {
  LINK_ERVENYESSEG_MS,
  DIAKLINK_ERVENYESSEG_MS,
  SZOVEG_MAX,
  BEADAS_MAX,
  becenevTisztitas,
  becenevErvenyes,
  becenevKulcs,
  szovegErvenyes,
  jelzesekErvenyesek,
  ujBeadasAdat,
  tokenGeneralas,
  tokenErvenyes,
  tokenHash,
  linkAllapot,
  ujLinkAdat
};
