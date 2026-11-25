// Az érettségi írásfeladatok gépi kinyerése a feladatlapokból (docs/erettsegi-feladattar-terv.md, 4. fejezet).
//
// Használat:
//   node scripts/erettsegi/kinyer.mjs [forrásmappa]          mind a 91 lap → functions/feladattar/erettsegi/
//   node scripts/erettsegi/kinyer.mjs [forrásmappa] --nyers <lap-id>   egy lap tisztított sorai (hibakereséshez)
// A forrásmappa alapértéke az ERETTSEGI_FORRAS környezeti változó, különben a tulajdonos gépén lévő mappa.
// A forrásmappát csak olvassuk. Kell hozzá a pdftotext (poppler).
//
// A kimenetet kézzel nem szerkesztjük: ami a PDF szövegéből gépileg nem olvasható ki (cím, összecsúszott
// sorok, képes feladat), az a kezi.mjs-ben van, és minden futás újragenerálja a fájlokat.
// A szöveg a -raw kimenetből jön (a táblázatos részek a -layout kimenetben összecsúsznak); a bekezdéshatárokat
// a -layout kimenet üres sorai adják.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { KEZI, CIMEK } from "./kezi.mjs";
import { sablonok } from "./sablonok.mjs";

const ITT = dirname(fileURLToPath(import.meta.url));
const GYOKER = join(ITT, "..", "..");
export const KIMENET = join(GYOKER, "functions", "feladattar", "erettsegi");
const args = process.argv.slice(2);
const FORRAS = (args[0] && !args[0].startsWith("--") ? args[0] : null)
  || process.env.ERETTSEGI_FORRAS || "D:/Dokumentumok/Tanári segédanyagok/e-books/Érettségi 2005-2026";

const LISTA = JSON.parse(readFileSync(join(ITT, "forraslista.json"), "utf8"));
const KEPEK = JSON.parse(readFileSync(join(ITT, "oldalkepek.json"), "utf8"));

const pdf = (f, mod) => {
  const r = spawnSync("pdftotext", [mod, "-enc", "UTF-8", f, "-"], { maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error("pdftotext hiba: " + f + "\n" + r.stderr);
  return cesu(r.stdout);
};
/** A pdftotext a BMP-n kívüli jeleket (pl. emoji) CESU-8 helyettesítő párként írja ki: ezt UTF-8-ra javítjuk. */
export function cesu(buf) {
  const ki = []; let i = 0;
  while (i < buf.length) {
    if (buf[i] === 0xed && (buf[i + 1] & 0xf0) === 0xa0 && buf[i + 3] === 0xed && (buf[i + 4] & 0xf0) === 0xb0) {
      const hi = 0xd800 + ((buf[i + 1] & 0x0f) << 6) + (buf[i + 2] & 0x3f);
      const lo = 0xdc00 + ((buf[i + 4] & 0x0f) << 6) + (buf[i + 5] & 0x3f);
      ki.push(Buffer.from(String.fromCharCode(hi, lo), "utf8")); i += 6;
    } else { const j = buf.indexOf(0xed, i + 1); const v = j < 0 ? buf.length : j; ki.push(buf.subarray(i, v)); i = v; }
  }
  return Buffer.concat(ki).toString("utf8");
}
const sp = (s) => s.replace(/\s+/g, " ").trim();
const PONT = /^[•▪●➢]\s*/;   // felsorolásjelek (a PUA-jeleket is)
const BULLET = /^(?:•|[-–] )\s*/;
const KEZDES = /^(?:Begin|Start)\b.*like this/;
const ALPONT = /^(?:o|\u0083|\uF0A8)\s+/;
const IRAS_OLDAL = /IV\. ?(?:összetevő|vizsgarész)|Angol nyelv IV\./;
const CIMKE = /^(?:Task|TASK) ([12AB])$/;
const SZEMET = [
  /írásbeli vizsga/, /^Angol nyelv\b/, /^(?:emelt|közép) ?szint(?:ű)?$/, /^\d{4}$/, /^[EK]\d{4}\b/, /^Azonosító/,
  /^jel:?$/, /^Név:/, /Figyelem! A feladat(?:sor)? a következő oldalon folytatódik/, /^\d{4}\. \S+ \d+\.$/,
  /^[…. ]*$/, /^\d*[.…]*…[….]*$/, /^[-–—]$/,
];
// a pontozott válaszsor (a sorszámmal együtt: „5……”, „10.……”)
const VALASZSOR = /^\d*\.?[….…]{4,}/;

/**
 * A lap írásrészének tisztított sorai oldalszámmal ([{ s, oldal }]), és a -layout kimenet két jele:
 * ures = a sor után üres sor áll (bekezdés vége lehet); oszlop = a sor egy több hasábos sor egyik darabja
 * (pl. két oszlopba szedett felsorolás eleme).
 */
function irasSorok(fajl) {
  const raw = pdf(fajl, "-raw").split("\f");
  const lay = pdf(fajl, "-layout").split("\f");
  const sorok = [], vegek = { ures: new Set(), oszlop: new Set() };
  raw.forEach((oldal, i) => {
    if (!IRAS_OLDAL.test(oldal)) return;
    const sorai = oldal.split(/\r?\n/).flatMap((l) => l.split(/\s+(?=[\uF0A7\uF0B7\uF0D8]\s)/));
    for (const l of sorai) {
      const s = l.trim().replace(/[\uFB00-\uFB04]/g, (c) => c.normalize("NFKC"))
        .replace(//g, "☺").replace(//g, "☹")   // Wingdings-emotikonok
        .replace(PONT, "• ").replace(/^¾ (?=[A-Z])/, "• ");
      if (!s || SZEMET.some((r) => r.test(s)) || VALASZSOR.test(s)) continue;
      sorok.push({ s, oldal: i + 1 });
    }
    const L = (lay[i] || "").split(/\r?\n/);
    L.forEach((l, j) => {
      if (l.trim() && (L[j + 1] === undefined || !L[j + 1].trim())) vegek.ures.add(sp(l));
      const darabok = l.trim().split(/\s{3,}/);
      if (darabok.length > 1) for (const d of darabok) vegek.oszlop.add(sp(d));
    });
  });
  return { sorok, vegek };
}

/** A feladatok nyers sorai: a címke első előfordulásától a következő címkéig vagy a pontozótábláig. */
function feladatBlokkok(sorok) {
  const blokkok = []; let akt = null;
  for (const x of sorok) {
    const c = CIMKE.exec(x.s);
    if (c) {
      if (blokkok.some((b) => b.jeloles === c[1])) { akt = null; continue; }   // a válaszoldal fejléce
      akt = { jeloles: c[1], sorok: [] }; blokkok.push(akt); continue;
    }
    if (/értékelése:$|^This is the end|^Maximális$|^pontszám$/i.test(x.s)) { akt = null; continue; }
    if (akt) akt.sorok.push(x);
  }
  return blokkok.filter((b) => b.sorok.length);
}

const SZOSZAM = /(?:about |approximately |around )?\d+\s*[-–]\s*\d+(?: words)?|(?:about |approximately |around )?\d+ words/;
const MUFAJ = /\b(?:write|writing|in|send)\s+(?:[A-Z][a-z]+\s+)?(?:a|an|and)\s+(?:short\s+|formal\s+|informal\s+|personal\s+|brief\s+)?(e-?mail|letter|blog post|blog entry|blog|forum post|post|comment|article|essay|message|note|review|story|report|entry|reply|contribution|application|text message)\b/i;

/**
 * Bekezdésekre bontás. Egy sor után új bekezdés kezdődik, ha
 *  - a -layout kimenetben üres sor követi, és a következő sor nem kisbetűvel folytatódik;
 *  - mondatvégi írásjellel zárul, rövidebb a szöveg sorainál, és a következő sor nagybetűvel kezdődik;
 *  - több hasábos sor darabja (pl. két oszlopos felsorolás), és nem vesszővel vagy kötőjellel zárul;
 *  - a következő sor felsorolásjellel kezdődik.
 */
const MONDATVEG = /[.!?:"”’)…]$/;
const URL_VEG = /\S+@\S+$|\.(?:com|org|net|uk)\/?$/;   // e-mail-címmel vagy webcímmel záruló sor (hirdetés elérhetősége)
function bekezdesek(sorok, vegek) {
  const max = Math.max(...sorok.map((s) => s.length), 1);
  const ki = []; let akt = "";
  sorok.forEach((s, j) => {
    akt = akt ? (/[a-z][-–]$/.test(akt) && /^[a-z]/.test(s) ? akt + s : akt + " " + s) : s;
    const kov = sorok[j + 1];
    if (kov === undefined) return;
    const k = sp(s), kisbetus = /^[a-z]/.test(kov);
    const alairas = j + 1 === sorok.length - 1 && kov.length <= 32 && /^[A-Z][\w’'.-]*(?: [A-Z][\w’'.-]*)?,? ?(?:\(?\d{1,2}\)?(?: ?yrs| years old)?)?$/.test(kov);
    const veg = alairas || /^•/.test(kov)
      || (vegek.ures.has(k) && !kisbetus && (MONDATVEG.test(s) || URL_VEG.test(s) || s.length < 0.6 * max))
      || (MONDATVEG.test(s) && s.length < 0.75 * max && /^[A-Z0-9"“‘'(•]/.test(kov))
      || (!/[,;\-–&]$/.test(s) && !/\b(?:a|an|the|and|or|of|to|in|for|with|at|on|by)$/i.test(s) && s.length < 0.7 * max && /^[A-Z0-9"“‘'(•]/.test(kov))
      || (vegek.oszlop.has(k) && !/[,\-–]$/.test(s) && s.length < 0.75 * max);
    if (veg) { ki.push(akt); akt = ""; }
  });
  if (akt) ki.push(akt);
  return ki;
}

/** A bekezdések első sorainak indexei. */
function bekezdesKezdetek(sorok, vegek) {
  const kezd = [0]; let n = 0;
  for (const b of bekezdesek(sorok, vegek).slice(0, -1)) {
    let hossz = 0;
    while (n < sorok.length && hossz < b.length) { hossz += sorok[n].length + (hossz ? 1 : 0); n++; }
    kezd.push(n);
  }
  return kezd;
}

const FORRAS_SOR = /^\(?\s*(?:https?:\/\/|https?\/|www\.)[^()\s]*(?:\s[^()\s]+)?\s*\)?\.?$|^\((?:[^()]*\.(?:com|co\.uk|org|net|uk|ie|au|edu)\b[^()]*)\)$|^(?:Source|Forrás|Adapted from|Based on):/i;

function bemenetFajta(helyzet, mufajTalalat) {
  const h = helyzet.toLowerCase();
  if (/advert|\bad\b|\bads\b|leaflet|flyer|brochure/.test(h)) return "advertisement";
  if (/e-?mail|letter|message|note from/.test(h)) return "email";
  if (/\bpost\b|forum|blog|comment|website|web page|webpage|social media|facebook/.test(h)) return "post";
  if (/article|newspaper|magazine/.test(h)) return "article";
  if (/notice|announcement|poster/.test(h)) return "notice";
  return "other";
}

/** A WR típusa a műfajból; a fórumbejegyzésre írt válasz (reply, message, post) véleményszöveg. */
function tipusMufajbol(mufaj, bemenet) {
  if (["reply", "message", "post"].includes(mufaj) && bemenet && bemenet.fajta === "post") return "vélemény";
  if (["email", "letter", "message", "note", "reply", "application", "text message"].includes(mufaj)) return "levél";
  if (["comment", "forum post", "post", "blog post", "blog entry", "blog", "entry", "contribution"].includes(mufaj)) return "vélemény";
  if (["article", "essay"].includes(mufaj)) return "esszé";
  return "egyéb";
}

/** Egy feladat feldolgozása a blokk soraiból. */
function feladat(lap, blokk, vegek) {
  const sorszam = { A: 1, B: 2, 1: 1, 2: 2 }[blokk.jeloles];
  const id = `${lap.id}-W${sorszam}`;
  const k = KEZI[id] || {};
  const megj = [];
  let L = blokk.sorok.map((x) => x.s);
  if (k.pre) L = k.pre(L);

  // a teendő: a szószámot tartalmazó mondat; a sor eleji „Write …” vagy a bekezdés eleje
  let w = L.findIndex((s) => /\bwords?\b/.test(s) && SZOSZAM.test(s) && /\b(?:write|writing|in a|in an|of \d)/i.test(s));
  if (w < 0) w = L.findIndex((s) => /\b[Ww]rite (?:a|an|and)\b/.test(s));
  if (w < 0) throw new Error(id + ": nem találom a teendőt");
  // ha a mondat a sor közepén kezdődik („… about it. Write an email …”), a sort kettévágjuk
  const kozep = !/^(?:Write|You\b|Give)/.test(L[w]) && /^(.*?[.!?:])\s+((?:Write|You (?:decide|want) to write|Give)\b.*)$/.exec(L[w]);
  if (kozep) { L.splice(w, 1, kozep[1], kozep[2]); vegek.ures.add(sp(kozep[1])); w++; }
  while (w > 0 && !/^(?:Write|You\b|Give|Using|In\b)/.test(L[w]) && !MONDATVEG.test(L[w - 1]) && !vegek.ures.has(sp(L[w - 1]))) w--;
  const elotte = L.slice(0, w);
  let i = w; const teendoSorok = [];
  while (i < L.length && !BULLET.test(L[i]) && !KEZDES.test(L[i])) teendoSorok.push(L[i++]);
  let teendo = sp(teendoSorok.join(" "));

  // irányító szempontok: felsorolásjeles sorok, a folytatósorokkal
  const iranyito = [], zaro = [], alpontVolt = [];
  while (i < L.length && !KEZDES.test(L[i])) {
    if (BULLET.test(L[i])) iranyito.push(L[i].replace(BULLET, ""));
    // alpont („o …”, „\u0083 …”): a szülőponthoz fűzzük, pontosvesszővel elválasztva
    else if (iranyito.length && ALPONT.test(L[i])) {
      const u = iranyito.length - 1, elozo = iranyito[u];
      iranyito[u] = elozo + (/[:;,]$/.test(elozo) || !alpontVolt[u] ? " " : "; ") + L[i].replace(ALPONT, "");
      alpontVolt[u] = true;
    }
    else if (iranyito.length && !zaro.length && /^[a-z]/.test(L[i])) iranyito[iranyito.length - 1] += " " + L[i];
    else if (iranyito.length) zaro.push(L[i]);
    else break;
    i++;
  }
  // kezdés
  let kezdes = null; const utana = [];
  if (i < L.length && KEZDES.test(L[i])) {
    const m = /like this[:.]?\s*(.*)$|with:?\s*(.*)$/i.exec(L[i]);
    const ugyanott = m && (m[1] || m[2]);
    if (ugyanott) kezdes = ugyanott.trim(); else kezdes = L[i + 1] ? L[++i] : null;
    i++;
  }
  while (i < L.length) utana.push(L[i++]);

  // helyzet és bemenet: a teendő előtti rész; a bemenet a kettősponttal záruló bevezető után kezdődik
  let helyzetSorok = elotte, bemenetSorok = [];
  const kp = elotte.findIndex((s, j) => /:$/.test(s) && j <= 5 && !elotte.slice(0, j + 1).some((x) => /\?/.test(x)));
  if (kp >= 0 && kp < elotte.length - 1) { helyzetSorok = elotte.slice(0, kp + 1); bemenetSorok = elotte.slice(kp + 1); }
  if (utana.length) bemenetSorok = [...bemenetSorok, ...utana];
  else if (!bemenetSorok.length) {
    {
      const kezd = bekezdesKezdetek(elotte, vegek);
      if (kezd.length > 1) {
        // az első bekezdés a helyzet; a többi a bemenet (pl. kettőspont nélkül bevezetett hirdetés)
        helyzetSorok = elotte.slice(0, kezd[1]); bemenetSorok = elotte.slice(kezd[1]);
      }
    }
  }
  if (bemenetSorok.length && !utana.length) {
    const kezd = bekezdesKezdetek(bemenetSorok, vegek), u = kezd[kezd.length - 1];
    if (u > 0 && /^(?:Unfortunately,? |But |However,? |So )?[Yy]ou\b/.test(bemenetSorok[u])) {
      teendo = sp(bemenetSorok.slice(u).join(" ") + " " + teendo);
      bemenetSorok = bemenetSorok.slice(0, u);
    }
  }
  const helyzet = sp(helyzetSorok.join(" "));

  let bemenet = null;
  if (bemenetSorok.length) {
    let forras = null;
    const fi = bemenetSorok.findIndex((s) => FORRAS_SOR.test(s));
    if (fi >= 0) { forras = bemenetSorok[fi].replace(/^\(\s*|\s*\)\.?$/g, ""); bemenetSorok = bemenetSorok.filter((_, j) => j !== fi); }
    const bek = bekezdesek(bemenetSorok, vegek);
    let cim = null;
    const elso = bek[0] || "";
    if (bek.length > 1 && elso.length <= 80 && !/[.!?,;:]$/.test(elso) && !/^(?:Hi|Hello|Dear|Hey)\b/.test(elso)) cim = bek.shift();
    bemenet = { fajta: bemenetFajta(helyzet), cim, bekezdesek: bek, forras };
  }

  // szószám
  const sz = SZOSZAM.exec(teendo);
  let szoszam;
  if (!sz) { szoszam = { min: null, max: null, szoveg: null }; megj.push("Nem találom a szószámot."); }
  else {
    const m = /(\d+)\s*[-–]\s*(\d+)/.exec(sz[0]);
    szoszam = m && !/about|approx|around/.test(sz[0]) ? { min: +m[1], max: +m[2], szoveg: sz[0] } : { min: null, max: null, szoveg: sz[0] };
    if (!/words/.test(sz[0])) megj.push(`A lapon a szószám után hiányzik a „words” szó („${sz[0]}”).`);
  }
  const mm = MUFAJ.exec(teendo);
  const mufaj = mm ? mm[1].toLowerCase().replace(/^e-mail$/, "email").replace(/^blog$/, "blog post") : null;
  if (!mufaj) megj.push("A műfaj a teendőből nem olvasható ki.");
  if (!iranyito.length) megj.push("Nincsenek felsorolt irányító szempontok.");
  if (!kezdes && !["article", "essay", "report"].includes(mufaj)) megj.push("Nincs megadott kezdés.");

  const oldalak = [...new Set(blokk.sorok.map((x) => x.oldal))];
  let f = {
    id, sorszam,
    sablon: `${lap.szint}-${sorszam === 1 ? "level" : "fogalmazas"}`,
    eredeti_jeloles: "Task " + blokk.jeloles,
    cim: CIMEK[id] ?? null,
    mufaj, tipus: mufaj ? tipusMufajbol(mufaj, bemenet) : "egyéb",
    szoszam, helyzet, bemenet, teendo, iranyito_szempontok: iranyito,
    zaro_utasitas: zaro.length ? sp(zaro.join(" ")) : null,
    kezdes,
    oldalak: { feladatlap: oldalak },
    megjegyzesek: megj,
  };
  if (k.post) f = k.post(f) || f;
  if (k.megjegyzes) f.megjegyzesek.push(...[].concat(k.megjegyzes));
  if (k.megjegyzesek_torles) f.megjegyzesek = f.megjegyzesek.filter((m) => !k.megjegyzesek_torles.some((r) => r.test(m)));
  return { f, kihagy: k.kihagy || null };
}

/**
 * Az útmutató íráskészség-részének forráslistája (2021-től): „1. feladat: <url>” vagy
 * „1. feladat:” + „Szöveg forrása: <url>”. A kép forrása nem kell. Eredmény: { 1: "…", 2: "…" }.
 */
function utmutatoForrasok(fajl) {
  const L = pdf(fajl, "-raw").split(/\r?\n/).map((s) => s.trim());
  const iras = L.findIndex((s) => /^(?:IV\. )?ÍRÁSKÉSZSÉG$/.test(s));
  if (iras < 0) return {};
  const kezd = L.findIndex((s, i) => i > iras && /eredeti szövegek forrása:?$/.test(s));
  if (kezd < 0) return {};
  const ki = {}; let akt = null, utolso = null;
  for (let i = kezd + 1; i < L.length; i++) {
    const s = L[i];
    const f = /^(\d)\. feladat:?\s*(.*)$/.exec(s);
    if (f) { akt = +f[1]; utolso = null; if (f[2]) { ki[akt] = f[2]; utolso = akt; } continue; }
    if (akt === null) break;
    const sz = /^Szöveg(?: és kép)? forrása:\s*(.*)$/.exec(s);
    if (sz) { ki[akt] = ki[akt] ? ki[akt] + "; " + sz[1] : sz[1]; utolso = akt; continue; }
    if (/^(?:Kép forrása|Utolsó letöltés)/.test(s)) { utolso = null; continue; }
    // a sor végén megtört cím folytatása
    if (utolso !== null && s && !/\s/.test(s) && /[-\/=?&_]$/.test(ki[utolso])) { ki[utolso] += s; continue; }
    break;
  }
  for (const k in ki) ki[k] = ki[k].replace(/\s*Utolsó letöltés.*$/, "").replace(/\)$/, "").trim();
  return ki;
}

export function kinyerLap(lap) {
  const { sorok, vegek } = irasSorok(join(FORRAS, lap.feladatlap));
  const utForras = utmutatoForrasok(join(FORRAS, lap.utmutato));
  const blokkok = feladatBlokkok(sorok);
  const feladatok = [], kimaradt = [], hibak = [];
  for (const b of blokkok) {
    try {
      const { f, kihagy } = feladat(lap, b, vegek);
      if (f.bemenet && !f.bemenet.forras && utForras[f.sorszam]) f.bemenet.forras = utForras[f.sorszam];
      if (kihagy) kimaradt.push({ sorszam: f.sorszam, ok: kihagy.ok, megjegyzes: kihagy.megjegyzes });
      else feladatok.push(f);
    } catch (e) { hibak.push(e.message); }
  }
  const lapKezi = KEZI[lap.id] || {};
  return {
    lap: {
      formatum_verzio: 1,
      id: lap.id, ev: lap.ev, idoszak: lap.idoszak, szint: lap.szint,
      vizsga_datum: lap.vizsga_datum, kod: lap.kod,
      forras_fajlok: { feladatlap: lap.feladatlap, utmutato: lap.utmutato },
      feladatok, kimaradt,
      megjegyzesek: [...(lapKezi.megjegyzes ? [].concat(lapKezi.megjegyzes) : [])],
    },
    blokkok: blokkok.length, hibak,
  };
}

function main() {
  const ni = args.indexOf("--nyers");
  if (ni >= 0) {
    const lap = LISTA.find((l) => l.id === args[ni + 1]);
    if (!lap) { console.error("Nincs ilyen lap: " + args[ni + 1]); process.exit(1); }
    const { sorok, vegek } = irasSorok(join(FORRAS, lap.feladatlap));
    for (const b of feladatBlokkok(sorok)) {
      console.log("== Task " + b.jeloles);
      b.sorok.forEach((x, i) => console.log(String(i).padStart(3) + (vegek.ures.has(sp(x.s)) ? "¶" : vegek.oszlop.has(sp(x.s)) ? "|" : " ") + "| " + x.s));
    }
    return;
  }
  mkdirSync(KIMENET, { recursive: true });
  for (const f of readdirSync(KIMENET)) if (f.endsWith(".json")) unlinkSync(join(KIMENET, f));
  let hibas = 0, db = 0, kim = 0;
  for (const lap of LISTA) {
    const { lap: ki, blokkok, hibak } = kinyerLap(lap);
    if (hibak.length || blokkok !== 2) { hibas++; console.log("! " + lap.id + ": " + blokkok + " feladat; " + hibak.join("; ")); }
    db += ki.feladatok.length; kim += ki.kimaradt.length;
    writeFileSync(join(KIMENET, lap.id + ".json"), JSON.stringify(ki, null, 2) + "\n");
  }
  writeFileSync(join(KIMENET, "sablonok.json"), JSON.stringify(sablonok(), null, 2) + "\n");
  console.log(`${LISTA.length} lap, ${db} feladat, ${kim} kimaradt` + (hibas ? `, ${hibas} hibás lap` : ""));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
