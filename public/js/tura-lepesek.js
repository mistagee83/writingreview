// ══════════════════════════════════════════════════════
// WritingReview – a bemutató tartalma
//
// Négy szakasz, egymástól függetlenül is végignézhető. A motor
// (tura.js) ebből a fájlból dolgozik, tehát a szöveg és a lépéssorrend
// itt szerkeszthető anélkül, hogy a motorhoz hozzá kellene nyúlni.
//
// Egy lépés:
//   szakasz    – melyik szakaszhoz tartozik (SZAKASZOK.id)
//   oldal      – melyik lapon fut; lapváltásnál a motor odanavigál
//   cel        – CSS-szelektor a kiemelendő elemre, vagy null (középre)
//   cim/szoveg – a buborék tartalma: SZÓTÁRI KULCSOK (tura.<szakasz>_<n>_cim /
//                _szoveg); a motor t()-vel fordítja megjelenítéskor
//   elokeszit  – opcionális: panel kinyitása, példaadat berajzolása
//   utana      – opcionális: takarítás, ha a lépés átállított valamit
//
// A `cel` szelektoroknak LÉTEZŐ elemekre kell mutatniuk: erre van
// teszt (tests/tura.test.mjs), mert egy átnevezett id némán elrontaná
// a bemutatót – a reflektor üres helyre világítana.
// ══════════════════════════════════════════════════════

import {
  osztalyKartya, javitasKartya, javitasModal, javitasModalZar, elemzesDemo
} from "./tura-demo.js";

// ══════════════════════════════════════════
// SZAKASZOK
//
// A `kimenet` a legfontosabb mező: a menüben ez áll a kártyán. Nem azt
// írja, mit fogunk megnézni, hanem hogy MI LESZ A VÉGÉN – e nélkül
// senki nem vállal be egy több lépéses bemutatót.
// ══════════════════════════════════════════

export const SZAKASZOK = [
  {
    id: "osztalyok",
    ikon: "🎓",
    cim: "tura.osztalyok_cim",
    kimenet: "tura.osztalyok_kimenet",
    zaro: "tura.osztalyok_zaro"
  },
  {
    id: "feladatok",
    ikon: "📋",
    cim: "tura.feladatok_cim",
    kimenet: "tura.feladatok_kimenet",
    zaro: "tura.feladatok_zaro"
  },
  {
    id: "javitas",
    ikon: "✏️",
    cim: "tura.javitas_cim",
    kimenet: "tura.javitas_kimenet",
    zaro: "tura.javitas_zaro"
  },
  {
    id: "elemzes",
    ikon: "📊",
    cim: "tura.elemzes_cim",
    kimenet: "tura.elemzes_kimenet",
    zaro: "tura.elemzes_zaro"
  }
];

// ══════════════════════════════════════════
// ELŐKÉSZÍTŐK
// ══════════════════════════════════════════

// A "Új feladat" gomb le van tiltva, amíg nincs osztály – a bemutató
// kedvéért kinyitjuk, de a végén visszaállítjuk, ahogy találtuk.
let panelGombAllapot = null;

async function urlapNyitas() {
  const gomb = document.getElementById("btn-panel");
  const panel = document.getElementById("uj-panel");
  if (!gomb || !panel) return;

  if (panelGombAllapot === null) panelGombAllapot = gomb.disabled;
  gomb.disabled = false;

  if (rejtett(panel)) {
    gomb.click();           // a lap saját logikája nyitja, nem mi
    await varakozas(120);   // a panel megjelenésére
  }

  // Ha a lap logikája mégsem nyitotta ki (letiltott gomb, megváltozott
  // kezelő), magunk mutatjuk meg. A reflektor egy rejtett elemen nulla
  // méretű téglalapot kapna, és a bal felső sarokba világítana.
  if (rejtett(panel)) panel.style.display = "block";
}

function rejtett(el) {
  return el.style.display === "none" || el.offsetParent === null;
}

function urlapVisszaallitas() {
  const gomb = document.getElementById("btn-panel");
  if (gomb && panelGombAllapot !== null) gomb.disabled = panelGombAllapot;
  panelGombAllapot = null;
}

const varakozas = (ms) => new Promise((r) => setTimeout(r, ms));

async function modalNyitas() {
  javitasKartya();        // a kártya is látszódjon a modál mögött
  javitasModal();
  await varakozas(60);
}

// ══════════════════════════════════════════
// LÉPÉSEK
// ══════════════════════════════════════════

export const LEPESEK = [

  // ── 1. OSZTÁLY ÉS KÓD ──────────────────────────────
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#osztaly-nev",
    cim: "tura.osztalyok_1_cim",
    szoveg: "tura.osztalyok_1_szoveg"
  },
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#btn-letrehoz",
    cim: "tura.osztalyok_2_cim",
    szoveg: "tura.osztalyok_2_szoveg"
  },
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#tura-demo-kod",
    cim: "tura.osztalyok_3_cim",
    szoveg: "tura.osztalyok_3_szoveg",
    elokeszit: () => { osztalyKartya(); }
  },
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#tura-demo-nevsor",
    cim: "tura.osztalyok_4_cim",
    szoveg: "tura.osztalyok_4_szoveg",
    elokeszit: () => { osztalyKartya({ nevsor: true }); }
  },

  // ── 2. FELADAT KIADÁSA ─────────────────────────────
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#btn-panel",
    cim: "tura.feladatok_1_cim",
    szoveg: "tura.feladatok_1_szoveg",
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#upload-zone",
    cim: "tura.feladatok_2_cim",
    szoveg: "tura.feladatok_2_szoveg",
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#sablon-valaszto",
    cim: "tura.feladatok_3_cim",
    szoveg: "tura.feladatok_3_szoveg",
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#r-nyelv",
    cim: "tura.feladatok_4_cim",
    szoveg: "tura.feladatok_4_szoveg",
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#r-szint",
    cim: "tura.feladatok_5_cim",
    szoveg: "tura.feladatok_5_szoveg",
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#szempontok",
    cim: "tura.feladatok_6_cim",
    szoveg: "tura.feladatok_6_szoveg",
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#btn-mentes",
    cim: "tura.feladatok_7_cim",
    szoveg: "tura.feladatok_7_szoveg",
    elokeszit: urlapNyitas,
    utana: urlapVisszaallitas
  },

  // ── 3. JAVÍTÁS ÉS VISSZAJELZÉS ─────────────────────
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#szuro",
    cim: "tura.javitas_1_cim",
    szoveg: "tura.javitas_1_szoveg"
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-kartya",
    cim: "tura.javitas_2_cim",
    szoveg: "tura.javitas_2_szoveg",
    elokeszit: () => { javitasKartya(); }
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-atirat",
    cim: "tura.javitas_3_cim",
    szoveg: "tura.javitas_3_szoveg",
    elokeszit: modalNyitas
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-pontok",
    cim: "tura.javitas_4_cim",
    szoveg: "tura.javitas_4_szoveg",
    elokeszit: modalNyitas
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    // A szövegmezőre mutatunk, nem az egész szekcióra: a szekció a modál
    // alján áll, magasabb, mint amennyi hely a buboréknak marad mellette.
    cel: "#tura-demo-szoveg",
    cim: "tura.javitas_5_cim",
    szoveg: "tura.javitas_5_szoveg",
    elokeszit: modalNyitas
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-kuld",
    cim: "tura.javitas_6_cim",
    szoveg: "tura.javitas_6_szoveg",
    elokeszit: modalNyitas,
    utana: javitasModalZar
  },

  // ── 4. OSZTÁLYSZINTŰ ELEMZÉS ───────────────────────
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    // A valódi #lista több feladatnál magasabb a képernyőnél – egy
    // konkrét gombra mutatni pontosabb is, meg elfér mellette a buborék.
    cel: "#tura-demo-elemzes-gomb",
    cim: "tura.elemzes_1_cim",
    szoveg: "tura.elemzes_1_szoveg",
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-szempontok",
    cim: "tura.elemzes_2_cim",
    szoveg: "tura.elemzes_2_szoveg",
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-tipushibak",
    cim: "tura.elemzes_3_cim",
    szoveg: "tura.elemzes_3_szoveg",
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-gyakorlatok",
    cim: "tura.elemzes_4_cim",
    szoveg: "tura.elemzes_4_szoveg",
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-prompt",
    cim: "tura.elemzes_5_cim",
    szoveg: "tura.elemzes_5_szoveg",
    elokeszit: () => { elemzesDemo(); }
  }
];

/** Egy szakasz lépései, a LEPESEK sorrendjében. */
export function szakaszLepesei(szakaszId) {
  return LEPESEK.filter((l) => l.szakasz === szakaszId);
}
