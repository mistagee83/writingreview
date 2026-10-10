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
import { SZOTARAK } from "../public/js/i18n.js";

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
  // Két hely van: új feladat kiadása és a szerkesztés (feladatlap cseréje) –
  // mindkettő `if (fajlPath)` mögött.
  const hivasok = feladatok.match(/getDownloadURL\(storageRef\(storage, fajlPath\)\)/g) || [];
  assert.equal(hivasok.length, 2, `${hivasok.length} getDownloadURL(fajlPath) hívás van (2 kellene)`);

  let i = -1;
  while ((i = feladatok.indexOf("getDownloadURL(storageRef(storage, fajlPath))", i + 1)) > -1) {
    const elotte = feladatok.slice(Math.max(0, i - 250), i);
    assert.match(elotte, /if \(fajlPath\)\s*\{/, "a getDownloadURL nincs `if (fajlPath)` védelem mögött");
  }
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

test("szerkesztéskor csak akkor nyúl a Storage-hoz, ha van (cserélt) feladatlap", () => {
  // A szerkesztés cím / határidő / rubrika, és – ha van feladatlap – a feladatlap
  // cseréje is (a szabály ezt a tanár saját feltöltésére engedi).
  const ag = feladatok.slice(
    feladatok.indexOf("mod === 'szerkesztes'"),
    feladatok.indexOf("} else {", feladatok.indexOf("mod === 'szerkesztes'"))
  );
  assert.ok(ag.length > 50, "nem találom a szerkesztés ágát");
  assert.match(ag, /if \(fajlPath\)\s*\{[\s\S]*?mezok\.feladatlap/,
    "a feladatlap nincs `if (fajlPath)` mögött");
  assert.equal(/storageRef\(/.test(ag.replace(/getDownloadURL\(storageRef\(storage, fajlPath\)\)/g, "")), false,
    "a szerkesztés a getDownloadURL-en kívül is a Storage-hoz nyúl");
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
      elotte, /feladat\.feladatlap\?\.url\)?\s*\?/,
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

test("amit a felület és a bemutató ígér, azt a mentés nem cáfolhatja", async () => {
  // Ez a lényegi védelem. A bemutató lépése („Nem kötelező: ha nincs
  // feladatlapod…") és az űrlap címkéje azt állítja, hogy a feltöltés
  // elhagyható. Ha valaki visszateszi a kikényszerítést, az állítás
  // hamis lesz – és ez az egyetlen teszt, ami ezt a szöveg oldalról látja.
  // A bemutató lépés szövege szótári kulcs: mindkét nyelven ellenőrizzük.
  const { LEPESEK } = await import("../public/js/tura-lepesek.js");
  const lepes = LEPESEK.find((l) => l.cel === "#upload-zone");
  assert.ok(lepes, "nincs bemutató-lépés a feladatlap feltöltéséhez");
  assert.match(SZOTARAK.hu[lepes.szoveg], /Nem kötelező/, "a bemutató nem állítja, hogy opcionális");
  assert.match(SZOTARAK.en[lepes.szoveg], /optional/i, "the tour doesn't say it's optional");

  const html = readFileSync(new URL("feladatok.html", PUBLIC), "utf8");
  assert.match(html, /Feladatlap \(kép vagy PDF, nem kötelező\)/, "az űrlap címkéje nem jelzi");

  assert.equal(/Töltsd fel a feladatlapot/.test(feladatok), false);
});

test("a kiadás üzenete nem hazudik feladatlapról, ha nincs", () => {
  // A kiadás egy meglévő feladatot másol másik osztálynak. Ha annak nem
  // volt feladatlapja, az „A feladatlap … átvéve" félrevezető.
  // Az üzenet szótári kulcsokból áll; a feltétel a fajlPath megléte.
  assert.match(
    feladatok,
    /fajlPath \? t\('fel\.kiadas_uzenet_lap'\) : t\('fel\.kiadas_uzenet'\)/
  );
  // A „feladatlap nélküli" változat NEM említhet feladatlapot – egyik nyelven sem.
  for (const nyelv of ["hu", "en"]) {
    const szotar = SZOTARAK[nyelv];
    // az értékelési szempontok átvételét mondja ki (magyarul "értékelési szempontok", angolul "rubric")
    assert.match(szotar["fel.kiadas_uzenet_lap"], nyelv === "hu" ? /szempont/i : /rubri/i);
    assert.doesNotMatch(
      szotar["fel.kiadas_uzenet"],
      /feladatlap|worksheet/i,
      `${nyelv}: a feladatlap nélküli kiadás üzenete feladatlapot említ`
    );
  }
});
