// ══════════════════════════════════════════════════════
// Diák-azonosító: felhasználónév valódi e-mail-cím helyett
//
// A Firebase jelszavas belépése e-mail formátumú azonosítót kér, a diákról
// viszont nem tárolunk valódi címet. A felhasználónévből ezért kitalált,
// nem létező címet képezünk (a .invalid végződés kifejezetten ilyenre való,
// sosem megy rá levél). A felületen mindig a felhasználónév látszik.
// ══════════════════════════════════════════════════════

export const DIAK_DOMAIN = 'diak.invalid';

const NEV_MINTA = /^[a-z0-9][a-z0-9._-]{2,29}$/;

// Kisbetű, ékezet nélkül, szóköz nélkül: „Kiss.Péter” → „kiss.peter”.
export function felhasznalonevNormalizalas(nev) {
  return String(nev ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}

export function felhasznalonevErvenyes(nev) {
  return NEV_MINTA.test(felhasznalonevNormalizalas(nev));
}

export function felhasznalonevEmailre(nev) {
  return `${felhasznalonevNormalizalas(nev)}@${DIAK_DOMAIN}`;
}

// A belépő mezőbe e-mail-cím (tanár) vagy felhasználónév (diák) kerülhet.
export function belepesiEmail(bevitel) {
  const s = String(bevitel ?? '').trim();
  return s.includes('@') ? s : felhasznalonevEmailre(s);
}

// Listákhoz, keresőhöz: a kitalált címből a felhasználónév marad.
export function azonositoMegjelenites(email) {
  const s = String(email ?? '');
  const vege = `@${DIAK_DOMAIN}`;
  return s.toLowerCase().endsWith(vege) ? s.slice(0, -vege.length) : s;
}
