// Kreditek: users/{uid}.credits kiértékelése és módosításának kiszámítása (docs/spec-v1.md „Kreditek”).
// Tiszta logika, importok nélkül (mint az entitlements.js): a hub kliense, az appok kliense és a
// Cloud Functions (Node, ESM) ugyanezt a fájlt használja. Az appok repójába másolatként kerül;
// a forrás ez a fájl, változtatni csak itt szabad, utána a másolatokat frissíteni kell.
//
// A „plan*” függvények semmit nem írnak: a jelenlegi `credits` mapből kiszámolják az új mapet,
// a vödrönkénti változást (`split`) és a lusta lejárat miatt elvesző mennyiséget (`expired`).
// A tranzakciót és a naplósorokat (creditLedger) a hívó codebase írja a saját Admin SDK-jával.
//
// Vödrök: `included` (Hub pass havi kerete vagy regisztrációs ajándék, hamarabb jár le) és
// `purchased` (kreditcsomagok). Fogyás: előbb included, aztán purchased.
// Időpont: Firestore Timestamp, Date vagy ezredmásodperc – a kimenet mindig ezredmásodperc,
// a hívó alakítja vissza Timestampre.

export const BUCKETS = Object.freeze(['included', 'purchased']);
export const REASONS = Object.freeze(['spend', 'refund', 'subscription', 'purchase', 'signup', 'expire', 'admin']);

// A havi megújításkor a Stripe `invoice.paid` nagyjából a régi időszak végén érkezik; ennyi
// türelmi idő alatt a lejárt havi keret még átvihető (különben a webhook késése elvinné).
export const ROLLOVER_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (t instanceof Date) return Number.isFinite(t.getTime()) ? t.getTime() : null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  return null;
}

const amount = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const now0 = (now) => toMillis(now) ?? Date.now();

// Egy vödör pillanatnyi értéke: lejárt (vagy lejárat nélküli, de nem nulla) vödör = 0.
// Lejárat nélküli vödör csak kézi jóváírásnál fordulhat elő: az nem jár le.
function bucketValue(credits, bucket, now) {
  const n = amount(credits?.[bucket]);
  const exp = toMillis(credits?.[`${bucket}ExpiresAt`]);
  if (exp != null && exp <= now) return { value: 0, expired: n };
  return { value: n, expired: 0 };
}

// A kreditállapot olvasható alakja (UI és szerver): { included, purchased, total, unlimited, … }.
export function balance(credits, now) {
  const t = now0(now);
  const inc = bucketValue(credits, 'included', t);
  const pur = bucketValue(credits, 'purchased', t);
  return {
    included: inc.value,
    purchased: pur.value,
    total: inc.value + pur.value,
    includedExpiresAt: inc.value ? toMillis(credits?.includedExpiresAt) : null,
    purchasedExpiresAt: pur.value ? toMillis(credits?.purchasedExpiresAt) : null,
    unlimited: credits?.unlimited === true,
    expired: { included: inc.expired, purchased: pur.expired },
  };
}

// Egy művelet kreditára a settings/credits.prices-ból; null, ha nincs az árlistán (nem indítható).
export function costFor(prices, app, action) {
  if (!prices || typeof prices !== 'object' || typeof app !== 'string' || typeof action !== 'string') return null;
  const key = `${app}/${action}`;
  if (!Object.hasOwn(prices, key)) return null;
  const v = prices[key];
  return Number.isInteger(v) && v >= 0 ? v : null;
}

// Alacsony-e az egyenleg: a referencia (pl. a havi keret) `percent` százaléka alatt.
export function isLow(total, reference, percent) {
  if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(percent)) return false;
  return total < (reference * percent) / 100;
}

// A közös kimenet: az új credits-mezők (csak a változók), a split, a lejárt mennyiség, az egyenleg utána.
function result(credits, now, next, split, extra = {}) {
  const merged = { ...(credits || {}), ...next };
  const b = balance(merged, now);
  return { ok: true, fields: next, split, expired: extra.expired ?? { included: 0, purchased: 0 }, balanceAfter: b.total, ...extra.more };
}

// Levonás (spend). Elégtelen egyenlegnél { ok: false, reason: 'insufficient', balance }.
// Unlimited felhasználónál nincs levonás, csak naplósor (split 0/0).
export function planSpend(credits, cost, now) {
  const t = now0(now);
  if (!Number.isInteger(cost) || cost < 0) return { ok: false, reason: 'invalid_cost' };
  const b = balance(credits, t);
  const expired = b.expired;
  const fields = {};
  if (expired.included) fields.included = 0;
  if (expired.purchased) fields.purchased = 0;
  if (b.unlimited) return result(credits, t, fields, { included: 0, purchased: 0 }, { expired });
  if (b.total < cost) return { ok: false, reason: 'insufficient', balance: b.total, expired };
  const fromIncluded = Math.min(b.included, cost);
  const fromPurchased = cost - fromIncluded;
  fields.included = b.included - fromIncluded;
  fields.purchased = b.purchased - fromPurchased;
  return result(credits, t, fields, { included: -fromIncluded, purchased: -fromPurchased }, { expired });
}

// Visszaírás (refund) egy korábbi levonás split-je alapján, ugyanazokba a vödrökbe.
// Ha a vödör közben lejárt, a visszaírt rész is elveszik (a lejárat nem hosszabbodik).
export function planRefund(credits, spendSplit, now) {
  const t = now0(now);
  const back = {
    included: amount(-(spendSplit?.included ?? 0)),
    purchased: amount(-(spendSplit?.purchased ?? 0)),
  };
  const b = balance(credits, t);
  const fields = {};
  const split = { included: 0, purchased: 0 };
  for (const k of BUCKETS) {
    const exp = toMillis(credits?.[`${k}ExpiresAt`]);
    const alive = exp == null || exp > t;
    if (b.expired[k]) fields[k] = 0;
    if (back[k] && alive) { fields[k] = b[k] + back[k]; split[k] = back[k]; }
  }
  return result(credits, t, fields, split, { expired: b.expired });
}

// Hub pass havi kerete (subscription): az új keret + a régi included maradéka legfeljebb
// `rolloverCap`-ig (a türelmi időn belül lejárt maradék is átvihető). Lejárat: az időszak vége.
export function planSubscriptionGrant(credits, { amount: grant, periodEnd, rolloverCap = 0 }, now) {
  const t = now0(now);
  const g = amount(grant);
  const end = toMillis(periodEnd);
  if (!g || end == null || end <= t) return { ok: false, reason: 'invalid_grant' };
  const b = balance(credits, t);
  const raw = amount(credits?.included);
  const exp = toMillis(credits?.includedExpiresAt);
  const carryable = exp == null || exp > t - ROLLOVER_GRACE_MS ? raw : 0;
  const carry = Math.min(carryable, amount(rolloverCap));
  const fields = { included: g + carry, includedExpiresAt: end };
  if (b.expired.purchased) fields.purchased = 0;
  // A split az új jóváírás; az átvitt rész nem mozgás. Ami a régi included-ből nem vitt át
  // (a keret fölötti vagy a türelmi időn túl lejárt rész), az `expire` naplósor.
  const expired = { included: raw - carry, purchased: b.expired.purchased };
  return result(credits, t, fields, { included: g, purchased: 0 }, { expired, more: { carried: carry } });
}

// Kreditcsomag (purchase): a purchased vödörhöz adódik, a TELJES vásárolt egyenleg lejárata
// a mostantól számított `months` hónapra hosszabbodik.
export function planPurchase(credits, { amount: grant, months = 12 }, now) {
  const t = now0(now);
  const g = amount(grant);
  if (!g || !Number.isFinite(months) || months <= 0) return { ok: false, reason: 'invalid_grant' };
  const b = balance(credits, t);
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + months);
  const fields = { purchased: b.purchased + g, purchasedExpiresAt: d.getTime() };
  if (b.expired.included) fields.included = 0;
  return result(credits, t, fields, { included: 0, purchased: g }, { expired: b.expired });
}

// Regisztrációs ajándék: egyszer (signupBonusAt jelzi), az included vödörbe, `days` napos lejárattal
// (meglévő, későbbi lejáratot nem rövidít).
export function planSignup(credits, { amount: grant, days = 30 }, now) {
  const t = now0(now);
  if (credits?.signupBonusAt != null) return { ok: false, reason: 'already_granted' };
  const g = amount(grant);
  if (!g || !Number.isFinite(days) || days <= 0) return { ok: false, reason: 'invalid_grant' };
  const b = balance(credits, t);
  const exp = Math.max(t + days * DAY_MS, b.included ? toMillis(credits?.includedExpiresAt) ?? 0 : 0);
  const fields = { included: b.included + g, includedExpiresAt: exp, signupBonusAt: t };
  if (b.expired.purchased) fields.purchased = 0;
  return result(credits, t, fields, { included: g, purchased: 0 }, { expired: b.expired });
}

// Kézi jóváírás / levonás (admin) a választott vödörbe. Pozitív delta: jóváírás, opcionális új
// lejárattal (nélküle a meglévő marad, üres vödörnél nincs lejárat). Negatív: levonás, legfeljebb 0-ig.
export function planAdmin(credits, { bucket, delta, expiresAt }, now) {
  const t = now0(now);
  if (!BUCKETS.includes(bucket) || !Number.isInteger(delta) || delta === 0) return { ok: false, reason: 'invalid_grant' };
  const exp = expiresAt == null ? null : toMillis(expiresAt);
  if (expiresAt != null && (exp == null || exp <= t)) return { ok: false, reason: 'invalid_expiry' };
  const b = balance(credits, t);
  const fields = {};
  for (const k of BUCKETS) if (b.expired[k]) fields[k] = 0;
  const value = Math.max(0, b[bucket] + delta);
  fields[bucket] = value;
  if (exp != null) fields[`${bucket}ExpiresAt`] = exp;
  else if (b.expired[bucket]) fields[`${bucket}ExpiresAt`] = null; // a lejárt dátum ne vigye el az új jóváírást
  const split = { included: 0, purchased: 0 };
  split[bucket] = value - b[bucket];
  return result(credits, t, fields, split, { expired: b.expired });
}
