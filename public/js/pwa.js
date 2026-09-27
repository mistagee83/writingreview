// ══════════════════════════════════════════════════════
// WritingReview – telepíthető alkalmazás (PWA)
//
// Két dolgot csinál:
//   1. bejegyzi a service workert (minden lapon, a guard.js hívja),
//   2. felkínálja a telepítést (a belépő lapon).
//
// MIÉRT NINCS BÖNGÉSZŐ-SZIMATOLÁS
//
// A telepítés két úton mehet:
//   - Chrome / Edge / Android: a böngésző küld egy `beforeinstallprompt`
//     eseményt, és onnan egy gombbal telepíthető.
//   - iPhone / iPad Safari: NINCS ilyen esemény, a felhasználónak kézzel
//     kell a „Megosztás → Főképernyőhöz adás" utat járnia.
//
// Ezt NEM user-agent alapján döntjük el (az törékeny és folyton
// változik), hanem abból, hogy megjött-e az esemény. Ha megjött: gomb.
// Ha nem: ugyanaz a felirat elmagyarázza mindkét út lépéseit. Így egy
// jövőbeli böngészőben is működik, és sosem hazudik.
// ══════════════════════════════════════════════════════

let telepitesiEsemeny = null;

/** Telepített alkalmazásból nézzük-e? Ilyenkor nincs mit felkínálni. */
export function telepitve() {
  return window.matchMedia("(display-mode: standalone)").matches
    // iOS Safari a standard helyett ezt a saját jelzőt használja
    || window.navigator.standalone === true;
}

// ══════════════════════════════════════════
// SERVICE WORKER
// ══════════════════════════════════════════

/**
 * Bejegyzi a service workert. Idempotens: ha már be van jegyezve, a
 * böngésző csak ellenőrzi a fájlt.
 *
 * Hiba esetén NEM dobunk tovább: a service worker kényelmi funkció, az
 * app nélküle is teljes értékű. Egy elhasalt bejegyzés nem akadályozhatja
 * meg a belépést.
 */
export function swRegisztracio() {
  if (!("serviceWorker" in navigator)) return;

  // A service worker biztonságos környezetet kér. Ez éles alatt (https)
  // és localhoston teljesül; egy LAN-os IP-n nem, és ott a bejegyzés
  // hibára futna – ezt nem érdemes a konzolba köpni.
  const biztonsagos = window.isSecureContext;
  if (!biztonsagos) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => {
      console.warn("A service worker nem jegyződött be:", e.message);
    });
  });
}

// ══════════════════════════════════════════
// TELEPÍTÉS FELKÍNÁLÁSA
// ══════════════════════════════════════════

// Az eseményre a lap betöltésének korai fázisában is számíthatunk,
// ezért a figyelőt modulszinten tesszük fel, nem a gomb bekötésekor.
window.addEventListener("beforeinstallprompt", (e) => {
  // Enélkül a böngésző a saját sávját mutatná, és a mi gombunk mellett
  // két felkínálás lenne.
  e.preventDefault();
  telepitesiEsemeny = e;
  document.dispatchEvent(new CustomEvent("wr-telepitheto"));
});

window.addEventListener("appinstalled", () => {
  telepitesiEsemeny = null;
  document.dispatchEvent(new CustomEvent("wr-telepitve"));
});

/**
 * Bekötés a belépő lap telepítő sávjára.
 *
 * @param {{sav: string, gomb: string, tipp: string}} elemek elem-id-k
 */
export function telepitoSav({ sav, gomb, tipp }) {
  const savEl = document.getElementById(sav);
  const gombEl = document.getElementById(gomb);
  const tippEl = document.getElementById(tipp);
  if (!savEl || !gombEl || !tippEl) return;

  // Telepített appból ne kínáljuk fel újra
  if (telepitve()) {
    savEl.hidden = true;
    return;
  }

  savEl.hidden = false;

  function gombAllapot() {
    // Van natív telepítés → a gomb telepít.
    // Nincs → ugyanaz a gomb megmutatja a kézi lépéseket.
    gombEl.textContent = telepitesiEsemeny
      ? "📲 Telepítés"
      : "📲 Hogyan telepítem?";
  }
  gombAllapot();

  document.addEventListener("wr-telepitheto", gombAllapot);
  document.addEventListener("wr-telepitve", () => { savEl.hidden = true; });

  gombEl.addEventListener("click", async () => {
    if (!telepitesiEsemeny) {
      tippEl.hidden = !tippEl.hidden;
      return;
    }
    const esemeny = telepitesiEsemeny;
    // Egy prompt() csak egyszer használható – utána új eseményre kell várni
    telepitesiEsemeny = null;
    gombAllapot();
    try {
      await esemeny.prompt();
      const { outcome } = await esemeny.userChoice;
      if (outcome === "accepted") savEl.hidden = true;
    } catch (e) {
      // Pl. már fut egy prompt. Maradjon a kézi út.
      console.warn("A telepítési ablak nem nyílt meg:", e.message);
      tippEl.hidden = false;
    }
  });
}
