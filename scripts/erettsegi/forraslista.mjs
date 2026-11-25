// A 91 feladatlap listája a Matura tartalmából (tartalom/*.json: id, examDate, code, sourceFiles).
// Így a WR és a Matura ugyanarra a feladatsorra ugyanazzal az azonosítóval hivatkozik.
// Használat: node scripts/erettsegi/forraslista.mjs <a Matura tartalom/ mappája>
// Kimenet: scripts/erettsegi/forraslista.json (verziózott; a kinyerő ebből dolgozik).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ITT = dirname(fileURLToPath(import.meta.url));
const mappa = process.argv[2];
if (!mappa) { console.error("Használat: node scripts/erettsegi/forraslista.mjs <Matura tartalom/>"); process.exit(1); }

const lista = readdirSync(mappa).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const j = JSON.parse(readFileSync(join(mappa, f), "utf8"));
  const m = /^(\d{4})-(maj2|maj|okt|nov|febr)-(kozep|emelt)$/.exec(j.id);
  if (!m) throw new Error("Ismeretlen azonosító: " + j.id);
  return {
    id: j.id, ev: +m[1], idoszak: m[2], szint: m[3],
    vizsga_datum: j.examDate, kod: j.code,
    feladatlap: j.sourceFiles.paper, utmutato: j.sourceFiles.key,
  };
});
writeFileSync(join(ITT, "forraslista.json"), JSON.stringify(lista, null, 1) + "\n");
console.log(lista.length + " lap");
