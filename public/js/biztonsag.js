// ══════════════════════════════════════════════════════
// Biztonságos URL a megjelenítéshez
//
// Az `esc()` a HTML-t védi, a `javascript:` sémát nem: egy tanár által megadott
// href/src a diák alkalmazásának eredetén futhatna. A feladatlap URL-je a
// Firebase Storage tokenes letöltési címe; ennél mást nem renderelünk.
// (A Firestore-szabály is ezt kényszeríti, ez a kliensoldali második vonal –
// a régi vagy kézzel írt rekordok ellen is.)
// ══════════════════════════════════════════════════════

const ENGEDELYEZETT_HOSTOK = ["firebasestorage.googleapis.com"];

/** @returns {string} a (normalizált) URL, ha https és engedélyezett host; különben üres szöveg */
export function biztonsagosUrl(url) {
  if (typeof url !== "string" || !url) return "";
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return "";
  }
  if (u.protocol !== "https:" || !ENGEDELYEZETT_HOSTOK.includes(u.hostname)) return "";
  return u.href;
}
