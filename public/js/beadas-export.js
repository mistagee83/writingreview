// Egy beadás eredményének letöltése a javítási sorból (2026-11-24, adatvédelmi kérés: a tanár
// a törlés előtt el tudja menteni). Sima UTF-8 szövegfájl: bármin megnyílik, nyomtatható.
// Tartalma: a feladat, a becenév, a beadás ideje, a tanár jóváhagyott visszajelzése (ha van;
// különben az AI javaslata, megjelölve, hogy még nincs jóváhagyva) és a diák szövege.
// Az írás közbeni jelzések szándékosan nincsenek benne (tájékoztató jelzések, nem eredmény).
// Tiszta függvények, a fordítót (t) és a dátumformázót a hívó adja – így Node-ban is tesztelhető.

const jegySzoveg = (jegy, tipus) => (tipus === 'szazalek' ? `${jegy}%` : String(jegy));

function pontsor(p, t) {
  if (!p?.max_pontszam) return null;
  const sz = p.szazalek != null ? ` (${p.szazalek}%)` : '';
  return `${t('jav.letoltes_pontszam')}: ${p.osszpontszam}/${p.max_pontszam}${sz}`;
}

function szempontSorok(szempontok, cimek, t) {
  return (Array.isArray(szempontok) ? szempontok : []).map((sz) => {
    const cim = sz?.cim || cimek[sz?.kulcs] || sz?.kulcs || '';
    const megj = String(sz?.megjegyzes || '').trim();
    return `- ${cim}: ${sz?.pont ?? '–'}/${sz?.max ?? '–'}${megj ? `\n  ${megj.replace(/\n/g, '\n  ')}` : ''}`;
  });
}

/**
 * @param {{ b: object, f: object|null, ai: object|null, tanari: object|null, skalaTipus?: string }} adat
 * @param {{ t: Function, datum: Function }} eszkozok – datum(ts) a Firestore-időbélyeget írja ki
 * @returns {{ nev: string, tartalom: string }}
 */
export function eredmenyFajl({ b, f, ai, tanari, skalaTipus }, { t, datum }) {
  const becenev = b?.becenev || b?.diak_nev || t('jav.nevtelen_diak');
  const cim = f?.cim || t('jav.torolt_feladat');
  const cimek = Object.fromEntries((f?.rubrika?.szempontok || []).map((sz) => [sz.kulcs, sz.cim]));
  const sorok = [
    `WritingReview – ${cim}`,
    `${t('jav.letoltes_becenev')}: ${becenev}`,
    `${t('jav.letoltes_beadva')}: ${datum(b?.letrehozva)}`,
    ''
  ];

  if (tanari) {
    sorok.push(`== ${t('jav.letoltes_visszajelzes')} ==`);
    if (tanari.jovahagyva_at) sorok.push(`${t('jav.letoltes_jovahagyva')}: ${datum(tanari.jovahagyva_at)}`);
    const p = pontsor(tanari.max_pontszam ? tanari : ai, t);
    if (p) sorok.push(p);
    if (tanari.jegy != null) sorok.push(`${t('jav.letoltes_jegy')}: ${jegySzoveg(tanari.jegy, tanari.jegy_tipus)}`);
    const szs = szempontSorok(tanari.szempontok?.length ? tanari.szempontok : [], cimek, t);
    if (szs.length) sorok.push('', ...szs);
    if (tanari.szoveg) sorok.push('', String(tanari.szoveg));
    sorok.push('');
  } else if (ai) {
    sorok.push(`== ${t('jav.letoltes_ai')} ==`);
    const p = pontsor(ai, t);
    if (p) sorok.push(p);
    const szs = szempontSorok(ai.szempontok, cimek, t);
    if (szs.length) sorok.push('', ...szs);
    if (ai.diak_szoveg) sorok.push('', String(ai.diak_szoveg));
    sorok.push('');
  } else {
    sorok.push(t('jav.letoltes_nincs_ertekeles'), '');
  }

  sorok.push(`== ${t('jav.letoltes_szoveg')} ==`, typeof b?.szoveg === 'string' && b.szoveg ? b.szoveg : t('jav.nincs_szoveg'), '');

  return { nev: fajlnev(cim, becenev, b?.letrehozva), tartalom: sorok.join('\n') };
}

/** Biztonságos, olvasható fájlnév: feladat_becenév_ÉÉÉÉ-HH-NN.txt */
export function fajlnev(cim, becenev, ido) {
  const tiszta = (s) => String(s || '').normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50).replace(/ /g, '-');
  const d = ido?.toDate ? ido.toDate() : ido instanceof Date ? ido : null;
  const nap = d && !Number.isNaN(d.getTime())
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
  return [tiszta(cim), tiszta(becenev), nap].filter(Boolean).join('_') + '.txt';
}

/** A böngészőben: a fájl letöltése (BOM-mal, hogy a Jegyzettömb is UTF-8-nak lássa). */
export function letoltes({ nev, tartalom }) {
  const url = URL.createObjectURL(new Blob(['﻿', tartalom.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nev;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
