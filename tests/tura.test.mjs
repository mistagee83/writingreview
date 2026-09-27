// ══════════════════════════════════════════════════════
// Beépített bemutató – a lépések és a felület egyezése
//
// Miért külön teszt: a bemutató szelektorokkal mutat a valódi felület
// elemeire. Ha valaki átnevez egy id-t a HTML-ben, a bemutató NEM dob
// hibát – a reflektor egyszerűen üres helyre világít, vagy cél nélkül
// középre teszi a buborékot. Ez csendes törés, pont az a fajta, amit
// csak teszt fog meg.
//
// A motor (tura.js) két dolgot feltételez a lépéssorról, és mindkettő
// itt van ellenőrizve:
//   1. egy szakasz lépései FOLYTONOSAK a LEPESEK-ben (a futás egy
//      tol..ig intervallum),
//   2. minden szakasznak van kimenet szövege (a menü kártyája erre épül).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const OLDAL_GYOKER = new URL("../public/", import.meta.url);

function oldalSzoveg(oldal) {
  return readFileSync(new URL(oldal, OLDAL_GYOKER), "utf8");
}

const demoSzoveg = readFileSync(
  new URL("js/tura-demo.js", OLDAL_GYOKER), "utf8"
);

// Az importálás ELŐTT: a bemutató moduljai szándékosan nem függenek a
// Firebase SDK-tól. Ha valaki mégis behozza, a Node-os betöltés egy
// értelmezhetetlen hálózati hibával megölné az egész fájlt – inkább
// mondjuk meg, mi a baj.
if (/from\s+["']\.\/firebase-config\.js["']/.test(demoSzoveg)) {
  throw new Error(
    "A tura-demo.js a Firebase SDK-t importálja. A bemutató nem írhat " +
    "adatot és nem hívhat Cloud Functiont – csak DOM-ot rajzol."
  );
}

const { SZAKASZOK, LEPESEK, szakaszLepesei } =
  await import("../public/js/tura-lepesek.js");

// A bemutató futásidőben rajzolt példaelemei – ezek nincsenek a HTML-ben
const DEMO_ELOTAG = "#tura-demo";

// ══════════════════════════════════════════
// SZERKEZET
// ══════════════════════════════════════════

test("minden lépés létező szakaszhoz tartozik", () => {
  const idk = new Set(SZAKASZOK.map((sz) => sz.id));
  for (const l of LEPESEK) {
    assert.ok(idk.has(l.szakasz), `ismeretlen szakasz: ${l.szakasz} (${l.cim})`);
  }
});

test("minden szakaszhoz van legalább egy lépés", () => {
  for (const sz of SZAKASZOK) {
    assert.ok(szakaszLepesei(sz.id).length > 0, `üres szakasz: ${sz.id}`);
  }
});

test("egy szakasz lépései FOLYTONOSAK – a motor intervallumot futtat", () => {
  // A szakaszIndit() a tol..ig intervallumot futtatja. Ha egy szakasz
  // lépései közé más szakasz lépése keveredik, az is belekerülne a
  // futásba, és a számláló is hazudna.
  for (const sz of SZAKASZOK) {
    const indexek = LEPESEK
      .map((l, i) => (l.szakasz === sz.id ? i : -1))
      .filter((i) => i !== -1);
    const elvart = Array.from(
      { length: indexek.length }, (_, k) => indexek[0] + k
    );
    assert.deepEqual(indexek, elvart, `a ${sz.id} szakasz lépései nem folytonosak`);
  }
});

test("a szakaszok sorrendje megegyezik a lépések sorrendjével", () => {
  // A szakaszvégi „Következő szakasz" a SZAKASZOK sorrendjét követi –
  // ha az más, mint a lépések sorrendje, visszafelé ugrálna.
  const lepesSorrend = [...new Set(LEPESEK.map((l) => l.szakasz))];
  assert.deepEqual(lepesSorrend, SZAKASZOK.map((sz) => sz.id));
});

test("minden szakasznak van kimenete és záró szövege", () => {
  for (const sz of SZAKASZOK) {
    // A kimenet a menü kártyájának a lényege: ez mondja meg, MIÉRT
    // érdemes belekezdeni. Nélküle a tanár nem tudja, mit kap.
    assert.ok(sz.kimenet?.length > 20, `${sz.id}: nincs érdemi kimenet`);
    assert.ok(sz.zaro?.length > 20, `${sz.id}: nincs záró szöveg`);
    assert.ok(sz.ikon && sz.cim, `${sz.id}: hiányzó ikon vagy cím`);
    assert.ok(Number.isFinite(sz.perc) && sz.perc > 0, `${sz.id}: rossz perc`);
  }
});

test("minden lépésnek van címe és szövege", () => {
  for (const l of LEPESEK) {
    assert.ok(l.cim?.length > 3, `rövid cím: ${l.cim}`);
    assert.ok(l.szoveg?.length > 30, `rövid szöveg: ${l.cim}`);
    assert.ok(l.oldal?.endsWith(".html"), `rossz oldal: ${l.oldal}`);
  }
});

test("minden lépés létező lapra hivatkozik", () => {
  for (const l of LEPESEK) {
    assert.ok(
      existsSync(new URL(l.oldal, OLDAL_GYOKER)),
      `nincs ilyen lap: ${l.oldal} (${l.cim})`
    );
  }
});

// ══════════════════════════════════════════
// A FELÜLETTEL VALÓ EGYEZÉS
// ══════════════════════════════════════════

test("minden cél id-szelektor", () => {
  // A lenti ellenőrzések erre épülnek: szövegben keresünk id="..."-t,
  // mert a Node-ban nincs DOM-elemző.
  for (const l of LEPESEK) {
    if (l.cel === null || l.cel === undefined) continue;
    assert.match(l.cel, /^#[a-zA-Z][\w-]*$/, `nem id-szelektor: ${l.cel}`);
  }
});

test("a valódi felületre mutató célok LÉTEZNEK a lapon", () => {
  for (const l of LEPESEK) {
    if (!l.cel || l.cel.startsWith(DEMO_ELOTAG)) continue;
    const id = l.cel.slice(1);
    const html = oldalSzoveg(l.oldal);
    assert.ok(
      html.includes(`id="${id}"`),
      `a ${l.oldal} lapon nincs id="${id}" – a bemutató üres helyre mutatna (${l.cim})`
    );
  }
});

test("a példaelemek célja tényleg elkészül a tura-demo.js-ben", () => {
  for (const l of LEPESEK) {
    if (!l.cel?.startsWith(DEMO_ELOTAG)) continue;
    const id = l.cel.slice(1);
    assert.ok(
      demoSzoveg.includes(`id="${id}"`),
      `a tura-demo.js nem hoz létre id="${id}" elemet (${l.cim})`
    );
  }
});

test("a példaelemre mutató lépés elő is készíti azt", () => {
  // A példaelemek futásidőben jönnek létre. Ha egy lépés hivatkozik
  // rájuk, de nem hívja meg a rajzolót, a reflektor cél nélkül marad.
  for (const l of LEPESEK) {
    if (!l.cel?.startsWith(DEMO_ELOTAG)) continue;
    assert.equal(
      typeof l.elokeszit, "function",
      `${l.cim}: példaelemre mutat, de nincs elokeszit()`
    );
  }
});

test("a rejtett űrlap elemeire mutató lépések kinyitják az űrlapot", () => {
  // A feladatok.html "Új feladat" panelje display:none-nal indul, és a
  // gomb le is van tiltva, amíg nincs osztály. Ezekre a mezőkre
  // reflektorozni csak úgy lehet, ha a lépés előbb kinyitja.
  const URLAP_ELOTAGOK = [
    "#f-", "#r-", "#upload-", "#sablon-", "#szempontok", "#suly-jelzo",
    "#btn-mentes", "#btn-szempont", "#btn-sablon-"
  ];
  for (const l of LEPESEK) {
    if (l.oldal !== "feladatok.html" || !l.cel) continue;
    if (!URLAP_ELOTAGOK.some((e) => l.cel.startsWith(e))) continue;
    assert.equal(
      typeof l.elokeszit, "function",
      `${l.cim}: rejtett űrlapmezőre mutat, de nincs elokeszit()`
    );
  }
});

// ══════════════════════════════════════════
// A KÖRTE ÉS A MOTOR BEKÖTÉSE
// ══════════════════════════════════════════

test("a guard.js betölti a bemutatót", () => {
  // A bemutató EGY helyen kapcsolódik be. Ha ez kiesik, a villanykörte
  // egyetlen lapon sem jelenik meg, és semmi nem jelzi.
  const guard = readFileSync(new URL("js/guard.js", OLDAL_GYOKER), "utf8");
  assert.match(guard, /import\(["']\.\/tura\.js["']\)/);
  assert.match(guard, /turaBeallit/);
});

test("a bemutató a topbarba teszi a villanykörtét, nem az oldalsávba", () => {
  const tura = readFileSync(new URL("js/tura.js", OLDAL_GYOKER), "utf8");
  assert.match(tura, /\.topbar-right/);
  // A topbar 375px-en korábban túlfolyt – az új gomb ne indítsa újra
  const css = readFileSync(new URL("css/app.css", OLDAL_GYOKER), "utf8");
  assert.match(css, /\.tura-korte\s*\{[^}]*flex-shrink:\s*0/);
});

test("a példaadat sehol nem ír a Firestore-ba", () => {
  // A bemutató csak DOM-ot rajzol. Egy setDoc/updateDoc/httpsCallable
  // idekeverése valódi adatot hozna létre egy tanár nevében.
  for (const tilos of ["setDoc", "updateDoc", "addDoc", "deleteDoc", "httpsCallable"]) {
    assert.equal(
      demoSzoveg.includes(tilos), false,
      `a tura-demo.js ${tilos}-t használ – a bemutató nem írhat adatot`
    );
  }
});

test("minden létrehozott elem .tura-demo osztályt kap", () => {
  // A bezárás egyetlen sorral törli az összes .tura-demo elemet. Ha egy
  // létrehozott elem kimarad, ott ragad a felületen példaadat –
  // valódinak látszva. Ezért: ahány elemet létrehozunk, annyi
  // tura-demo osztály-beállítás kell.
  const letrehozas = (demoSzoveg.match(/document\.createElement\(/g) || []).length;
  const jelolt = (demoSzoveg.match(/className = "[^"]*tura-demo[^"]*"/g) || []).length;

  assert.ok(letrehozas >= 1, "nem találtam létrehozott elemet");
  assert.equal(
    jelolt, letrehozas,
    `${letrehozas} elem jön létre, de csak ${jelolt} kap .tura-demo osztályt`
  );
});

test("minden példaelem láthatóan példa", () => {
  // A tanár soha ne higgye valódi diák dolgozatának.
  assert.match(demoSzoveg, /BEMUTATÓ · nem valódi adat/);
});

// ══════════════════════════════════════════
// FELNYÍLÁSI SZABÁLY
//
// Ha ez elromlik, két rossz vég van: vagy soha nem jelenik meg a
// bemutató (senki nem tud róla), vagy minden oldalbetöltésnél az arcába
// ugrik a tanárnak. Egyik sem dob hibát.
// ══════════════════════════════════════════

const { felnyiljon, MAX_NYITAS, AUTO_OLDAL } =
  await import("../public/js/tura-logika.js");

const alap = {
  oldal: AUTO_OLDAL,
  szerep: "tanar",
  elutasitotta: false,
  latottSzakasz: 0,
  nyitasok: 0
};

test("új tanárnál felnyílik a kezdőlapon", () => {
  assert.equal(felnyiljon(alap), true);
});

test("diáknál SOHA nem nyílik fel", () => {
  // Minden új regisztráció diák – a tanári bemutató nekik értelmetlen,
  // és a felület is más, amit mutatna.
  assert.equal(felnyiljon({ ...alap, szerep: "diak" }), false);
  assert.equal(felnyiljon({ ...alap, szerep: undefined }), false);
});

test("csak a tanári kezdőlapon nyílik fel, munka közben nem", () => {
  for (const oldal of ["feladatok.html", "javitas.html", "osztalyok.html",
                       "admin.html", "index.html", "elemzes.html"]) {
    assert.equal(felnyiljon({ ...alap, oldal }), false, `${oldal}-en felnyílt`);
  }
});

test("kifejezett elutasítás után nem nyílik fel", () => {
  assert.equal(felnyiljon({ ...alap, elutasitotta: true }), false);
});

test("egy végignézett szakasz után nem nyílik fel", () => {
  // Aki végigvitt egy szakaszt, tudja, hol a villanykörte.
  assert.equal(felnyiljon({ ...alap, latottSzakasz: 1 }), false);
});

test("a véletlen becsukás NEM nyomja el örökre", () => {
  // Enélkül egy félrenyomott Escape után soha többé nem jelenik meg.
  for (let n = 0; n < MAX_NYITAS; n++) {
    assert.equal(felnyiljon({ ...alap, nyitasok: n }), true, `${n}. nyitás`);
  }
});

test("de nem is ugrik fel a végtelenségig", () => {
  assert.equal(felnyiljon({ ...alap, nyitasok: MAX_NYITAS }), false);
  assert.equal(felnyiljon({ ...alap, nyitasok: MAX_NYITAS + 5 }), false);
});

test("a motor ezt a szabályt használja, nem sajátot", () => {
  const motor = readFileSync(new URL("js/tura.js", OLDAL_GYOKER), "utf8");
  assert.match(motor, /import \{ felnyiljon \} from ["']\.\/tura-logika\.js["']/);
  assert.match(motor, /felnyiljon\(\{/);
});

test("a sima becsukás nem jelent elutasítást", () => {
  // A ✕, az Escape és a „Bezárom" csak most zárja be. Csak a menü
  // „Most nem, köszönöm" / „Befejezem" gombja jelent végleges nemet.
  const motor = readFileSync(new URL("js/tura.js", OLDAL_GYOKER), "utf8");
  assert.match(motor, /kihagy\.addEventListener\("click", \(\) => bezar\(\)\)/);
  assert.match(motor, /zar\.addEventListener\("click", \(\) => bezar\(\)\)/);
  assert.match(motor, /Escape".*bezar\(\)/);
  assert.match(motor, /akcio === "kesz"\) bezar\(true\)/);
});
