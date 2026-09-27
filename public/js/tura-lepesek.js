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
//   cim/szoveg – a buborék tartalma
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
    cim: "Osztály és kód",
    perc: 2,
    kimenet: "A végén lesz egy osztálykódod, amit elküldhetsz a diákjaidnak.",
    zaro: "Ha van osztályod és kódod, a diákok már be tudnak lépni. " +
          "A következő szakasz arról szól, hogy legyen mit beadniuk."
  },
  {
    id: "feladatok",
    ikon: "📋",
    cim: "Feladat kiadása",
    perc: 3,
    kimenet: "A végén lesz egy kiadott feladatod értékelési rubrikával, amit a diákok látnak.",
    zaro: "A feladat kiadva. Amikor beérkeznek a dolgozatok, a Javítási " +
          "soron dolgozod fel őket – az a következő szakasz."
  },
  {
    id: "javitas",
    ikon: "✏️",
    cim: "Javítás és visszajelzés",
    perc: 3,
    kimenet: "Látni fogod, hogyan ellenőrzöd az AI pontozását, és pontosan mit kap meg a diák.",
    zaro: "Ezzel egy dolgozat kész. Az utolsó szakasz azt mutatja, mit " +
          "lehet kihozni az EGÉSZ osztály beadásaiból egyszerre."
  },
  {
    id: "elemzes",
    ikon: "📊",
    cim: "Osztályszintű elemzés",
    perc: 3,
    kimenet: "A végén egy kimásolható promptot kapsz, amivel gyakorlósort generálhatsz az osztály saját hibáira.",
    zaro: "Ezzel körbejártuk a rendszert. A villanykörtével bármikor " +
          "visszatérhetsz egy szakaszra."
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
    cim: "Először egy osztály kell",
    szoveg: `
      <p>Minden itt kezdődik: a feladatok és a beadások is egy osztályhoz
      tartoznak.</p>
      <p>Írd be a nevét úgy, ahogy magadnak hívod – <em>9.b angol</em>,
      <em>11. emelt</em>. A diákok is ezt fogják látni.</p>`
  },
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#btn-letrehoz",
    cim: "A kód magától elkészül",
    szoveg: `
      <p>Létrehozáskor a rendszer ad egy egyedi csatlakozási kódot. Neked
      nem kell kitalálnod, és nem is tudod elírni.</p>
      <p>Egy osztálynak <strong>egy kódja</strong> van, nem feladatonként
      külön – a diák egyszer csatlakozik, utána minden feladatot lát.</p>`
  },
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#tura-demo-kod",
    cim: "Ezt a kódot küldd el nekik",
    szoveg: `
      <p>Így fog kinézni a kész osztály. A <strong>📋 Kód</strong> gombbal
      vágólapra kerül a kód – utána már csak be kell másolnod oda, ahol a
      diákjaiddal beszélsz (Teams, e-mail, Classroom).</p>
      <p>A diák regisztrál, beírja a kódot, és bekerül a névsorba.</p>`,
    elokeszit: () => { osztalyKartya(); }
  },
  {
    szakasz: "osztalyok",
    oldal: "osztalyok.html",
    cel: "#tura-demo-nevsor",
    cim: "A névsorban látod, ki lépett be",
    szoveg: `
      <p>Itt ellenőrizheted, hogy mindenki csatlakozott-e, és innen tudsz
      diákot el is távolítani, ha rossz osztályba lépett be.</p>
      <p>Ha valaki rosszul írta be a nevét, ő maga is átírhatja a saját
      felületén – nem kell veled egyeztetnie.</p>`,
    elokeszit: () => { osztalyKartya({ nevsor: true }); }
  },

  // ── 2. FELADAT KIADÁSA ─────────────────────────────
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#btn-panel",
    cim: "Új feladat",
    szoveg: `
      <p>Egy feladat mindig egy osztályhoz szól. Ha ugyanazt két
      csoportnak adod ki, később egy kattintással átmásolhatod a
      másiknak – nem kell újra beállítani.</p>`,
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#upload-zone",
    cim: "Fotózd le a feladatlapot",
    szoveg: `
      <p>Itt töltesz fel képet a feladatlapról. Az AI elolvassa, és
      <strong>kitölti helyetted az értékelési rubrikát</strong>: típus,
      szint, terjedelem, szempontok.</p>
      <p>Nem kötelező: ha nincs feladatlapod, minden mezőt kézzel is
      megadhatsz. A feltöltés csak gyorsítás.</p>`,
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#sablon-valaszto",
    cim: "Vagy töltsd be egy bevált sablont",
    szoveg: `
      <p>Ha egyszer összeállítottál egy jó rubrikát, elmentheted
      sablonként, és legközelebb egy választással betöltöd.</p>
      <p>A sablon a rubrika <em>újrahasznosítható</em> részét tartja meg –
      típus, szint, szempontok, pontok. A konkrét feladatleírást nem,
      mert az minden feladatlapnál más.</p>`,
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#r-nyelv",
    cim: "A dolgozat nyelve",
    szoveg: `
      <p>Ez nem csak felirat: ettől függ, milyen tanárként értékel az AI,
      és milyen nyelvtani fogalmakkal címkézi a hibákat.</p>
      <p>Nyolc nyelv választható, a magyar is – szóval nemcsak
      nyelvtanárok tudják használni.</p>`,
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#r-szint",
    cim: "A szint követi a nyelvet",
    szoveg: `
      <p>Idegen nyelvnél <strong>CEFR-szintet</strong> kérünk (A1–C1):
      ehhez méri a pontokat az AI.</p>
      <p>Ha a nyelvet <strong>magyarra</strong> állítod, ez a mező
      évfolyamra vált – anyanyelvi dolgozatnál a B1-nek nincs értelme.
      Próbáld ki: a mező kattintható, és a fenti nyelvválasztó is.</p>
      <p>Ha egyik sem illik, a <em>nem releváns</em> is választható. Akkor
      az AI nem méri semmilyen szinthez.</p>`,
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#szempontok",
    cim: "Szempontok és pontok – szabadon",
    szoveg: `
      <p>Nincs kötött 100 pont. Átírhatod a pontszámokat 50-re, 20-ra,
      ahogy a saját dolgozatod működik, és szempontot is vehetsz fel vagy
      törölhetsz.</p>
      <p>A fenti jelző mindig mutatja az aktuális összeget – az lesz a
      dolgozat maximuma.</p>`,
    elokeszit: urlapNyitas
  },
  {
    szakasz: "feladatok",
    oldal: "feladatok.html",
    cel: "#btn-mentes",
    cim: "Mentés – és innentől látják",
    szoveg: `
      <p>Mentés után a feladat megjelenik a diákok felületén, és
      beadhatják rá a dolgozatot.</p>
      <p>A <strong>💾 Mentés sablonként</strong> ezt a rubrikát teszi el a
      következő feladathoz. Érdemes az elsőnél megtenni.</p>`,
    elokeszit: urlapNyitas,
    utana: urlapVisszaallitas
  },

  // ── 3. JAVÍTÁS ÉS VISSZAJELZÉS ─────────────────────
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#szuro",
    cim: "A javítási sor állapotai",
    szoveg: `
      <p>Amikor egy diák beadja a dolgozatát, az AI magától elkezdi
      feldolgozni – neked nem kell elindítanod semmit.</p>
      <p>Ezekkel a szűrőkkel látod, mi hol tart: <em>feldolgozás
      alatt</em>, <em>ellenőrzésre vár</em>, <em>elküldve</em>. Ami
      hibára futott, azt egy kattintással újrafuttathatod.</p>`
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-kartya",
    cim: "Egy kész beadás",
    szoveg: `
      <p>Így jelenik meg egy dolgozat, amivel az AI végzett. A
      <strong>Megnyitás</strong> hozza fel a javító felületet.</p>
      <p>Ez a kártya példa – a tényleges listád alatta van.</p>`,
    elokeszit: () => { javitasKartya(); }
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-atirat",
    cim: "Előbb az átirat, csak utána a pontszám",
    szoveg: `
      <p><strong>Ez a rendszer legfontosabb része.</strong> Itt látod,
      amit az AI a kézírásból kiolvasott.</p>
      <p>Ha az átirat nem egyezik a fotóval, akkor az AI olvasott félre –
      nem a diák hibázott. E nélkül a kettőt nem lehetne különválasztani,
      és igazságtalanul pontoznál.</p>`,
    elokeszit: modalNyitas
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-pontok",
    cim: "Pontozás és talált hibák",
    szoveg: `
      <p>Szempontonként kapod a pontokat, a te rubrikád szerint, rövid
      indoklással.</p>
      <p>A hibalista idézi a diák saját szövegét, mellé a javítást és egy
      magyarázatot. Ugyanezekből a címkékből készül később az
      osztályszintű elemzés.</p>`,
    elokeszit: modalNyitas
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    // A szövegmezőre mutatunk, nem az egész szekcióra: a szekció a modál
    // alján áll, magasabb, mint amennyi hely a buboréknak marad mellette.
    cel: "#tura-demo-szoveg",
    cim: "Ezt – és csak ezt – kapja a diák",
    szoveg: `
      <p>Az AI javaslata előre be van írva, de <strong>a szöveg a
      tiéd</strong>: átírhatod, kihúzhatsz belőle, hozzátehetsz.</p>
      <p>A diák nem látja a pontozó táblát és a hibalistát, csak ezt a
      szöveget és a jegyet, ha adsz. A jegy nem kötelező.</p>`,
    elokeszit: modalNyitas
  },
  {
    szakasz: "javitas",
    oldal: "javitas.html",
    cel: "#tura-demo-kuld",
    cim: "Semmi nem megy ki jóváhagyás nélkül",
    szoveg: `
      <p>A diák addig semmit nem lát, amíg ezt meg nem nyomod. Az AI
      értékelése nálad marad.</p>
      <p>Elküldés után is módosíthatod: a diák a frissített szöveget
      fogja látni.</p>`,
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
    cim: "Innen indul, egy feladat sorából",
    szoveg: `
      <p>A feladatok listájában minden sor végén van egy
      <strong>📊</strong> gomb. Az nézi át az adott feladat összes
      beadását egyszerre.</p>
      <p>Érdemes akkor futtatni, ha már 10-15 dolgozat kiértékelt –
      kevesebből nem lesz osztályszintű kép. Az elemzés maga is szól, ha
      túl kevés adat van.</p>`,
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-szempontok",
    cim: "Hol áll az osztály",
    szoveg: `
      <p>Szempontonként, a legrosszabbal kezdve. Ebből azonnal látszik,
      hogy a tartalommal nincs baj, a nyelvhelyességgel viszont van.</p>`,
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-tipushibak",
    cim: "Típushibák, jelentés szerint összevonva",
    szoveg: `
      <p>Nem címkék szerint csoportosít, hanem tartalom szerint: a
      <em>past_simple</em> és a <em>past_tense_wrong</em> ugyanaz a hiba,
      és egy sorban jelenik meg.</p>
      <p>A gyakoriság azt mondja meg, az osztály mekkora részét érinti –
      ebből tudod, mi az, amit érdemes órán elővenni.</p>`,
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-gyakorlatok",
    cim: "Konkrét gyakorlatok, nem általánosságok",
    szoveg: `
      <p>Nem azt írja, hogy „gyakoroljátok a múlt időt", hanem eljárást
      ad: mit csinálnak a diákok, milyen formában, mennyi ideig.</p>
      <p>Annyira konkrétan, hogy holnap be tudd vinni az órára.</p>`,
    elokeszit: () => { elemzesDemo(); }
  },
  {
    szakasz: "elemzes",
    oldal: "feladatok.html",
    cel: "#tura-demo-prompt",
    cim: "És egy prompt, amit bárhol felhasználhatsz",
    szoveg: `
      <p>Ez egy kész prompt az osztály <em>saját</em> hibáira. Bemásolod
      bármelyik AI-ba (ChatGPT, Gemini, Claude), és generál egy
      gyakorlósort megoldókulccsal.</p>
      <p>A <strong>📋 Másolás</strong> most is működik – próbáld ki.</p>`,
    elokeszit: () => { elemzesDemo(); }
  }
];

/** Egy szakasz lépései, a LEPESEK sorrendjében. */
export function szakaszLepesei(szakaszId) {
  return LEPESEK.filter((l) => l.szakasz === szakaszId);
}
