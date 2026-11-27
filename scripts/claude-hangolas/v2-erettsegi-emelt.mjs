// 2. hangolási változat: a dolgozatot úgy javítjuk, mintha emelt szintű érettségi 2. feladat lett volna
// (véleménykifejtő szöveg, B2, 200–250 szó, 15 pont). A szempontok és a sávleírások a jóváhagyott
// érettségi sablonból jönnek (functions/feladattar/erettsegi/sablonok.json, emelt-fogalmazas); a prompt az éles.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sablonok } = require("../../functions/feladattar/erettsegi/sablonok.json");
const sablon = sablonok.find((s) => s.id === "emelt-fogalmazas");
const sablonRubrika = sablon.rubrika || sablon;

export const leiras = "emelt szintű érettségi 2. feladat sávleírásai (15 pont), a feladat saját leírásával";

// A feladatlap nem sorol fel irányító szempontokat (csak „támogasd vagy utasítsd el”); az útmutató
// négy irányító szemponttal számol, ezért itt megnevezzük, mit tekintsen annak.
const IRANYITO = `
Ennél a feladatnál a feladatlap nem sorol fel irányító szempontokat. A feladatteljesítés négy szempontjaként ezt nézd:
(1) melyik döntésről ír, és világos-e az álláspontja (támogatja vagy elutasítja);
(2) érvek az álláspontja mellett, kellő részletességgel alátámasztva;
(3) a téma tágabb összefüggése: kiket érint, milyen következményei vannak;
(4) javaslat vagy összegző következtetés, a szerkesztőnek/olvasóknak szóló levél céljához illően.`;

export function rubrika(feladat) {
  const r = feladat.rubrika || {};
  return {
    ...sablonRubrika,
    tipus: r.tipus || sablonRubrika.tipus,
    min_szo: r.min_szo || sablonRubrika.min_szo,
    max_szo: r.max_szo || sablonRubrika.max_szo,
    feladat_leiras: r.feladat_leiras,
    kimeneti_nyelv: r.kimeneti_nyelv,
    egyeb_utasitas: `${sablonRubrika.egyeb_utasitas}\n${IRANYITO}`
  };
}
