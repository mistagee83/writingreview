// ══════════════════════════════════════════════════════
// A diák írófelülete a feladatlinken (iras.html): mentés és visszaállítás
//
// A munkavesztés ellen (2026-11-23, a tulajdonos kérése: egy diák véletlenül kijelölte és
// törölte az egész szövegét, és az automatikus mentés az üres szöveget mentette el):
//   1. látható mentésjelzés („Mentve ebben a böngészőben · 14:32”), és figyelmeztetés, ha a
//      böngésző nem tud menteni (privát ablak, letiltott tároló),
//   2. „Visszavonás” gomb (telefonon nincs Ctrl+Z),
//   3. törlésvédelem: ha egy bevitellel sok szöveg tűnik el, az előző változat külön mentésbe
//      kerül, és egy sáv felajánlja a visszaállítását – újratöltés után is.
// A szöveg a diák saját korábbi írása, ezért a visszaállítás nem beillesztés (a jelzések
// nem számolják nagy betoldásnak: jelzesFigyelo.szinkron).
//
// A tiszta részek DOM nélkül tesztelhetők: tests/iras-szerkeszto.test.mjs.
// ══════════════════════════════════════════════════════

/** Ennyi karakter eltűnése egy bevitellel mindig nagy törlés. */
export const TORLES_KARAKTER = 100;
/** Ennyi karaktertől számít nagy törlésnek, ha a szöveg legalább a felére fogy. */
export const TORLES_MIN_KARAKTER = 20;

/**
 * Nagy törlés-e az `elotte` → `utana` változás (egy bevitel alatt)? A kijelölés + törlés és a
 * kijelölés + egy betű begépelése (felülírás) is ide tartozik.
 */
export function nagyTorles(elotte, utana) {
  const e = String(elotte ?? "").length;
  const u = String(utana ?? "").length;
  const eltunt = e - u;
  if (eltunt >= TORLES_KARAKTER) return true;
  return eltunt >= TORLES_MIN_KARAKTER && u * 2 <= e;
}

/**
 * Melyik változatot őrizzük meg a visszaállításhoz? A már őrzött és az új jelölt közül a hosszabbat:
 * ha a diák töröl, ír egy kicsit, és azt is törli, a nagy munka ne vesszen el.
 */
export function megorzendo(meglevo, uj) {
  const m = String(meglevo ?? "");
  const u = String(uj ?? "");
  return u.length >= m.length ? u : m;
}

/** Mutassuk-e a visszaállítás sávját? Csak ha az őrzött változat érdemben több, mint ami a mezőben van. */
export function visszaallithato(orzott, jelenlegi) {
  const o = String(orzott ?? "");
  return o.trim().length > 0 && o !== String(jelenlegi ?? "") && nagyTorles(o, jelenlegi);
}

/** A bekezdések száma: a nem üres sorok (a diákok egy sortöréssel kezdenek új bekezdést). */
export function bekezdesSzam(szoveg) {
  return String(szoveg ?? "").split(/\n/).filter((s) => s.trim()).length;
}

/**
 * A szószám-sáv: kitöltöttség (0–100) és állapot a feladat szókorlátja szerint.
 * Cél: a felső korlát, ha van, különben az alsó. Korlát nélkül nincs sáv (null).
 */
export function szoSav(n, min, max) {
  const cel = max || min;
  if (!cel) return null;
  const szazalek = Math.max(0, Math.min(100, Math.round((n / cel) * 100)));
  const allapot = max && n > max ? "sok" : min && n < min ? "keves" : "jo";
  return { szazalek, allapot };
}

/** Működik-e a tároló (privát ablakban vagy letiltott sütiknél nem)? Próbaírással dönt. */
export function taroloMukodik(tarolo) {
  try {
    const k = "wr-proba";
    tarolo.setItem(k, "1");
    tarolo.removeItem(k);
    return true;
  } catch (_) {
    return false;
  }
}
