// Előfizetés-jogosultság: users/{uid}.entitlements kiértékelése (docs/spec-v1.md „users/{uid}”).
// Tiszta logika, importok nélkül: a hub kliense, az appok kliense és a Cloud Functions
// (Node, ESM) ugyanezt a fájlt használja. Az appok repójába másolatként kerül; a forrás ez a fájl,
// változtatni csak itt szabad, utána a másolatokat frissíteni kell.
//
// Szabály: hozzáférés, ha az app saját kulcsa VAGY az `all` (hub-szintű előfizetés) aktív.
// Aktív = status === 'active'. Stripe-lemondásnál a státusz az időszak végéig `active` marad,
// utána a webhook `canceled`-re állítja, ezért a currentPeriodEnd-et itt nem vizsgáljuk.

export const ALL = 'all';
export const ACTIVE = 'active';
export const STATUSES = Object.freeze(['active', 'past_due', 'canceled']);
export const SOURCES = Object.freeze(['stripe', 'admin']);

// Egy entitlements-bejegyzés aktív-e.
export function isActive(entry) {
  return !!entry && typeof entry === 'object' && entry.status === ACTIVE;
}

// Az apphoz érvényes bejegyzés: előbb az app saját kulcsa, aztán az `all`.
// Visszaad: { key, tier, status, source, … } vagy null, ha nincs hozzáférés.
export function entitlementFor(entitlements, app) {
  if (!app || typeof app !== 'string') return null;
  const map = entitlements && typeof entitlements === 'object' ? entitlements : {};
  if (isActive(map[app])) return { key: app, ...map[app] };
  if (app !== ALL && isActive(map[ALL])) return { key: ALL, ...map[ALL] };
  return null;
}

export const hasAccess = (entitlements, app) => entitlementFor(entitlements, app) !== null;

// Az érvényes csomagszint (pl. WR: 'alap' / 'profi'), vagy null. Az `all` csomagszintjét
// (pl. 'hub') minden app maga képezi le a saját szintjére.
export const tierFor = (entitlements, app) => entitlementFor(entitlements, app)?.tier ?? null;
