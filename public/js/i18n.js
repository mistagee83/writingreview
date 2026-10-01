// ══════════════════════════════════════════════════════
// WritingReview – többnyelvű felület (i18n)
//
// Használat:
//   import { t } from './js/i18n.js';
//   t('diak.cim')                        → "Feladataim" / "My tasks"
//   t('diak.csatlakoztal', { nev })      → a {nev} helyére behelyettesít
//
// Az oldalak statikus szövegeit attribútum jelöli, az import után
// automatikusan lefordulnak:
//   <h1 data-i18n="diak.cim">Feladataim</h1>
//   <p data-i18n-html="diak.kod_leiras">…<strong>egyszer</strong>…</p>
//   <input data-i18n-placeholder="diak.nev_pelda">
//   (+ data-i18n-title, data-i18n-aria)
// A HTML-ben marad a magyar szöveg tartalékként (hu a forrásnyelv).
//
// SZABÁLYOK
// - A szótár kulcsa nyelvfüggetlen, pontokkal tagolt: oldal.jelentés.
// - A {param} helyettesítés NEM escape-el. Ha az érték felhasználói
//   input és innerHTML-be kerül, a hívó esc()-eljen (mint eddig).
// - Hiányzó kulcs: az angol/más nyelv a magyarra esik vissza, az pedig
//   magára a kulcsra – az oldal így sosem marad üresen, a hiány pedig
//   a tests/i18n.test.mjs-ben azonnal kiderül.
// - Több szám esetén (egyes/többes) ne ragozzunk futásidőben: a mondatot
//   úgy fogalmazzuk, hogy ne kelljen ("Beadások: {n}").
//
// NYELV KIVÁLASZTÁSA
// 1. a felhasználó választása (localStorage "wr_nyelv"),
// 2. a böngésző nyelve, ha támogatott (magyar böngésző → magyar),
// 3. angol.
// ══════════════════════════════════════════════════════

import hu from "./i18n-hu.js";
import en from "./i18n-en.js";

export const SZOTARAK = { hu, en };
export const NYELVEK = [
  { kod: "hu", nev: "Magyar" },
  { kod: "en", nev: "English" }
];
export const ALAP_NYELV = "hu";
const TARTALEK_NYELV = "en";
const KULCS = "wr_nyelv";

function tarol(muvelet) {
  try { return muvelet(); } catch (_) { return null; } // privát mód, tiltott storage
}

/** A böngésző nyelvéből támogatott kód, vagy null. */
export function bongeszoNyelv(lista = (typeof navigator !== "undefined" && navigator.languages) || []) {
  for (const l of lista) {
    const kod = String(l).toLowerCase().split("-")[0];
    if (SZOTARAK[kod]) return kod;
  }
  return null;
}

function kezdoNyelv() {
  const mentett = tarol(() => localStorage.getItem(KULCS));
  if (mentett && SZOTARAK[mentett]) return mentett;
  return bongeszoNyelv() || TARTALEK_NYELV;
}

let aktualis = kezdoNyelv();

export const nyelv = () => aktualis;

/** Nyelvváltás: elmenti, és újratölti az oldalt (így minden szöveg egységesen frissül). */
export function nyelvBeallit(kod, ujratolt = true) {
  if (!SZOTARAK[kod]) return;
  tarol(() => localStorage.setItem(KULCS, kod));
  aktualis = kod;
  if (ujratolt && typeof location !== "undefined") location.reload();
}

/** Nyelv beállítása mentés és újratöltés nélkül (tesztekhez). */
export function nyelvCsere(kod) {
  if (SZOTARAK[kod]) aktualis = kod;
}

function behelyettesit(szoveg, params) {
  if (!params) return szoveg;
  return szoveg.replace(/\{(\w+)\}/g, (egesz, nev) =>
    nev in params ? String(params[nev] ?? "") : egesz);
}

/** Fordítás kulcs alapján. */
export function t(kulcs, params) {
  const szoveg =
    SZOTARAK[aktualis]?.[kulcs] ??
    SZOTARAK[ALAP_NYELV]?.[kulcs] ??
    kulcs;
  return behelyettesit(szoveg, params);
}

/** Van-e fordítás ehhez a kulcshoz az adott nyelven? */
export function vanKulcs(kulcs, kod = aktualis) {
  return SZOTARAK[kod]?.[kulcs] !== undefined;
}

/**
 * A feladat nyelvének megjelenített neve. A feladatban a nyelv magyar
 * kódszóként tárolódik ("angol", "német"…) – a szerver is ezt használja,
 * ezért az adat nem változik, csak a megjelenítés fordul.
 */
export function nyelvNev(kod) {
  const kulcs = `nyelv.${kod}`;
  return vanKulcs(kulcs) ? t(kulcs) : String(kod ?? "");
}

const TIPUS_KULCS = {
  "esszé": "tipus.esse", "levél": "tipus.level", "leírás": "tipus.leiras",
  "elbeszélés": "tipus.elbeszeles", "vélemény": "tipus.velemeny", "egyéb": "tipus.egyeb"
};
const SZINT_KULCS = {
  "5-6. évfolyam": "szint.evf_5_6", "7-8. évfolyam": "szint.evf_7_8",
  "9-10. évfolyam": "szint.evf_9_10", "11-12. évfolyam": "szint.evf_11_12",
  "érettségi (közép)": "szint.erettsegi_kozep", "érettségi (emelt)": "szint.erettsegi_emelt"
};

/** A feladattípus (adatban magyar kódszó) megjelenített neve. */
export function tipusNev(kod) {
  return TIPUS_KULCS[kod] ? t(TIPUS_KULCS[kod]) : String(kod ?? "");
}

/** A szint megjelenített neve. A CEFR-szintek (A1…C1) nem fordulnak, az évfolyamok igen. */
export function szintNev(ertek) {
  return SZINT_KULCS[ertek] ? t(SZINT_KULCS[ertek]) : String(ertek ?? "");
}

/**
 * A megoldókulcs-ellenőrzés hibája (functions/kifejtos.js → hiba()) az
 * aktuális nyelven. A hibán kód és paraméterek vannak; ha a kód ismeretlen
 * (vagy a hiba más eredetű), a hiba saját üzenete marad.
 */
export function kulcsHibaSzoveg(e) {
  const kulcs = `kulcshiba.${e?.kod}`;
  if (!e?.kod || !vanKulcs(kulcs, ALAP_NYELV)) return e?.message ?? "";
  const p = e.parameterek || {};
  const kerdes = t("kulcshiba.hely_kerdes", { kerdes: p.kerdes });
  const hely = p.ag ? t("kulcshiba.hely_ag", { hely: kerdes, ag: p.ag }) : kerdes;
  return t("kulcshiba.elofej", { uzenet: t(kulcs, { ...p, hely }) });
}

/** Dátum az aktuális nyelv formátumában. */
export function datumSzoveg(date) {
  return date.toLocaleDateString(t("meta.locale"));
}

const ATTRIBUTUMOK = [
  ["data-i18n-placeholder", "placeholder"],
  ["data-i18n-title", "title"],
  ["data-i18n-aria", "aria-label"]
];

/** A data-i18n* attribútumos elemek lefordítása (az oldalon vagy egy részfán). */
export function i18nAlkalmaz(gyoker) {
  if (typeof document === "undefined") return;
  gyoker = gyoker || document;
  document.documentElement.lang = aktualis;

  gyoker.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  gyoker.querySelectorAll("[data-i18n-html]").forEach((el) => {
    // A szótár megbízható, saját tartalom – a felhasználói adat ide nem kerül.
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  for (const [attr, cel] of ATTRIBUTUMOK) {
    gyoker.querySelectorAll(`[${attr}]`).forEach((el) => {
      el.setAttribute(cel, t(el.getAttribute(attr)));
    });
  }
}

/**
 * Nyelvválasztó a fejlécbe (a kilépés gomb elé). Ha nincs fejléc, nem
 * csinál semmit. Kétszer hívva sem duplázódik.
 */
export function nyelvvalaszto() {
  if (typeof document === "undefined") return;
  const hely = document.querySelector(".topbar-right, [data-nyelvvalaszto]");
  if (!hely || hely.querySelector(".nyelvvalaszto")) return;

  const sel = document.createElement("select");
  sel.className = "nyelvvalaszto";
  sel.setAttribute("aria-label", t("kozos.nyelv"));
  sel.innerHTML = NYELVEK.map((n) =>
    `<option value="${n.kod}"${n.kod === aktualis ? " selected" : ""}>${n.nev}</option>`
  ).join("");
  sel.addEventListener("change", () => nyelvBeallit(sel.value));

  const kilepes = hely.querySelector(".btn-logout");
  hely.insertBefore(sel, kilepes || null);
}

// A modulok halasztva futnak, a DOM ekkor már kész – a statikus
// szövegek még a bejelentkezés előtt lefordulnak (betöltőképernyő is).
i18nAlkalmaz();
nyelvvalaszto();
