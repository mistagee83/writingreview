// ══════════════════════════════════════════════════════
// WritingReview – beépített bemutató (onboarding)
//
// Első belépéskor magától felnyílik, utána a topbar villanykörtéjével
// bármikor. Minden lépés reflektorfénybe teszi a valódi felület egy
// elemét – nem képernyőfotót mutat, hanem az appot.
//
// SZAKASZOKRA van vágva, és nem egyetlen hosszú túra. Senki nem vállal
// be húsz lépést olyanért, aminek még nem látja az értelmét, ezért a
// belépő egy menü: minden szakasznál ott van, hány lépés, mennyi idő,
// és MI A KIMENET a végén. A szakaszok önállóan is értelmesek, és a
// szakasz végén a bemutató megkérdezi, mehet-e tovább – nem esik át
// magától a következőbe.
//
// Miért itt és nem az oldalakon: a topbar öt lapon van lemásolva, és a
// bemutató négy lapot fog át. A guard.js egy helyen hívja meg, a kapu
// kinyitása után.
//
// A tartalom a tura-lepesek.js-ben van – ez a fájl csak a motor.
// ══════════════════════════════════════════════════════

import { db, doc, updateDoc } from "./firebase-config.js";
import { SZAKASZOK, LEPESEK, szakaszLepesei } from "./tura-lepesek.js";
import { felnyiljon } from "./tura-logika.js";

const KULCS_ALLAS = "wr_tura_allas";     // félbehagyott futás lapváltáskor
const KULCS_KESZ = "wr_tura_kesz";       // ne nyíljon fel magától többé
const KULCS_LATOTT = "wr_tura_latott";   // mely szakaszokat látta már
const KULCS_NYITAS = "wr_tura_nyitasok"; // hányszor nyílt fel magától

// A localStorage bármikor dobhat: privát ablak, letiltott tárolás.
// A bemutató ilyenkor is működjön, csak ne emlékezzen.
function olvas(kulcs) {
  try { return localStorage.getItem(kulcs); } catch { return null; }
}
function ir(kulcs, ertek) {
  try { localStorage.setItem(kulcs, ertek); } catch { /* nem baj */ }
}
function torol(kulcs) {
  try { localStorage.removeItem(kulcs); } catch { /* nem baj */ }
}

function jelenlegiOldal() {
  // A gyökér a belépő lapot szolgálja ki – ott a kapu sem fut le, tehát
  // a bemutató sem indul. Ha ezt tanar.html-nek hazudnánk, a menü a
  // belépés előtt is fel akarna nyílni.
  const nev = location.pathname.split("/").pop();
  return nev === "" ? "index.html" : nev;
}

const mozgasCsokkentett = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function esc(ertek) {
  return String(ertek ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// ══════════════════════════════════════════
// ÁLLAPOT
// ══════════════════════════════════════════

// futas: { index, tol, ig, szakasz } – az `ig` zárt intervallum vége.
// A teljes bemutató is csak egy futás, 0-tól az utolsó lépésig.
let futas = null;
let felhasznalo = null;
let latott = new Set();
let vaz = null;

// ══════════════════════════════════════════
// BELÉPÉSI PONT – a guard.js hívja
// ══════════════════════════════════════════

/**
 * @param {{szerep: string, user: object, profil: object}} ctx
 */
export function turaBeallit({ szerep, user, profil }) {
  // A diák folyamata más (csatlakozás, fotózás, visszajelzés) – annak
  // külön szakaszai lesznek, nem ezek.
  if (szerep !== "tanar") return;

  felhasznalo = user;

  latott = new Set([
    ...(Array.isArray(profil?.tura_latott) ? profil.tura_latott : []),
    ...(olvas(KULCS_LATOTT) || "").split(",").filter(Boolean)
  ]);

  villanykorte();

  const oldal = jelenlegiOldal();

  // Lapváltás közben félbehagyott futás folytatása
  const allas = allasOlvas();
  if (allas && LEPESEK[allas.index]?.oldal === oldal) {
    futas = allas;
    vazEpit();
    nyit();
    lepesMutat(allas.index);
    return;
  }
  if (allas) torol(KULCS_ALLAS);   // a tanár máshova navigált

  const nyitasok = Number(olvas(KULCS_NYITAS)) || 0;
  const nyilhat = felnyiljon({
    oldal,
    szerep,
    elutasitotta: profil?.tura_kesz === true || olvas(KULCS_KESZ) === "1",
    latottSzakasz: latott.size,
    nyitasok
  });

  if (nyilhat) {
    ir(KULCS_NYITAS, String(nyitasok + 1));
    menuNyit();
  }
}

function allasOlvas() {
  try {
    const a = JSON.parse(olvas(KULCS_ALLAS) || "null");
    return Number.isInteger(a?.index) && LEPESEK[a.index] ? a : null;
  } catch { return null; }
}

function allasIr() {
  ir(KULCS_ALLAS, JSON.stringify(futas));
}

function villanykorte() {
  const hely = document.querySelector(".topbar-right");
  if (!hely || document.getElementById("tura-korte")) return;

  const gomb = document.createElement("button");
  gomb.id = "tura-korte";
  gomb.className = "tura-korte";
  gomb.type = "button";
  gomb.title = "Bemutató: hogyan működik";
  gomb.setAttribute("aria-label", "Bemutató megnyitása");
  gomb.textContent = "💡";
  gomb.addEventListener("click", menuNyit);

  // A kilépés gomb elé, hogy az maradjon a szélen
  hely.insertBefore(gomb, hely.querySelector(".btn-logout") || null);
}

// ══════════════════════════════════════════
// A VÁZ
// ══════════════════════════════════════════

// A document/window szintű figyelők csak egyszer kerülnek fel, akkor is,
// ha a vázat újra kell építeni.
let figyelokFent = false;

function vazEpit() {
  // Ha a lap újrarendereli a törzsét, a vázunk leválik a DOM-ról, de a
  // modul még rá hivatkozna – onnantól a bemutató láthatatlanul futna.
  if (vaz?.gyoker.isConnected) return vaz;

  const gyoker = document.createElement("div");
  gyoker.className = "tura-gyoker";
  gyoker.innerHTML = `
    <div class="tura-sav" data-sav="fent"></div>
    <div class="tura-sav" data-sav="lent"></div>
    <div class="tura-sav" data-sav="bal"></div>
    <div class="tura-sav" data-sav="jobb"></div>
    <div class="tura-gyuru" aria-hidden="true"></div>
    <div class="tura-bubi" role="dialog" aria-modal="true"
         aria-labelledby="tura-cim" tabindex="-1">
      <div class="tura-fej">
        <span class="tura-szamlalo"></span>
        <button class="tura-zar" type="button" aria-label="Bemutató bezárása">✕</button>
      </div>
      <h3 id="tura-cim"></h3>
      <div class="tura-torzs"></div>
      <div class="tura-labs">
        <button class="tura-kihagy" type="button">Bezárom</button>
        <div class="tura-nav">
          <button class="tura-elozo" type="button">← Előző</button>
          <button class="tura-kovetkezo" type="button">Tovább →</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(gyoker);

  vaz = {
    gyoker,
    savok: {
      fent: gyoker.querySelector('[data-sav="fent"]'),
      lent: gyoker.querySelector('[data-sav="lent"]'),
      bal: gyoker.querySelector('[data-sav="bal"]'),
      jobb: gyoker.querySelector('[data-sav="jobb"]')
    },
    gyuru: gyoker.querySelector(".tura-gyuru"),
    bubi: gyoker.querySelector(".tura-bubi"),
    szamlalo: gyoker.querySelector(".tura-szamlalo"),
    cim: gyoker.querySelector("#tura-cim"),
    torzs: gyoker.querySelector(".tura-torzs"),
    labs: gyoker.querySelector(".tura-labs"),
    elozo: gyoker.querySelector(".tura-elozo"),
    kovetkezo: gyoker.querySelector(".tura-kovetkezo"),
    kihagy: gyoker.querySelector(".tura-kihagy"),
    zar: gyoker.querySelector(".tura-zar")
  };

  vaz.kovetkezo.addEventListener("click", () => lep(1));
  vaz.elozo.addEventListener("click", () => lep(-1));
  vaz.kihagy.addEventListener("click", () => bezar());
  vaz.zar.addEventListener("click", () => bezar());

  // A menü és a szakaszvégi kártya gombjai delegálva
  vaz.torzs.addEventListener("click", (e) => {
    const gomb = e.target.closest("[data-akcio]");
    if (!gomb) return;
    const { akcio, szakasz } = gomb.dataset;
    if (akcio === "szakasz") szakaszIndit(szakasz);
    else if (akcio === "teljes") teljesIndit();
    else if (akcio === "menu") menuNyit();
    else if (akcio === "kesz") bezar(true);
  });

  if (!figyelokFent) {
    document.addEventListener("keydown", billentyu);
    window.addEventListener("resize", ujrameres);
    window.addEventListener("scroll", ujrameres, { passive: true });
    figyelokFent = true;
  }

  return vaz;
}

function billentyu(e) {
  if (!vaz?.gyoker.classList.contains("lathato")) return;
  if (e.key === "Escape") { e.preventDefault(); bezar(); }
  if (!futas) return;
  if (e.key === "ArrowRight") { e.preventDefault(); lep(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); lep(-1); }
}

// Az elhelyezés maga is görgethet (scrollIntoView), ami scroll-eseményt
// vált ki – e nélkül a saját görgetésünk indítaná újra az elhelyezést,
// eldobva a „tetejére igazítás" döntést, és a buborék ugrálna.
let helyezesFut = false;
let tetejereKell = false;

function ujrameres() {
  if (!futas || helyezesFut) return;
  elhelyez(LEPESEK[futas.index], tetejereKell);
}

function nyit() {
  vazEpit().gyoker.classList.add("lathato");
  document.body.classList.add("tura-fut");
}

// ══════════════════════════════════════════
// MENÜ – a belépő
// ══════════════════════════════════════════

function menuNyit() {
  futas = null;
  torol(KULCS_ALLAS);
  demoTakarit();

  const v = vazEpit();
  nyit();
  v.gyoker.classList.add("nincs-cel");
  v.bubi.classList.add("menu");
  v.labs.hidden = true;
  v.szamlalo.textContent = "Bemutató";
  v.cim.textContent = "Mit szeretnél megnézni?";

  v.torzs.innerHTML = `
    <p class="tura-bevezeto">
      Négy szakasz, egymástól függetlenül is végignézhető. Mindegyik a
      valódi felületen mutatja meg, mit kell tenni.
    </p>
    <div class="tura-szakaszok">
      ${SZAKASZOK.map((sz) => {
        const db = szakaszLepesei(sz.id).length;
        const kesz = latott.has(sz.id);
        return `
        <button class="tura-szakasz${kesz ? " kesz" : ""}" type="button"
                data-akcio="szakasz" data-szakasz="${esc(sz.id)}">
          <span class="tura-szakasz-ikon">${sz.ikon}</span>
          <span class="tura-szakasz-fo">
            <span class="tura-szakasz-cim">
              ${esc(sz.cim)}${kesz ? ' <span class="tura-pipa" title="Már megnézted">✓</span>' : ""}
            </span>
            <span class="tura-szakasz-kimenet">${esc(sz.kimenet)}</span>
            <span class="tura-szakasz-meta">${db} lépés</span>
          </span>
        </button>`;
      }).join("")}
    </div>
    <div class="tura-menu-labs">
      <button class="tura-teljes" type="button" data-akcio="teljes">
        Mind a négy, sorban
      </button>
      <button class="tura-menu-zar" type="button" data-akcio="kesz">
        Most nem, köszönöm
      </button>
    </div>`;

  elhelyez({ cel: null });
  v.bubi.focus({ preventScroll: true });
}

// ══════════════════════════════════════════
// FUTÁS INDÍTÁSA
// ══════════════════════════════════════════

function szakaszIndit(szakaszId) {
  const lepesek = szakaszLepesei(szakaszId);
  if (!lepesek.length) return;
  const tol = LEPESEK.indexOf(lepesek[0]);
  futas = { index: tol, tol, ig: tol + lepesek.length - 1, szakasz: szakaszId };
  futasKezd();
}

function teljesIndit() {
  futas = { index: 0, tol: 0, ig: LEPESEK.length - 1, szakasz: null };
  futasKezd();
}

/**
 * A futás első lépése lehet másik lapon – ilyenkor odanavigálunk, és a
 * turaBeallit() folytatja. A navigációt a tanár kattintása indítja.
 */
function futasKezd() {
  vaz.bubi.classList.remove("menu");
  vaz.labs.hidden = false;

  const elso = LEPESEK[futas.index];
  if (elso.oldal !== jelenlegiOldal()) {
    allasIr();
    window.location.href = elso.oldal;
    return;
  }
  lepesMutat(futas.index);
}

// ══════════════════════════════════════════
// LÉPTETÉS
// ══════════════════════════════════════════

async function lepesMutat(index) {
  const lepes = LEPESEK[index];
  // Hibaút: nincs ilyen lépés. Ez nem elutasítás, csak bezárás.
  if (!lepes) return bezar();

  // A korábbi lépés takarítása (pl. becsukott demo modál)
  const elozoLepes = LEPESEK[futas.index];
  if (elozoLepes && elozoLepes !== lepes && elozoLepes.utana) {
    try { await elozoLepes.utana(); } catch (e) { console.warn("bemutató utana():", e); }
  }

  futas.index = index;
  tetejereKell = false;   // minden lépés a középre igazítással kezd
  allasIr();

  if (lepes.elokeszit) {
    try {
      await lepes.elokeszit();
    } catch (e) {
      // Egy elrontott előkészítés ne akassza meg az egész bemutatót
      console.warn("bemutató elokeszit():", e);
    }
  }

  const v = vaz;
  const sorszam = index - futas.tol + 1;
  const ossz = futas.ig - futas.tol + 1;
  const szakasz = SZAKASZOK.find((sz) => sz.id === lepes.szakasz);

  v.bubi.classList.remove("menu");
  v.labs.hidden = false;
  v.szamlalo.textContent = `${szakasz?.ikon || ""} ${szakasz?.cim || ""} · ${sorszam}/${ossz}`;
  v.cim.textContent = lepes.cim;
  v.torzs.innerHTML = lepes.szoveg;
  v.elozo.hidden = index === futas.tol;
  v.kovetkezo.textContent = index === futas.ig ? "Kész" : "Tovább →";
  v.kihagy.textContent = "Bezárom";

  elhelyez(lepes);
  v.bubi.focus({ preventScroll: true });
}

function lep(irany) {
  if (!futas) return;
  const index = futas.index + irany;
  if (index < futas.tol) return;

  // A szakasz végén NEM esünk át a következőbe: a tanár döntse el.
  if (index > futas.ig) return szakaszVege();

  const mostani = LEPESEK[futas.index];
  const kovetkezo = LEPESEK[index];

  if (kovetkezo.oldal !== mostani.oldal) {
    futas.index = index;
    allasIr();
    window.location.href = kovetkezo.oldal;
    return;
  }

  lepesMutat(index);
}

// ══════════════════════════════════════════
// SZAKASZ VÉGE
// ══════════════════════════════════════════

async function szakaszVege() {
  const utolso = LEPESEK[futas.index];
  if (utolso?.utana) {
    try { await utolso.utana(); } catch { /* takarítás */ }
  }
  demoTakarit();

  const vegzett = utolso?.szakasz;
  if (vegzett) latottMent(vegzett);

  // Teljes bemutatónál a következő szakasz jön, egyébként a menü
  const kovetkezoSzakasz = kovetkezoSzakaszaUtan(vegzett);
  const v = vaz;

  futas = null;
  torol(KULCS_ALLAS);

  v.gyoker.classList.add("nincs-cel");
  v.bubi.classList.add("menu");
  v.labs.hidden = true;
  v.szamlalo.textContent = "Szakasz kész";
  v.cim.textContent = `Kész: ${SZAKASZOK.find((s) => s.id === vegzett)?.cim || "szakasz"}`;

  v.torzs.innerHTML = `
    <p class="tura-bevezeto">${esc(
      SZAKASZOK.find((s) => s.id === vegzett)?.zaro || "Ezt a szakaszt végignézted."
    )}</p>
    <div class="tura-menu-labs">
      ${kovetkezoSzakasz ? `
        <button class="tura-teljes" type="button"
                data-akcio="szakasz" data-szakasz="${esc(kovetkezoSzakasz.id)}">
          ${kovetkezoSzakasz.ikon} Következő: ${esc(kovetkezoSzakasz.cim)}
          (${szakaszLepesei(kovetkezoSzakasz.id).length} lépés)
        </button>` : ""}
      <button class="tura-menu-zar" type="button" data-akcio="menu">
        Vissza a menübe
      </button>
      <button class="tura-menu-zar" type="button" data-akcio="kesz">
        Befejezem
      </button>
    </div>`;

  elhelyez({ cel: null });
  v.bubi.focus({ preventScroll: true });
}

function kovetkezoSzakaszaUtan(szakaszId) {
  const i = SZAKASZOK.findIndex((s) => s.id === szakaszId);
  return i === -1 ? null : SZAKASZOK[i + 1] || null;
}

// ══════════════════════════════════════════
// ÁLLAPOT MENTÉSE
// ══════════════════════════════════════════

function latottMent(szakaszId) {
  latott.add(szakaszId);
  ir(KULCS_LATOTT, [...latott].join(","));
  profilIr({ tura_latott: [...latott] });
}

async function profilIr(adat) {
  if (!felhasznalo?.uid) return;
  try {
    await updateDoc(doc(db, "felhasznalok", felhasznalo.uid), adat);
  } catch (e) {
    // A localStorage a tartalék: a bemutató működik nélküle is
    console.warn("A bemutató állapotát nem sikerült elmenteni:", e);
  }
}

/**
 * @param {boolean} [elutasitas] true → a tanár KIFEJEZETTEN azt mondta,
 *   hogy nem kéri („Most nem, köszönöm", „Befejezem"). Ilyenkor többé
 *   nem nyílik fel magától, más gépen sem. A sima becsukás (✕, Escape,
 *   „Bezárom") nem ez: az csak most zárja be.
 */
async function bezar(elutasitas) {
  const lepes = futas ? LEPESEK[futas.index] : null;
  if (lepes?.utana) {
    try { await lepes.utana(); } catch { /* takarítás */ }
  }

  futas = null;
  torol(KULCS_ALLAS);
  demoTakarit();

  if (vaz) {
    vaz.gyoker.classList.remove("lathato");
    vaz.bubi.classList.remove("menu");
  }
  document.body.classList.remove("tura-fut");

  if (!elutasitas) return;

  ir(KULCS_KESZ, "1");
  profilIr({ tura_kesz: true });
}

/** Minden bemutató-elem eltűnik, akármelyik lépés hozta létre. */
function demoTakarit() {
  document.querySelectorAll(".tura-demo").forEach((el) => el.remove());
}

// ══════════════════════════════════════════
// REFLEKTORFÉNY
//
// Négy sáv a cél körül, nem kivágott maszk: így a sávok elnyelik a
// kattintásokat (a tanár nem navigál el véletlenül), a cél viszont
// kattintható marad, mert arra nem esik sáv.
// ══════════════════════════════════════════

const REES = 8;   // a gyűrű túllógása a célon, px

/**
 * @param {object} lepes
 * @param {boolean} [tetejere] második próbálkozás: a célt a képernyő
 *   tetejéhez igazítjuk, hogy alatta legyen hely a buboréknak. Alacsony
 *   ablakban egy nagy célnál (pl. a feltöltő sáv) középre igazítva
 *   egyik irányba sem férne el.
 */
function elhelyez(lepes, tetejere) {
  helyezesFut = true;
  // A saját görgetésünk scroll-eseménye a következő képkockán érkezik
  requestAnimationFrame(() => { helyezesFut = false; });

  const v = vaz;
  const cel = lepes?.cel ? document.querySelector(lepes.cel) : null;

  if (!cel) {
    // Nincs cél (menü, szakaszvége), vagy eltűnt az elem: teljes
    // elhalványítás, a buborék középen. Így sosem lesz üres reflektor.
    v.gyoker.classList.add("nincs-cel");
    Object.values(v.savok).forEach((s) => { s.style.cssText = ""; });
    v.gyuru.style.display = "none";
    v.bubi.style.cssText = "";
    v.bubi.classList.remove("lap");
    return;
  }

  v.gyoker.classList.remove("nincs-cel");

  if (tetejere) {
    // A topbar fix 60px – e nélkül a cél alábújna
    const eredeti = cel.style.scrollMarginTop;
    cel.style.scrollMarginTop = "76px";
    cel.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    cel.style.scrollMarginTop = eredeti;
  } else {
    cel.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }

  const r = cel.getBoundingClientRect();
  const x = Math.max(0, r.left - REES);
  const y = Math.max(0, r.top - REES);
  // Minimum méret: egy üres konténer (pl. még fel nem töltött lista)
  // nulla magas, és a gyűrű egy vonal lenne a semmiben.
  const sz = Math.max(24, Math.min(window.innerWidth - x, r.width + REES * 2));
  const ma = Math.max(24, Math.min(window.innerHeight - y, r.height + REES * 2));

  const { fent, lent, bal, jobb } = v.savok;
  fent.style.cssText = `left:0;top:0;width:100%;height:${y}px`;
  lent.style.cssText = `left:0;top:${y + ma}px;width:100%;bottom:0`;
  bal.style.cssText = `left:0;top:${y}px;width:${x}px;height:${ma}px`;
  jobb.style.cssText = `left:${x + sz}px;top:${y}px;right:0;height:${ma}px`;

  v.gyuru.style.cssText =
    `display:block;left:${x}px;top:${y}px;width:${sz}px;height:${ma}px`;

  const elfert = bubiElhelyez(r);

  // A döntő kérdés nem az, hogy melyik irányba tettük a buborékot, hanem
  // hogy ELTAKARJA-E a kiemelést. Telefonon az alsó lap "elfér", mégis
  // ráfekhet a célra. Ilyenkor a célt a képernyő tetejére igazítjuk, és
  // egyszer újrapróbáljuk – másodszor nem, abból végtelen ciklus lenne.
  const br = v.bubi.getBoundingClientRect();
  const atfed = !(br.bottom <= y || br.top >= y + ma ||
                  br.right <= x || br.left >= x + sz);

  if ((!elfert || atfed) && !tetejere) {
    tetejereKell = true;    // a görgetés utáni újramérés is ezt használja
    elhelyez(lepes, true);
  }
}

/** @returns {boolean} elfért-e a kiemelés mellett (false → alsó lap) */
function bubiElhelyez(r) {
  const b = vaz.bubi;

  // Telefonon alsó lapként ül, nem a cél mellett: 380px-en nincs hely
  // egy buboréknak a kiemelés mellett.
  if (window.innerWidth < 640) {
    b.style.cssText = "";
    b.classList.add("lap");
    return true;   // ez nem kényszer, hanem a telefonos elrendezés
  }
  b.classList.remove("lap");

  // Mérés előtt látszania kell, de a helye még nem végleges
  b.style.cssText = "left:0;top:0";
  const bm = b.getBoundingClientRect();
  const res = 14;   // rés a kiemelés és a buborék között
  const sz = 12;    // minimális szegély a képernyő széléig
  const V = window.innerWidth;
  const M = window.innerHeight;

  const hatarolt = (ertek, meret, korlat) =>
    Math.max(sz, Math.min(ertek, korlat - meret - sz));

  // Négy irány, ebben a sorrendben. A buborék NEM fekhet a kiemelt
  // elemre – azt takarná el, amire épp mutat. Nagy célnál (pl. a teljes
  // feltöltő sáv) előfordul, hogy egyik irányba sem fér: akkor alsó
  // lapként ül le, ami legalább kiszámítható.
  const jeloltek = [
    { // alá
      elfer: r.bottom + res + bm.height <= M - sz,
      top: r.bottom + res,
      left: hatarolt(r.left + r.width / 2 - bm.width / 2, bm.width, V)
    },
    { // fölé
      elfer: r.top - res - bm.height >= sz,
      top: r.top - res - bm.height,
      left: hatarolt(r.left + r.width / 2 - bm.width / 2, bm.width, V)
    },
    { // jobbra
      elfer: r.right + res + bm.width <= V - sz,
      top: hatarolt(r.top + r.height / 2 - bm.height / 2, bm.height, M),
      left: r.right + res
    },
    { // balra
      elfer: r.left - res - bm.width >= sz,
      top: hatarolt(r.top + r.height / 2 - bm.height / 2, bm.height, M),
      left: r.left - res - bm.width
    }
  ];

  const hely = jeloltek.find((j) => j.elfer);
  if (!hely) {
    b.style.cssText = "";
    b.classList.add("lap");
    return false;
  }

  b.style.cssText = `left:${Math.round(hely.left)}px;top:${Math.round(hely.top)}px`;
  if (!mozgasCsokkentett()) {
    b.classList.add("beugrik");
    setTimeout(() => b.classList.remove("beugrik"), 250);
  }
  return true;
}
