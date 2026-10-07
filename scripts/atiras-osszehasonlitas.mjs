// ══════════════════════════════════════════════════════
// Átírás-összehasonlítás: ugyanazok a dolgozat-fotók, különböző gondolkodási
// szinttel. Kiderül belőle, romlik-e a kézírás-felismerés ("low" vs "medium"),
// és mennyit spórol (token, USD). NEM érinti a Firebase-t: csak a Gemini API-t
// hívja, a functions/index.js ÉLES hívó függvényével (geminiKeres), az éles
// átírás-prompttal és sémával.
//
// Használat (a repo gyökeréből):
//   $env:GEMINI_API_KEY = (firebase functions:secrets:access GEMINI_API_KEY --project pilot)
//   node scripts/atiras-osszehasonlitas.mjs tests/dolgozatok/levelek
//
// A mappa: minden közvetlen kép = egy dolgozat; minden almappa = egy többoldalas
// dolgozat (a képek névsorrendben az oldalai). Kapcsolók:
//   --szintek medium,low   az összehasonlított szintek (az első a viszonyítás)
//   --ismet 2              ahányszor minden szinttel lefut (a viszonyítás 2. futása
//                          a "zaj": ennyit tér el magától a modell is)
//   --nyelv angol          a dolgozat nyelve (az éles prompt nyelve)
//   --modell <név>         alapból az éles átírás-modell
//   --ki <mappa>           az eredmények helye (alapból tests/dolgozatok/atiras-eredmeny/<idő>)
//
// Melyik szint olvas JOBBAN? Ahhoz kell a helyes átirat: tegyél a fotó mellé egy
// `<név>.txt` fájlt (anna.jpg → anna.txt; almappánál bela/ → bela.txt, a mappa
// mellett), benne a diák szövege SZÓ SZERINT, a hibáival együtt (nem javítva!),
// ahogy az AI-nak is vissza kell adnia. Ilyen dolgozatokra a szkript szint-
// enként hibaarányt (szó-szintű eltérés) is számol. Nélküle csak az látszik,
// mennyire térnek el a szintek egymástól.
//
// Az eredmény (diákmunka!) a gitignore-olt tests/dolgozatok/ alatt marad.
// FIGYELEM: a fotók a kulcshoz tartozó Gemini API-ba mennek; fizetős szintű
// kulcs kell (ugyanaz, amit az éles rendszer használ).
// ══════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, extname, basename, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEP_KITERJESZTES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MAX_OLDAL = 1500;   // mint a public/js/kep.js (feltöltés előtti átméretezés)
const KVALITAS = 85;      // JPEG, mint a kliensen (0.85)

// ── tiszta részek (a tests/atiras-osszehasonlitas.test.mjs ellenőrzi) ──

/** Szavakra bontás az összehasonlításhoz: kis/nagybetű számít, a sortörés nem. */
export function szavak(szoveg) {
  return String(szoveg || "").split(/\s+/).filter(Boolean);
}

/**
 * Szintű különbség két szöveg között (szó-szintű szerkesztési távolság).
 * @returns {{tavolsag: number, wer: number, kulonbsegek: {a: string, b: string}[]}}
 *   `wer` = a távolság / az `a` (viszonyítás) szószáma; `kulonbsegek` = a
 *   különböző szakaszok (a: viszonyítás, b: a másik; üres = hiányzik).
 */
export function kulonbseg(a, b) {
  const x = szavak(a);
  const y = szavak(b);
  const n = x.length;
  const m = y.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  // visszakövetés → a különböző szakaszok
  const lepesek = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)) {
      lepesek.push(x[i - 1] === y[j - 1] ? { t: "=", a: x[i - 1], b: y[j - 1] } : { t: "~", a: x[i - 1], b: y[j - 1] });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      lepesek.push({ t: "-", a: x[i - 1], b: "" });
      i--;
    } else {
      lepesek.push({ t: "+", a: "", b: y[j - 1] });
      j--;
    }
  }
  lepesek.reverse();

  const kulonbsegek = [];
  let akt = null;
  for (const l of lepesek) {
    if (l.t === "=") { akt = null; continue; }
    if (!akt) { akt = { a: [], b: [] }; kulonbsegek.push(akt); }
    if (l.a) akt.a.push(l.a);
    if (l.b) akt.b.push(l.b);
  }
  return {
    tavolsag: d[n][m],
    wer: n > 0 ? d[n][m] / n : (m > 0 ? 1 : 0),
    kulonbsegek: kulonbsegek.map((k) => ({ a: k.a.join(" "), b: k.b.join(" ") }))
  };
}

/**
 * A mappa dolgozatai: közvetlen képek (1 kép = 1 dolgozat), almappák (több oldal).
 * Ha van mellettük `<név>.txt` (az ellenőrzött, szó szerinti átirat), az a `helyes` mező.
 */
export function dolgozatokGyujtese(mappa) {
  const kep = (f) => Object.hasOwn(KEP_KITERJESZTES, extname(f).toLowerCase());
  const nevsor = (a, b) => a.localeCompare(b, "hu", { numeric: true });
  const nevek = readdirSync(mappa).sort(nevsor);
  const helyes = (nev) => {
    const ut = join(mappa, `${nev}.txt`);
    return nevek.includes(`${nev}.txt`) ? readFileSync(ut, "utf8") : null;
  };
  const dolgozatok = [];
  for (const nev of nevek) {
    const ut = join(mappa, nev);
    if (statSync(ut).isDirectory()) {
      const oldalak = readdirSync(ut).filter(kep).sort(nevsor).map((f) => join(ut, f));
      if (oldalak.length) dolgozatok.push({ nev, oldalak, helyes: helyes(nev) });
    } else if (kep(nev)) {
      const alap = basename(nev, extname(nev));
      dolgozatok.push({ nev: alap, oldalak: [ut], helyes: helyes(alap) });
    }
  }
  return dolgozatok;
}

/** Parancssor → beállítások. */
export function kapcsolok(argv) {
  const be = { szintek: ["medium", "low"], ismet: 2, nyelv: "angol", modell: null, ki: null, mappa: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--szintek") be.szintek = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--ismet") be.ismet = Number(argv[++i]);
    else if (a === "--nyelv") be.nyelv = argv[++i];
    else if (a === "--modell") be.modell = argv[++i];
    else if (a === "--ki") be.ki = argv[++i];
    else if (!a.startsWith("--")) be.mappa = a;
    else throw new Error(`Ismeretlen kapcsoló: ${a}`);
  }
  if (!be.mappa) throw new Error("Add meg a dolgozat-fotók mappáját.");
  if (!be.szintek.length) throw new Error("Legalább egy szint kell.");
  for (const sz of be.szintek) {
    if (!["minimal", "low", "medium", "high"].includes(sz)) throw new Error(`Ismeretlen gondolkodási szint: ${sz}`);
  }
  if (!Number.isInteger(be.ismet) || be.ismet < 1) throw new Error("Az --ismet legalább 1 egész szám.");
  return be;
}

// ── futtatás ──

async function sharpBetoltes() {
  for (const csomag of ["tests", "functions"]) {
    try {
      return createRequire(join(GYOKER, csomag, "package.json"))("sharp");
    } catch (_) { /* próbáljuk a következőt */ }
  }
  return null;
}

/** Az app kliensoldali átméretezése: hosszabbik oldal ≤ 1500 px, JPEG 85, EXIF-forgatással. */
async function kepElokeszites(fajl, sharp) {
  const mime = KEP_KITERJESZTES[extname(fajl).toLowerCase()];
  if (!sharp) return { mime, data: readFileSync(fajl).toString("base64"), atmeretezve: false };
  const puffer = await sharp(fajl)
    .rotate()
    .resize({ width: MAX_OLDAL, height: MAX_OLDAL, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: KVALITAS })
    .toBuffer();
  return { mime: "image/jpeg", data: puffer.toString("base64"), atmeretezve: true };
}

const usd = (x) => (x == null ? "?" : `$${x.toFixed(4)}`);
const szazalek = (x) => `${(x * 100).toFixed(1)}%`;

export async function futtat(argv, kornyezet = process.env) {
  const be = kapcsolok(argv);
  if (!kornyezet.GEMINI_API_KEY) throw new Error("Hiányzik a GEMINI_API_KEY környezeti változó (lásd a fájl elején).");

  // Az éles modul betöltése: ugyanaz a geminiKeres, prompt és séma, mint a Function-ben.
  process.env.GCLOUD_PROJECT ||= "wr-atiras-teszt";
  const t = createRequire(join(GYOKER, "functions", "package.json"))("./index.js")._teszt;
  const aiHasznalat = createRequire(join(GYOKER, "functions", "package.json"))("./ai-hasznalat.js");
  const modell = be.modell || t.MODELLEK.atiras;
  const prompt = t.atiratPrompt(be.nyelv);

  const mappa = resolve(be.mappa);
  if (!existsSync(mappa)) throw new Error(`Nincs ilyen mappa: ${mappa}`);
  const dolgozatok = dolgozatokGyujtese(mappa);
  if (!dolgozatok.length) throw new Error(`Nincs kép a mappában: ${mappa}`);

  const sharp = await sharpBetoltes();
  if (!sharp) {
    console.warn("FIGYELEM: nincs `sharp`, a képek átméretezés nélkül mennek – az éles app 1500 px-re kicsinyít, ezért a teszt kicsit\n" +
      "         optimista lehet. Telepítés (a package.json-t nem módosítja): cd tests && npm i --no-save sharp\n");
  }

  const ido = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const ki = resolve(be.ki || join(GYOKER, "tests", "dolgozatok", "atiras-eredmeny", ido));
  mkdirSync(ki, { recursive: true });

  const futasok = [];   // { dolgozat, szint, futas, atirat, hasznalat, koltseg, olvashatosag }
  console.log(`Modell: ${modell} | szintek: ${be.szintek.join(", ")} | ismétlés: ${be.ismet} | dolgozat: ${dolgozatok.length}\n`);

  for (const d of dolgozatok) {
    const kepek = await Promise.all(d.oldalak.map((f) => kepElokeszites(f, sharp)));
    const parts = [{ text: prompt }, ...kepek.map((k) => ({ inline_data: { mime_type: k.mime, data: k.data } }))];
    for (const szint of be.szintek) {
      for (let r = 1; r <= be.ismet; r++) {
        process.stdout.write(`  ${d.nev} · ${szint} #${r} … `);
        // az éles geminiKeres: ugyanaz a kérés-felépítés, mint a Function-ben (1 kísérlet, újrapróbálás nélkül)
        const { eredmeny, hasznalat } = await t.geminiKeres(modell, parts, t.ATIRAT_SCHEMA, szint);
        const koltseg = aiHasznalat.koltsegUsd({ modell, ...hasznalat });
        futasok.push({ dolgozat: d.nev, szint, futas: r, atirat: eredmeny.atirat || "", hasznalat, koltseg, olvashatosag: eredmeny.olvashatosag });
        writeFileSync(join(ki, `${d.nev}.${szint}.${r}.txt`), eredmeny.atirat || "", "utf8");
        console.log(`${hasznalat.kimenet + hasznalat.gondolkodas} kimenet+gondolkodás token, ${usd(koltseg)}`);
      }
    }
  }

  // ── összegzés ──
  const sorok = [];
  const ir = (s = "") => { sorok.push(s); console.log(s); };
  const viszonyitas = be.szintek[0];

  ir("\n══ Költség szintenként (az összes dolgozat átlaga, 1 átírás) ══");
  ir("szint      | átlag költség | átlag kimenet | átlag gondolkodás | átlag [?] db");
  const atlagok = {};
  for (const szint of be.szintek) {
    const f = futasok.filter((x) => x.szint === szint);
    const atl = (fn) => f.reduce((s, x) => s + fn(x), 0) / f.length;
    atlagok[szint] = atl((x) => x.koltseg ?? 0);
    ir(`${szint.padEnd(10)} | ${usd(atlagok[szint]).padEnd(13)} | ${atl((x) => x.hasznalat.kimenet).toFixed(0).padEnd(13)} | ${atl((x) => x.hasznalat.gondolkodas).toFixed(0).padEnd(17)} | ${atl((x) => (x.atirat.match(/\[\?\]/g) || []).length).toFixed(1)}`);
  }
  if (be.szintek.length > 1 && atlagok[viszonyitas] > 0) {
    for (const szint of be.szintek.slice(1)) {
      ir(`→ ${szint}: ${szazalek(atlagok[szint] / atlagok[viszonyitas] - 1)} a(z) ${viszonyitas}-hoz képest`);
    }
  }

  ir(`\n══ Eltérés a viszonyítástól (${viszonyitas} #1) – szó-szintű, 0% = azonos ══`);
  ir("A '" + viszonyitas + " #2' sor a ZAJ: ennyit tér el magától a modell is ugyanazzal a beállítással.");
  const osszWer = {};
  for (const d of dolgozatok) {
    const ref = futasok.find((x) => x.dolgozat === d.nev && x.szint === viszonyitas && x.futas === 1);
    ir(`\n▸ ${d.nev}  (${szavak(ref.atirat).length} szó, olvashatóság: ${ref.olvashatosag})`);
    for (const x of futasok.filter((y) => y.dolgozat === d.nev && y !== ref)) {
      const k = kulonbseg(ref.atirat, x.atirat);
      const cimke = `${x.szint} #${x.futas}`;
      (osszWer[cimke] ??= []).push(k.wer);
      ir(`  ${cimke.padEnd(12)} ${szazalek(k.wer).padStart(6)}  (${k.tavolsag} szó)  olvashatóság: ${x.olvashatosag}`);
      for (const kul of k.kulonbsegek.slice(0, 12)) {
        ir(`      ${viszonyitas}: «${kul.a || "—"}»  →  ${x.szint}: «${kul.b || "—"}»`);
      }
      if (k.kulonbsegek.length > 12) ir(`      … és még ${k.kulonbsegek.length - 12} különbség (lásd a .txt fájlokat)`);
    }
  }
  ir("\n══ Átlagos eltérés a viszonyítástól ══");
  for (const [cimke, lista] of Object.entries(osszWer)) {
    ir(`  ${cimke.padEnd(12)} ${szazalek(lista.reduce((s, v) => s + v, 0) / lista.length)}`);
  }
  ir("\nÉrtelmezés: ha a low eltérése nagyjából akkora, mint a zaj (ugyanazzal a szinttel kapott 2. futás),\n" +
    "akkor a gondolkodás visszavétele nem rontott a felismerésen; ha érdemben nagyobb, nézd át a különbségeket.");

  // ── pontosság az ellenőrzött átirathoz képest (ha van <név>.txt) ──
  const ellenorzott = dolgozatok.filter((d) => d.helyes != null);
  if (ellenorzott.length) {
    ir(`\n══ Pontosság az ellenőrzött átirathoz képest (${ellenorzott.length} dolgozat) – szó-szintű hibaarány, kisebb = jobb ══`);
    const szintenkent = {};
    for (const d of ellenorzott) {
      ir(`\n▸ ${d.nev}  (${szavak(d.helyes).length} szó a helyes átiratban)`);
      for (const x of futasok.filter((y) => y.dolgozat === d.nev)) {
        const k = kulonbseg(d.helyes, x.atirat);
        (szintenkent[x.szint] ??= []).push(k.wer);
        ir(`  ${`${x.szint} #${x.futas}`.padEnd(12)} ${szazalek(k.wer).padStart(6)}  (${k.tavolsag} szó)`);
        for (const kul of k.kulonbsegek.slice(0, 12)) ir(`      helyes: «${kul.a || "—"}»  →  AI: «${kul.b || "—"}»`);
        if (k.kulonbsegek.length > 12) ir(`      … és még ${k.kulonbsegek.length - 12} különbség`);
      }
    }
    ir("\n══ Átlagos hibaarány szintenként (az ellenőrzött dolgozatokon) ══");
    for (const szint of be.szintek) {
      const l = szintenkent[szint] || [];
      ir(`  ${szint.padEnd(10)} ${l.length ? szazalek(l.reduce((s, v) => s + v, 0) / l.length) : "—"}  (${l.length} futás)`);
    }
    ir("Kevés dolgozatnál néhány szó különbsége még zaj lehet: a két szint közötti, 1–2 százalékpontnál kisebb\n" +
      "eltérésből ne vonj le következtetést; a döntés ott egyértelmű, ahol a low érdemben rosszabb.");
  } else {
    ir("\n(Ellenőrzött átirat nélkül nem dönthető el, melyik szint olvas jobban – csak az, hogy mennyire térnek el.\n" +
      " Tegyél a fotó mellé <név>.txt fájlt a diák szavaival, hibákkal együtt: lásd a fájl elejét.)");
  }

  writeFileSync(join(ki, "osszegzes.txt"), sorok.join("\n"), "utf8");
  console.log(`\nEredmények: ${ki}`);
  return { futasok, ki };
}

// csak közvetlen futtatáskor indul (importálva a teszt a tiszta részeket használja)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  futtat(process.argv.slice(2)).catch((e) => {
    console.error(`\nHIBA: ${e.message}`);
    process.exit(1);
  });
}
