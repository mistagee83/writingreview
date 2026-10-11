// ══════════════════════════════════════════════════════
// Számlázz.hu (Számla Agent) – automatikus számla a Stripe-befizetésekről
//
// A Stripe `invoice.paid` eseményéből (sikeres befizetés) állít össze számlát a szerver. Ez a fájl a tiszta rész
// (XML-összeállítás, válasz értelmezése) és a HTTP-hívás; a tárolás és az idempotencia a functions/index.js-ben van
// (`szamlaKiallitas`, `szamlak/{stripe-számla-azonosító}`).
//
// Szabályok:
//  - a kiállító alanyi adómentes (AAM): nincs áfa, a nettó = a bruttó, az áfakulcs "AAM"
//  - a Stripe TESZTMÓDÚ befizetéséből (livemode=false) csak DÍJBEKÉRŐ (pro forma) készül: ez nem megy a NAV-nak, és a
//    vevőnek nem megy levél. Éles befizetésből valódi számla készül, és a számlázz.hu e-mailben elküldi a vevőnek.
//  - az összegek a Stripe-ból jönnek (a számlázz.hu nem számol: a nettó egységár × mennyiség = a nettó érték, nettó + áfa = bruttó)
//  - 0 összegű befizetésről nem készül számla
//
// A hívás: POST https://www.szamlazz.hu/szamla/, multipart, az XML az `action-xmlagentxmlfile` mezőben;
// az XML elemeinek sorrendje kötött. Lásd docs/szamlazz.md.
// ══════════════════════════════════════════════════════

const SZAMLAZZ_URL = "https://www.szamlazz.hu/szamla/";

/** Azok a pénznemek, ahol a Stripe összege nem században van (a többi: /100). */
const NULL_TIZEDES = new Set(["jpy", "krw", "vnd", "clp", "isk", "ugx", "xaf", "xof"]);

function xmlEscape(s) {
  return String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" }[c]));
}

/** A Stripe legkisebb egységéből (cent) tizedes szám, szöveggel, a számlázz.hu formátumában. */
function osszeg(minor, penznem) {
  const tort = NULL_TIZEDES.has(String(penznem).toLowerCase()) ? 1 : 100;
  return (minor / tort).toFixed(tort === 1 ? 0 : 2);
}

/** Egy Unix-időből (mp) ÉÉÉÉ-HH-NN, budapesti idő szerint. */
function datum(mp) {
  const d = new Date((Number.isFinite(mp) ? mp : Date.now() / 1000) * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(d);
}

/** A Stripe-számla sorai a számlázz.hu tételeivé; ha az összegük nem egyezik a befizetettel, egyetlen tétel lesz. */
function tetelek(szamla, nyelv) {
  const penznem = szamla.currency;
  const fizetett = szamla.amount_paid;
  const sorok = (szamla.lines?.data || []).filter((s) => Number.isFinite(s.amount) && s.amount !== 0);
  const osszes = sorok.reduce((a, s) => a + s.amount, 0);
  const alapNev = nyelv === "hu" ? "WritingReview előfizetés" : "WritingReview subscription";
  const lista = (sorok.length && osszes === fizetett)
    ? sorok.map((s) => {
        const p = s.period;
        const idoszak = p && Number.isFinite(p.start) && Number.isFinite(p.end) ? ` (${datum(p.start)} – ${datum(p.end)})` : "";
        return { nev: `${alapNev}${idoszak}`, ertek: s.amount };
      })
    : [{ nev: alapNev, ertek: fizetett }];
  return lista.map((t) => {
    const e = osszeg(t.ertek, penznem);
    return `    <tetel>
      <megnevezes>${xmlEscape(t.nev)}</megnevezes>
      <mennyiseg>1.0</mennyiseg>
      <mennyisegiEgyseg>${nyelv === "hu" ? "db" : "pcs"}</mennyisegiEgyseg>
      <nettoEgysegar>${e}</nettoEgysegar>
      <afakulcs>AAM</afakulcs>
      <nettoErtek>${e}</nettoErtek>
      <afaErtek>0</afaErtek>
      <bruttoErtek>${e}</bruttoErtek>
    </tetel>`;
  }).join("\n");
}

/**
 * A számla XML-je a Stripe `invoice` objektumból.
 * @param {object} szamla a Stripe invoice (invoice.paid esemény tárgya)
 * @param {{kulcs: string, bank?: string, bankszamla?: string}} be a kiállító beállításai
 * @returns {{xml: string, probaMod: boolean}}
 */
function szamlaXml(szamla, be) {
  const probaMod = szamla.livemode !== true;
  const cim = szamla.customer_address || {};
  const orszag = String(cim.country || "").toUpperCase();
  const nyelv = orszag === "HU" ? "hu" : "en";
  const penznem = String(szamla.currency || "eur").toUpperCase();
  const huf = penznem === "HUF";
  const fizetve = datum(szamla.status_transitions?.paid_at ?? szamla.created);
  const utca = [cim.line1, cim.line2].filter(Boolean).join(" ");
  // az ország kódja a címben (az XML-nek nincs külön országmezője); belföldinél felesleges
  const cimSor = [utca, orszag && orszag !== "HU" ? orszag : ""].filter(Boolean).join(", ") || "-";
  const nev = szamla.customer_name || szamla.customer_email || "-";
  const kuldjeEmail = !probaMod && Boolean(szamla.customer_email);

  const targy = nyelv === "hu" ? "WritingReview – számla" : "WritingReview – invoice";
  const szoveg = nyelv === "hu"
    ? "Köszönjük az előfizetést! A számlát ebben a levélben találod."
    : "Thank you for subscribing! Your invoice is attached to this email.";
  const megjegyzes = nyelv === "hu"
    ? "Alanyi adómentes. Stripe-számla: " + (szamla.number || szamla.id)
    : "VAT exempt (small-business scheme). Stripe invoice: " + (szamla.number || szamla.id);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">
  <beallitasok>
    <szamlaagentkulcs>${xmlEscape(be.kulcs)}</szamlaagentkulcs>
    <eszamla>true</eszamla>
    <szamlaLetoltes>false</szamlaLetoltes>
    <valaszVerzio>2</valaszVerzio>
    <aggregator></aggregator>
    <szamlaKulsoAzon>${xmlEscape(szamla.id)}</szamlaKulsoAzon>
  </beallitasok>
  <fejlec>
    <keltDatum>${datum(Date.now() / 1000)}</keltDatum>
    <teljesitesDatum>${fizetve}</teljesitesDatum>
    <fizetesiHataridoDatum>${fizetve}</fizetesiHataridoDatum>
    <fizmod>${nyelv === "hu" ? "Bankkártya" : "Credit card"}</fizmod>
    <penznem>${xmlEscape(penznem)}</penznem>
    <szamlaNyelve>${nyelv}</szamlaNyelve>
    <megjegyzes>${xmlEscape(megjegyzes)}</megjegyzes>
    <arfolyamBank>${huf ? "" : "MNB"}</arfolyamBank>
    <arfolyam>${huf ? "1.0" : "0.0"}</arfolyam>
    <rendelesSzam>${xmlEscape(szamla.id)}</rendelesSzam>
    <dijbekeroSzamlaszam></dijbekeroSzamlaszam>
    <elolegszamla>false</elolegszamla>
    <vegszamla>false</vegszamla>
    <helyesbitoszamla>false</helyesbitoszamla>
    <helyesbitettSzamlaszam></helyesbitettSzamlaszam>
    <dijbekero>${probaMod}</dijbekero>
    <szamlaszamElotag></szamlaszamElotag>
  </fejlec>
  <elado>
    <bank>${xmlEscape(be.bank || "")}</bank>
    <bankszamlaszam>${xmlEscape(be.bankszamla || "")}</bankszamlaszam>
    <emailReplyto></emailReplyto>
    <emailTargy>${xmlEscape(targy)}</emailTargy>
    <emailSzoveg>${xmlEscape(szoveg)}</emailSzoveg>
  </elado>
  <vevo>
    <nev>${xmlEscape(nev)}</nev>
    <irsz>${xmlEscape(cim.postal_code || "-")}</irsz>
    <telepules>${xmlEscape(cim.city || "-")}</telepules>
    <cim>${xmlEscape(cimSor)}</cim>
    <email>${xmlEscape(szamla.customer_email || "")}</email>
    <sendEmail>${kuldjeEmail}</sendEmail>
    <adoszam></adoszam>
  </vevo>
  <tetelek>
${tetelek(szamla, nyelv)}
  </tetelek>
</xmlszamla>
`;
  return { xml, probaMod };
}

/** Kell-e számla ehhez a befizetéshez? (null: igen; különben a kihagyás oka) */
function kihagyas(szamla) {
  if (!szamla || typeof szamla.id !== "string") return "nincs_szamla";
  if (!Number.isFinite(szamla.amount_paid) || szamla.amount_paid <= 0) return "nulla_osszeg";
  if (!szamla.currency) return "nincs_penznem";
  return null;
}

/** A számlázz.hu XML-válaszának (valaszVerzio=2) értelmezése. */
function valaszErtelmezes(szoveg) {
  const s = String(szoveg || "");
  const elem = (nev) => {
    const m = s.match(new RegExp(`<${nev}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${nev}>`));
    return m ? m[1].trim() : null;
  };
  const sikeres = elem("sikeres");
  if (sikeres === "true") return { sikeres: true, szamlaszam: elem("szamlaszam") };
  if (sikeres === "false") return { sikeres: false, hibakod: elem("hibakod"), hibauzenet: elem("hibauzenet") };
  return { sikeres: false, ertelmezhetetlen: true, hibauzenet: s.slice(0, 200) };
}

/**
 * Az XML elküldése. Hálózati hiba/időtúllépés esetén `bizonytalan` jön vissza: a számla lehet, hogy elkészült,
 * ezért NEM szabad vakon újrapróbálni (dupla számla).
 */
async function kuldes(xml, { fetchFn = fetch, url = SZAMLAZZ_URL, idotullepesMs = 30000 } = {}) {
  const form = new FormData();
  form.append("action-xmlagentxmlfile", new Blob([xml], { type: "text/xml" }), "szamla.xml");
  let valasz;
  try {
    valasz = await fetchFn(url, { method: "POST", body: form, signal: AbortSignal.timeout(idotullepesMs) });
  } catch (e) {
    return { sikeres: false, bizonytalan: true, hibauzenet: String(e?.message || e).slice(0, 200) };
  }
  const szoveg = await valasz.text().catch(() => "");
  if (!valasz.ok) return { sikeres: false, bizonytalan: valasz.status >= 500, hibauzenet: `HTTP ${valasz.status}` };
  return valaszErtelmezes(szoveg);
}

module.exports = { SZAMLAZZ_URL, szamlaXml, kihagyas, valaszErtelmezes, kuldes, osszeg, datum };
