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

const JELZO = '<span class="badge tura-jelzo">BEMUTATÓ · nem valódi adat</span>';

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
      ${JELZO}
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
    <p class="halvany">
      Így jelenik meg egy kész osztály. A tényleges listád ez alatt van.
    </p>
    <div class="list-card">
      <div>
        <h3>9.b angol</h3>
        <div class="list-card-meta">
          <span class="feladat-kod" id="tura-demo-kod-szoveg">${DEMO_KOD}</span>
          <span>22 diák</span>
          <span>2026. 09. 27.</span>
          <span class="badge aktiv">✅ Aktív</span>
        </div>
      </div>
      <div class="list-card-actions">
        <button class="btn-sm" type="button" id="tura-demo-kod">📋 Kód</button>
        <button class="btn-sm" type="button" id="tura-demo-nevsor">👥 Névsor</button>
      </div>
    </div>
    <div class="nevsor-box" id="tura-demo-nevsor-lista" hidden>
      <table class="tabla">
        <thead><tr><th>Név</th><th>Csatlakozott</th><th></th></tr></thead>
        <tbody>
          <tr><td>Kovács Anna</td><td>2026. 09. 22.</td><td>🗑</td></tr>
          <tr><td>Nagy Bence</td><td>2026. 09. 22.</td><td>🗑</td></tr>
          <tr><td>Szabó Dóra</td><td>2026. 09. 23.</td><td>🗑</td></tr>
        </tbody>
      </table>
    </div>`;

  const el = panel("tura-demo-osztaly", "Osztályok", belso);

  // A másolás itt is működik – hadd lássa, mi kerül a vágólapra
  el.querySelector("#tura-demo-kod").addEventListener("click", async (e) => {
    const gomb = e.currentTarget;
    try {
      await navigator.clipboard.writeText(DEMO_KOD);
      gomb.textContent = "✓ Másolva";
    } catch {
      gomb.textContent = DEMO_KOD;
    }
    setTimeout(() => { gomb.textContent = "📋 Kód"; }, 2500);
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

const DIAK = "Kovács Anna";
const FELADAT = "My last holiday – levél";

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

const SZEMPONTOK = [
  { kulcs: "tartalom", pont: 9, max: 10, megjegyzes: "Minden kért pontot érint, a zárás is rendben." },
  { kulcs: "szerkezet", pont: 8, max: 10, megjegyzes: "Világos bekezdések, jó megszólítás és elköszönés." },
  { kulcs: "szokincs", pont: 7, max: 10, megjegyzes: "Megfelelő szókincs, de sok ismétlés (nice, very)." },
  { kulcs: "nyelvtan", pont: 5, max: 10, megjegyzes: "Az igeidők keverednek: a múlt idő nem következetes." }
];

const HIBAK = [
  {
    kategoria: "nyelvtan", tipus: "past_simple",
    idezet: "Last summer I go to Croatia",
    javaslat: "Last summer I went to Croatia",
    magyarazat: "Befejezett múlt esemény: past simple kell, nem jelen idő."
  },
  {
    kategoria: "nyelvtan", tipus: "past_continuous_vs_simple",
    idezet: "every morning we swimming in the sea",
    javaslat: "every morning we swam in the sea",
    magyarazat: "Ismétlődő múltbeli cselekvés past simple-ben áll."
  },
  {
    kategoria: "nyelvtan", tipus: "article_a_an",
    idezet: "we went to a island",
    javaslat: "we went to an island",
    magyarazat: "Magánhangzóval kezdődő szó előtt „an\" a helyes alak."
  }
];

/** A javítási sor egy kártyája – a valódi lista markupjával. */
export function javitasKartya() {
  const belso = `
    <p class="halvany">
      Így jelenik meg egy beadás, amint az AI végzett vele. A tényleges
      listád ez alatt van.
    </p>
    <div class="list-card" id="tura-demo-kartya">
      <div>
        <h3>${esc(DIAK)}</h3>
        <div class="list-card-meta">
          <span>${esc(FELADAT)}</span>
          <span>2026. 09. 27.</span>
          <span class="badge javitva">📝 ellenőrzésre vár</span>
        </div>
      </div>
      <div class="list-card-actions">
        <button class="btn-sm" type="button" id="tura-demo-nyit">Megnyitás</button>
      </div>
    </div>`;
  const el = panel("tura-demo-javitas", "Javítási sor", belso);
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

  const osszes = SZEMPONTOK.reduce((s, sz) => s + sz.pont, 0);
  const max = SZEMPONTOK.reduce((s, sz) => s + sz.max, 0);
  const szazalek = Math.round((osszes / max) * 100);

  const belso = `
        <p class="halvany">
          ${esc(DIAK)} – ${esc(FELADAT)}
        </p>

        <div class="m-szekcio" id="tura-demo-fotok">
          <h4>📷 Beadott fotók</h4>
          <div class="kep-sor">${kezirasKep()}${kezirasKep()}</div>
        </div>

        <div class="m-szekcio" id="tura-demo-atirat">
          <h4>✍️ Amit az AI kiolvasott
            <span class="badge inaktiv">jo olvashatóság</span>
          </h4>
          <p class="halvany">
            Ha ez nem egyezik a fotóval, az AI félreolvasott – ne a diákot
            hibáztasd.
          </p>
          <pre class="atirat">${esc(ATIRAT)}</pre>
        </div>

        <div class="m-szekcio" id="tura-demo-pontok">
          <h4>🤖 AI értékelés
            <span class="badge javitva">${osszes}/${max} pont · ${szazalek}%</span>
          </h4>
          <table class="tabla">
            <thead><tr><th>Szempont</th><th>Pont</th><th>Megjegyzés</th></tr></thead>
            <tbody>${SZEMPONTOK.map((sz) => `
              <tr>
                <td>${esc(sz.kulcs)}</td>
                <td><strong>${sz.pont}</strong> / ${sz.max}</td>
                <td>${esc(sz.megjegyzes)}</td>
              </tr>`).join("")}</tbody>
          </table>

          <h4 style="margin-top:1.2rem;">Talált hibák (${HIBAK.length})</h4>
          <div class="hiba-lista">
            ${HIBAK.map((h) => `
              <div class="hiba-elem">
                <span class="badge inaktiv">${esc(h.kategoria)} · ${esc(h.tipus)}</span>
                <div><s>${esc(h.idezet)}</s> → <strong>${esc(h.javaslat)}</strong></div>
                <p class="halvany">${esc(h.magyarazat)}</p>
              </div>`).join("")}
          </div>
        </div>

        <div class="m-szekcio kiemelt" id="tura-demo-visszajelzes">
          <h4>📧 Visszajelzés a diáknak</h4>
          <p class="halvany">
            Ezt – és csak ezt – fogja a diák látni, az elküldés után.
            Az AI javaslata előre be van írva; szerkeszd bátran.
          </p>
          <div class="form-group">
            <label for="tura-demo-jegy">Jegy (nem kötelező)</label>
            <select id="tura-demo-jegy">
              <option value="">– nincs jegy –</option>
              <option value="5">5</option><option value="4" selected>4</option>
              <option value="3">3</option><option value="2">2</option>
              <option value="1">1</option>
            </select>
          </div>
          <div class="form-group">
            <label for="tura-demo-szoveg">Szöveges visszajelzés</label>
            <textarea id="tura-demo-szoveg" rows="5">Kedves Anna!

Nagyon jól felépített levél lett: a megszólítás, a bekezdések és az elköszönés is a helyén van, és minden kért témát érintettél. A nyaralás hangulata átjön, a kérdésed a végén pedig pont olyan, amilyet egy ilyen levélben várunk.

Egy dologra érdemes figyelned: a múlt idő. Néhány helyen jelen időbe csúszott az elbeszélés ("I go", "we swimming"), pedig az egész levél a nyárról szól. Ha legközelebb írás után külön végigolvasod csak az igékre figyelve, a legtöbb ilyen hibát magad is megtalálod.

Szép munka volt!</textarea>
          </div>
          <div class="gomb-sor">
            <button class="btn-primary" type="button" id="tura-demo-kuld">
              📧 Elküldés a diáknak
            </button>
          </div>
          <p class="halvany" style="margin-top:0.5rem;">
            A bemutatóban ez a gomb nem küld semmit.
          </p>
        </div>`;

  const el = panel("tura-demo-javito", "Javító felület", belso);

  // Semmi ne menjen el véletlenül
  el.querySelector("#tura-demo-kuld").addEventListener("click", (e) => {
    e.preventDefault();
    e.currentTarget.textContent = "📧 A bemutatóban nem küldünk";
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
    `<text x="14" y="152" font-family="sans-serif" font-size="9" fill="#a09888">példa oldal</text>` +
    `</svg>`;
  return `<img alt="Példa a beadott oldalról" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" />`;
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

const TIPUSHIBAK = [
  {
    cim: "A múlt idő nem következetes",
    gyakorisag: "általános", kategoria: "nyelvtan",
    magyarazat: "Az elbeszélés közben jelen időbe csúszik vissza, jellemzően a második bekezdéstől.",
    peldak: ["Last summer I go to Croatia", "every morning we swimming in the sea"]
  },
  {
    cim: "Határozatlan articulus a/an keverése",
    gyakorisag: "gyakori", kategoria: "nyelvtan",
    magyarazat: "Magánhangzóval kezdődő szó előtt „a\" áll „an\" helyett.",
    peldak: ["a island", "a interesting book"]
  },
  {
    cim: "Szegényes melléknévhasználat",
    gyakorisag: "gyakori", kategoria: "szokincs",
    magyarazat: "A „nice\" és a „very good\" ismétlődik ott, ahol pontosabb szó kellene.",
    peldak: ["the weather was very nice", "the food was nice"]
  }
];

const GYAKORLATOK = [
  {
    cim: "Igeidő-vadászat a saját szövegben", idotartam_perc: 15,
    cel: "A diák maga találja meg az igeidő-csúszásokat.",
    leiras: "Mindenki visszakapja a saját dolgozatát, és csak az igéket karikázza be. Utána párban kicserélik, és a pár jelöli, hol érzi, hogy nem stimmel az idő. Zárásként 3 mondatot közösen javítunk a táblán."
  },
  {
    cim: "a / an rendezés", idotartam_perc: 10,
    cel: "Automatizálni a magánhangzó-szabályt.",
    leiras: "Húsz szókártya kerül a padra, két kupacba kell rendezni: a vagy an. Hangra döntenek, nem írásképre – itt bukik el az „hour\" és az „university\"."
  },
  {
    cim: "A „nice\" tilalom", idotartam_perc: 20,
    cel: "Pontosabb melléknevek aktív használata.",
    leiras: "Rövid leírást írnak a nyaralásukról, de a nice, good és very szavak tiltottak. Előtte közösen gyűjtünk 10 alternatívát a táblára, azokat használhatják."
  }
];

const GENERALO_PROMPT =
  "Készíts gyakorlósort egy magyar középiskolás angolcsoportnak, B1 szinten.\n\n" +
  "A csoport konkrét hibái, amikre célozni kell:\n" +
  "1. A past simple nem következetes: elbeszélés közben jelen időbe csúsznak.\n" +
  "2. A határozatlan articulus a/an keverése magánhangzó előtt.\n" +
  "3. Szegényes melléknévhasználat: a \"nice\" és \"very good\" ismétlődik.\n\n" +
  "Kérek 3 feladatot: (1) hibakeresés egy rövid, szándékosan hibás levélben, " +
  "(2) mondatátírás jelen időből múlt időbe, (3) melléknév-csere gyakorlat.\n" +
  "A feladatok nyelve angol legyen, az instrukciókat magyarul írd. " +
  "Adj megoldókulcsot is.";

function sav(szazalek) {
  const sz = Math.max(0, Math.min(100, Number(szazalek) || 0));
  const osztaly = sz < 50 ? "baj" : (sz < 75 ? "kozepes" : "jo");
  return `<div class="sav"><div class="sav-kitolt ${osztaly}" style="width:${sz}%"></div></div>`;
}

/** Az elemzés replikája – a valódi lap szekcióival, ugyanabban a sorrendben. */
export function elemzesDemo() {
  const belso = `
    <p class="halvany">
      Ezt kapod, ha egy feladat beadásait osztályszinten átnézeti az AI.
      Az alábbi szám és szöveg egy 22 fős csoport példaadata.
    </p>

    <div class="list-card">
      <div>
        <h3>My last holiday – levél</h3>
        <div class="list-card-meta">
          <span>9.b angol</span>
          <span>22 beadás · 22 kiértékelve</span>
        </div>
      </div>
      <div class="list-card-actions">
        <button class="btn-sm" type="button" id="tura-demo-elemzes-gomb"
                title="Osztályszintű elemzés">📊</button>
      </div>
    </div>

    <div class="stats-grid" id="tura-demo-szamok">
      <div class="stat-card">
        <div class="stat-label">Osztályátlag</div>
        <div class="stat-value">72%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Kiértékelt dolgozat</div>
        <div class="stat-value">22</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Nehezen olvasható</div>
        <div class="stat-value">3</div>
      </div>
    </div>

    <h4 id="tura-demo-szempontok">📊 Szempontonként</h4>
    <p class="halvany">A legrosszabbul teljesített szemponttal kezdve.</p>
    ${ELEMZES_SZEMPONTOK.map((sz) => `
      <div class="sav-sor">
        <div class="sav-cimke">${esc(sz.kulcs)}</div>
        ${sav(sz.szazalek)}
        <div class="sav-ertek">${sz.atlag_pont}/${sz.max_pont} · ${sz.szazalek}%</div>
      </div>`).join("")}

    <h4 id="tura-demo-tipushibak" style="margin-top:1.4rem;">🔁 Típushibák</h4>
    <p class="halvany">
      Jelentés szerint összevonva – a javító AI címkéi elcsúszhatnak, ezért
      nem a címkék, hanem a tartalmuk alapján csoportosítva.
    </p>
    ${TIPUSHIBAK.map((h) => `
      <div class="elem-kartya">
        <h4>
          ${esc(h.cim)}
          <span class="badge ${h.gyakorisag === "általános" ? "feltoltve" : "javitva"}">${esc(h.gyakorisag)}</span>
          <span class="badge inaktiv">${esc(h.kategoria)}</span>
        </h4>
        <p>${esc(h.magyarazat)}</p>
        <ul class="lista-pontok">${h.peldak.map((x) => `<li><em>${esc(x)}</em></li>`).join("")}</ul>
      </div>`).join("")}

    <h4 id="tura-demo-gyakorlatok" style="margin-top:1.4rem;">🎯 Javasolt gyakorlatok</h4>
    ${GYAKORLATOK.map((g) => `
      <div class="elem-kartya">
        <h4>${esc(g.cim)} <span class="badge inaktiv">${g.idotartam_perc} perc</span></h4>
        <p class="halvany"><strong>Cél:</strong> ${esc(g.cel)}</p>
        <p>${esc(g.leiras)}</p>
      </div>`).join("")}

    <div id="tura-demo-prompt" style="margin-top:1.4rem;">
      <h4>✨ Feladatgeneráló prompt
        <button class="btn-sm" type="button" id="tura-demo-masol">📋 Másolás</button>
      </h4>
      <p class="halvany">
        Bemásolhatod bármelyik AI-ba (ChatGPT, Gemini, Claude), és
        gyakorlósort generál az osztály konkrét hibáira.
      </p>
      <pre class="atirat">${esc(GENERALO_PROMPT)}</pre>
    </div>`;

  const el = panel("tura-demo-elemzes", "Osztályszintű elemzés", belso);

  // A másolás ITT IS működik: hadd próbálja ki élesben
  el.querySelector("#tura-demo-masol").addEventListener("click", async (e) => {
    const gomb = e.currentTarget;
    try {
      await navigator.clipboard.writeText(GENERALO_PROMPT);
      gomb.textContent = "✓ Vágólapra másolva";
    } catch {
      // Letiltott vágólap: jelöljük ki, hogy kézzel másolható legyen
      const pre = el.querySelector("pre");
      const r = document.createRange();
      r.selectNodeContents(pre);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      gomb.textContent = "Kijelöltem – Ctrl+C";
    }
    setTimeout(() => { gomb.textContent = "📋 Másolás"; }, 2500);
  });

  return el;
}
