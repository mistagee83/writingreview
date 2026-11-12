// ══════════════════════════════════════════════════════
// WritingReview – jegyskála, jegyjavaslat, bekezdésekre tagolás és a
// visszajelzés nyelve (közös, tiszta függvények)
//
// Firestore, hálózat és importálás nélkül: a böngészőben is fut. A
// public/js/skala.js GENERÁLT példány (scripts/skala-kliens.mjs; a build is
// lefuttatja), így a tanári felület ugyanazzal számol, mint a szerver.
// Tesztek: tests/skala.test.mjs, tests/kimenet.test.mjs.
//
// 2026-11-12 előtt a functions/kifejtos.js része volt; a kifejtős mód a
// prodból kikerült (docs/prod-atalakitas-terv.md), ez a rész maradt.
// ══════════════════════════════════════════════════════

// %-ban, "legalább ennyi kell a jegyhez". Feladatonként átírható.
const ALAP_PONTHATAROK = { 2: 40, 3: 55, 4: 70, 5: 85 };

/** A ponthatárok ellenőrzése – rossz érték helyett az alapértelmezés. */
function ponthatarokEllenorzes(h) {
  if (!h || typeof h !== "object") return { ...ALAP_PONTHATAROK };
  const szamok = [2, 3, 4, 5].map((j) => Number(h[j]));
  const jo = szamok.every((x) => Number.isFinite(x) && x >= 0 && x <= 100)
    && szamok.every((x, i) => i === 0 || x > szamok[i - 1]);
  return jo ? { 2: szamok[0], 3: szamok[1], 4: szamok[2], 5: szamok[3] } : { ...ALAP_PONTHATAROK };
}

// ── Jegyskála ─────────────────────────────────────────
// A feladat rubrikájában (`rubrika.skala`) él:
//   { tipus: "fokozat", fokozatok: [{ cimke, min }, ...] }
//       a fokozatok a "min" (% – legalább ennyi kell hozzá) szerint
//       növekvők, az első min 0 (ez a "ha semmi más nem ér"); a cimke
//       szám (1–5) vagy rövid szöveg (A–F);
//   { tipus: "szazalek" }
//       a "jegy" a kerekített százalék (0–100).
// A `sablon` mező csak a felületnek jelzi, melyik sablonból indult a skála.
// Régi feladatnál nincs skála: a `rubrika.ponthatarok` magyar 1–5-ös skálát ad.
const SKALA_SABLONOK = {
  hu15: {
    sablon: "hu15",
    tipus: "fokozat",
    fokozatok: [
      { cimke: 1, min: 0 }, { cimke: 2, min: ALAP_PONTHATAROK[2] }, { cimke: 3, min: ALAP_PONTHATAROK[3] },
      { cimke: 4, min: ALAP_PONTHATAROK[4] }, { cimke: 5, min: ALAP_PONTHATAROK[5] }
    ]
  },
  af: {
    sablon: "af",
    tipus: "fokozat",
    fokozatok: [
      { cimke: "F", min: 0 }, { cimke: "D", min: 60 }, { cimke: "C", min: 70 },
      { cimke: "B", min: 80 }, { cimke: "A", min: 90 }
    ]
  },
  szazalek: { sablon: "szazalek", tipus: "szazalek" }
};
const ALAP_SKALA = "hu15";
const SKALA_FOKOZAT_MIN = 2;
const SKALA_FOKOZAT_MAX = 15;
const SKALA_CIMKE_MAX = 8;

/** Mélymásolat, hogy a sablonokat senki ne írhassa át véletlenül. */
function skalaMasolat(s) {
  return s.tipus === "szazalek"
    ? { sablon: s.sablon, tipus: "szazalek" }
    : { sablon: s.sablon, tipus: "fokozat", fokozatok: s.fokozatok.map((f) => ({ ...f })) };
}

/**
 * A skála ellenőrzése. Érvényes → a normalizált skála; különben null
 * (a hívó dönt: az űrlap hibát mutat, a szerver az alapra esik vissza).
 */
function skalaEllenorzes(s) {
  if (!s || typeof s !== "object") return null;
  const sablon = typeof s.sablon === "string" ? s.sablon.slice(0, 20) : undefined;
  if (s.tipus === "szazalek") return { ...(sablon && { sablon }), tipus: "szazalek" };
  if (s.tipus !== "fokozat" || !Array.isArray(s.fokozatok)) return null;
  if (s.fokozatok.length < SKALA_FOKOZAT_MIN || s.fokozatok.length > SKALA_FOKOZAT_MAX) return null;

  const fokozatok = [];
  const latott = new Set();
  for (const f of s.fokozatok) {
    if (!f || typeof f !== "object") return null;
    const min = Number(f.min);
    if (f.min === "" || f.min === null || !Number.isFinite(min) || min < 0 || min > 100) return null;
    let cimke = f.cimke;
    if (typeof cimke === "string") {
      cimke = cimke.trim();
      if (!cimke || cimke.length > SKALA_CIMKE_MAX) return null;
    } else if (!Number.isFinite(cimke)) {
      return null;
    }
    const kulcs = String(cimke);
    if (latott.has(kulcs)) return null;
    latott.add(kulcs);
    fokozatok.push({ cimke, min });
  }
  if (fokozatok[0].min !== 0) return null;
  if (!fokozatok.every((f, i) => i === 0 || f.min > fokozatok[i - 1].min)) return null;
  return { ...(sablon && { sablon }), tipus: "fokozat", fokozatok };
}

/**
 * A feladat tényleges skálája: a rubrika skálája; ennek híján a régi
 * ponthatárokból épített magyar 1–5; végül az alap (magyar 1–5).
 */
function skalaFeloldas(rubrika) {
  const sajat = skalaEllenorzes(rubrika?.skala);
  if (sajat) return sajat;
  const skala = skalaMasolat(SKALA_SABLONOK[ALAP_SKALA]);
  const h = ponthatarokEllenorzes(rubrika?.ponthatarok);
  skala.fokozatok.forEach((f) => { if (f.cimke !== 1) f.min = h[f.cimke]; });
  return skala;
}

/**
 * A tanár által megadott jegy a skálán: a skála saját (kanonikus) értéke,
 * vagy undefined, ha nem szerepel rajta. A szám és a szöveges alak is jó
 * ("4" ugyanaz, mint 4), a tárolt érték viszont mindig a skáláé.
 */
function jegyNormalizalas(jegy, skala) {
  if (typeof jegy !== "number" && typeof jegy !== "string") return undefined;
  if (skala.tipus === "szazalek") {
    const n = typeof jegy === "string" && jegy.trim() === "" ? NaN : Number(jegy);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : undefined;
  }
  return skala.fokozatok.find((f) => String(f.cimke) === String(jegy).trim())?.cimke;
}

/**
 * A diáknak szóló szöveg bekezdésekre tagolása. A modell néha egyetlen
 * blokkot ad (a JSON-mezőben a bekezdéshatár "

", amit időnként kihagy).
 * Ha van üres sor, békén hagyjuk; ha csak sortörések vannak, azokat
 * bekezdéshatárrá emeljük; ha semmi, a hosszú szöveget mondathatáron
 * 2-4 nagyjából egyforma bekezdésre vágjuk.
 */
function bekezdesekre(szoveg) {
  const sz = String(szoveg ?? "").replace(/\r\n?/g, "\n").trim();
  if (!sz) return "";
  if (/\n\s*\n/.test(sz)) return sz.replace(/\n\s*\n(\s*\n)+/g, "\n\n");
  if (sz.includes("\n")) return sz.split(/\n+/).map((x) => x.trim()).filter(Boolean).join("\n\n");
  const CEL = 380;
  if (sz.length <= CEL * 1.3) return sz;
  const mondatok = sz.split(/(?<=[.!?…])\s+(?=[\p{Lu}"„'(])/u);
  if (mondatok.length < 3) return sz;
  const db = Math.min(4, Math.max(2, Math.round(sz.length / CEL)));
  const cel = sz.length / db;
  const bekezdesek = [];
  let akt = "";
  for (const m of mondatok) {
    if (akt && akt.length + m.length / 2 > cel && bekezdesek.length < db - 1) {
      bekezdesek.push(akt);
      akt = m;
    } else {
      akt = akt ? `${akt} ${m}` : m;
    }
  }
  if (akt) bekezdesek.push(akt);
  return bekezdesek.join("\n\n");
}

/**
 * Jegyjavaslat a pontszámból. A pontos arányt nézzük, nem a kerekített
 * százalékot: 54,6% ne érjen 3-ast 55%-os határnál.
 *
 * @param {object} [skala] skála (van `tipus`-a), vagy a régi ponthatárok
 *   ({2: 40, 3: 55, ...}) – az utóbbi a magyar 1–5-ös skálát adja.
 */
function jegyJavaslat(pont, max, skala) {
  if (!(max > 0)) return null;
  const s = skala && typeof skala === "object" && "tipus" in skala
    ? (skalaEllenorzes(skala) || skalaMasolat(SKALA_SABLONOK[ALAP_SKALA]))
    : skalaFeloldas({ ponthatarok: skala });
  const sz = (pont / max) * 100;
  if (s.tipus === "szazalek") return Math.round(sz);
  let jegy = s.fokozatok[0].cimke;
  for (const f of s.fokozatok) {
    if (sz + 1e-9 >= f.min) jegy = f.cimke;
  }
  return jegy;
}

// ── A VISSZAJELZÉS NYELVE ──
// A diáknak és a tanárnak szóló, AI-generált szövegek (visszajelzés,
// magyarázatok, osztályelemzés) nyelve. A feladat rubrikájának
// `kimeneti_nyelv` mezője adja; a régebbi feladatoknál nincs ilyen –
// azok magyarok, ezért az alapérték "hu". Az instrukciók magyarul
// maradnak, csak a KIMENET nyelvét kérjük másként.
const KIMENETI_NYELVEK = {
  hu: { kod: "hu", melleknev: "magyar", hatarozo: "magyarul", hatarozoNagy: "MAGYARUL" },
  en: { kod: "en", melleknev: "angol", hatarozo: "angolul", hatarozoNagy: "ANGOLUL" }
};
const ALAP_KIMENETI_NYELV = "hu";

/** A kimeneti nyelv leírója egy kódból vagy egy rubrikából; ismeretlen → magyar. */
function kimenet(forras) {
  const kod = typeof forras === "string" ? forras : forras?.kimeneti_nyelv;
  return KIMENETI_NYELVEK[kod] || KIMENETI_NYELVEK[ALAP_KIMENETI_NYELV];
}

module.exports = {
  ALAP_PONTHATAROK,
  SKALA_SABLONOK,
  ALAP_SKALA,
  ponthatarokEllenorzes,
  skalaEllenorzes,
  skalaFeloldas,
  jegyNormalizalas,
  jegyJavaslat,
  bekezdesekre,
  KIMENETI_NYELVEK,
  ALAP_KIMENETI_NYELV,
  kimenet
};
