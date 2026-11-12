// ══════════════════════════════════════════════════════
// WritingReview – csoportok (8b): a tiszta, tesztelhető rész
//
// A csoport nevét a kliens tisztítja és a Firestore-szabály ellenőrzi (1–60 karakter);
// a sorrend ábécérendi (a felület nyelvén), az archiváltak a végén.
// A DOM-os rész a csoportok.html-ben és a megosztas.html-ben van.
// ══════════════════════════════════════════════════════

export const CSOPORT_NEV_MAX = 60;

/** A név szóközeit összevonja; üres vagy túl hosszú névre null. */
export function csoportNevTisztitas(nev) {
  const s = String(nev ?? "").replace(/\s+/g, " ").trim();
  return s && s.length <= CSOPORT_NEV_MAX ? s : null;
}

/** Ábécérend (számokat értelmesen: „9.B” a „10.A” előtt), az archiváltak a végén. */
export function csoportRendezes(csoportok, locale = "hu") {
  return [...csoportok].sort((a, b) =>
    (a.aktiv === false) - (b.aktiv === false)
    || String(a.nev || "").localeCompare(String(b.nev || ""), locale, { numeric: true, sensitivity: "base" }));
}

/** A linkindításnál választható csoportok: csak a nem archiváltak, rendezve. */
export function valaszthatoCsoportok(csoportok, locale = "hu") {
  return csoportRendezes(csoportok.filter((c) => c.aktiv !== false), locale);
}

const idoMs = (v) => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === "number" ? v : 0);

/**
 * A csoport diákjai a beadásaikkal (8b/2), a csoport.html-hez. A diák a szerver által párosított
 * `csoport_diak_id` szerint kapja a beadásait (a legújabb elöl); a becenevek a beadásokon látszó
 * alakok, ismétlés nélkül. A diákok ábécérendben. Ha egy beadás diákja (még) nem érkezett meg
 * (élő frissítés közben), a beadás a `parositatlan` listába kerül.
 */
export function csoportDiakjai(diakok, beadasok, locale = "hu") {
  const szerint = new Map(diakok.map((d) => [d.id, { ...d, beadasok: [] }]));
  const parositatlan = [];
  for (const b of beadasok) (szerint.get(b.csoport_diak_id)?.beadasok ?? parositatlan).push(b);
  const lista = [...szerint.values()].map((d) => {
    d.beadasok.sort((a, b) => idoMs(b.letrehozva) - idoMs(a.letrehozva));
    const latott = new Map();
    for (const b of d.beadasok) {
      const k = String(b.becenev || "").toLocaleLowerCase(locale);
      if (k && !latott.has(k)) latott.set(k, b.becenev);
    }
    return { ...d, becenevAlakok: [...latott.values()], utolso: d.beadasok[0]?.letrehozva ?? d.utolso_beadas ?? null };
  }).filter((d) => d.beadasok.length > 0);
  lista.sort((a, b) => String(a.nev || "").localeCompare(String(b.nev || ""), locale, { numeric: true, sensitivity: "base" }));
  return { diakok: lista, parositatlan };
}
