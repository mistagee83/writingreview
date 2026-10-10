// ══════════════════════════════════════════════════════
// WritingReview – a színválasztó lenyíló menüje (a felső sáv jobb oldalán, minden tanári oldalon)
//
// A guard.js tölti be a tanári oldalakon (dinamikus import: ha hibázik, a belépést nem akadályozza). A választás a
// szerveren mentődik (temaBeallitas callable; az alapszínen kívül az Alap csomagtól), a téma csak sikeres mentés után vált.
// A menüpontok és a feliratok a DOM API-val készülnek (szöveget csak textContent-tel írunk).
// ══════════════════════════════════════════════════════

import { t } from "./i18n.js";
import { KVOTA } from "./kornyezet.js";
import { functions, httpsCallable } from "./firebase-config.js";
import { hibaSzoveg } from "./ui.js";
import { TEMAK, ALAP_TEMA, temaAlkalmaz } from "./tema.js";

function elem(nev, osztaly, szoveg) {
  const e = document.createElement(nev);
  if (osztaly) e.className = osztaly;
  if (szoveg != null) e.textContent = szoveg;
  return e;
}

/**
 * A menü beillesztése a .topbar-right elembe (a nyelvválasztó elé). Kétszer hívva sem duplázódik.
 * @param {{profil: {tema?: string}}} ctx a belépett tanár profilja (a jelenlegi téma innen)
 */
export function temaMenuBeallit({ profil }) {
  const hely = document.querySelector(".topbar-right");
  if (!hely || hely.querySelector(".tema-menu")) return;

  let aktualis = TEMAK.includes(profil?.tema) ? profil.tema : ALAP_TEMA;

  const gyoker = elem("div", "tema-menu");

  const gomb = elem("button", "tema-gomb-fent");
  gomb.type = "button";
  gomb.setAttribute("aria-haspopup", "true");
  gomb.setAttribute("aria-expanded", "false");
  gomb.setAttribute("aria-label", t("tanar.tema_menu_cim"));
  gomb.title = t("tanar.tema_menu_cim");
  const gombMinta = elem("span", "tema-minta");
  gombMinta.setAttribute("aria-hidden", "true");
  const nyil = elem("span", "tema-nyil", "▾");
  nyil.setAttribute("aria-hidden", "true");
  gomb.append(gombMinta, nyil);

  const lenyilo = elem("div", "tema-lenyilo");
  lenyilo.hidden = true;
  lenyilo.setAttribute("role", "menu");
  lenyilo.setAttribute("aria-label", t("tanar.tema_menu_cim"));

  // a fejléc: rövid leírás, és csak ahol a csomagok élnek (prod), az "Alap csomagtól" megjegyzés
  const fejlec = elem("p", "tema-fejlec", t("tanar.tema_leiras"));
  if (KVOTA) {
    fejlec.append(" ", elem("strong", null, t("tanar.jegyzet_alap")));
  }
  lenyilo.appendChild(fejlec);

  const elemek = TEMAK.map((nev) => {
    const b = elem("button", "tema-elem");
    b.type = "button";
    b.dataset.tema = nev;
    b.setAttribute("role", "menuitemradio");
    const minta = elem("span", "tema-minta");
    minta.setAttribute("aria-hidden", "true");
    const pipa = elem("span", "tema-pipa", "✓");
    pipa.setAttribute("aria-hidden", "true");
    b.append(minta, elem("span", "tema-nev", t(`tanar.tema_${nev}`)), pipa);
    b.addEventListener("click", () => valaszt(nev));
    lenyilo.appendChild(b);
    return b;
  });

  const uzenet = elem("p", "tema-uzenet");
  uzenet.setAttribute("role", "alert");
  lenyilo.appendChild(uzenet);

  gyoker.append(gomb, lenyilo);
  hely.insertBefore(gyoker, hely.querySelector(".nyelvvalaszto") || hely.querySelector(".btn-logout") || null);

  function jelol() {
    for (const b of elemek) b.setAttribute("aria-checked", String(b.dataset.tema === aktualis));
  }

  function nyit(fokusz = false) {
    lenyilo.hidden = false;
    gomb.setAttribute("aria-expanded", "true");
    if (fokusz) (elemek.find((b) => b.dataset.tema === aktualis) || elemek[0]).focus();
  }

  function zar(visszaFokusz = false) {
    lenyilo.hidden = true;
    gomb.setAttribute("aria-expanded", "false");
    uzenet.textContent = "";
    if (visszaFokusz) gomb.focus();
  }

  async function valaszt(nev) {
    if (nev === aktualis) { zar(true); return; }
    uzenet.textContent = "";
    for (const b of elemek) b.disabled = true;
    try {
      await httpsCallable(functions, "temaBeallitas")({ tema: nev });
      aktualis = nev;
      temaAlkalmaz(nev);
      jelol();
      zar(true);
    } catch (e) {
      console.error(e);
      // pl. az ingyenes csomag: a szerver "az Alap csomagtól érhető el" üzenete; a menü nyitva marad
      uzenet.textContent = hibaSzoveg(e);
    } finally {
      for (const b of elemek) b.disabled = false;
    }
  }

  gomb.addEventListener("click", () => (lenyilo.hidden ? nyit() : zar()));
  gomb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); nyit(true); }
  });
  lenyilo.addEventListener("keydown", (e) => {
    const i = elemek.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); zar(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); elemek[(i + 1) % elemek.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); elemek[(i - 1 + elemek.length) % elemek.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); elemek[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); elemek[elemek.length - 1].focus(); }
    else if (e.key === "Tab") zar();
  });
  // kattintás a menün kívülre zár
  document.addEventListener("click", (e) => {
    if (!lenyilo.hidden && !gyoker.contains(e.target)) zar();
  });

  jelol();
}
