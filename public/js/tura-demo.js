// ══════════════════════════════════════════════════════
// WritingReview – a bemutató példaadatai
//
// A Javítási sor és az Osztályszintű elemzés csak akkor mutatható meg,
// ha van mit megmutatni – egy új tanárnál pedig még nincs egyetlen
// beadás sem. Ez a modul példaadatot rajzol a valódi felület
// osztályaival, hogy a bemutató ugyanazt mutassa, amit éles használatban
// látni fog.
//
// HÁROM SZABÁLY, amit nem szegünk meg:
//
//  1. Semmi nem megy a Firestore-ba. Ez a modul nem ír adatot, nem küld
//     visszajelzést, nem hív Cloud Functiont. Csak DOM-ot rajzol.
//  2. Minden példaelem `.tura-demo` osztályt kap. A bemutató bezárásakor
//     egyetlen sor törli az összeset – nem kell lépésenként könyvelni.
//  3. Minden példadarab LÁTHATÓAN példa. A tanár soha ne higgye azt egy
//     valódi diák dolgozatának.
// ══════════════════════════════════════════════════════

import { t, datumSzoveg } from "./i18n.js";

// A példa dátuma: egy rögzített nap, hogy a bemutató ne változzon naponta
const DEMO_DATUM = () => datumSzoveg(new Date(2026, 8, 27));
const DEMO_DATUM_2 = () => datumSzoveg(new Date(2026, 8, 22));
const DEMO_DATUM_3 = () => datumSzoveg(new Date(2026, 8, 23));

const jelzo = () => `<span class="badge tura-jelzo">${esc(t("tura.demo_jelzo"))}</span>`;

/** HTML-escape – itt csak a saját szövegeinken fut, de maradjon szokás. */
function esc(ertek) {
  return String(ertek ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

/**
 * Bemutató-panel a tartalom tetején. Szándékosan NEM a lap saját
 * listájába szúrjuk: a valódi lista realtime frissül, és a példát
 * bármikor felülírná.
 */
function panel(id, cim, belso) {
  meglevoTorles(id);
  const fo = document.querySelector(".main") || document.body;
  const el = document.createElement("div");
  el.id = id;
  el.className = "panel tura-demo";
  el.innerHTML = `
    <div class="panel-header">
      <h2>${esc(cim)}</h2>
      ${jelzo()}
    </div>
    <div class="panel-body">${belso}</div>`;
  fo.insertBefore(el, fo.firstChild);
  return el;
}

function meglevoTorles(id) {
  document.getElementById(id)?.remove();
}

// ══════════════════════════════════════════
// 1. SZAKASZ – OSZTÁLY ÉS KÓD
//
// Egy új tanárnak még nincs osztálya, tehát a kód és a névsor nem
// mutatható meg a valódi listán. Ez a kártya ugyanazzal a markuppal
// készül, mint a valódi.
// ══════════════════════════════════════════

const DEMO_KOD = "QRK-7T2M";

/**
 * @param {{nevsor?: boolean}} [opciok] nevsor: true → a névsor nyitva
 */
export function osztalyKartya(opciok = {}) {
  const belso = `
    <p class="halvany">${esc(t("tura.demo_osztaly_leiras"))}</p>
    <div class="list-card">
      <div>
        <h3>${esc(t("tura.demo_osztaly_nev"))}</h3>
        <div class="list-card-meta">
          <span class="feladat-kod" id="tura-demo-kod-szoveg">${DEMO_KOD}</span>
          <span>${esc(t("osztalyok.diak_szam", { db: 22 }))}</span>
          <span>${DEMO_DATUM()}</span>
          <span class="badge aktiv">${esc(t("osztalyok.aktiv"))}</span>
        </div>
      </div>
      <div class="list-card-actions">
        <button class="btn-sm" type="button" id="tura-demo-kod">${esc(t("osztalyok.kod_gomb"))}</button>
        <button class="btn-sm" type="button" id="tura-demo-nevsor">${esc(t("osztalyok.nevsor_gomb"))}</button>
      </div>
    </div>
    <div class="nevsor-box" id="tura-demo-nevsor-lista" hidden>
      <table class="tabla">
        <thead><tr><th>${esc(t("osztalyok.oszlop_nev"))}</th><th>${esc(t("osztalyok.oszlop_csatlakozott"))}</th><th></th></tr></thead>
        <tbody>
          <tr><td>${esc(t("tura.demo_diak1"))}</td><td>${DEMO_DATUM_2()}</td><td>🗑</td></tr>
          <tr><td>${esc(t("tura.demo_diak2"))}</td><td>${DEMO_DATUM_2()}</td><td>🗑</td></tr>
          <tr><td>${esc(t("tura.demo_diak3"))}</td><td>${DEMO_DATUM_3()}</td><td>🗑</td></tr>
        </tbody>
      </table>
    </div>`;

  const el = panel("tura-demo-osztaly", t("nav.osztalyok"), belso);

  // A másolás itt is működik – hadd lássa, mi kerül a vágólapra
  el.querySelector("#tura-demo-kod").addEventListener("click", async (e) => {
    const gomb = e.currentTarget;
    try {
      await navigator.clipboard.writeText(DEMO_KOD);
      gomb.textContent = t("tura.demo_masolva");
    } catch {
      gomb.textContent = DEMO_KOD;
    }
    setTimeout(() => { gomb.textContent = t("osztalyok.kod_gomb"); }, 2500);
  });

  const lista = el.querySelector("#tura-demo-nevsor-lista");
  el.querySelector("#tura-demo-nevsor").addEventListener("click", () => {
    lista.hidden = !lista.hidden;
  });
  if (opciok.nevsor) lista.hidden = false;

  return el;
}

// ══════════════════════════════════════════
// 3. SZAKASZ – JAVÍTÁSI SOR
// ══════════════════════════════════════════

const DIAK = () => t("tura.demo_diak1");
const FELADAT = () => t("tura.demo_feladat");

const ATIRAT =
  "Dear Tom,\n\n" +
  "Thank you for your letter. I want to tell you about my last holiday. " +
  "Last summer I go to Croatia with my family. We stayed in a small hotel " +
  "near the beach. The weather was very nice and warm.\n\n" +
  "Every morning we swimming in the sea and after lunch we visited the " +
  "old town. I ate a lot of ice cream! One day we went to a island by " +
  "boat. It was the best day of the holiday.\n\n" +
  "What did you do in the summer? Please write me soon.\n\n" +
  "Best wishes,\nAnna";

const SZEMPONTOK = () => [
  { kulcs: "tartalom", pont: 9, max: 10, megjegyzes: t("tura.demo_sz_tartalom") },
  { kulcs: "szerkezet", pont: 8, max: 10, megjegyzes: t("tura.demo_sz_szerkezet") },
  { kulcs: "szokincs", pont: 7, max: 10, megjegyzes: t("tura.demo_sz_szokincs") },
  { kulcs: "nyelvtan", pont: 5, max: 10, megjegyzes: t("tura.demo_sz_nyelvtan") }
];

const HIBAK = () => [
  {
    kategoria: "nyelvtan", tipus: "past_simple",
    idezet: "Last summer I go to Croatia",
    javaslat: "Last summer I went to Croatia",
    magyarazat: t("tura.demo_hiba1")
  },
  {
    kategoria: "nyelvtan", tipus: "past_continuous_vs_simple",
    idezet: "every morning we swimming in the sea",
    javaslat: "every morning we swam in the sea",
    magyarazat: t("tura.demo_hiba2")
  },
  {
    kategoria: "nyelvtan", tipus: "article_a_an",
    idezet: "we went to a island",
    javaslat: "we went to an island",
    magyarazat: t("tura.demo_hiba3")
  }
];

/** A javítási sor egy kártyája – a valódi lista markupjával. */
export function javitasKartya() {
  const belso = `
    <p class="halvany">${esc(t("tura.demo_javitas_leiras"))}</p>
    <div class="list-card" id="tura-demo-kartya">
      <div>
        <h3>${esc(DIAK())}</h3>
        <div class="list-card-meta">
          <span>${esc(FELADAT())}</span>
          <span>${DEMO_DATUM()}</span>
          <span class="badge javitva">${esc(t("statusz.tanar.javitva"))}</span>
        </div>
      </div>
      <div class="list-card-actions">
        <button class="btn-sm" type="button" id="tura-demo-nyit">${esc(t("jav.megnyitas"))}</button>
      </div>
    </div>`;
  const el = panel("tura-demo-javitas", t("nav.javitas"), belso);
  // A "Megnyitás" itt is működik: a tanár maga is ki tudja nyitni
  el.querySelector("#tura-demo-nyit")
    .addEventListener("click", () => javitasModal());
  return el;
}

/**
 * A javító felület replikája.
 *
 * Élesben ez egy modál. A bemutatóban SZÁNDÉKOSAN panel: a modál
 * kitölti a képernyőt, és akkor a reflektor buborékának nincs hova
 * elférnie egyetlen kiemelt szekció mellett sem – a buborék eltakarná
 * azt, amire mutat. Panelként a lap normálisan görgethető, és a
 * buborék mindig a kiemelés mellé kerül. A szekciók, a táblázat és a
 * szövegek egyébként azonosak az élessel.
 */
export function javitasModal() {
  meglevoTorles("tura-demo-javito");

  const szempontok = SZEMPONTOK();
  const hibak = HIBAK();
  const osszes = szempontok.reduce((s, sz) => s + sz.pont, 0);
  const max = szempontok.reduce((s, sz) => s + sz.max, 0);
  const szazalek = Math.round((osszes / max) * 100);

  const belso = `
        <p class="halvany">
          ${esc(DIAK())} – ${esc(FELADAT())}
        </p>

        <div class="m-szekcio" id="tura-demo-fotok">
          <h4>${esc(t("jav.fotok_cim"))}</h4>
          <div class="kep-sor">${kezirasKep()}${kezirasKep()}</div>
        </div>

        <div class="m-szekcio" id="tura-demo-atirat">
          <h4>${esc(t("jav.atirat_cim"))}
            <span class="badge inaktiv">${esc(t("jav.olvashatosag_jo"))}</span>
          </h4>
          <p class="halvany">${esc(t("jav.atirat_figyelmeztetes"))}</p>
          <pre class="atirat">${esc(ATIRAT)}</pre>
        </div>

        <div class="m-szekcio" id="tura-demo-pontok">
          <h4>${esc(t("jav.ai_ertekeles_cim"))}
            <span class="badge javitva">${esc(t("vj.pont_osszes", { ossz: osszes, max }))} · ${szazalek}%</span>
          </h4>
          <table class="tabla">
            <thead><tr><th>${esc(t("beadas.szempont"))}</th><th>${esc(t("beadas.pont"))}</th><th>${esc(t("vj.megjegyzes"))}</th></tr></thead>
            <tbody>${szempontok.map((sz) => `
              <tr>
                <td>${esc(sz.kulcs)}</td>
                <td><strong>${sz.pont}</strong> / ${sz.max}</td>
                <td>${esc(sz.megjegyzes)}</td>
              </tr>`).join("")}</tbody>
          </table>

          <h4 style="margin-top:1.2rem;">${esc(t("jav.talalt_hibak", { db: hibak.length }))}</h4>
          <div class="hiba-lista">
            ${hibak.map((h) => `
              <div class="hiba-elem">
                <span class="badge inaktiv">${esc(h.kategoria)} · ${esc(h.tipus)}</span>
                <div><s>${esc(h.idezet)}</s> → <strong>${esc(h.javaslat)}</strong></div>
                <p class="halvany">${esc(h.magyarazat)}</p>
              </div>`).join("")}
          </div>
        </div>

        <div class="m-szekcio kiemelt" id="tura-demo-visszajelzes">
          <h4>${esc(t("jav.visszajelzes_cim"))}</h4>
          <p class="halvany">${esc(t("jav.visszajelzes_leiras"))}</p>
          <div class="form-group">
            <label for="tura-demo-jegy">${esc(t("jav.jegy_label"))}</label>
            <select id="tura-demo-jegy">
              <option value="">${esc(t("jav.nincs_jegy"))}</option>
              <option value="5">5</option><option value="4" selected>4</option>
              <option value="3">3</option><option value="2">2</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label for="tura-demo-szoveg">${esc(t("jav.szoveg_label"))}</label>
            <textarea id="tura-demo-szoveg" rows="5">${esc(t("tura.demo_visszajelzes_szoveg"))}</textarea>
          </div>
          <div class="gomb-sor">
            <button class="btn-primary" type="button" id="tura-demo-kuld">
              ${esc(t("jav.kuld"))}
            </button>
          </div>
          <p class="halvany" style="margin-top:0.5rem;">${esc(t("tura.demo_nem_kuld"))}</p>
        </div>`;

  const el = panel("tura-demo-javito", t("tura.demo_javito_cim"), belso);

  // Semmi ne menjen el véletlenül
  el.querySelector("#tura-demo-kuld").addEventListener("click", (e) => {
    e.preventDefault();
    e.currentTarget.textContent = t("tura.demo_nem_kuldunk");
    e.currentTarget.disabled = true;
  });
  return el;
}

export function javitasModalZar() {
  meglevoTorles("tura-demo-javito");
}

/**
 * Kézírásos oldal jelzése – valódi diákmunkát nem tehetünk ide, egy
 * üres négyzet viszont nem mondana semmit.
 */
function kezirasKep() {
  const vonalak = Array.from({ length: 7 }, (_, i) =>
    `<rect x="14" y="${26 + i * 16}" width="${[104, 92, 110, 78, 100, 86, 58][i]}" height="4" rx="2"/>`
  ).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 160" width="140" height="160">` +
    `<rect width="140" height="160" fill="#fffdf8"/>` +
    `<g fill="#c9c2b4">${vonalak}</g>` +
    `<text x="14" y="152" font-family="sans-serif" font-size="9" fill="#a09888">${esc(t("tura.demo_pelda_oldal"))}</text>` +
    `</svg>`;
  return `<img alt="${esc(t("tura.demo_kep_alt"))}" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" />`;
}

// ══════════════════════════════════════════
// 4. SZAKASZ – OSZTÁLYSZINTŰ ELEMZÉS
// ══════════════════════════════════════════

const ELEMZES_SZEMPONTOK = [
  { kulcs: "nyelvtan", atlag_pont: 5.4, max_pont: 10, szazalek: 54 },
  { kulcs: "szokincs", atlag_pont: 6.8, max_pont: 10, szazalek: 68 },
  { kulcs: "szerkezet", atlag_pont: 8.1, max_pont: 10, szazalek: 81 },
  { kulcs: "tartalom", atlag_pont: 8.6, max_pont: 10, szazalek: 86 }
];

// Az AI kódszava (magyar) → a megjelenített szöveg a valódi lapon is ezt használja
const GYAKORISAG_SZOVEG = {
  "általános": "elz.gyak_altalanos",
  "gyakori": "elz.gyak_gyakori",
  "szórványos": "elz.gyak_szorvanyos"
};

const TIPUSHIBAK = () => [
  {
    cim: t("tura.demo_tipus1_cim"),
    gyakorisag: "általános", kategoria: "nyelvtan",
    magyarazat: t("tura.demo_tipus1_mag"),
    peldak: ["Last summer I go to Croatia", "every morning we swimming in the sea"]
  },
  {
    cim: t("tura.demo_tipus2_cim"),
    gyakorisag: "gyakori", kategoria: "nyelvtan",
    magyarazat: t("tura.demo_tipus2_mag"),
    peldak: ["a island", "a interesting book"]
  },
  {
    cim: t("tura.demo_tipus3_cim"),
    gyakorisag: "gyakori", kategoria: "szokincs",
    magyarazat: t("tura.demo_tipus3_mag"),
    peldak: ["the weather was very nice", "the food was nice"]
  }
];

const GYAKORLATOK = () => [
  {
    cim: t("tura.demo_gyak1_cim"), idotartam_perc: 15,
    cel: t("tura.demo_gyak1_cel"),
    leiras: t("tura.demo_gyak1_leiras")
  },
  {
    cim: t("tura.demo_gyak2_cim"), idotartam_perc: 10,
    cel: t("tura.demo_gyak2_cel"),
    leiras: t("tura.demo_gyak2_leiras")
  },
  {
    cim: t("tura.demo_gyak3_cim"), idotartam_perc: 20,
    cel: t("tura.demo_gyak3_cel"),
    leiras: t("tura.demo_gyak3_leiras")
  }
];

function sav(szazalek) {
  const sz = Math.max(0, Math.min(100, Number(szazalek) || 0));
  const osztaly = sz < 50 ? "baj" : (sz < 75 ? "kozepes" : "jo");
  return `<div class="sav"><div class="sav-kitolt ${osztaly}" style="width:${sz}%"></div></div>`;
}

/** Az elemzés replikája – a valódi lap szekcióival, ugyanabban a sorrendben. */
export function elemzesDemo() {
  const belso = `
    <p class="halvany">${esc(t("tura.demo_elemzes_leiras"))}</p>

    <div class="list-card">
      <div>
        <h3>${esc(FELADAT())}</h3>
        <div class="list-card-meta">
          <span>${esc(t("tura.demo_osztaly_nev"))}</span>
          <span>${esc(t("elz.alcim_beadas", { db: 22 }))} · ${esc(t("elz.alcim_kiertekelt", { db: 22 }))}</span>
        </div>
      </div>
      <div class="list-card-actions">
        <button class="btn-sm" type="button" id="tura-demo-elemzes-gomb"
                title="${esc(t("fel.tipp_elemzes"))}">📊</button>
      </div>
    </div>

    <div class="stats-grid" id="tura-demo-szamok">
      <div class="stat-card">
        <div class="stat-label">${esc(t("elz.stat_atlag"))}</div>
        <div class="stat-value">72%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${esc(t("elz.stat_ertekelt"))}</div>
        <div class="stat-value">22</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${esc(t("elz.stat_nehez"))}</div>
        <div class="stat-value">3</div>
      </div>
    </div>

    <h4 id="tura-demo-szempontok">${esc(t("elz.szempontonkent_cim"))}</h4>
    <p class="halvany">${esc(t("elz.szempont_leiras"))}</p>
    ${ELEMZES_SZEMPONTOK.map((sz) => `
      <div class="sav-sor">
        <div class="sav-cimke">${esc(sz.kulcs)}</div>
        ${sav(sz.szazalek)}
        <div class="sav-ertek">${sz.atlag_pont}/${sz.max_pont} · ${sz.szazalek}%</div>
      </div>`).join("")}

    <h4 id="tura-demo-tipushibak" style="margin-top:1.4rem;">${esc(t("elz.tipushibak_cim"))}</h4>
    <p class="halvany">${esc(t("elz.tipus_leiras"))}</p>
    ${TIPUSHIBAK().map((h) => `
      <div class="elem-kartya">
        <h4>
          ${esc(h.cim)}
          <span class="badge ${h.gyakorisag === "általános" ? "feltoltve" : "javitva"}">${esc(t(GYAKORISAG_SZOVEG[h.gyakorisag]))}</span>
          <span class="badge inaktiv">${esc(h.kategoria)}</span>
        </h4>
        <p>${esc(h.magyarazat)}</p>
        <ul class="lista-pontok">${h.peldak.map((x) => `<li><em>${esc(x)}</em></li>`).join("")}</ul>
      </div>`).join("")}

    <h4 id="tura-demo-gyakorlatok" style="margin-top:1.4rem;">${esc(t("elz.gyakorlatok_cim"))}</h4>
    ${GYAKORLATOK().map((g) => `
      <div class="elem-kartya">
        <h4>${esc(g.cim)} <span class="badge inaktiv">${esc(t("elz.perc", { db: g.idotartam_perc }))}</span></h4>
        <p class="halvany"><strong>${esc(t("elz.cel"))}</strong> ${esc(g.cel)}</p>
        <p>${esc(g.leiras)}</p>
      </div>`).join("")}

    <div id="tura-demo-prompt" style="margin-top:1.4rem;">
      <h4>${esc(t("elz.prompt_cim"))}
        <button class="btn-sm" type="button" id="tura-demo-masol">${esc(t("elz.masolas"))}</button>
      </h4>
      <p class="halvany">${esc(t("elz.prompt_leiras"))}</p>
      <pre class="atirat">${esc(t("tura.demo_generalo_prompt"))}</pre>
    </div>`;

  const el = panel("tura-demo-elemzes", t("tura.elemzes_cim"), belso);

  // A másolás ITT IS működik: hadd próbálja ki élesben
  el.querySelector("#tura-demo-masol").addEventListener("click", async (e) => {
    const gomb = e.currentTarget;
    try {
      await navigator.clipboard.writeText(t("tura.demo_generalo_prompt"));
      gomb.textContent = t("tura.demo_masolva_vagolap");
    } catch {
      // Letiltott vágólap: jelöljük ki, hogy kézzel másolható legyen
      const pre = el.querySelector("pre");
      const r = document.createRange();
      r.selectNodeContents(pre);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      gomb.textContent = t("tura.demo_kijelolve");
    }
    setTimeout(() => { gomb.textContent = t("elz.masolas"); }, 2500);
  });

  return el;
}
