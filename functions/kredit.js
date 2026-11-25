// ══════════════════════════════════════════════════════
// Hub-kreditek a Writing Review-ban (4d, 2026-11-17)
//
// A régi tanáronkénti kvóta (kvota.js, tanarok/{uid}.csomag) helyett a hub közös kreditjei:
// minden AI-művelet a settings/credits.prices["writing-review/<akció>"] árát vonja le a tanár
// users/{uid}.credits egyenlegéből, a Gemini-hívás ELŐTT, tranzakcióban; hibánál visszaír.
// A naplósor (creditLedger) alakja azonos a hub functions/credits-store.js-ével
// (a hub /account oldala ebből mutatja a történetet).
//
// A nem-AI fizetős funkciók (osztályelemzés, fejlődéskövetés, színválasztás, érettségi feladattár) a Hub passhoz
// kötöttek: users/{uid}.entitlements["writing-review"] vagy .all aktív.
//
// A számítás a hub shared/credits.js és shared/entitlements.js másolatában van (functions/hub/,
// frissítés: node scripts/hub-masolat.mjs); ESM, ezért dinamikus import()-tal töltjük be.
// A users és a creditLedger kliensről nem írható (a hub firestore.rules-a).
// ══════════════════════════════════════════════════════
const { createHash } = require("node:crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const APP = "writing-review";

/** A WR belső műveletnevei → az árlista akciói (settings/credits.prices["writing-review/<akció>"]). */
const AKCIOK = Object.freeze({
  beadas: "check",       // egy dolgozat javítása (új beadás vagy újrafuttatás)
  feladatlap: "rubric",  // feladatlap → értékelési szempontok javaslata
  elemzes: "analysis"    // osztályszintű elemzés egy feladatra
});

/** A Hub passhoz kötött (nem AI-) funkciók. */
const HUB_PASS_FUNKCIOK = Object.freeze(["osztaly_elemzes", "fejlodes", "szinvalasztas", "erettsegi_tar"]);

// Egy osztály beadásai egyszerre érkeznek, mind ugyanarra a users-dokumentumra: az alapértelmezett
// 5 újrapróbálás ütközésnél kevés (a beadás hibaállapotba kerülne, pedig lenne kredit).
const TRANZAKCIO = { maxAttempts: 30 };

let modulok = null;
/** A hub tiszta moduljai (ESM) – egyszer töltjük be. */
function hub() {
  modulok ??= Promise.all([import("./hub/credits.mjs"), import("./hub/entitlements.mjs")])
    .then(([credits, entitlements]) => ({ ...credits, ...entitlements }));
  return modulok;
}

class KreditHiba extends Error {
  constructor(kod, adat = {}) {
    super(kod);
    this.kod = kod;
    this.adat = adat;
  }
}

const IDO_MEZOK = ["includedExpiresAt", "purchasedExpiresAt", "signupBonusAt"];
function firestoreMezok(fields) {
  const ki = { ...fields };
  for (const k of IDO_MEZOK) if (typeof ki[k] === "number") ki[k] = Timestamp.fromMillis(ki[k]);
  return ki;
}

/** A credits-mezők és a naplósor(ok) írása egy futó tranzakcióban (a hub writeCredits-ének mása). */
function kreditIras(tx, firestore, uid, terv, meta, naploId) {
  // Üres map merge-dzsel az EGÉSZ credits-mezőt felülírná (pl. a korlátlan fiók elveszítené az unlimited-et),
  // ezért csak akkor írunk, ha van változó mező.
  const mezok = firestoreMezok(terv.fields);
  if (Object.keys(mezok).length) tx.set(firestore.collection("users").doc(uid), { credits: mezok }, { merge: true });
  const naplo = firestore.collection("creditLedger");
  const lejart = (terv.expired?.included ?? 0) + (terv.expired?.purchased ?? 0);
  if (lejart > 0) {
    tx.set(naplo.doc(`${naploId}-expire`), {
      uid, delta: -lejart,
      split: { included: -(terv.expired.included ?? 0), purchased: -(terv.expired.purchased ?? 0) },
      reason: "expire", app: null, action: null, ref: naploId, balanceAfter: null,
      createdAt: FieldValue.serverTimestamp()
    });
  }
  const delta = (terv.split?.included ?? 0) + (terv.split?.purchased ?? 0);
  tx.set(naplo.doc(naploId), {
    uid, delta, split: terv.split, reason: meta.reason, app: meta.app === undefined ? APP : meta.app, action: meta.action ?? null,
    ref: meta.ref ?? null, balanceAfter: terv.balanceAfter, createdAt: FieldValue.serverTimestamp()
  });
}

async function arlista(tx, firestore) {
  const snap = await (tx ? tx.get(firestore.doc("settings/credits")) : firestore.doc("settings/credits").get());
  return (snap.exists ? snap.data()?.prices : null) || {};
}

/**
 * Levonás egy AI-művelet ELŐTT.
 * @returns {Promise<{naploId: string, ar: number, egyenleg: number}>}
 * @throws KreditHiba: "ar_hianyzik" (nincs az árlistán), "elfogyott" ({egyenleg, ar})
 */
async function levonas(firestore, uid, muvelet, ref = null) {
  const akcio = AKCIOK[muvelet];
  if (!akcio) throw new Error(`Ismeretlen AI-művelet a kreditben: ${muvelet}`);
  const { costFor, planSpend } = await hub();
  const naploRef = firestore.collection("creditLedger").doc();
  return firestore.runTransaction(async (tx) => {
    const ar = costFor(await arlista(tx, firestore), APP, akcio);
    if (ar == null) throw new KreditHiba("ar_hianyzik", { akcio });
    const user = (await tx.get(firestore.collection("users").doc(uid))).data() ?? {};
    const terv = planSpend(user.credits, ar);
    if (!terv.ok) throw new KreditHiba("elfogyott", { egyenleg: terv.balance ?? 0, ar });
    kreditIras(tx, firestore, uid, terv, { reason: "spend", action: akcio, ref }, naploRef.id);
    return { naploId: naploRef.id, ar, egyenleg: terv.balanceAfter };
  }, TRANZAKCIO);
}

/** Visszaírás egy sikertelen (vagy kihagyott) művelet után; idempotens (`<naploId>-refund`). */
async function visszairas(firestore, naploId) {
  const { planRefund } = await hub();
  const levonasRef = firestore.collection("creditLedger").doc(naploId);
  const visszaId = `${naploId}-refund`;
  return firestore.runTransaction(async (tx) => {
    const [l, kesz] = await Promise.all([tx.get(levonasRef), tx.get(firestore.collection("creditLedger").doc(visszaId))]);
    if (!l.exists || l.get("reason") !== "spend") return { kihagyva: "nincs_levonas" };
    if (kesz.exists) return { kihagyva: "mar_visszairva" };
    const { uid, split, action } = l.data();
    const user = (await tx.get(firestore.collection("users").doc(uid))).data() ?? {};
    const terv = planRefund(user.credits, split);
    kreditIras(tx, firestore, uid, terv, { reason: "refund", action, ref: naploId }, visszaId);
    return { egyenleg: terv.balanceAfter };
  }, TRANZAKCIO);
}

/**
 * A tanár kreditállapota a felületnek: egyenleg vödrönként, a WR-műveletek ára, Hub pass.
 * Az árak null-ok, ha a művelet nincs az árlistán (akkor nem indítható).
 */
async function allapot(firestore, uid, most = Date.now()) {
  const { balance, costFor, hasAccess, toMillis } = await hub();
  const [userSnap, arak] = await Promise.all([firestore.collection("users").doc(uid).get(), arlista(null, firestore)]);
  const user = userSnap.data() ?? {};
  const b = balance(user.credits, most);
  return {
    egyenleg: b.total,
    korlatlan: b.unlimited === true,
    havi: b.included,
    havi_lejarat: toMillis(b.includedExpiresAt) ?? null,
    vasarolt: b.purchased,
    vasarolt_lejarat: toMillis(b.purchasedExpiresAt) ?? null,
    arak: Object.fromEntries(Object.entries(AKCIOK).map(([m, a]) => [m, costFor(arak, APP, a)])),
    hub_pass: hasAccess(user.entitlements, APP)
  };
}

/** Hány ilyen művelet fér még az egyenlegbe (null = korlátlan; 0, ha nincs ár). */
function hanyFer(all, muvelet) {
  if (all.korlatlan) return null;
  const ar = all.arak[muvelet];
  if (ar == null) return 0;
  if (ar <= 0) return null;
  return Math.floor(all.egyenleg / ar);
}

/**
 * Az ajándék e-mail-címenkénti jele: a normalizált cím SHA-256 lenyomata (signupBonuses/{kulcs}, csak szerver).
 * UGYANAZ a szabály, mint a hub functions/credits-store.js normalizeBonusEmail / bonusEmailKey függvénye
 * (kisbetű, a +utótag levágva, Gmailnél a pontok is) – ha ott változik, itt is változnia kell
 * (a tests/ajandek-email.test.mjs példái ugyanazok, mint a hub tests/refunds.test.mjs-ében).
 */
function ajandekEmailNormal(email) {
  const e = String(email ?? "").trim().toLowerCase();
  const kukac = e.lastIndexOf("@");
  if (kukac < 1) return "";
  let nev = e.slice(0, kukac).split("+")[0];
  let domain = e.slice(kukac + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") nev = nev.replace(/\./g, "");
  return nev ? `${nev}@${domain}` : "";
}
function ajandekEmailKulcs(email) {
  const n = ajandekEmailNormal(email);
  return n ? createHash("sha256").update(n).digest("hex") : null;
}

/**
 * A hub regisztrációs ajándéka (settings/credits.signupBonus / signupBonusDays) egy MEGERŐSÍTETT fióknak,
 * ha még nem kapta meg (2026-11-20). Ugyanaz, mint a hub createUserWithBonus(grant: true)-ja: a naplósor id-ja
 * `signup-<uid>`, és a signupBonusAt miatt kétszer nem jár. A hívó felel azért, hogy az e-mail megerősített.
 * @returns {Promise<{ajandek: number} | {kihagyva: string}>}
 */
async function ajandekJovairas(firestore, uid, { email = null, nev = null } = {}) {
  const { planSignup } = await hub();
  const userRef = firestore.collection("users").doc(uid);
  const kulcs = ajandekEmailKulcs(email);
  const kulcsRef = kulcs ? firestore.collection("signupBonuses").doc(kulcs) : null;
  return firestore.runTransaction(async (tx) => {
    const beall = await tx.get(firestore.doc("settings/credits"));
    const s = beall.exists ? beall.data() : {};
    const snap = await tx.get(userRef);
    const user = snap.data() ?? {};
    const terv = planSignup(user.credits, { amount: s.signupBonus ?? 10, days: s.signupBonusDays ?? 30 });
    if (!terv.ok) return { kihagyva: terv.reason };
    // E-mail-címenként egyszer (hub biztonsági audit 2026-11-22, K-4): ha ez a cím más uid-dal már kapott
    // ajándékot (a fiók törlése és újraregisztrálása, Gmail-alias), most nem jár.
    const foglalt = kulcsRef ? await tx.get(kulcsRef) : null;
    if (foglalt?.exists && foglalt.data()?.uid !== uid) return { kihagyva: "email_already_granted" };
    if (kulcsRef) tx.set(kulcsRef, { uid, grantedAt: FieldValue.serverTimestamp() });
    if (!snap.exists) {
      tx.set(userRef, { email, displayName: nev, entitlements: {}, createdAt: FieldValue.serverTimestamp() });
    }
    kreditIras(tx, firestore, uid, terv, { reason: "signup", app: null }, `signup-${uid}`);  // mint a hubé: app nélkül
    return { ajandek: terv.split.included };
  }, TRANZAKCIO);
}

/** Hub pass (a WR saját kulcsa vagy az `all`) aktív-e. */
async function hubPass(firestore, uid) {
  const { hasAccess } = await hub();
  const snap = await firestore.collection("users").doc(uid).get();
  return hasAccess(snap.data()?.entitlements, APP);
}

module.exports = {
  APP, AKCIOK, HUB_PASS_FUNKCIOK, KreditHiba, levonas, visszairas, allapot, hanyFer, hubPass, ajandekJovairas, hub,
  ajandekEmailNormal, ajandekEmailKulcs
};
