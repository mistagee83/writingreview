// ══════════════════════════════════════════════════════
// WritingReview – Cloud Functions
// Adatmodell: docs/adatmodell.md
//
// Amit ez a fájl a korábbi változathoz képest máshogy tesz:
//  - a Gemini-prompt fix sablonból + strukturált rubrikából áll össze,
//    nem egy AI által generált szabadszövegből
//  - a Gemini strukturált JSON-t ad vissza (responseSchema), nincs
//    ---ELEMZES_START--- típusú szövegparse-olás
//  - a javítás kétlépéses: átírás → majd a SZÖVEG értékelése. Az átirat
//    külön mentve, hogy a tanár lássa, mit olvasott ki az AI
//  - a javítás Firestore-trigger, nem blokkoló kliens-hívás
//  - az értékelés alkollekcióba kerül (a diák a nyerset soha nem látja)
//  - a státuszt csak ez a fájl írja
// ══════════════════════════════════════════════════════

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { randomUUID } = require("node:crypto");
const logger = require("firebase-functions/logger");
const kifejtos = require("./kifejtos");
const kornyezet = require("./kornyezet");
const kvota = require("./kvota");
const aiHasznalat = require("./ai-hasznalat");
const fizetes = require("./fizetes");

initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// A Stripe titkai (Secret Manager, projektenként). FIGYELEM: minden projektben (a pilotban is) léteznie kell
// mindkettőnek a deploy előtt – a pilotban egy helyőrző érték is elég, ott a fizetés ki van kapcsolva.
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const REGION = "europe-west1";

// ── MODELLEK LÉPÉSENKÉNT ──
// Azért lépésenként, mert a három feladat máshogy nehéz, és így ki lehet
// próbálni egy olcsóbb modellt ott, ahol elég – anélkül, hogy a kritikus
// lépés pontossága romlana.
//
// Árak (1M token, fizetős szint, 2026-09 állapot):
//   gemini-3.8-flash      $0.75 be / $3.75 ki   (2027-01-01-től duplázódik)
//   gemini-3.5-flash-lite $0.30 be / $2.50 ki
//
// Egy dolgozat (2 fotó + ~250 szó, két hívás) nagyságrendileg 5 Ft
// 3.8 Flash-sel, 3 Ft Flash-Lite-tal. 300 beadás/év mellett a különbség
// évi néhány száz forint – ezért alapból mindenhol a pontosabb modell van.
//
// FIGYELEM: a Gemini API ingyenes szintjén a Google felhasználhatja a
// beküldött tartalmat a termékei fejlesztéséhez. Kiskorúak dolgozataival
// ez nem járható – fizetős szintű API kulcs kell.
const MODELLEK = {
  // Kézírás felolvasása fotóról. Itt a legnagyobb a hibalehetőség, és egy
  // félreolvasás rosszul értékelt dolgozatot eredményez – ne vigyük lejjebb,
  // amíg nincs összehasonlító mérés.
  atiras: "gemini-3.8-flash",

  // Az átirat értékelése a rubrika szerint. Szöveg-only, de érdemi
  // gondolkodást kér (pontozás, hibakategorizálás).
  ertekeles: "gemini-3.8-flash",

  // Feladatlap → rubrika javaslat. A legkisebb tét: a tanár űrlapon
  // látja és javítja, mielőtt bármi mentődik. Itt próbálható először
  // a "gemini-3.5-flash-lite".
  rubrika: "gemini-3.8-flash",

  // Osztályszintű elemzés: a tanár olvassa és értelmezi, nem megy
  // közvetlenül diákhoz – itt a késés nagyobb kár lenne a modellváltásnál.
  elemzes: "gemini-3.8-flash"
};

// ── TARTALÉK MODELLEK ──
// Ha a fő modell átmenetileg túlterhelt ("high demand"), az újrapróbálkozások
// után ezekre vált a rendszer. Sorrendben próbálja őket.
//
// Az ÉRTÉKELÉSNEK SZÁNDÉKOSAN NINCS tartaléka: ha az egyik diákot 3.8 Flash,
// a másikat 3.7 Flash pontozná, sérülne az összehasonlíthatóság – pedig épp
// az volt a cél, hogy mindenki ugyanazzal a mércével mérődjön. Inkább maradjon
// "hiba" státuszban és futtasd újra később.
//
// Az átírás (OCR) és a rubrika-javaslat nem ilyen: az elsőt a tanár
// ellenőrzi az átiraton, a másodikat az űrlapon. Melyik modell dolgozott,
// azt az atirat_model / model mező rögzíti.
const TARTALEK = {
  atiras: ["gemini-3.7-flash", "gemini-3.5-flash-lite"],
  ertekeles: [],
  rubrika: ["gemini-3.7-flash", "gemini-3.5-flash-lite"],
  elemzes: ["gemini-3.7-flash"]
};

// ── GONDOLKODÁSI SZINT LÉPÉSENKÉNT ──
// A gondolkodási (thinking) tokenek kimenetként számlázódnak, és az első éles
// mérésben (13 dolgozat) a költség nagy része a kimenet+gondolkodás volt: az
// átírás hívásonként ~2900 ilyen tokent használt egy ~150 szavas levélnél.
// A kézírás felolvasása lényegében OCR, nem kell hozzá hosszú gondolkodás.
// A "low" a legalacsonyabb szint, amit a 3.8 és a 3.7 Flash is elfogad (kikapcsolni
// nem lehet, a "minimal" csak a Flash-Lite-on érvényes), és mindhárom
// átírás-modellen érvényes – a tartalék-láncban sem dob 400-as hibát.
// Ami itt nincs felsorolva, az a modell alapértelmezését kapja (medium).
// Az értékelést (pontozás) szándékosan nem vesszük vissza, amíg nincs
// összehasonlító mérés: ott a gondolkodás számíthat a pontosságra.
const GONDOLKODAS = {
  atiras: "low"
};

// A környezet (pilot/prod) beállításai: functions/kornyezet.js.
const BEALLITASOK = kornyezet.beallitasok();
const CORS = BEALLITASOK.cors;

const HIVAS_OPCIOK = { region: REGION, cors: CORS };
const AI_OPCIOK = { ...HIVAS_OPCIOK, secrets: [GEMINI_API_KEY], timeoutSeconds: 300 };

// ══════════════════════════════════════════════════════
// SEGÉDFÜGGVÉNYEK
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// FELHASZNÁLÓNAK SZÁNT HIBÁK
//
// Minden hiba KÉT arcot visel: a magyar `message` (napló, magyar felület)
// és a `details.kod` + paraméterei, amiből a kliens a SAJÁT nyelvén
// jelenít meg szöveget (public/js/i18n-*.js, "szerver.<kod>").
// Új hibakódnál mindkét szótárba fel kell venni a szöveget – a
// tests/i18n.test.mjs ellenőrzi.
// ══════════════════════════════════════════════════════
const HIBA_SZOVEG = {
  belepes_kell: () => "Belépés szükséges.",
  tanar_kell: () => "Ehhez tanári jogosultság kell.",
  admin_kell: () => "Ehhez admin jogosultság kell.",
  kod_generalas: () => "Nem sikerült egyedi kódot generálni. Próbáld újra.",
  osztaly_nev_kell: () => "Az osztály nevét add meg.",
  osztaly_nev_hosszu: () => "Túl hosszú név.",
  kod_nincs: () => "Nem találtam osztályt ezzel a kóddal.",
  osztaly_megszunt: () => "Az osztály már nem létezik.",
  osztaly_zart: () => "Ez az osztály már nem fogad új diákokat.",
  kod_formatum: () => "Érvénytelen kódformátum.",
  feladatlap_utvonal: () => "Hiányzó feladatlap útvonal.",
  nem_a_tied_feltoltes: () => "Ez nem a te feltöltésed.",
  beadas_id_kell: () => "Hiányzó beadás ID.",
  beadas_nincs: () => "A beadás nem található.",
  nem_a_te_beadasod: () => "Ez nem a te diákod beadása.",
  beadas_folyamatban: () => "Ez a beadás épp feldolgozás alatt van.",
  visszajelzes_ures: () => "A visszajelzés szövege nem lehet üres.",
  jegy_ertek: () => "A jegy nem szerepel a feladat jegyskáláján.",
  statusz_nem_kuldheto: (p) => `Ebben az állapotban nem küldhető el: ${p.statusz}`,
  kulcs_nincs: () => "A feladat megoldókulcsa nem található.",
  nev_rovid: () => "A név legalább 2 karakter legyen.",
  nev_hosszu: () => "A név legfeljebb 80 karakter lehet.",
  osztaly_diak_id_kell: () => "Hiányzó osztály- vagy diákazonosító.",
  osztaly_nincs: () => "Az osztály nem található.",
  nem_a_te_osztalyod: () => "Ez nem a te osztályod.",
  diak_nem_tag: () => "Ez a diák nem tagja az osztálynak.",
  felhasznalo_id_kell: () => "Hiányzó felhasználó-azonosító.",
  szerep_ervenytelen: (p) => `Érvénytelen szerep: ${p.szerep}`,
  admin_jog_logikai: () => "Az admin jog logikai érték.",
  sajat_admin: () => "A saját admin jogodat nem veheted el. Kérd meg egy másik admint.",
  nincs_modositas: () => "Nincs mit módosítani.",
  nincs_felhasznalo: () => "Nincs ilyen felhasználó.",
  feladat_id_kell: () => "Hiányzó feladat ID.",
  feladat_nincs: () => "A feladat nem található.",
  nem_a_te_feladatod: () => "Ez nem a te feladatod.",
  nincs_kiertekelt: () => "Ehhez a feladathoz még nincs kiértékelt beadás.",
  kulcs_feladatlap_kell: () => "A kulcshoz feladatlap kell – töltsd fel előbb.",
  max_tananyag: (p) => `Legfeljebb ${p.max} tananyag-fájl tölthető fel.`,
  kulcs_meret: () => "A feladatlap és a tananyag együtt túl nagy (legfeljebb 14 MB). Hagyd el a tananyag felesleges részeit.",
  onregisztracio_ki: () => "Az önálló tanári regisztráció ebben a környezetben nincs bekapcsolva.",
  email_nincs_megerositve: () => "Előbb erősítsd meg az e-mail-címedet a kapott levélben.",
  tanari_kerelem_hianyzik: () => "Ez a fiók nem tanári regisztrációval jött létre. Regisztrálj új fiókot tanárként.",
  mar_diak_hasznalo: () => "Ez a fiók már diákként használatban van, ezért tanári jogot nem kaphat.",
  kvota_elfogyott: (p) => `Elfogyott a havi AI-keret (${p.hasznalt} / ${p.limit} egység). A keret a hónap elején megújul.`,
  kvota_elfogyott_egyszeri: (p) => `Elfogyott az ingyenes AI-keret (${p.hasznalt} / ${p.limit} egység). Folytatáshoz fizetős csomag kell.`,
  csomag_ervenytelen: (p) => `Ismeretlen csomag: ${p.csomag}`,
  fizetes_ki: () => "A fizetés ebben a környezetben nincs bekapcsolva.",
  mar_elofizetett: () => "Már van aktív előfizetésed. Az előfizetést az „Előfizetés kezelése” gombbal módosíthatod.",
  csomag_kezi: () => "A csomagodat az üzemeltető állította be, ezért itt nem fizethetsz elő. Írj az üzemeltetőnek.",
  nincs_ugyfel: () => "Még nincs előfizetésed, ezért nincs mit kezelni.",
  fizetes_hiba: () => "A fizetési szolgáltatás nem válaszolt. Próbáld újra egy perc múlva."
};

/** Kódolt HttpsError: magyar üzenet + details.kod a kliens fordításához. */
function hiba(code, kod, params = {}) {
  return new HttpsError(code, HIBA_SZOVEG[kod](params), { kod, ...params });
}

/**
 * Egy belső hiba (más modul, AI-lépés) továbbadása HttpsError-ként úgy,
 * hogy a kódja ne vesszen el. A kulcs-hibák (functions/kifejtos.js) külön
 * jelölést kapnak, mert azok kódkészlete más.
 */
function hibaAtvezet(code, e) {
  let details;
  if (e.kulcsHiba) details = { kod: "kulcshiba", kulcsKod: e.kod, parameterek: e.parameterek };
  else if (e.kod) details = { kod: e.kod, ...(e.parameterek || {}) };
  return new HttpsError(code, e.message, details);
}

/** Váratlan (AI vagy szerver) hiba: a részlet technikai, a kerete fordítható. */
function belsoHiba(e, kod = "szerver_hiba") {
  return new HttpsError("internal", e.message, { kod, reszlet: e.message });
}

function db() {
  return getFirestore();
}

/** Belépés megkövetelése. */
function belepve(request) {
  if (!request.auth) throw hiba("unauthenticated", "belepes_kell");
  return request.auth.uid;
}

/** Tanári szerep megkövetelése – a claim-re épül, nem Firestore-mezőre. */
function tanar(request) {
  const uid = belepve(request);
  if (request.auth.token?.szerep !== "tanar") {
    throw hiba("permission-denied", "tanar_kell");
  }
  return uid;
}

// ══════════════════════════════════════════════════════
// TANÁRONKÉNTI HAVI AI-KVÓTA (csak prod; a számok: functions/kvota.js)
//
// A használat a tanár alatt számolódik: tanarok/{uid}/hasznalat/{ÉÉÉÉ-HH}
// { egyseg }, a csomag a tanarok/{uid}.csomag mezőben (hiányzó → ingyenes).
// Mindkettőt csak a szerver írja. A diák beadása is a TANÁR keretéből fogy.
//
// Menete: foglalás (tranzakció) → AI-hívás → hibánál visszaadás. Így a
// sikertelen hívás nem fogyaszt, és két párhuzamos kérés sem léphet túl a
// kereten (a Gemini-hívás előtt dől el, nem utána).
// ══════════════════════════════════════════════════════

/**
 * Egységek lefoglalása a tanár havi keretéből.
 * @returns foglalás-bizonylat a visszaadáshoz, vagy null, ha a kvóta ki van kapcsolva
 */
async function kvotaFoglalas(firestore, uid, muvelet, beallitasok = BEALLITASOK, most = new Date()) {
  if (!beallitasok.kvota) return null;
  const koltseg = kvota.EGYSEG_KOLTSEG[muvelet];
  if (!koltseg) throw new Error(`Ismeretlen AI-művelet a kvótában: ${muvelet}`);

  const tanarRef = firestore.collection("tanarok").doc(uid);
  let kulcs;

  await firestore.runTransaction(async (tx) => {
    // A használat-dokumentum a csomagtól függ (egyszeri: állandó, havi: a hónap), ezért előbb a csomag.
    const tanarSnap = await tx.get(tanarRef);
    const csomag = kvota.csomagNev(tanarSnap.data()?.csomag);
    kulcs = kvota.hasznalatKulcs(csomag, most);
    const hasznalatRef = tanarRef.collection("hasznalat").doc(kulcs);
    const hasznalatSnap = await tx.get(hasznalatRef);
    const d = kvota.kvotaDontes({ csomag, hasznalt: hasznalatSnap.data()?.egyseg, koltseg });
    if (!d.engedett) {
      logger.warn("AI-keret elfogyott", { uid, csomag, muvelet, hasznalt: d.hasznalt, limit: d.limit });
      // Másik kód az egyszeri keretnél: ott nincs megújulás, a szöveg más.
      const adat = { hasznalt: d.hasznalt, limit: d.limit, csomag };
      if (kvota.idoszak(csomag) === "egyszeri") throw hiba("resource-exhausted", "kvota_elfogyott_egyszeri", adat);
      throw hiba("resource-exhausted", "kvota_elfogyott", adat);
    }
    tx.set(hasznalatRef, { egyseg: FieldValue.increment(koltseg), frissitve: FieldValue.serverTimestamp() }, { merge: true });
  // Egy osztály beadásai egyszerre érkeznek, mind ugyanarra a számlálóra: az alapértelmezett 5
  // újrapróbálás ütközésnél kevés (a beadás ilyenkor hibaállapotba kerülne, pedig lenne keret).
  }, { maxAttempts: 30 });
  return { uid, kulcs, koltseg };
}

/** Egy sikertelen művelet egységeinek visszaadása (a hiba nem a tanár hibája). */
async function kvotaVisszaadas(firestore, foglalas) {
  if (!foglalas) return;
  await firestore.collection("tanarok").doc(foglalas.uid).collection("hasznalat").doc(foglalas.kulcs)
    .set({ egyseg: FieldValue.increment(-foglalas.koltseg) }, { merge: true });
}

/** Lefoglal, lefuttatja az AI-műveletet, és hibánál visszaadja az egységet. */
async function kvotaval(uid, muvelet, fn, beallitasok = BEALLITASOK) {
  const firestore = db();
  const foglalas = await kvotaFoglalas(firestore, uid, muvelet, beallitasok);
  try {
    const eredmeny = await fn();
    // A beadás-feldolgozás "kihagyva"-t ad, ha másik futás már fut: az nem volt AI-munka.
    if (eredmeny?.kihagyva) {
      await kvotaVisszaadas(firestore, foglalas)
        .catch((m) => logger.error("A kvóta visszaadása nem sikerült", { uid, hiba: m.message }));
    }
    return eredmeny;
  } catch (e) {
    await kvotaVisszaadas(firestore, foglalas)
      .catch((m) => logger.error("A kvóta visszaadása nem sikerült", { uid, hiba: m.message }));
    throw e;
  }
}

/**
 * Gemini-hívás – ez az EGYETLEN pont, ahol a modellt hívjuk.
 *
 * Ha Vertex AI-ra váltunk (EU-s adatkezelés, API-kulcs helyett
 * szolgáltatásfiók, gs:// URI base64 helyett), csak ezt kell átírni.
 */
const VARAKOZAS = (ms) => new Promise((r) => setTimeout(r, ms));

// Újrapróbálkozási paraméterek. Objektumban, hogy a tesztek le tudják
// rövidíteni a várakozást (különben minden teszt 10 másodperc lenne).
const UJRAPROBA = {
  kiserlet: 3,                 // modellenként
  varakozasok: [2000, 8000]    // a kísérletek között, + némi jitter
};

/**
 * Átmeneti-e a hiba? Csak ilyenkor érdemes újrapróbálni.
 *
 * A "high demand" / UNAVAILABLE / RESOURCE_EXHAUSTED magától elmúlik.
 * Egy 400-as (hibás kérés) vagy 403-as (jogosultság) viszont nem, azt
 * hiába ismételjük.
 */
function atmenetiHiba(httpStatus, hiba) {
  if ([429, 500, 502, 503, 504].includes(httpStatus)) return true;
  const allapot = hiba?.status || "";
  if (["UNAVAILABLE", "RESOURCE_EXHAUSTED", "INTERNAL", "DEADLINE_EXCEEDED"].includes(allapot)) {
    return true;
  }
  return /high demand|overloaded|try again later/i.test(hiba?.message || "");
}

/** Egyetlen Gemini-kérés, újrapróbálkozás nélkül. */
async function geminiKeres(modell, parts, schema, gondolkodas) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modell}:generateContent?key=${GEMINI_API_KEY.value()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2,
        // Szint nélkül a mező nem megy ki: a modell alapértelmezése érvényes.
        ...(gondolkodas ? { thinkingConfig: { thinkingLevel: gondolkodas } } : {})
      }
    })
  });

  const json = await response.json().catch(() => ({}));

  if (json.error) {
    const e = new Error(`Gemini (${modell}): ${json.error.message}`);
    e.atmeneti = atmenetiHiba(response.status, json.error);
    throw e;
  }
  if (!response.ok) {
    const e = new Error(`Gemini (${modell}): HTTP ${response.status}`);
    e.atmeneti = atmenetiHiba(response.status, null);
    throw e;
  }

  // A tokenszámot is visszaadjuk (usageMetadata): a költség mérése ebből jön.
  // Hibás válasznál is rögzítjük (e.hasznalat): a kérés lefutott, a tokenek elfogytak.
  const hasznalat = aiHasznalat.hasznalatKinyeres(json);

  const szoveg = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!szoveg) {
    const ok = json.candidates?.[0]?.finishReason || "ismeretlen ok";
    throw Object.assign(new Error(`A Gemini (${modell}) nem adott választ (${ok}).`), { hasznalat });
  }

  try {
    return { eredmeny: JSON.parse(szoveg), hasznalat };
  } catch (_) {
    // responseSchema mellett ez nem szokott előfordulni, de ha mégis,
    // legyen értelmezhető a hibanapló.
    throw Object.assign(new Error(`A Gemini válasza nem érvényes JSON: ${szoveg.slice(0, 200)}`), { hasznalat });
  }
}

/**
 * Gemini-hívás – ez az EGYETLEN pont, ahol a modellt hívjuk.
 *
 * Átmeneti hibánál (a modell túlterhelt) exponenciálisan növő várakozással
 * újrapróbál, majd ha a lépéshez van tartalék modell, azzal folytatja.
 * Ez a háttérben futó javításnál különösen fontos: e nélkül egy pillanatnyi
 * kapacitáshiány miatt a tanárnak kézzel kellene újraindítania.
 *
 * Ha Vertex AI-ra váltunk (EU-s adatkezelés, API-kulcs helyett
 * szolgáltatásfiók, gs:// URI base64 helyett), csak a geminiKeres()-t
 * kell átírni.
 *
 * @param {string} lepes 'atiras' | 'ertekeles' | 'rubrika'
 * @param {{tanar_id, muvelet, feladat_id?, beadas_id?, mod?}} [kontextus] kell az
 *   AI-használat mérésének (ai_hasznalat); nélküle nem készül rekord
 * @returns {Promise<{eredmeny: object, modell: string, hasznalat: object}>} a válasz,
 *   az, hogy VÉGÜL melyik modell adta – tartalékra váltás esetén nem a fő
 *   modellt kell elmenteni, különben hamis lenne a nyomonkövetés –, és a tokenszámok
 */
async function geminiHivas(lepes, parts, schema, kontextus) {
  const { kiserlet: KISERLET, varakozasok: VARAKOZASOK } = UJRAPROBA;

  const modellek = [MODELLEK[lepes], ...(TARTALEK[lepes] || [])];
  let utolso;
  let probalkozas = 0;

  for (const modell of modellek) {
    for (let i = 0; i < KISERLET; i++) {
      try {
        if (i > 0 || modell !== modellek[0]) {
          logger.info("Gemini újrapróbálkozás", { lepes, modell, kiserlet: i + 1 });
        }
        probalkozas++;
        const { eredmeny, hasznalat } = await geminiKeres(modell, parts, schema, GONDOLKODAS[lepes]);
        await aiHasznalatNaplo(kontextus, { modell, fo_modell: modellek[0], hasznalat, probalkozas, parts });
        return { eredmeny, modell, hasznalat };
      } catch (e) {
        utolso = e;
        if (e.hasznalat) {
          await aiHasznalatNaplo(kontextus, { modell, fo_modell: modellek[0], hasznalat: e.hasznalat, probalkozas, parts });
        }
        if (!e.atmeneti) throw e;   // véglegesnek tűnő hibát ne ismételjünk
        if (i < KISERLET - 1) {
          const ms = VARAKOZASOK[i] + Math.floor(Math.random() * 1000);
          logger.warn("Gemini átmeneti hiba, várakozás", {
            lepes, modell, ms, hiba: e.message
          });
          await VARAKOZAS(ms);
        }
      }
    }
    if (modellek.length > 1) {
      logger.warn("Váltás tartalék modellre", { lepes, elhasalt: modell });
    }
  }

  throw utolso;
}

/**
 * Egy Gemini-hívás tokenszámának rögzítése (ai_hasznalat). SOHA nem dobhat
 * hibát: a mérés hibája nem akadályozhatja meg a javítást. Kontextus nélkül
 * (pl. tesztek) nem ír semmit.
 */
async function aiHasznalatNaplo(kontextus, adat, firestore = null) {
  if (!kontextus?.muvelet) return;
  try {
    const rekord = aiHasznalat.rekordKeszites({ ...adat, kontextus, kornyezet: BEALLITASOK.kornyezet });
    logger.info("AI-használat", rekord);
    await (firestore || db()).collection("ai_hasznalat").add({ ...rekord, ido: FieldValue.serverTimestamp() });
  } catch (e) {
    logger.error("Az AI-használat rögzítése nem sikerült", { hiba: e.message });
  }
}

/**
 * A beadás dokumentumot a kliens hozza létre, ezért a benne lévő hivatkozásokban
 * nem bízunk: a feladatnak ugyanahhoz az osztályhoz és tanárhoz kell tartoznia,
 * a képek pedig a diák saját feltöltési mappájából valók. Különben egy hamis
 * beadással idegen Storage-fájl olvastatható ki (az Admin SDK nem ismeri a
 * Storage-szabályokat), vagy más tanár nevében lehetne beadni/jóváhagyni.
 * Hibakódot ad vissza (vagy null, ha rendben van); a letöltés és az AI-hívás előtt hívandó.
 */
const KEP_UT_MAX_HOSSZ = 500;
/** A beírt beadás szövegének felső határa (a Firestore-szabály és a kliens is ezt tartja). */
const BEIRT_SZOVEG_MAX = 20000;

/**
 * A feladat beadási módja (a tanár állítja a rubrikában): "foto" | "szoveg" | "mindketto".
 * Hiányzó vagy ismeretlen érték = "foto" (a régi feladatok fotósak maradnak).
 */
function beadasiMod(feladat) {
  const m = feladat?.rubrika?.beadasi_mod;
  return m === "szoveg" || m === "mindketto" ? m : "foto";
}

function beadasOsszerendeles(beadasId, beadas, feladat) {
  const szoveg = (v) => typeof v === "string" && v.length > 0;
  if (!feladat) return "feladat_nincs";
  if (!szoveg(beadas.osztaly_id) || beadas.osztaly_id !== feladat.osztaly_id) return "osztaly_nem_egyezik";
  if (!szoveg(beadas.tanar_id) || beadas.tanar_id !== feladat.tanar_id) return "tanar_nem_egyezik";
  if (!szoveg(beadas.diak_id)) return "diak_hianyzik";

  // Beírt dolgozat: nincs kép, és a feladat engedi (csak fogalmazás-feladat). A szöveget a kliens
  // írta, ezért a hosszát itt is ellenőrizzük (a szabály ugyanezt teszi).
  if (beadas.forras === "szoveg") {
    if (kifejtos.feladatMod(feladat.rubrika) === "kifejtos") return "mod_nem_egyezik";
    if (beadasiMod(feladat) === "foto") return "mod_nem_egyezik";
    if (typeof beadas.szoveg !== "string" || beadas.szoveg.trim().length === 0
        || beadas.szoveg.length > BEIRT_SZOVEG_MAX) return "szoveg_nincs";
    if (Array.isArray(beadas.kep_paths) && beadas.kep_paths.length > 0) return "kep_es_szoveg";
    return null;
  }
  if (beadasiMod(feladat) === "szoveg") return "mod_nem_egyezik";

  const elotag = `beadasok/${beadas.diak_id}/${beadasId}/`;
  const utak = beadas.kep_paths;
  if (!Array.isArray(utak) || utak.length === 0) return "kep_nincs";
  const rossz = utak.some((u) =>
    !szoveg(u) || u.length > KEP_UT_MAX_HOSSZ || !u.startsWith(elotag)
    || u.length === elotag.length || u.includes(".."));
  return rossz ? "kep_ut_idegen" : null;
}

/**
 * A beadás képei együtt: a szabály 10 × 10 MiB-ot enged, a Gemini inline kérésének
 * mérete viszont korlátos (~20 MB, base64-ben 4/3-szoros). A kliens 1500 px-re
 * kicsinyít, tehát ez csak a hamis/szokatlan kérést fogja meg – a letöltés ELŐTT.
 */
const KEP_OSSZ_MAX = 14 * 1024 * 1024;
async function kepekBetoltese(utak) {
  const bucket = getStorage().bucket();
  const meretek = await Promise.all(utak.map(async (u) => {
    const [meta] = await bucket.file(u).getMetadata();
    return Number(meta.size) || 0;
  }));
  if (meretek.reduce((a, b) => a + b, 0) > KEP_OSSZ_MAX) {
    throw new Error("A feltöltött fájlok együtt túl nagyok (legfeljebb 14 MB).");
  }
  return Promise.all(utak.map(fajlBase64));
}

/** Storage-fájl → base64 + mimeType. */
async function fajlBase64(path) {
  const file = getStorage().bucket().file(path);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  return {
    inline_data: {
      mime_type: metadata.contentType || "application/octet-stream",
      data: buffer.toString("base64")
    }
  };
}

/** Osztálykód: összetéveszthető karakterek (I, O, 0, 1) nélkül. */
function kodGeneralas() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const { randomBytes } = require("node:crypto");
  const veletlen = (n) =>
    Array.from(randomBytes(n), (b) => chars[b % chars.length]).join("");
  return `${veletlen(3)}-${veletlen(4)}`;
}

// ══════════════════════════════════════════════════════
// JSON SÉMÁK
// ══════════════════════════════════════════════════════

// ── TANÍTOTT NYELVEK ──
// A prompt "${nyelv}tanár" alakban használja, ami magyarul mindegyikkel
// helyes szót ad: angoltanár, némettanár, franciatanár, magyartanár.
// Bővítéskor ezt kell ellenőrizni.
const NYELVEK = [
  "angol", "német", "francia", "spanyol", "olasz", "orosz", "latin", "magyar"
];
const ALAP_NYELV = "angol";

/** Régebbi feladatoknál nincs nyelv mező – azok angolok. */
function nyelve(rubrika) {
  const n = rubrika?.nyelv;
  return NYELVEK.includes(n) ? n : ALAP_NYELV;
}

// ── SZINT: A MÉRCE, AMIHEZ AZ AI ÉRTÉKEL ──
//
// A szint jelentése NYELVFÜGGŐ, és ez nem formalitás. Idegen nyelvnél a
// CEFR-szint a mérce, mert a diák nem anyanyelvi. Anyanyelvi dolgozatnál
// a CEFR-nek nincs értelme – ott az évfolyam az, ami mond valamit.
//
// Ha nincs megadva szint, akkor a promptban SEMMILYEN szintet nem szabad
// említeni: az AI kitalál egyet, és ahhoz mér. Ez csendes pontatlanság,
// nem hiba – csak teszt fogja meg.
const ANYANYELVEK = ["magyar"];
const CEFR_SZINTEK = ["A1", "A2", "B1", "B2", "C1"];
const EVFOLYAMOK = [
  "5-6. évfolyam", "7-8. évfolyam", "9-10. évfolyam", "11-12. évfolyam",
  "érettségi (közép)", "érettségi (emelt)"
];

/** Anyanyelvi dolgozat-e: a szint évfolyam, nem CEFR. */
function anyanyelvu(rubrika) {
  return ANYANYELVEK.includes(nyelve(rubrika));
}

/**
 * A szint promptba írható alakja – vagy null, ha nincs megadva.
 *
 * Egy helyen, mert három prompt használja (értékelés, elemzés, rubrika).
 * Ha elcsúsznak, a rendszer továbbra is működik, csak rosszabbul pontoz.
 *
 * @returns {{cimke: string, ertek: string, anyanyelv: boolean}|null}
 */
function szintInfo(rubrika) {
  const nyelv = nyelve(rubrika);
  // A tárolt értéket is a nyelv skálájához mérjük, nem csak felcímkézzük.
  // Van olyan feladat, amit még CEFR-kényszer alatt mentettünk: egy
  // magyar dolgozaton a "B1" ilyenkor "Évfolyam: B1"-ként jelent volna
  // meg a promptban. Rossz mércénél jobb a semmi.
  const szint = szintSzures(nyelv, rubrika?.szint);
  if (!szint) return null;
  return ANYANYELVEK.includes(nyelv)
    ? { cimke: "Évfolyam", ertek: szint, anyanyelv: true }
    : { cimke: "Célszint (CEFR)", ertek: szint, anyanyelv: false };
}

/**
 * Az AI által javasolt szint szűrése a nyelv skálájára.
 *
 * A rubrika-javaslat sémáját a tanár nyelvválasztása alapján állítjuk
 * össze, de az AI felülírhatja a nyelvet (ha a feladatlap másról szól).
 * Ilyenkor a szint rossz skálán maradhat – pl. magyar feladatlapra "B1".
 * Inkább NE adjunk szintet, mint rosszat: a tanár kitölti.
 */
function szintSzures(nyelv, szint) {
  const s = String(szint || "").trim();
  if (!s) return null;
  const skala = ANYANYELVEK.includes(nyelv) ? EVFOLYAMOK : CEFR_SZINTEK;
  return skala.includes(s) ? s : null;
}

const HIBA_KATEGORIAK = [
  "nyelvtan", "szokincs", "szerkezet", "tartalom", "helyesiras", "irasjelek"
];

/**
 * Feladatlap → rubrika javaslat.
 *
 * Azért függvény és nem konstans, mert a szint skálája nyelvfüggő:
 * idegen nyelvnél CEFR, anyanyelvnél évfolyam.
 *
 * A "szint" SZÁNDÉKOSAN nem kötelező mező. Kötelező enum mellett a
 * strukturált kimenet arra kényszeríti a modellt, hogy válasszon egyet –
 * még akkor is, ha a feladatlapból semmi nem utal szintre. Így minden
 * magyar dolgozat kapott egy kitalált CEFR-szintet, és ahhoz mértünk.
 */
function rubrikaSchema(nyelv) {
  return {
    type: "object",
    properties: {
      cim_javaslat: { type: "string" },
      tipus: {
        type: "string",
        enum: ["esszé", "levél", "leírás", "elbeszélés", "vélemény", "egyéb"]
      },
      nyelv: { type: "string", enum: NYELVEK },
      szint: {
        type: "string",
        enum: ANYANYELVEK.includes(nyelv) ? EVFOLYAMOK : CEFR_SZINTEK
      },
      min_szo: { type: "integer" },
      max_szo: { type: "integer" },
      szempontok: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kulcs: { type: "string" },
            cim: { type: "string" },
            suly: { type: "integer" }
          },
          required: ["kulcs", "cim", "suly"]
        }
      },
      feladat_leiras: { type: "string" }
    },
    required: ["cim_javaslat", "nyelv", "tipus", "szempontok", "feladat_leiras"]
  };
}

/** Kézírás → átirat. */
const ATIRAT_SCHEMA = {
  type: "object",
  properties: {
    atirat: { type: "string" },
    olvashatosag: { type: "string", enum: ["jo", "kozepes", "gyenge"] },
    megjegyzes: { type: "string" }
  },
  required: ["atirat", "olvashatosag"]
};

/** Átirat + rubrika → értékelés. */
const ERTEKELES_SCHEMA = {
  type: "object",
  properties: {
    szempontok: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kulcs: { type: "string" },
          pont: { type: "number" },
          max: { type: "number" },
          megjegyzes: { type: "string" }
        },
        required: ["kulcs", "pont", "max", "megjegyzes"]
      }
    },
    hibak: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kategoria: { type: "string", enum: HIBA_KATEGORIAK },
          tipus: { type: "string" },
          idezet: { type: "string" },
          javaslat: { type: "string" },
          magyarazat: { type: "string" }
        },
        required: ["kategoria", "tipus", "idezet", "javaslat", "magyarazat"]
      }
    },
    erossegek: { type: "array", items: { type: "string" } },
    fejlesztendo: { type: "array", items: { type: "string" } },
    diak_szoveg: { type: "string" },
    szoszam: { type: "integer" }
  },
  required: ["szempontok", "hibak", "erossegek", "fejlesztendo", "diak_szoveg"]
};

/** Osztályszintű elemzés kimenete. */
const ELEMZES_SCHEMA = {
  type: "object",
  properties: {
    osszegzes: { type: "string" },
    tipushibak: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cim: { type: "string" },
          kategoria: { type: "string", enum: HIBA_KATEGORIAK },
          gyakorisag: { type: "string", enum: ["általános", "gyakori", "szórványos"] },
          magyarazat: { type: "string" },
          peldak: { type: "array", items: { type: "string" } }
        },
        required: ["cim", "kategoria", "gyakorisag", "magyarazat", "peldak"]
      }
    },
    gyakorlatok: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cim: { type: "string" },
          cel: { type: "string" },
          leiras: { type: "string" },
          idotartam_perc: { type: "integer" }
        },
        required: ["cim", "cel", "leiras", "idotartam_perc"]
      }
    },
    generalo_prompt: { type: "string" }
  },
  required: ["osszegzes", "tipushibak", "gyakorlatok", "generalo_prompt"]
};

// ══════════════════════════════════════════════════════
// PROMPT SABLONOK
// A javító prompt FIX – csak a rubrika behelyettesített adatai
// változnak. Így minden diák ugyanazzal a mércével mérődik.
// ══════════════════════════════════════════════════════

function atiratPrompt(nyelv) {
  return `Te egy pontos átíró vagy. A képeken egy diák kézzel írt dolgozata
látható. A dolgozat nyelve: ${nyelv}.

Írd át SZÓ SZERINT, amit látsz. Fontos szabályok:
- A ${nyelv} nyelv ékezeteit és különleges karaktereit pontosan add vissza.
- NE javítsd a hibákat – a nyelvtani, helyesírási és írásjel-hibákat is
  pontosan úgy add vissza, ahogy a diák írta. Az értékelést más végzi.
- Ha egy szó olvashatatlan, jelöld így: [?]
- Ha egy szó bizonytalan, írd le a legjobb tippet, utána [?]
- A bekezdéseket és sortöréseket tartsd meg.
- Az áthúzott (kihúzott, kisatírozott) szöveget hagyd ki, mintha ott sem
  lenne. Ne írd be, és ne tegyél a helyére semmilyen jelölőt vagy megjegyzést.
- Ha több kép van, azok egy dolgozat egymást követő oldalai.

Az olvashatosag mezőben értékeld, mennyire volt olvasható a kézírás.`;
}

function ertekelesPrompt(feladat, atirat, { beirt = false } = {}) {
  const r = feladat.rubrika || {};
  const szempontok = (r.szempontok || [])
    .map((sz) => `  - ${sz.kulcs} ("${sz.cim}"): max ${sz.suly} pont`)
    .join("\n");

  const hosszElvaras =
    r.min_szo && r.max_szo ? `${r.min_szo}–${r.max_szo} szó` : "nincs megadva";

  const nyelv = nyelve(r);
  // A visszajelzés nyelve (feladatonként): lásd kifejtos.kimenet()
  const kim = kifejtos.kimenet(r);

  // A mérce a szinttől ÉS a nyelvtől függ. Ha nincs szint, a sort ki is
  // hagyjuk – a "nincs megadva" felirat is arra bátorítaná az AI-t, hogy
  // maga találjon ki egyet.
  const szint = szintInfo(r);
  const szintSor = szint ? `${szint.cimke}: ${szint.ertek}\n` : "";
  const merce = szint
    ? (szint.anyanyelv
        ? `Ez ANYANYELVI dolgozat, a mérce: ${szint.ertek}. Ehhez mérj,
   ne CEFR-szinthez – a diáknak ez az anyanyelve.`
        : `A ${szint.ertek} szinthez mérj, ne anyanyelvi szinthez.`)
    : (anyanyelvu(r)
        ? `Ez ANYANYELVI dolgozat, és a tanár nem adott meg évfolyamot: a
   feladatból és a szempontokból ítéld meg, mit lehet elvárni. Szintet
   ne találj ki, és ne CEFR-skálán gondolkodj.`
        : `A tanár nem adott meg célszintet: a feladatból és a
   szempontokból ítéld meg, mit lehet elvárni. CEFR-szintet ne találj ki.`);

  return `Te egy tapasztalt ${nyelv}tanár vagy, aki ${kim.kod === "hu" ? "magyar " : ""}diákokat értékel.

# A FELADAT
Cím: ${feladat.cim}
A dolgozat nyelve: ${nyelv}
Típus: ${r.tipus || "nincs megadva"}
${szintSor}Elvárt hossz: ${hosszElvaras}
${r.feladat_leiras ? `\nA feladat leírása:\n${r.feladat_leiras}` : ""}
${r.egyeb_utasitas ? `\nA tanár külön kérése:\n${r.egyeb_utasitas}` : ""}

# ÉRTÉKELÉSI SZEMPONTOK
${szempontok || "  - nincs megadva"}

# A DIÁK DOLGOZATA (${beirt ? "a diák beírta" : "kézírásból átírva"})
"""
${atirat}
"""

# UTASÍTÁSOK
1. Minden szemponthoz adj pontszámot. A "max" mező pontosan a fent
   megadott maximum legyen, a "pont" pedig 0 és a maximum között.
   ${merce}
2. A "hibak" tömbbe vedd fel a konkrét hibákat. Minden hibánál az
   "idezet" a diák SZÓ SZERINTI szövegrészlete legyen, a "javaslat" a
   helyes változat, a "magyarazat" pedig egy rövid ${kim.melleknev} nyelvű indoklás.
   A "tipus" egy rövid, gépi feldolgozásra alkalmas címke legyen,
   a ${nyelv} nyelv nyelvtani fogalmaival (angolnál pl. "past_simple",
   "article_missing"; németnél pl. "dativ_falsch", "wortstellung") –
   ezekből készül az osztályszintű típushiba-statisztika, ezért
   ugyanarra a hibafajtára MINDIG ugyanazt a címkét használd.
   Az átiratban [?] jelöli az olvashatatlan részeket – ezeket NE
   számold hibának.
3. A "diak_szoveg" a diáknak szóló visszajelzés ${kim.hatarozoNagy}: barátságos,
   konstruktív hangnem, 3-5 bekezdés. Kezdd azzal, ami sikerült.
   Ne sorold fel az összes hibát – emeld ki a 2-3 legfontosabbat.
   Ne írj bele pontszámot és jegyet: azt a tanár állapítja meg.
   A bekezdéseket ÜRES SOR válassza el (a szövegben két sortörés), ne
   egyetlen összefüggő blokkot adj.
4. Az "erossegek" és "fejlesztendo" rövid, tömör felsorolások a tanárnak.
5. A KIMENET NYELVE: az összes szabad szöveges mező – a szempontonkénti
   "megjegyzes", a "magyarazat", az "erossegek", a "fejlesztendo" és a
   "diak_szoveg" – ${kim.hatarozoNagy} készüljön, következetesen, még akkor is, ha
   a dolgozat más nyelven íródott. Csak az "idezet" és a "javaslat" marad a
   dolgozat nyelvén (${nyelv}).`;
}

/**
 * @param {string} nyelv a tanított nyelv (angol, német…)
 * @param {string} [kimenetiNyelv] a szempontcímek és a leírás nyelve (hu | en)
 */
function rubrikaPrompt(nyelv, kimenetiNyelv) {
  const kim = kifejtos.kimenet(kimenetiNyelv);
  // Anyanyelvi feladatlapnál a CEFR értelmetlen: nem azt kérdezzük.
  const szintKeres = ANYANYELVEK.includes(nyelv)
    ? `- Melyik ÉVFOLYAMNAK szól a feladatlap? Ezt írd a "szint" mezőbe.
  CEFR-szintet NE adj meg: a dolgozat anyanyelvi, ott nincs értelme.
  Ha az évfolyam nem derül ki, HAGYD ÜRESEN a mezőt – ne tippelj.`
    : `- Milyen CEFR-szintet céloz? Ha a feladatlapból nem derül ki,
  HAGYD ÜRESEN a "szint" mezőt – ne találj ki szintet.`;

  return `Te egy tapasztalt ${nyelv}tanár vagy. A képen egy írásbeli
feladatlap látható.

Elemezd, és állítsd össze belőle az értékelési rubrikát:
- Milyen NYELVEN szól a feladat? A tanár ${nyelv}-t jelölt meg, de ha a
  feladatlap alapján más nyelvről van szó, a "nyelv" mezőben azt add meg.
- Milyen típusú írásbeli feladat ez?
${szintKeres}
- Mekkora terjedelmet vár el? (Ha a feladatlap megadja, azt használd.)
- Milyen szempontok szerint érdemes értékelni? Adj 3-5 szempontot,
  ${kim.melleknev} címekkel. A pontszámokat úgy oszd el, hogy az összeg PONTOSAN
  100 legyen – ez csak javaslat, a tanár utólag átskálázhatja (pl. 50
  pontos dolgozatra). A "kulcs" rövid, ékezet nélküli azonosító legyen
  (pl. tartalom, szerkezet, szokincs, nyelvtan).
- A "feladat_leiras" mezőbe a diák teljes feladata kerül, úgy, hogy a
  kivetítve is érthető legyen. Három része van, ebben a sorrendben:
  1. A HELYZET: a feladatlap bevezetője (pl. kit ír, miért, mi történt).
  2. A FELADATLAPON SZEREPLŐ SZÖVEG (hirdetés, cikk, levél, e-mail, amire
     a diák reagál) ÖSSZEFOGLALVA, 2-4 mondatban, a lényeges adatokkal
     (mi, hol, ki, mit kínálnak, milyen feltétel, kapcsolattartó). Ezt a
     részt NE hagyd ki: a feladat nélküle nem érthető. Szó szerint, hosszan
     NE másold át, foglald össze.
  3. A TEENDŐ: mit kell írni (műfaj, címzett, terjedelem), és a kért
     tartalmi pontok felsorolva, ahogy a lapon állnak.
  Ha a feladatlapon nincs ilyen szöveg, a 2. rész elmarad.
  - Ha a feladatlap nyelve MEGEGYEZIK a kimeneti nyelvvel (${kim.melleknev}), a
    helyzet és a teendő megfogalmazását és személyét ne változtasd meg
    (tartsd meg úgy, ahogy a lapon áll), csak a szöveget foglald össze.
  - Ha a feladatlap MÁS nyelvű, mindent ${kim.hatarozo} adj, és a helyzetet meg
    a teendőt másodikszemélyben (E/2) fogalmazd, a diákhoz szólva, ahogy egy
    feladatlap szokott (pl. "Írj egy levelet…", "Olvastál egy cikket,
    reagálj rá…"). Soha ne harmadik személyben ("A diáknak… kell írnia").

Ha valamit nem lehet kiolvasni a feladatlapból, adj józan
alapértelmezést – KIVÉVE a szintet: azt inkább hagyd üresen.
Egy kitalált szint rosszabb, mint a semmi, mert az értékelés ahhoz mér.`;
}

// ══════════════════════════════════════════════════════
// 1. OSZTÁLY LÉTREHOZÁSA
// Azért Function, mert a kód egyediségét a kodok/ nyilvántartóval
// tranzakciósan kell biztosítani – a kliens ezt nem tudja megtenni.
// ══════════════════════════════════════════════════════
async function osztalyLetrehozasLogika(firestore, uid, nev, kodGenerator = kodGeneralas) {
  const osztalyRef = firestore.collection("osztalyok").doc();

  // Ütközés esetén új kóddal próbálkozunk.
  for (let kiserlet = 0; kiserlet < 10; kiserlet++) {
    const kod = kodGenerator();
    try {
      await firestore.runTransaction(async (tx) => {
        const kodRef = firestore.collection("kodok").doc(kod);
        if ((await tx.get(kodRef)).exists) throw new Error("KOD_UTKOZES");

        tx.set(kodRef, {
          osztaly_id: osztalyRef.id,
          letrehozva: FieldValue.serverTimestamp()
        });
        tx.set(osztalyRef, {
          nev,
          kod,
          tanar_id: uid,
          aktiv: true,
          diak_szam: 0,
          letrehozva: FieldValue.serverTimestamp()
        });
      });

      logger.info("Osztály létrehozva", { osztalyId: osztalyRef.id, tanar: uid });
      return { osztalyId: osztalyRef.id, kod };
    } catch (e) {
      if (e.message !== "KOD_UTKOZES") throw e;
    }
  }

  throw hiba("resource-exhausted", "kod_generalas");
}

exports.osztalyLetrehozas = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = tanar(request);

  const nev = (request.data?.nev || "").trim();
  if (!nev) throw hiba("invalid-argument", "osztaly_nev_kell");
  if (nev.length > 100) throw hiba("invalid-argument", "osztaly_nev_hosszu");

  return await osztalyLetrehozasLogika(db(), uid, nev);
});

// ══════════════════════════════════════════════════════
// 2. CSATLAKOZÁS OSZTÁLYHOZ KÓD ALAPJÁN
// Azért Function, mert így a diákoknak NEM kell olvasási jog az
// osztalyok kollekcióra, és a kódpróbálgatás naplózható/limitálható.
// ══════════════════════════════════════════════════════
async function csatlakozasLogika(firestore, uid, kod) {
  return await firestore.runTransaction(async (tx) => {
    const kodSnap = await tx.get(firestore.collection("kodok").doc(kod));
    if (!kodSnap.exists) {
      logger.warn("Ismeretlen osztálykód", { kod, uid });
      throw hiba("not-found", "kod_nincs");
    }

    const osztalyRef = firestore.collection("osztalyok").doc(kodSnap.data().osztaly_id);
    const osztalySnap = await tx.get(osztalyRef);
    if (!osztalySnap.exists) {
      throw hiba("not-found", "osztaly_megszunt");
    }
    if (!osztalySnap.data().aktiv) {
      throw hiba("failed-precondition", "osztaly_zart");
    }

    const tagRef = osztalyRef.collection("tagok").doc(uid);
    if ((await tx.get(tagRef)).exists) {
      return { osztalyId: osztalyRef.id, nev: osztalySnap.data().nev, mar_tag: true };
    }

    const profilSnap = await tx.get(firestore.collection("felhasznalok").doc(uid));
    const profil = profilSnap.data() || {};

    tx.set(tagRef, {
      nev: profil.nev || "Névtelen",
      email: profil.email || "",
      csatlakozott: FieldValue.serverTimestamp()
    });

    // Tükör a felhasználó alatt: a diák így ki tudja listázni a saját
    // osztályait egyetlen olvasással, collection-group index nélkül.
    tx.set(
      firestore.collection("felhasznalok").doc(uid)
        .collection("osztalyaim").doc(osztalyRef.id),
      {
        nev: osztalySnap.data().nev,
        kod,
        tanar_id: osztalySnap.data().tanar_id,
        csatlakozott: FieldValue.serverTimestamp()
      }
    );

    tx.update(osztalyRef, { diak_szam: FieldValue.increment(1) });

    return { osztalyId: osztalyRef.id, nev: osztalySnap.data().nev, mar_tag: false };
  });
}

exports.osztalyhozCsatlakozas = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = belepve(request);

  const kod = (request.data?.kod || "").trim().toUpperCase();
  if (!/^[A-Z2-9]{3}-[A-Z2-9]{4}$/.test(kod)) {
    throw hiba("invalid-argument", "kod_formatum");
  }

  return await csatlakozasLogika(db(), uid, kod);
});

// ══════════════════════════════════════════════════════
// 3. FELADATLAP ELEMZÉSE → RUBRIKA JAVASLAT
// A régi elemezFeladatlapot utódja. Már nem szabadszöveges promptot
// ad vissza, hanem strukturált rubrikát, amit a tanár űrlapon
// szerkeszt és hagy jóvá.
// ══════════════════════════════════════════════════════
exports.feladatlapElemzes = onCall(AI_OPCIOK, async (request) => {
  const uid = tanar(request);

  const path = request.data?.feladatlapPath;
  if (!path) throw hiba("invalid-argument", "feladatlap_utvonal");

  // A tanár által választott nyelv csak támpont – a modell a feladatlap
  // alapján felülírhatja, és a válaszában jelzi a tényleges nyelvet.
  const nyelvTipp = NYELVEK.includes(request.data?.nyelv)
    ? request.data.nyelv
    : ALAP_NYELV;

  // A tanár csak a saját feltöltését elemezheti.
  if (!path.startsWith(`feladatlapok/${uid}/`)) {
    throw hiba("permission-denied", "nem_a_tied_feltoltes");
  }

  try {
    const { eredmeny: rubrika, modell } = await kvotaval(uid, "feladatlap", async () => geminiHivas(
      'rubrika',
      [{ text: rubrikaPrompt(nyelvTipp, request.data?.kimenetiNyelv) }, await fajlBase64(path)],
      rubrikaSchema(nyelvTipp),
      { tanar_id: uid, muvelet: "feladatlap" }
    ));

    // A szintet a VISSZAADOTT nyelv skáláján ellenőrizzük: ha az AI más
    // nyelvet látott a feladatlapon, mint amit a tanár jelölt, a szint
    // rossz skálán maradt. Ilyenkor inkább üres.
    rubrika.szint = szintSzures(nyelve(rubrika), rubrika.szint);

    // A súlyok összegét ellenőrizzük – az űrlap ezt jelzi a tanárnak.
    const sulyOsszeg = (rubrika.szempontok || []).reduce((s, sz) => s + (sz.suly || 0), 0);

    return { rubrika, suly_osszeg: sulyOsszeg, model: modell };
  } catch (e) {
    if (e instanceof HttpsError) throw e;   // pl. elfogyott a keret: a kódolt hiba marad
    logger.error("feladatlapElemzes hiba", { uid, path, hiba: e.message });
    throw belsoHiba(e, "ai_hiba");
  }
});

// ══════════════════════════════════════════════════════
// 4. BEADÁS FELDOLGOZÁSA
// Kétlépéses: átírás → a szöveg értékelése.
// ══════════════════════════════════════════════════════

// A feldolgozás „foglalása”: a trigger legalább egyszeri kézbesítésű, a tanár dupla
// kattintása is két futást indíthat – a foglalás tranzakcióban dönt, hogy melyik fut.
// A foglalás a `frissitve` időbélyeg után FOGLALAS_LEJARAT_MS-szel lejár (megszakadt
// futás után a tanár újrafuttathat); a futás minden írása a `futas_id`-hez kötött,
// így egy elavult futás nem írhat felül újabb állapotot.
const FOGLALAS_LEJARAT_MS = 10 * 60 * 1000;

function foglalasLejart(adat, most = Date.now()) {
  const t = adat?.frissitve?.toMillis?.();
  return !t || most - t > FOGLALAS_LEJARAT_MS;
}

/** @returns {Promise<string|null>} a futásazonosító; null, ha nem foglalható (más fut, vagy nem az induló állapot). */
async function beadasFoglalas(firestore, beadasRef, { csakFeltoltve = false } = {}) {
  const futasId = randomUUID();
  const sikerult = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(beadasRef);
    if (!snap.exists) return false;
    const adat = snap.data();
    if (csakFeltoltve && adat.statusz !== "feltoltve") return false;
    if (adat.statusz === "folyamatban" && !foglalasLejart(adat)) return false;
    tx.update(beadasRef, {
      statusz: "folyamatban",
      hiba: null,
      hiba_kod: null,
      hiba_adat: null,
      futas_id: futasId,
      frissitve: FieldValue.serverTimestamp()
    });
    return true;
  });
  return sikerult ? futasId : null;
}

const elavultFutas = () => Object.assign(
  new Error("A feldolgozást egy újabb futás átvette."), { elavult: true }
);

/** Írás előtt: még ez a futás a beadás gazdája? (Az írások nem atomiak vele, de szűk az ablak.) */
async function futasEllenorzes(beadasRef, futasId) {
  const snap = await beadasRef.get();
  if (snap.data()?.futas_id !== futasId) throw elavultFutas();
}

/** A beadás frissítése tranzakcióban, csak ha a futás még a gazdája. */
async function futasFrissites(beadasRef, futasId, mezok) {
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(beadasRef);
    if (snap.data()?.futas_id !== futasId) throw elavultFutas();
    tx.update(beadasRef, mezok);
  });
}

/**
 * Egy beadás javítása a TANÁR AI-keretéből (a diák nem fizet). A keretet a foglalás
 * (beadasFoglalas) ELŐTT foglaljuk le: ha elfogyott, a beadás állapota érintetlen
 * marad (egy már kijavított dolgozat nem esik vissza hibára az újrafuttatás miatt).
 * Ha a feldolgozás elhasal, vagy a foglalás nem sikerült (kihagyva), az egység visszakerül.
 */
async function feldolgozBeadas(beadasId, opciok = {}) {
  const snap = await db().collection("beadasok").doc(beadasId).get();
  if (!snap.exists) throw new Error("A beadás nem található.");
  return kvotaval(snap.data().tanar_id, "beadas", () => feldolgozBeadasBelso(beadasId, opciok));
}

async function feldolgozBeadasBelso(beadasId, opciok = {}) {
  const firestore = db();
  const beadasRef = firestore.collection("beadasok").doc(beadasId);

  const beadasSnap = await beadasRef.get();
  if (!beadasSnap.exists) throw new Error("A beadás nem található.");
  const beadas = beadasSnap.data();

  const feladatSnap = await firestore.collection("feladatok").doc(beadas.feladat_id).get();
  if (!feladatSnap.exists) throw new Error("A feladat nem található.");
  const feladat = feladatSnap.data();

  if (!feladat.rubrika) throw new Error("A feladathoz nincs rubrika.");

  // Letöltés és AI-hívás előtt: a kliens írta hivatkozások ellenőrzése.
  const osszerendeles = beadasOsszerendeles(beadasId, beadas, feladat);
  if (osszerendeles) {
    logger.warn("Érvénytelen beadás-összerendelés", { beadasId, ok: osszerendeles });
    throw new Error("A beadás adatai nem egyeznek a feladattal.");
  }

  const kepPaths = beadas.kep_paths;

  const futasId = await beadasFoglalas(firestore, beadasRef, opciok);
  if (!futasId) {
    logger.info("A beadás feldolgozása nem foglalható (már fut, vagy nem induló állapot)", { beadasId });
    return { kihagyva: true };
  }

  // A hiba mentéséhez a hívó a futásazonosítót is megkapja (hibaraAllit).
  try {
    return await feldolgozFutas({ firestore, beadasRef, beadasId, beadas, feladat, feladatRef: feladatSnap.ref, kepPaths, futasId });
  } catch (e) {
    e.futasId = futasId;
    throw e;
  }
}

async function feldolgozFutas({ firestore, beadasRef, beadasId, beadas, feladat, feladatRef, kepPaths, futasId }) {
  // Kifejtős dolgozat: más átírás, más értékelés, a pontot a kód adja.
  // A hiányzó mód a régi (íráskészség) útvonal – az változatlan.
  if (kifejtos.feladatMod(feladat.rubrika) === "kifejtos") {
    return await feldolgozKifejtos(beadasRef, feladatRef, feladat, kepPaths, futasId);
  }

  // ── 1. lépés: átírás ──
  // Külön lépés, hogy a tanár lássa, mit olvasott ki az AI – e nélkül
  // nem lehet megállapítani, hogy a diák hibázott vagy az AI félreolvasott.
  // BEÍRT dolgozatnál nincs mit átírni: a diák szövege maga az átirat (nincs AI-hívás, nincs kép).
  let atirat;
  let atirasModell = null;
  if (beadas.forras === "szoveg") {
    atirat = beadas.szoveg.trim();
    await futasFrissites(beadasRef, futasId, {
      atirat,
      atirat_olvashatosag: null,
      atirat_megjegyzes: null,
      atirat_model: null,
      frissitve: FieldValue.serverTimestamp()
    });
  } else {
    const kepek = await kepekBetoltese(kepPaths);
    const { eredmeny: atiratValasz, modell } = await geminiHivas(
      'atiras',
      [{ text: atiratPrompt(nyelve(feladat.rubrika)) }, ...kepek],
      ATIRAT_SCHEMA,
      { tanar_id: beadas.tanar_id, muvelet: "beadas_atiras", mod: "leveles", feladat_id: beadas.feladat_id, beadas_id: beadasId }
    );
    atirasModell = modell;

    atirat = (atiratValasz.atirat || "").trim();
    if (!atirat) throw new Error("Az átírás üres szöveget adott.");

    await futasFrissites(beadasRef, futasId, {
      atirat,
      atirat_olvashatosag: atiratValasz.olvashatosag || null,
      atirat_megjegyzes: atiratValasz.megjegyzes || null,
      // Melyik modell olvasta fel – e nélkül utólag nem lehet
      // összehasonlítani két modell kézírás-pontosságát.
      atirat_model: atirasModell,
      frissitve: FieldValue.serverTimestamp()
    });
  }

  // ── 2. lépés: értékelés a SZÖVEG alapján ──
  // Így a rubrika módosítása után fillérekért újrafuttatható, kép nélkül.
  const { eredmeny: ertekeles, modell: ertekelesModell } = await geminiHivas(
    'ertekeles',
    [{ text: ertekelesPrompt({ ...feladat }, atirat, { beirt: beadas.forras === "szoveg" }) }],
    ERTEKELES_SCHEMA,
    { tanar_id: beadas.tanar_id, muvelet: "beadas_ertekeles", mod: "leveles", feladat_id: beadas.feladat_id, beadas_id: beadasId }
  );

  // Az összpontszámot mi számoljuk – ne a modell aritmetikájára bízzuk, és a
  // szempontokat/maximumokat a tanár rubrikájához kötjük (az AI kimenete nem megbízható).
  const szempontok = szempontokTisztitas(ertekeles.szempontok, feladat.rubrika, { hianyHiba: true });
  const osszpontszam = szempontok.reduce((s, sz) => s + sz.pont, 0);
  const maxPontszam = szempontok.reduce((s, sz) => s + sz.max, 0);

  await futasEllenorzes(beadasRef, futasId);
  await firestore
    .collection("beadasok").doc(beadasId)
    .collection("ertekeles").doc("ai")
    .set({
      szempontok,
      osszpontszam,
      max_pontszam: maxPontszam,
      szazalek: maxPontszam > 0 ? Math.round((osszpontszam / maxPontszam) * 100) : null,
      hibak: ertekeles.hibak || [],
      erossegek: ertekeles.erossegek || [],
      fejlesztendo: ertekeles.fejlesztendo || [],
      diak_szoveg: kifejtos.bekezdesekre(ertekeles.diak_szoveg),
      szoszam: ertekeles.szoszam || null,
      model: ertekelesModell,
      atirat_model: atirasModell,
      generalva: FieldValue.serverTimestamp()
    });

  await futasFrissites(beadasRef, futasId, {
    statusz: "javitva",
    frissitve: FieldValue.serverTimestamp()
  });

  logger.info("Beadás kijavítva", { beadasId, osszpontszam, maxPontszam });
  return { osszpontszam, maxPontszam };
}

// ── KIFEJTŐS DOLGOZAT ──
// Terv: docs/kifejtos-mod-terv.md. A tiszta függvények a kifejtos.js-ben.

async function feldolgozKifejtos(beadasRef, feladatRef, feladat, kepPaths, futasId) {
  // A kulcs külön, csak tanári alkollekcióban van: a feladat dokumentumát
  // a diák olvashatja, a kulcs viszont maga a megoldás.
  const kulcsSnap = await feladatRef.collection("kulcs").doc("aktualis").get();
  if (!kulcsSnap.exists) {
    throw new Error("A feladathoz még nincs megoldókulcs – a tanár a feladat szerkesztésénél készítheti el.");
  }
  const kulcsAdat = kulcsSnap.data();
  const kulcs = kifejtos.kulcsEllenorzes(kulcsAdat);
  const szoszedet = Array.isArray(kulcsAdat.szoszedet) && kulcsAdat.szoszedet.length
    ? kulcsAdat.szoszedet.map(String)
    : kifejtos.szoszedetGyujtes(kulcs);

  // ── 1. lépés: kérdésenkénti átírás ──
  const kepek = await kepekBetoltese(kepPaths);
  const { eredmeny: atiras, modell: atirasModell } = await geminiHivas(
    "atiras",
    [{ text: kifejtos.kifejtosAtiratPrompt(kulcs, szoszedet) }, ...kepek],
    kifejtos.KIFEJTOS_ATIRAT_SCHEMA,
    { tanar_id: feladat.tanar_id, muvelet: "beadas_atiras", mod: "kifejtos", feladat_id: feladatRef.id, beadas_id: beadasRef.id }
  );

  const atirat = kifejtos.atiratOsszefuzes(atiras);
  if (!atirat) throw new Error("Az átírás üres szöveget adott.");

  await futasFrissites(beadasRef, futasId, {
    atirat,
    atirat_valaszok: (atiras.valaszok || []).map((v) => ({
      kerdes: String(v.kerdes ?? ""),
      valasz: String(v.valasz ?? ""),
      bizonytalan: Array.isArray(v.bizonytalan) ? v.bizonytalan.map(String) : []
    })),
    atirat_tablazatok: (atiras.tablazatok || []).map((t) => ({
      kerdes: String(t.kerdes ?? ""),
      cellak: (t.cellak || []).map((c) => ({
        sor: String(c.sor ?? ""), oszlop: String(c.oszlop ?? ""), ertek: String(c.ertek ?? "")
      }))
    })),
    atirat_olvashatosag: atiras.olvashatosag || null,
    atirat_megjegyzes: atiras.megjegyzes || null,
    atirat_model: atirasModell,
    frissitve: FieldValue.serverTimestamp()
  });

  // ── 2. lépés: értékelés – az AI státuszt ad, a pontot a kód ──
  // A tananyag SZÁNDÉKOSAN nem kerül ide: a kulcs abból készült, és a
  // tanár jóváhagyta (lásd kifejtosErtekelesPrompt).
  const valaszok = kifejtos.valaszSzovegek(atiras);
  const { eredmeny: ai, modell: ertekelesModell } = await geminiHivas(
    "ertekeles",
    [{ text: kifejtos.kifejtosErtekelesPrompt(feladat, kulcs, valaszok) }],
    kifejtos.KIFEJTOS_ERTEKELES_SCHEMA,
    { tanar_id: feladat.tanar_id, muvelet: "beadas_ertekeles", mod: "kifejtos", feladat_id: feladatRef.id, beadas_id: beadasRef.id }
  );

  const ertekeles = kifejtos.kifejtosErtekelesOsszeallitas(
    kulcs, ai, valaszok, kifejtos.skalaFeloldas(feladat.rubrika)
  );

  await futasEllenorzes(beadasRef, futasId);
  await beadasRef.collection("ertekeles").doc("ai").set({
    ...ertekeles,
    model: ertekelesModell,
    atirat_model: atirasModell,
    generalva: FieldValue.serverTimestamp()
  });

  await futasFrissites(beadasRef, futasId, {
    statusz: "javitva",
    frissitve: FieldValue.serverTimestamp()
  });

  logger.info("Kifejtős beadás kijavítva", {
    beadasId: beadasRef.id,
    osszpontszam: ertekeles.osszpontszam,
    maxPontszam: ertekeles.max_pontszam,
    figyelmeztetes: ertekeles.figyelmeztetesek.length
  });
  return { osszpontszam: ertekeles.osszpontszam, maxPontszam: ertekeles.max_pontszam };
}

/** Hibakezelés: a státusz 'hiba' lesz, olvasható üzenettel. */
async function hibaraAllit(beadasId, e, futasId = null) {
  logger.error("Beadás feldolgozási hiba", { beadasId, hiba: e.message });
  try {
    const ref = db().collection("beadasok").doc(beadasId);
    await db().runTransaction(async (tx) => {
      const adat = (await tx.get(ref)).data();
      if (!adat) return;
      // Elavult futás hibája ne írjon felül újabb állapotot; foglalás nélküli (korai)
      // hiba se írja felül a másik, még élő futás állapotát.
      if (futasId ? adat.futas_id !== futasId : (adat.statusz === "folyamatban" && !foglalasLejart(adat))) {
        logger.warn("A hibastátusz nem íródik (másik futás a gazda)", { beadasId });
        return;
      }
      // A kódolt hiba (pl. elfogyott a keret) kódját is mentjük: a javító nézet
      // ebből a saját nyelvén írja ki.
      tx.update(ref, {
        statusz: "hiba",
        hiba: e.message,
        hiba_kod: e.details?.kod || null,
        hiba_adat: e.details || null,
        frissitve: FieldValue.serverTimestamp()
      });
    });
  } catch (masodlagos) {
    logger.error("A hibastátusz mentése sem sikerült", { beadasId, hiba: masodlagos.message });
  }
}

/**
 * Trigger: új beadás → automatikus javítás.
 *
 * Azért trigger és nem kliens-hívás: több kép Gemini-elemzése simán
 * túlfut az onCall alapértelmezett 60 másodpercén, és a diáknak nem
 * kell nyitva tartania a böngészőt. A kliens onSnapshot-tal figyeli
 * a statusz mezőt.
 *
 * retry: false – egy elhasalt Gemini-hívást nem akarunk vég nélkül
 * (és fizetős módon) újrapróbálni. Kézi újrafuttatás: lásd alább.
 */
exports.beadasFeldolgozas = onDocumentCreated(
  {
    document: "beadasok/{beadasId}",
    region: REGION,
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 540,
    memory: "1GiB",
    retry: false
  },
  async (event) => {
    const beadasId = event.params.beadasId;
    try {
      // Csak az induló állapotból: egy duplán kézbesített esemény hatástalan.
      await feldolgozBeadas(beadasId, { csakFeltoltve: true });
    } catch (e) {
      await hibaraAllit(beadasId, e, e.futasId);
    }
  }
);

// ══════════════════════════════════════════════════════
// 5. ÚJRAFUTTATÁS (tanár)
// Elhasalt feldolgozás után, vagy ha a rubrika változott.
// ══════════════════════════════════════════════════════
exports.beadasUjrafuttatas = onCall(
  { ...AI_OPCIOK, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const uid = tanar(request);

    const beadasId = request.data?.beadasId;
    if (!beadasId) throw hiba("invalid-argument", "beadas_id_kell");

    const beadasSnap = await db().collection("beadasok").doc(beadasId).get();
    if (!beadasSnap.exists) throw hiba("not-found", "beadas_nincs");
    if (beadasSnap.data().tanar_id !== uid) {
      throw hiba("permission-denied", "nem_a_te_beadasod");
    }
    if (beadasSnap.data().statusz === "folyamatban" && !foglalasLejart(beadasSnap.data())) {
      throw hiba("failed-precondition", "beadas_folyamatban");
    }

    let eredmeny;
    try {
      eredmeny = await feldolgozBeadas(beadasId);
    } catch (e) {
      // Elfogyott keretnél a beadás állapota érintetlen marad (egy már kijavított
      // dolgozat ne essen vissza hibára attól, hogy az újrafuttatás nem fér a keretbe).
      if (e instanceof HttpsError && String(e.details?.kod || "").startsWith("kvota_elfogyott")) throw e;
      await hibaraAllit(beadasId, e, e.futasId);
      if (e instanceof HttpsError) throw e;
      throw belsoHiba(e, "ai_hiba");
    }
    // A foglalás tranzakcióban dől el: ha közben másik futás vette át, nincs mit tenni.
    if (eredmeny.kihagyva) throw hiba("failed-precondition", "beadas_folyamatban");
    return { siker: true, ...eredmeny };
  }
);

/**
 * Az AI szempontonkénti pontjai a tanár rubrikájához kötve. Az AI kimenete (és a
 * diák szövege, ami a promptba kerül) nem megbízható: a maximumot a rubrika adja
 * (`suly`), a pont véges és 0..max közé szorított, kulcsonként egy tétel, ismeretlen
 * kulcsot eldobunk. Hiányzó szempont: hianyHiba esetén hiba (új feldolgozás), különben
 * 0 pont (a már mentett értékelések jóváhagyásánál nem akadályozhatjuk a tanárt).
 * Rubrika-szempontok nélkül (nincs mihez kötni) csak a számokat szorítjuk.
 */
function szempontokTisztitas(aiSzempontok, rubrika, { hianyHiba = false } = {}) {
  const lista = Array.isArray(aiSzempontok) ? aiSzempontok.filter((x) => x && typeof x === "object") : [];
  const veges = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const szoveg = (v) => String(v ?? "").slice(0, 2000);
  const rubrikaSz = (rubrika?.szempontok || []).filter((sz) => sz && typeof sz.kulcs === "string");

  if (rubrikaSz.length === 0) {
    return lista.map((x) => {
      const max = Math.max(0, veges(x.max));
      return { kulcs: String(x.kulcs ?? ""), pont: Math.min(max, Math.max(0, veges(x.pont))), max, megjegyzes: szoveg(x.megjegyzes) };
    });
  }

  return rubrikaSz.map((sz) => {
    const max = Math.max(0, veges(sz.suly));
    const x = lista.find((a) => a.kulcs === sz.kulcs);
    if (!x) {
      if (hianyHiba) throw new Error(`Az AI-értékelésből hiányzik a(z) „${sz.kulcs}” szempont – futtasd újra.`);
      return { kulcs: sz.kulcs, pont: 0, max, megjegyzes: "" };
    }
    return { kulcs: sz.kulcs, pont: Math.min(max, Math.max(0, veges(x.pont))), max, megjegyzes: szoveg(x.megjegyzes) };
  });
}

/**
 * A diáknak kimenő pontozási táblázat.
 *
 * A váz (mely szempontok, mennyi a maximum) az AI-értékelésből jön – a
 * kliens ezt nem írhatja át. A tanár szempontonként a pontot és a
 * megjegyzést módosíthatja; az összeget és a százalékot mi számoljuk.
 *
 * @param {object} ai az ertekeles/ai dokumentum
 * @param {object} rubrika a feladat rubrikája (a szempontok címeihez)
 * @param {Array<{kulcs, pont, megjegyzes}>} [modositasok] a tanár módosításai
 */
function pontTablazat(ai, rubrika, modositasok) {
  const cimek = Object.fromEntries(
    (rubrika?.szempontok || []).map((sz) => [sz.kulcs, sz.cim])
  );
  const modMap = new Map(
    (Array.isArray(modositasok) ? modositasok : [])
      .filter((m) => m && typeof m.kulcs === "string")
      .map((m) => [m.kulcs, m])
  );

  const szempontok = (ai?.szempontok || []).map((sz) => {
    const max = Number(sz.max) || 0;
    // Kifejtős módban nincs rubrika-szempont: a címet az értékelés hozza.
    const cim = cimek[sz.kulcs] || sz.cim || sz.kulcs;
    const m = modMap.get(sz.kulcs);

    let pont = Number(sz.pont) || 0;
    if (m && m.pont != null && m.pont !== "") {
      const p = Number(m.pont);
      if (!Number.isFinite(p) || p < 0 || p > max) {
        throw Object.assign(
          new Error(`Érvénytelen pontszám – ${cim}: 0 és ${max} között lehet.`),
          { kod: "pont_hatar", parameterek: { cim, max } }
        );
      }
      pont = p;
    }

    const megjegyzes = String(m?.megjegyzes ?? sz.megjegyzes ?? "").trim().slice(0, 2000);
    return { kulcs: sz.kulcs, cim, pont, max, megjegyzes };
  });

  const osszpontszam = szempontok.reduce((s, sz) => s + sz.pont, 0);
  const maxPontszam = szempontok.reduce((s, sz) => s + sz.max, 0);

  return {
    szempontok,
    osszpontszam,
    max_pontszam: maxPontszam,
    szazalek: maxPontszam > 0 ? Math.round((osszpontszam / maxPontszam) * 100) : null
  };
}

// ══════════════════════════════════════════════════════
// 6. VISSZAJELZÉS JÓVÁHAGYÁSA (tanár)
// Ez az a pont, ahol a diák egyáltalán megláthat bármit: egyszerre
// írja a tanári visszajelzést és állítja 'elkuldve'-re a státuszt.
// ══════════════════════════════════════════════════════
async function jovahagyasLogika(uid, adat) {
  // szempontok: fogalmazásnál a tanár pontjai szempontonként.
  // kerdesek: kifejtősnél a tanár elemstátusz-felülírásai (pontot nem küldhet).
  const { beadasId, jegy, szoveg, szempontok, kerdesek } = adat || {};
  if (!beadasId) throw hiba("invalid-argument", "beadas_id_kell");
  if (!szoveg || !szoveg.trim()) {
    throw hiba("invalid-argument", "visszajelzes_ures");
  }

  const firestore = db();
  const beadasRef = firestore.collection("beadasok").doc(beadasId);

  const beadasSnap = await beadasRef.get();
  if (!beadasSnap.exists) throw hiba("not-found", "beadas_nincs");

  const beadas = beadasSnap.data();
  if (beadas.tanar_id !== uid) {
    throw hiba("permission-denied", "nem_a_te_beadasod");
  }
  if (!["javitva", "elkuldve"].includes(beadas.statusz)) {
    throw hiba("failed-precondition", "statusz_nem_kuldheto", { statusz: beadas.statusz });
  }

  // A pontozási táblázat a diák visszajelzésébe: az AI-értékelés NEM
  // olvasható a diáknak, ezért a jóváhagyott változatot ide másoljuk.
  const [aiSnap, feladatSnap] = await Promise.all([
    beadasRef.collection("ertekeles").doc("ai").get(),
    firestore.collection("feladatok").doc(beadas.feladat_id).get()
  ]);
  // A beadás tanar_id-ját a kliens írta: a jóváhagyó csak a feladat valódi
  // tanára lehet (különben idegen feladat kulcsa kerülne a visszajelzésbe).
  if (feladatSnap.data()?.tanar_id !== uid
      || feladatSnap.data()?.osztaly_id !== beadas.osztaly_id) {
    throw hiba("permission-denied", "nem_a_te_beadasod");
  }
  // A jegy a FELADAT skáláján értelmezett (magyar 1–5, A–F, százalék…);
  // a tárolt érték a skála saját alakja, nem a kliens által küldött.
  const skala = kifejtos.skalaFeloldas(feladatSnap.data()?.rubrika);
  const tanariJegy = jegy == null ? null : kifejtos.jegyNormalizalas(jegy, skala);
  if (tanariJegy === undefined) throw hiba("invalid-argument", "jegy_ertek");

  let tabla = { szempontok: [], osszpontszam: null, max_pontszam: null, szazalek: null };
  if (aiSnap.exists && aiSnap.data().mod === "kifejtos") {
    // Kifejtős dolgozat: a pontot a KULCSBÓL számoljuk, a tanár felülírt
    // elemstátuszaival – ugyanazzal a függvénnyel, amit a javító nézet mutat.
    const kulcsSnap = await feladatSnap.ref.collection("kulcs").doc("aktualis").get();
    if (!kulcsSnap.exists) {
      throw hiba("failed-precondition", "kulcs_nincs");
    }
    let kulcs;
    try {
      kulcs = kifejtos.kulcsEllenorzes(kulcsSnap.data());
    } catch (e) {
      throw hibaAtvezet("failed-precondition", e);
    }
    const rubrika = feladatSnap.data()?.rubrika || {};
    tabla = kifejtos.kifejtosTanariEredmeny(kulcs, aiSnap.data(), kerdesek, {
      skala,
      helyesLathato: rubrika.helyes_valaszok_lathatok !== false
    });
  } else if (aiSnap.exists) {
    try {
      // A korábban mentett AI-adatot is a rubrikához kötjük (az AI maximumai nem megbízhatók).
      const rubrika = feladatSnap.data()?.rubrika;
      const ai = { ...aiSnap.data(), szempontok: szempontokTisztitas(aiSnap.data().szempontok, rubrika) };
      tabla = pontTablazat(ai, rubrika, szempontok);
    } catch (e) {
      throw hibaAtvezet("invalid-argument", e);
    }
  }

  const batch = firestore.batch();

  batch.set(beadasRef.collection("ertekeles").doc("tanari"), {
    jegy: tanariJegy,
    // A megjelenítéshez: százalékos skálán a jegy %-jelet kap
    jegy_tipus: skala.tipus,
    szoveg: szoveg.trim(),
    ...tabla,
    tanar_id: uid,
    jovahagyva_at: FieldValue.serverTimestamp()
  });

  batch.update(beadasRef, {
    statusz: "elkuldve",
    frissitve: FieldValue.serverTimestamp()
  });

  await batch.commit();

  logger.info("Visszajelzés elküldve", {
    beadasId, tanar: uid, jegy: tanariJegy, pont: tabla.osszpontszam
  });
  return { siker: true };
}

exports.visszajelzesJovahagyas = onCall(HIVAS_OPCIOK, async (request) => {
  return jovahagyasLogika(tanar(request), request.data);
});

// ══════════════════════════════════════════════════════
// TESZT-FELÜLET
// A tranzakciós logikát a hitelesítés mögül kiemelve exportáljuk,
// hogy emulátor ellen tesztelhető legyen (tests/functions.test.mjs).
// Éles kódból ezeket ne hívd – a wrapperek végzik a jogosultság-
// ellenőrzést és a bemenet-validálást.
// ══════════════════════════════════════════════════════
exports._teszt = {
  claimOsszefuzes,
  HIBA_SZOVEG,
  hiba,
  hibaAtvezet,
  belsoHiba,
  elemzesAggregalas,
  elemzesPrompt,
  atiratPrompt,
  ATIRAT_SCHEMA,
  geminiKeres,
  ertekelesPrompt,
  rubrikaPrompt,
  rubrikaSchema,
  pontTablazat,
  nyelve,
  anyanyelvu,
  szintInfo,
  szintSzures,
  NYELVEK,
  ALAP_NYELV,
  ANYANYELVEK,
  CEFR_SZINTEK,
  EVFOLYAMOK,
  osztalyLetrehozasLogika,
  csatlakozasLogika,
  jovahagyasLogika,
  beadasOsszerendeles,
  beadasiMod,
  BEIRT_SZOVEG_MAX,
  beadasFoglalas,
  feldolgozBeadas,
  foglalasLejart,
  hibaraAllit,
  szempontokTisztitas,
  FOGLALAS_LEJARAT_MS,
  tanariRegisztracioLogika,
  kvotaFoglalas,
  kvotaVisszaadas,
  kvotaval,
  kvotaAllapotLogika,
  csomagBeallitasLogika,
  fizetesAllapotLogika,
  stripeEsemenyFeldolgozas,
  stripeWebhookKezeles,
  fizetesInditasLogika,
  fizetesKezelesLogika,
  aiHasznalatNaplo,
  aiHasznalatJelentesLogika,
  BEALLITASOK,
  kodGeneralas,
  geminiHivas,
  atmenetiHiba,
  UJRAPROBA,
  MODELLEK,
  TARTALEK,
  GONDOLKODAS
};

// ══════════════════════════════════════════════════════
// 7. SAJÁT NÉV MÓDOSÍTÁSA
//
// Azért Function és nem kliensoldali írás: a megjelenítendő név
// denormalizálva van három helyre, és a szabályok szerint a kliens
// csak az elsőt írhatja:
//   felhasznalok/{uid}.nev            ← a kliens írhatná
//   osztalyok/{oid}/tagok/{uid}.nev   ← a tanár ezt látja a névsorban
//   beadasok/*.diak_nev               ← a tanár ezt látja a javítási sorban
//
// Ha csak a profilt írnánk át, a diák azt hinné, megjavította a nevét,
// a tanár viszont továbbra is a régit látná.
// ══════════════════════════════════════════════════════

/** Batch-ek 400-as darabokban – a Firestore korlát 500 írás. */
async function darabolvaCommit(firestore, muveletek) {
  const MERET = 400;
  for (let i = 0; i < muveletek.length; i += MERET) {
    const batch = firestore.batch();
    for (const m of muveletek.slice(i, i + MERET)) m(batch);
    await batch.commit();
  }
}

exports.nevModositas = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = belepve(request);

  const nev = (request.data?.nev || "").trim().replace(/\s+/g, " ");
  if (nev.length < 2) {
    throw hiba("invalid-argument", "nev_rovid");
  }
  if (nev.length > 80) {
    throw hiba("invalid-argument", "nev_hosszu");
  }

  const firestore = db();
  const muveletek = [];

  // 1. A profil
  muveletek.push((b) => b.update(firestore.collection("felhasznalok").doc(uid), { nev }));

  // 2. Osztálynévsorok. A tükörből tudjuk, melyik osztályokban van;
  //    a tagok dokumentum létét ellenőrizzük, hogy egy törölt osztály
  //    ne buktassa el az egész batch-et.
  const osztalyaim = await firestore
    .collection("felhasznalok").doc(uid)
    .collection("osztalyaim").get();

  let nevsorDb = 0;
  for (const d of osztalyaim.docs) {
    const tagRef = firestore
      .collection("osztalyok").doc(d.id)
      .collection("tagok").doc(uid);
    if ((await tagRef.get()).exists) {
      muveletek.push((b) => b.update(tagRef, { nev }));
      nevsorDb++;
    }
  }

  // 3. Korábbi beadások
  const beadasok = await firestore
    .collection("beadasok").where("diak_id", "==", uid).get();

  for (const d of beadasok.docs) {
    muveletek.push((b) => b.update(d.ref, { diak_nev: nev }));
  }

  await darabolvaCommit(firestore, muveletek);

  logger.info("Név módosítva", { uid, nevsorDb, beadasDb: beadasok.size });
  return { nev, nevsor: nevsorDb, beadas: beadasok.size };
});

// ══════════════════════════════════════════════════════
// 8. DIÁK ELTÁVOLÍTÁSA OSZTÁLYBÓL
//
// Három helyet kell egyszerre módosítani, ezért tranzakció:
//   osztalyok/{oid}/tagok/{uid}            – törlés (a névsor)
//   felhasznalok/{uid}/osztalyaim/{oid}    – törlés (a diák tükre)
//   osztalyok/{oid}.diak_szam              – csökkentés
//
// A diák BEADÁSAIT SZÁNDÉKOSAN MEGHAGYJUK: a tanárnak szüksége lehet a
// korábbi dolgozatokra, és a diák is megtarthatja a visszajelzéseit
// (azok olvasása nem tagságtól függ). Új feladatot viszont nem fog
// látni, és beadni sem tud.
// ══════════════════════════════════════════════════════
exports.diakEltavolitas = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = tanar(request);

  const { osztalyId, diakUid } = request.data || {};
  if (!osztalyId || !diakUid) {
    throw hiba("invalid-argument", "osztaly_diak_id_kell");
  }

  const firestore = db();
  const osztalyRef = firestore.collection("osztalyok").doc(osztalyId);

  return await firestore.runTransaction(async (tx) => {
    const osztalySnap = await tx.get(osztalyRef);
    if (!osztalySnap.exists) {
      throw hiba("not-found", "osztaly_nincs");
    }
    if (osztalySnap.data().tanar_id !== uid) {
      throw hiba("permission-denied", "nem_a_te_osztalyod");
    }

    const tagRef = osztalyRef.collection("tagok").doc(diakUid);
    const tagSnap = await tx.get(tagRef);
    if (!tagSnap.exists) {
      throw hiba("not-found", "diak_nem_tag");
    }

    const nev = tagSnap.data().nev || "a diák";

    tx.delete(tagRef);
    tx.delete(
      firestore.collection("felhasznalok").doc(diakUid)
        .collection("osztalyaim").doc(osztalyId)
    );

    // Nem increment(-1): egy elszállt számláló ne menjen negatívba.
    const jelenlegi = Number(osztalySnap.data().diak_szam) || 0;
    tx.update(osztalyRef, { diak_szam: Math.max(0, jelenlegi - 1) });

    logger.info("Diák eltávolítva", { osztalyId, diakUid, tanar: uid });
    return { nev };
  });
});

// ══════════════════════════════════════════════════════
// 9. SZEREPKEZELÉS (admin)
//
// Az "admin" külön claim a "szerep" MELLETT, nem helyette: az admin
// jellemzően maga is tanár, tehát a kettő ortogonális.
//   { szerep: 'tanar', admin: true }
//
// FIGYELEM: a setCustomUserClaims a TELJES claim-halmazt felülírja.
// Ezért minden írás előtt be kell olvasni a meglévőket és összefűzni –
// különben egy szerep-állítás letörölné az admin jelzőt.
// ══════════════════════════════════════════════════════

const ERVENYES_SZEREPEK = ["tanar", "diak"];

/** Admin jogosultság megkövetelése. */
function admin(request) {
  const uid = belepve(request);
  if (request.auth.token?.admin !== true) {
    throw hiba("permission-denied", "admin_kell");
  }
  return uid;
}

/**
 * Claim-ek összefűzése a meglévőkkel.
 * Kiemelve, hogy tesztelhető legyen – ez a rész könnyen elrontható,
 * és a hiba csak később derülne ki (eltűnt admin jelző).
 */
function claimOsszefuzes(meglevo, valtozasok) {
  const uj = { ...(meglevo || {}) };
  for (const [k, v] of Object.entries(valtozasok)) {
    if (v === null) delete uj[k];
    else uj[k] = v;
  }
  return uj;
}

// ── FELHASZNÁLÓK LISTÁJA ──
// A felhasznalok kollekciót a szabályok senkinek nem engedik listázni;
// itt admin SDK-val olvassuk, admin jogosultsághoz kötve.
exports.felhasznalokListaja = onCall(HIVAS_OPCIOK, async (request) => {
  admin(request);

  const [authLista, profilok] = await Promise.all([
    getAuth().listUsers(1000),
    db().collection("felhasznalok").get()
  ]);

  // Csomag és e havi használat (csak ahol a kvóta él).
  const csomagok = {};
  const hasznalatok = {};
  if (BEALLITASOK.kvota) {
    const tanarok = authLista.users.filter((u) => u.customClaims?.szerep === "tanar");
    const tanarSnap = tanarok.length ? await db().getAll(...tanarok.map((u) => db().collection("tanarok").doc(u.uid))) : [];
    tanarSnap.forEach((s) => { csomagok[s.id] = kvota.csomagNev(s.data()?.csomag); });
    // A használat-dokumentum a csomagtól függ (egyszeri: "osszes", havi: a hónap).
    const hasznalatSnap = tanarok.length
      ? await db().getAll(...tanarok.map((u) => db().collection("tanarok").doc(u.uid)
          .collection("hasznalat").doc(kvota.hasznalatKulcs(csomagok[u.uid]))))
      : [];
    hasznalatSnap.forEach((s) => { hasznalatok[s.ref.parent.parent.id] = Math.max(0, s.data()?.egyseg || 0); });
  }

  const nevek = {};
  profilok.docs.forEach((d) => {
    nevek[d.id] = {
      nev: d.data().nev,
      tukorSzerep: d.data().szerep,
      tukorAdmin: d.data().admin === true
    };
  });

  const felhasznalok = authLista.users.map((u) => ({
    uid: u.uid,
    email: u.email || "",
    nev: nevek[u.uid]?.nev || u.displayName || "Névtelen",
    // A CLAIM az igazság, a Firestore-mező csak tükör
    szerep: u.customClaims?.szerep || "diak",
    admin: u.customClaims?.admin === true,
    // Ha a tükör és a claim eltér, a felhasználó tokenje elavult.
    // A guard.js a következő oldalbetöltésnél magától frissíti – ez a
    // jelzés csak tájékoztatás az adminnak.
    tukor_eltero:
      (nevek[u.uid]?.tukorSzerep || "diak") !== (u.customClaims?.szerep || "diak") ||
      (nevek[u.uid]?.tukorAdmin === true) !== (u.customClaims?.admin === true),
    letrehozva: u.metadata?.creationTime || null,
    utolso_belepes: u.metadata?.lastSignInTime || null,
    // csak tanárnál és csak ott, ahol a kvóta él
    csomag: csomagok[u.uid] ?? null,
    hasznalt: hasznalatok[u.uid] ?? null
  }));

  felhasznalok.sort((a, b) => a.nev.localeCompare(b.nev, "hu"));

  return {
    felhasznalok,
    csonkolt: authLista.pageToken != null,
    kvota: BEALLITASOK.kvota,
    csomagok: Object.fromEntries(Object.entries(kvota.CSOMAGOK).map(([nev, c]) => [nev, { keret: c.keret, idoszak: c.idoszak }]))
  };
});

// ── SZEREP BEÁLLÍTÁSA ──
exports.szerepBeallitas = onCall(HIVAS_OPCIOK, async (request) => {
  const adminUid = admin(request);

  const { uid, szerep, adminJog } = request.data || {};
  if (!uid) throw hiba("invalid-argument", "felhasznalo_id_kell");

  if (szerep !== undefined && !ERVENYES_SZEREPEK.includes(szerep)) {
    throw hiba("invalid-argument", "szerep_ervenytelen", { szerep });
  }
  if (adminJog !== undefined && typeof adminJog !== "boolean") {
    throw hiba("invalid-argument", "admin_jog_logikai");
  }

  // Kizárás-védelem: a saját admin jogát senki ne vehesse el magától,
  // különben admin nélkül maradhat a rendszer, és csak szkripttel
  // lehetne visszaállítani.
  if (uid === adminUid && adminJog === false) {
    throw hiba("failed-precondition", "sajat_admin");
  }

  try {
    const user = await getAuth().getUser(uid);

    const valtozasok = {};
    if (szerep !== undefined) valtozasok.szerep = szerep;
    if (adminJog !== undefined) valtozasok.admin = adminJog ? true : null;

    if (Object.keys(valtozasok).length === 0) {
      throw hiba("invalid-argument", "nincs_modositas");
    }

    const ujClaimek = claimOsszefuzes(user.customClaims, valtozasok);
    await getAuth().setCustomUserClaims(uid, ujClaimek);

    // A Firestore-tükör igazat mondjon – MINDKÉT claim-re. A guard.js
    // ebből veszi észre, hogy a felhasználó tokenje elavult, és
    // kényszerítve frissíti. Ha az admin jelzőt nem tükröznénk, egy
    // admin-kinevezés csak a token természetes lejárta (kb. 1 óra) vagy
    // újralépés után jelenne meg nála.
    const tukor = {};
    if (szerep !== undefined) tukor.szerep = szerep;
    if (adminJog !== undefined) tukor.admin = adminJog === true;
    await db().collection("felhasznalok").doc(uid).set(tukor, { merge: true });

    logger.info("Szerep módosítva", {
      cel: uid, szerep: ujClaimek.szerep, admin: ujClaimek.admin === true, admin_uid: adminUid
    });

    return {
      uid,
      email: user.email || "",
      szerep: ujClaimek.szerep || "diak",
      admin: ujClaimek.admin === true
    };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e.code === "auth/user-not-found") {
      throw hiba("not-found", "nincs_felhasznalo");
    }
    logger.error("szerepBeallitas hiba", { cel: uid, hiba: e.message });
    throw belsoHiba(e);
  }
});

// ── CSOMAG ÉS KERET ──

/** A tanár havi kerete és eddigi használata (a megjelenítéshez). */
async function kvotaAllapotLogika(firestore, uid, beallitasok = BEALLITASOK, most = new Date()) {
  if (!beallitasok.kvota) return { kvota: false };
  const tanarRef = firestore.collection("tanarok").doc(uid);
  const tanarSnap = await tanarRef.get();
  const csomag = kvota.csomagNev(tanarSnap.data()?.csomag);
  const hasznalatSnap = await tanarRef.collection("hasznalat").doc(kvota.hasznalatKulcs(csomag, most)).get();
  return {
    kvota: true,
    csomag,
    limit: kvota.keret(csomag),
    hasznalt: Math.max(0, hasznalatSnap.data()?.egyseg || 0),
    idoszak: kvota.idoszak(csomag),
    // havi csomagnál az időszak kulcsa; egyszerinél nincs
    honap: kvota.idoszak(csomag) === "havi" ? kvota.honapKulcs(most) : null
  };
}

/**
 * A fizetés állapota a tanári felületnek: ki van-e kapcsolva, mennyi az ár (szöveg), és az előfizetés
 * (csak a szükséges mezők). Külön a kvótától, hogy a kvóta-válasz alakja ne változzon.
 */
async function fizetesAllapotLogika(firestore, uid, beallitasok = BEALLITASOK) {
  if (!beallitasok.fizetes) return { fizetes: false };
  const snap = await firestore.collection("tanarok").doc(uid).get();
  const t = snap.data() || {};
  return {
    fizetes: true,
    // a kínálható csomagok (beállított árral): név, havi keret, az ár szövege
    csomagok: Object.keys(fizetes.arak(beallitasok)).map((nev) => ({
      nev,
      keret: kvota.keret(nev),
      ar: (nev === "profi" ? beallitasok.fizetesArProfiSzoveg : beallitasok.fizetesArSzoveg) || null
    })),
    csomag_forras: t.csomag_forras === "admin" ? "admin" : "stripe",
    elofizetes: fizetes.elofizetesNezet(t)
  };
}

exports.kvotaAllapot = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = tanar(request);
  return { ...(await kvotaAllapotLogika(db(), uid)), ...(await fizetesAllapotLogika(db(), uid)) };
});

// ══════════════════════════════════════════════════════
// STRIPE-FIZETÉS (csak prod, ha az árazonosító be van állítva; lásd functions/fizetes.js)
//
// A kártyaadat sosem érinti a szervert: a tanár a Stripe fizetőoldalára (Checkout) megy, az előfizetés
// kezelése a Stripe saját portálján (Customer Portal). A csomagot kizárólag a webhook állítja be,
// aláírás-ellenőrzés és idempotencia mellett.
// ══════════════════════════════════════════════════════

/** A Stripe-kliens (lusta betöltés: a többi függvény betöltési ideje ne nőjön). */
function stripeKliens(titok = STRIPE_SECRET_KEY.value()) {
  const Stripe = require("stripe");
  // a beillesztett titok végén gyakran van sortörés vagy szóköz: az érvénytelenítené a kulcsot
  return new Stripe(String(titok).trim());
}

/**
 * Egy (aláírás-ellenőrzött) Stripe-esemény alkalmazása a tanár dokumentumán, EGY tranzakcióban:
 * az eseményazonosító naplózása adja az idempotenciát (a Stripe többször is kézbesíthet), a régebbi
 * esemény pedig nem írja felül az újabb állapotot (esemenyHatas).
 * @returns {Promise<{kihagyva?: string, alkalmazva?: boolean, uid?: string, csomag?: string}>}
 */
async function stripeEsemenyFeldolgozas(firestore, esemeny, beallitasok = BEALLITASOK) {
  const esemenyRef = firestore.collection("stripe_esemenyek").doc(esemeny.id);
  return firestore.runTransaction(async (tx) => {
    if ((await tx.get(esemenyRef)).exists) return { kihagyva: "mar_feldolgozva" };

    const naplo = (megjegyzes, extra = {}) => tx.set(esemenyRef, {
      tipus: esemeny.type, ido: esemeny.created ?? null, megjegyzes, feldolgozva: FieldValue.serverTimestamp(), ...extra
    });

    // melyik tanáré? az esemény hordozza, vagy az ügyfél-azonosítóból keressük
    const { uid: kozvetlen, ugyfel } = fizetes.azonositok(esemeny);
    let uid = kozvetlen;
    if (!uid && ugyfel) uid = (await tx.get(firestore.collection("stripe_ugyfelek").doc(ugyfel))).data()?.uid || null;
    if (!uid) {
      // a tipus nem a mi dolgunk, vagy ismeretlen ügyfél: naplózzuk, és 200-zal nyugtázzuk (ne próbálkozzon a Stripe)
      naplo("nincs_tanar");
      return { kihagyva: "nincs_tanar" };
    }

    const tanarRef = firestore.collection("tanarok").doc(uid);
    const tanar = (await tx.get(tanarRef)).data() || null;
    const hatas = fizetes.esemenyHatas(esemeny, { tanar, arak: fizetes.arak(beallitasok) });
    if (hatas.kihagy) {
      naplo(hatas.kihagy, { uid });
      return { kihagyva: hatas.kihagy, uid };
    }

    tx.set(tanarRef, {
      ...hatas.mezok,
      ...(hatas.csomagValtozas ? { csomag_modositva: FieldValue.serverTimestamp() } : {})
    }, { merge: true });
    if (hatas.ugyfel_id) tx.set(firestore.collection("stripe_ugyfelek").doc(hatas.ugyfel_id), { uid }, { merge: true });
    naplo("alkalmazva", { uid });
    return { alkalmazva: true, uid, csomag: hatas.mezok.csomag };
  });
}

/**
 * A webhook-kérés kezelése: aláírás-ellenőrzés a NYERS törzsön, majd feldolgozás. A függőségek (kliens, titok,
 * firestore) paraméterek, hogy hálózat nélkül tesztelhető legyen. Hibánál 5xx: a Stripe újrapróbálja.
 */
async function stripeWebhookKezeles(req, res, { stripe, titok, firestore = db(), beallitasok = BEALLITASOK }) {
  if (req.method !== "POST") { res.status(405).send("Csak POST"); return; }
  let esemeny;
  try {
    const alairas = req.headers["stripe-signature"];
    if (!alairas || !req.rawBody) throw new Error("hiányzó aláírás vagy törzs");
    esemeny = stripe.webhooks.constructEvent(req.rawBody, alairas, titok);
  } catch (e) {
    logger.warn("Stripe-webhook: érvénytelen aláírás", { hiba: e.message });
    res.status(400).send("Érvénytelen aláírás");
    return;
  }
  try {
    const eredmeny = await stripeEsemenyFeldolgozas(firestore, esemeny, beallitasok);
    logger.info("Stripe-esemény", { id: esemeny.id, tipus: esemeny.type, ...eredmeny });
    res.status(200).json({ ok: true, ...eredmeny });
  } catch (e) {
    logger.error("Stripe-esemény feldolgozási hiba", { id: esemeny.id, tipus: esemeny.type, hiba: e.message });
    res.status(500).send("Feldolgozási hiba");
  }
}

exports.stripeWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (!BEALLITASOK.fizetes) { res.status(404).send("A fizetés ki van kapcsolva"); return; }
    await stripeWebhookKezeles(req, res, { stripe: stripeKliens(), titok: String(STRIPE_WEBHOOK_SECRET.value()).trim() });
  }
);

/**
 * A fizetőoldal (Checkout) létrehozása: az előfizetés a tanár uid-jához kötve.
 * A kért csomag a request.data.csomag ("alap" vagy "profi"; alap a hiányzó); csak beállított árú csomag kérhető.
 */
async function fizetesInditasLogika(firestore, stripe, request, beallitasok = BEALLITASOK) {
  const uid = tanar(request);
  if (!beallitasok.fizetes) throw hiba("failed-precondition", "fizetes_ki");

  const t = (await firestore.collection("tanarok").doc(uid).get()).data() || {};
  if (t.csomag_forras === "admin" && t.csomag && t.csomag !== "ingyenes") throw hiba("failed-precondition", "csomag_kezi");
  if (fizetes.JAR.has(t.elofizetes?.statusz)) throw hiba("failed-precondition", "mar_elofizetett");

  // csak a HIÁNYZÓ érték jelent alapot; a kifejezetten rossz (null, szám, lista…) hiba
  const kertCsomag = request.data?.csomag === undefined ? "alap" : request.data.csomag;
  const arakMap = fizetes.arak(beallitasok);
  // Object.hasOwn: a csomagnév ne találhasson prototípus-kulcsot ("__proto__", "toString")
  if (typeof kertCsomag !== "string" || !Object.hasOwn(arakMap, kertCsomag)) {
    throw hiba("invalid-argument", "csomag_ervenytelen", { csomag: String(kertCsomag).slice(0, 40) });
  }
  const ar = arakMap[kertCsomag];

  const ugyfelId = t.elofizetes?.stripe_ugyfel_id;
  const email = request.auth.token?.email;
  try {
    const munkamenet = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: ar, quantity: 1 }],
      client_reference_id: uid,
      // meglévő Stripe-ügyfél (korábbi előfizetés) újrahasznosítva; különben az e-mail-cím előtöltve
      ...(ugyfelId ? { customer: ugyfelId } : (email ? { customer_email: email } : {})),
      metadata: { uid },
      subscription_data: { metadata: { uid } },
      // a lakcím kell az EU-s áfa-elszámoláshoz
      billing_address_collection: "required",
      locale: "auto",
      success_url: `${beallitasok.visszaUrl}/tanar.html?fizetes=sikeres`,
      cancel_url: `${beallitasok.visszaUrl}/tanar.html?fizetes=megszakitva`
    });
    return { url: munkamenet.url };
  } catch (e) {
    logger.error("Stripe Checkout hiba", { uid, hiba: e.message });
    throw belsoHiba(e, "fizetes_hiba");
  }
}

/** Az előfizetés kezelése a Stripe saját portálján (lemondás, kártyacsere, számlák). */
async function fizetesKezelesLogika(firestore, stripe, request, beallitasok = BEALLITASOK) {
  const uid = tanar(request);
  if (!beallitasok.fizetes) throw hiba("failed-precondition", "fizetes_ki");
  const ugyfelId = (await firestore.collection("tanarok").doc(uid).get()).data()?.elofizetes?.stripe_ugyfel_id;
  if (!ugyfelId) throw hiba("failed-precondition", "nincs_ugyfel");
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: ugyfelId,
      return_url: `${beallitasok.visszaUrl}/tanar.html`
    });
    return { url: portal.url };
  } catch (e) {
    logger.error("Stripe-portál hiba", { uid, hiba: e.message });
    throw belsoHiba(e, "fizetes_hiba");
  }
}

/** A jogosultság és a kapcsoló ELŐBB dől el, mint hogy a Stripe-kulcshoz nyúlnánk. */
function fizetesKapu(request) {
  tanar(request);
  if (!BEALLITASOK.fizetes) throw hiba("failed-precondition", "fizetes_ki");
}

exports.fizetesIndit = onCall({ ...HIVAS_OPCIOK, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  fizetesKapu(request);
  return fizetesInditasLogika(db(), stripeKliens(), request);
});

exports.fizetesKezeles = onCall({ ...HIVAS_OPCIOK, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  fizetesKapu(request);
  return fizetesKezelesLogika(db(), stripeKliens(), request);
});

/** Admin: egy tanár csomagjának beállítása (fizetésig ez az egyetlen út). */
async function csomagBeallitasLogika(firestore, uid, csomag) {
  if (!uid) throw hiba("invalid-argument", "felhasznalo_id_kell");
  if (!Object.hasOwn(kvota.CSOMAGOK, csomag)) {
    throw hiba("invalid-argument", "csomag_ervenytelen", { csomag: String(csomag) });
  }
  // Az admin által adott (nem ingyenes) csomagot a Stripe-webhook nem írja át; az ingyenesre állítás visszaadja
  // a csomagot a Stripe-nak (csomag_forras: "stripe").
  await firestore.collection("tanarok").doc(uid).set(
    { csomag, csomag_forras: csomag === "ingyenes" ? "stripe" : "admin", csomag_modositva: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { uid, csomag };
}

exports.csomagBeallitas = onCall(HIVAS_OPCIOK, async (request) => {
  const adminUid = admin(request);
  const { uid, csomag } = request.data || {};
  const eredmeny = await csomagBeallitasLogika(db(), uid, csomag);
  logger.info("Csomag módosítva", { cel: uid, csomag, admin_uid: adminUid });
  return eredmeny;
});

// ── ÖNKISZOLGÁLÓ TANÁRI REGISZTRÁCIÓ ──
// A tanári szerepet kizárólag ez a szerveroldali lépés adhatja meg magának
// a felhasználó; a kliens csak kéri. Feltételek (mind kell):
//   1. a környezetben be van kapcsolva (prod; a pilotban az admin ad szerepet),
//   2. az e-mail-címe MEGERŐSÍTETT – az Auth-rekordból olvassuk, nem a tokenből,
//      mert a token a megerősítés után még elavult lehet,
//   3. a fiók tanári regisztrációval jött létre (felhasznalok.tanari_kerelem:
//      a szabályok csak létrehozáskor engedik írni, utólag nem), tehát egy
//      korábbi diákfiók nem léptetheti elő magát,
//   4. még nem használta diákként (nem tagja osztálynak).
// Ismételt hívás ártalmatlan: aki már tanár, változatlanul az marad.
// Az `authKliens` paraméter (getUser, setCustomUserClaims) a tesztek miatt
// cserélhető; élesben a firebase-admin Auth-ja.
async function tanariRegisztracioLogika(firestore, authKliens, uid, beallitasok) {
  if (!beallitasok.tanariOnregisztracio) {
    throw hiba("failed-precondition", "onregisztracio_ki");
  }

  let user;
  try {
    user = await authKliens.getUser(uid);
  } catch (e) {
    if (e.code === "auth/user-not-found") throw hiba("not-found", "nincs_felhasznalo");
    throw e;
  }

  const profilRef = firestore.collection("felhasznalok").doc(uid);

  if (user.customClaims?.szerep === "tanar") {
    // Egy korábbi, félbemaradt hívás után a tükör lemaradhatott.
    await profilRef.set({ szerep: "tanar" }, { merge: true });
    return { szerep: "tanar", mar_tanar: true };
  }

  if (!user.email || !user.emailVerified) {
    throw hiba("failed-precondition", "email_nincs_megerositve");
  }

  const profil = (await profilRef.get()).data();
  if (profil?.tanari_kerelem !== true) {
    logger.warn("Tanári regisztráció tanári kérelem nélkül", { uid });
    throw hiba("permission-denied", "tanari_kerelem_hianyzik");
  }

  const osztalyaim = await profilRef.collection("osztalyaim").limit(1).get();
  if (!osztalyaim.empty) {
    logger.warn("Tanári regisztráció diákként használt fiókkal", { uid });
    throw hiba("permission-denied", "mar_diak_hasznalo");
  }

  // Claim-összefűzés: az admin jelző (ha lenne) megmarad.
  await authKliens.setCustomUserClaims(
    uid, claimOsszefuzes(user.customClaims, { szerep: "tanar" })
  );
  await profilRef.set(
    { szerep: "tanar", tanar_regisztralt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  // Alapcsomag az új tanárnak. A create() nem írja felül a meglévő csomagot
  // (pl. ha az admin már adott egyet), azaz újraregisztrációnál sem romlik.
  await firestore.collection("tanarok").doc(uid)
    .create({ csomag: kvota.ALAP_CSOMAG, letrehozva: FieldValue.serverTimestamp() })
    .catch((e) => { if (e.code !== 6 && !/ALREADY_EXISTS/.test(String(e.message))) throw e; });

  logger.info("Önkiszolgáló tanári regisztráció", { uid });
  return { szerep: "tanar", mar_tanar: false };
}

exports.tanariRegisztracio = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = belepve(request);
  try {
    return await tanariRegisztracioLogika(db(), getAuth(), uid, BEALLITASOK);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("tanariRegisztracio hiba", { uid, hiba: e.message });
    throw belsoHiba(e);
  }
});

// ── AI-HASZNÁLAT ÉS KÖLTSÉG (admin) ──
// A nyers rekordokat (ai_hasznalat) a szabályok senkinek nem engedik; az
// admin az összesítést látja. Lásd functions/ai-hasznalat.js.
const JELENTES_MAX_REKORD = 20000;

async function aiHasznalatJelentesLogika(firestore, honapKulcs, most = new Date()) {
  const h = aiHasznalat.honapHatarok(honapKulcs, most);
  const snap = await firestore.collection("ai_hasznalat")
    .where("ido", ">=", h.tol).where("ido", "<", h.ig)
    .orderBy("ido").limit(JELENTES_MAX_REKORD).get();
  const rekordok = snap.docs.map((d) => d.data());

  const egyediek = (mezo) => [...new Set(rekordok.map((r) => r[mezo]).filter(Boolean))];
  const tanarIdk = egyediek("tanar_id");
  const feladatIdk = egyediek("feladat_id");
  const [tanarDocs, feladatDocs] = await Promise.all([
    tanarIdk.length ? firestore.getAll(...tanarIdk.map((id) => firestore.collection("felhasznalok").doc(id))) : [],
    feladatIdk.length ? firestore.getAll(...feladatIdk.map((id) => firestore.collection("feladatok").doc(id))) : []
  ]);
  const nevek = { tanarok: {}, feladatok: {} };
  tanarDocs.forEach((d) => { nevek.tanarok[d.id] = { nev: d.data()?.nev, email: d.data()?.email }; });
  feladatDocs.forEach((d) => { nevek.feladatok[d.id] = { cim: d.data()?.cim }; });

  return {
    honap: h.kulcs,
    rekord_db: rekordok.length,
    csonkolt: snap.size >= JELENTES_MAX_REKORD,
    ...aiHasznalat.jelentesOsszeallitas(rekordok, nevek)
  };
}

exports.aiHasznalatJelentes = onCall(HIVAS_OPCIOK, async (request) => {
  admin(request);
  try {
    return await aiHasznalatJelentesLogika(db(), request.data?.honap);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("aiHasznalatJelentes hiba", { hiba: e.message });
    throw belsoHiba(e);
  }
});

// ══════════════════════════════════════════════════════
// 10. OSZTÁLYSZINTŰ ELEMZÉS EGY FELADATRA
//
// Munkamegosztás:
//   - a SZÁMOKAT kód számolja (szempontátlagok, hibagyakoriság). Ezt nem
//     bízzuk modellre: az aritmetika determinisztikus kell legyen.
//   - a CSOPORTOSÍTÁST és a JAVASLATOKAT a Gemini adja. A hibacímkék
//     ugyanis elcsúszhatnak ("article_missing" vs "missing_article"), és a
//     szinonim címkék összevonása pont az, amiben a modell jó – pontos
//     string-egyezésre nem lehet építeni.
//
// Az eredmény mentve a feladatok/{id}/elemzes/osszegzes dokumentumba, hogy
// ne generálódjon újra minden megnyitásnál.
//
// Ez EGY dolgozatról ad képet. A több feladatot átfogó haladásjelző külön
// modul lesz, más query-vel és más megjelenítéssel.
// ══════════════════════════════════════════════════════

/** Hány konkrét hibát küldünk a modellnek – token-költség miatt korlátozva. */
const ELEMZES_HIBA_MAX = 200;

/**
 * Nyers aggregálás a beadások AI értékeléseiből. Tisztán számtan,
 * ezért külön függvényben és tesztelhetően.
 */
function elemzesAggregalas(ertekelesek) {
  const szempontOsszeg = {};   // kulcs → { pont, max, db }
  const kategoriaDb = {};      // kategoria → { db, diakok:Set }
  const cimkeDb = {};          // "kategoria/tipus" → { db, diakok:Set }
  const olvashatosag = { jo: 0, kozepes: 0, gyenge: 0 };
  const hibaMinta = [];

  for (const e of ertekelesek) {
    for (const sz of e.szempontok || []) {
      const k = sz.kulcs || "egyéb";
      szempontOsszeg[k] = szempontOsszeg[k] || { kulcs: k, pont: 0, max: 0, db: 0 };
      szempontOsszeg[k].pont += Number(sz.pont) || 0;
      szempontOsszeg[k].max += Number(sz.max) || 0;
      szempontOsszeg[k].db++;
    }

    for (const h of e.hibak || []) {
      const kat = h.kategoria || "egyéb";
      kategoriaDb[kat] = kategoriaDb[kat] || { kategoria: kat, db: 0, diakok: new Set() };
      kategoriaDb[kat].db++;
      kategoriaDb[kat].diakok.add(e.diak_id);

      const cimke = kat + "/" + (h.tipus || "?");
      cimkeDb[cimke] = cimkeDb[cimke]
        || { kategoria: kat, tipus: h.tipus, db: 0, diakok: new Set() };
      cimkeDb[cimke].db++;
      cimkeDb[cimke].diakok.add(e.diak_id);

      if (hibaMinta.length < ELEMZES_HIBA_MAX) {
        hibaMinta.push({
          kategoria: kat, tipus: h.tipus, idezet: h.idezet, javaslat: h.javaslat
        });
      }
    }

    if (e.olvashatosag && olvashatosag[e.olvashatosag] !== undefined) {
      olvashatosag[e.olvashatosag]++;
    }
  }

  const szazalekok = ertekelesek
    .map((e) => e.szazalek)
    .filter((x) => typeof x === "number");

  return {
    ertekelt_db: ertekelesek.length,
    atlag_szazalek: szazalekok.length
      ? Math.round(szazalekok.reduce((a, b) => a + b, 0) / szazalekok.length)
      : null,
    // A legrosszabbul teljesített szempont elöl – ez a tanár első kérdése
    szempontok: Object.values(szempontOsszeg)
      .map((sz) => ({
        kulcs: sz.kulcs,
        atlag_pont: Math.round((sz.pont / sz.db) * 10) / 10,
        max_pont: Math.round((sz.max / sz.db) * 10) / 10,
        szazalek: sz.max > 0 ? Math.round((sz.pont / sz.max) * 100) : null
      }))
      .sort((a, b) => (a.szazalek ?? 101) - (b.szazalek ?? 101)),
    kategoriak: Object.values(kategoriaDb)
      .map((k) => ({ kategoria: k.kategoria, db: k.db, erintett_diak: k.diakok.size }))
      .sort((a, b) => b.db - a.db),
    cimkek: Object.values(cimkeDb)
      .map((c) => ({ tipus: c.tipus, kategoria: c.kategoria, db: c.db, erintett_diak: c.diakok.size }))
      .sort((a, b) => b.db - a.db),
    olvashatosag,
    hibaMinta
  };
}

function elemzesPrompt(feladat, agg) {
  const r = feladat.rubrika || {};
  const nyelv = nyelve(r);
  const kim = kifejtos.kimenet(r);

  const szint = szintInfo(r);
  const szintSor = szint ? `${szint.cimke}: ${szint.ertek}\n` : "";

  const hibaLista = agg.hibaMinta
    .map((h) => `- [${h.kategoria}/${h.tipus}] "${h.idezet}" -> "${h.javaslat}"`)
    .join("\n");

  const cimkeLista = agg.cimkek
    .slice(0, 30)
    .map((c) => `- ${c.kategoria}/${c.tipus}: ${c.db} db, ${c.erintett_diak} diáknál`)
    .join("\n");

  const szempontLista = agg.szempontok
    .map((sz) => `- ${sz.kulcs}: ${sz.atlag_pont}/${sz.max_pont} (${sz.szazalek}%)`)
    .join("\n");

  return `Te egy tapasztalt ${nyelv}tanár és szaktanácsadó vagy. Egy ${kim.kod === "hu" ? "magyar " : ""}
osztály ${nyelv} dolgozatainak összesített hibáit kapod meg, és a tanárnak
kell segítened: mire érdemes órán visszatérni.

# A FELADAT
Cím: ${feladat.cim}
Nyelv: ${nyelv}
Típus: ${r.tipus || "nincs megadva"}
${szintSor}${r.feladat_leiras ? "Leírás: " + r.feladat_leiras : ""}

# OSZTÁLYSZINTŰ SZÁMOK
Kiértékelt dolgozat: ${agg.ertekelt_db}
Osztályátlag: ${agg.atlag_szazalek != null ? agg.atlag_szazalek + "%" : "nincs adat"}

Szempontonként (a legrosszabb elöl):
${szempontLista || "- nincs adat"}

# HIBACÍMKÉK GYAKORISÁGA
FONTOS: ezeket a címkéket a javító AI adta, és ELCSÚSZHATNAK – ugyanaz a
hibafajta kaphatott többféle nevet (pl. "article_missing" és
"missing_article"). A te dolgod, hogy a JELENTÉS szerint vond össze őket,
ne a címke szövege szerint.
${cimkeLista || "- nincs adat"}

# KONKRÉT HIBÁK (minta)
${hibaLista || "- nincs adat"}

# UTASÍTÁSOK
1. "osszegzes": 2-3 bekezdés a tanárnak, ${kim.hatarozo}. Mi ment jól az
   osztálynak, és mi az a 2-3 dolog, ami rendszerszinten hiányzik.
   Ne ismételd a számokat, azokat a tanár látja – ÉRTELMEZD őket.
2. "tipushibak": a JELENTÉS szerint összevont típushibák, a
   legfontosabbal kezdve, legfeljebb 6. A "cim" ${kim.hatarozo}, közérthetően
   (pl. "A határozott articulus elhagyása"), a "peldak" pedig a fenti
   konkrét hibákból vett SZÓ SZERINTI idézetek.
   A "gyakorisag": "általános" ha a diákok többségét érinti, "gyakori" ha
   jelentős részét, "szórványos" ha csak néhányat.
3. "gyakorlatok": 3-5 konkrét, órán használható gyakorlat a legfontosabb
   hibákra. A "leiras" legyen annyira konkrét, hogy a tanár holnap be
   tudja vinni: mit csinálnak a diákok, milyen formában, mennyi ideig.
   Ne általánosság ("gyakoroljátok a múlt időt"), hanem eljárás.
4. "generalo_prompt": egy KÉSZ, önmagában is használható prompt, amit a
   tanár bemásolhat egy AI-ba, hogy gyakorlósort generáljon az osztály
   konkrét hibáira. Tartalmazza a nyelvet, ${szint ? "a szintet, " : ""}a célzott
   hibákat és a kért feladattípusokat. Az instrukciót ${kim.hatarozo} írd, de a generált
   feladatok nyelve ${nyelv} legyen.

Ha 3-nál kevesebb kiértékelt dolgozat van, az "osszegzes" ELSŐ mondatában
jelezd, hogy ez még nem osztályszintű kép.`;
}

exports.feladatElemzes = onCall(
  { ...AI_OPCIOK, timeoutSeconds: 540 },
  async (request) => {
    const uid = tanar(request);

    const feladatId = request.data?.feladatId;
    if (!feladatId) throw hiba("invalid-argument", "feladat_id_kell");

    const firestore = db();

    const feladatSnap = await firestore.collection("feladatok").doc(feladatId).get();
    if (!feladatSnap.exists) throw hiba("not-found", "feladat_nincs");
    const feladat = feladatSnap.data();
    if (feladat.tanar_id !== uid) {
      throw hiba("permission-denied", "nem_a_te_feladatod");
    }

    const beadasok = await firestore
      .collection("beadasok")
      .where("feladat_id", "==", feladatId)
      .get();

    const kifejtosMod = kifejtos.feladatMod(feladat.rubrika) === "kifejtos";

    const ertekelesek = [];
    for (const d of beadasok.docs) {
      const ai = await d.ref.collection("ertekeles").doc("ai").get();
      if (!ai.exists) continue;
      const ert = {
        ...ai.data(),
        diak_id: d.data().diak_id,
        olvashatosag: d.data().atirat_olvashatosag || null
      };
      // Kifejtősnél az számít, amit a diák ténylegesen kapott: ha a tanár
      // már jóváhagyta (és közben felülírt elemeket), az ő döntése. A
      // tartalmi hibák listája csak az AI-értékelésben van, az marad.
      if (kifejtosMod && d.data().statusz === "elkuldve") {
        const tanari = await d.ref.collection("ertekeles").doc("tanari").get();
        if (tanari.exists && Array.isArray(tanari.data().kerdesek)) {
          const t = tanari.data();
          Object.assign(ert, {
            kerdesek: t.kerdesek, szempontok: t.szempontok, szazalek: t.szazalek
          });
        }
      }
      ertekelesek.push(ert);
    }

    if (ertekelesek.length === 0) {
      throw hiba("failed-precondition", "nincs_kiertekelt");
    }

    const agg = elemzesAggregalas(ertekelesek);

    // Kifejtős dolgozat: kérdés- és elemstatisztika (kód), és más prompt –
    // nem nyelvtani típushibák, hanem hiányzó tartalmak.
    let kf = null;
    let prompt = null;
    let schema = ELEMZES_SCHEMA;
    if (kifejtosMod) {
      const kulcsSnap = await feladatSnap.ref.collection("kulcs").doc("aktualis").get();
      if (!kulcsSnap.exists) {
        throw hiba("failed-precondition", "kulcs_nincs");
      }
      let kulcs;
      try {
        kulcs = kifejtos.kulcsEllenorzes(kulcsSnap.data());
      } catch (e) {
        throw hibaAtvezet("failed-precondition", e);
      }
      kf = kifejtos.kifejtosAggregalas(kulcs, ertekelesek);
      prompt = kifejtos.kifejtosElemzesPrompt(feladat, agg, kf, ertekelesek.flatMap((e) => e.hibak || []));
      schema = kifejtos.KIFEJTOS_ELEMZES_SCHEMA;
    }

    const { eredmeny, modell } = await kvotaval(uid, "elemzes", () => geminiHivas(
      "elemzes",
      [{ text: prompt || elemzesPrompt(feladat, agg) }],
      schema,
      { tanar_id: uid, muvelet: "elemzes", feladat_id: feladatId }
    ));

    // A hibaMinta nem kell a kliensnek: nagy, és a példák a tipushibakban
    // már benne vannak.
    const { hibaMinta, ...mentendoAgg } = agg;

    const dokumentum = {
      beadas_db: beadasok.size,
      ...mentendoAgg,
      ...(kf ? { mod: "kifejtos", kerdesek: kf.kerdesek, kihagyott: kf.kihagyott } : {}),
      osszegzes: eredmeny.osszegzes || "",
      tipushibak: eredmeny.tipushibak || [],
      gyakorlatok: eredmeny.gyakorlatok || [],
      generalo_prompt: eredmeny.generalo_prompt || "",
      model: modell,
      generalva: FieldValue.serverTimestamp()
    };

    await firestore
      .collection("feladatok").doc(feladatId)
      .collection("elemzes").doc("osszegzes")
      .set(dokumentum);

    logger.info("Osztályelemzés kész", {
      feladatId, ertekelt: agg.ertekelt_db, tipushibak: dokumentum.tipushibak.length
    });

    return dokumentum;
  }
);

// ══════════════════════════════════════════════════════
// 11. KIFEJTŐS DOLGOZAT: KULCSKÉSZÍTÉS
// Terv: docs/kifejtos-mod-terv.md
//
// Egy hívás: a feladatlap és a (nem kötelező) tananyag fájljai együtt
// mennek a modellhez. Nincs tananyagtár, nincs külön kivonat-lépés és
// nincs próbajavítás: a tanár a javító nézetben látja és javítja, ha
// valami rosszul pontozódott.
// ══════════════════════════════════════════════════════

const TANANYAG_FAJL_MAX = 5;

// A Gemini inline kérése kb. 20 MB-ig megy át; a base64 ~33%-kal nagyobb.
const KULCS_OSSZMERET_MAX = 14 * 1024 * 1024;

/**
 * Feladatlap (+ tananyag) → kulcsvázlat. NEM ment semmit: a tanár az
 * űrlapon (összecsukva) átnézheti, és a feladattal együtt menti.
 */
exports.kulcsKeszites = onCall(
  { ...AI_OPCIOK, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const uid = tanar(request);
    const { feladatlapPath, tananyagPaths, tantargy } = request.data || {};

    if (!feladatlapPath) {
      throw hiba("invalid-argument", "kulcs_feladatlap_kell");
    }
    if (typeof feladatlapPath !== "string" || !feladatlapPath.startsWith(`feladatlapok/${uid}/`)) {
      throw hiba("permission-denied", "nem_a_tied_feltoltes");
    }
    const tananyag = Array.isArray(tananyagPaths) ? tananyagPaths : [];
    if (tananyag.length > TANANYAG_FAJL_MAX) {
      throw hiba("invalid-argument", "max_tananyag", { max: TANANYAG_FAJL_MAX });
    }
    for (const path of tananyag) {
      if (typeof path !== "string" || !path.startsWith(`tananyagok/${uid}/`)) {
        throw hiba("permission-denied", "nem_a_tied_feltoltes");
      }
    }

    const bucket = getStorage().bucket();
    const meretek = await Promise.all(
      [feladatlapPath, ...tananyag].map((path) => bucket.file(path).getMetadata().then(([m]) => Number(m.size || 0)))
    );
    if (meretek.reduce((a, b) => a + b, 0) > KULCS_OSSZMERET_MAX) {
      throw hiba("invalid-argument", "kulcs_meret");
    }

    const tantargyTisztitva = String(tantargy || "").trim().slice(0, 60) || null;
    const vanTananyag = tananyag.length > 0;

    let eredmeny, modell;
    try {
      ({ eredmeny, modell } = await kvotaval(uid, "kulcs", async () => {
        const reszek = [
          { text: kifejtos.kulcsKeszitesPrompt(tantargyTisztitva, vanTananyag) },
          { text: "=== FELADATLAP ===" },
          await fajlBase64(feladatlapPath)
        ];
        if (vanTananyag) {
          reszek.push({ text: "=== TANANYAG ===" }, ...(await Promise.all(tananyag.map(fajlBase64))));
        }
        return geminiHivas(
          "rubrika", reszek, kifejtos.KULCS_JAVASLAT_SCHEMA, { tanar_id: uid, muvelet: "kulcs" }
        );
      }));
    } catch (e) {
      if (e instanceof HttpsError) throw e;   // pl. elfogyott a keret
      logger.error("kulcsKeszites hiba", { uid, hiba: e.message });
      throw belsoHiba(e, "ai_hiba");
    }

    let tiszta;
    try {
      tiszta = kifejtos.kulcsJavaslatTisztitas(eredmeny, vanTananyag);
    } catch (e) {
      throw hibaAtvezet("failed-precondition", e);
    }

    logger.info("Kulcsvázlat kész", { uid, kerdes: tiszta.kulcs.kerdesek.length, tananyag: tananyag.length });
    return {
      kulcs: { ...tiszta.kulcs, szoszedet: kifejtos.szoszedetGyujtes(tiszta.kulcs) },
      kihagyott: tiszta.kihagyott,
      cim_javaslat: String(eredmeny.cim_javaslat || "").trim(),
      feladat_leiras: String(eredmeny.feladat_leiras || "").trim(),
      tantargy: String(eredmeny.tantargy || "").trim(),
      van_tananyag: vanTananyag,
      model: modell
    };
  }
);
