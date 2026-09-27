// ══════════════════════════════════════════════════════
// WritingReview – service worker
//
// Ez a fájl a gyökérben van és NEM kap tartalom-hasht (a build csak a
// css/ és js/ könyvtárban hashel) – a böngésző ugyanis fix URL-en
// keresi: /sw.js.
//
// MIT AKARUNK ÉS MIT NEM
//
// Az app hálózat nélkül nem tud működni: a bejelentkezés, a Firestore,
// a képfeltöltés és a Gemini mind online. Ezért itt NINCS offline
// beadás és nincs szinkronizálás – az hamis ígéret lenne. Amit adunk:
//   - telepíthető alkalmazás (ehhez kell egy fetch-kezelő),
//   - azonnali indulás, mert a hashelt CSS/JS a gyorsítótárból jön,
//   - érthető offline lap a néma hiba helyett.
//
// AMIÉRT A GYORSÍTÓTÁRAZÁS ITT BIZTONSÁGOS
//
// A CSS és JS fájlnevében benne van a tartalom hash-e (app.1c45879d.css),
// tehát egy fájl tartalma SOHA nem változik a saját URL-jén. Ezeket
// örökre lehet cache-elni. A HTML viszont fix nevű, ezért az MINDIG
// hálózatról jön elsőre – így egy új telepítés azonnal életbe lép.
//
// KIKAPCSOLÁS, ha valaha kell: tegyél ide egy olyan sw.js-t, ami csak
// `self.registration.unregister()`-t hív. A böngésző minden
// oldalbetöltésnél újraellenőrzi ezt a fájlt (no-cache fejléccel
// szolgáljuk ki), tehát a visszavonás kimegy a felhasználókhoz.
// ══════════════════════════════════════════════════════

const VALTOZAT = "v1";
const ESZKOZ_TAR = `wr-eszkoz-${VALTOZAT}`;   // hashelt css/js – örök
const LAP_TAR = `wr-lap-${VALTOZAT}`;          // HTML – csak tartalék
const OFFLINE_LAP = "/offline.html";

const SAJAT_TARAK = [ESZKOZ_TAR, LAP_TAR];

// ══════════════════════════════════════════
// TELEPÍTÉS
// ══════════════════════════════════════════

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const tar = await caches.open(LAP_TAR);
    // Csak az offline lapot tesszük el előre. A többi menet közben
    // kerül be – nincs generált előtöltési lista, amit elfelejthetnénk
    // frissíteni, és nem is töltünk le olyat, amit a tanár sosem nyit meg.
    await tar.add(new Request(OFFLINE_LAP, { cache: "reload" }));
    // Ne várjunk a régi worker kihalására: a hashelt fájlnevek miatt a
    // régi és az új lapok is megkapják a saját eszközeiket.
    await self.skipWaiting();
  })());
});

// ══════════════════════════════════════════
// AKTIVÁLÁS – régi gyorsítótárak törlése
// ══════════════════════════════════════════

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const nev of await caches.keys()) {
      if (nev.startsWith("wr-") && !SAJAT_TARAK.includes(nev)) {
        await caches.delete(nev);
      }
    }
    await self.clients.claim();
  })());
});

// ══════════════════════════════════════════
// KÉRÉSEK
// ══════════════════════════════════════════

/**
 * Amihez NEM nyúlunk hozzá. Fontos, hogy ez a lista teljes legyen:
 * a Firestore és az Auth saját folyamokat és hosszú kéréseket használ,
 * egy félreértelmezett válasz ott néma hibát okoz.
 */
function kimarad(kures, url) {
  if (kures.method !== "GET") return true;
  // Minden idegen eredet: Firebase SDK (gstatic), Firestore, Auth,
  // Storage, Google Fonts. Ezeket a böngésző kezeli.
  if (url.origin !== self.location.origin) return true;
  // A Firebase Hosting fenntartott útvonalai
  if (url.pathname.startsWith("/__/")) return true;
  return false;
}

/** Hashelt eszköz-e (css/ vagy js/ könyvtár). */
const hashelt = (url) => /^\/(css|js)\//.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (kimarad(e.request, url)) return;

  if (e.request.mode === "navigate") {
    e.respondWith(lapKeres(e.request));
  } else if (hashelt(url)) {
    e.respondWith(eszkozKeres(e.request));
  } else {
    e.respondWith(halozatElsore(e.request, LAP_TAR));
  }
});

/**
 * HTML: mindig hálózatról elsőre, hogy egy új telepítés azonnal
 * életbe lépjen. Offline esetén a korábban látott lap, végső esetben
 * az offline lap.
 */
async function lapKeres(kures) {
  const tar = await caches.open(LAP_TAR);
  try {
    const valasz = await fetch(kures);
    if (valasz && valasz.ok) tar.put(kures, valasz.clone());
    return valasz;
  } catch {
    return (await tar.match(kures))
      || (await tar.match(OFFLINE_LAP))
      || new Response("Nincs kapcsolat.", { status: 503 });
  }
}

/**
 * Hashelt eszköz: a gyorsítótárból, és csak akkor a hálózatról, ha még
 * nincs meg. A tartalma az URL-jén sosem változik, tehát nem kell
 * frissíteni.
 */
async function eszkozKeres(kures) {
  const tar = await caches.open(ESZKOZ_TAR);
  const meglevo = await tar.match(kures);
  if (meglevo) return meglevo;

  const valasz = await fetch(kures);
  if (valasz && valasz.ok) tar.put(kures, valasz.clone());
  return valasz;
}

/** Minden más saját fájl (ikonok, manifest): hálózat, aztán tartalék. */
async function halozatElsore(kures, tarNev) {
  const tar = await caches.open(tarNev);
  try {
    const valasz = await fetch(kures);
    if (valasz && valasz.ok) tar.put(kures, valasz.clone());
    return valasz;
  } catch {
    const meglevo = await tar.match(kures);
    if (meglevo) return meglevo;
    throw new Error("nincs kapcsolat és nincs gyorsítótárazott válasz");
  }
}
