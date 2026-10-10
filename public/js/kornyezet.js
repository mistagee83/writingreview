// ══════════════════════════════════════════════════════
// WritingReview – a telepítés (környezet) jellemzői
//
// FIGYELEM: a scripts/build.mjs a dist/-ben ezt a fájlt a kiválasztott
// környezet konfigjából (config/<env>.json) újragenerálja. A public/-ban
// lévő példány a pilot értékeit hordozza, hogy a helyi előnézet működjön.
// A két alakja a tests/kornyezet.test.mjs-ben van egyeztetve.
//
// Új környezeti jellemzőt a config/*.json-ba és a build.mjs kornyezetJs()
// függvényébe is fel kell venni.
// ══════════════════════════════════════════════════════

export const KORNYEZET = "pilot";
export const ALAPNYELV = "hu";
export const KVOTA = false;
// Önkiszolgáló tanári regisztráció (a regisztrációs űrlap „Tanár vagyok” választója).
// A szerver ugyanezt a KORNYEZET-ből dönti el (functions/kornyezet.js), ezért a
// kettőnek egyeznie kell – a tests/kornyezet.test.mjs ellenőrzi.
export const TANARI_ONREGISZTRACIO = false;
export const TESZT_SAV = false;
// A csomagok a nyitóoldalnak (a build a functions/.env.<alias>-ból és a functions/kvota.js-ből tölti ki; lásd
// scripts/kornyezet-config.mjs, csomagAdatok). FIZETES: él-e a Stripe-fizetés (prod, beállított ár) – ha nem,
// a nyitóoldal nem mutat árakat. ARAK: az ár szövege csomagonként; KERETEK: az AI-egység keret csomagonként.
export const FIZETES = false;
export const ARAK = {};
export const KERETEK = {"ingyenes":20,"alap":150,"profi":500};

// A „TESZT” sáv: a pilot-telepítést jelöli, hogy ne tévesszék össze az
// éles verzióval. Nyelvfüggetlen felirat, nem kell szótári kulcs; az
// egérnek átlátszó, nem takar el semmit.
if (TESZT_SAV && typeof document !== "undefined") {
  const sav = document.createElement("div");
  sav.textContent = "TESZT · TEST";
  sav.setAttribute("aria-hidden", "true");
  sav.style.cssText =
    "position:fixed;top:0;right:0;z-index:2147483647;pointer-events:none;" +
    "background:#c2410c;color:#fff;font:700 11px/1 system-ui,sans-serif;" +
    "letter-spacing:.08em;padding:4px 10px;border-bottom-left-radius:6px;opacity:.92";
  const berak = () => document.body.appendChild(sav);
  if (document.body) berak();
  else document.addEventListener("DOMContentLoaded", berak);
}
