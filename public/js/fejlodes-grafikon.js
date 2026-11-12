// ══════════════════════════════════════════════════════
// WritingReview – a "Fejlődés az idő mentén" két grafikonja és az ismétlődő hibák
//
// Bemenet: a fejlodesDiak callable válasza (pontok időrendben, ismetlodo).
//   1. vonaldiagram: a tanár által jóváhagyott pontszázalék feladatról feladatra
//   2. halmozott oszlopdiagram: a hibák kategóriánként feladatonként
//   3. lista: az ismétlődő hibatípusok
//
// A színek és a jelek a dataviz-szabályok szerint: a kategóriák fix sorrendű
// színhelyet kapnak (a szín az entitást követi, nem a rangsort), vékony jelek,
// 2 px felületszín-rés a szegmensek közt, jelmagyarázat, tooltip (hoverre és
// fókuszra), és a táblázatos nézet a diakok.html-ben. A címkék és nevek
// textContent-tel kerülnek a DOM-ba. Színtokenek: css/app.css (.viz-root).
// ══════════════════════════════════════════════════════

import { t } from "./i18n.js";

const SVG = "http://www.w3.org/2000/svg";

// Fix sorrend: a hibakategóriák az 1–7. színhelyet kapják (a szerver zárt készlete + "egyéb").
// A sorrend validált (adjacent CVD ΔE >= 9, normál látás >= 19); ne rendezd át.
const KATEGORIAK = ["nyelvtan", "szokincs", "szerkezet", "tartalom", "helyesiras", "irasjelek", "egyeb"];

const szin = (kat) => `var(--series-${KATEGORIAK.indexOf(kat) + 1})`;
const katNev = (kat) => t(`diakok.kat_${kat}`);
const katKulcs = (kulcs) => (KATEGORIAK.includes(kulcs) ? kulcs : "egyeb");

function el(nev, attr = {}, szoveg) {
  const e = document.createElement(nev);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  if (szoveg != null) e.textContent = szoveg;
  return e;
}

function svgEl(nev, attr = {}, szoveg) {
  const e = document.createElementNS(SVG, nev);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, String(v));
  if (szoveg != null) e.textContent = szoveg;
  return e;
}

function feladatNev(p, i) {
  return p.feladat_cim || t("diakok.graf_feladat_sorszam", { n: i + 1 });
}

function roviditve(szoveg, max = 12) {
  return szoveg.length > max ? `${szoveg.slice(0, max - 1)}…` : szoveg;
}

// ── tooltip: egy darab, a konténer fölött ──

function tooltipKeszit(konteiner) {
  const doboz = el("div", { class: "viz-tooltip", role: "status" });
  doboz.hidden = true;
  konteiner.appendChild(doboz);
  return {
    mutat(svg, cx, W, cim, sorok) {
      doboz.replaceChildren(el("div", { class: "viz-tt-cim" }, cim));
      for (const s of sorok) {
        const sor = el("div", { class: "viz-tt-sor" });
        if (s.szin) {
          const kulcs = el("span", { class: "viz-tt-kulcs" });
          kulcs.style.background = s.szin;
          sor.appendChild(kulcs);
        }
        sor.appendChild(el("strong", {}, s.ertek));
        sor.appendChild(el("span", { class: "viz-tt-cimke" }, s.cimke));
        doboz.appendChild(sor);
      }
      doboz.hidden = false;
      const skala = svg.getBoundingClientRect().width / W;
      const szeles = doboz.offsetWidth;
      const bal = Math.min(Math.max(cx * skala - szeles / 2, 0), konteiner.clientWidth - szeles);
      doboz.style.left = `${bal}px`;
    },
    rejt() { doboz.hidden = true; }
  };
}

// ── közös váz: rács, tengelyfeliratok, címkék ──

const W = 640;
const M = { l: 44, r: 20, t: 20, b: 44 };

function keret(H, leiras) {
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "viz-svg", role: "img", "aria-label": leiras });
  return svg;
}

function savok(n) {
  const sav = (W - M.l - M.r) / n;
  return { sav, cx: (i) => M.l + sav * (i + 0.5) };
}

function xCimkek(svg, pontok, H, cx, sav) {
  // sok feladatnál csak minden k-adik címke, hogy ne érjenek egymásba (a tooltip és a táblázat mindet tartalmazza)
  const lepes = Math.max(1, Math.ceil(pontok.length / Math.floor((W - M.l - M.r) / 80)));
  pontok.forEach((p, i) => {
    if (i % lepes !== 0) return;
    svg.appendChild(svgEl("text", {
      x: cx(i), y: H - M.b + 20, class: "viz-tengely", "text-anchor": "middle"
    }, roviditve(feladatNev(p, i), Math.max(6, Math.floor((sav * lepes) / 7)))));
  });
}

function racs(svg, H, tickek, y) {
  for (const v of tickek) {
    svg.appendChild(svgEl("line", {
      x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: v === 0 ? "viz-alap" : "viz-racs"
    }));
    svg.appendChild(svgEl("text", {
      x: M.l - 8, y: y(v) + 4, class: "viz-tengely", "text-anchor": "end"
    }, String(v)));
  }
}

function kartya(cim, alcim) {
  const k = el("section", { class: "viz-root viz-kartya" });
  k.appendChild(el("h3", { class: "viz-cim" }, cim));
  if (alcim) k.appendChild(el("p", { class: "viz-alcim" }, alcim));
  const tarto = el("div", { class: "viz-tarto" });
  k.appendChild(tarto);
  return { k, tarto };
}

// ══════════════════════════════════════════════════════
// 1. A pontszázalék vonaldiagramja
// ══════════════════════════════════════════════════════
export function pontGrafikon(pontok) {
  const H = 250;
  const { k, tarto } = kartya(t("diakok.graf_pont_cim"), t("diakok.graf_pont_alcim"));
  const n = pontok.length;
  const { sav, cx } = savok(n);
  const y = (v) => M.t + (H - M.t - M.b) * (1 - v / 100);

  const svg = keret(H, t("diakok.graf_pont_leiras", { db: n }));
  racs(svg, H, [0, 25, 50, 75, 100], y);

  const pontXY = pontok.map((p, i) => [cx(i), y(p.szazalek)]);
  if (n >= 2) {
    const vonal = pontXY.map(([x, yy], i) => `${i ? "L" : "M"}${x},${yy}`).join(" ");
    svg.appendChild(svgEl("path", {
      d: `${vonal} L${pontXY[n - 1][0]},${y(0)} L${pontXY[0][0]},${y(0)} Z`, class: "viz-terulet"
    }));
    svg.appendChild(svgEl("path", { d: vonal, class: "viz-vonal" }));
  }

  const kereszt = svgEl("line", { y1: M.t, y2: H - M.b, class: "viz-kereszt" });
  kereszt.style.display = "none";
  svg.appendChild(kereszt);

  pontXY.forEach(([x, yy]) => svg.appendChild(svgEl("circle", { cx: x, cy: yy, r: 4.5, class: "viz-pont" })));

  // a vonal végén az utolsó érték (szöveg-tokennel, nem a sorozat színével)
  // ha az utolsó pont esik, a felirat alá kerül, hogy ne fusson rá a vonalra
  const [ux, uy] = pontXY[n - 1];
  const esik = n >= 2 && pontok[n - 1].szazalek < pontok[n - 2].szazalek;
  svg.appendChild(svgEl("text", {
    x: ux, y: esik ? uy + 22 : uy - 12, class: "viz-ertek", "text-anchor": "middle"
  }, `${pontok[n - 1].szazalek}%`));

  xCimkek(svg, pontok, H, cx, sav);

  tarto.appendChild(svg);
  const tip = tooltipKeszit(tarto);

  pontok.forEach((p, i) => {
    const mutat = () => {
      kereszt.setAttribute("x1", cx(i));
      kereszt.setAttribute("x2", cx(i));
      kereszt.style.display = "";
      tip.mutat(svg, cx(i), W, feladatNev(p, i), [
        { ertek: `${p.szazalek}%`, cimke: t("diakok.graf_eredmeny"), szin: "var(--series-1)" }
      ]);
    };
    const rejt = () => { kereszt.style.display = "none"; tip.rejt(); };
    const hit = svgEl("rect", {
      x: M.l + sav * i, y: M.t, width: sav, height: H - M.t - M.b, class: "viz-hit",
      tabindex: 0, "aria-label": `${feladatNev(p, i)}: ${p.szazalek}%`
    });
    hit.addEventListener("pointerenter", mutat);
    hit.addEventListener("pointermove", mutat);
    hit.addEventListener("pointerleave", rejt);
    hit.addEventListener("focus", mutat);
    hit.addEventListener("blur", rejt);
    svg.appendChild(hit);
  });
  return k;
}

// ══════════════════════════════════════════════════════
// 2. A hibák kategóriánként (halmozott oszlopok)
// ══════════════════════════════════════════════════════

// Szép felső határ és lépés: legfeljebb 5 osztás, egész számok.
function skalaFelso(max) {
  const lepes = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((l) => max / l <= 5) || 1000;
  return { lepes, felso: Math.max(lepes, Math.ceil(max / lepes) * lepes) };
}

// Az ismeretlen kategóriák az "egyéb" oszlopba kerülnek.
function osszesitett(p) {
  const ki = {};
  for (const [kulcs, db] of Object.entries(p.kategoriak || {})) {
    const kat = katKulcs(kulcs);
    ki[kat] = (ki[kat] || 0) + db;
  }
  return ki;
}

export function hibaGrafikon(pontok) {
  const { k, tarto } = kartya(t("diakok.graf_hiba_cim"), t("diakok.graf_hiba_alcim"));
  const adatok = pontok.map(osszesitett);
  const jelenlevo = KATEGORIAK.filter((kat) => adatok.some((a) => a[kat]));

  if (!jelenlevo.length) {
    tarto.appendChild(el("p", { class: "halvany" }, t("diakok.graf_nincs_hiba")));
    return k;
  }

  const H = 250;
  const n = pontok.length;
  const { sav, cx } = savok(n);
  const maximum = Math.max(...adatok.map((a) => Object.values(a).reduce((s, v) => s + v, 0)));
  const { lepes, felso } = skalaFelso(maximum);
  const y = (v) => M.t + (H - M.t - M.b) * (1 - v / felso);
  const tickek = [];
  for (let v = 0; v <= felso; v += lepes) tickek.push(v);

  const svg = keret(H, t("diakok.graf_hiba_leiras", { db: n }));
  racs(svg, H, tickek, y);

  const szeles = Math.min(24, sav * 0.6);
  const RES = 2;
  const sarok = 4;

  adatok.forEach((a, i) => {
    const bal = cx(i) - szeles / 2;
    let alj = y(0);
    const resz = jelenlevo.filter((kat) => a[kat]);
    resz.forEach((kat, j) => {
      const magas = y(0) - y(a[kat]);
      const felsoY = alj - magas;
      const utolso = j === resz.length - 1;
      // az alsó szegmens az alapvonalig ér; a többi felső szélén a felületszínű rés fut
      const rajz = j === 0 ? magas : Math.max(magas - RES, 1);
      const also = alj - (magas - rajz);
      const attr = { fill: szin(kat), class: "viz-szegmens" };
      if (utolso) {
        // csak az oszlop teteje lekerekített (4 px), az alapvonalnál szögletes
        const r = Math.min(sarok, rajz);
        svg.appendChild(svgEl("path", {
          ...attr,
          d: `M${bal},${also} V${felsoY + r} Q${bal},${felsoY} ${bal + r},${felsoY} H${bal + szeles - r} Q${bal + szeles},${felsoY} ${bal + szeles},${felsoY + r} V${also} Z`
        }));
      } else {
        svg.appendChild(svgEl("rect", { ...attr, x: bal, y: felsoY, width: szeles, height: rajz }));
      }
      alj = felsoY;
    });
  });

  xCimkek(svg, pontok, H, cx, sav);
  tarto.appendChild(svg);
  const tip = tooltipKeszit(tarto);

  pontok.forEach((p, i) => {
    const a = adatok[i];
    const ossz = Object.values(a).reduce((s, v) => s + v, 0);
    const mutat = () => tip.mutat(svg, cx(i), W, feladatNev(p, i), [
      ...jelenlevo.filter((kat) => a[kat]).reverse()
        .map((kat) => ({ ertek: String(a[kat]), cimke: katNev(kat), szin: szin(kat) })),
      { ertek: String(ossz), cimke: t("diakok.graf_osszes") }
    ]);
    const hit = svgEl("rect", {
      x: M.l + sav * i, y: M.t, width: sav, height: H - M.t - M.b, class: "viz-hit",
      tabindex: 0, "aria-label": `${feladatNev(p, i)}: ${t("diakok.graf_hiba_db", { db: ossz })}`
    });
    hit.addEventListener("pointerenter", mutat);
    hit.addEventListener("pointermove", mutat);
    hit.addEventListener("pointerleave", tip.rejt);
    hit.addEventListener("focus", mutat);
    hit.addEventListener("blur", tip.rejt);
    svg.appendChild(hit);
  });

  // jelmagyarázat (mindig, 2+ sorozatnál): a jel a szín, a felirat szöveg-tokenes
  const jelmagyarazat = el("ul", { class: "viz-jelmagyarazat" });
  for (const kat of jelenlevo) {
    const li = el("li");
    const jel = el("span", { class: "viz-jel" });
    jel.style.background = szin(kat);
    li.appendChild(jel);
    li.appendChild(document.createTextNode(katNev(kat)));
    jelmagyarazat.appendChild(li);
  }
  k.appendChild(jelmagyarazat);
  return k;
}

// ══════════════════════════════════════════════════════
// 3. Az ismétlődő hibatípusok
// ══════════════════════════════════════════════════════
export function ismetlodoLista(ismetlodo) {
  const k = el("section", { class: "viz-root viz-kartya" });
  k.appendChild(el("h3", { class: "viz-cim" }, t("diakok.ismetlodo_cim")));
  k.appendChild(el("p", { class: "viz-alcim" }, t("diakok.ismetlodo_alcim")));
  if (!ismetlodo.length) {
    k.appendChild(el("p", { class: "halvany" }, t("diakok.ismetlodo_nincs")));
    return k;
  }
  const lista = el("ul", { class: "viz-hibalista" });
  for (const h of ismetlodo) {
    const li = el("li");
    const jel = el("span", { class: "viz-jel" });
    jel.style.background = szin(katKulcs(h.kategoria));
    li.appendChild(jel);
    li.appendChild(el("strong", {}, h.tipus));
    li.appendChild(el("span", { class: "halvany" },
      ` ${katNev(katKulcs(h.kategoria))} · ${t("diakok.ismetlodo_sor", { feladat_db: h.feladat_db, db: h.db })}`));
    if (h.legutobbi) li.appendChild(el("span", { class: "viz-cimke-uj" }, t("diakok.ismetlodo_legutobbi")));
    lista.appendChild(li);
  }
  k.appendChild(lista);
  return k;
}
