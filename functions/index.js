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

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");
const kifejtos = require("./kifejtos");
const kornyezet = require("./kornyezet");

initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
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
  kulcs_meret: () => "A feladatlap és a tananyag együtt túl nagy (legfeljebb 14 MB). Hagyd el a tananyag felesleges részeit."
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
async function geminiKeres(modell, parts, schema) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modell}:generateContent?key=${GEMINI_API_KEY.value()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2
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

  const szoveg = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!szoveg) {
    const ok = json.candidates?.[0]?.finishReason || "ismeretlen ok";
    throw new Error(`A Gemini (${modell}) nem adott választ (${ok}).`);
  }

  try {
    return JSON.parse(szoveg);
  } catch (_) {
    // responseSchema mellett ez nem szokott előfordulni, de ha mégis,
    // legyen értelmezhető a hibanapló.
    throw new Error(`A Gemini válasza nem érvényes JSON: ${szoveg.slice(0, 200)}`);
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
 * @returns {Promise<{eredmeny: object, modell: string}>} a válasz és az,
 *   hogy VÉGÜL melyik modell adta – tartalékra váltás esetén nem a fő
 *   modellt kell elmenteni, különben hamis lenne a nyomonkövetés
 */
async function geminiHivas(lepes, parts, schema) {
  const { kiserlet: KISERLET, varakozasok: VARAKOZASOK } = UJRAPROBA;

  const modellek = [MODELLEK[lepes], ...(TARTALEK[lepes] || [])];
  let utolso;

  for (const modell of modellek) {
    for (let i = 0; i < KISERLET; i++) {
      try {
        if (i > 0 || modell !== modellek[0]) {
          logger.info("Gemini újrapróbálkozás", { lepes, modell, kiserlet: i + 1 });
        }
        return { eredmeny: await geminiKeres(modell, parts, schema), modell };
      } catch (e) {
        utolso = e;
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
- Ha több kép van, azok egy dolgozat egymást követő oldalai.

Az olvashatosag mezőben értékeld, mennyire volt olvasható a kézírás.`;
}

function ertekelesPrompt(feladat, atirat) {
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

# A DIÁK DOLGOZATA (kézírásból átírva)
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
4. Az "erossegek" és "fejlesztendo" rövid, tömör felsorolások a tanárnak.`;
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
- A "feladat_leiras" mezőbe foglald össze ${kim.hatarozo}, mi a diák konkrét
  feladata a feladatlap szerint.

Ha valamit nem lehet kiolvasni a feladatlapból, adj józan
alapértelmezést – KIVÉVE a szintet: azt inkább hagyd üresen.
Egy kitalált szint rosszabb, mint a semmi, mert az értékelés ahhoz mér.`;
}

// ══════════════════════════════════════════════════════
// 1. OSZTÁLY LÉTREHOZÁSA
// Azért Function, mert a kód egyediségét a kodok/ nyilvántartóval
// tranzakciósan kell biztosítani – a kliens ezt nem tudja megtenni.
// ══════════════════════════════════════════════════════
async function osztalyLetrehozasLogika(firestore, uid, nev) {
  const osztalyRef = firestore.collection("osztalyok").doc();

  // Ütközés esetén új kóddal próbálkozunk.
  for (let kiserlet = 0; kiserlet < 10; kiserlet++) {
    const kod = kodGeneralas();
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
    const { eredmeny: rubrika, modell } = await geminiHivas(
      'rubrika',
      [{ text: rubrikaPrompt(nyelvTipp, request.data?.kimenetiNyelv) }, await fajlBase64(path)],
      rubrikaSchema(nyelvTipp)
    );

    // A szintet a VISSZAADOTT nyelv skáláján ellenőrizzük: ha az AI más
    // nyelvet látott a feladatlapon, mint amit a tanár jelölt, a szint
    // rossz skálán maradt. Ilyenkor inkább üres.
    rubrika.szint = szintSzures(nyelve(rubrika), rubrika.szint);

    // A súlyok összegét ellenőrizzük – az űrlap ezt jelzi a tanárnak.
    const sulyOsszeg = (rubrika.szempontok || []).reduce((s, sz) => s + (sz.suly || 0), 0);

    return { rubrika, suly_osszeg: sulyOsszeg, model: modell };
  } catch (e) {
    logger.error("feladatlapElemzes hiba", { uid, path, hiba: e.message });
    throw belsoHiba(e, "ai_hiba");
  }
});

// ══════════════════════════════════════════════════════
// 4. BEADÁS FELDOLGOZÁSA
// Kétlépéses: átírás → a szöveg értékelése.
// ══════════════════════════════════════════════════════

async function feldolgozBeadas(beadasId) {
  const firestore = db();
  const beadasRef = firestore.collection("beadasok").doc(beadasId);

  const beadasSnap = await beadasRef.get();
  if (!beadasSnap.exists) throw new Error("A beadás nem található.");
  const beadas = beadasSnap.data();

  const feladatSnap = await firestore.collection("feladatok").doc(beadas.feladat_id).get();
  if (!feladatSnap.exists) throw new Error("A feladat nem található.");
  const feladat = feladatSnap.data();

  if (!feladat.rubrika) throw new Error("A feladathoz nincs rubrika.");

  const kepPaths = beadas.kep_paths || [];
  if (kepPaths.length === 0) throw new Error("Nincs feltöltött kép.");

  await beadasRef.update({
    statusz: "folyamatban",
    hiba: null,
    frissitve: FieldValue.serverTimestamp()
  });

  // Kifejtős dolgozat: más átírás, más értékelés, a pontot a kód adja.
  // A hiányzó mód a régi (íráskészség) útvonal – az változatlan.
  if (kifejtos.feladatMod(feladat.rubrika) === "kifejtos") {
    return await feldolgozKifejtos(beadasRef, feladatSnap.ref, feladat, kepPaths);
  }

  // ── 1. lépés: átírás ──
  // Külön lépés, hogy a tanár lássa, mit olvasott ki az AI – e nélkül
  // nem lehet megállapítani, hogy a diák hibázott vagy az AI félreolvasott.
  const kepek = await Promise.all(kepPaths.map(fajlBase64));
  const { eredmeny: atiratValasz, modell: atirasModell } = await geminiHivas(
    'atiras',
    [{ text: atiratPrompt(nyelve(feladat.rubrika)) }, ...kepek],
    ATIRAT_SCHEMA
  );

  const atirat = (atiratValasz.atirat || "").trim();
  if (!atirat) throw new Error("Az átírás üres szöveget adott.");

  await beadasRef.update({
    atirat,
    atirat_olvashatosag: atiratValasz.olvashatosag || null,
    atirat_megjegyzes: atiratValasz.megjegyzes || null,
    // Melyik modell olvasta fel – e nélkül utólag nem lehet
    // összehasonlítani két modell kézírás-pontosságát.
    atirat_model: atirasModell,
    frissitve: FieldValue.serverTimestamp()
  });

  // ── 2. lépés: értékelés a SZÖVEG alapján ──
  // Így a rubrika módosítása után fillérekért újrafuttatható, kép nélkül.
  const { eredmeny: ertekeles, modell: ertekelesModell } = await geminiHivas(
    'ertekeles',
    [{ text: ertekelesPrompt({ ...feladat }, atirat) }],
    ERTEKELES_SCHEMA
  );

  // Az összpontszámot mi számoljuk – ne a modell aritmetikájára bízzuk.
  const szempontok = ertekeles.szempontok || [];
  const osszpontszam = szempontok.reduce((s, sz) => s + (Number(sz.pont) || 0), 0);
  const maxPontszam = szempontok.reduce((s, sz) => s + (Number(sz.max) || 0), 0);

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
      diak_szoveg: ertekeles.diak_szoveg || "",
      szoszam: ertekeles.szoszam || null,
      model: ertekelesModell,
      atirat_model: atirasModell,
      generalva: FieldValue.serverTimestamp()
    });

  await beadasRef.update({
    statusz: "javitva",
    frissitve: FieldValue.serverTimestamp()
  });

  logger.info("Beadás kijavítva", { beadasId, osszpontszam, maxPontszam });
  return { osszpontszam, maxPontszam };
}

// ── KIFEJTŐS DOLGOZAT ──
// Terv: docs/kifejtos-mod-terv.md. A tiszta függvények a kifejtos.js-ben.

async function feldolgozKifejtos(beadasRef, feladatRef, feladat, kepPaths) {
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
  const kepek = await Promise.all(kepPaths.map(fajlBase64));
  const { eredmeny: atiras, modell: atirasModell } = await geminiHivas(
    "atiras",
    [{ text: kifejtos.kifejtosAtiratPrompt(kulcs, szoszedet) }, ...kepek],
    kifejtos.KIFEJTOS_ATIRAT_SCHEMA
  );

  const atirat = kifejtos.atiratOsszefuzes(atiras);
  if (!atirat) throw new Error("Az átírás üres szöveget adott.");

  await beadasRef.update({
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
    kifejtos.KIFEJTOS_ERTEKELES_SCHEMA
  );

  const ertekeles = kifejtos.kifejtosErtekelesOsszeallitas(
    kulcs, ai, valaszok, kifejtos.skalaFeloldas(feladat.rubrika)
  );

  await beadasRef.collection("ertekeles").doc("ai").set({
    ...ertekeles,
    model: ertekelesModell,
    atirat_model: atirasModell,
    generalva: FieldValue.serverTimestamp()
  });

  await beadasRef.update({
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
async function hibaraAllit(beadasId, e) {
  logger.error("Beadás feldolgozási hiba", { beadasId, hiba: e.message });
  try {
    await db().collection("beadasok").doc(beadasId).update({
      statusz: "hiba",
      hiba: e.message,
      frissitve: FieldValue.serverTimestamp()
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
      await feldolgozBeadas(beadasId);
    } catch (e) {
      await hibaraAllit(beadasId, e);
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
    if (beadasSnap.data().statusz === "folyamatban") {
      throw hiba("failed-precondition", "beadas_folyamatban");
    }

    try {
      return { siker: true, ...(await feldolgozBeadas(beadasId)) };
    } catch (e) {
      await hibaraAllit(beadasId, e);
      throw belsoHiba(e, "ai_hiba");
    }
  }
);

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
      tabla = pontTablazat(aiSnap.data(), feladatSnap.data()?.rubrika, szempontok);
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
  BEALLITASOK,
  kodGeneralas,
  geminiHivas,
  atmenetiHiba,
  UJRAPROBA,
  MODELLEK,
  TARTALEK
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
    utolso_belepes: u.metadata?.lastSignInTime || null
  }));

  felhasznalok.sort((a, b) => a.nev.localeCompare(b.nev, "hu"));

  return { felhasznalok, csonkolt: authLista.pageToken != null };
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

    const { eredmeny, modell } = await geminiHivas(
      "elemzes",
      [{ text: prompt || elemzesPrompt(feladat, agg) }],
      schema
    );

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
      const reszek = [
        { text: kifejtos.kulcsKeszitesPrompt(tantargyTisztitva, vanTananyag) },
        { text: "=== FELADATLAP ===" },
        await fajlBase64(feladatlapPath)
      ];
      if (vanTananyag) {
        reszek.push({ text: "=== TANANYAG ===" }, ...(await Promise.all(tananyag.map(fajlBase64))));
      }
      ({ eredmeny, modell } = await geminiHivas("rubrika", reszek, kifejtos.KULCS_JAVASLAT_SCHEMA));
    } catch (e) {
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
