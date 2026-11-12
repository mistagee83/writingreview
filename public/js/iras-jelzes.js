// ══════════════════════════════════════════════════════
// Beírt dolgozat – írás közbeni jelzések
//
// TÉNYJELZÉSEKET gyűjtünk a tanárnak (nem ítéletet, nem MI-detektort):
//   1. hányszor és mennyi időre hagyta el a diák az ablakot (más lap/alkalmazás),
//   2. mennyit és mit illesztett be a szövegbe – a feladatlinken (iras.html) a beillesztés
//      TILTOTT (tiltas: true): ott a kísérletek számát jelezzük,
//   3. hirtelen nagy szövegbetoldás beillesztés nélkül (bővítmény, automatikus gépelő, diktálás),
//   4. az írási idő (aktív és teljes) és az események időrendje.
// A diák ELŐRE látja, hogy ezeket jelezzük (iras.figyelmeztetes). A jelzés a diák böngészőjéből
// jön, ezért nem bizonyíték (kijátszható, és ártalmatlan okai is lehetnek) – a tanári felület ezt
// ki is mondja. A szerver az alakját ellenőrzi (functions/feladatlink.js, jelzesekErvenyesek).
//
// A tiszta részek (tartományok, összegzés, jelölés, AwayFigyelo, IrasNaplo) DOM nélkül
// tesztelhetők: tests/iras-jelzes.test.mjs. A DOM-os rész (jelzesFigyelo) az eseményeket köti be.
// ══════════════════════════════════════════════════════

/** Ennél rövidebb távollét nem számít elhagyásnak (értesítés, rövid fókuszvesztés). */
export const ELHAGYAS_KUSZOB_MS = 2000;
/** Ennél rövidebb beillesztést nem emelünk ki a szövegben (a darabszámba így is beleszámít). */
export const KIEMELES_MIN_KARAKTER = 8;
/** A tárolt kiemelt tartományok felső határa (a Firestore-szabály 100 számot enged: kezdet+vég párok). */
export const TARTOMANY_MAX = 50;
/** A beírt szöveg felső határa karakterben (a szabály és a szerver is ezt kényszeríti). */
export const SZOVEG_MAX = 20000;
/** Egy beillesztett részlet megjegyzett hossza (a megtalálásához elég). */
const BEILLESZTETT_RESZLET_MAX = 5000;
/** Egyetlen bevitellel legalább ennyi karakter beillesztés nélkül: „nagy betoldás” (a gépelés karakterenként jön). */
export const NAGY_BETOLDAS_KARAKTER = 40;
/** Két bevitel között ennél hosszabb szünet nem számít aktív írásnak. */
export const AKTIV_SZUNET_MS = 60 * 1000;
/** Az időrend legfeljebb ennyi eseményt tárol (a szerver is ezt engedi). */
export const ESEMENY_MAX = 50;
/** Az időrend eseménytípusai. */
export const ESEMENY_TIPUSOK = ["elhagyas", "beillesztes_kiserlet", "nagy_betoldas"];

// ── tiszta részek ──

/**
 * A beillesztett részletek előfordulásai a VÉGLEGES szövegben: [kezdet, vég, kezdet, vég, ...]
 * (összevonva, rendezve, legfeljebb TARTOMANY_MAX pár). Csak azt jelöli, ami a beadott szövegben
 * még betű szerint megvan; ami közben átíródott, az már nem beillesztett.
 */
export function tartomanyok(szoveg, beillesztettek) {
  const s = String(szoveg ?? "");
  const talalatok = [];
  for (const p of beillesztettek || []) {
    const r = String(p ?? "");
    if (r.trim().length < KIEMELES_MIN_KARAKTER) continue;
    let i = s.indexOf(r);
    while (i !== -1) {
      talalatok.push([i, i + r.length]);
      i = s.indexOf(r, i + r.length);
    }
  }
  talalatok.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const osszevont = [];
  for (const [k, v] of talalatok) {
    const utolso = osszevont[osszevont.length - 1];
    if (utolso && k <= utolso[1]) utolso[1] = Math.max(utolso[1], v);
    else osszevont.push([k, v]);
  }
  return osszevont.slice(0, TARTOMANY_MAX).flat();
}

/** A tartomány-lista (lapos számpárok) érvényes-e a szöveghez: egész, rendezett, nem átfedő, határon belül. */
export function tartomanyokRendben(lista, szovegHossz) {
  if (!Array.isArray(lista) || lista.length % 2 !== 0 || lista.length > TARTOMANY_MAX * 2) return false;
  let elozo = 0;
  for (let i = 0; i < lista.length; i += 2) {
    const k = lista[i];
    const v = lista[i + 1];
    if (!Number.isInteger(k) || !Number.isInteger(v)) return false;
    if (k < elozo || v <= k || v > szovegHossz) return false;
    elozo = v;
  }
  return true;
}

/** A tanári összegzéshez: a beillesztésből származó rész aránya (0–1) a szövegben. */
export function beillesztettArany(lista, szovegHossz) {
  if (!Array.isArray(lista) || !(szovegHossz > 0)) return 0;
  let osszes = 0;
  for (let i = 0; i + 1 < lista.length; i += 2) osszes += Math.max(0, lista[i + 1] - lista[i]);
  return Math.min(1, osszes / szovegHossz);
}

/**
 * A szöveg HTML-ben, a beillesztett részek <mark class="beillesztett">-tel.
 * Az `esc` a hívó escape-függvénye (a szöveg a diákétól jön, soha nem szúrható be nyersen).
 */
export function szovegJelolve(szoveg, lista, esc) {
  const s = String(szoveg ?? "");
  if (!tartomanyokRendben(lista, s.length) || lista.length === 0) return esc(s);
  let ki = "";
  let utolso = 0;
  for (let i = 0; i < lista.length; i += 2) {
    ki += esc(s.slice(utolso, lista[i]));
    ki += `<mark class="beillesztett">${esc(s.slice(lista[i], lista[i + 1]))}</mark>`;
    utolso = lista[i + 1];
  }
  return ki + esc(s.slice(utolso));
}

/** Szószám: szóközökkel elválasztott, nem üres darabok. */
export function szoszam(szoveg) {
  return String(szoveg ?? "").split(/\s+/).filter(Boolean).length;
}

/**
 * Az ablak elhagyásának számlálója. A böngészőtől független (időbélyegeket kap),
 * ezért tesztelhető. Egy "elhagyás" akkor számít, ha legalább a küszöbig tartott.
 */
export class AwayFigyelo {
  constructor(kuszob = ELHAGYAS_KUSZOB_MS, allapot = {}) {
    this.kuszob = kuszob;
    this.db = Number.isInteger(allapot.elhagyas_db) ? allapot.elhagyas_db : 0;
    this.ms = Number.isFinite(allapot.elhagyas_ms) ? allapot.elhagyas_ms : 0;
    this.kezdet = null;   // ha épp távol van: mikor ment el
  }

  /** Elhagyta az ablakot (lap váltása, alkalmazás váltása, fókuszvesztés). Többszöri hívás ártalmatlan. */
  tavol(most) {
    if (this.kezdet === null) this.kezdet = most;
  }

  /** Visszatért. Visszaadja, hogy ez a távollét elhagyásnak számított-e. */
  vissza(most) {
    if (this.kezdet === null) return false;
    const tartott = most - this.kezdet;
    this.kezdet = null;
    if (tartott < this.kuszob) return false;
    this.db += 1;
    this.ms += tartott;
    return true;
  }

  /** A jelenlegi állapot a beadáshoz; ha még távol van, a folyamatban lévő távollétet is beleszámítja. */
  allapot(most) {
    let db = this.db;
    let ms = this.ms;
    if (this.kezdet !== null && most - this.kezdet >= this.kuszob) {
      db += 1;
      ms += most - this.kezdet;
    }
    return { elhagyas_db: db, elhagyas_ms: ms };
  }
}

/**
 * Az írás menete: az első bevitel ideje, az aktív írási idő (a két bevitel közti szünet csak
 * AKTIV_SZUNET_MS-ig számít), és az események időrendje (másodperc az első beviteltől).
 * Időbélyegeket kap, ezért tesztelhető. Mentett állapotból folytatható.
 */
export class IrasNaplo {
  constructor(allapot = {}) {
    this.elso = Number.isFinite(allapot.elso) ? allapot.elso : null;
    this.utolso = Number.isFinite(allapot.utolso) ? allapot.utolso : null;
    this.aktivMs = Number.isFinite(allapot.aktiv_ms) ? allapot.aktiv_ms : 0;
    this.kiserletDb = Number.isInteger(allapot.kiserlet_db) ? allapot.kiserlet_db : 0;
    this.nagyDb = Number.isInteger(allapot.nagy_db) ? allapot.nagy_db : 0;
    this.esemenyek = Array.isArray(allapot.esemenyek) ? allapot.esemenyek.slice(0, ESEMENY_MAX) : [];
  }

  /** Az esemény ideje másodpercben az első beviteltől (bevitel előtt 0). */
  #t(most) {
    return this.elso === null ? 0 : Math.max(0, Math.round((most - this.elso) / 1000));
  }

  #esemeny(most, tipus, ertek) {
    if (this.esemenyek.length < ESEMENY_MAX) this.esemenyek.push({ t: this.#t(most), tipus, ertek: Math.max(0, Math.round(ertek)) });
  }

  /** Egy bevitel (gépelés, törlés). `hozzaadott`: ennyi karakterrel nőtt a szöveg (beillesztés nélkül). */
  bevitel(most, hozzaadott = 0) {
    if (this.elso === null) this.elso = most;
    if (this.utolso !== null) {
      const szunet = most - this.utolso;
      if (szunet > 0 && szunet <= AKTIV_SZUNET_MS) this.aktivMs += szunet;
    }
    this.utolso = most;
    if (hozzaadott >= NAGY_BETOLDAS_KARAKTER) {
      this.nagyDb += 1;
      this.#esemeny(most, "nagy_betoldas", hozzaadott);
    }
  }

  /** Megakadályozott beillesztés (vágólap, húzás, billentyűzet-vágólap). */
  kiserlet(most) {
    this.kiserletDb += 1;
    this.#esemeny(most, "beillesztes_kiserlet", 0);
  }

  /** Elhagyás vége: `tartott` ms-ig volt távol. */
  elhagyas(most, tartott) {
    this.#esemeny(most - tartott, "elhagyas", tartott / 1000);
  }

  /** A mentéshez. */
  mentes() {
    return { elso: this.elso, utolso: this.utolso, aktiv_ms: this.aktivMs, kiserlet_db: this.kiserletDb, nagy_db: this.nagyDb, esemenyek: this.esemenyek };
  }

  /** A beadáshoz: egész másodpercek és darabszámok. */
  osszegzes(most) {
    return {
      beillesztes_kiserlet_db: this.kiserletDb,
      nagy_betoldas_db: this.nagyDb,
      irasi_mp: Math.round(this.aktivMs / 1000),
      osszes_mp: this.#t(most),
      esemenyek: this.esemenyek.map((e) => ({ t: e.t, tipus: e.tipus, ertek: e.ertek }))
    };
  }
}

/** A beadással együtt menő jelzések (egész számok; a szerver ellenőrzi az alakjukat). */
export function jelzesekDokumentum({ elhagyas, beillesztes_db, beillesztett_karakter, szoveg, beillesztettek, naplo = null, most = 0 }) {
  const alap = {
    elhagyas_db: Math.max(0, Math.floor(elhagyas.elhagyas_db || 0)),
    elhagyas_mp: Math.max(0, Math.round((elhagyas.elhagyas_ms || 0) / 1000)),
    beillesztes_db: Math.max(0, Math.floor(beillesztes_db || 0)),
    beillesztett_karakter: Math.max(0, Math.floor(beillesztett_karakter || 0)),
    beillesztett_tartomanyok: tartomanyok(szoveg, beillesztettek)
  };
  return naplo ? { ...alap, ...naplo.osszegzes(most) } : alap;
}

/** A beillesztés-jellegű bevitelek (a böngésző beforeinput inputType-jai): ezeket tiltja a `tiltas`. */
export const BEILLESZTO_BEVITELEK = ["insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertFromYank"];

// ── DOM-os rész ──

/**
 * Bekapcsolja a figyelést egy szövegmezőn. A számlálók a böngészőben is mentődnek (a lap újratöltése
 * nem nullázza őket). `tarolo`: localStorage-szerű (getItem/setItem/removeItem), hibatűrő módon használva.
 * `tiltas: true`: a beillesztés (vágólap, húzás, a telefonos billentyűzet vágólapja) meg van akadályozva,
 * a kísérlet jelzés; ilyenkor az írás menetét is naplózzuk (nagy betoldás, írási idő, időrend).
 * @returns {{dokumentum: (szoveg: string) => object, torles: () => void, leallit: () => void}}
 */
export function jelzesFigyelo(mezo, { kulcs, tiltas = false, tarolo = globalThis.localStorage, ablak = globalThis.window, dok = globalThis.document, ora = () => Date.now() }) {
  const olvas = () => {
    try { return JSON.parse(tarolo.getItem(kulcs) || "null") || {}; } catch (_) { return {}; }
  };
  const ment = () => {
    try {
      tarolo.setItem(kulcs, JSON.stringify({
        ...figyelo.allapot(ora()),
        beillesztes_db: beillesztesDb,
        beillesztett_karakter: beillesztettKarakter,
        beillesztettek,
        ...(naplo ? { naplo: naplo.mentes() } : {})
      }));
    } catch (_) { /* privát ablak: nincs mentés, a figyelés ettől még működik */ }
  };

  const mentett = olvas();
  const figyelo = new AwayFigyelo(ELHAGYAS_KUSZOB_MS, mentett);
  const naplo = tiltas ? new IrasNaplo(mentett.naplo || {}) : null;
  let beillesztesDb = Number.isInteger(mentett.beillesztes_db) ? mentett.beillesztes_db : 0;
  let beillesztettKarakter = Number.isInteger(mentett.beillesztett_karakter) ? mentett.beillesztett_karakter : 0;
  const beillesztettek = Array.isArray(mentett.beillesztettek) ? mentett.beillesztettek.slice(0, 200) : [];
  let elozoHossz = String(mezo.value ?? "").length;

  const nincsFokusz = () => dok.visibilityState === "hidden" || !dok.hasFocus();
  const frissit = () => {
    if (nincsFokusz()) { figyelo.tavol(ora()); return; }
    const kezdet = figyelo.kezdet;
    if (figyelo.vissza(ora())) {
      if (naplo && kezdet !== null) naplo.elhagyas(ora(), ora() - kezdet);
      ment();
    }
  };

  const beilleszt = (szoveg) => {
    const s = String(szoveg ?? "");
    if (!s) return;
    beillesztesDb += 1;
    beillesztettKarakter += s.length;
    if (beillesztettek.length < 200) beillesztettek.push(s.slice(0, BEILLESZTETT_RESZLET_MAX));
    ment();
  };
  const tilt = (e) => {
    e.preventDefault?.();
    naplo.kiserlet(ora());
    ment();
  };
  const paste = (e) => (tiltas ? tilt(e) : beilleszt(e.clipboardData?.getData("text")));
  const drop = (e) => (tiltas ? tilt(e) : beilleszt(e.dataTransfer?.getData("text")));
  // A telefonos billentyűzet vágólap-sávja és egyes böngészők nem paste-eseményt küldenek, hanem
  // beforeinput-ot ilyen inputType-pal. A paste-esemény után is jöhet beforeinput: azt nem számoljuk újra.
  let utolsoTiltas = -Infinity;
  const beforeinput = (e) => {
    if (!tiltas || !BEILLESZTO_BEVITELEK.includes(e.inputType)) return;
    e.preventDefault?.();
    if (ora() - utolsoTiltas > 50) { naplo.kiserlet(ora()); ment(); }
    utolsoTiltas = ora();
  };
  const pasteTiltas = (e) => { utolsoTiltas = ora(); paste(e); };
  const input = (e) => {
    const hossz = String(mezo.value ?? "").length;
    if (naplo) {
      const visszavonas = typeof e?.inputType === "string" && e.inputType.startsWith("history");
      naplo.bevitel(ora(), visszavonas ? 0 : Math.max(0, hossz - elozoHossz));
      ment();
    }
    elozoHossz = hossz;
  };

  dok.addEventListener("visibilitychange", frissit);
  ablak.addEventListener("blur", frissit);
  ablak.addEventListener("focus", frissit);
  mezo.addEventListener("paste", pasteTiltas);
  mezo.addEventListener("drop", drop);
  mezo.addEventListener("beforeinput", beforeinput);
  mezo.addEventListener("input", input);

  return {
    dokumentum: (szoveg) => jelzesekDokumentum({
      elhagyas: figyelo.allapot(ora()),
      beillesztes_db: beillesztesDb,
      beillesztett_karakter: beillesztettKarakter,
      szoveg,
      beillesztettek,
      naplo,
      most: ora()
    }),
    torles: () => { try { tarolo.removeItem(kulcs); } catch (_) { /* nincs mit */ } },
    leallit: () => {
      dok.removeEventListener("visibilitychange", frissit);
      ablak.removeEventListener("blur", frissit);
      ablak.removeEventListener("focus", frissit);
      mezo.removeEventListener("paste", pasteTiltas);
      mezo.removeEventListener("drop", drop);
      mezo.removeEventListener("beforeinput", beforeinput);
      mezo.removeEventListener("input", input);
    }
  };
}
