// ══════════════════════════════════════════════════════
// WritingReview – fejléc-navigáció
//
// MIÉRT VAN EZ A FÁJL
//
// Telefonon az oldalsáv 700px alatt el van rejtve, telepített appban
// pedig a böngésző vissza gombja sincs meg – így a tanárnak csak a
// telefon rendszergombja maradt. Ez a modul tesz a fejlécbe egy vissza
// gombot, és a márkanevet a főoldalra vezető linkké alakítja.
//
// MIÉRT NEM history.back()
//
// A history kiszámíthatatlan: mélylinkről nyitva, telepített appból
// indulva vagy egy átirányítás után nem oda visz, ahova a felhasználó
// számít – legrosszabb esetben ki az appból. Helyette LOGIKAI szülőt
// használunk: minden lapnak egy fix helye van a hierarchiában. Ez
// mindig ugyanoda visz, és tesztelhető.
//
// A topbar tizenegy lapon le van másolva, ezért itt futásidőben
// bővítjük – ugyanúgy, ahogy a bemutató villanykörtéje is ide kerül.
// A guard.js hívja meg, a kapu kinyitása után.
// ══════════════════════════════════════════════════════

const KEZDOLAP = {
  tanar: "tanar.html",
  diak: "diak.html"
};

/**
 * A lapok logikai szülője. Ami nincs benne, az kezdőlap – onnan nincs
 * hova visszalépni, ott nem is jelenik meg a gomb.
 */
const SZULO = {
  "osztalyok.html": "tanar.html",
  "feladatok.html": "tanar.html",
  "javitas.html": "tanar.html",
  "admin.html": "tanar.html",
  // Az elemzést egy feladat sorából indítja a tanár, tehát oda tér vissza
  "elemzes.html": "feladatok.html",
  "beadas.html": "diak.html",
  "visszajelzes.html": "diak.html"
};

/** Emberi nevek a vissza gomb feliratához. */
const NEVEK = {
  "tanar.html": "Főoldal",
  "diak.html": "Feladataim",
  "feladatok.html": "Feladatok",
  "osztalyok.html": "Osztályok",
  "javitas.html": "Javítási sor",
  "admin.html": "Szerepkezelés"
};

function jelenlegiOldal() {
  const nev = location.pathname.split("/").pop();
  return nev === "" ? "index.html" : nev;
}

// ── tesztelhető részek ──
// A hierarchia a navigáció lelke: ha egy lap kimarad belőle, arról
// nincs visszaút. Ezért kifelé is látszik, és teszt védi
// (tests/fejlec.test.mjs).

/** @returns {string|null} a szülő lap, vagy null ha ez kezdőlap */
export function szuloLapja(oldal) {
  return SZULO[oldal] || null;
}

/** @returns {string} a szerepkör kezdőlapja */
export function kezdolapja(szerep) {
  return KEZDOLAP[szerep] || "index.html";
}

export { SZULO, KEZDOLAP, NEVEK };

/**
 * @param {{szerep: string}} ctx
 */
export function fejlecBeallit({ szerep }) {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  const oldal = jelenlegiOldal();

  const bal = balOldalEpit(topbar);
  markaLink(bal, kezdolapja(szerep));
  visszaGomb(bal, szuloLapja(oldal));
}

/**
 * A topbar `space-between`-nel rendezi a gyerekeit. Ha a vissza gombot
 * csak beszúrnánk, a márkanév középre kerülne – ezért a két bal oldali
 * elem egy csoportba kell.
 */
function balOldalEpit(topbar) {
  const meglevo = topbar.querySelector(".topbar-left");
  if (meglevo) return meglevo;

  const bal = document.createElement("div");
  bal.className = "topbar-left";
  const marka = topbar.querySelector(".brand");
  topbar.insertBefore(bal, marka || topbar.firstChild);
  if (marka) bal.appendChild(marka);
  return bal;
}

/**
 * A márkanév legyen link a kezdőlapra. A HTML-ben `div`, mert tizenegy
 * lapon szerepel, és a cél szerepkörtől függ – ezért itt cseréljük.
 */
function markaLink(bal, kezdo) {
  const marka = bal.querySelector(".brand");
  if (!marka || marka.tagName === "A") return;

  const link = document.createElement("a");
  link.className = marka.className;
  link.innerHTML = marka.innerHTML;
  link.href = kezdo;
  link.title = "Vissza a főoldalra";
  marka.replaceWith(link);
}

function visszaGomb(bal, cel) {
  // Kezdőlapon nincs hova visszalépni – ott a gomb félrevezető lenne.
  if (!cel || bal.querySelector(".btn-vissza")) return;

  const nev = NEVEK[cel] || "Vissza";
  const gomb = document.createElement("a");
  gomb.className = "btn-vissza";
  gomb.href = cel;
  gomb.title = `Vissza: ${nev}`;
  gomb.setAttribute("aria-label", `Vissza: ${nev}`);
  // A feliratot szűk kijelzőn a CSS elrejti, a nyíl marad
  gomb.innerHTML = `<span aria-hidden="true">←</span><span class="btn-vissza-nev">${nev}</span>`;

  gomb.addEventListener("click", (e) => {
    // Ha épp nyitva van egy modál, először AZT zárjuk be. A lap saját
    // bezáró gombját nyomjuk meg, hogy a takarítása is lefusson.
    const zar = document.querySelector(".modal.show .modal-fejlec button");
    if (zar) {
      e.preventDefault();
      zar.click();
    }
  });

  bal.insertBefore(gomb, bal.firstChild);
}
