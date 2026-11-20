// Egy fiók, közös belépés (2026-11-20): a hub és az appok közös, függőség nélküli része.
// Forrás: a hub repója (shared/sso.js); az appokba másolat kerül (WR scripts/hub-masolat.mjs,
// QotD scripts/hub-copy.mjs, Hubbaloo scripts/sync-hub.mjs) – változtatni CSAK itt szabad.
// Firebase-importot szándékosan nem tartalmaz: az appok más SDK-verziót használnak (WR 10.12, a többi 12.6),
// a hívó adja be a saját Auth-példányát és callable-jét.
//
// Egykattintásos átlépés (SSO): a hub „Open app” gombja a createSsoCode callable-lel egyszer használható,
// 60 másodperces kódot kér → az app címe `#sso=<kód>` → az app a redeemSsoCode callable-lel custom tokenre
// cseréli → signInWithCustomToken. A kód csak az APP_ORIGINS címeire mehet (máshova kiadott kóddal bárki
// beléphetne a tanár nevében).

export const HUB_ORIGIN = 'https://mrandrewshub.com';

// Az appok címei, ahová a hub kódot ad (és ahová az /account?return= visszavisz).
export const APP_ORIGINS = [
  'https://review.mrandrewshub.com',
  'https://quiz.mrandrewshub.com',
  'https://hubbaloo.mrandrewshub.com',
];
// Helyi fejlesztés (bármely port): a kód a tanár saját gépére megy, onnan más nem éri el.
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?$/;

export const APP_NAMES = {
  'https://review.mrandrewshub.com': 'Writing Review',
  'https://quiz.mrandrewshub.com': 'Quiz of the Damned',
  'https://hubbaloo.mrandrewshub.com': 'Hubbaloo',
};

export const isAppOrigin = (origin) => APP_ORIGINS.includes(origin) || LOCAL.test(String(origin));

// Engedélyezett app-cím → a normalizált cím (origin + út + query, horgony nélkül), egyébként null.
export function appTarget(url) {
  try {
    const u = new URL(String(url));
    if (!isAppOrigin(u.origin)) return null;
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export const appName = (url) => {
  try { return APP_NAMES[new URL(String(url)).origin] ?? 'the app'; } catch { return 'the app'; }
};

export const SSO_CODE_RE = /^[A-Za-z0-9_-]{32,100}$/;
export const withSsoCode = (target, code) => `${target}#sso=${code}`;

// Az app oldalán: a `#sso=<kód>` kiolvasása és azonnali törlése a címsorból (ne maradjon a böngésző
// előzményeiben, ne kerüljön könyvjelzőbe). Nincs kód → null.
export function takeSsoCode(loc = globalThis.location, hist = globalThis.history) {
  const m = /^#sso=([A-Za-z0-9_-]+)$/.exec(loc?.hash ?? '');
  if (!m) return null;
  try { hist?.replaceState?.(hist.state, '', `${loc.pathname}${loc.search}`); } catch { /* régi böngésző */ }
  return SSO_CODE_RE.test(m[1]) ? m[1] : null;
}

// Az app oldalán: a kód beváltása és belépés. `redeem(data)` a hub redeemSsoCode callable-je (a válasz
// `data`-ját adja vissza), `signIn(token)` az app signInWithCustomToken-je a saját Auth-jával.
// Nincs kód → null; sikertelen beváltás → hiba (az app a szokásos belépőoldalt mutatja).
export async function redeemSso({ redeem, signIn, code = takeSsoCode() }) {
  if (!code) return null;
  const res = await redeem({ code });
  if (!res?.token) throw new Error('sso_failed');
  return signIn(res.token);
}

// A hub fiókoldala: regisztráció (`signup`) vagy belépés, visszatéréssel az appba (`returnTo`).
export function hubAccountUrl({ signup = false, returnTo = null } = {}, hubOrigin = HUB_ORIGIN) {
  const q = new URLSearchParams();
  if (signup) q.set('signup', '1');
  const back = returnTo && appTarget(returnTo);
  if (back) q.set('return', back);
  const s = q.toString();
  return `${hubOrigin}/account${s ? `?${s}` : ''}`;
}

// Egységes szövegek a belépőoldalakhoz (hub és appok, angolul).
export const ONE_ACCOUNT_TEXT = "One account for all of Mr. Andrew's apps.";
export const AUTH_ERRORS = {
  'auth/email-already-in-use': 'There is already an account with this e-mail. Sign in instead.',
  'auth/invalid-credential': 'The e-mail or the password is not right.',
  'auth/invalid-login-credentials': 'The e-mail or the password is not right.',
  'auth/wrong-password': 'The e-mail or the password is not right.',
  'auth/user-not-found': 'The e-mail or the password is not right.',
  'auth/invalid-email': 'Please enter a valid e-mail address.',
  'auth/missing-password': 'Please enter your password.',
  'auth/weak-password': 'Please use at least 8 characters.',
  'auth/user-disabled': 'This account is switched off. Please contact us.',
  'auth/too-many-requests': 'Too many tries. Please wait a few minutes.',
  'auth/network-request-failed': 'No connection. Please check your internet.',
};
export const authErrorText = (err) => AUTH_ERRORS[err?.code] ?? 'Something went wrong. Please try again.';
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s ?? '').trim());
