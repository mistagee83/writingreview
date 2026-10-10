// ══════════════════════════════════════════════════════
// Stripe-előfizetés → tanári csomag – a tiszta (adatbázis és hálózat nélküli) rész
//
// A Stripe a webhookon át szól az előfizetés változásairól; ebből a SZERVER állítja a
// tanár csomagját (tanarok/{uid}.csomag). A kliens csak fizetést kezdeményez, jogot
// soha nem kap. Az alkalmazás a functions/index.js stripeEsemenyFeldolgozas-ban van
// (tranzakció, idempotencia); ez a fájl csak azt dönti el, MIT jelent egy esemény.
//
// Szabályok:
//  - aktív vagy próbaidős előfizetés → a csomagja az ára szerint (`alap` vagy `profi`); fizetési hiba (past_due) alatt marad az
//    `alap` (a Stripe újrapróbálja a terhelést); lemondott, nem fizetett, megszűnt → `ingyenes`
//  - az admin által kézzel adott csomagot (csomag_forras: "admin") a Stripe SOSEM írja át
//  - nem ismert árú előfizetést figyelmen kívül hagyunk (nem a mi termékünk)
//  - a régebbi esemény nem írhatja felül az újabb állapotot (a Stripe nem garantál sorrendet)
//
// Lásd docs/kornyezetek-terv.md 5.1.
// ══════════════════════════════════════════════════════

/** A fizetős csomagok, a nagyobb elöl (ha egy előfizetésben több ár is lenne, a nagyobb nyer). */
const FIZETOS_CSOMAGOK = ["profi", "alap"];

/** A beállításokból a nem üres árazonosítók csomagonként: {alap: "price_...", profi: "price_..."}. */
function arak(beallitasok) {
  const ki = {};
  if (beallitasok?.fizetesArAlap) ki.alap = beallitasok.fizetesArAlap;
  if (beallitasok?.fizetesArProfi) ki.profi = beallitasok.fizetesArProfi;
  return ki;
}

/** Melyik csomag az előfizetésé (az ára alapján); null, ha egyik árunk sem. */
function csomagArbol(sub, arakMap) {
  const azonositok = arAzonositok(sub);
  return FIZETOS_CSOMAGOK.find((nev) => arakMap?.[nev] && azonositok.includes(arakMap[nev])) || null;
}

/** Ezekben az állapotokban jár a fizetős csomag. */
const JAR = new Set(["active", "trialing", "past_due"]);
/** Ezekben az állapotokban megszűnik (visszaesik az ingyenesre). */
const MEGSZUNT = new Set(["canceled", "unpaid", "incomplete_expired", "paused"]);

/** Az esemény tanár-azonosítója, ha az esemény hordozza; különben az ügyfél azonosítója a kereséshez. */
function azonositok(esemeny) {
  const o = esemeny?.data?.object || {};
  const tipus = esemeny?.type || "";
  let ugyfel = typeof o.customer === "string" ? o.customer : o.customer?.id || null;
  let uid = null;
  if (tipus === "checkout.session.completed") {
    uid = o.client_reference_id || o.metadata?.uid || null;
  } else if (tipus.startsWith("customer.subscription.")) {
    uid = o.metadata?.uid || null;
  }
  if (typeof uid !== "string" || !uid) uid = null;
  return { uid, ugyfel };
}

/** Az előfizetés egy elemének árazonosítója (régi és új API-alak). */
function arAzonositok(sub) {
  const elemek = sub?.items?.data || [];
  return elemek.map((e) => e?.price?.id || e?.plan?.id).filter(Boolean);
}

/**
 * A számlázási időszak vége (másodperc). Az újabb API-verziókban az előfizetés
 * ELEMÉN van, a régebbiben az előfizetésen – mindkettőt kezeljük.
 */
function periodusVege(sub) {
  const elemek = (sub?.items?.data || []).map((e) => e?.current_period_end).filter(Number.isFinite);
  if (elemek.length) return Math.max(...elemek);
  return Number.isFinite(sub?.current_period_end) ? sub.current_period_end : null;
}

/**
 * Mit jelent az esemény a tanár dokumentumára nézve?
 * @param {object} esemeny a Stripe-esemény (aláírás-ellenőrzés UTÁN)
 * @param {{tanar: object|null, arAlap: string}} ctx a tanár jelenlegi dokumentuma, és a mi termékünk árazonosítója
 * @returns {{kihagy: string}|{mezok: object, csomagValtozas: boolean, ugyfel_id?: string}}
 */
function esemenyHatas(esemeny, { tanar = null, arak: arakMap = null, arAlap = "" } = {}) {
  // `arak`: {alap, profi}; a régi `arAlap` paraméter a tesztek és a visszafelé kompatibilitás miatt marad
  const arakEsemenyhez = arakMap || (arAlap ? { alap: arAlap } : {});
  const tipus = esemeny?.type;
  const o = esemeny?.data?.object || {};

  // ── a fizetés befejezése: csak összekötjük a tanárt a Stripe-ügyféllel ──
  if (tipus === "checkout.session.completed") {
    if (o.mode !== "subscription") return { kihagy: "nem_elofizetes" };
    const ugyfel = typeof o.customer === "string" ? o.customer : o.customer?.id;
    const elo = typeof o.subscription === "string" ? o.subscription : o.subscription?.id;
    if (!ugyfel) return { kihagy: "nincs_ugyfel" };
    return {
      mezok: { elofizetes: { stripe_ugyfel_id: ugyfel, ...(elo ? { stripe_elofizetes_id: elo } : {}) } },
      csomagValtozas: false,
      ugyfel_id: ugyfel
    };
  }

  if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(tipus)) {
    return { kihagy: "nem_kezelt_tipus" };
  }

  // ── előfizetés-változás ──
  const fizetosCsomag = csomagArbol(o, arakEsemenyhez);
  if (!fizetosCsomag) return { kihagy: "ismeretlen_ar" };

  const elozoIdo = tanar?.elofizetes?.esemeny_ido;
  if (Number.isFinite(elozoIdo) && Number.isFinite(esemeny.created) && esemeny.created < elozoIdo) {
    return { kihagy: "regebbi_esemeny" };
  }

  const statusz = tipus === "customer.subscription.deleted" ? "canceled" : String(o.status || "");
  const ugyfel = typeof o.customer === "string" ? o.customer : o.customer?.id;
  const elofizetes = {
    ...(ugyfel ? { stripe_ugyfel_id: ugyfel } : {}),
    ...(o.id ? { stripe_elofizetes_id: o.id } : {}),
    statusz,
    periodus_vege: periodusVege(o),
    // a lemondás időpontra szól ("cancel_at") vagy az időszak végére; mindkettő "lemondva"
    lemondva: Boolean(o.cancel_at_period_end) || (Number.isFinite(o.cancel_at) && o.cancel_at !== null),
    ...(Number.isFinite(esemeny.created) ? { esemeny_ido: esemeny.created } : {})
  };

  // Az admin által adott csomagot nem bántjuk, csak az előfizetés adatait tároljuk.
  if (tanar?.csomag_forras === "admin") {
    return { mezok: { elofizetes }, csomagValtozas: false, ugyfel_id: ugyfel };
  }

  let csomag = null;
  if (JAR.has(statusz)) csomag = fizetosCsomag;
  else if (MEGSZUNT.has(statusz)) csomag = "ingyenes";
  // "incomplete" (az első fizetés még nem ment át): még nem ad csomagot, de el sem vesz

  if (csomag === null) return { mezok: { elofizetes }, csomagValtozas: false, ugyfel_id: ugyfel };
  return {
    mezok: { csomag, csomag_forras: "stripe", elofizetes },
    csomagValtozas: tanar?.csomag !== csomag,
    ugyfel_id: ugyfel
  };
}

/** Az UI-nak megjelenített előfizetés-állapot (csak a szükséges, biztonságos mezők). */
function elofizetesNezet(tanar) {
  const e = tanar?.elofizetes;
  if (!e || typeof e !== "object") return null;
  return {
    statusz: typeof e.statusz === "string" ? e.statusz : null,
    periodus_vege: Number.isFinite(e.periodus_vege) ? e.periodus_vege : null,
    lemondva: e.lemondva === true,
    van_ugyfel: typeof e.stripe_ugyfel_id === "string" && e.stripe_ugyfel_id.length > 0
  };
}

module.exports = { JAR, MEGSZUNT, FIZETOS_CSOMAGOK, arak, csomagArbol, azonositok, arAzonositok, periodusVege, esemenyHatas, elofizetesNezet };
