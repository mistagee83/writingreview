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
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { randomUUID } = require("node:crypto");
const logger = require("firebase-functions/logger");
const skala = require("./skala");
const feladatlink = require("./feladatlink");
const kornyezet = require("./kornyezet");
const kvota = require("./kvota");
const aiHasznalat = require("./ai-hasznalat");
const fizetes = require("./fizetes");
const szamlazz = require("./szamlazz");
const tema = require("./tema");
const fejlodes = require("./fejlodes");
const Anthropic = require("@anthropic-ai/sdk");

initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Az AI-szolgáltató kapcsolója: AI_SZOLGALTATO=claude a functions/.env.<alias>-ban (alapból gemini).
// Az Anthropic-kulcsot csak Claude-nál DEKLARÁLJUK (a Firebase CLI a deploynál minden deklarált titkot megkövetel),
// így a Geminin maradó környezet deployához nem kell létrehozni. A Gemini-kulcs mindig deklarált, hogy vissza lehessen váltani.
const CLAUDE_BE = kornyezet.beallitasok().aiSzolgaltato === "claude";
const ANTHROPIC_API_KEY = CLAUDE_BE ? defineSecret("ANTHROPIC_API_KEY") : null;
const AI_TITKOK = [GEMINI_API_KEY, ...(ANTHROPIC_API_KEY ? [ANTHROPIC_API_KEY] : [])];
// A Stripe titkai (Secret Manager, projektenként). FIGYELEM: a Firebase CLI a deploynál MINDEN deklarált titkot megkövetel,
// ezért csak akkor DEKLARÁLJUK őket, ha a fizetés be van kapcsolva (prod + beállított ár). A pilotban így nem kellenek;
// a fizetési függvények ott a `fizetes_ki` hibával / 404-gyel válaszolnak, a titkot sosem olvassák.
const FIZETES_BE = kornyezet.beallitasok().fizetes;
const STRIPE_SECRET_KEY = FIZETES_BE ? defineSecret("STRIPE_SECRET_KEY") : null;
const STRIPE_WEBHOOK_SECRET = FIZETES_BE ? defineSecret("STRIPE_WEBHOOK_SECRET") : null;
const STRIPE_TITKOK = FIZETES_BE ? [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] : [];
// A számlázz.hu Számla Agent kulcsa. FIGYELEM: a Firebase CLI a deploynál MINDEN deklarált titkot megkövetel (akkor is, ha
// egy függvényhez sincs kötve), ezért a titkot csak akkor DEKLARÁLJUK, ha a számlázás be van kapcsolva (SZAMLAZZ=igen a
// functions/.env.prod-ban). Így a pilot és a még ki nem kapcsolt prod deployához nem kell létrehozni.
const SZAMLAZZ_AGENT_KULCS = kornyezet.beallitasok().szamlazz ? defineSecret("SZAMLAZZ_AGENT_KULCS") : null;
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
  // A beírt dolgozat értékelése a rubrika szerint. Szöveg-only, de érdemi
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
// A rubrika-javaslat nem ilyen: a tanár az űrlapon ellenőrzi. Melyik modell
// dolgozott, azt a model mező rögzíti.
const TARTALEK = {
  ertekeles: [],
  rubrika: ["gemini-3.7-flash", "gemini-3.5-flash-lite"],
  elemzes: ["gemini-3.7-flash"]
};

// ── GONDOLKODÁSI SZINT LÉPÉSENKÉNT ──
// A gondolkodási (thinking) tokenek kimenetként számlázódnak. Ami itt nincs
// felsorolva, az a modell alapértelmezését kapja (medium). Az értékelést
// (pontozás) szándékosan nem vesszük vissza, amíg nincs összehasonlító mérés:
// ott a gondolkodás számíthat a pontosságra. (A kézírás-átírás "low" szintje a
// 2b lépéssel az átírással együtt kikerült; a pilot ágon megvan.)
const GONDOLKODAS = {};

// ── CLAUDE (AI_SZOLGALTATO=claude) ──
// Minden lépés Claude Sonnet 5.5 ($2 be / $10 ki, 1M token; a gondolkodás kimenetként számlázódik).
// Tartalék modell nincs: átmeneti hibánál ugyanazt a modellt próbálja újra (UJRAPROBA).
// A gondolkodás mélysége itt az effort ("low" | "medium" | "high"); ami nincs felsorolva, a modell
// alapértelmezését kapja.
const CLAUDE_MODELLEK = {
  ertekeles: "claude-sonnet-5-5",
  rubrika: "claude-sonnet-5-5",
  elemzes: "claude-sonnet-5-5"
};
const CLAUDE_TARTALEK = { ertekeles: [], rubrika: [], elemzes: [] };
// A gondolkodás a max_tokens-be számít: az első éles rubrika-hívás (2026-11-04) alapszinten (high)
// kifutott a 16 000 tokenből. A rubrikát a tanár úgyis átnézi, az elemzést ő olvassa: ott elég a medium.
const CLAUDE_EFFORT = {
  rubrika: "medium",
  elemzes: "medium"
};
// A kimenet felső határa (gondolkodással együtt). Nem streamelt kérés: a ~280 mp-es timeouton belül kell maradnia.
const CLAUDE_MAX_TOKENS = 32000;

// A környezet (pilot/prod) beállításai: functions/kornyezet.js.
const BEALLITASOK = kornyezet.beallitasok();
const CORS = BEALLITASOK.cors;
// Melyik szolgáltató dolgozik (objektumban, hogy a tesztek átállíthassák).
const AI = { szolgaltato: BEALLITASOK.aiSzolgaltato };

const HIVAS_OPCIOK = { region: REGION, cors: CORS };
const AI_OPCIOK = { ...HIVAS_OPCIOK, secrets: AI_TITKOK, timeoutSeconds: 300 };

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
  feladatlap_utvonal: () => "Nem derül ki, melyik feladatlapot kell feldolgozni.",
  nem_a_tied_feltoltes: () => "Ez nem a te feltöltésed.",
  beadas_id_kell: () => "Nem derül ki, melyik dolgozatról van szó.",
  beadas_nincs: () => "A beadás nem található.",
  nem_a_te_beadasod: () => "Ez nem a te diákod beadása.",
  beadas_folyamatban: () => "Ez a beadás épp feldolgozás alatt van.",
  visszajelzes_ures: () => "A visszajelzés szövege nem lehet üres.",
  jegy_ertek: () => "A jegy nem szerepel a feladat jegyskáláján.",
  statusz_nem_kuldheto: (p) => `Ebben az állapotban nem küldhető el: ${p.statusz}`,
  nev_rovid: () => "A név legalább 2 karakter legyen.",
  nev_hosszu: () => "A név legfeljebb 80 karakter lehet.",
  felhasznalo_id_kell: () => "Nem derül ki, melyik felhasználóról van szó.",
  szerep_ervenytelen: (p) => `Érvénytelen szerep: ${p.szerep}`,
  admin_jog_logikai: () => "Az admin jog beállítása nem érvényes.",
  sajat_admin: () => "A saját admin jogodat nem veheted el. Kérd meg egy másik admint.",
  nincs_modositas: () => "Nincs mit módosítani.",
  nincs_felhasznalo: () => "Nincs ilyen felhasználó.",
  feladat_id_kell: () => "Nem derül ki, melyik feladatról van szó.",
  feladat_nincs: () => "A feladat nem található.",
  nem_a_te_feladatod: () => "Ez nem a te feladatod.",
  csoport_ervenytelen: () => "A kiválasztott csoport nem található, vagy archiválva van.",
  csoport_nincs: () => "A csoport nem található.",
  csoport_diak_nincs: () => "A diák nem található a csoportban. Lehet, hogy közben összevontad vagy leválasztottad: töltsd újra az oldalt.",
  osszevonas_onmagaval: () => "Egy diákot nem vonhatsz össze önmagával.",
  levalasztas_egyetlen: () => "Ez a diák egyetlen beadása, nincs mit leválasztani.",
  csoport_tul_sok_beadas: () => "Ennél a diáknál túl sok a beadás ahhoz, hogy egyszerre áthelyezzük.",
  nincs_kiertekelt: () => "Ehhez a feladathoz még nincs kiértékelt beadás.",
  feladat_zart: () => "Ez a feladat le van zárva. Nyisd meg újra a feladatlistában, ha linket indítanál hozzá.",
  link_id_kell: () => "Nem derül ki, melyik linkről van szó.",
  link_nincs: () => "A link nem található.",
  nem_a_te_linked: () => "Ez nem a te feladatod linkje.",
  link_ervenytelen: () => "Ez a link nem érvényes. Ellenőrizd, hogy pontosan másoltad-e, vagy kérj újat a tanárodtól.",
  diaklink_ervenytelen: () => "Ez a link nem érvényes. Ellenőrizd, hogy pontosan nyitottad-e meg.",
  link_lejart: () => "Ez a link lejárt, már nem lehet rajta beadni.",
  link_lezarva: () => "A tanár lezárta ezt a linket, már nem lehet rajta beadni.",
  link_betelt: () => "Ezen a linken már nem lehet több beadást fogadni. Szólj a tanárodnak.",
  becenev_ervenytelen: () => "A becenév 2–30 karakter legyen, és legyen benne betű vagy szám.",
  becenev_foglalt: () => "Ezt a becenevet valaki már használja ezen a linken. Válassz másikat.",
  szoveg_ervenytelen: () => "A szöveg üres, vagy túl hosszú (legfeljebb 20 000 karakter).",
  jelzesek_ervenytelen: () => "A beadás adatai hibásak. Töltsd újra az oldalt, és próbáld újra.",
  ertekeles_lista_hibas: () => "A kiválasztott beadások listája hibás (legfeljebb 100 azonosító).",
  onregisztracio_ki: () => "Az önálló tanári regisztráció ebben a környezetben nincs bekapcsolva.",
  email_nincs_megerositve: () => "Előbb erősítsd meg az e-mail-címedet a kapott levélben.",
  tanari_kerelem_hianyzik: () => "Ez a fiók nem tanári regisztrációval jött létre. Regisztrálj új fiókot tanárként.",
  kvota_elfogyott: (p) => `Elfogyott a havi AI-keret (${p.hasznalt} / ${p.limit} egység). A keret a hónap elején megújul.`,
  kvota_elfogyott_egyszeri: (p) => `Elfogyott az ingyenes AI-keret (${p.hasznalt} / ${p.limit} egység). Folytatáshoz fizetős csomag kell.`,
  csomag_ervenytelen: (p) => `Ismeretlen csomag: ${p.csomag}`,
  fizetes_ki: () => "A fizetés ebben a környezetben nincs bekapcsolva.",
  mar_elofizetett: () => "Már van aktív előfizetésed. Az előfizetést az „Előfizetés kezelése” gombbal módosíthatod.",
  csomag_kezi: () => "A csomagodat az üzemeltető állította be, ezért itt nem fizethetsz elő. Írj az üzemeltetőnek.",
  nincs_ugyfel: () => "Még nincs előfizetésed, ezért nincs mit kezelni.",
  fizetes_hiba: () => "A fizetési szolgáltatás nem válaszolt. Próbáld újra egy perc múlva.",
  csomag_alap_kell: () => "Az osztályszintű elemzés az Alap csomagtól érhető el.",
  csomag_profi_kell: () => "A fejlődéskövetés a Profi csomag része.",
  szinvalasztas_alap_kell: () => "A színválasztás az Alap csomagtól érhető el.",
  tema_ervenytelen: () => "Ismeretlen színtéma.",
  szamla_nincs: () => "Ez a befizetés nem található a számlázandók között.",
  szamlaszam_ervenytelen: () => "A számlaszám 1–60 karakter lehet."
};

/** Kódolt HttpsError: magyar üzenet + details.kod a kliens fordításához. */
function hiba(code, kod, params = {}) {
  return new HttpsError(code, HIBA_SZOVEG[kod](params), { kod, ...params });
}

/**
 * Egy belső hiba (más modul, AI-lépés) továbbadása HttpsError-ként úgy,
 * hogy a kódja ne vesszen el.
 */
function hibaAtvezet(code, e) {
  let details;
  if (e.kod) details = { kod: e.kod, ...(e.parameterek || {}) };
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

// ── CLAUDE-KÉRÉS ──
// A hívók Gemini-formátumú részeket (parts) és sémát adnak; ezeket itt alakítjuk át,
// így a hívó kód (és az ai_hasznalat mérése) szolgáltatótól független marad.

/** A JSON Schema kulcsai, amiket a Claude strukturált kimenete nem fogad el (elhagyjuk őket). */
const CLAUDE_SEMA_TILTOTT = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems",
  "minProperties", "maxProperties", "propertyOrdering", "nullable"
]);

/**
 * Gemini-séma → Claude JSON Schema: kisbetűs típusok, minden objektumon
 * additionalProperties: false, a nem támogatott megszorítások nélkül
 * (a pontszám-határokat amúgy is a szerver köti a rubrikához), nullable → anyOf null.
 */
function claudeSema(s) {
  if (Array.isArray(s)) return s.map(claudeSema);
  if (!s || typeof s !== "object") return s;
  const ki = {};
  for (const [k, v] of Object.entries(s)) {
    if (CLAUDE_SEMA_TILTOTT.has(k)) continue;
    if (k === "properties") {
      ki.properties = Object.fromEntries(Object.entries(v).map(([nev, x]) => [nev, claudeSema(x)]));
    } else if (k === "enum" || k === "required") {
      ki[k] = v;
    } else {
      ki[k] = claudeSema(v);
    }
  }
  if (typeof ki.type === "string") ki.type = ki.type.toLowerCase();
  if (ki.type === "object") ki.additionalProperties = false;
  return s.nullable === true ? { anyOf: [ki, { type: "null" }] } : ki;
}

/** Gemini-részek (text / inline_data) → Claude tartalomblokkok (text / image / document). */
function claudeTartalom(parts) {
  const ki = [];
  for (const p of parts || []) {
    if (typeof p?.text === "string") {
      if (p.text.length > 0) ki.push({ type: "text", text: p.text });
      continue;
    }
    const d = p?.inline_data;
    if (!d?.data) throw new Error("Ismeretlen kérésrész (sem szöveg, sem fájl).");
    const media = String(d.mime_type || "");
    const source = { type: "base64", media_type: media, data: d.data };
    ki.push(media === "application/pdf" ? { type: "document", source } : { type: "image", source });
  }
  return ki;
}

/** A Claude-válasz usage mezőjéből a tokenszámok (a gondolkodás a kimenetben van benne). */
function claudeHasznalat(usage) {
  const n = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0);
  const prompt = n(usage?.input_tokens) + n(usage?.cache_creation_input_tokens) + n(usage?.cache_read_input_tokens);
  const kimenet = n(usage?.output_tokens);
  return { prompt, kimenet, gondolkodas: 0, ossz: prompt + kimenet };
}

let claudeKliensPeldany = null;
function claudeKliens() {
  if (!claudeKliensPeldany) {
    claudeKliensPeldany = new Anthropic({
      apiKey: ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.value() : process.env.ANTHROPIC_API_KEY,
      maxRetries: 0,              // az újrapróbálást az aiHivas() végzi
      timeout: 280 * 1000,        // a függvény 300 mp-es korlátja alatt
      fetch: (...a) => globalThis.fetch(...a),  // a tesztek a globális fetch-et cserélik
      // munkaterülethez nem kötött kulcsnál kötelező (ANTHROPIC_WORKSPACE_ID a functions/.env.<alias>-ban)
      ...(BEALLITASOK.anthropicWorkspace ? { defaultHeaders: { "anthropic-workspace-id": BEALLITASOK.anthropicWorkspace } } : {})
    });
  }
  return claudeKliensPeldany;
}

/** Egyetlen Claude-kérés, újrapróbálkozás nélkül. A visszatérés alakja ugyanaz, mint a geminiKeres()-é. */
async function claudeKeres(modell, parts, schema, effort) {
  let valasz;
  try {
    valasz = await claudeKliens().messages.create({
      model: modell,
      max_tokens: CLAUDE_MAX_TOKENS,
      messages: [{ role: "user", content: claudeTartalom(parts) }],
      output_config: {
        format: { type: "json_schema", schema: claudeSema(schema) },
        ...(effort ? { effort } : {})
      }
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const uj = new Error(`Claude (${modell}): ${e.message}`);
      // kapcsolati hiba (nincs státusz) és túlterhelés (529) is átmeneti
      uj.atmeneti = !e.status || e.status === 529 || atmenetiHiba(e.status, { message: e.message });
      throw uj;
    }
    throw e;
  }

  const hasznalat = claudeHasznalat(valasz.usage);
  if (valasz.stop_reason === "refusal" || valasz.stop_reason === "max_tokens") {
    throw Object.assign(new Error(`A Claude (${modell}) nem adott teljes választ (${valasz.stop_reason}).`), { hasznalat });
  }
  const szoveg = (valasz.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!szoveg) {
    throw Object.assign(new Error(`A Claude (${modell}) nem adott választ (${valasz.stop_reason || "ismeretlen ok"}).`), { hasznalat });
  }
  try {
    return { eredmeny: JSON.parse(szoveg), hasznalat };
  } catch (_) {
    throw Object.assign(new Error(`A Claude válasza nem érvényes JSON: ${szoveg.slice(0, 200)}`), { hasznalat });
  }
}

/**
 * AI-hívás – ez az EGYETLEN pont, ahol a modellt hívjuk. A szolgáltatót (Gemini / Claude)
 * az AI_SZOLGALTATO környezeti változó választja (AI.szolgaltato).
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
 * @param {string} lepes 'ertekeles' | 'rubrika' | 'elemzes'
 * @param {{tanar_id, muvelet, feladat_id?, beadas_id?, mod?}} [kontextus] kell az
 *   AI-használat mérésének (ai_hasznalat); nélküle nem készül rekord
 * @returns {Promise<{eredmeny: object, modell: string, hasznalat: object}>} a válasz,
 *   az, hogy VÉGÜL melyik modell adta – tartalékra váltás esetén nem a fő
 *   modellt kell elmenteni, különben hamis lenne a nyomonkövetés –, és a tokenszámok
 */
async function aiHivas(lepes, parts, schema, kontextus) {
  const { kiserlet: KISERLET, varakozasok: VARAKOZASOK } = UJRAPROBA;

  const claude = AI.szolgaltato === "claude";
  const keres = claude ? claudeKeres : geminiKeres;
  const szint = claude ? CLAUDE_EFFORT[lepes] : GONDOLKODAS[lepes];
  const modellek = claude
    ? [CLAUDE_MODELLEK[lepes], ...(CLAUDE_TARTALEK[lepes] || [])]
    : [MODELLEK[lepes], ...(TARTALEK[lepes] || [])];
  let utolso;
  let probalkozas = 0;

  for (const modell of modellek) {
    for (let i = 0; i < KISERLET; i++) {
      try {
        if (i > 0 || modell !== modellek[0]) {
          logger.info("AI újrapróbálkozás", { lepes, modell, kiserlet: i + 1 });
        }
        probalkozas++;
        const { eredmeny, hasznalat } = await keres(modell, parts, schema, szint);
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
          logger.warn("AI átmeneti hiba, várakozás", {
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

/** A beírt beadás szövegének felső határa (a Firestore-szabály és a kliens is ezt tartja). */
const BEIRT_SZOVEG_MAX = 20000;

/**
 * A beadás dokumentumot a kliens hozza létre, ezért a benne lévő hivatkozásokban
 * nem bízunk: a feladatnak ugyanahhoz a tanárhoz kell tartoznia, különben más
 * tanár nevében lehetne beadni/jóváhagyni. A beadás mindig beírt
 * szöveg (fotós beadás 2026-11-12 óta nincs a prodban). Hibakódot ad vissza
 * (vagy null, ha rendben van); az AI-hívás előtt hívandó.
 */

function beadasOsszerendeles(beadasId, beadas, feladat) {
  const szoveg = (v) => typeof v === "string" && v.length > 0;
  if (!feladat) return "feladat_nincs";
  if (!szoveg(beadas.tanar_id) || beadas.tanar_id !== feladat.tanar_id) return "tanar_nem_egyezik";

  // A szöveget a kliens írta, ezért a hosszát itt is ellenőrizzük (a szabály ugyanezt teszi).
  if (beadas.forras !== "szoveg") return "mod_nem_egyezik";
  if (typeof beadas.szoveg !== "string" || beadas.szoveg.trim().length === 0
      || beadas.szoveg.length > BEIRT_SZOVEG_MAX) return "szoveg_nincs";
  return null;
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
  const ervenyes = ANYANYELVEK.includes(nyelv) ? EVFOLYAMOK : CEFR_SZINTEK;
  return ervenyes.includes(s) ? s : null;
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

/** A beírt szöveg + rubrika → értékelés. */
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

function ertekelesPrompt(feladat, szoveg) {
  const r = feladat.rubrika || {};
  const szempontok = (r.szempontok || [])
    .map((sz) => `  - ${sz.kulcs} ("${sz.cim}"): max ${sz.suly} pont`)
    .join("\n");

  const hosszElvaras =
    r.min_szo && r.max_szo ? `${r.min_szo}–${r.max_szo} szó` : "nincs megadva";

  const nyelv = nyelve(r);
  // A visszajelzés nyelve (feladatonként): lásd skala.kimenet()
  const kim = skala.kimenet(r);

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

# A DIÁK DOLGOZATA (a diák beírta)
"""
${szoveg}
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
  const kim = skala.kimenet(kimenetiNyelv);
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
    const { eredmeny: rubrika, modell } = await kvotaval(uid, "feladatlap", async () => aiHivas(
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
async function beadasFoglalas(firestore, beadasRef, { csakFeltoltve = false, csakSorban = false } = {}) {
  const futasId = randomUUID();
  const sikerult = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(beadasRef);
    if (!snap.exists) return false;
    const adat = snap.data();
    if (csakFeltoltve && adat.statusz !== "feltoltve") return false;
    // A tanár sorba állította (ertekelesInditas): csak a sorban lévőt dolgozzuk fel, egyszer.
    if (csakSorban && adat.statusz !== "sorban") return false;
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

  // AI-hívás előtt: a kliens írta hivatkozások ellenőrzése.
  const osszerendeles = beadasOsszerendeles(beadasId, beadas, feladat);
  if (osszerendeles) {
    logger.warn("Érvénytelen beadás-összerendelés", { beadasId, ok: osszerendeles });
    throw new Error("A beadás adatai nem egyeznek a feladattal.");
  }

  const futasId = await beadasFoglalas(firestore, beadasRef, opciok);
  if (!futasId) {
    logger.info("A beadás feldolgozása nem foglalható (már fut, vagy nem induló állapot)", { beadasId });
    return { kihagyva: true };
  }

  // A hiba mentéséhez a hívó a futásazonosítót is megkapja (hibaraAllit).
  try {
    return await feldolgozFutas({ firestore, beadasRef, beadasId, beadas, feladat, futasId });
  } catch (e) {
    e.futasId = futasId;
    throw e;
  }
}

async function feldolgozFutas({ firestore, beadasRef, beadasId, beadas, feladat, futasId }) {
  // A diák szövege maga az értékelendő szöveg: nincs átírás, nincs kép.
  const szoveg = beadas.szoveg.trim();

  // ── Értékelés a szöveg alapján ──
  // A rubrika módosítása után fillérekért újrafuttatható.
  const { eredmeny: ertekeles, modell: ertekelesModell } = await aiHivas(
    'ertekeles',
    [{ text: ertekelesPrompt({ ...feladat }, szoveg) }],
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
      diak_szoveg: skala.bekezdesekre(ertekeles.diak_szoveg),
      szoszam: ertekeles.szoszam || null,
      model: ertekelesModell,
      generalva: FieldValue.serverTimestamp()
    });

  await futasFrissites(beadasRef, futasId, {
    statusz: "javitva",
    frissitve: FieldValue.serverTimestamp()
  });

  logger.info("Beadás kijavítva", { beadasId, osszpontszam, maxPontszam });
  return { osszpontszam, maxPontszam };
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

// Az automatikus javítás (beadasFeldolgozas, Firestore-trigger) 2026-11-12 óta NINCS: a beadást
// a diák a feladatlinken adja be, az AI-értékelést a TANÁR indítja (beadasUjrafuttatas; a 6. lépésben
// több beadásra egyszerre). A diák beadása így nem indít AI-hívást (docs/prod-atalakitas-terv.md, 9.).

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
  // szempontok: a tanár pontjai szempontonként.
  const { beadasId, jegy, szoveg, szempontok } = adat || {};
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
  // tanára lehet (különben idegen feladat rubrikája kerülne a visszajelzésbe).
  if (feladatSnap.data()?.tanar_id !== uid) {
    throw hiba("permission-denied", "nem_a_te_beadasod");
  }
  // A jegy a FELADAT skáláján értelmezett (magyar 1–5, A–F, százalék…);
  // a tárolt érték a skála saját alakja, nem a kliens által küldött.
  const jegyskala = skala.skalaFeloldas(feladatSnap.data()?.rubrika);
  const tanariJegy = jegy == null ? null : skala.jegyNormalizalas(jegy, jegyskala);
  if (tanariJegy === undefined) throw hiba("invalid-argument", "jegy_ertek");

  let tabla = { szempontok: [], osszpontszam: null, max_pontszam: null, szazalek: null };
  if (aiSnap.exists) {
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
    jegy_tipus: jegyskala.tipus,
    szoveg: szoveg.trim(),
    ...tabla,
    tanar_id: uid,
    jovahagyva_at: FieldValue.serverTimestamp()
  });

  const diaklinkLejar = feladatlink.diaklinkJovahagyasUtan(beadas.diaklink_lejar);
  batch.update(beadasRef, {
    statusz: "elkuldve",
    ...(diaklinkLejar ? { diaklink_lejar: diaklinkLejar } : {}),
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
  ERTEKELES_SCHEMA,
  geminiKeres,
  claudeKeres,
  claudeSema,
  claudeTartalom,
  AI,
  CLAUDE_MODELLEK,
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
  jovahagyasLogika,
  beadasOsszerendeles,
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
  osztalyElemzesKapu,
  szinvalasztasKapu,
  temaBeallitasLogika,
  temaElveszik,
  stripeEsemenyFeldolgozas,
  stripeWebhookKezeles,
  szamlaKiallitas,
  szamlaRogzites,
  szamlazandoListaLogika,
  szamlaJelolesLogika,
  fizetesInditasLogika,
  fizetesKezelesLogika,
  aiHasznalatNaplo,
  aiHasznalatJelentesLogika,
  BEALLITASOK,
  aiHivas,
  atmenetiHiba,
  UJRAPROBA,
  MODELLEK,
  TARTALEK,
  GONDOLKODAS
};

// ══════════════════════════════════════════════════════
// 7. SAJÁT NÉV MÓDOSÍTÁSA
// A tanár megjelenítendő neve (felhasznalok/{uid}.nev). Diák és osztálynévsor
// 2026-11-12 óta nincs, ezért máshová nem kell denormalizálni.
// ══════════════════════════════════════════════════════
exports.nevModositas = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = belepve(request);

  const nev = (request.data?.nev || "").trim().replace(/\s+/g, " ");
  if (nev.length < 2) {
    throw hiba("invalid-argument", "nev_rovid");
  }
  if (nev.length > 80) {
    throw hiba("invalid-argument", "nev_hosszu");
  }

  await db().collection("felhasznalok").doc(uid).set({ nev }, { merge: true });
  logger.info("Név módosítva", { uid });
  return { nev };
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

// A szerep: "tanar", vagy "nincs" (nincs tanári jog). Diák szerep 2026-11-12 óta nincs.
// A "nincs" a claimben a szerep HIÁNYA (claimOsszefuzes: null → törlés), a tükörben kifejezett
// érték – a guard.js ebből veszi észre, hogy a tanári jog megszűnt, és frissíti a tokent.
const NINCS_SZEREP = "nincs";
const ERVENYES_SZEREPEK = ["tanar", NINCS_SZEREP];

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
    szerep: u.customClaims?.szerep || NINCS_SZEREP,
    admin: u.customClaims?.admin === true,
    // Ha a tükör és a claim eltér, a felhasználó tokenje elavult.
    // A guard.js a következő oldalbetöltésnél magától frissíti – ez a
    // jelzés csak tájékoztatás az adminnak.
    tukor_eltero:
      (nevek[u.uid]?.tukorSzerep || NINCS_SZEREP) !== (u.customClaims?.szerep || NINCS_SZEREP) ||
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
    if (szerep !== undefined) valtozasok.szerep = szerep === NINCS_SZEREP ? null : szerep;
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
      szerep: ujClaimek.szerep || NINCS_SZEREP,
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
    // az összehasonlító táblázat adata: melyik funkció melyik csomagban van (egy forrás: kvota.FUNKCIOK), és az ingyenes keret
    funkciok: kvota.FUNKCIOK,
    ingyenes_keret: kvota.keret("ingyenes"),
    // Stripe-ügyfél nélkül nincs élő előfizetés: az ilyen adat csak maradvány (pl. az éles módra váltás előtti, tesztmódú
    // előfizetésből), ezért nem mutatjuk, és nem állítja meg az új előfizetést.
    elofizetes: t.elofizetes?.stripe_ugyfel_id ? fizetes.elofizetesNezet(t) : null
  };
}

exports.kvotaAllapot = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = tanar(request);
  return { ...(await kvotaAllapotLogika(db(), uid)), ...(await fizetesAllapotLogika(db(), uid)) };
});

// ══════════════════════════════════════════════════════
// CSOMAG-ZÁRAK ÉS SZÍNTÉMA
//
// A zár a SZERVEREN van: a felület-zár önmagában kiskapu lenne. (A fejlődés-követés
// 2026-11-12 óta nincs a prodban: diákazonosság nélkül nem követhető.)
// ══════════════════════════════════════════════════════

/**
 * Csomag-zár egy funkcióra (a tábla: kvota.FUNKCIOK): kvótás környezetben csak a megfelelő
 * csomagoknál; egyébként (pilot) mindenki. A tanár csomagját csak akkor olvassa, ha kell.
 */
async function funkcioEngedett(firestore, uid, funkcio, beallitasok = BEALLITASOK) {
  if (!beallitasok.kvota) return true;
  const tanarSnap = await firestore.collection("tanarok").doc(uid).get();
  return kvota.funkcioEngedelyezett(true, tanarSnap.data()?.csomag, funkcio);
}

/** A színválasztás zárja: Alap, Profi és korlátlan csomag (az alapszínre visszaállás nem zárolt). */
async function szinvalasztasKapu(firestore, uid, beallitasok) {
  if (!(await funkcioEngedett(firestore, uid, "szinvalasztas", beallitasok))) {
    throw hiba("permission-denied", "szinvalasztas_alap_kell");
  }
}

/** Az osztályszintű elemzés zárja: Alap, Profi és korlátlan csomag. */
async function osztalyElemzesKapu(firestore, uid, beallitasok) {
  if (!(await funkcioEngedett(firestore, uid, "osztaly_elemzes", beallitasok))) {
    throw hiba("permission-denied", "csomag_alap_kell");
  }
}

/**
 * A tanár színtémájának mentése (felhasznalok/{uid}.tema; a kliens nem írhatja, a szabályok tiltják).
 * Az alapszín (narancs) a mező törlése, és mindenkinek szabad; bármely másik az Alap csomagtól.
 */
async function temaBeallitasLogika(firestore, uid, adat, beallitasok = BEALLITASOK) {
  const nev = tema.temaNev(adat?.tema);
  if (nev === undefined) throw hiba("invalid-argument", "tema_ervenytelen");
  if (nev !== tema.ALAP_TEMA) await szinvalasztasKapu(firestore, uid, beallitasok);
  await firestore.collection("felhasznalok").doc(uid).set(
    { tema: nev === tema.ALAP_TEMA ? FieldValue.delete() : nev },
    { merge: true }
  );
  return { tema: nev };
}

exports.temaBeallitas = onCall(HIVAS_OPCIOK, async (request) => {
  return temaBeallitasLogika(db(), tanar(request), request.data);
});

// ══════════════════════════════════════════════════════
// STRIPE-FIZETÉS (csak prod, ha az árazonosító be van állítva; lásd functions/fizetes.js)
//
// A kártyaadat sosem érinti a szervert: a tanár a Stripe fizetőoldalára (Checkout) megy, az előfizetés
// kezelése a Stripe saját portálján (Customer Portal). A csomagot kizárólag a webhook állítja be,
// aláírás-ellenőrzés és idempotencia mellett.
// ══════════════════════════════════════════════════════

/** A Stripe-kliens (lusta betöltés: a többi függvény betöltési ideje ne nőjön). */
function stripeKliens(titok = STRIPE_SECRET_KEY?.value()) {
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
/**
 * Elveszti-e a tanár a választott színtémát az új csomaggal? A színválasztás az előfizetéssel jár: ha a csomag
 * már nem adja (pl. a lemondott előfizetés a forduló végén megszűnt), a téma visszaáll az alapszínre.
 * Kvóta nélküli környezetben (pilot) a csomag nem számít, ott nem vesz el semmit.
 */
function temaElveszik(csomag, beallitasok = BEALLITASOK) {
  return !kvota.funkcioEngedelyezett(beallitasok.kvota, csomag, "szinvalasztas");
}

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
    // A színtéma az előfizetéssel jár: ha a csomag lejjebb ment (a forduló végén megszűnt az előfizetés), visszaáll az alapszín.
    if (hatas.csomagValtozas && temaElveszik(hatas.mezok.csomag, beallitasok)) {
      tx.set(firestore.collection("felhasznalok").doc(uid), { tema: FieldValue.delete() }, { merge: true });
    }
    naplo("alkalmazva", { uid });
    return { alkalmazva: true, uid, csomag: hatas.mezok.csomag };
  });
}

/** Ennyi sikertelen kísérlet után nem kéri újra a Stripe-tól a számlát (a hiba kézi javítást igényel). */
const SZAMLA_MAX_KISERLET = 5;
/** Ennyi ideig tekintjük "folyamatban" lévőnek a számlakészítést (utána egy új kísérlet átveheti). */
const SZAMLA_FOLYAMATBAN_MS = 10 * 60 * 1000;

/**
 * A számlázáshoz szükséges adatok a Stripe-számlából (a `szamlak` dokumentumba kerülnek, az admin lista ebből dolgozik).
 * Személyes adat (név, cím, e-mail): csak a szerver és az admin callable éri el, a szabályok a klienstől tiltják.
 */
function szamlaAdatok(szamla) {
  const cim = szamla.customer_address || {};
  const szoveg = (x, max = 200) => (typeof x === "string" ? x.slice(0, max) : null);
  return {
    stripe_szam: szoveg(szamla.number, 60),
    stripe_ugyfel: typeof szamla.customer === "string" ? szamla.customer : null,
    nev: szoveg(szamla.customer_name),
    email: szoveg(szamla.customer_email),
    cim: {
      sor1: szoveg(cim.line1), sor2: szoveg(cim.line2), varos: szoveg(cim.city, 100),
      irsz: szoveg(cim.postal_code, 20), orszag: szoveg(cim.country, 2)
    },
    osszeg: szamla.amount_paid, penznem: szamla.currency,
    teljesites: Number.isFinite(szamla.status_transitions?.paid_at) ? szamla.status_transitions.paid_at : (szamla.created ?? null),
    proba: szamla.livemode !== true
  };
}

/**
 * Kézi számlázás támogatása (amíg nincs bekötve az Agent): a sikeres befizetést „számlázandóként” rögzíti, az admin
 * oldalon (szamlazando.html) a tulajdonos ebből állítja ki a számlát a számlázz.hu-ban. Idempotens: egy befizetés egyszer kerül be.
 * A Stripe tesztmódú befizetése is bekerül (`proba: true`, az oldalon jelölve), hogy a folyamat kipróbálható legyen.
 */
async function szamlaRogzites(firestore, esemeny) {
  const szamla = esemeny?.data?.object;
  const ok = szamlazz.kihagyas(szamla);
  if (ok) return { eredmeny: "kihagyva", ok };
  const ref = firestore.collection("szamlak").doc(szamla.id);
  return firestore.runTransaction(async (tx) => {
    if ((await tx.get(ref)).data()) return { eredmeny: "kihagyva", ok: "mar_rogzitve" };
    tx.set(ref, { allapot: "szamlazando", ...szamlaAdatok(szamla), rogzitve: FieldValue.serverTimestamp() });
    return { eredmeny: "rogzitve" };
  });
}

/**
 * Számla a sikeres Stripe-befizetésről (`invoice.paid`) a számlázz.hu-ban. Idempotens: a `szamlak/{stripe-számla-id}`
 * dokumentum tranzakciós foglalása gátolja a dupla számlát (a Stripe többször is kézbesíthet).
 * Eredmények: `kesz`, `kihagyva`, `bizonytalan` (hálózati hiba: lehet, hogy elkészült – NEM próbáljuk újra vakon),
 * `hiba` (a számlázz.hu elutasította; a hívó 5xx-et ad, hogy a Stripe újrapróbálja).
 */
async function szamlaKiallitas(firestore, esemeny, { beallitasok = BEALLITASOK, kulcs, kuldFn = szamlazz.kuldes } = {}) {
  const szamla = esemeny?.data?.object;
  const ok = szamlazz.kihagyas(szamla);
  if (ok) return { eredmeny: "kihagyva", ok };
  // A Stripe TESZTMÓDÚ befizetéséről nem kérünk számlát: a számlázz.hu éles fiókjában a tesztelés díjköteles, és az
  // automatikus számlázást is leállíthatja (a számlázz.hu javaslata: tesztelni csak teszt fiókban).
  if (szamla.livemode !== true) return { eredmeny: "kihagyva", ok: "teszt_mod" };

  const ref = firestore.collection("szamlak").doc(szamla.id);
  const foglalas = await firestore.runTransaction(async (tx) => {
    const adat = (await tx.get(ref)).data();
    if (adat) {
      if (adat.allapot === "kesz" || adat.allapot === "bizonytalan") return { kihagy: adat.allapot };
      const ido = adat.foglalva?.toMillis?.() ?? 0;
      if (adat.allapot === "folyamatban" && Date.now() - ido < SZAMLA_FOLYAMATBAN_MS) return { kihagy: "folyamatban" };
      if ((adat.kiserlet || 0) >= SZAMLA_MAX_KISERLET) return { kihagy: "feladva" };
    }
    const kiserlet = (adat?.kiserlet || 0) + 1;
    tx.set(ref, {
      allapot: "folyamatban", foglalva: FieldValue.serverTimestamp(), kiserlet,
      ...szamlaAdatok(szamla)
    }, { merge: true });
    return { kiserlet };
  });
  if (foglalas.kihagy) return { eredmeny: "kihagyva", ok: foglalas.kihagy };

  const { xml, probaMod } = szamlazz.szamlaXml(szamla, {
    kulcs, bank: beallitasok.szamlazzBank, bankszamla: beallitasok.szamlazzBankszamla
  });
  const valasz = await kuldFn(xml);
  if (valasz.sikeres) {
    await ref.set({ allapot: "kesz", szamlaszam: valasz.szamlaszam || null, proba: probaMod, kesz: FieldValue.serverTimestamp() }, { merge: true });
    return { eredmeny: "kesz", szamlaszam: valasz.szamlaszam, proba: probaMod };
  }
  const hiba = { hibakod: valasz.hibakod || null, hibauzenet: String(valasz.hibauzenet || "").slice(0, 300) };
  if (valasz.bizonytalan) {
    await ref.set({ allapot: "bizonytalan", ...hiba, hiba_ido: FieldValue.serverTimestamp() }, { merge: true });
    return { eredmeny: "bizonytalan", ...hiba };
  }
  await ref.set({ allapot: "hiba", ...hiba, hiba_ido: FieldValue.serverTimestamp() }, { merge: true });
  return { eredmeny: "hiba", ...hiba, kiserlet: foglalas.kiserlet };
}

/**
 * A webhook-kérés kezelése: aláírás-ellenőrzés a NYERS törzsön, majd feldolgozás. A függőségek (kliens, titok,
 * firestore) paraméterek, hogy hálózat nélkül tesztelhető legyen. Hibánál 5xx: a Stripe újrapróbálja.
 */
async function stripeWebhookKezeles(req, res, { stripe, titok, firestore = db(), beallitasok = BEALLITASOK, szamlazzKulcs = () => String(SZAMLAZZ_AGENT_KULCS?.value() ?? "").trim() }) {
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
  if (esemeny.type === "invoice.paid" && !beallitasok.szamlazz && beallitasok.fizetes) {
    try {
      const eredmeny = await szamlaRogzites(firestore, esemeny);
      logger.info("Számlázandó befizetés", { id: esemeny.id, szamla: esemeny.data?.object?.id, ...eredmeny });
      res.status(200).json({ ok: true, ...eredmeny });
    } catch (e) {
      logger.error("Számlázandó rögzítési hiba", { id: esemeny.id, hiba: e.message });
      res.status(500).send("Feldolgozási hiba");
    }
    return;
  }
  if (esemeny.type === "invoice.paid" && beallitasok.szamlazz) {
    try {
      const eredmeny = await szamlaKiallitas(firestore, esemeny, { beallitasok, kulcs: szamlazzKulcs() });
      if (eredmeny.eredmeny === "hiba" && eredmeny.kiserlet < SZAMLA_MAX_KISERLET) {
        logger.error("Számla-hiba (a Stripe újrapróbálja)", { id: esemeny.id, ...eredmeny });
        res.status(500).send("Számlázási hiba");
        return;
      }
      if (eredmeny.eredmeny === "hiba" || eredmeny.eredmeny === "bizonytalan") {
        logger.error("Számla: kézi ellenőrzés kell", { id: esemeny.id, szamla: esemeny.data?.object?.id, ...eredmeny });
      } else {
        logger.info("Számla", { id: esemeny.id, szamla: esemeny.data?.object?.id, ...eredmeny });
      }
      res.status(200).json({ ok: true, ...eredmeny });
    } catch (e) {
      logger.error("Számla feldolgozási hiba", { id: esemeny.id, hiba: e.message });
      res.status(500).send("Feldolgozási hiba");
    }
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

// ── KÉZI SZÁMLÁZÁS: az admin oldal (szamlazando.html) callable-jei ──
const SZAMLA_LISTA_MAX = 300;
const STRIPE_SZAMLA_ID = /^in_[A-Za-z0-9_]{1,80}$/;

/** A legutóbbi befizetések számlázási állapottal, a legújabb elöl. */
async function szamlazandoListaLogika(firestore) {
  const snap = await firestore.collection("szamlak").orderBy("teljesites", "desc").limit(SZAMLA_LISTA_MAX).get();
  return {
    csonkolt: snap.size >= SZAMLA_LISTA_MAX,
    tetelek: snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id, allapot: x.allapot || "szamlazando", stripe_szam: x.stripe_szam ?? null,
        nev: x.nev ?? null, email: x.email ?? null, cim: x.cim || {}, osszeg: x.osszeg ?? null, penznem: x.penznem ?? null,
        teljesites: x.teljesites ?? null, proba: x.proba === true, szamlaszam: x.szamlaszam ?? null, kezi: x.kezi === true,
        hibauzenet: x.hibauzenet ?? null
      };
    })
  };
}

/**
 * Egy befizetés kézi „kiállítva” jelölése (számlaszámmal), vagy visszavonása (szamlaszam: null).
 * Az Agent által kiállított (nem kézi) számlát nem írja át.
 */
async function szamlaJelolesLogika(firestore, adminUid, adat) {
  const id = adat?.id;
  if (typeof id !== "string" || !STRIPE_SZAMLA_ID.test(id)) throw hiba("invalid-argument", "szamla_nincs");
  const szam = adat?.szamlaszam;
  const visszavon = szam === null;
  if (!visszavon && (typeof szam !== "string" || szam.trim().length < 1 || szam.trim().length > 60)) {
    throw hiba("invalid-argument", "szamlaszam_ervenytelen");
  }
  const ref = firestore.collection("szamlak").doc(id);
  return firestore.runTransaction(async (tx) => {
    const x = (await tx.get(ref)).data();
    if (!x) throw hiba("not-found", "szamla_nincs");
    if (x.allapot === "kesz" && x.kezi !== true) throw hiba("failed-precondition", "szamla_nincs");
    if (visszavon) {
      tx.set(ref, { allapot: "szamlazando", szamlaszam: FieldValue.delete(), kezi: FieldValue.delete(), kesz: FieldValue.delete(), kiallitotta: FieldValue.delete() }, { merge: true });
      return { allapot: "szamlazando" };
    }
    tx.set(ref, { allapot: "kesz", szamlaszam: szam.trim(), kezi: true, kesz: FieldValue.serverTimestamp(), kiallitotta: adminUid }, { merge: true });
    return { allapot: "kesz", szamlaszam: szam.trim() };
  });
}

exports.szamlazandoLista = onCall(HIVAS_OPCIOK, async (request) => {
  admin(request);
  try {
    return await szamlazandoListaLogika(db());
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("szamlazandoLista hiba", { hiba: e.message });
    throw belsoHiba(e);
  }
});

exports.szamlaJeloles = onCall(HIVAS_OPCIOK, async (request) => {
  const uid = admin(request);
  try {
    return await szamlaJelolesLogika(db(), uid, request.data);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("szamlaJeloles hiba", { hiba: e.message });
    throw belsoHiba(e);
  }
});

exports.stripeWebhook = onRequest(
  { region: REGION, secrets: [...STRIPE_TITKOK, ...(SZAMLAZZ_AGENT_KULCS ? [SZAMLAZZ_AGENT_KULCS] : [])], cors: false },
  async (req, res) => {
    if (!BEALLITASOK.fizetes) { res.status(404).send("A fizetés ki van kapcsolva"); return; }
    await stripeWebhookKezeles(req, res, { stripe: stripeKliens(), titok: String(STRIPE_WEBHOOK_SECRET.value()).trim() });
  }
);

/**
 * Megszűnt Stripe-ügyfél (a Stripe-ban törölték, vagy másik módból – teszt/éles – származik az azonosító):
 * a Stripe "resource_missing"-et ad az ügyfélre. Ilyenkor az eltárolt azonosító elavult, és el kell engedni.
 */
function eltuntUgyfel(e) {
  return e?.code === "resource_missing" && (e?.param === "customer" || /customer/i.test(String(e?.message)));
}

/** Az elavult Stripe-ügyfél-azonosító törlése a tanár dokumentumáról (az előfizetés többi adata marad). */
/**
 * A Stripe-ban már nem létező ügyfél előfizetése nem létezik: az egész előfizetési adat törlődik, és ha a csomagot a
 * Stripe adta (nem az admin), az ingyenesre áll vissza. Tipikus eset: az éles módra váltás előtt tesztmódban kötött előfizetés.
 */
async function elavultElofizetesTorles(firestore, uid) {
  const ref = firestore.collection("tanarok").doc(uid);
  const t = (await ref.get()).data() || {};
  const mezok = { elofizetes: FieldValue.delete() };
  if (t.csomag_forras !== "admin" && t.csomag && t.csomag !== "ingyenes") {
    mezok.csomag = "ingyenes";
    mezok.csomag_modositva = FieldValue.serverTimestamp();
  }
  await ref.set(mezok, { merge: true });
}

async function ugyfelAzonositoTorles(firestore, uid) {
  await firestore.collection("tanarok").doc(uid).set(
    { elofizetes: { stripe_ugyfel_id: FieldValue.delete() } }, { merge: true }
  );
}

/**
 * A fizetőoldal (Checkout) létrehozása: az előfizetés a tanár uid-jához kötve.
 * A kért csomag a request.data.csomag ("alap" vagy "profi"; alap a hiányzó); csak beállított árú csomag kérhető.
 */
async function fizetesInditasLogika(firestore, stripe, request, beallitasok = BEALLITASOK) {
  const uid = tanar(request);
  if (!beallitasok.fizetes) throw hiba("failed-precondition", "fizetes_ki");

  const t = (await firestore.collection("tanarok").doc(uid).get()).data() || {};
  if (t.csomag_forras === "admin" && t.csomag && t.csomag !== "ingyenes") throw hiba("failed-precondition", "csomag_kezi");
  // csak élő előfizetés (Stripe-ügyféllel) állítja meg az újat; az ügyfél nélküli "aktív" állapot elavult maradvány
  if (t.elofizetes?.stripe_ugyfel_id && fizetes.JAR.has(t.elofizetes?.statusz)) throw hiba("failed-precondition", "mar_elofizetett");

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
  const parameterek = (ugyfel) => ({
    mode: "subscription",
    line_items: [{ price: ar, quantity: 1 }],
    client_reference_id: uid,
    // meglévő Stripe-ügyfél (korábbi előfizetés) újrahasznosítva; különben az e-mail-cím előtöltve
    ...(ugyfel ? { customer: ugyfel } : (email ? { customer_email: email } : {})),
    metadata: { uid },
    subscription_data: { metadata: { uid } },
    // a lakcím kell az EU-s áfa-elszámoláshoz
    billing_address_collection: "required",
    locale: "auto",
    success_url: `${beallitasok.visszaUrl}/tanar.html?fizetes=sikeres`,
    cancel_url: `${beallitasok.visszaUrl}/tanar.html?fizetes=megszakitva`
  });
  try {
    let munkamenet;
    try {
      munkamenet = await stripe.checkout.sessions.create(parameterek(ugyfelId));
    } catch (e) {
      if (!ugyfelId || !eltuntUgyfel(e)) throw e;
      // az eltárolt ügyfél a Stripe-ban már nincs meg: elengedjük, és új ügyfelet kap (e-mailből)
      logger.warn("Elavult Stripe-ügyfél, új ügyfél létrehozása", { uid });
      await ugyfelAzonositoTorles(firestore, uid);
      munkamenet = await stripe.checkout.sessions.create(parameterek(null));
    }
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
    if (eltuntUgyfel(e)) {
      // az ügyfél a Stripe-ban már nincs meg: nincs mit kezelni, az elavult előfizetési adatot elengedjük
      await elavultElofizetesTorles(firestore, uid);
      throw hiba("failed-precondition", "nincs_ugyfel");
    }
    logger.error("Stripe-portál hiba", { uid, hiba: e.message });
    throw belsoHiba(e, "fizetes_hiba");
  }
}

/** A jogosultság és a kapcsoló ELŐBB dől el, mint hogy a Stripe-kulcshoz nyúlnánk. */
function fizetesKapu(request) {
  tanar(request);
  if (!BEALLITASOK.fizetes) throw hiba("failed-precondition", "fizetes_ki");
}

exports.fizetesIndit = onCall({ ...HIVAS_OPCIOK, secrets: STRIPE_TITKOK.slice(0, 1) }, async (request) => {
  fizetesKapu(request);
  return fizetesInditasLogika(db(), stripeKliens(), request);
});

exports.fizetesKezeles = onCall({ ...HIVAS_OPCIOK, secrets: STRIPE_TITKOK.slice(0, 1) }, async (request) => {
  fizetesKapu(request);
  return fizetesKezelesLogika(db(), stripeKliens(), request);
});

/** Admin: egy tanár csomagjának beállítása (fizetésig ez az egyetlen út). */
async function csomagBeallitasLogika(firestore, uid, csomag, beallitasok = BEALLITASOK) {
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
  // az alapcsomagra visszaállított tanár színtémája is visszaáll (a színválasztás az Alaptól jár)
  if (temaElveszik(csomag, beallitasok)) {
    await firestore.collection("felhasznalok").doc(uid).set({ tema: FieldValue.delete() }, { merge: true });
  }
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
//      kérelem nélküli fiók nem léptetheti elő magát.
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
    hibaMinta
  };
}

function elemzesPrompt(feladat, agg) {
  const r = feladat.rubrika || {};
  const nyelv = nyelve(r);
  const kim = skala.kimenet(r);

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

    // Csomag-zár: kvótás környezetben az Alap csomagtól (az ingyenes nem kapja), minden adatolvasás előtt.
    await osztalyElemzesKapu(firestore, uid);

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

    const ertekelesek = [];
    for (const d of beadasok.docs) {
      const ai = await d.ref.collection("ertekeles").doc("ai").get();
      if (!ai.exists) continue;
      const ert = {
        ...ai.data(),
        // diákonként egy beadás: a beadás azonosítója a diák (diákfiók 2026-11-12 óta nincs)
        diak_id: d.id
      };
      ertekelesek.push(ert);
    }

    if (ertekelesek.length === 0) {
      throw hiba("failed-precondition", "nincs_kiertekelt");
    }

    const agg = elemzesAggregalas(ertekelesek);

    const { eredmeny, modell } = await kvotaval(uid, "elemzes", () => aiHivas(
      "elemzes",
      [{ text: elemzesPrompt(feladat, agg) }],
      ELEMZES_SCHEMA,
      { tanar_id: uid, muvelet: "elemzes", feladat_id: feladatId }
    ));

    // A hibaMinta nem kell a kliensnek: nagy, és a példák a tipushibakban
    // már benne vannak.
    const { hibaMinta, ...mentendoAgg } = agg;

    const dokumentum = {
      beadas_db: beadasok.size,
      ...mentendoAgg,
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
// 12. FELADATLINK (tanár)
//
// A tanár feladatonként 24 óráig élő linket indít (akár többet is, pl. két
// csoportnak); a diák ezen, fiók nélkül adja be a szöveget (4. lépés). A link
// dokumentuma linkek/{a token SHA-256 lenyomata}; a tokent csak a tanár olvassa
// vissza (megosztási oldal). Kliensről a gyűjtemény nem írható: a lejáratot, a
// plafont és a tulajdonost a szerver állítja. A tiszta rész: functions/feladatlink.js.
// ══════════════════════════════════════════════════════

/** Új feladatlink. A feladat a hívó tanáré és nyitott (aktív) kell legyen. */
async function linkInditasLogika(firestore, uid, adat, { most = Date.now(), tokenFn = feladatlink.tokenGeneralas } = {}) {
  const feladatId = adat?.feladatId;
  if (!feladatId || typeof feladatId !== "string") throw hiba("invalid-argument", "feladat_id_kell");
  const feladatSnap = await firestore.collection("feladatok").doc(feladatId).get();
  if (!feladatSnap.exists) throw hiba("not-found", "feladat_nincs");
  if (feladatSnap.data().tanar_id !== uid) throw hiba("permission-denied", "nem_a_te_feladatod");
  if (feladatSnap.data().aktiv === false) throw hiba("failed-precondition", "feladat_zart");

  // A csoport nem kötelező; ha van, a hívó tanár saját, nem archivált csoportja kell legyen.
  let csoportId = null;
  if (adat?.csoportId !== undefined && adat?.csoportId !== null && adat?.csoportId !== "") {
    csoportId = adat.csoportId;
    if (typeof csoportId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(csoportId)) throw hiba("invalid-argument", "csoport_ervenytelen");
    const csoportSnap = await firestore.collection("csoportok").doc(csoportId).get();
    if (!csoportSnap.exists || csoportSnap.data().tanar_id !== uid || csoportSnap.data().aktiv === false) {
      throw hiba("failed-precondition", "csoport_ervenytelen");
    }
  }

  const token = tokenFn();
  const linkId = feladatlink.tokenHash(token);
  const linkRef = firestore.collection("linkek").doc(linkId);
  // create(): egy (gyakorlatilag lehetetlen) ütközés ne írjon felül másik linket
  await linkRef.create({
    ...feladatlink.ujLinkAdat({ feladatId, tanarId: uid, token, csoportId, most }),
    letrehozva: FieldValue.serverTimestamp()
  });
  logger.info("Feladatlink indítva", { feladatId, tanar: uid, linkId, csoportId });
  return { linkId, token, lejar: new Date(most + feladatlink.LINK_ERVENYESSEG_MS).toISOString() };
}

/** A link lezárása lejárat előtt (ismételt hívás ártalmatlan). */
async function linkLezarasLogika(firestore, uid, adat) {
  const linkId = adat?.linkId;
  if (!linkId || typeof linkId !== "string" || !/^[0-9a-f]{64}$/.test(linkId)) throw hiba("invalid-argument", "link_id_kell");
  const ref = firestore.collection("linkek").doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) throw hiba("not-found", "link_nincs");
  if (snap.data().tanar_id !== uid) throw hiba("permission-denied", "nem_a_te_linked");
  if (snap.data().lezarva !== true) {
    await ref.update({ lezarva: true, lezarva_at: FieldValue.serverTimestamp() });
    logger.info("Feladatlink lezárva", { linkId, tanar: uid });
  }
  return { lezarva: true };
}

exports.linkInditas = onCall(HIVAS_OPCIOK, async (request) => {
  return linkInditasLogika(db(), tanar(request), request.data);
});

exports.linkLezaras = onCall(HIVAS_OPCIOK, async (request) => {
  return linkLezarasLogika(db(), tanar(request), request.data);
});


// ══════════════════════════════════════════════════════
// 13. A DIÁK A FELADATLINKEN (belépés nélkül)
//
// A diáknak nincs fiókja: a feladatlink tokenje az egyetlen jogosultsága.
// Minden bemenetét ellenőrizzük, mielőtt bármit olvasnánk vagy írnánk.
// Ezek a függvények SOHA nem hívnak AI-t: az értékelést a tanár indítja.
// ══════════════════════════════════════════════════════

/** A link (token alapján) és az állapota; érvénytelen token esetén ugyanaz a hiba, mint nem létezőnél. */
async function linkTokenbol(firestore, token, tx = null) {
  if (!feladatlink.tokenErvenyes(token)) throw hiba("invalid-argument", "link_ervenytelen");
  const ref = firestore.collection("linkek").doc(feladatlink.tokenHash(token));
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw hiba("not-found", "link_ervenytelen");
  return { ref, link: snap.data() };
}

/**
 * A diákoldal adatai: a link állapota és – ha beadható – a feladat diáknak szóló része
 * (cím, leírás, szószám, szempontok címe és pontja). Más nem megy ki: a rubrika egyéb
 * mezői (pl. a tanár külön kérése az AI-nak) a tanáré.
 */
async function linkAdatokLogika(firestore, adat, { most = Date.now() } = {}) {
  const { link } = await linkTokenbol(firestore, adat?.token);
  let allapot = feladatlink.linkAllapot(link, most);
  const feladatSnap = await firestore.collection("feladatok").doc(link.feladat_id).get();
  const feladat = feladatSnap.exists ? feladatSnap.data() : null;
  if (!feladat || feladat.aktiv === false) allapot = allapot === "aktiv" || allapot === "betelt" ? "lezarva" : allapot;
  const cim = String(feladat?.cim || "");
  if (allapot !== "aktiv") return { allapot, cim };
  const r = feladat.rubrika || {};
  const szam = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  return {
    allapot,
    cim,
    lejar: new Date(link.lejar.toMillis ? link.lejar.toMillis() : link.lejar).toISOString(),
    csoportos: Boolean(link.csoport_id),
    feladat: {
      leiras: String(r.feladat_leiras || ""),
      nyelv: NYELVEK.includes(r.nyelv) ? r.nyelv : ALAP_NYELV,
      min_szo: szam(r.min_szo),
      max_szo: szam(r.max_szo),
      // a böngésző helyesírás-ellenőrzése: a tanár kapcsolja be feladatonként (alapból ki)
      helyesiras: r.helyesiras_engedett === true,
      szempontok: (Array.isArray(r.szempontok) ? r.szempontok : [])
        .filter((sz) => sz && typeof sz === "object")
        .map((sz) => ({ cim: String(sz.cim || sz.kulcs || ""), suly: Number(sz.suly) || 0 }))
    }
  };
}

/**
 * A diák beadása. Egy tranzakcióban: a link még él és nincs betelve, a feladat nyitott, a
 * becenév szabad ezen a linken; létrejön a beadás (azonosítója a diák új tokenjének
 * lenyomata), lefoglalódik a becenév, és nő a link beadásszáma. A diák a tokent kapja vissza:
 * ebből lesz a saját visszajelzés-linkje. NEM indít AI-t.
 */
async function linkBeadasLogika(firestore, adat, { most = Date.now(), tokenFn = feladatlink.tokenGeneralas } = {}) {
  const token = adat?.token;
  if (!feladatlink.tokenErvenyes(token)) throw hiba("invalid-argument", "link_ervenytelen");
  if (!feladatlink.becenevErvenyes(adat?.becenev)) throw hiba("invalid-argument", "becenev_ervenytelen");
  const szoveg = typeof adat?.szoveg === "string" ? adat.szoveg.replace(/\r\n?/g, "\n") : adat?.szoveg;
  if (!feladatlink.szovegErvenyes(szoveg)) throw hiba("invalid-argument", "szoveg_ervenytelen");
  if (!feladatlink.jelzesekErvenyesek(adat?.jelzesek)) throw hiba("invalid-argument", "jelzesek_ervenytelen");
  const becenevKulcs = feladatlink.becenevKulcs(adat.becenev);

  const diakToken = tokenFn();
  const beadasId = feladatlink.tokenHash(diakToken);

  await firestore.runTransaction(async (tx) => {
    const { ref: linkRef, link } = await linkTokenbol(firestore, token, tx);
    const allapot = feladatlink.linkAllapot(link, most);
    if (allapot === "lejart") throw hiba("failed-precondition", "link_lejart");
    if (allapot === "lezarva") throw hiba("failed-precondition", "link_lezarva");
    if (allapot === "betelt") throw hiba("failed-precondition", "link_betelt");
    const feladatSnap = await tx.get(firestore.collection("feladatok").doc(link.feladat_id));
    if (!feladatSnap.exists || feladatSnap.data().aktiv === false) throw hiba("failed-precondition", "link_lezarva");
    const becenevRef = linkRef.collection("becenevek").doc(becenevKulcs);
    if ((await tx.get(becenevRef)).exists) throw hiba("already-exists", "becenev_foglalt");

    // Csoportos link (8b/2): a becenév a csoporton belül ugyanahhoz a diákhoz kerül; új becenévből új diák.
    // Az olvasások itt is az írások előtt vannak (tranzakció).
    let csoportDiakId = null;
    if (link.csoport_id) {
      const csRef = firestore.collection("csoportok").doc(link.csoport_id);
      const aliasRef = csRef.collection("becenevek").doc(becenevKulcs);
      const alias = await tx.get(aliasRef);
      const regiId = alias.exists ? alias.data().diak_id : null;
      const regiRef = typeof regiId === "string" && regiId ? csRef.collection("diakok").doc(regiId) : null;
      if (regiRef && (await tx.get(regiRef)).exists) {
        tx.update(regiRef, { utolso_beadas: FieldValue.serverTimestamp() });
        csoportDiakId = regiRef.id;
      } else {
        const ujRef = csRef.collection("diakok").doc();
        tx.set(ujRef, {
          ...feladatlink.ujCsoportDiakAdat(adat.becenev),
          letrehozva: FieldValue.serverTimestamp(),
          utolso_beadas: FieldValue.serverTimestamp()
        });
        tx.set(aliasRef, { diak_id: ujRef.id });
        csoportDiakId = ujRef.id;
      }
    }

    const beadasRef = firestore.collection("beadasok").doc(beadasId);
    tx.create(beadasRef, {
      ...feladatlink.ujBeadasAdat({ link, linkId: linkRef.id, becenev: adat.becenev, szoveg, jelzesek: adat.jelzesek, csoportDiakId, most }),
      letrehozva: FieldValue.serverTimestamp(),
      frissitve: FieldValue.serverTimestamp()
    });
    tx.set(becenevRef, { beadas_id: beadasId, letrehozva: FieldValue.serverTimestamp() });
    tx.update(linkRef, { beadas_db: FieldValue.increment(1) });
  });

  logger.info("Beadás a feladatlinken", { beadasId });
  return { diakToken, diaklinkLejar: new Date(most + feladatlink.DIAKLINK_ERVENYESSEG_MS).toISOString() };
}

// Belépés nélkül hívható: a token a jogosultság (a függvény maga ellenőrzi).
exports.linkAdatok = onCall(HIVAS_OPCIOK, async (request) => linkAdatokLogika(db(), request.data));
exports.linkBeadas = onCall(HIVAS_OPCIOK, async (request) => linkBeadasLogika(db(), request.data));

Object.assign(exports._teszt, { linkInditasLogika, linkLezarasLogika, linkAdatokLogika, linkBeadasLogika });

// ══════════════════════════════════════════════════════
// 13/b. A CSOPORT DIÁKJAI (tanár, 8b/2) – kézi párosítás
//
// A beadáskor a becenév automatikusan párosul (linkBeadasLogika). Ha a diák más becenevet
// használt, a tanár összevonja a két diákot; ha a párosítás téves, egy beadást leválaszt.
// Kliensről a diakok/becenevek nem írhatók: a beadások és a becenév-hozzárendelés együtt,
// egy tranzakcióban változik (egy közben érkező beadás sem kerülhet rossz helyre).
// ══════════════════════════════════════════════════════

const AZONOSITO_MINTA = /^[A-Za-z0-9_-]{1,128}$/;
/** Egy tranzakcióban legfeljebb ennyi beadás helyezhető át (a Firestore 500 írásos korlátja alatt). */
const CSOPORT_ATHELYEZES_MAX = 400;

async function sajatCsoportRef(firestore, uid, csoportId) {
  if (typeof csoportId !== "string" || !AZONOSITO_MINTA.test(csoportId)) throw hiba("invalid-argument", "csoport_nincs");
  const ref = firestore.collection("csoportok").doc(csoportId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().tanar_id !== uid) throw hiba("not-found", "csoport_nincs");
  return ref;
}

const csoportDiakBeadasai = (firestore, uid, csoportId, diakId) => firestore.collection("beadasok")
  .where("tanar_id", "==", uid).where("csoport_id", "==", csoportId).where("csoport_diak_id", "==", diakId);

/** A forrásdiák minden beadása és beceneve a célhoz kerül; a forrás megszűnik. */
async function csoportDiakOsszevonasLogika(firestore, uid, adat) {
  const { celDiakId, forrasDiakId } = adat || {};
  const csRef = await sajatCsoportRef(firestore, uid, adat?.csoportId);
  if (![celDiakId, forrasDiakId].every((x) => typeof x === "string" && AZONOSITO_MINTA.test(x))) {
    throw hiba("invalid-argument", "csoport_diak_nincs");
  }
  if (celDiakId === forrasDiakId) throw hiba("invalid-argument", "osszevonas_onmagaval");

  const athelyezve = await firestore.runTransaction(async (tx) => {
    const celRef = csRef.collection("diakok").doc(celDiakId);
    const forrasRef = csRef.collection("diakok").doc(forrasDiakId);
    const [cel, forras] = await tx.getAll(celRef, forrasRef);
    if (!cel.exists || !forras.exists) throw hiba("not-found", "csoport_diak_nincs");
    const beadasok = await tx.get(csoportDiakBeadasai(firestore, uid, csRef.id, forrasDiakId));
    if (beadasok.size > CSOPORT_ATHELYEZES_MAX) throw hiba("failed-precondition", "csoport_tul_sok_beadas");

    const terv = feladatlink.osszevonasTerv(cel.data(), forras.data());
    for (const b of beadasok.docs) tx.update(b.ref, { csoport_diak_id: celDiakId });
    for (const k of forras.data().becenevek || []) tx.set(csRef.collection("becenevek").doc(k), { diak_id: celDiakId });
    tx.update(celRef, terv);
    tx.delete(forrasRef);
    return beadasok.size;
  });
  logger.info("Csoport: diákok összevonva", { tanar: uid, csoport: csRef.id, celDiakId, forrasDiakId, athelyezve });
  return { diakId: celDiakId, athelyezve };
}

/** Egy beadás leválasztása a diákjáról: új diák lesz belőle (a téves párosítás bontása). */
async function csoportBeadasLevalasztasLogika(firestore, uid, adat) {
  const beadasId = adat?.beadasId;
  if (typeof beadasId !== "string" || !AZONOSITO_MINTA.test(beadasId)) throw hiba("invalid-argument", "beadas_nincs");
  const beadasRef = firestore.collection("beadasok").doc(beadasId);

  const eredmeny = await firestore.runTransaction(async (tx) => {
    const bSnap = await tx.get(beadasRef);
    const b = bSnap.data();
    if (!bSnap.exists || b.tanar_id !== uid) throw hiba("not-found", "beadas_nincs");
    if (!b.csoport_id || !b.csoport_diak_id) throw hiba("failed-precondition", "csoport_diak_nincs");
    const csRef = firestore.collection("csoportok").doc(b.csoport_id);
    const forrasRef = csRef.collection("diakok").doc(b.csoport_diak_id);
    const forras = await tx.get(forrasRef);
    if (!forras.exists) throw hiba("not-found", "csoport_diak_nincs");
    const tobbi = (await tx.get(csoportDiakBeadasai(firestore, uid, b.csoport_id, b.csoport_diak_id))).docs
      .filter((d) => d.id !== beadasId).map((d) => d.data());
    if (tobbi.length === 0) throw hiba("failed-precondition", "levalasztas_egyetlen");

    const terv = feladatlink.levalasztasTerv(forras.data(), b, tobbi);
    const ujRef = csRef.collection("diakok").doc();
    tx.set(ujRef, { ...terv.uj, letrehozva: FieldValue.serverTimestamp(), utolso_beadas: b.letrehozva ?? FieldValue.serverTimestamp() });
    if (terv.becenevViszi) tx.set(csRef.collection("becenevek").doc(terv.kulcs), { diak_id: ujRef.id });
    tx.update(forrasRef, terv.forras);
    tx.update(beadasRef, { csoport_diak_id: ujRef.id });
    return { diakId: ujRef.id, csoportId: b.csoport_id };
  });
  logger.info("Csoport: beadás leválasztva", { tanar: uid, beadasId, ...eredmeny });
  return { diakId: eredmeny.diakId };
}

exports.csoportDiakOsszevonas = onCall(HIVAS_OPCIOK, async (request) => {
  return csoportDiakOsszevonasLogika(db(), tanar(request), request.data);
});

exports.csoportBeadasLevalasztas = onCall(HIVAS_OPCIOK, async (request) => {
  return csoportBeadasLevalasztasLogika(db(), tanar(request), request.data);
});

Object.assign(exports._teszt, { csoportDiakOsszevonasLogika, csoportBeadasLevalasztasLogika });

// ══════════════════════════════════════════════════════
// 13/c. FEJLŐDÉS A CSOPORTBAN (tanár, Profi csomag, 8b/3; a számtan: functions/fejlodes.js)
//
// A csoport becenév szerint párosított diákjainak jóváhagyott (elkuldve) beadásai: a tanári
// pontszázalék feladatról feladatra és az AI által jelölt, ismétlődő hibák. A zár a SZERVEREN van
// (a tanár a szabályok szerint olvashatná a beadásokat, ezért a felület-zár kiskapu lenne):
// előbb a csomag, utána a csoport tulajdonosa, csak ezután olvas adatot.
// ══════════════════════════════════════════════════════

/** A fejlődés-követés zárja: Profi és korlátlan csomag (kvóta nélküli környezetben mindenki). */
async function fejlodesKapu(firestore, uid, beallitasok) {
  if (!(await funkcioEngedett(firestore, uid, "fejlodes", beallitasok))) {
    throw hiba("permission-denied", "csomag_profi_kell");
  }
}

/**
 * A jóváhagyott beadások idővonal-pontjai. Párhuzamosan olvas (egy 30 fős csoport több tucat
 * beadása se legyen lassú); a feladat címét feladatonként egyszer. `hibakkal: false` – a listához
 * nem kell az AI-értékelés (csak a pontszázalék).
 */
async function fejlodesPontok(firestore, uid, beadasDokumentumok, { hibakkal = true } = {}) {
  const sajat = beadasDokumentumok.filter((d) => d.data().tanar_id === uid);
  const feladatIdk = [...new Set(sajat.map((d) => d.data().feladat_id).filter(Boolean))];
  const cimek = new Map(await Promise.all(feladatIdk.map(async (id) =>
    [id, (await firestore.collection("feladatok").doc(id).get()).data()?.cim || null])));
  const pontok = await Promise.all(sajat.map(async (d) => {
    const beadas = d.data();
    const [tanari, ai] = await Promise.all([
      d.ref.collection("ertekeles").doc("tanari").get(),
      hibakkal ? d.ref.collection("ertekeles").doc("ai").get() : null
    ]);
    const pont = fejlodes.idovonalPont({
      beadas, tanari: tanari.data(), ai: ai?.data(), feladatCim: cimek.get(beadas.feladat_id)
    });
    return pont && { ...pont, diak_id: beadas.csoport_diak_id || null };
  }));
  return fejlodes.idovonalRendezes(pontok);
}

const csoportJovahagyottBeadasai = (firestore, uid, csoportId) => firestore.collection("beadasok")
  .where("tanar_id", "==", uid).where("csoport_id", "==", csoportId).where("statusz", "==", "elkuldve");

/** A csoport diákjai: név, jóváhagyott beadások száma, utolsó pontszázalék, trend. */
async function csoportFejlodesListaLogika(firestore, uid, adat, beallitasok = BEALLITASOK) {
  await fejlodesKapu(firestore, uid, beallitasok);
  const csRef = await sajatCsoportRef(firestore, uid, adat?.csoportId);
  const [diakok, beadasok] = await Promise.all([
    csRef.collection("diakok").get(),
    csoportJovahagyottBeadasai(firestore, uid, csRef.id).get()
  ]);
  const pontok = await fejlodesPontok(firestore, uid, beadasok.docs, { hibakkal: false });
  const diakonkent = new Map();
  for (const p of pontok) {
    if (!diakonkent.has(p.diak_id)) diakonkent.set(p.diak_id, []);
    diakonkent.get(p.diak_id).push(p);
  }
  return { diakok: fejlodes.diakLista(diakok.docs.map((d) => ({ id: d.id, nev: d.data().nev })), diakonkent) };
}

/** Egy diák idővonala a csoportban: pontszázalék és hibák feladatról feladatra, ismétlődő hibák. */
async function csoportFejlodesDiakLogika(firestore, uid, adat, beallitasok = BEALLITASOK) {
  await fejlodesKapu(firestore, uid, beallitasok);
  const csRef = await sajatCsoportRef(firestore, uid, adat?.csoportId);
  const diakId = adat?.diakId;
  if (typeof diakId !== "string" || !AZONOSITO_MINTA.test(diakId)) throw hiba("invalid-argument", "csoport_diak_nincs");
  const diakSnap = await csRef.collection("diakok").doc(diakId).get();
  if (!diakSnap.exists) throw hiba("not-found", "csoport_diak_nincs");
  const beadasok = await csoportJovahagyottBeadasai(firestore, uid, csRef.id).where("csoport_diak_id", "==", diakId).get();
  const pontok = await fejlodesPontok(firestore, uid, beadasok.docs);
  return {
    nev: String(diakSnap.data().nev || ""),
    ...fejlodes.diakNezet(pontok.map(({ diak_id, ...pont }) => pont))
  };
}

exports.csoportFejlodesLista = onCall(HIVAS_OPCIOK, async (request) => {
  return csoportFejlodesListaLogika(db(), tanar(request), request.data);
});

exports.csoportFejlodesDiak = onCall(HIVAS_OPCIOK, async (request) => {
  return csoportFejlodesDiakLogika(db(), tanar(request), request.data);
});

Object.assign(exports._teszt, { fejlodesKapu, csoportFejlodesListaLogika, csoportFejlodesDiakLogika });

// ══════════════════════════════════════════════════════
// 14. ÉRTÉKELÉS INDÍTÁSA (tanár) – sorba állítás és háttérfeldolgozás
//
// A tanár egy gombbal indítja az értékelést egy feladat (vagy az összes, vagy a kijelölt)
// beadott szövegére. A hívás NEM várja meg az AI-t: a beadásokat "sorban" állapotba teszi,
// és azonnal visszatér (egy 60 fős link sem fut ki az időkorlátból, és a böngészőt sem kell
// nyitva tartani). A sort egy Firestore-trigger dolgozza fel, legfeljebb 5 példányban
// egyszerre. A trigger CSAK a tanár sorba állítására indul (a "sorban" állapotba lépésre) –
// a diák beadása (statusz: "feltoltve") nem indít AI-t (docs/prod-atalakitas-terv.md, 9.).
//
// A keret: a sorba állításkor a maradék keretig állítunk sorba (a többi "feltoltve" marad, a
// tanár látja, hány maradt ki). Ha a feldolgozáskor mégis elfogy (pl. közben más is fogyasztott),
// a beadás visszakerül "feltoltve" állapotba a keret-üzenettel – nem esik hibára.
// ══════════════════════════════════════════════════════

const ERTEKELES_LISTA_MAX = 100;

/** Sorba állítható-e: beadott, vagy már sorban van, de a sorba állítás elakadt (lejárt). */
function sorbaAllithato(adat, most = Date.now()) {
  if (!adat) return false;
  if (adat.statusz === "feltoltve") return true;
  if (adat.statusz !== "sorban") return false;
  const t = adat.sorba_allitva?.toMillis?.() ?? adat.frissitve?.toMillis?.();
  return !t || most - t > FOGLALAS_LEJARAT_MS;
}

/** A trigger akkor dolgoz fel, ha a beadás most került sorba (vagy újra sorba állították). */
function sorIndul(elotte, utana) {
  if (utana?.statusz !== "sorban") return false;
  if (elotte?.statusz !== "sorban") return true;
  const ido = (x) => x?.sorba_allitva?.toMillis?.() ?? null;
  return ido(elotte) !== ido(utana);
}

/**
 * Sorba állítás. `adat`: { feladatId? } – egy feladat beadottjai (nélküle a tanár összes beadottja),
 * vagy { beadasIds: [...] } – a kijelöltek. Csak a hívó tanár beadásai, csak a sorba állíthatók.
 * @returns {{inditva: number, kimaradt: number, kimaradt_ok: "kvota" | null}}
 */
async function ertekelesInditasLogika(firestore, uid, adat, { beallitasok = BEALLITASOK, most = Date.now() } = {}) {
  let jeloltek;
  if (adat?.beadasIds !== undefined) {
    const ids = adat.beadasIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > ERTEKELES_LISTA_MAX
        || !ids.every((x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x))) {
      throw hiba("invalid-argument", "ertekeles_lista_hibas");
    }
    const snapok = await firestore.getAll(...[...new Set(ids)].map((id) => firestore.collection("beadasok").doc(id)));
    jeloltek = snapok.filter((d) => d.exists);
  } else {
    let q = firestore.collection("beadasok").where("tanar_id", "==", uid).where("statusz", "in", ["feltoltve", "sorban"]);
    if (adat?.feladatId !== undefined) {
      if (typeof adat.feladatId !== "string" || !adat.feladatId) throw hiba("invalid-argument", "feladat_id_kell");
      q = q.where("feladat_id", "==", adat.feladatId);
    }
    jeloltek = (await q.get()).docs;
  }

  const sorbaValok = jeloltek
    .filter((d) => d.data().tanar_id === uid && sorbaAllithato(d.data(), most))
    .sort((a, b) => (a.data().letrehozva?.toMillis?.() ?? 0) - (b.data().letrehozva?.toMillis?.() ?? 0));

  // A maradék keretig (kvótás környezetben; a pilotban nincs korlát).
  let kfer = sorbaValok.length;
  if (beallitasok.kvota) {
    const k = await kvotaAllapotLogika(firestore, uid, beallitasok, new Date(most));
    if (k.limit !== null && k.limit !== undefined) {
      const egyseg = kvota.EGYSEG_KOLTSEG.beadas;
      kfer = Math.max(0, Math.min(kfer, Math.floor((k.limit - k.hasznalt) / egyseg)));
    }
  }
  const inditando = sorbaValok.slice(0, kfer);

  for (let i = 0; i < inditando.length; i += 400) {
    const batch = firestore.batch();
    for (const d of inditando.slice(i, i + 400)) {
      batch.update(d.ref, {
        statusz: "sorban",
        sorba_allitva: FieldValue.serverTimestamp(),
        hiba: null, hiba_kod: null, hiba_adat: null,
        frissitve: FieldValue.serverTimestamp()
      });
    }
    await batch.commit();
  }

  const kimaradt = sorbaValok.length - inditando.length;
  logger.info("Értékelés sorba állítva", { tanar: uid, inditva: inditando.length, kimaradt });
  return { inditva: inditando.length, kimaradt, kimaradt_ok: kimaradt > 0 ? "kvota" : null };
}

/** Egy sorban lévő beadás feldolgozása (a trigger hívja; a tesztek közvetlenül). */
async function sorFeldolgozas(beadasId) {
  try {
    return await feldolgozBeadas(beadasId, { csakSorban: true });
  } catch (e) {
    const kod = String(e.details?.kod || "");
    if (kod.startsWith("kvota_elfogyott")) {
      // Elfogyott a keret: vissza a beadottak közé, az üzenettel – a tanár később újraindíthatja.
      const ref = db().collection("beadasok").doc(beadasId);
      await db().runTransaction(async (tx) => {
        const adat = (await tx.get(ref)).data();
        if (adat?.statusz !== "sorban") return;
        tx.update(ref, {
          statusz: "feltoltve", hiba: e.message, hiba_kod: kod, hiba_adat: e.details || null,
          frissitve: FieldValue.serverTimestamp()
        });
      }).catch((m) => logger.error("A sor visszaállítása nem sikerült", { beadasId, hiba: m.message }));
      return { kvota: true };
    }
    await hibaraAllit(beadasId, e, e.futasId);
    return { hiba: true };
  }
}

exports.ertekelesInditas = onCall(HIVAS_OPCIOK, async (request) => {
  return ertekelesInditasLogika(db(), tanar(request), request.data);
});

// A sor feldolgozója. retry: false – egy elhasalt AI-hívást nem ismételgetünk (fizetős); a
// tanár újraindíthatja. concurrency: 1 és maxInstances: 5 – legfeljebb 5 AI-hívás egyszerre.
exports.ertekelesSor = onDocumentUpdated(
  {
    document: "beadasok/{beadasId}",
    region: REGION,
    secrets: AI_TITKOK,
    timeoutSeconds: 540,
    memory: "1GiB",
    retry: false,
    concurrency: 1,
    maxInstances: 5
  },
  async (event) => {
    if (!sorIndul(event.data?.before?.data(), event.data?.after?.data())) return;
    await sorFeldolgozas(event.params.beadasId);
  }
);

Object.assign(exports._teszt, { sorbaAllithato, sorIndul, ertekelesInditasLogika, sorFeldolgozas, ERTEKELES_LISTA_MAX });

// ══════════════════════════════════════════════════════
// 15. A DIÁK VISSZAJELZÉSE (belépés nélkül, a diáklinken)
//
// A diák a beadáskor kapott saját tokenjével (visszajelzes.html?d=…) nézi meg a tanár által
// JÓVÁHAGYOTT visszajelzést. A beadás azonosítója a token lenyomata, így a token más beadást
// nem nyithat meg. Az AI nyers értékelése és az írás közbeni jelzések soha nem mennek ki:
// csak a tanári visszajelzés (ertekeles/tanari) mezői, kifejezett listával. AI-t nem hív.
// ══════════════════════════════════════════════════════

const ms = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : null);
const isoIdo = (v) => (ms(v) ? new Date(ms(v)).toISOString() : null);

async function diakVisszajelzesLogika(firestore, adat, { most = Date.now() } = {}) {
  const token = adat?.token;
  if (!feladatlink.tokenErvenyes(token)) throw hiba("invalid-argument", "diaklink_ervenytelen");
  const ref = firestore.collection("beadasok").doc(feladatlink.tokenHash(token));
  const snap = await ref.get();
  // Csak a feladatlinken született beadásnak van diáklinkje.
  if (!snap.exists || !snap.data().link_id) throw hiba("not-found", "diaklink_ervenytelen");
  const b = snap.data();
  const lejar = ms(b.diaklink_lejar);
  if (!lejar || most > lejar) return { allapot: "lejart" };

  const feladatSnap = await firestore.collection("feladatok").doc(b.feladat_id).get();
  const alap = {
    cim: String(feladatSnap.data()?.cim || ""),
    becenev: String(b.becenev || ""),
    beadva: isoIdo(b.letrehozva),
    lejar: new Date(lejar).toISOString()
  };
  // Amíg a tanár nem hagyta jóvá, a diák semmit nem lát (azt sem, hogy fut-e az értékelés).
  if (b.statusz !== "elkuldve") return { allapot: "varakozik", ...alap };
  const tanari = (await ref.collection("ertekeles").doc("tanari").get()).data();
  if (!tanari) return { allapot: "varakozik", ...alap };

  const szam = (v) => (Number.isFinite(v) ? v : null);
  return {
    allapot: "kesz",
    ...alap,
    szoveg: String(b.szoveg || ""),
    visszajelzes: {
      jegy: tanari.jegy ?? null,
      jegy_tipus: typeof tanari.jegy_tipus === "string" ? tanari.jegy_tipus : null,
      szoveg: String(tanari.szoveg || ""),
      szempontok: (Array.isArray(tanari.szempontok) ? tanari.szempontok : []).map((sz) => ({
        cim: String(sz?.cim || sz?.kulcs || ""),
        pont: szam(sz?.pont),
        max: szam(sz?.max),
        megjegyzes: String(sz?.megjegyzes || "")
      })),
      osszpontszam: szam(tanari.osszpontszam),
      max_pontszam: szam(tanari.max_pontszam),
      szazalek: szam(tanari.szazalek),
      jovahagyva: isoIdo(tanari.jovahagyva_at)
    }
  };
}

// Belépés nélkül hívható: a diák saját tokenje a jogosultság.
exports.diakVisszajelzes = onCall(HIVAS_OPCIOK, async (request) => diakVisszajelzesLogika(db(), request.data));

// ── Időzített takarítás (naponta) ──
// 1. A lejárt feladatlinkek becenév-foglalásai (a lejárat után 1 nappal): már semmire nem kellenek.
//    A lekérdezés a lejárat utáni 30 napot nézi, így néhány kimaradt futást is pótol.
// 2. A megőrzési időnél (12 hónap) régebbi beadások az értékelésekkel együtt, és az ennél régebben
//    lejárt linkek. Futásonként legfeljebb TAKARITAS_MAX dokumentum: a maradék másnap következik.
const NAP_MS = 24 * 60 * 60 * 1000;
const MEGORZES_MS = 365 * NAP_MS;
const TAKARITAS_MAX = 300;

async function takaritasLogika(firestore, { most = Date.now(), max = TAKARITAS_MAX } = {}) {
  const linkek = firestore.collection("linkek");
  const lejartLinkek = await linkek
    .where("lejar", "<", new Date(most - NAP_MS))
    .where("lejar", ">=", new Date(most - 30 * NAP_MS))
    .get();
  for (const l of lejartLinkek.docs) await firestore.recursiveDelete(l.ref.collection("becenevek"));

  const regiBeadasok = await firestore.collection("beadasok")
    .where("letrehozva", "<", new Date(most - MEGORZES_MS)).limit(max).get();
  for (const d of regiBeadasok.docs) await firestore.recursiveDelete(d.ref);

  const regiLinkek = await linkek.where("lejar", "<", new Date(most - MEGORZES_MS)).limit(max).get();
  for (const d of regiLinkek.docs) await firestore.recursiveDelete(d.ref);

  // 3. A csoportok diákjai, akiknek az utolsó beadása is régebbi a megőrzési időnél (a beadásaik már
  //    törlődtek): a diák és a rá mutató becenév-hozzárendelések. A csoport maga megmarad.
  const regiDiakok = await firestore.collectionGroup("diakok")
    .where("utolso_beadas", "<", new Date(most - MEGORZES_MS)).limit(max).get();
  for (const d of regiDiakok.docs) {
    const csRef = d.ref.parent.parent;
    if (!csRef || csRef.parent.id !== "csoportok") continue;
    await firestore.runTransaction(async (tx) => {
      const friss = await tx.get(d.ref);
      if (!friss.exists || ms(friss.data().utolso_beadas) >= most - MEGORZES_MS) return; // közben új beadás jött
      const aliasRefek = (friss.data().becenevek || []).map((k) => csRef.collection("becenevek").doc(k));
      const aliasok = aliasRefek.length ? await tx.getAll(...aliasRefek) : [];
      for (const a of aliasok) if (a.exists && a.data().diak_id === d.id) tx.delete(a.ref);
      tx.delete(d.ref);
    });
  }

  const eredmeny = { becenev_linkek: lejartLinkek.size, beadasok: regiBeadasok.size, linkek: regiLinkek.size, csoport_diakok: regiDiakok.size };
  logger.info("Takarítás", eredmeny);
  return eredmeny;
}

exports.takaritas = onSchedule(
  { schedule: "every day 03:30", timeZone: "Europe/Budapest", region: REGION, timeoutSeconds: 540 },
  async () => { await takaritasLogika(db()); }
);

Object.assign(exports._teszt, { diakVisszajelzesLogika, takaritasLogika, MEGORZES_MS });
