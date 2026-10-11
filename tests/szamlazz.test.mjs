// ══════════════════════════════════════════════════════
// Számlázz.hu – XML-összeállítás, válasz-értelmezés és az idempotens kiállítás (emulátor és hálózat nélkül,
// memóriabeli hamis Firestore-ral és hamis küldővel)
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-szamlazz-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const sz = require("./szamlazz.js");
const kornyezet = require("./kornyezet.js");
let t;
before(() => { t = require("./index.js")._teszt; });

const szamla = (felul = {}) => ({
  id: "in_1", number: "ABC-0001", livemode: true, currency: "eur", amount_paid: 700, created: 1760000000,
  customer: "cus_1", customer_name: "Kovács Anna", customer_email: "anna@example.com",
  customer_address: { line1: "Fő utca 1.", city: "Budapest", postal_code: "1011", country: "HU" },
  status_transitions: { paid_at: 1760000000 },
  lines: { data: [{ amount: 700, period: { start: 1760000000, end: 1762600000 } }] },
  ...felul
});
const BE = { kulcs: "titkos-kulcs", bank: "OTP", bankszamla: "11111111-22222222-33333333" };

test("éles befizetésből valódi számla készül, AAM-mal, áfa nélkül, a vevőnek küldve", () => {
  const { xml, probaMod } = sz.szamlaXml(szamla(), BE);
  assert.equal(probaMod, false);
  assert.match(xml, /<dijbekero>false<\/dijbekero>/);
  assert.match(xml, /<sendEmail>true<\/sendEmail>/);
  assert.match(xml, /<afakulcs>AAM<\/afakulcs>/);
  assert.match(xml, /<nettoErtek>7\.00<\/nettoErtek>/);
  assert.match(xml, /<afaErtek>0<\/afaErtek>/);
  assert.match(xml, /<bruttoErtek>7\.00<\/bruttoErtek>/);
  assert.match(xml, /<penznem>EUR<\/penznem>/);
  assert.match(xml, /<szamlaNyelve>hu<\/szamlaNyelve>/);
  assert.match(xml, /<szamlaKulsoAzon>in_1<\/szamlaKulsoAzon>/);
  assert.match(xml, /<szamlaagentkulcs>titkos-kulcs<\/szamlaagentkulcs>/);
});

test("tesztmódú befizetésből csak díjbekérő készül, e-mail nélkül", () => {
  const { xml, probaMod } = sz.szamlaXml(szamla({ livemode: false }), BE);
  assert.equal(probaMod, true);
  assert.match(xml, /<dijbekero>true<\/dijbekero>/);
  assert.match(xml, /<sendEmail>false<\/sendEmail>/);
});

test("külföldi vevő angol számlát kap, az ország kódja a címben van", () => {
  const { xml } = sz.szamlaXml(szamla({ customer_address: { line1: "1 High St", city: "Leeds", postal_code: "LS1", country: "GB" } }), BE);
  assert.match(xml, /<szamlaNyelve>en<\/szamlaNyelve>/);
  assert.match(xml, /<cim>1 High St, GB<\/cim>/);
  assert.match(xml, /<mennyisegiEgyseg>pcs<\/mennyisegiEgyseg>/);
});

test("az XML elemeinek sorrendje a számlázz.hu előírása szerinti", () => {
  const { xml } = sz.szamlaXml(szamla(), BE);
  const sorrend = ["<beallitasok>", "<fejlec>", "<elado>", "<vevo>", "<tetelek>"].map((e) => xml.indexOf(e));
  assert.deepEqual(sorrend, [...sorrend].sort((a, b) => a - b));
  assert.ok(sorrend.every((i) => i > 0));
  const fejlec = ["keltDatum", "teljesitesDatum", "fizetesiHataridoDatum", "fizmod", "penznem", "szamlaNyelve", "megjegyzes",
    "arfolyamBank", "arfolyam", "rendelesSzam", "dijbekero"].map((e) => xml.indexOf(`<${e}>`));
  assert.deepEqual(fejlec, [...fejlec].sort((a, b) => a - b));
});

test("a vevő adata XML-escape-elve kerül be (nincs XML-beszúrás)", () => {
  const { xml } = sz.szamlaXml(szamla({ customer_name: "<b>Rossz & \"név\"</b>" }), BE);
  assert.ok(!xml.includes("<b>"));
  assert.match(xml, /&lt;b&gt;Rossz &amp; &quot;név&quot;&lt;\/b&gt;/);
});

test("a tételek összege egyezik a befizetettel; eltérésnél egyetlen tétel lesz", () => {
  const ketto = sz.szamlaXml(szamla({ amount_paid: 1000, lines: { data: [{ amount: 700 }, { amount: 300 }] } }), BE).xml;
  assert.equal((ketto.match(/<tetel>/g) || []).length, 2);
  const elter = sz.szamlaXml(szamla({ amount_paid: 1000, lines: { data: [{ amount: 700 }] } }), BE).xml;
  assert.equal((elter.match(/<tetel>/g) || []).length, 1);
  assert.match(elter, /<bruttoErtek>10\.00<\/bruttoErtek>/);
});

test("0 összegű és hiányos befizetésről nem készül számla", () => {
  assert.equal(sz.kihagyas(szamla({ amount_paid: 0 })), "nulla_osszeg");
  assert.equal(sz.kihagyas(null), "nincs_szamla");
  assert.equal(sz.kihagyas(szamla({ currency: undefined })), "nincs_penznem");
  assert.equal(sz.kihagyas(szamla()), null);
});

test("a válasz értelmezése: siker, hiba, értelmezhetetlen", () => {
  assert.deepEqual(sz.valaszErtelmezes("<xmlszamlavalasz><sikeres>true</sikeres><szamlaszam>WR-2026-1</szamlaszam></xmlszamlavalasz>"),
    { sikeres: true, szamlaszam: "WR-2026-1" });
  const h = sz.valaszErtelmezes("<x><sikeres>false</sikeres><hibakod>3</hibakod><hibauzenet><![CDATA[Bejelentkezési hiba]]></hibauzenet></x>");
  assert.equal(h.sikeres, false);
  assert.equal(h.hibakod, "3");
  assert.equal(h.hibauzenet, "Bejelentkezési hiba");
  assert.equal(sz.valaszErtelmezes("[ERR] valami").ertelmezhetetlen, true);
});

test("a küldés hálózati hibánál bizonytalan (nem szabad vakon újrapróbálni), HTTP-hibánál 5xx bizonytalan, 4xx nem", async () => {
  assert.equal((await sz.kuldes("<x/>", { fetchFn: async () => { throw new Error("timeout"); } })).bizonytalan, true);
  const valasz = (status, szoveg) => async () => ({ ok: status < 400, status, text: async () => szoveg });
  assert.equal((await sz.kuldes("<x/>", { fetchFn: valasz(502, "") })).bizonytalan, true);
  assert.equal((await sz.kuldes("<x/>", { fetchFn: valasz(403, "") })).bizonytalan, false);
  assert.equal((await sz.kuldes("<x/>", { fetchFn: valasz(200, "<sikeres>true</sikeres><szamlaszam>A-1</szamlaszam>") })).szamlaszam, "A-1");
});

// ── a kiállítás idempotenciája, hamis Firestore-ral ──
function hamisFirestore() {
  const tar = new Map();
  const ref = (nev, id) => ({
    _k: `${nev}/${id}`,
    set: async function (adat, opt) { tar.set(this._k, { ...(opt?.merge ? tar.get(this._k) : {}), ...adat }); }
  });
  return {
    tar,
    collection: (nev) => ({
      doc: (id) => ref(nev, id),
      orderBy: (mezo, irany) => ({ limit: () => ({ get: async () => {
        const sorok = [...tar.entries()].filter(([k]) => k.startsWith(`${nev}/`)).map(([k, v]) => ({ id: k.split("/")[1], data: () => v }));
        sorok.sort((a, b) => (irany === "desc" ? b.data()[mezo] - a.data()[mezo] : a.data()[mezo] - b.data()[mezo]));
        return { size: sorok.length, docs: sorok };
      } }) })
    }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ data: () => tar.get(r._k) }),
      set: (r, adat, opt) => r.set(adat, opt)
    })
  };
}
const esemeny = (s = szamla()) => ({ id: "evt_1", type: "invoice.paid", data: { object: s } });
const BEALL = { szamlazzBank: "", szamlazzBankszamla: "" };

test("a kiállítás egyszer fut: a második kézbesítés kihagyva, a számla száma tárolva", async () => {
  const fs = hamisFirestore();
  let hivas = 0;
  const kuldFn = async () => { hivas++; return { sikeres: true, szamlaszam: "WR-1" }; };
  const e1 = await t.szamlaKiallitas(fs, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn });
  assert.equal(e1.eredmeny, "kesz");
  assert.equal(fs.tar.get("szamlak/in_1").allapot, "kesz");
  assert.equal(fs.tar.get("szamlak/in_1").szamlaszam, "WR-1");
  const e2 = await t.szamlaKiallitas(fs, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn });
  assert.deepEqual([e2.eredmeny, e2.ok], ["kihagyva", "kesz"]);
  assert.equal(hivas, 1);
});

test("hálózati bizonytalanság után nem készül második számla; elutasítás után újrapróbálható", async () => {
  const fs = hamisFirestore();
  let hivas = 0;
  const bizonytalan = async () => { hivas++; return { sikeres: false, bizonytalan: true, hibauzenet: "timeout" }; };
  assert.equal((await t.szamlaKiallitas(fs, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn: bizonytalan })).eredmeny, "bizonytalan");
  assert.equal((await t.szamlaKiallitas(fs, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn: bizonytalan })).eredmeny, "kihagyva");
  assert.equal(hivas, 1);

  const fs2 = hamisFirestore();
  const elutasit = async () => ({ sikeres: false, hibakod: "3", hibauzenet: "Bejelentkezési hiba" });
  const h = await t.szamlaKiallitas(fs2, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn: elutasit });
  assert.deepEqual([h.eredmeny, h.hibakod, h.kiserlet], ["hiba", "3", 1]);
  const ujra = await t.szamlaKiallitas(fs2, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn: async () => ({ sikeres: true, szamlaszam: "WR-2" }) });
  assert.equal(ujra.eredmeny, "kesz");
});

test("5 sikertelen kísérlet után feladja (nem kérdez a végtelenségig)", async () => {
  const fs = hamisFirestore();
  const elutasit = async () => ({ sikeres: false, hibakod: "3", hibauzenet: "x" });
  for (let i = 1; i <= 5; i++) assert.equal((await t.szamlaKiallitas(fs, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn: elutasit })).kiserlet, i);
  const hatodik = await t.szamlaKiallitas(fs, esemeny(), { beallitasok: BEALL, kulcs: "k", kuldFn: elutasit });
  assert.deepEqual([hatodik.eredmeny, hatodik.ok], ["kihagyva", "feladva"]);
});

test("a 0 összegű befizetés a küldő meghívása nélkül kimarad", async () => {
  const kuldFn = async () => { throw new Error("nem szabad hívni"); };
  const r = await t.szamlaKiallitas(hamisFirestore(), esemeny(szamla({ amount_paid: 0 })), { beallitasok: BEALL, kulcs: "k", kuldFn });
  assert.deepEqual([r.eredmeny, r.ok], ["kihagyva", "nulla_osszeg"]);
});

test("a Stripe tesztmódú befizetéséről nem készül számla, és a számlázz.hu-t nem hívja", async () => {
  const kuldFn = async () => { throw new Error("nem szabad hívni"); };
  const fs = hamisFirestore();
  const r = await t.szamlaKiallitas(fs, esemeny(szamla({ livemode: false })), { beallitasok: BEALL, kulcs: "k", kuldFn });
  assert.deepEqual([r.eredmeny, r.ok], ["kihagyva", "teszt_mod"]);
  assert.equal(fs.tar.size, 0);
});

test("a számlázás csak a prodon, élő fizetés és SZAMLAZZ=igen mellett kapcsol be", () => {
  const prod = { KORNYEZET: "prod", GCLOUD_PROJECT: "p", FIZETES_AR_ALAP: "price_x" };
  assert.equal(kornyezet.beallitasok({ ...prod, SZAMLAZZ: "igen" }).szamlazz, true);
  assert.equal(kornyezet.beallitasok(prod).szamlazz, false);
  assert.equal(kornyezet.beallitasok({ ...prod, FIZETES_AR_ALAP: "", SZAMLAZZ: "igen" }).szamlazz, false);
  assert.equal(kornyezet.beallitasok({ KORNYEZET: "pilot", GCLOUD_PROJECT: "q", FIZETES_AR_ALAP: "price_x", SZAMLAZZ: "igen" }).szamlazz, false);
});

// ── kézi számlázás: a számlázandó lista és a „kiállítva” jelölés ──
test("a számlázandó befizetés egyszer kerül be, a vevő adataival; a tesztmódú is (jelölve)", async () => {
  const fs = hamisFirestore();
  const r1 = await t.szamlaRogzites(fs, esemeny());
  assert.equal(r1.eredmeny, "rogzitve");
  const d = fs.tar.get("szamlak/in_1");
  assert.equal(d.allapot, "szamlazando");
  assert.equal(d.nev, "Kovács Anna");
  assert.equal(d.email, "anna@example.com");
  assert.deepEqual([d.cim.irsz, d.cim.varos, d.cim.sor1, d.cim.orszag], ["1011", "Budapest", "Fő utca 1.", "HU"]);
  assert.deepEqual([d.osszeg, d.penznem, d.proba], [700, "eur", false]);
  const r2 = await t.szamlaRogzites(fs, esemeny());
  assert.deepEqual([r2.eredmeny, r2.ok], ["kihagyva", "mar_rogzitve"]);

  await t.szamlaRogzites(fs, esemeny(szamla({ id: "in_2", livemode: false })));
  assert.equal(fs.tar.get("szamlak/in_2").proba, true);
  assert.equal((await t.szamlaRogzites(fs, esemeny(szamla({ id: "in_3", amount_paid: 0 })))).ok, "nulla_osszeg");
  assert.equal(fs.tar.has("szamlak/in_3"), false);
});

test("a webhook számlázandóként rögzíti az invoice.paid-et, ha a fizetés él és az Agent nincs bekapcsolva", async () => {
  const fs = hamisFirestore();
  const stripe = { webhooks: { constructEvent: () => esemeny() } };
  const kor = { method: "POST", headers: { "stripe-signature": "x" }, rawBody: Buffer.from("{}") };
  let allapot, torzs;
  const valasz = { status(k) { allapot = k; return this; }, json(b) { torzs = b; return this; }, send(b) { torzs = b; return this; } };
  await t.stripeWebhookKezeles(kor, valasz, { stripe, titok: "t", firestore: fs, beallitasok: { fizetes: true, szamlazz: false } });
  assert.equal(allapot, 200);
  assert.equal(torzs.eredmeny, "rogzitve");
  assert.equal(fs.tar.get("szamlak/in_1").allapot, "szamlazando");
  // fizetés nélküli környezetben (pilot) nem rögzít: az esemény a megszokott úton megy tovább
  const fs2 = hamisFirestore();
  const nincsRogzites = await (async () => {
    try { await t.stripeWebhookKezeles(kor, valasz, { stripe, titok: "t", firestore: fs2, beallitasok: { fizetes: false, szamlazz: false } }); } catch { /* a megszokott út emulátort kér */ }
    return fs2.tar.has("szamlak/in_1");
  })();
  assert.equal(nincsRogzites, false);
});

test("a lista a legutóbbi befizetéseket adja, az állapottal; a jelölés kiállítottra vált és visszavonható", async () => {
  const fs = hamisFirestore();
  await t.szamlaRogzites(fs, esemeny(szamla({ id: "in_a", status_transitions: { paid_at: 100 } })));
  await t.szamlaRogzites(fs, esemeny(szamla({ id: "in_b", status_transitions: { paid_at: 200 } })));
  const lista = await t.szamlazandoListaLogika(fs);
  assert.deepEqual(lista.tetelek.map((x) => x.id), ["in_b", "in_a"]);
  assert.equal(lista.tetelek[0].allapot, "szamlazando");

  const kesz = await t.szamlaJelolesLogika(fs, "admin1", { id: "in_a", szamlaszam: "  WR-2026-1 " });
  assert.deepEqual([kesz.allapot, kesz.szamlaszam], ["kesz", "WR-2026-1"]);
  const d = fs.tar.get("szamlak/in_a");
  assert.deepEqual([d.allapot, d.kezi, d.kiallitotta], ["kesz", true, "admin1"]);

  const vissza = await t.szamlaJelolesLogika(fs, "admin1", { id: "in_a", szamlaszam: null });
  assert.equal(vissza.allapot, "szamlazando");
});

test("a jelölés hibás azonosítót, üres számlaszámot és ismeretlen befizetést elutasít; az Agent számlát nem írja át", async () => {
  const fs = hamisFirestore();
  await t.szamlaRogzites(fs, esemeny());
  const kod = async (adat) => { try { await t.szamlaJelolesLogika(fs, "a", adat); } catch (e) { return e.details?.kod; } return "nem-hibazott"; };
  assert.equal(await kod({ id: "../tanarok/x", szamlaszam: "A" }), "szamla_nincs");
  assert.equal(await kod({ id: "in_1", szamlaszam: "   " }), "szamlaszam_ervenytelen");
  assert.equal(await kod({ id: "in_1", szamlaszam: "x".repeat(61) }), "szamlaszam_ervenytelen");
  assert.equal(await kod({ id: "in_1" }), "szamlaszam_ervenytelen");
  assert.equal(await kod({ id: "in_nincs", szamlaszam: "A" }), "szamla_nincs");
  // az Agent által kiállított (nem kézi) számla védett
  fs.tar.set("szamlak/in_agent", { allapot: "kesz", szamlaszam: "AG-1" });
  assert.equal(await kod({ id: "in_agent", szamlaszam: null }), "szamla_nincs");
  assert.equal(await kod({ id: "in_agent", szamlaszam: "B" }), "szamla_nincs");
});

// A Firebase CLI a deploynál MINDEN deklarált titkot megkövetel (a v1.15.0 prod-deploy ezen bukott el): a számlázz.hu
// kulcsát ezért csak bekapcsolt számlázásnál szabad deklarálni. Külön folyamatban töltjük be, a környezeti változókkal.
test("a számlázz.hu titka csak bekapcsolt számlázásnál deklarált (különben a deploy titok nélkül elbukna)", async () => {
  const { spawnSync } = await import("node:child_process");
  const cwd = new URL("../functions/", import.meta.url);
  const script = "require('./index.js');console.log(JSON.stringify(require('firebase-functions/params').declaredParams.map(p=>p.name)))";
  const nevek = (env) => {
    const r = spawnSync(process.execPath, ["-e", script], { cwd, env: { ...process.env, GCLOUD_PROJECT: "wr-titok-teszt", ...env }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
  };
  const prod = { KORNYEZET: "prod", FIZETES_AR_ALAP: "price_x" };
  assert.ok(!nevek({ ...prod, SZAMLAZZ: "" }).includes("SZAMLAZZ_AGENT_KULCS"), "kikapcsolva nem deklarálható");
  assert.ok(!nevek({ KORNYEZET: "pilot", FIZETES_AR_ALAP: "price_x", SZAMLAZZ: "igen" }).includes("SZAMLAZZ_AGENT_KULCS"), "pilotban sosem");
  assert.ok(nevek({ ...prod, SZAMLAZZ: "igen" }).includes("SZAMLAZZ_AGENT_KULCS"), "bekapcsolva deklarált");
});
