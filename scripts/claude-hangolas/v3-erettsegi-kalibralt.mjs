// 3. hangolási változat: az érettségi sablon (v2) + a sávok értelmezése a tanár vak pontozása alapján (2026-11-27).
// A v2-ben a Claude a jó leveleknél a feladatra 2/4-et adott (tanár: 4/4), a bekezdés nélküli, de logikus
// szövegnél a szövegalkotásra 2/5-öt (tanár: 3/5). A szókincs és a nyelvhelyesség rendben volt.
import { rubrika as v2Rubrika } from "./v2-erettsegi-emelt.mjs";

export const leiras = "érettségi sávok (v2) + a feladatteljesítés és a szövegalkotás sávjainak értelmezése";

export const rubrika = v2Rubrika;

export function prompt(feladat, szoveg, alapPrompt) {
  return `${alapPrompt}

# A SÁVOK ÉRTELMEZÉSE (a vizsgáztatói gyakorlat szerint)
6. Feladatteljesítés: egy irányító szempont akkor KELLŐEN kidolgozott, ha a diák releváns, érthető
   tartalommal kifejti (egy-két kidolgozott mondat elég); nem kell részletes, helyi példákkal
   alátámasztott vagy szakértői érvelés. „Részben” az a szempont, amelyet csak megemlít, kifejtés nélkül;
   „egyáltalán nem” az, amelyik hiányzik. Egy-egy nem teljesen következetes mondat (pl. a zárásban)
   nem teszi a szempontot „részben” kidolgozottá. Ha a diák a választott témáról világos állásponttal,
   alátámasztott érvekkel ír, és javaslattal vagy következtetéssel zár, az 4 pont.
   Ha a diák nem egy témát választott, hanem többről ír felszínesen, az a feladat félreértése felé visz.
7. Szövegalkotás: ha a gondolatmenet logikus és a mondatok kapcsolódnak, de nincsenek bekezdések,
   az a 4–3 pontos sáv alsó pontja (3), nem a 2–1-es sáv. A 2–1-es sáv akkor jár, ha a gondolatmenet
   nem mindenütt logikus, sok az ismétlés, vagy a mondatok több helyen nem kapcsolódnak.
8. Minden szempontnál a leírásokból indulj ki: a pont annak a sávnak a pontja, amelynek a leírása a
   dolgozatra illik; a hibákat és hiányokat csak akkor vedd a sáv lejjebb vitelének okául, ha a
   sávleírás kifejezetten említi őket.`;
}
