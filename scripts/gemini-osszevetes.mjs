// ══════════════════════════════════════════════════════
// Claude ↔ Gemini összevetés a már beküldött (Claude-dal javított) dolgozatokon
//
// A pilotból beolvassa a megadott idő óta frissült beadásokat, amelyeket Claude
// javított, és UGYANAZZAL az éles kóddal (prompt, séma, pontszámítás, jegyskála)
// Geminivel is lefuttatja az átírást és az értékelést. CSAK OLVAS: a Firestore-ba
// és a Storage-ba nem ír, a diák és a tanár a felületen nem lát változást.
// (Az ai_hasznalat-mérés sem fut: a hívások kontextus nélkül mennek.)
//
// Használat (a repo gyökeréből, PowerShellben):
//   $env:GEMINI_API_KEY = (firebase functions:secrets:access GEMINI_API_KEY --project pilot)
//   node scripts/gemini-osszevetes.mjs --ota 2026-11-05
// Kapcsolók:
//   --ota <ÉÉÉÉ-HH-NN | ISO-idő>   ennél frissebb beadások (alapból: az elmúlt 24 óra)
//   --feladat <id>                 csak ez a feladat
//   --ki <mappa>                   alapból tests/dolgozatok/osszevetes/<idő>
//
// Kell hozzá a helyi Google-hitelesítés (gcloud auth application-default login).
// Az eredmény (diákmunka!) a gitignore-olt tests/dolgozatok/ alatt marad.
// ══════════════════════════════════════════════════════

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJEKT = "writingreview-41e59";
process.env.GCLOUD_PROJECT = PROJEKT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJEKT, storageBucket: `${PROJEKT}.firebasestorage.app` });
process.env.AI_SZOLGALTATO = "gemini";

if (!process.env.GEMINI_API_KEY) {
  console.error("Hiányzik a GEMINI_API_KEY (lásd a fájl elején a használatot).");
  process.exit(1);
}

const arg = (nev, alap = null) => {
  const i = process.argv.indexOf(`--${nev}`);
  return i > 0 ? process.argv[i + 1] : alap;
};
const ota = arg("ota") ? new Date(arg("ota")) : new Date(Date.now() - 24 * 3600 * 1000);
if (Number.isNaN(ota.getTime())) {
  console.error("Érvénytelen --ota érték.");
  process.exit(1);
}
const csakFeladat = arg("feladat");
const kiMappa = arg("ki") || join("tests", "dolgozatok", "osszevetes", new Date().toISOString().replace(/[:.]/g, "-"));

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const index = require("./index.js");
const t = index._teszt;
const skala = require("./skala.js");
const { getFirestore } = require("firebase-admin/firestore");
t.AI.szolgaltato = "gemini";
const db = getFirestore();

/** Két szöveg szó-szintű eltérése (Levenshtein a szavakon), a hosszabbhoz viszonyítva. */
function szoEltérés(a, b) {
  const x = String(a || "").toLowerCase().split(/\s+/).filter(Boolean);
  const y = String(b || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!x.length && !y.length) return 0;
  let elozo = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const sor = [i];
    for (let j = 1; j <= y.length; j++) {
      sor[j] = Math.min(elozo[j] + 1, sor[j - 1] + 1, elozo[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    elozo = sor;
  }
  return elozo[y.length] / Math.max(x.length, y.length);
}

/** Leveles (íráskészség) dolgozat Geminivel – a feldolgozFutas() lépései írás nélkül. */
async function leveles(beadas, feladat) {
  let atirat;
  if (beadas.forras === "szoveg") {
    atirat = beadas.szoveg.trim();
  } else {
    const kepek = await t.kepekBetoltese(beadas.kep_paths);
    const { eredmeny } = await t.aiHivas("atiras", [{ text: t.atiratPrompt(t.nyelve(feladat.rubrika)) }, ...kepek], t.ATIRAT_SCHEMA);
    atirat = (eredmeny.atirat || "").trim();
  }
  const { eredmeny: ert } = await t.aiHivas(
    "ertekeles",
    [{ text: t.ertekelesPrompt({ ...feladat }, atirat, { beirt: beadas.forras === "szoveg" }) }],
    t.ERTEKELES_SCHEMA
  );
  const szempontok = t.szempontokTisztitas(ert.szempontok, feladat.rubrika, { hianyHiba: true });
  return {
    atirat,
    szempontok,
    osszpontszam: szempontok.reduce((s, sz) => s + sz.pont, 0),
    max_pontszam: szempontok.reduce((s, sz) => s + sz.max, 0),
    hibak_db: (ert.hibak || []).length
  };
}

const jegy = (feladat, pont, max) => skala.jegyJavaslat(pont, max, skala.skalaFeloldas(feladat.rubrika));
const szazalek = (p, m) => (m > 0 ? Math.round((p / m) * 100) : null);

const snap = await db.collection("beadasok").where("frissitve", ">=", ota).get();
const feladatok = new Map();
const sorok = [];
mkdirSync(kiMappa, { recursive: true });

console.log(`${snap.size} beadás frissült ${ota.toISOString()} óta; a Claude-dal javítottakat vetem össze.\n`);

for (const doc of snap.docs) {
  const beadas = doc.data();
  if (csakFeladat && beadas.feladat_id !== csakFeladat) continue;
  const claude = (await doc.ref.collection("ertekeles").doc("ai").get()).data();
  if (!claude || !String(claude.model || "").startsWith("claude-")) continue;

  if (!feladatok.has(beadas.feladat_id)) {
    const fs = await db.collection("feladatok").doc(beadas.feladat_id).get();
    feladatok.set(beadas.feladat_id, { ref: fs.ref, adat: fs.data() });
  }
  const { adat: feladat } = feladatok.get(beadas.feladat_id);
  const mod = "leveles";
  const nev = beadas.diak_nev || beadas.diak_id;
  process.stdout.write(`${nev} (${mod})… `);

  try {
    const gemini = await leveles(beadas, feladat);
    const sor = {
      diak: nev,
      feladat: feladat.cim || beadas.feladat_id,
      mod,
      claude_pont: `${claude.osszpontszam}/${claude.max_pontszam}`,
      claude_szazalek: szazalek(claude.osszpontszam, claude.max_pontszam),
      claude_jegy: jegy(feladat, claude.osszpontszam, claude.max_pontszam),
      gemini_pont: `${gemini.osszpontszam}/${gemini.max_pontszam}`,
      gemini_szazalek: szazalek(gemini.osszpontszam, gemini.max_pontszam),
      gemini_jegy: jegy(feladat, gemini.osszpontszam, gemini.max_pontszam),
      atirat_elteres_szazalek: beadas.forras === "szoveg" ? null : Math.round(szoEltérés(beadas.atirat, gemini.atirat) * 100)
    };
    sorok.push(sor);
    console.log(`Claude ${sor.claude_jegy} (${sor.claude_szazalek}%) | Gemini ${sor.gemini_jegy} (${sor.gemini_szazalek}%) | átirat-eltérés ${sor.atirat_elteres_szazalek ?? "–"}%`);

    // Diákonként a két átirat és a szempontok, kézi átnézéshez
    const reszlet = [
      `# ${nev} – ${sor.feladat} (${mod})`,
      "",
      `Claude: ${sor.claude_pont} → ${sor.claude_jegy} | Gemini: ${sor.gemini_pont} → ${sor.gemini_jegy}`,
      "",
      ...(mod === "leveles" ? ["## Szempontok (Claude | Gemini)", "",
        ...(gemini.szempontok || []).map((g) => {
          const c = (claude.szempontok || []).find((x) => x.kulcs === g.kulcs);
          return `- ${g.kulcs}: ${c ? c.pont : "?"} | ${g.pont} (max ${g.max})`;
        }), ""] : []),
      "## Claude átirata", "", beadas.atirat || "", "",
      "## Gemini átirata", "", gemini.atirat || "", ""
    ].join("\n");
    writeFileSync(join(kiMappa, `${String(nev).replace(/[^\p{L}\p{N}_-]+/gu, "_")}_${doc.id.slice(-6)}.md`), reszlet);
  } catch (e) {
    console.log(`HIBA: ${e.message}`);
    sorok.push({ diak: nev, mod, hiba: e.message });
  }
}

writeFileSync(join(kiMappa, "osszevetes.json"), JSON.stringify(sorok, null, 2));
const ok = sorok.filter((s) => !s.hiba);
const atlag = (k) => (ok.length ? Math.round(ok.reduce((s, x) => s + (x[k] || 0), 0) / ok.length) : null);
console.log(`\n${ok.length} dolgozat. Átlag: Claude ${atlag("claude_szazalek")}% | Gemini ${atlag("gemini_szazalek")}%`
  + ` | átlagos átirat-eltérés ${atlag("atirat_elteres_szazalek")}%`);
console.log(`Részletek: ${kiMappa}`);
process.exit(0);
