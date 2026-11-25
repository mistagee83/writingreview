// Az Érettségi feladattár ellenőrzése (docs/erettsegi-feladattar-terv.md, 4. fejezet, „Ellenőrzés”).
//
// Használat: node scripts/feladattar-ellenorzes.mjs [mappa]   (alapérték: functions/feladattar/erettsegi)
// Kilépési kód: 0, ha nincs hiba; 1, ha van. A tests/feladattar.test.mjs is ezt futtatja.
//
// Gépi pontok:
//   1. 91 feladatsor-fájl; minden lapon mindkét írásfeladat vagy a feladatok[], vagy a kimaradt[] listában van;
//      az azonosítók egyediek; a mezők a formátumnak megfelelnek.
//   2. a sablon a szintnek és a sorszámnak megfelelő, létezik a sablonok.json-ban; a pontösszegek 11, 22, 15, 15.
//   3. szószám: min ≤ max, vagy mindkettő null és van szöveg.
//   4. képek: minden képes feladatoldalról van döntés (scripts/erettsegi/kezi.mjs KEPDONTES), a képes ok miatt
//      kimaradt feladat oldalán van kép.
// Emberi pontok (a szkript csak emlékeztet rájuk): 5. szúrópróba a PDF-fel szemben; 6. a sablonok sávleírásait a
// tulajdonos átolvassa.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");
const ALAP_MAPPA = join(GYOKER, "functions", "feladattar", "erettsegi");
const SEGED = join(GYOKER, "scripts", "erettsegi");

const IDOSZAK = ["maj", "okt", "nov", "febr", "maj2"];
const TIPUS = ["levél", "vélemény", "esszé", "egyéb"];
const FAJTA = ["email", "letter", "advertisement", "post", "article", "notice", "other"];
const KIMARADT_OK = ["kep", "kep_szoveg", "egyeb"];
const SABLON_OSSZEG = { "kozep-level": 11, "kozep-fogalmazas": 22, "emelt-level": 15, "emelt-fogalmazas": 15 };
const SZEMPONT = {
  "kozep-level": [["feladat", 5], ["szokincs", 3], ["nyelvhelyesseg", 3]],
  "kozep-fogalmazas": [["feladat", 6], ["hangnem", 2], ["szovegalkotas", 4], ["szokincs", 5], ["nyelvhelyesseg", 5]],
  "emelt-level": [["feladat", 4], ["hangnem", 2], ["szovegalkotas", 3], ["szokincs", 3], ["nyelvhelyesseg", 3]],
  "emelt-fogalmazas": [["feladat", 4], ["szovegalkotas", 5], ["szokincs", 3], ["nyelvhelyesseg", 3]],
};
// a PDF-ből gépi kinyeréskor bennmaradó szemét: helyettesítő jel, PUA-szimbólum, válaszsor, fejléc
const SZEMET = [/�/, /[-]/, /[….]{6,}/, /írásbeli vizsga/, /Azonosító jel/, /^Task [12AB]$/];

const str = (x) => typeof x === "string" && x.trim().length > 0;

export async function ellenoriz(mappa = ALAP_MAPPA) {
  const hibak = [], H = (m) => hibak.push(m);
  const lista = JSON.parse(readFileSync(join(SEGED, "forraslista.json"), "utf8"));
  const oldalkepek = JSON.parse(readFileSync(join(SEGED, "oldalkepek.json"), "utf8"));
  const { KEPDONTES } = await import(pathToFileURL(join(SEGED, "kezi.mjs")).href);

  // ---- sablonok (2.) ----
  const sablonFajl = join(mappa, "sablonok.json");
  const sablonok = {};
  if (!existsSync(sablonFajl)) H("Hiányzik a sablonok.json");
  else {
    const s = JSON.parse(readFileSync(sablonFajl, "utf8"));
    if (s.formatum_verzio !== 1) H("sablonok.json: formatum_verzio ≠ 1");
    for (const sab of s.sablonok || []) sablonok[sab.id] = sab;
    for (const [id, osszeg] of Object.entries(SABLON_OSSZEG)) {
      const sab = sablonok[id];
      if (!sab) { H(`sablonok.json: hiányzik a(z) ${id} sablon`); continue; }
      const r = sab.rubrika || {};
      const kapott = (r.szempontok || []).map((x) => [x.kulcs, x.suly]);
      if (JSON.stringify(kapott) !== JSON.stringify(SZEMPONT[id])) H(`${id}: a szempontok/pontok nem a 2026. októberi útmutatóéi: ${JSON.stringify(kapott)}`);
      const sum = (r.szempontok || []).reduce((a, x) => a + x.suly, 0);
      if (sum !== osszeg) H(`${id}: a pontösszeg ${sum}, nem ${osszeg}`);
      if (!(r.szempontok || []).every((x) => str(x.cim) && x.cim.length <= 80)) H(`${id}: hiányzó vagy 80 karakternél hosszabb szempontcím`);
      if (r.nyelv !== "angol") H(`${id}: a nyelv nem angol`);
      if (r.szint !== (id.startsWith("kozep") ? "B1" : "B2")) H(`${id}: a szint nem ${id.startsWith("kozep") ? "B1" : "B2"}`);
      if (!str(r.egyeb_utasitas)) H(`${id}: hiányzik az egyeb_utasitas`);
      if (/levon/i.test(r.egyeb_utasitas || "") && !/pontlevonás nincs/i.test(r.egyeb_utasitas || "")) H(`${id}: az egyeb_utasitas pontlevonást említ`);
      if (!(Number.isInteger(r.min_szo) && Number.isInteger(r.max_szo) && r.min_szo <= r.max_szo)) H(`${id}: hibás min_szo/max_szo`);
    }
    if (Object.keys(sablonok).length !== 4) H(`sablonok.json: ${Object.keys(sablonok).length} sablon, nem 4`);
  }

  // ---- feladatsorok (1., 3.) ----
  const fajlok = existsSync(mappa) ? readdirSync(mappa).filter((f) => f.endsWith(".json") && f !== "sablonok.json") : [];
  if (fajlok.length !== 91) H(`${fajlok.length} feladatsor-fájl, nem 91`);
  const vartIdk = new Set(lista.map((l) => l.id));
  const feladatIdk = new Set();
  let feladatDb = 0, kimaradtDb = 0;
  const kepesKimaradt = [];

  for (const f of fajlok) {
    const id = f.replace(/\.json$/, "");
    const P = (m) => H(`${id}: ${m}`);
    if (!vartIdk.has(id)) P("nincs a forráslistában");
    const lap = JSON.parse(readFileSync(join(mappa, f), "utf8"));
    const forras = lista.find((l) => l.id === id) || {};
    if (lap.formatum_verzio !== 1) P("formatum_verzio ≠ 1");
    if (lap.id !== id) P(`az id (${lap.id}) nem egyezik a fájlnévvel`);
    if (lap.ev !== forras.ev || lap.idoszak !== forras.idoszak || lap.szint !== forras.szint) P("ev/idoszak/szint nem egyezik a forráslistával");
    if (!IDOSZAK.includes(lap.idoszak) || !["kozep", "emelt"].includes(lap.szint)) P("ismeretlen időszak vagy szint");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lap.vizsga_datum || "") || !String(lap.vizsga_datum).startsWith(String(lap.ev))) P("hibás vizsga_datum");
    if (!str(lap.kod)) P("hiányzik a kod");
    if (!lap.forras_fajlok || lap.forras_fajlok.feladatlap !== forras.feladatlap || lap.forras_fajlok.utmutato !== forras.utmutato) P("a forras_fajlok nem egyezik a forráslistával");
    if (!Array.isArray(lap.feladatok) || !Array.isArray(lap.kimaradt) || !Array.isArray(lap.megjegyzesek)) { P("hiányzó lista (feladatok/kimaradt/megjegyzesek)"); continue; }

    const sorszamok = [...lap.feladatok.map((t) => t.sorszam), ...lap.kimaradt.map((k) => k.sorszam)].sort();
    if (JSON.stringify(sorszamok) !== "[1,2]") P(`az írásfeladatok sorszámai ${JSON.stringify(sorszamok)}, nem [1,2] (mindkét feladat a feladatok vagy a kimaradt listában)`);

    for (const k of lap.kimaradt) {
      kimaradtDb++;
      if (!KIMARADT_OK.includes(k.ok)) P(`kimaradt ${k.sorszam}: ismeretlen ok (${k.ok})`);
      if (!str(k.megjegyzes)) P(`kimaradt ${k.sorszam}: hiányzik a megjegyzés`);
      if (k.ok !== "egyeb") kepesKimaradt.push(`${id}-W${k.sorszam}`);
    }

    for (const t of lap.feladatok) {
      feladatDb++;
      const T = (m) => H(`${t.id || id}: ${m}`);
      if (t.id !== `${id}-W${t.sorszam}`) T(`hibás id (várt: ${id}-W${t.sorszam})`);
      if (feladatIdk.has(t.id)) T("ismétlődő id");
      feladatIdk.add(t.id);
      if (![1, 2].includes(t.sorszam)) T("a sorszám nem 1 vagy 2");
      const vartSablon = `${lap.szint}-${t.sorszam === 1 ? "level" : "fogalmazas"}`;
      if (t.sablon !== vartSablon) T(`a sablon ${t.sablon}, várt: ${vartSablon}`);
      if (!sablonok[t.sablon]) T(`a sablon (${t.sablon}) nincs a sablonok.json-ban`);
      const jel = t.sorszam === 1 ? ["Task 1", "Task A"] : ["Task 2", "Task B"];
      if (!jel.includes(t.eredeti_jeloles)) T(`hibás eredeti_jeloles: ${t.eredeti_jeloles}`);
      if (!str(t.cim) || t.cim.length > 80) T("a cím hiányzik vagy 80 karakternél hosszabb");
      if (!str(t.mufaj)) T("hiányzik a műfaj");
      if (!TIPUS.includes(t.tipus)) T(`ismeretlen típus: ${t.tipus}`);
      // 3. szószám
      const sz = t.szoszam || {};
      const szamok = Number.isInteger(sz.min) && Number.isInteger(sz.max) && sz.min <= sz.max;
      const nullok = sz.min === null && sz.max === null && str(sz.szoveg);
      if (!szamok && !nullok) T(`hibás szószám: ${JSON.stringify(sz)}`);
      if (szamok && !str(sz.szoveg)) T("a szószámnál hiányzik a szöveg");
      if (str(sz.szoveg) && ![t.teendo, t.zaro_utasitas].some((x) => (x || "").includes(sz.szoveg))) T(`a szószám szövege („${sz.szoveg}”) nincs a teendőben`);
      if (!str(t.helyzet)) T("hiányzik a helyzet");
      if (!str(t.teendo)) T("hiányzik a teendő");
      if (!Array.isArray(t.iranyito_szempontok) || !t.iranyito_szempontok.length || !t.iranyito_szempontok.every(str)) T("hiányzó vagy üres irányító szempont");
      if (t.iranyito_szempontok.some((x) => /^[•\-–o]\s/.test(x))) T("felsorolásjel maradt egy irányító szempont elején");
      if (!(t.kezdes === null || str(t.kezdes))) T("a kezdés nem szöveg vagy null");
      if (!(t.zaro_utasitas === null || str(t.zaro_utasitas))) T("a zaro_utasitas nem szöveg vagy null");
      if (t.bemenet !== null) {
        const b = t.bemenet || {};
        if (!FAJTA.includes(b.fajta)) T(`ismeretlen bemenet-fajta: ${b.fajta}`);
        if (!Array.isArray(b.bekezdesek) || !b.bekezdesek.length || !b.bekezdesek.every(str)) T("a bemenet bekezdései hiányoznak vagy üresek");
        if (!(b.cim === null || str(b.cim))) T("a bemenet címe nem szöveg vagy null");
        if (!(b.forras === null || str(b.forras))) T("a bemenet forrása nem szöveg vagy null");
      }
      if (!t.oldalak || !Array.isArray(t.oldalak.feladatlap) || !t.oldalak.feladatlap.length || !t.oldalak.feladatlap.every(Number.isInteger)) T("hiányzik az oldalszám");
      if (!Array.isArray(t.megjegyzesek)) T("hiányzik a megjegyzesek lista");
      // gépi kinyerés maradványai
      const szovegek = [t.helyzet, t.teendo, t.kezdes, t.zaro_utasitas, ...(t.iranyito_szempontok || []),
        ...(t.bemenet ? [t.bemenet.cim, ...(t.bemenet.bekezdesek || [])] : [])].filter(Boolean);
      for (const s of szovegek) for (const r of SZEMET) if (r.test(s)) T(`gépi maradvány a szövegben (${r}): „${s.slice(0, 60)}…”`);
    }
  }
  for (const l of lista) if (!fajlok.includes(l.id + ".json")) H(`hiányzik a feladatsor: ${l.id}`);

  // ---- 4. képek ----
  const kepes = [];
  for (const [id, oldalak] of Object.entries(oldalkepek)) {
    for (const o of oldalak) {
      const jelek = o.feladatok || [];
      for (const j of jelek) if (o.kepek && o.kepek.length) kepes.push(`${id}-W${{ A: 1, B: 2, 1: 1, 2: 2 }[j]}`);
    }
  }
  const lefedett = Object.values(oldalkepek).reduce((a, o) => a + o.length, 0);
  if (Object.keys(oldalkepek).length !== 91) H(`oldalkepek.json: ${Object.keys(oldalkepek).length} lap, nem 91`);
  if (lefedett < 182) H(`oldalkepek.json: csak ${lefedett} feladatoldal (legalább 182 kell)`);
  for (const t of kepes) if (!KEPDONTES[t]) H(`${t}: a feladat oldalán kép van, de nincs róla döntés (kezi.mjs KEPDONTES)`);
  for (const [t, d] of Object.entries(KEPDONTES)) {
    if (!kepes.includes(t)) H(`${t}: KEPDONTES-bejegyzés, de az oldalán nincs kép`);
    if (d === "kihagy" && !kepesKimaradt.includes(t)) H(`${t}: a döntés „kihagy”, de a feladat nincs a kimaradt listában`);
    if (d === "diszito" && kepesKimaradt.includes(t)) H(`${t}: a döntés „diszito”, de a feladat képes okkal kimaradt`);
  }
  for (const t of kepesKimaradt) if (KEPDONTES[t] !== "kihagy") H(`${t}: képes okkal kimaradt, de a KEPDONTES nem „kihagy”`);

  // a sablonok szószáma a 2026. októberi lapé
  for (const [sid, lapId, n] of [["kozep-level", "2026-okt-kozep", 1], ["kozep-fogalmazas", "2026-okt-kozep", 2], ["emelt-level", "2026-okt-emelt", 1], ["emelt-fogalmazas", "2026-okt-emelt", 2]]) {
    const fajl = join(mappa, lapId + ".json");
    if (!existsSync(fajl) || !sablonok[sid]) continue;
    const t = JSON.parse(readFileSync(fajl, "utf8")).feladatok.find((x) => x.sorszam === n);
    const r = sablonok[sid].rubrika;
    if (t && (t.szoszam.min !== r.min_szo || t.szoszam.max !== r.max_szo)) H(`${sid}: a szószám (${r.min_szo}-${r.max_szo}) nem a 2026. októberi lapé (${t.szoszam.szoveg})`);
  }

  return { hibak, feladatDb, kimaradtDb, lapDb: fajlok.length, kepesFeladat: kepes.length };
}

async function main() {
  const { hibak, feladatDb, kimaradtDb, lapDb, kepesFeladat } = await ellenoriz(process.argv[2] || ALAP_MAPPA);
  console.log(`${lapDb} feladatsor, ${feladatDb} feladat, ${kimaradtDb} kimaradt; ${kepesFeladat} képes feladatoldal, mind eldöntve.`);
  if (hibak.length) { console.log(`\n${hibak.length} hiba:`); for (const h of hibak) console.log("  – " + h); process.exit(1); }
  console.log("Gépi ellenőrzés: rendben.");
  console.log("Emberi pontok: szúrópróba a PDF-fel szemben (docs/erettsegi-kinyeres-jelentes.md), és a sablonok sávleírásait a tulajdonos átolvassa.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
