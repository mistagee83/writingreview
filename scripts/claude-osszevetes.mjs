// ══════════════════════════════════════════════════════
// Gemini → Claude összevetés a prod már kijavított dolgozatain (a Claude-prompt hangolásához)
//
// A prodból (mrashub) beolvassa a Geminivel értékelt beadásokat, és UGYANAZZAL a kóddal
// (értékelő prompt, séma, szempont-tisztítás, jegyskála) Claude-dal is lefuttatja az értékelést.
// Ha a tanár már jóváhagyta a dolgozatot (ertekeles/tanari), az ő pontjai is bekerülnek:
// az a legjobb mérce. CSAK OLVAS: a Firestore-ba nem ír, kreditet nem von le, ai_hasznalat-rekord
// sem készül (a hívások kontextus nélkül mennek); a diák és a tanár a felületen nem lát változást.
//
// Használat (a repo gyökeréből, PowerShellben):
//   $env:ANTHROPIC_API_KEY = (firebase functions:secrets:access ANTHROPIC_API_KEY --project pilot)
//   node scripts/claude-osszevetes.mjs --ota 2026-11-01
// Kapcsolók:
//   --ota <ÉÉÉÉ-HH-NN | ISO-idő>   ennél frissebb beadások (alapból: az elmúlt 60 nap)
//   --feladat <id>                 csak ez a feladat
//   --limit <n>                    legfeljebb ennyi dolgozat
//   --valtozat <név>               prompt-változat: scripts/claude-hangolas/<név>.mjs (alapból: az éles prompt)
//   --effort <low|medium|high>     a Claude gondolkodási szintje (alapból a változaté, különben a modell alapja)
//   --parhuzam <n>                 egyszerre futó hívások (alapból 3)
//   --szolgaltato <claude|gemini>  ki értékeljen újra (alapból claude; gemini: $env:GEMINI_API_KEY kell,
//                                  pl. firebase functions:secrets:access GEMINI_API_KEY --project prod)
//   --szaraz                       AI-hívás nélkül: csak kilistázza, mit vetne össze (kulcs sem kell)
//   --ki <mappa>                   alapból tests/dolgozatok/claude-hangolas/<idő>_<változat>
//
// Prompt-változat (scripts/claude-hangolas/<név>.mjs), minden export opcionális:
//   export const leiras = "…";
//   export const effort = "medium";
//   export function prompt(feladat, szoveg, alapPrompt) { return alapPrompt + "\n…"; }
//
// Kell hozzá a helyi Google-hitelesítés (gcloud auth application-default login), olvasási joggal
// a mrashub projekten. Az eredmény (diákmunka!) a gitignore-olt tests/dolgozatok/ alatt marad.
// ══════════════════════════════════════════════════════

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROJEKT = "mrashub";
process.env.GCLOUD_PROJECT = PROJEKT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJEKT });
process.env.KORNYEZET = "prod";
// A szolgáltatót a betöltés UTÁN állítjuk át (t.AI): így az index.js nem deklarálja a titkot,
// és a kliens a process.env.ANTHROPIC_API_KEY-t használja.
delete process.env.AI_SZOLGALTATO;

const arg = (nev, alap = null) => {
  const i = process.argv.indexOf(`--${nev}`);
  return i > 0 ? process.argv[i + 1] : alap;
};
const kapcsolo = (nev) => process.argv.includes(`--${nev}`);

const szaraz = kapcsolo("szaraz");
const SZOLG = arg("szolgaltato") === "gemini" ? "gemini" : "claude";
const UJ = SZOLG === "gemini" ? "Gemini (új)" : "Claude";
// A PowerShell-lel beolvasott kulcs végén lehet szóköz/sortörés (vagy a CLI több sort ad): a kulcs az utolsó nem üres sor.
const kulcsSorok = String(process.env.ANTHROPIC_API_KEY || "").split(/\s+/).filter(Boolean);
process.env.ANTHROPIC_API_KEY = kulcsSorok.find((s) => s.startsWith("sk-ant-")) || kulcsSorok.at(-1) || "";
const gKulcs = String(process.env.GEMINI_API_KEY || "").split(/\s+/).filter(Boolean);
process.env.GEMINI_API_KEY = gKulcs.find((s) => s.startsWith("AIza")) || gKulcs.at(-1) || "";
const kulcsNev = SZOLG === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
if (!szaraz && !process.env[kulcsNev]) {
  console.error(`Hiányzik a(z) ${kulcsNev} (lásd a fájl elején a használatot).`);
  process.exit(1);
}
const ota = arg("ota") ? new Date(arg("ota")) : new Date(Date.now() - 60 * 24 * 3600 * 1000);
if (Number.isNaN(ota.getTime())) {
  console.error("Érvénytelen --ota érték.");
  process.exit(1);
}
const csakFeladat = arg("feladat");
const limit = Number(arg("limit")) || Infinity;
const parhuzam = Math.max(1, Number(arg("parhuzam")) || 3);
const valtozatNev = arg("valtozat") || "alap";

let valtozat = {};
if (valtozatNev !== "alap") {
  const ut = resolve("scripts", "claude-hangolas", `${valtozatNev}.mjs`);
  if (!existsSync(ut)) {
    console.error(`Nincs ilyen változat: ${ut}`);
    process.exit(1);
  }
  valtozat = await import(pathToFileURL(ut).href);
}
const effort = arg("effort") || valtozat.effort || null;

const ido = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const kiMappa = arg("ki") || join("tests", "dolgozatok", "claude-hangolas", `${ido}_${valtozatNev}_${SZOLG}${effort ? `_${effort}` : ""}`);

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const index = require("./index.js");
const skala = require("./skala.js");
const t = index._teszt;
const { getFirestore } = require("firebase-admin/firestore");
t.AI.szolgaltato = SZOLG;
const UJ_MODELL = SZOLG === "gemini" ? t.MODELLEK.ertekeles : t.CLAUDE_MODELLEK.ertekeles;
const db = getFirestore();

const jegy = (feladat, pont, max) => skala.jegyJavaslat(pont, max, skala.skalaFeloldas(feladat.rubrika));
const szazalek = (p, m) => (m > 0 ? Math.round((p / m) * 1000) / 10 : null);
const kerekit = (x) => (x == null ? null : Math.round(x * 10) / 10);

// ── A dolgozatok összegyűjtése ──
const snap = await db.collection("beadasok").where("frissitve", ">=", ota).get();
const feladatok = new Map();
const munkak = [];
for (const doc of snap.docs) {
  const beadas = doc.data();
  if (csakFeladat && beadas.feladat_id !== csakFeladat) continue;
  if (beadas.forras !== "szoveg" || !String(beadas.szoveg || "").trim()) continue;
  const [aiSnap, tanariSnap] = await Promise.all([
    doc.ref.collection("ertekeles").doc("ai").get(),
    doc.ref.collection("ertekeles").doc("tanari").get()
  ]);
  const gemini = aiSnap.data();
  if (!gemini || !String(gemini.model || "").startsWith("gemini-")) continue;
  if (!feladatok.has(beadas.feladat_id)) {
    const fs = await db.collection("feladatok").doc(beadas.feladat_id).get();
    feladatok.set(beadas.feladat_id, fs.data() || null);
  }
  const feladat = feladatok.get(beadas.feladat_id);
  if (!feladat?.rubrika) continue;
  munkak.push({ id: doc.id, beadas, feladat, gemini, tanari: tanariSnap.exists ? tanariSnap.data() : null });
  if (munkak.length >= limit) break;
}

console.log(`${snap.size} beadás frissült ${ota.toISOString().slice(0, 10)} óta; ebből ${munkak.length} Geminivel értékelt, beírt dolgozat.`);
console.log(`Változat: ${valtozatNev}${valtozat.leiras ? ` – ${valtozat.leiras}` : ""} | effort: ${effort || "alap"} | újraértékel: ${UJ} (${UJ_MODELL})\n`);

if (szaraz) {
  for (const m of munkak) {
    console.log(`- ${m.beadas.diak_nev || m.beadas.becenev || m.id} | ${m.feladat.cim} | Gemini ${m.gemini.osszpontszam}/${m.gemini.max_pontszam}`
      + (m.tanari ? ` | tanár ${m.tanari.osszpontszam}/${m.tanari.max_pontszam}, jegy ${m.tanari.jegy}` : " | nincs tanári jóváhagyás"));
  }
  process.exit(0);
}

// ── Claude-értékelés ──
async function claudeErtekeles(m) {
  const szoveg = m.beadas.szoveg.trim();
  // A változat a rubrikát is lecserélheti (pl. érettségi sablon); a jegyet akkor is a feladat saját skálája adja,
  // a százalékon keresztül, így a jegyek összevethetők.
  const feladat = typeof valtozat.rubrika === "function"
    ? { ...m.feladat, rubrika: { ...valtozat.rubrika(m.feladat), skala: m.feladat.rubrika.skala } }
    : m.feladat;
  const alapPrompt = t.ertekelesPrompt({ ...feladat }, szoveg);
  const prompt = typeof valtozat.prompt === "function" ? valtozat.prompt(feladat, szoveg, alapPrompt) : alapPrompt;
  const kezd = Date.now();
  const { eredmeny, hasznalat } = SZOLG === "gemini"
    ? await t.geminiKeres(UJ_MODELL, [{ text: prompt }], t.ERTEKELES_SCHEMA, undefined)
    : await t.claudeKeres(UJ_MODELL, [{ text: prompt }], t.ERTEKELES_SCHEMA, effort || undefined);
  const szempontok = t.szempontokTisztitas(eredmeny.szempontok, feladat.rubrika, { hianyHiba: true });
  return {
    szempontok,
    osszpontszam: szempontok.reduce((s, sz) => s + sz.pont, 0),
    max_pontszam: szempontok.reduce((s, sz) => s + sz.max, 0),
    hibak: eredmeny.hibak || [],
    erossegek: eredmeny.erossegek || [],
    fejlesztendo: eredmeny.fejlesztendo || [],
    diak_szoveg: eredmeny.diak_szoveg || "",
    hasznalat,
    mp: Math.round((Date.now() - kezd) / 1000)
  };
}

const sorok = new Array(munkak.length);
let kovetkezo = 0;
async function dolgozo() {
  while (kovetkezo < munkak.length) {
    const i = kovetkezo++;
    const m = munkak[i];
    const nev = m.beadas.diak_nev || m.beadas.becenev || m.id.slice(-6);
    let claude = null;
    let hiba = null;
    for (let k = 0; k < 3 && !claude; k++) {
      try {
        claude = await claudeErtekeles(m);
      } catch (e) {
        hiba = e.message;
        if (/\b401\b|authentication_error/.test(e.message)) {
          console.error(`\nA kulcsot az Anthropic nem fogadta el (401): ${e.message}\nLeállok, hogy ne fusson le hiába az összes dolgozat.`);
          process.exit(1);
        }
        if (!e.atmeneti && !/hiányzik/.test(e.message)) break;
      }
    }
    if (!claude) {
      console.log(`${nev}: HIBA – ${hiba}`);
      sorok[i] = { id: m.id, diak: nev, feladat: m.feladat.cim, hiba };
      continue;
    }
    const f = m.feladat;
    const sor = {
      id: m.id,
      diak: nev,
      feladat: f.cim || m.beadas.feladat_id,
      szint: f.rubrika?.szint || null,
      szoszam: m.beadas.szoveg.trim().split(/\s+/).length,
      max: claude.max_pontszam,
      gemini: { pont: m.gemini.osszpontszam, szazalek: szazalek(m.gemini.osszpontszam, m.gemini.max_pontszam), jegy: jegy(f, m.gemini.osszpontszam, m.gemini.max_pontszam), hibak_db: (m.gemini.hibak || []).length },
      claude: { pont: claude.osszpontszam, szazalek: szazalek(claude.osszpontszam, claude.max_pontszam), jegy: jegy(f, claude.osszpontszam, claude.max_pontszam), hibak_db: claude.hibak.length },
      tanar: m.tanari?.osszpontszam != null
        ? { pont: m.tanari.osszpontszam, szazalek: szazalek(m.tanari.osszpontszam, m.tanari.max_pontszam), jegy: m.tanari.jegy ?? null }
        : null,
      szempontok: claude.szempontok.map((c) => {
        const g = (m.gemini.szempontok || []).find((x) => x.kulcs === c.kulcs);
        const tt = (m.tanari?.szempontok || []).find((x) => x.kulcs === c.kulcs);
        return { kulcs: c.kulcs, max: c.max, claude: c.pont, gemini: g?.pont ?? null, tanar: tt?.pont ?? null };
      }),
      tokenek: claude.hasznalat,
      mp: claude.mp
    };
    sorok[i] = sor;
    console.log(`${nev}: Gemini ${sor.gemini.pont}/${sor.max} (${sor.gemini.jegy}) | ${UJ} ${sor.claude.pont}/${sor.max} (${sor.claude.jegy})`
      + (sor.tanar ? ` | tanár ${sor.tanar.pont} (${sor.tanar.jegy})` : "") + ` | ${sor.mp} mp`);

    // Dolgozatonként a részletek, kézi átnézéshez
    const md = [
      `# ${nev} – ${sor.feladat}`,
      "",
      `Gemini: ${sor.gemini.pont}/${sor.max} → ${sor.gemini.jegy} | ${UJ}: ${sor.claude.pont}/${sor.max} → ${sor.claude.jegy}`
        + (sor.tanar ? ` | Tanár: ${sor.tanar.pont} → ${sor.tanar.jegy}` : ""),
      "",
      `## Szempontok (Gemini, eredeti | ${UJ} | tanár)`,
      "",
      ...sor.szempontok.map((s) => `- ${s.kulcs}: ${s.gemini ?? "?"} | ${s.claude} | ${s.tanar ?? "–"} (max ${s.max})`),
      "",
      `## ${UJ} szempont-megjegyzései`,
      "",
      ...claude.szempontok.map((s) => `- **${s.kulcs}** (${s.pont}/${s.max}): ${s.megjegyzes}`),
      "",
      "## Gemini (eredeti) szempont-megjegyzései",
      "",
      ...(m.gemini.szempontok || []).map((s) => `- **${s.kulcs}** (${s.pont}/${s.max}): ${s.megjegyzes}`),
      "",
      `## ${UJ} hibái (${claude.hibak.length})`,
      "",
      ...claude.hibak.map((h) => `- [${h.kategoria}/${h.tipus}] „${h.idezet}” → „${h.javaslat}” – ${h.magyarazat}`),
      "",
      `## Gemini (eredeti) hibái (${(m.gemini.hibak || []).length})`,
      "",
      ...(m.gemini.hibak || []).map((h) => `- [${h.kategoria}/${h.tipus}] „${h.idezet}” → „${h.javaslat}” – ${h.magyarazat}`),
      "",
      "## A dolgozat",
      "",
      m.beadas.szoveg.trim(),
      ""
    ].join("\n");
    writeFileSync(join(kiMappa, `${String(nev).replace(/[^\p{L}\p{N}_-]+/gu, "_")}_${m.id.slice(-6)}.md`), md);
  }
}

mkdirSync(kiMappa, { recursive: true });
await Promise.all(Array.from({ length: Math.min(parhuzam, munkak.length) }, dolgozo));

// ── Összesítés ──
const ok = sorok.filter((s) => s && !s.hiba);
const atl = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const osszesites = { megjegyzes: "a 'claude' mezők az újraértékelő modellt jelentik (szolgaltato), a 'gemini' mezők az eredeti, éles Gemini-értékelést", szolgaltato: SZOLG, valtozat: valtozatNev, leiras: valtozat.leiras || null, effort, modell: UJ_MODELL, db: ok.length, hibas: sorok.length - ok.length };
osszesites.atlag_szazalek = {
  gemini: kerekit(atl(ok.map((s) => s.gemini.szazalek))),
  claude: kerekit(atl(ok.map((s) => s.claude.szazalek))),
  tanar: kerekit(atl(ok.filter((s) => s.tanar).map((s) => s.tanar.szazalek)))
};
const elteres = (ref) => {
  const xs = ok.filter((s) => s[ref]?.szazalek != null);
  return {
    db: xs.length,
    atlagos_elteres: kerekit(atl(xs.map((s) => s.claude.szazalek - s[ref].szazalek))),   // + = Claude engedékenyebb
    atlagos_abs_elteres: kerekit(atl(xs.map((s) => Math.abs(s.claude.szazalek - s[ref].szazalek)))),
    jegy_egyezes: xs.length ? `${xs.filter((s) => String(s.claude.jegy) === String(s[ref].jegy)).length}/${xs.length}` : null
  };
};
osszesites.claude_vs_gemini = elteres("gemini");
osszesites.claude_vs_tanar = elteres("tanar");
osszesites.gemini_vs_tanar = (() => {
  const xs = ok.filter((s) => s.tanar);
  return {
    db: xs.length,
    atlagos_elteres: kerekit(atl(xs.map((s) => s.gemini.szazalek - s.tanar.szazalek))),
    atlagos_abs_elteres: kerekit(atl(xs.map((s) => Math.abs(s.gemini.szazalek - s.tanar.szazalek)))),
    jegy_egyezes: xs.length ? `${xs.filter((s) => String(s.gemini.jegy) === String(s.tanar.jegy)).length}/${xs.length}` : null
  };
})();
// Szempontonként: a Claude átlagos eltérése a Geminitől, a szempont maximumának %-ában
const kulcsok = new Map();
for (const s of ok) {
  for (const sz of s.szempontok) {
    if (sz.gemini == null || !(sz.max > 0)) continue;
    const k = kulcsok.get(sz.kulcs) || { db: 0, cg: [], ct: [] };
    k.db++;
    k.cg.push(((sz.claude - sz.gemini) / sz.max) * 100);
    if (sz.tanar != null) k.ct.push(((sz.claude - sz.tanar) / sz.max) * 100);
    kulcsok.set(sz.kulcs, k);
  }
}
osszesites.szempontonkent = Object.fromEntries([...kulcsok].map(([k, v]) => [k, {
  db: v.db, claude_vs_gemini: kerekit(atl(v.cg)), claude_vs_tanar: v.ct.length ? kerekit(atl(v.ct)) : null
}]));
osszesites.hibak_db_atlag = { gemini: kerekit(atl(ok.map((s) => s.gemini.hibak_db))), claude: kerekit(atl(ok.map((s) => s.claude.hibak_db))) };
const tok = ok.reduce((a, s) => ({ be: a.be + (s.tokenek?.prompt || 0), ki: a.ki + (s.tokenek?.kimenet || 0) }), { be: 0, ki: 0 });
const ar = SZOLG === "gemini" ? { be: 0.75, ki: 3.75 } : { be: 2, ki: 10 };
// A Gemini gondolkodási tokenjei külön mezőben jönnek, de kimenetként számlázódnak.
const gond = ok.reduce((a, s) => a + (s.tokenek?.gondolkodas || 0), 0);
osszesites.tokenek = { ...tok, gondolkodas: gond, becsult_usd: Math.round(((tok.be * ar.be + (tok.ki + gond) * ar.ki) / 1e6) * 100) / 100 };

writeFileSync(join(kiMappa, "eredmeny.json"), JSON.stringify({ osszesites, sorok }, null, 2));
console.log("\n" + JSON.stringify(osszesites, null, 2));
console.log(`\nRészletek: ${kiMappa}`);
process.exit(0);
