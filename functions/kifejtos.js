// ══════════════════════════════════════════════════════
// WritingReview – kifejtős kérdéseket tartalmazó dolgozat
// Terv: docs/kifejtos-mod-terv.md
//
// Ebben a fájlban CSAK tiszta függvények, sémák és promptok vannak –
// Firestore és hálózat nélkül, hogy minden unit-tesztelhető legyen
// (tests/kifejtos.test.mjs). A Firestore-oldali folyamat az index.js-ben.
//
// A munkamegosztás:
//  - az AI elemenként CSAK státuszt ad (megvan / reszben / hianyzik /
//    teves), szó szerinti idézetet és – sorrendnél – pozíciót;
//  - a PONTOT a kód számolja, a tanár beállításai szerint;
//  - az idézetet a kód visszakeresi a diák válaszában: ha nincs ott,
//    az elem nem jár. Olcsó, determinisztikus fék a hallucináció ellen.
// ══════════════════════════════════════════════════════

const KERDES_TIPUSOK = [
  "zart_felsorolas", "nyilt_felsorolas", "sorrend", "tablazat", "magyarazat", "valasztos"
];
const ELEM_STATUSZOK = ["megvan", "reszben", "hianyzik", "teves"];
const SORREND_MODOK = ["nem_szamit", "relativ", "pozicio"];
const SZAKSZO_MODOK = ["lenyeg", "pontos"];
const KULCSON_KIVUL_MODOK = ["elfogad", "tanar_dont"];

// Helyesírásért SZÁNDÉKOSAN nincs kategória: kifejtős dolgozatnál a
// tartalmat mérjük, és ha lenne rá kategória, az AI töltené.
const KIFEJTOS_HIBA_KATEGORIAK = [
  "hianyzo_elem", "tartalmi_tevedes", "pontatlan_fogalom", "sorrend", "hianyos_kifejtes"
];

// Ezeket a felület tölti elő, a tanár választ. Az AI-t SZÁNDÉKOSAN nem
// kérdezzük róluk: ha javasolna, a tanár hajlamos lenne átnézés nélkül
// jóváhagyni – és a próbán épp a sorrend szigorán csúszott el a pontozás.
//
// Az alapérték számít: a beállítások a felületen össze vannak csukva, a
// legtöbb tanár nem nyitja le. Sorrendnél a "relativ" a méltányos középút:
// aki felcserél két lépést, csak azokért veszít, nem az egész kérdésért.
const ALAP_BEALLITAS = {
  sorrend: "relativ",
  szakszo: "lenyeg",
  reszpont: 0.5,
  kulcson_kivul: "elfogad"
};

// %-ban, "legalább ennyi kell a jegyhez". Feladatonként átírható.
const ALAP_PONTHATAROK = { 2: 40, 3: 55, 4: 70, 5: 85 };

// Nyílt felsorolásnál egy elfogadott, kulcson kívüli tétel ennyit ér.
const KULCSON_KIVULI_TETEL_PONT = 1;

const KERDES_MAX = 50;
const ELEM_MAX = 60;
const SZOSZEDET_MAX = 300;

/** Mód: a hiányzó érték a régi (fogalmazás / íráskészség) mód. */
function feladatMod(rubrika) {
  return rubrika?.mod === "kifejtos" ? "kifejtos" : "iras";
}

/** Fél pontok miatti lebegőpontos zaj ellen. */
function kerekit(x) {
  return Math.round(x * 100) / 100;
}

// ══════════════════════════════════════════════════════
// IDÉZET-ELLENŐRZÉS
// ══════════════════════════════════════════════════════

/**
 * Szöveg → összehasonlítható szavak: kisbetű, ékezet és írásjel nélkül.
 * Az ékezetet azért hagyjuk el, mert az átírás egy-egy ékezetet
 * félreolvashat – az idézet-ellenőrzés a hallucinációt fogja meg, nem
 * az OCR-t.
 */
function szavak(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Toldaléktűrő szóegyezés. A szószedet az átírásnál egy-egy szót a saját
 * alakjára igazíthat ("alakulás" → "alakulása"), és az AI is idézhet
 * toldalékkal – ezért elég, ha a rövidebb szó legfeljebb 2 betűvel tér el
 * a közös elejüktől. Rövid szavaknál (és számoknál) pontos egyezés kell:
 * "1848" ne egyezzen "1849"-cel.
 */
function szoEgyezik(a, b) {
  if (a === b) return true;
  const [rovid, hosszu] = a.length <= b.length ? [a, b] : [b, a];
  if (rovid.length < 4) return false;
  let k = 0;
  while (k < rovid.length && rovid[k] === hosszu[k]) k++;
  return k >= 4 && k >= rovid.length - 2;
}

/** A `minta` szósorozat első előfordulása a `szoveg`-ben, `tol`-tól. */
function sorozatKeres(szoveg, minta, tol) {
  for (let i = tol; i + minta.length <= szoveg.length; i++) {
    let jo = true;
    for (let j = 0; j < minta.length; j++) {
      if (!szoEgyezik(szoveg[i + j], minta[j])) { jo = false; break; }
    }
    if (jo) return i;
  }
  return -1;
}

/**
 * Tényleg ott van-e az idézet a diák válaszában?
 * A "..." / "…" kihagyást jelöl: a részeknek sorrendben kell meglenniük.
 */
function idezetEllenorzes(idezet, valasz) {
  const reszek = String(idezet ?? "")
    .split(/\.{3}|…/)
    .map(szavak)
    .filter((r) => r.length > 0);
  if (reszek.length === 0) return false;

  const v = szavak(valasz);
  let tol = 0;
  for (const r of reszek) {
    const i = sorozatKeres(v, r, tol);
    if (i < 0) return false;
    tol = i + r.length;
  }
  return true;
}

// ══════════════════════════════════════════════════════
// PONTOZÁS
// Tiszta függvények: a javító nézet (3. fázis) a tanári felülírás után
// ugyanezekkel számol újra.
// ══════════════════════════════════════════════════════

function elemErtek(kulcsElem, statusz, reszpont) {
  if (statusz === "megvan") return kulcsElem.pont;
  if (statusz === "reszben") return kulcsElem.pont * reszpont;
  return 0;
}

/**
 * Sorrendtípusú kérdésnél mely elemek érnek pontot.
 *
 * A mintában a diák sorrendje a kulcs sorszámaival 1, 5, 2, 3 volt:
 *   nem_szamit → mind a 4 megtalált elem
 *   relativ    → a leghosszabb helyes sorrendű részsorozat: 1, 2, 3
 *   pozicio    → csak ami pontosan a helyén van: 1
 *
 * Relatív módban az elemek pontja eltérhet (részpont), ezért nem a
 * leghosszabb, hanem a legtöbbet érő növekvő részsorozatot keressük.
 *
 * @param {Array<{id, pont}>} kulcsElemek a helyes sorrendben
 * @param {Map<string, {statusz, pozicio}>} allapot elemenként
 * @returns {Set<string>} a pontot érő elemek id-i
 */
function sorrendPontozas(kulcsElemek, allapot, mod, reszpont = ALAP_BEALLITAS.reszpont) {
  const talalt = kulcsElemek
    .map((ke, i) => ({ ke, hely: i + 1, a: allapot.get(ke.id) }))
    .filter(({ a }) => a && (a.statusz === "megvan" || a.statusz === "reszben"));

  if (mod === "nem_szamit") return new Set(talalt.map(({ ke }) => ke.id));

  // Pozíció nélkül nem lehet sorrendet ítélni – az ilyen elem nem jár.
  const helyezett = talalt.filter(({ a }) => Number.isInteger(a.pozicio) && a.pozicio > 0);

  if (mod === "pozicio") {
    return new Set(helyezett.filter(({ hely, a }) => a.pozicio === hely).map(({ ke }) => ke.id));
  }

  // relativ: súlyozott leghosszabb növekvő részsorozat, O(n²) – n kicsi.
  const sor = [...helyezett].sort((x, y) => x.a.pozicio - y.a.pozicio);
  const ertek = sor.map(({ ke, a }) => elemErtek(ke, a.statusz, reszpont));
  const legjobb = ertek.slice();
  const elozo = sor.map(() => -1);
  for (let i = 0; i < sor.length; i++) {
    for (let j = 0; j < i; j++) {
      if (sor[j].hely < sor[i].hely
          && sor[j].a.pozicio < sor[i].a.pozicio
          && legjobb[j] + ertek[i] > legjobb[i]) {
        legjobb[i] = legjobb[j] + ertek[i];
        elozo[i] = j;
      }
    }
  }
  const ids = new Set();
  let i = legjobb.reduce((m, v, k) => (v > (legjobb[m] ?? -1) ? k : m), -1);
  while (i >= 0) {
    ids.add(sor[i].ke.id);
    i = elozo[i];
  }
  return ids;
}

/**
 * Egy kérdés pontszáma a (már ellenőrzött vagy tanár által felülírt)
 * elemstátuszokból.
 *
 * @param {object} kerdes a kulcs kérdése (kulcsEllenorzes után)
 * @param {{elemek, kulcson_kivul, valasztott_ag}} eredmeny
 */
function kerdesPontozas(kerdes, eredmeny) {
  const b = { ...ALAP_BEALLITAS, ...(kerdes.beallitas || {}) };

  let kulcsElemek = kerdes.elemek || [];
  let valasztottAg = null;
  if (kerdes.tipus === "valasztos") {
    const ag = (kerdes.agak || []).find((a) => a.id === eredmeny?.valasztott_ag);
    kulcsElemek = ag ? ag.elemek : [];
    valasztottAg = ag ? ag.id : null;
  }

  const allapot = new Map((eredmeny?.elemek || []).map((e) => [e.id, e]));

  const jarnak = kerdes.tipus === "sorrend"
    ? sorrendPontozas(kulcsElemek, allapot, b.sorrend, b.reszpont)
    : null;

  const elemek = kulcsElemek.map((ke) => {
    const statusz = allapot.get(ke.id)?.statusz;
    const pont = !jarnak || jarnak.has(ke.id) ? elemErtek(ke, statusz, b.reszpont) : 0;
    return { id: ke.id, pont: kerekit(pont) };
  });

  // Nyílt felsorolásnál a kulcson kívüli, de elfogadott tétel is ér.
  // Az 'elfogadva' mezőt az értékelés-összeállítás (vagy a tanár) állítja.
  const kulcsonKivulPont = kerdes.tipus === "nyilt_felsorolas"
    ? (eredmeny?.kulcson_kivul || []).filter((t) => t.elfogadva === true).length
      * KULCSON_KIVULI_TETEL_PONT
    : 0;

  const osszeg = elemek.reduce((s, e) => s + e.pont, 0) + kulcsonKivulPont;
  return {
    pont: kerekit(Math.min(osszeg, kerdes.max_pont)),
    max: kerdes.max_pont,
    elemek,
    kulcson_kivul_pont: kulcsonKivulPont,
    valasztott_ag: valasztottAg
  };
}

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

// ══════════════════════════════════════════════════════
// MEGOLDÓKULCS
// ══════════════════════════════════════════════════════

/**
 * A kulcs-hiba két arcot visel:
 *   - `message`: magyar szöveg (a szerver naplója, a magyar felület),
 *   - `kod` + `parameterek`: géppel olvasható, hogy a kliens a SAJÁT
 *     nyelvén jeleníthesse meg (public/js/i18n-*.js, "kulcshiba.<kod>").
 * Új hibakódnál mindkét szótárba fel kell venni a szöveget – a
 * tests/i18n.test.mjs ellenőrzi.
 *
 * A paraméterek közös része: `kerdes` (a kérdés sorszáma, vagy ha az
 * hiányzik, a sora), és ha ágon belüli a hiba, `ag` (az ág azonosítója).
 */
const kulcsHely = (p) => `${p.kerdes}. kérdés${p.ag ? `, ${p.ag} ág` : ""}`;

const KULCS_HIBA_HU = {
  nincs_elem: (p) => `${kulcsHely(p)}: nincs egy elem sem.`,
  tul_sok_elem: (p) => `${kulcsHely(p)}: túl sok elem.`,
  hianyzo_elem_azonosito: (p) => `${kulcsHely(p)}, ${p.elem}. elem: hiányzó azonosító.`,
  ismetlodo_elem_azonosito: (p) => `${kulcsHely(p)}: ismétlődő elemazonosító (${p.id}).`,
  ures_allitas: (p) => `${kulcsHely(p)}, ${p.id}: üres állítás.`,
  ervenytelen_pont: (p) => `${kulcsHely(p)}, ${p.id}: érvénytelen pont.`,
  ismeretlen_sorrend_mod: (p) => `${kulcsHely(p)}: ismeretlen sorrend-mód.`,
  ismeretlen_szakszo_mod: (p) => `${kulcsHely(p)}: ismeretlen szakszó-mód.`,
  ismeretlen_kulcson_kivul_mod: (p) => `${kulcsHely(p)}: ismeretlen kulcson kívüli mód.`,
  reszpont_hatar: (p) => `${kulcsHely(p)}: a részpont 0 és 1 között lehet.`,
  nincs_kerdes: () => "nincs egy kérdés sem.",
  tul_sok_kerdes: () => "túl sok kérdés.",
  hianyzo_sorszam: (p) => `${kulcsHely(p)}: hiányzó sorszám.`,
  ismetlodo_sorszam: (p) => `ismétlődő sorszám (${p.sorszam}).`,
  ismeretlen_tipus: (p) => `${kulcsHely(p)}: ismeretlen típus.`,
  ervenytelen_max_pont: (p) => `${kulcsHely(p)}: érvénytelen max pont.`,
  nincs_ag: (p) => `${kulcsHely(p)}: nincs választható ág.`,
  hianyzo_ag_azonosito: (p) => `${kulcsHely(p)}, ${p.ag_sor}. ág: hiányzó azonosító.`,
  ismetlodo_ag_azonosito: (p) => `${kulcsHely(p)}: ismétlődő ágazonosító (${p.id}).`
};

function hiba(kod, p = {}) {
  const e = new Error(`Hibás megoldókulcs: ${KULCS_HIBA_HU[kod](p)}`);
  e.kod = kod;
  e.parameterek = p;
  e.kulcsHiba = true;   // a szerver ebből tudja: details.kod = "kulcshiba"
  return e;
}

function elemekEllenorzese(nyers, hol) {
  if (!Array.isArray(nyers) || nyers.length === 0) throw hiba("nincs_elem", hol);
  if (nyers.length > ELEM_MAX) throw hiba("tul_sok_elem", hol);
  const idk = new Set();
  return nyers.map((e, i) => {
    const id = String(e?.id ?? "").trim();
    if (!id) throw hiba("hianyzo_elem_azonosito", { ...hol, elem: i + 1 });
    if (idk.has(id)) throw hiba("ismetlodo_elem_azonosito", { ...hol, id });
    idk.add(id);
    const allitas = String(e.allitas ?? "").trim();
    if (!allitas) throw hiba("ures_allitas", { ...hol, id });
    const pont = Number(e.pont);
    if (!Number.isFinite(pont) || pont < 0) throw hiba("ervenytelen_pont", { ...hol, id });
    return {
      id,
      allitas,
      pont,
      elfogadhato: (Array.isArray(e.elfogadhato) ? e.elfogadhato : [])
        .map((x) => String(x).trim()).filter(Boolean),
      // tananyag / altalanos: az AI vázlatából; tanar: kézzel felvett elem
      forras: ["tananyag", "tanar"].includes(e.forras) ? e.forras : "altalanos",
      ellenorizendo: e.ellenorizendo === true
    };
  });
}

function beallitasEllenorzes(nyers, hol) {
  const b = { ...ALAP_BEALLITAS, ...(nyers || {}) };
  if (!SORREND_MODOK.includes(b.sorrend)) throw hiba("ismeretlen_sorrend_mod", hol);
  if (!SZAKSZO_MODOK.includes(b.szakszo)) throw hiba("ismeretlen_szakszo_mod", hol);
  if (!KULCSON_KIVUL_MODOK.includes(b.kulcson_kivul)) throw hiba("ismeretlen_kulcson_kivul_mod", hol);
  const reszpont = Number(b.reszpont);
  if (!Number.isFinite(reszpont) || reszpont < 0 || reszpont > 1) {
    throw hiba("reszpont_hatar", hol);
  }
  return { sorrend: b.sorrend, szakszo: b.szakszo, reszpont, kulcson_kivul: b.kulcson_kivul };
}

/**
 * A kulcs ellenőrzése és egységes alakra hozása. A Function minden
 * használat előtt ezen engedi át – a kulcsot a tanár kliensről is
 * szerkeszti, a szabályok pedig a belső szerkezetet nem ellenőrzik.
 *
 * @throws {Error} olvasható üzenettel, ha a kulcs nem használható
 */
function kulcsEllenorzes(kulcs) {
  const nyers = kulcs?.kerdesek;
  if (!Array.isArray(nyers) || nyers.length === 0) throw hiba("nincs_kerdes");
  if (nyers.length > KERDES_MAX) throw hiba("tul_sok_kerdes");

  const sorszamok = new Set();
  const kerdesek = nyers.map((k, i) => {
    const sorszam = String(k?.sorszam ?? "").trim();
    const hol = { kerdes: sorszam || i + 1 };
    if (!sorszam) throw hiba("hianyzo_sorszam", { kerdes: i + 1 });
    if (sorszamok.has(sorszam)) throw hiba("ismetlodo_sorszam", { sorszam });
    sorszamok.add(sorszam);

    if (!KERDES_TIPUSOK.includes(k.tipus)) throw hiba("ismeretlen_tipus", hol);
    const maxPont = Number(k.max_pont);
    if (!Number.isFinite(maxPont) || maxPont <= 0) throw hiba("ervenytelen_max_pont", hol);

    let elemek = [];
    let agak = null;
    if (k.tipus === "valasztos") {
      if (!Array.isArray(k.agak) || k.agak.length === 0) throw hiba("nincs_ag", hol);
      const agIdk = new Set();
      agak = k.agak.map((a, j) => {
        const id = String(a?.id ?? "").trim();
        if (!id) throw hiba("hianyzo_ag_azonosito", { ...hol, ag_sor: j + 1 });
        if (agIdk.has(id)) throw hiba("ismetlodo_ag_azonosito", { ...hol, id });
        agIdk.add(id);
        return {
          id,
          cim: String(a.cim ?? "").trim() || id,
          elemek: elemekEllenorzese(a.elemek, { ...hol, ag: id })
        };
      });
    } else {
      elemek = elemekEllenorzese(k.elemek, hol);
    }

    return {
      sorszam,
      szoveg: String(k.szoveg ?? "").trim(),
      tipus: k.tipus,
      max_pont: maxPont,
      elemek,
      agak,
      beallitas: beallitasEllenorzes(k.beallitas, hol),
      megjegyzes: String(k.megjegyzes ?? "").trim()
    };
  });

  return { kerdesek };
}

/**
 * Szószedet az átíráshoz: a kulcs szakszavai. Nem megoldókulcs – az
 * átíró csak olvasási segítségnek kapja, hogy egy nehezen olvasható
 * szakszót jól ismerjen fel.
 */
function szoszedetGyujtes(kulcs) {
  const lista = [];
  const lat = new Set();
  const felvesz = (s) => {
    const t = String(s ?? "").trim();
    const k = t.toLowerCase();
    if (t && !lat.has(k) && lista.length < SZOSZEDET_MAX) {
      lat.add(k);
      lista.push(t);
    }
  };
  for (const k of kulcs.kerdesek || []) {
    const elemek = [...(k.elemek || []), ...(k.agak || []).flatMap((a) => a.elemek || [])];
    for (const e of elemek) {
      felvesz(e.allitas);
      (e.elfogadhato || []).forEach(felvesz);
    }
  }
  return lista;
}

// ══════════════════════════════════════════════════════
// ÁTIRAT
// ══════════════════════════════════════════════════════

/**
 * Kérdésenkénti válaszszövegek az idézet-ellenőrzéshez. Táblázatnál a
 * cellák is ide kerülnek, mert az idézet cellából is jöhet.
 *
 * @returns {Map<string, string>} sorszám → válasz
 */
function valaszSzovegek(atiras) {
  const m = new Map();
  const hozzaad = (kerdes, szoveg) => {
    const k = String(kerdes ?? "").trim();
    const s = String(szoveg ?? "").trim();
    if (!k || !s) return;
    m.set(k, m.has(k) ? `${m.get(k)}\n${s}` : s);
  };
  for (const v of atiras?.valaszok || []) hozzaad(v.kerdes, v.valasz);
  for (const t of atiras?.tablazatok || []) {
    for (const c of t.cellak || []) hozzaad(t.kerdes, c.ertek);
  }
  return m;
}

/**
 * Összefűzött átirat – a mostani felület (javítás, visszajelzés) egyetlen
 * szövegként mutatja, és ez kifejtős módban is így maradhat.
 */
function atiratOsszefuzes(atiras) {
  const sorok = [];
  for (const v of atiras?.valaszok || []) {
    sorok.push(`${v.kerdes}. ${String(v.valasz ?? "").trim()}`);
  }
  for (const t of atiras?.tablazatok || []) {
    sorok.push(`${t.kerdes}. (táblázat)`);
    for (const c of t.cellak || []) {
      sorok.push(`   ${c.sor} | ${c.oszlop}: ${String(c.ertek ?? "").trim()}`);
    }
  }
  return sorok.join("\n").trim();
}

// ══════════════════════════════════════════════════════
// ÉRTÉKELÉS ÖSSZEÁLLÍTÁSA
// Az AI státuszaiból → ellenőrzött elemek → pontok → jegyjavaslat.
// ══════════════════════════════════════════════════════

/** Egy AI-elem ellenőrzése: idézet nélkül nincs pont. */
function elemEllenorzes(kulcsElem, aiElem, valasz) {
  const aiStatusz = ELEM_STATUSZOK.includes(aiElem?.statusz) ? aiElem.statusz : "hianyzik";
  const idezet = String(aiElem?.idezet ?? "").trim() || null;
  const pozicio = Number.isInteger(aiElem?.pozicio) && aiElem.pozicio > 0 ? aiElem.pozicio : null;

  if (aiStatusz === "hianyzik") {
    return { id: kulcsElem.id, statusz: "hianyzik", ai_statusz: aiStatusz, idezet: null, pozicio: null, idezet_ok: null };
  }

  // A téves állítás is idézethez kötött: e nélkül a diák olyan tévedésért
  // kapna jelzést, amit le sem írt.
  const idezetOk = idezetEllenorzes(idezet, valasz);
  return {
    id: kulcsElem.id,
    statusz: idezetOk ? aiStatusz : "hianyzik",
    ai_statusz: aiStatusz,
    idezet,
    pozicio,
    idezet_ok: idezetOk
  };
}

/**
 * A teljes kifejtős értékelés az AI válaszából.
 *
 * @param {object} kulcs kulcsEllenorzes() kimenete
 * @param {object} ai az értékelő modell válasza (KIFEJTOS_ERTEKELES_SCHEMA)
 * @param {Map<string,string>} valaszok valaszSzovegek() kimenete
 * @param {object} [skala] jegyskála (skalaFeloldas) vagy a régi ponthatárok
 */
function kifejtosErtekelesOsszeallitas(kulcs, ai, valaszok, skala) {
  const aiKerdesek = new Map(
    (ai?.kerdesek || []).map((k) => [String(k.sorszam ?? "").trim(), k])
  );
  const figyelmeztetesek = [];

  const kerdesek = kulcs.kerdesek.map((kk) => {
    const ak = aiKerdesek.get(kk.sorszam);
    const valasz = valaszok.get(kk.sorszam) || "";
    if (!ak) figyelmeztetesek.push({ kerdes: kk.sorszam, tipus: "nincs_ertekeles" });

    let kulcsElemek = kk.elemek;
    let valasztottAg = null;
    if (kk.tipus === "valasztos") {
      const ag = kk.agak.find((a) => a.id === String(ak?.valasztott_ag ?? "").trim());
      if (ak && !ag && valasz) figyelmeztetesek.push({ kerdes: kk.sorszam, tipus: "ismeretlen_ag" });
      kulcsElemek = ag ? ag.elemek : [];
      valasztottAg = ag ? ag.id : null;
    }

    const aiElemek = new Map((ak?.elemek || []).map((e) => [String(e.id ?? "").trim(), e]));
    const elemek = kulcsElemek.map((ke) => {
      const e = elemEllenorzes(ke, aiElemek.get(ke.id), valasz);
      if (e.idezet_ok === false) {
        figyelmeztetesek.push({ kerdes: kk.sorszam, elem_id: ke.id, tipus: "idezet_nem_talalhato" });
      }
      return e;
    });

    // Kulcson kívüli tételek: csak nyílt felsorolásnál érnek pontot, de
    // máshol is megőrizzük – a tanár látja, mit írt még a diák.
    const kulcsonKivul = (ak?.kulcson_kivul || [])
      .map((t) => {
        const idezet = String(t.idezet ?? "").trim();
        const idezetOk = idezetEllenorzes(idezet, valasz);
        const helyes = t.tartalmilag_helyes === true && idezetOk;
        return {
          idezet,
          tartalmilag_helyes: t.tartalmilag_helyes === true,
          megjegyzes: String(t.megjegyzes ?? "").trim(),
          idezet_ok: idezetOk,
          // null = a tanár dönt; a javító nézetben ez függő tétel.
          elfogadva: !helyes ? false : kk.beallitas.kulcson_kivul === "elfogad" ? true : null
        };
      })
      .filter((t) => t.idezet);

    const p = kerdesPontozas(kk, { elemek, kulcson_kivul: kulcsonKivul, valasztott_ag: valasztottAg });
    const pontok = new Map(p.elemek.map((e) => [e.id, e.pont]));

    return {
      sorszam: kk.sorszam,
      pont: p.pont,
      max: p.max,
      elemek: elemek.map((e) => ({ ...e, pont: pontok.get(e.id) ?? 0 })),
      kulcson_kivul: kulcsonKivul,
      valasztott_ag: valasztottAg,
      visszajelzes: String(ak?.visszajelzes ?? "").trim()
    };
  });

  const osszpontszam = kerekit(kerdesek.reduce((s, k) => s + k.pont, 0));
  const maxPontszam = kerekit(kerdesek.reduce((s, k) => s + k.max, 0));

  // A hibákat az AI adja; a 'tipus' a meglévő osztályszintű elemzés
  // (elemzesAggregalas) miatt kell, ott a kategória a címke.
  const hibak = (ai?.hibak || [])
    .filter((h) => KIFEJTOS_HIBA_KATEGORIAK.includes(h.kategoria))
    .map((h) => ({
      kategoria: h.kategoria,
      tipus: h.kategoria,
      kerdes: String(h.kerdes ?? "").trim(),
      idezet: String(h.idezet ?? "").trim(),
      javaslat: String(h.javaslat ?? "").trim(),
      magyarazat: String(h.magyarazat ?? "").trim()
    }));

  return {
    mod: "kifejtos",
    kerdesek,
    // KOMPATIBILITÁS: a kérdésekből képzett szempontok, hogy a
    // pontozási táblázat és az osztályszintű elemzés változatlanul működjön.
    szempontok: kerdesek.map((k) => ({
      kulcs: `k${k.sorszam}`,
      cim: `${k.sorszam}. kérdés`,
      pont: k.pont,
      max: k.max,
      megjegyzes: k.visszajelzes
    })),
    osszpontszam,
    max_pontszam: maxPontszam,
    szazalek: maxPontszam > 0 ? Math.round((osszpontszam / maxPontszam) * 100) : null,
    javasolt_jegy: jegyJavaslat(osszpontszam, maxPontszam, skala),
    hibak,
    figyelmeztetesek,
    diak_szoveg: String(ai?.diak_szoveg ?? "").trim()
  };
}

// ══════════════════════════════════════════════════════
// A TANÁR JÓVÁHAGYÁSA
// Az AI-értékelés + a tanár felülírásai → amit a diák lát.
// A szerver (visszajelzesJovahagyas) ezzel ír, a javító nézet ezzel mutat
// élő pontszámot – ugyanaz a függvény, tehát nem csúszhatnak el.
// ══════════════════════════════════════════════════════

/**
 * A kliens a PONTOT nem küldheti el, csak elemstátuszt és a kulcson kívüli
 * tételek elfogadását – a pontot mindig ez a függvény számolja a kulcsból.
 *
 * @param {object} kulcs kulcsEllenorzes() kimenete
 * @param {object} ai az ertekeles/ai dokumentum (kifejtős)
 * @param {Array<{sorszam, elemek?: {id, statusz}[], kulcson_kivul?: {index, elfogadva}[]}>} [modositasok]
 * @param {{skala?: object, ponthatarok?: object, helyesLathato?: boolean}} [opciok]
 *   a skála a jegyjavaslathoz; ennek híján a régi ponthatárok
 */
function kifejtosTanariEredmeny(kulcs, ai, modositasok, opciok = {}) {
  const helyesLathato = opciok.helyesLathato !== false;
  const aiKerdesek = new Map((ai?.kerdesek || []).map((k) => [String(k.sorszam), k]));
  const modMap = new Map(
    (Array.isArray(modositasok) ? modositasok : [])
      .filter((m) => m && m.sorszam != null)
      .map((m) => [String(m.sorszam), m])
  );

  const kerdesek = kulcs.kerdesek.map((kk) => {
    const ak = aiKerdesek.get(kk.sorszam) || {};
    const m = modMap.get(kk.sorszam);

    // A kulcs az irány: ha azóta változott, a hiányzó elem "hianyzik".
    const ag = kk.tipus === "valasztos"
      ? (kk.agak || []).find((a) => a.id === ak.valasztott_ag) || null
      : null;
    const kulcsElemek = kk.tipus === "valasztos" ? (ag ? ag.elemek : []) : kk.elemek;

    const aiElemek = new Map((ak.elemek || []).map((e) => [e.id, e]));
    const felulirt = new Map(
      (Array.isArray(m?.elemek) ? m.elemek : [])
        .filter((e) => e && ELEM_STATUSZOK.includes(e.statusz))
        .map((e) => [String(e.id), e.statusz])
    );
    const elemek = kulcsElemek.map((ke) => {
      const a = aiElemek.get(ke.id) || {};
      const statusz = felulirt.get(ke.id) ?? (ELEM_STATUSZOK.includes(a.statusz) ? a.statusz : "hianyzik");
      return {
        id: ke.id,
        allitas: ke.allitas,
        statusz,
        idezet: statusz === "hianyzik" ? null : (a.idezet_ok ? a.idezet : null),
        pozicio: Number.isInteger(a.pozicio) ? a.pozicio : null,
        tanar_modositotta: felulirt.has(ke.id) && felulirt.get(ke.id) !== a.statusz
      };
    });

    const elfogadas = new Map(
      (Array.isArray(m?.kulcson_kivul) ? m.kulcson_kivul : [])
        .filter((t) => t && Number.isInteger(t.index) && typeof t.elfogadva === "boolean")
        .map((t) => [t.index, t.elfogadva])
    );
    const kulcsonKivul = (ak.kulcson_kivul || []).map((t, i) => ({
      idezet: t.idezet,
      elfogadva: elfogadas.has(i) ? elfogadas.get(i) : (t.elfogadva ?? null)
    }));

    const p = kerdesPontozas(kk, { elemek, kulcson_kivul: kulcsonKivul, valasztott_ag: ag ? ag.id : null });
    const pontok = new Map(p.elemek.map((e) => [e.id, e.pont]));

    // Sorrendnél egy leírt, jó lépés is érhet 0 pontot, ha nincs a helyén.
    // Ezt ki kell mondani – különben a diák egy ✓ mellett 0 pontot lát.
    const sorrendSzamit = kk.tipus === "sorrend" && kk.beallitas.sorrend !== "nem_szamit";
    const kulcsElemMap = new Map(kulcsElemek.map((ke) => [ke.id, ke]));

    return {
      sorszam: kk.sorszam,
      szoveg: kk.szoveg,
      pont: p.pont,
      max: p.max,
      valasztott: ag ? ag.cim : null,
      ...(sorrendSzamit ? { sorrend: kk.beallitas.sorrend } : {}),
      elemek: elemek.map((e) => {
        const ki = { id: e.id, statusz: e.statusz, idezet: e.idezet, pont: pontok.get(e.id) ?? 0 };
        // Csak ha a sorrend vitte el a pontot, nem a részpont-szabály.
        if (sorrendSzamit && ki.pont === 0
            && elemErtek(kulcsElemMap.get(e.id), e.statusz, kk.beallitas.reszpont) > 0) {
          ki.rossz_helyen = true;
        }
        if (e.tanar_modositotta) ki.tanar_modositotta = true;
        // A helyes válasz csak akkor megy ki, ha a tanár engedi (újra
        // felhasznált dolgozatnál a megoldás kiszivároghatna).
        if (helyesLathato) ki.allitas = e.allitas;
        return ki;
      }),
      kulcson_kivul: kulcsonKivul.filter((t) => t.idezet)
    };
  });

  const osszpontszam = kerekit(kerdesek.reduce((s, k) => s + k.pont, 0));
  const maxPontszam = kerekit(kerdesek.reduce((s, k) => s + k.max, 0));

  return {
    mod: "kifejtos",
    helyes_valaszok_lathatok: helyesLathato,
    kerdesek,
    // KOMPATIBILITÁS: a javítási sor és az osztályszintű elemzés szempontokat vár
    szempontok: kerdesek.map((k) => ({
      kulcs: `k${k.sorszam}`, cim: `${k.sorszam}. kérdés`, pont: k.pont, max: k.max, megjegyzes: ""
    })),
    osszpontszam,
    max_pontszam: maxPontszam,
    szazalek: maxPontszam > 0 ? Math.round((osszpontszam / maxPontszam) * 100) : null,
    javasolt_jegy: jegyJavaslat(osszpontszam, maxPontszam, opciok.skala || opciok.ponthatarok)
  };
}

// ══════════════════════════════════════════════════════
// OSZTÁLYSZINTŰ ELEMZÉS (4. fázis)
// A számokat a kód számolja – a modell csak értelmez.
// ══════════════════════════════════════════════════════

/** A "legtöbben kihagyták" listába ennyi elem kerül legfeljebb. */
const KIHAGYOTT_MAX = 10;

/**
 * Ennél ritkább hiány nem kerül a listára: 5 diákból 1 kihagyás egyéni
 * hiba, nem az osztály hiánya – csak zaj lenne a tanárnak.
 */
const KIHAGYOTT_MIN_SZAZALEK = 25;

/**
 * Kérdésenkénti és elemenkénti összesítés egy feladat értékeléseiből.
 *
 * Minden értékelésnél az számít, amit a DIÁK kapott: ha a tanár már
 * jóváhagyta, a tanári dokumentum kérdései (a felülírásokkal), különben
 * az AI-é. Ezt a hívó dönti el – itt csak `kerdesek` kell.
 *
 * Választós kérdésnél egy ág elemeit csak az számolja, aki azt választotta:
 * a `db` mindig azt mondja meg, hány diáknál volt egyáltalán értelme az
 * elemnek.
 *
 * @param {object} kulcs kulcsEllenorzes() kimenete
 * @param {Array<{kerdesek: Array<{sorszam, pont, max, elemek: {id, statusz, rossz_helyen?}[]}>}>} ertekelesek
 */
function kifejtosAggregalas(kulcs, ertekelesek) {
  const kerdesek = kulcs.kerdesek.map((kk) => {
    const elemek = [...kk.elemek, ...(kk.agak || []).flatMap((a) => a.elemek)];
    const agCim = new Map((kk.agak || []).flatMap((a) => a.elemek.map((e) => [e.id, a.cim])));
    const szamlalo = new Map(elemek.map((e) => [e.id, {
      id: e.id, allitas: e.allitas, ag: agCim.get(e.id) || null,
      db: 0, megvan: 0, reszben: 0, hianyzik: 0, teves: 0, rossz_helyen: 0
    }]));

    let pont = 0, max = 0, db = 0;
    for (const ert of ertekelesek) {
      const k = (ert.kerdesek || []).find((x) => String(x.sorszam) === kk.sorszam);
      if (!k) continue;
      db++;
      pont += Number(k.pont) || 0;
      max += Number(k.max) || 0;
      for (const e of k.elemek || []) {
        const s = szamlalo.get(e.id);
        if (!s || !ELEM_STATUSZOK.includes(e.statusz)) continue;
        s.db++;
        s[e.statusz]++;
        if (e.rossz_helyen) s.rossz_helyen++;
      }
    }

    return {
      sorszam: kk.sorszam,
      szoveg: kk.szoveg,
      ertekelt_db: db,
      atlag_pont: db ? Math.round((pont / db) * 10) / 10 : null,
      max_pont: kk.max_pont,
      szazalek: max > 0 ? Math.round((pont / max) * 100) : null,
      elemek: [...szamlalo.values()].map((s) => ({
        ...s,
        // A téves is hiány: a diák nem tudta a helyeset.
        hiany_szazalek: s.db ? Math.round(((s.hianyzik + s.teves) / s.db) * 100) : null
      }))
    };
  });

  const kihagyott = kerdesek
    .flatMap((k) => k.elemek
      .filter((e) => e.db > 0 && e.hianyzik + e.teves > 0 && e.hiany_szazalek >= KIHAGYOTT_MIN_SZAZALEK)
      .map((e) => ({ sorszam: k.sorszam, ...e })))
    .sort((a, b) => (b.hiany_szazalek - a.hiany_szazalek) || (b.teves - a.teves))
    .slice(0, KIHAGYOTT_MAX);

  return {
    // A legrosszabbul sikerült kérdés elöl – ez a tanár első kérdése
    kerdesek: [...kerdesek].sort((a, b) => (a.szazalek ?? 101) - (b.szazalek ?? 101)),
    kihagyott
  };
}

const KIFEJTOS_ELEMZES_SCHEMA = {
  type: "object",
  properties: {
    osszegzes: { type: "string" },
    tipushibak: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cim: { type: "string" },
          kategoria: { type: "string", enum: KIFEJTOS_HIBA_KATEGORIAK },
          gyakorisag: { type: "string", enum: ["általános", "gyakori", "szórványos"] },
          magyarazat: { type: "string" },
          peldak: { type: "array", items: { type: "string" } }
        },
        required: ["cim", "kategoria", "gyakorisag", "magyarazat", "peldak"]
      }
    },
    gyakorlatok: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cim: { type: "string" },
          cel: { type: "string" },
          leiras: { type: "string" },
          idotartam_perc: { type: "integer" }
        },
        required: ["cim", "cel", "leiras", "idotartam_perc"]
      }
    },
    generalo_prompt: { type: "string" }
  },
  required: ["osszegzes", "tipushibak", "gyakorlatok", "generalo_prompt"]
};

/** Legfeljebb ennyi konkrét hiba megy a modellhez – token-költség miatt. */
const ELEMZES_HIBA_MAX = 150;

/**
 * Az osztályszintű elemzés promptja kifejtős dolgozatra. A nyelvi
 * változattal (index.js → elemzesPrompt) szemben itt nincsenek nyelvtani
 * címkék: a kérdés az, mely TARTALMAK nem ültek.
 *
 * @param {object} feladat a feladat dokumentum
 * @param {{ertekelt_db, atlag_szazalek}} alap az általános számok
 * @param {ReturnType<typeof kifejtosAggregalas>} kf a kérdés- és elemstatisztika
 * @param {Array<{kategoria, kerdes, idezet, javaslat}>} hibak az AI által talált tartalmi hibák
 */
function kifejtosElemzesPrompt(feladat, alap, kf, hibak) {
  const tantargy = tantargya(feladat.rubrika);
  const kim = kimenet(feladat.rubrika);

  const kerdesLista = kf.kerdesek
    .map((k) => `- ${k.sorszam}. kérdés${k.szoveg ? ` (${k.szoveg})` : ""}: ` +
      `${k.atlag_pont ?? "–"}/${k.max_pont} pont átlagosan, ${k.szazalek ?? "–"}%`)
    .join("\n");

  const kihagyottLista = kf.kihagyott
    .map((e) => `- ${e.sorszam}. kérdés – "${e.allitas}"${e.ag ? ` (${e.ag})` : ""}: ` +
      `${e.hianyzik} diáknál hiányzik${e.teves ? `, ${e.teves} diáknál téves` : ""} (${e.db} diákból)`)
    .join("\n");

  const hibaLista = hibak.slice(0, ELEMZES_HIBA_MAX)
    .map((h) => `- [${h.kategoria}] ${h.kerdes ? `${h.kerdes}. kérdés: ` : ""}"${h.idezet}"` +
      `${h.javaslat ? ` → "${h.javaslat}"` : ""}`)
    .join("\n");

  return `${persona(tantargy)} Egy osztály kifejtős dolgozatának összesített
eredményét kapod, és a tanárnak kell segítened: mit érdemes órán újra venni.

# A FELADAT
Cím: ${feladat.cim || "nincs megadva"}
${tantargy ? `Tantárgy: ${tantargy}\n` : ""}
# OSZTÁLYSZINTŰ SZÁMOK
Kiértékelt dolgozat: ${alap.ertekelt_db}
Osztályátlag: ${alap.atlag_szazalek != null ? alap.atlag_szazalek + "%" : "nincs adat"}

Kérdésenként (a legrosszabb elöl):
${kerdesLista || "- nincs adat"}

# AMIT A LEGTÖBBEN KIHAGYTAK VAGY ELRONTOTTAK
Ezt a rendszer számolta a megoldókulcs elemeiből – pontos, ne kérdőjelezd meg.
${kihagyottLista || "- nincs ilyen: minden elem a diákok többségénél megvolt"}

# TARTALMI HIBÁK (minta, a javító AI jelölte)
${hibaLista || "- nincs adat"}

# UTASÍTÁSOK
1. "osszegzes": 2-3 bekezdés a tanárnak, ${kim.hatarozo}. Mi ült jól, és mely
   fogalmak, tananyagrészek hiányoznak rendszerszinten? Keress mintát: egy
   egész témakör hiányzik, vagy csak a szakszóhasználat pontatlan, vagy
   egy tipikus tévhit terjed? Ne ismételd a számokat – ÉRTELMEZD őket.
2. "tipushibak": a közös tartalmi hiányok és tévedések, a JELENTÉS szerint
   összevonva, a legfontosabbal kezdve, legfeljebb 6. A "cim" ${kim.hatarozo},
   közérthetően (pl. "A beszerzés szakaszainak sorrendje"). A "peldak" a
   fenti hibákból vett SZÓ SZERINTI diákidézetek – ha egy hiányhoz nincs
   idézet, a hiányzó elemet nevezd meg.
   A "gyakorisag": "általános" ha a diákok többségét érinti, "gyakori" ha
   jelentős részét, "szórványos" ha csak néhányat.
3. "gyakorlatok": 3-5 konkrét, órán használható ismétlő tevékenység a
   legnagyobb hiányokra. A "leiras" legyen annyira konkrét, hogy a tanár
   holnap be tudja vinni: mit csinálnak a diákok, milyen formában, mennyi ideig.
4. "generalo_prompt": egy KÉSZ, önmagában is használható prompt, amit a
   tanár bemásolhat egy AI-ba, hogy ismétlő feladatsort generáljon pontosan
   ezekre a hiányokra. Tartalmazza a tantárgyat, a hiányzó fogalmakat és
   tévhiteket, és kérjen rövid kifejtős kérdéseket megoldókulccsal.

Ha 3-nál kevesebb kiértékelt dolgozat van, az "osszegzes" ELSŐ mondatában
jelezd, hogy ez még nem osztályszintű kép.`;
}

// ══════════════════════════════════════════════════════
// JSON SÉMÁK
// ══════════════════════════════════════════════════════

/** Kézírás → kérdésenkénti válaszok. */
const KIFEJTOS_ATIRAT_SCHEMA = {
  type: "object",
  properties: {
    valaszok: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kerdes: { type: "string" },
          valasz: { type: "string" },
          bizonytalan: { type: "array", items: { type: "string" } }
        },
        required: ["kerdes", "valasz"]
      }
    },
    tablazatok: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kerdes: { type: "string" },
          cellak: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sor: { type: "string" },
                oszlop: { type: "string" },
                ertek: { type: "string" }
              },
              required: ["sor", "oszlop", "ertek"]
            }
          }
        },
        required: ["kerdes", "cellak"]
      }
    },
    olvashatosag: { type: "string", enum: ["jo", "kozepes", "gyenge"] },
    megjegyzes: { type: "string" }
  },
  required: ["valaszok", "olvashatosag"]
};

/**
 * Válaszok + kulcs → elemstátuszok. PONT MEZŐ SZÁNDÉKOSAN NINCS: ha lenne,
 * a modell kitöltené, és kísértés lenne használni.
 */
const KIFEJTOS_ERTEKELES_SCHEMA = {
  type: "object",
  properties: {
    kerdesek: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sorszam: { type: "string" },
          valasztott_ag: { type: "string" },
          elemek: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                statusz: { type: "string", enum: ELEM_STATUSZOK },
                idezet: { type: "string" },
                pozicio: { type: "integer" }
              },
              required: ["id", "statusz"]
            }
          },
          kulcson_kivul: {
            type: "array",
            items: {
              type: "object",
              properties: {
                idezet: { type: "string" },
                tartalmilag_helyes: { type: "boolean" },
                megjegyzes: { type: "string" }
              },
              required: ["idezet", "tartalmilag_helyes", "megjegyzes"]
            }
          },
          visszajelzes: { type: "string" }
        },
        required: ["sorszam", "elemek", "visszajelzes"]
      }
    },
    hibak: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kategoria: { type: "string", enum: KIFEJTOS_HIBA_KATEGORIAK },
          kerdes: { type: "string" },
          idezet: { type: "string" },
          javaslat: { type: "string" },
          magyarazat: { type: "string" }
        },
        required: ["kategoria", "kerdes", "idezet", "javaslat", "magyarazat"]
      }
    },
    diak_szoveg: { type: "string" }
  },
  required: ["kerdesek", "hibak", "diak_szoveg"]
};

// ══════════════════════════════════════════════════════
// PROMPTOK
// ══════════════════════════════════════════════════════

function tantargya(rubrika) {
  const t = String(rubrika?.tantargy ?? "").trim().slice(0, 60);
  return t || null;
}

/** "Te egy tapasztalt tanár vagy." – tantárggyal, ha van. */
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

function persona(tantargy) {
  return tantargy
    ? `Te egy tapasztalt tanár vagy, a tantárgy: ${tantargy}.`
    : "Te egy tapasztalt tanár vagy.";
}

/**
 * Átírás, kifejtős változat. A próbán ez bizonyult a legjobbnak (C):
 * kérdésenkénti kimenet, tanári jelölések kiszűrve, szószedettel – a
 * csali szakszavak egyszer sem kerültek be az átiratba.
 */
function kifejtosAtiratPrompt(kulcs, szoszedet) {
  const kerdesLista = kulcs.kerdesek
    .map((k) => `- ${k.sorszam}.${k.szoveg ? ` ${k.szoveg}` : ""}${k.tipus === "tablazat" ? " (TÁBLÁZAT)" : ""}`)
    .join("\n");

  const szoszedetResz = szoszedet.length
    ? `
# SZÓSZEDET – CSAK OLVASÁSI SEGÍTSÉG
Ezek a kifejezések előfordulhatnak a dolgozatban. Ha egy nehezen olvasható
szó ezek egyikének látszik, így írd. FIGYELEM: ez NEM megoldókulcs. Soha
ne írj be olyan szót, ami nincs a lapon, és ne egészítsd ki a diák
válaszát – attól, hogy egy szó a listán van, a diák nem feltétlenül írta le.
${szoszedet.map((s) => `- ${s}`).join("\n")}
`
    : "";

  return `Te egy pontos átíró vagy. A képeken egy diák kézzel írt
dolgozata látható (egy nyomtatott feladatlap, a diák válaszaival).

# A KÉRDÉSEK
${kerdesLista}

# FELADAT
Írd át a diák válaszait KÉRDÉSENKÉNT, SZÓ SZERINT.
- A "kerdes" mező a kérdés sorszáma legyen, pontosan a fenti alakban.
- A nyomtatott kérdésszöveget NE írd a válaszba – csak azt, amit a diák írt.
- Ha egy válasz máshol folytatódik (lap alján, hátoldalon, nyíllal
  jelölve), fűzd a saját kérdéséhez.
- TÁBLÁZATOS kérdésnél a "tablazatok" tömbbe írd, cellánként: a sor és
  az oszlop a nyomtatott fejléc szövege, az "ertek" a diák beírása.
- Az áthúzott szöveget hagyd ki.
- Ha a szöveg a kép szélén le van vágva, a hiányzó részt jelöld így: [...]
- A TANÁRI JELÖLÉSEKET hagyd figyelmen kívül: pontszámok, pipák, aláhúzások,
  margójegyzetek, piros vagy más színű javítások. Csak a diák írását írd át.
- NE javítsd a hibákat: a helyesírási és nyelvtani hibákat is add vissza.
- Olvashatatlan szó: [?]. Bizonytalan szó: a legjobb tipp, utána [?], és
  vedd fel a "bizonytalan" tömbbe is.
- Ha egy kérdésre nincs válasz, hagyd ki.
${szoszedetResz}
Az olvashatosag mezőben értékeld, mennyire volt olvasható a kézírás.`;
}

function elemSor(e) {
  const tovabbi = e.elfogadhato.length ? ` (elfogadható még: ${e.elfogadhato.join("; ")})` : "";
  return `    - [${e.id}] ${e.allitas}${tovabbi}`;
}

function kerdesLeiras(k) {
  const fej = `## ${k.sorszam}. kérdés${k.szoveg ? `: ${k.szoveg}` : ""}\nTípus: ${k.tipus}`;
  const szigor = k.beallitas.szakszo === "pontos"
    ? "Szakszóhasználat: PONTOS – ha a diák nem a pontos szakkifejezést írja (pl. csak egy részét, vagy köznyelvi megfelelőt), az elem \"reszben\"."
    : "Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is \"megvan\".";

  let torzs;
  if (k.tipus === "valasztos") {
    torzs = `A diák EGY ágat választ – a "valasztott_ag" mezőbe annak az azonosítóját írd,
és csak annak az elemeit értékeld.
${k.agak.map((a) => `  Ág [${a.id}] ${a.cim}:\n${a.elemek.map(elemSor).join("\n")}`).join("\n")}`;
  } else {
    torzs = `Elemek:\n${k.elemek.map(elemSor).join("\n")}`;
  }

  const extra = [];
  if (k.tipus === "sorrend") {
    extra.push("SORREND: minden megtalált elemnél add meg a \"pozicio\" mezőben, hányadikként írta a diák (1-től számozva, a diák összes felsorolt tételét számolva).");
  }
  if (k.tipus === "nyilt_felsorolas") {
    extra.push("NYÍLT FELSOROLÁS: ami a diák válaszában tartalmilag helyes, de egyik elemnek sem felel meg, azt a \"kulcson_kivul\" tömbbe vedd fel.");
  }
  if (k.tipus === "tablazat") {
    extra.push("TÁBLÁZAT: az elemek a cellák. Az idézet a diák adott cellába írt szövege legyen.");
  }

  return [fej, szigor, torzs, ...extra].join("\n");
}

/**
 * Értékelés, kifejtős változat. A modell elemenként státuszt, idézetet és
 * pozíciót ad – pontot NEM: azt a kód számolja a tanár beállításai szerint.
 *
 * A tananyag SZÁNDÉKOSAN nincs benne: a kulcs a tananyagból készült, és a
 * tanár jóváhagyta. A kulcson kívüli válaszokat az AI a saját tudása
 * alapján ítéli meg – azokat is a tanár hagyja jóvá. Így minden javítás
 * olcsóbb és gyorsabb, és a feladatnak nem kell a tananyagot tárolnia.
 *
 * @param {object} feladat a feladat dokumentum (cim, rubrika)
 * @param {object} kulcs kulcsEllenorzes() kimenete
 * @param {Map<string,string>} valaszok valaszSzovegek() kimenete
 */
function kifejtosErtekelesPrompt(feladat, kulcs, valaszok) {
  const kim = kimenet(feladat?.rubrika);
  const valaszResz = kulcs.kerdesek
    .map((k) => `## ${k.sorszam}. kérdés\n"""\n${valaszok.get(k.sorszam) || "(nincs válasz)"}\n"""`)
    .join("\n\n");

  return `${persona(tantargya(feladat.rubrika))} Egy diák dolgozatát javítod,
a tanár által jóváhagyott megoldókulcs alapján.

# A FELADAT
Cím: ${feladat.cim || "nincs megadva"}

# A MEGOLDÓKULCS
${kulcs.kerdesek.map(kerdesLeiras).join("\n\n")}

# A DIÁK VÁLASZAI (kézírásból átírva)
${valaszResz}

# UTASÍTÁSOK
1. Minden kérdésnél MINDEN kulcselemhez adj státuszt:
   - "megvan": a diák leírta (a szakszó-szabály szerint);
   - "reszben": részben, pontatlanul, vagy kétnyelvű kérdésnél csak az egyik nyelven;
   - "hianyzik": nem írta le;
   - "teves": az elemhez tartozó állítása tartalmilag téves.
2. A "megvan", "reszben" és "teves" elemeknél az "idezet" a diák
   válaszának SZÓ SZERINTI részlete legyen, abból a kérdésből, amelyikhez
   az elem tartozik. Ne javítsd, ne fogalmazd át – a rendszer visszakeresi,
   és ha nem találja, az elem nem ér pontot.
3. PONTOT NE ADJ: csak státuszt, idézetet és (sorrendnél) pozíciót. A
   pontozást a rendszer végzi a tanár szabályai szerint.
4. A helyesírási hibák NEM számítanak: "megvan" az elem, ha a tartalom
   felismerhető. Az átiratban [?] jelöli az olvashatatlan részt, [...] a
   levágott részt – ezekért ne büntess.
5. A "hibak" tömbbe a tartalmi hibákat vedd fel (tévedés, pontatlan
   fogalom, hiányzó elem, rossz sorrend, hiányos kifejtés). Helyesírást ne.
6. Kérdésenként a "visszajelzes" 1-2 mondat a tanárnak, ${kim.hatarozo}.
7. A "diak_szoveg" a diáknak szóló visszajelzés ${kim.hatarozoNagy}: barátságos,
   konstruktív, 2-4 bekezdés. Kezdd azzal, ami jól sikerült, és emeld ki a
   2-3 legfontosabb hiányt. Ne írj bele pontszámot és jegyet.`;
}

// ══════════════════════════════════════════════════════
// KULCSKÉSZÍTÉS
// Feladatlap + (nem kötelező) tananyag → kulcsvázlat, EGY hívásban.
// A tananyag fájljai közvetlenül mennek a modellhez; nincs külön
// feldolgozási lépés és nincs tananyagtár.
// ══════════════════════════════════════════════════════

const NEM_FELADATLAP_UZENET =
  "A feltöltött feladatlapon nem találtam kérdéseket – tananyagnak vagy jegyzetnek tűnik. " +
  "A Feladatlap helyére a kinyomtatott dolgozat kerül (a kérdésekkel), a tananyag alatta, a saját helyére.";

// ── A kulcsjavaslat sémája ──
// A beállításokat (sorrend, szigor) SZÁNDÉKOSAN nem kérjük: azokat a
// tanár választja – lásd ALAP_BEALLITAS.

const JAVASLAT_ELEM = {
  type: "object",
  properties: {
    allitas: { type: "string" },
    pont: { type: "number" },
    elfogadhato: { type: "array", items: { type: "string" } },
    forras: { type: "string", enum: ["tananyag", "altalanos"] },
    ellenorizendo: { type: "boolean" }
  },
  required: ["allitas", "pont", "forras", "ellenorizendo"]
};

const KULCS_JAVASLAT_SCHEMA = {
  type: "object",
  properties: {
    // Az első kérdés: van-e egyáltalán feladatlap. E nélkül a modell egy
    // jegyzetből is gyárt kérdéseket – ez történt a próbán.
    nem_feladatlap: { type: "boolean" },
    cim_javaslat: { type: "string" },
    tantargy: { type: "string" },
    feladat_leiras: { type: "string" },
    kerdesek: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sorszam: { type: "string" },
          szoveg: { type: "string" },
          tipus: { type: "string", enum: KERDES_TIPUSOK },
          max_pont: { type: "number" },
          elemek: { type: "array", items: JAVASLAT_ELEM },
          agak: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cim: { type: "string" },
                elemek: { type: "array", items: JAVASLAT_ELEM }
              },
              required: ["cim", "elemek"]
            }
          },
          megjegyzes: { type: "string" }
        },
        required: ["sorszam", "szoveg", "tipus", "max_pont"]
      }
    }
  },
  required: ["nem_feladatlap", "cim_javaslat", "feladat_leiras", "kerdesek"]
};

/**
 * A kulcskészítés utasítása. A fájlok utána jönnek, felcímkézve:
 * "=== FELADATLAP ===", majd (ha van) "=== TANANYAG ===".
 *
 * @param {string|null} tantargy a tanár által megadott tantárgy
 * @param {boolean} vanTananyag csatoltunk-e tananyagot
 */
function kulcsKeszitesPrompt(tantargy, vanTananyag) {
  const tananyagResz = vanTananyag
    ? `
# A TANANYAG
A "=== TANANYAG ===" után csatolt fájlokból tanultak a diákok. A kulcs
ELSŐSORBAN ehhez igazodjon: ha a tananyag egy fogalmat, felsorolást vagy
folyamatot adott formában tanít (hány eleme van, mi a sorrendje, mi a
pontos kifejezés), a kulcs pontosan azt kérje, a tananyag szóhasználatával.
Az ilyen elemnél a "forras" legyen "tananyag"; ami nincs benne a
tananyagban, annál "altalanos".
`
    : `
Tananyag NINCS csatolva: a kulcsot a saját tudásodból állítod össze,
ezért minden elemnél a "forras" legyen "altalanos".
`;

  return `${persona(tantargy)} A "=== FELADATLAP ===" után egy dolgozat
nyomtatott feladatlapja következik. Állítsd össze belőle a MEGOLDÓKULCS
vázlatát, amit a tanár átnéz és jóváhagy.

# ELŐSZÖR: FELADATLAP-E?
Ha a feladatlapként csatolt fájlon NINCSENEK a diáknak szóló kérdések
vagy feladatok (pl. tankönyvoldal, jegyzet, prezentáció), a
"nem_feladatlap" legyen true, a "kerdesek" tömb pedig üres. Ilyenkor NE
találj ki kérdéseket. Egyébként a "nem_feladatlap" false.
${tananyagResz}
# KÉRDÉSENKÉNT
- "sorszam": a kérdés sorszáma, ahogy a lapon áll (pl. "1", "2a").
- "szoveg": a kérdés szövege, szó szerint.
- "tipus":
  - "zart_felsorolas": adott elemeket kell felsorolni;
  - "nyilt_felsorolas": "legalább N" tételt kell írni egy bővebb körből –
    adj MINDEN elfogadható elemet, a "max_pont" pedig a kért darabszám;
  - "sorrend": egy folyamat lépései – az elemeket a HELYES SORRENDBEN add;
  - "tablazat": kitöltendő táblázat – cellánként egy elem, az "allitas"
    alakja: "sor – oszlop: helyes érték";
  - "magyarazat": rövid kifejtés – az elemek a pontot érő kulcsgondolatok;
  - "valasztos": a diák választ (pl. "Fejts ki egyet a három közül") – az
    "agak" tömbbe lehetőségenként külön elemlistát adj.
- "max_pont": ha a lapon szerepel a pontszám, AZT add meg. Ha nem, az
  elemek pontjainak összege (nyílt felsorolásnál a kért darabszám).
- Elemenként:
  - "allitas": röviden, ahogy egy jó diákválaszban szerepelne;
  - "pont": általában 1 – ha a lap pontszáma mást indokol, oszd el;
  - "elfogadhato": a szinonimák, más elfogadható megfogalmazások;
  - "ellenorizendo": true, ha nem vagy biztos benne, vagy ha a tananyag
    nem egyértelmű ebben.
- "megjegyzes": ha a kérdésnél valami nem egyértelmű, vagy a tanárnak
  döntenie kell (pl. a tananyag ellentmond önmagának), írd le egy
  mondatban. Különben hagyd üresen.

A pontozás szabályairól (számít-e a sorrend, mennyire szigorú a
szakszóhasználat) NE írj – azokat a tanár állítja be.

A "feladat_leiras" a diákoknak szól (kivetítik), a feladatlap nyelvén,
röviden: a diák teendője. Ha a lapon van bevezető vagy általános utasítás,
annak megfogalmazását ne változtasd meg; ha nincs, 1-2 mondatban,
másodikszemélyben (E/2), a diákhoz szólva mondd el, miről szól a dolgozat –
ne harmadik személyben. Hosszabb szövegrészt a lapról ne másolj át.
A "cim_javaslat" rövid cím, a "tantargy" a tantárgy neve.`;
}

/**
 * Az AI kulcsjavaslatának egységes, a kulcsEllenorzes()-en átmenő alakra
 * hozása. Az azonosítókat MI adjuk (e1, e2…), nem a modell: így nem
 * ütközhetnek, és a tanár szerkesztése sem függ tőlük.
 *
 * A használhatatlan kérdést (nincs egy értelmes eleme sem) kihagyja, és
 * jelzi – a tanár kézzel pótolja.
 *
 * @returns {{kulcs: object, kihagyott: string[]}}
 * @throws {Error} ha a feladatlap nem feladatlap, vagy nincs használható kérdés
 */
function kulcsJavaslatTisztitas(nyers, vanTananyag) {
  if (nyers?.nem_feladatlap === true) throw Object.assign(new Error(NEM_FELADATLAP_UZENET), { kod: "nem_feladatlap" });

  const szoveg = (x) => String(x ?? "").trim();
  const elemTisztitas = (lista, elotag) => (Array.isArray(lista) ? lista : [])
    .map((e) => ({
      allitas: szoveg(e?.allitas),
      pont: Number(e?.pont) > 0 ? Number(e.pont) : 1,
      elfogadhato: (Array.isArray(e?.elfogadhato) ? e.elfogadhato : []).map(szoveg).filter(Boolean),
      // Tananyag nélkül nem jöhet semmi a tananyagból, akármit mond a modell.
      forras: vanTananyag && e?.forras === "tananyag" ? "tananyag" : "altalanos",
      ellenorizendo: e?.ellenorizendo === true
    }))
    .filter((e) => e.allitas)
    .map((e, j) => ({ id: `${elotag}${j + 1}`, ...e }));
  const osszeg = (elemek) => elemek.reduce((s, e) => s + e.pont, 0);

  const kihagyott = [];
  const sorszamok = new Set();
  const kerdesek = [];

  (Array.isArray(nyers?.kerdesek) ? nyers.kerdesek : []).forEach((k, i) => {
    const tipus = KERDES_TIPUSOK.includes(k?.tipus) ? k.tipus : "magyarazat";
    let sorszam = szoveg(k?.sorszam).replace(/\.$/, "") || String(i + 1);
    while (sorszamok.has(sorszam)) sorszam += "*";

    let elemek = [];
    let agak = null;
    let pontosszeg;
    if (tipus === "valasztos") {
      agak = (Array.isArray(k.agak) ? k.agak : [])
        .map((a, j) => ({
          id: `a${j + 1}`,
          cim: szoveg(a?.cim) || `${j + 1}. lehetőség`,
          elemek: elemTisztitas(a?.elemek, `a${j + 1}e`)
        }))
        .filter((a) => a.elemek.length > 0);
      pontosszeg = Math.max(0, ...agak.map((a) => osszeg(a.elemek)));
      if (agak.length === 0) { kihagyott.push(sorszam); return; }
    } else {
      elemek = elemTisztitas(k?.elemek, "e");
      pontosszeg = osszeg(elemek);
      if (elemek.length === 0) { kihagyott.push(sorszam); return; }
    }

    sorszamok.add(sorszam);
    kerdesek.push({
      sorszam,
      szoveg: szoveg(k?.szoveg),
      tipus,
      max_pont: Number(k?.max_pont) > 0 ? Number(k.max_pont) : pontosszeg,
      elemek,
      agak,
      beallitas: { ...ALAP_BEALLITAS },
      megjegyzes: szoveg(k?.megjegyzes)
    });
  });

  if (kerdesek.length === 0) {
    throw Object.assign(new Error("Az AI egyetlen használható kérdést sem talált a feladatlapon."), { kod: "nincs_hasznalhato_kerdes" });
  }

  return { kulcs: kulcsEllenorzes({ kerdesek }), kihagyott };
}

module.exports = {
  KERDES_TIPUSOK,
  ELEM_STATUSZOK,
  SORREND_MODOK,
  SZAKSZO_MODOK,
  KULCSON_KIVUL_MODOK,
  KIFEJTOS_HIBA_KATEGORIAK,
  ALAP_BEALLITAS,
  ALAP_PONTHATAROK,
  KULCSON_KIVULI_TETEL_PONT,
  KIFEJTOS_ATIRAT_SCHEMA,
  KIFEJTOS_ERTEKELES_SCHEMA,
  KULCS_JAVASLAT_SCHEMA,
  NEM_FELADATLAP_UZENET,
  KIMENETI_NYELVEK,
  ALAP_KIMENETI_NYELV,
  kimenet,
  feladatMod,
  szavak,
  szoEgyezik,
  idezetEllenorzes,
  sorrendPontozas,
  kerdesPontozas,
  SKALA_SABLONOK,
  ALAP_SKALA,
  ponthatarokEllenorzes,
  skalaEllenorzes,
  skalaFeloldas,
  jegyNormalizalas,
  jegyJavaslat,
  kulcsEllenorzes,
  szoszedetGyujtes,
  valaszSzovegek,
  atiratOsszefuzes,
  elemEllenorzes,
  kifejtosErtekelesOsszeallitas,
  kifejtosTanariEredmeny,
  kifejtosAggregalas,
  kifejtosElemzesPrompt,
  KIFEJTOS_ELEMZES_SCHEMA,
  kifejtosAtiratPrompt,
  kifejtosErtekelesPrompt,
  kulcsKeszitesPrompt,
  kulcsJavaslatTisztitas
};
