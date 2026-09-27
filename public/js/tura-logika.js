// ══════════════════════════════════════════════════════
// WritingReview – a bemutató felnyílási szabálya
//
// Miért külön fájl: a tura.js behozza a Firebase SDK-t, ezért Node-ból
// nem importálható, tehát nem is tesztelhető. Ez a döntés viszont
// fontos – ha elromlik, vagy soha nem jelenik meg a bemutató, vagy
// minden oldalbetöltésnél az arcába ugrik a tanárnak. Így kapott
// saját, függőség nélküli modult és tesztet (tests/tura.test.mjs).
// ══════════════════════════════════════════════════════

/**
 * Hányszor nyílhat fel magától, ha a tanár csak becsukja?
 *
 * Egy véletlen Escape ne nyomja el örökre a bemutatót – de a
 * visszatérő felugró ablak rosszabb, mint a kihagyott bemutató.
 */
export const MAX_NYITAS = 3;

/** Melyik lapon nyílhat fel magától. A tanári kezdőlap. */
export const AUTO_OLDAL = "tanar.html";

/**
 * Felnyíljon-e magától a bemutató menüje?
 *
 * @param {object} p
 * @param {string} p.oldal          a jelenlegi lap (pl. "tanar.html")
 * @param {string} p.szerep         'tanar' | 'diak'
 * @param {boolean} p.elutasitotta  kifejezetten azt mondta, nem kéri
 * @param {number} p.latottSzakasz  hány szakaszt látott már végig
 * @param {number} p.nyitasok       hányszor nyílt fel eddig magától
 * @returns {boolean}
 */
export function felnyiljon({ oldal, szerep, elutasitotta, latottSzakasz, nyitasok }) {
  // A diák folyamata más – annak külön szakaszai lesznek, nem ezek.
  if (szerep !== "tanar") return false;

  // Csak a tanári kezdőlapon, hogy ne szakítsa meg a munkát félúton.
  // Új kolléga ide érkezik, amikor először lép be tanárként: a szerepét
  // az admin állítja át, a guard.js pedig ide irányítja.
  if (oldal !== AUTO_OLDAL) return false;

  if (elutasitotta) return false;

  // Aki már végignézett egy szakaszt, tudja, hol a villanykörte.
  if (latottSzakasz > 0) return false;

  return nyitasok < MAX_NYITAS;
}
