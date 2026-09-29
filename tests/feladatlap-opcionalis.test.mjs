// ══════════════════════════════════════════════════════
// A feladatlap (kép/PDF) feltöltése NEM kötelező
//
// Miért külön teszt: ez a követelmény nem egy helyen él. A mentés
// ellenőrzése volt az egyik, de a `getDownloadURL(storageRef(…, null))`
// szerkesztésnél, a Firestore-ba írt `undefined` érték és a diák oldala
// is feltételezte a fájlt – és MINDEGYIK csak mentéskor, éles adaton
// hasal el, hibaüzenet nélkül a fejlesztő számára.
//
// A bemutató ráadásul már azelőtt is azt állította, hogy „Nem
// kötelező", hogy a kód ezt engedte volna. Az ilyen eltérést csak
// olyan teszt fogja meg, ami a SZÖVEGET köti a kódhoz.
//
// Az oldal a Firebase-hez kötött, belépés mögött van, ezért a mentés
// nem futtatható Node-ból – a viselkedést a szabálytesztek (rules.test.mjs)
// fedik, az itteni ellenőrzések a kód szerkezetét vizsgálják.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PUBLIC = new URL("../public/", import.meta.url);
const FUNCTIONS = new URL("../functions/", import.meta.url);

/**
 * Kód kommentek nélkül. Magyarázó kommentekben szerepelnek a tiltott
 * alakok („{ path: null, url: undefined }"), a szöveges keresés pedig
 * ettől hamis pozitívot adna.
 */
function kodCsak(szoveg) {
  return szoveg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const feladatok = kodCsak(readFileSync(new URL("feladatok.html", PUBLIC), "utf8"));

// ══════════════════════════════════════════
// A MENTÉS
// ══════════════════════════════════════════

test("a mentés nem utasítja el a feladatlap nélküli feladatot", () => {
  assert.equal(
    /Töltsd fel a feladatlapot/.test(feladatok), false,
    "a feladatok.html még kikényszeríti a feltöltést"
  );
  // Ne csak az üzenetet vegyék ki: a feltételt se hagyja ott csendben
  assert.equal(
    /if \(!fajlPath\)\s*\{[^}]*return/.test(feladatok), false,
    "van még `if (!fajlPath) … return` a mentés útján"
  );
});

test("az URL lekérése csak akkor fut, ha VAN feltöltött fájl", () => {
  // Fájl nélkül a fajlPath null, és a storageRef(storage, null) hibát
  // dob – szerkesztésnél is, mert az egy másik ágon ugyanide futott.
  const hivasok = feladatok.match(/getDownloadURL\(/g) || [];
  assert.equal(hivasok.length, 1, `${hivasok.length} getDownloadURL hívás van (1 kellene)`);

  const i = feladatok.indexOf("getDownloadURL(storageRef(storage, fajlPath))");
  assert.ok(i > -1, "nem találom a getDownloadURL hívást");
  const elotte = feladatok.slice(Math.max(0, i - 250), i);
  assert.match(elotte, /if \(fajlPath\)\s*\{/, "a getDownloadURL nincs `if (fajlPath)` védelem mögött");
});

test("a feladatlap mező feltételesen kerül a dokumentumba", () => {
  // Egy { path: null, url: undefined } a Firestore-ban hibát dob
  // ("Unsupported field value: undefined"), egy üres map pedig azt
  // sugallná, hogy van feladatlap. Ha nincs, a mező ne is legyen ott.
  assert.equal(
    /feladatlap:\s*\{/.test(feladatok), false,
    "a dokumentum literál feltétel nélkül tartalmazza a feladatlap mezőt"
  );
  assert.match(feladatok, /feladat\.feladatlap\s*=\s*\{\s*path:\s*fajlPath/);
});

test("szerkesztéskor nem nyúl a Storage-hoz", () => {
  // A szerkesztés csak cím / határidő / rubrika (a szabály sem enged
  // többet), tehát a fájlhoz sincs köze.
  const ag = feladatok.slice(
    feladatok.indexOf("mod === 'szerkesztes'"),
    feladatok.indexOf("} else {", feladatok.indexOf("mod === 'szerkesztes'"))
  );
  assert.ok(ag.length > 50, "nem találom a szerkesztés ágát");
  assert.equal(/getDownloadURL|storageRef|fajlPath/.test(ag), false,
    "a szerkesztés ága még a fájlhoz nyúl");
});

// ══════════════════════════════════════════
// AMI OLVASSA A MEZŐT
// ══════════════════════════════════════════

test("a diák oldala hiányzó feladatlapot is elbír", () => {
  const beadas = kodCsak(readFileSync(new URL("beadas.html", PUBLIC), "utf8"));
  assert.match(beadas, /feladat\.feladatlap\?\.url/, "a beadas.html nem ?.-vel olvassa");

  // Egy `feladat.feladatlap.url` olvasás rendben van, ha egy
  // `feladat.feladatlap?.url ? …` feltétel igaz ágában áll (ahogy a
  // hivatkozás kirajzolásánál). Védelem nélkül viszont hiányzó
  // feladatlapnál TypeError, és a diák üres oldalt kap.
  for (const m of beadas.matchAll(/feladat\.feladatlap\.[a-z]+/g)) {
    const elotte = beadas.slice(Math.max(0, m.index - 250), m.index);
    assert.match(
      elotte, /feladat\.feladatlap\?\.url\s*\?/,
      `a beadas.html védelem nélkül olvas a feladatlapból (${m.index}. karakter)`
    );
  }
});

test("a szerver nem függ a feladatlap meglététől", () => {
  // A javítás a rubrikából és az átiratból dolgozik, nem a feladatlapból.
  const szerver = kodCsak(readFileSync(new URL("index.js", FUNCTIONS), "utf8"));
  assert.equal(
    /[A-Za-z_\)\]]\??\.feladatlap\b/.test(szerver), false,
    "a functions/index.js olvassa a feladat.feladatlap mezőt"
  );
});

// ══════════════════════════════════════════
// SZÖVEG ÉS KÓD EGYEZÉSE
// ══════════════════════════════════════════

test("amit a felület és a bemutató ígér, azt a mentés nem cáfolhatja", () => {
  // Ez a lényegi védelem. A bemutató lépése („Nem kötelező: ha nincs
  // feladatlapod…") és az űrlap címkéje azt állítja, hogy a feltöltés
  // elhagyható. Ha valaki visszateszi a kikényszerítést, az állítás
  // hamis lesz – és ez az egyetlen teszt, ami ezt a szöveg oldalról látja.
  const lepesek = readFileSync(new URL("js/tura-lepesek.js", PUBLIC), "utf8");
  const lepes = lepesek.slice(lepesek.indexOf('cel: "#upload-zone"'));
  assert.match(lepes.slice(0, 700), /Nem kötelező/, "a bemutató nem állítja, hogy opcionális");

  const html = readFileSync(new URL("feladatok.html", PUBLIC), "utf8");
  assert.match(html, /Feladatlap \(kép vagy PDF, nem kötelező\)/, "az űrlap címkéje nem jelzi");

  assert.equal(/Töltsd fel a feladatlapot/.test(feladatok), false);
});

test("a kiadás üzenete nem hazudik feladatlapról, ha nincs", () => {
  // A kiadás egy meglévő feladatot másol másik osztálynak. Ha annak nem
  // volt feladatlapja, az „A feladatlap … átvéve" félrevezető.
  assert.match(
    feladatok,
    /fajlPath \? 'A feladatlap és a rubrika átvéve\.' : 'A rubrika átvéve\.'/
  );
});
