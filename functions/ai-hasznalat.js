// ══════════════════════════════════════════════════════
// AI-használat mérése – a tiszta (adatbázis nélküli) rész
//
// Minden Gemini-hívásról egy rekord készül az `ai_hasznalat` gyűjteménybe:
// ki (tanár), melyik művelet, melyik modell, hány token (bemenet / kimenet /
// gondolkodás). A rekord NEM tartalmaz diákmunkát vagy szöveget, csak
// azonosítókat és számokat. Csak a szerver írja és olvassa (admin SDK);
// az admin felület az `aiHasznalatJelentes` Function összesítőjét látja.
//
// A költséget (USD) a jelentés számolja az ARAK táblából, a tokenekből –
// így egy árjavítás visszamenőleg is helyesbít. Lásd docs/kornyezetek-terv.md 5.1.
// ══════════════════════════════════════════════════════

/**
 * Árak: USD / 1 millió token (fizetős szint). Forrás: a functions/index.js
 * MODELLEK-kommentje (2026-09 állapot). A gondolkodási tokenek kimenetként
 * számlázódnak. Ismeretlen (a táblában nem szereplő) modellnél a költség null, és a jelentés jelzi.
 * FIGYELEM: a `gemini-3.8-flash` ára a kommentje szerint 2027-01-01-től
 * duplázódik – a táblát akkor frissíteni kell (a jelentés számolója ár-szorzót is kínál).
 */
const ARAK = {
  "gemini-3.8-flash": { be: 0.75, ki: 3.75 },
  "gemini-3.7-flash": { be: 0.75, ki: 3.75 },   // ugyanannyi, mint a 3.8 (a tulajdonos megerősítése)
  "gemini-3.5-flash-lite": { be: 0.30, ki: 2.50 }
};

/** A műveletek, amiket a rekord `muvelet` mezője felvehet. */
const MUVELETEK = ["feladatlap", "kulcs", "beadas_atiras", "beadas_ertekeles", "elemzes"];

const szam = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0);

/** A Gemini-válasz usageMetadata-jából a tokenszámok (hiányzó mező = 0). */
function hasznalatKinyeres(json) {
  const u = json?.usageMetadata || {};
  const prompt = szam(u.promptTokenCount);
  const kimenet = szam(u.candidatesTokenCount);
  const gondolkodas = szam(u.thoughtsTokenCount);
  return { prompt, kimenet, gondolkodas, ossz: szam(u.totalTokenCount) || prompt + kimenet + gondolkodas };
}

/** Egy rekord költsége USD-ben; null, ha a modell ára nem ismert. */
function koltsegUsd(rekord, arak = ARAK) {
  const ar = Object.hasOwn(arak, rekord?.modell) ? arak[rekord.modell] : null;
  if (!ar) return null;
  return (szam(rekord.prompt) * ar.be + (szam(rekord.kimenet) + szam(rekord.gondolkodas)) * ar.ki) / 1e6;
}

/** A kérés részeiből: hány kép ment, és nagyjából hány bájt bemenet (base64-ből visszaszámolva). */
function bemenetJellemzo(parts) {
  let kepDb = 0;
  let bajt = 0;
  for (const p of Array.isArray(parts) ? parts : []) {
    const d = p?.inline_data;
    if (!d?.data) continue;
    if (String(d.mime_type || "").startsWith("image/")) kepDb++;
    bajt += Math.floor((d.data.length * 3) / 4);
  }
  return { kep_db: kepDb, bemenet_bajt: bajt };
}

/**
 * Az `ai_hasznalat` rekord (az időbélyeget a hívó adja: serverTimestamp).
 * @param {{tanar_id, muvelet, feladat_id?, beadas_id?, mod?}} kontextus
 */
function rekordKeszites({ kontextus, modell, fo_modell, hasznalat, probalkozas, parts, kornyezet }) {
  return {
    tanar_id: kontextus.tanar_id || null,
    muvelet: kontextus.muvelet,
    mod: kontextus.mod || null,                  // beadásnál: leveles | kifejtos
    feladat_id: kontextus.feladat_id || null,
    beadas_id: kontextus.beadas_id || null,
    modell,
    tartalek: Boolean(fo_modell && modell !== fo_modell),
    probalkozas: probalkozas || 1,               // hány kérés kellett (átmeneti hibák után)
    prompt: hasznalat.prompt,
    kimenet: hasznalat.kimenet,
    gondolkodas: hasznalat.gondolkodas,
    ossz: hasznalat.ossz,
    ...bemenetJellemzo(parts),
    kornyezet: kornyezet || null
  };
}

/** Egy hónap UTC-határai az `ÉÉÉÉ-HH` kulcsból; érvénytelen kulcsnál az aktuális hónap. */
function honapHatarok(kulcs, most = new Date()) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(kulcs || ""));
  const ev = m ? Number(m[1]) : most.getUTCFullYear();
  const ho = m ? Number(m[2]) : most.getUTCMonth() + 1;
  return {
    kulcs: `${ev}-${String(ho).padStart(2, "0")}`,
    tol: new Date(Date.UTC(ev, ho - 1, 1)),
    ig: new Date(Date.UTC(ev, ho, 1))
  };
}

const ures = () => ({ hivas: 0, prompt: 0, kimenet: 0, gondolkodas: 0, koltseg_usd: 0, ismeretlen_ar_hivas: 0 });

function hozzaad(csoport, r, koltseg) {
  csoport.hivas++;
  csoport.prompt += szam(r.prompt);
  csoport.kimenet += szam(r.kimenet);
  csoport.gondolkodas += szam(r.gondolkodas);
  if (koltseg === null) csoport.ismeretlen_ar_hivas++;
  else csoport.koltseg_usd += koltseg;
}

/** Egy csoport, plusz az átlag-költség (a költséges hívásokból). */
function lezar(cs, nev) {
  const ismert = cs.hivas - cs.ismeretlen_ar_hivas;
  return { ...nev, ...cs, atlag_koltseg_usd: ismert > 0 ? cs.koltseg_usd / ismert : null };
}

/**
 * A rekordokból az admin jelentés.
 *
 * "Javítási futás" = egy `beadas_atiras` hívás (minden futás pontosan eggyel
 * kezdődik): a futás költsége az átírás és az értékelés együtt, a futások
 * átlaga a dolgozatonkénti költség (az újrafuttatásokkal együtt).
 *
 * @param {object[]} rekordok ai_hasznalat rekordok
 * @param {{tanarok?: Record<string,{nev,email}>, feladatok?: Record<string,{cim}>}} [nevek]
 */
function jelentesOsszeallitas(rekordok, nevek = {}, arak = ARAK) {
  const osszes = ures();
  const muveletek = {};
  const modellek = {};
  const tanarok = {};
  const feladatok = {};
  const futas = { mind: { db: 0, usd: 0 }, leveles: { db: 0, usd: 0 }, kifejtos: { db: 0, usd: 0 } };

  for (const r of rekordok) {
    const koltseg = koltsegUsd(r, arak);
    hozzaad(osszes, r, koltseg);
    hozzaad((muveletek[r.muvelet] ??= ures()), r, koltseg);
    hozzaad((modellek[r.modell] ??= ures()), r, koltseg);

    const tanar = (tanarok[r.tanar_id || "?"] ??= { ...ures(), futas_db: 0 });
    hozzaad(tanar, r, koltseg);

    if (r.feladat_id) {
      const f = (feladatok[r.feladat_id] ??= { ...ures(), futas_db: 0, beadas_usd: 0, mod: r.mod || null, tanar_id: r.tanar_id || null });
      hozzaad(f, r, koltseg);
      if (String(r.muvelet).startsWith("beadas_")) f.beadas_usd += koltseg ?? 0;
      if (r.muvelet === "beadas_atiras") f.futas_db++;
    }

    if (String(r.muvelet).startsWith("beadas_")) {
      const ertek = koltseg ?? 0;
      futas.mind.usd += ertek;
      if (r.mod === "leveles" || r.mod === "kifejtos") futas[r.mod].usd += ertek;
      if (r.muvelet === "beadas_atiras") {
        tanar.futas_db++;
        futas.mind.db++;
        if (r.mod === "leveles" || r.mod === "kifejtos") futas[r.mod].db++;
      }
    }
  }

  const atlag = (f) => (f.db > 0 ? { futas_db: f.db, koltseg_usd: f.usd, atlag_koltseg_usd: f.usd / f.db } : { futas_db: 0, koltseg_usd: 0, atlag_koltseg_usd: null });
  const rendez = (a, b) => b.koltseg_usd - a.koltseg_usd;

  return {
    osszes: lezar(osszes, {}),
    // dolgozatonkénti költség: összesen és típusonként (a számoló ebből dolgozik)
    beadas: { mind: atlag(futas.mind), leveles: atlag(futas.leveles), kifejtos: atlag(futas.kifejtos) },
    muvelet: Object.entries(muveletek).map(([nev, cs]) => lezar(cs, { muvelet: nev })).sort(rendez),
    modell: Object.entries(modellek).map(([nev, cs]) => lezar(cs, { modell: nev, ismert_ar: Object.hasOwn(arak, nev) })).sort(rendez),
    tanar: Object.entries(tanarok).map(([id, cs]) => lezar(cs, {
      tanar_id: id, nev: nevek.tanarok?.[id]?.nev || null, email: nevek.tanarok?.[id]?.email || null
    })).sort(rendez),
    feladat: Object.entries(feladatok).map(([id, cs]) => {
      const sor = lezar(cs, { feladat_id: id, cim: nevek.feladatok?.[id]?.cim || null });
      // a feladat átlaga dolgozatonként: csak a javítási futások költsége, a futások számára vetítve
      sor.atlag_futas_usd = cs.futas_db > 0 ? cs.beadas_usd / cs.futas_db : null;
      return sor;
    }).sort(rendez).slice(0, 25)
  };
}

module.exports = {
  ARAK, MUVELETEK, hasznalatKinyeres, koltsegUsd, bemenetJellemzo, rekordKeszites, honapHatarok, jelentesOsszeallitas
};
