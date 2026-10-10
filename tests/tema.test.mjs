// ══════════════════════════════════════════════════════
// Színtémák (a tanári felület színválasztója, Alap csomagtól)
//
// Emulátor nélkül fut (hamis Firestore). Védi: a négy névlista egyezését (szerver, modul, korai szkript,
// CSS), a paletták kontrasztját, a szerveroldali zárat és azt, hogy a diák felület kék marad.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

process.env.GCLOUD_PROJECT = "wr-tema-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const szerver = require("./tema.js");
const kvota = require("./kvota.js");
const t = require("./index.js")._teszt;
const kliens = await import("../public/js/tema.js");
const olvas = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const css = olvas("../public/css/app.css");

const PROD = { kvota: true };
const PILOT = { kvota: false };

// ── a névlisták egyeznek ──

test("a téma-névlista a szerveren, a kliens modulban, a korai szkriptben és a CSS-ben egyezik", () => {
  assert.deepEqual(kliens.TEMAK, szerver.TEMAK);
  assert.equal(kliens.ALAP_TEMA, szerver.ALAP_TEMA);
  assert.ok(szerver.TEMAK.includes(szerver.ALAP_TEMA));

  const korai = olvas("../public/js/tema-korai.js");
  const nevek = korai.match(/\^\(([^)]+)\)\$/)[1].split("|");
  assert.deepEqual(nevek, szerver.TEMAK.filter((n) => n !== szerver.ALAP_TEMA), "a korai szkript listája (az alap nélkül)");
  assert.ok(korai.includes(`"${kliens.TAR_KULCS}"`), "a tárolókulcs egyezik");

  for (const nev of szerver.TEMAK) {
    assert.ok(css.includes(`--motivum-${nev}:`), `CSS: hiányzó motívum ${nev}`);
    assert.ok(css.includes(`.tema-gomb[data-tema="${nev}"]`), `CSS: hiányzó választógomb ${nev}`);
    if (nev !== szerver.ALAP_TEMA) assert.ok(css.includes(`:root[data-tema="${nev}"]`), `CSS: hiányzó paletta ${nev}`);
  }
});

test("minden témának van neve magyarul és angolul", async () => {
  const hu = (await import("../public/js/i18n-hu.js")).default;
  const en = (await import("../public/js/i18n-en.js")).default;
  for (const nev of szerver.TEMAK) {
    assert.ok(hu[`tanar.tema_${nev}`], `hu: ${nev}`);
    assert.ok(en[`tanar.tema_${nev}`], `en: ${nev}`);
  }
});

// ── a paletták kontrasztja (WCAG) ──

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const kontraszt = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("az új paletták akcentusa legalább 4,5:1 a fehéren és a világos hátterén, az -on-dark a sötét sávon", () => {
  for (const nev of szerver.TEMAK.filter((n) => n !== szerver.ALAP_TEMA)) {
    const sor = css.match(new RegExp(`:root\\[data-tema="${nev}"\\] \\{([^}]*)\\}`))[1];
    const szin = (valtozo) => sor.match(new RegExp(`--${valtozo}: (#[0-9a-f]{6})`))[1];
    const [acc, light, onDark] = [szin("accent"), szin("accent-light"), szin("accent-on-dark")];
    assert.ok(kontraszt("#ffffff", acc) >= 4.5, `${nev}: fehér/akcentus ${kontraszt("#ffffff", acc).toFixed(2)}`);
    assert.ok(kontraszt(acc, light) >= 4.5, `${nev}: akcentus/világos ${kontraszt(acc, light).toFixed(2)}`);
    assert.ok(kontraszt("#0f0f0f", onDark) >= 4.5, `${nev}: sötét sáv ${kontraszt("#0f0f0f", onDark).toFixed(2)}`);
  }
});

test("a diák felület kék marad: a téma a <html>-en van, a body.theme-diak saját akcentust ad, a motívum rejtve", () => {
  assert.match(css, /body\.theme-diak \{[^}]*--accent:\s+#2563eb/);
  assert.match(css, /body\.theme-diak \.page-header::after \{ display: none; \}/);
  // a tanári oldalak kapják a korai szkriptet, a diák oldalak nem
  for (const f of ["tanar", "osztalyok", "diakok", "feladatok", "javitas", "elemzes", "admin", "ai-hasznalat"]) {
    assert.ok(olvas(`../public/${f}.html`).includes("js/tema-korai.js"), f);
  }
  for (const f of ["diak", "beadas", "visszajelzes", "index"]) {
    assert.ok(!olvas(`../public/${f}.html`).includes("js/tema-korai.js"), `${f}: nem kaphat tanári témát`);
  }
});

// ── a név ellenőrzése ──

test("csak a felsorolt téma érvényes; a hamis és a prototípus-kulcs nem", () => {
  for (const nev of szerver.TEMAK) assert.equal(szerver.temaNev(nev), nev);
  for (const rossz of [undefined, null, "", "piros", "Kek", "kek ", "__proto__", "toString", 1, {}, ["kek"]]) {
    assert.equal(szerver.temaNev(rossz), undefined, String(rossz));
  }
});

// ── a szerveroldali zár: hamis Firestore ──

function hamisFirestore(dokumentumok) {
  const irasok = [];
  const doc = (ut) => ({
    get: async () => ({ exists: ut in dokumentumok, data: () => dokumentumok[ut] }),
    set: async (adat, opcio) => { irasok.push({ ut, adat, opcio }); }
  });
  return { collection: (nev) => ({ doc: (id) => doc(`${nev}/${id}`) }), irasok };
}

const ADAT = {
  "tanarok/ingyenes": { csomag: "ingyenes" },
  "tanarok/alap": { csomag: "alap" },
  "tanarok/profi": { csomag: "profi" }
};

const kod = async (futas) => {
  try { await futas(); } catch (e) { return e.details?.kod || e.code; }
  return "nem-hibazott";
};

test("az ingyenes tanár nem választhat színt (szinvalasztas_alap_kell), és semmi nem íródik", async () => {
  const fs = hamisFirestore(ADAT);
  assert.equal(await kod(() => t.temaBeallitasLogika(fs, "ingyenes", { tema: "kek" }, PROD)), "szinvalasztas_alap_kell");
  assert.equal(await kod(() => t.temaBeallitasLogika(fs, "nincs-ilyen", { tema: "kek" }, PROD)), "szinvalasztas_alap_kell");
  assert.deepEqual(fs.irasok, []);
});

test("az Alap és a Profi tanár választhat, a mentés a felhasznalok/{uid}.tema mezőbe megy", async () => {
  const fs = hamisFirestore(ADAT);
  assert.deepEqual(await t.temaBeallitasLogika(fs, "alap", { tema: "zold" }, PROD), { tema: "zold" });
  assert.deepEqual(await t.temaBeallitasLogika(fs, "profi", { tema: "pala" }, PROD), { tema: "pala" });
  assert.deepEqual(fs.irasok.map((i) => [i.ut, i.adat.tema, i.opcio]), [
    ["felhasznalok/alap", "zold", { merge: true }],
    ["felhasznalok/profi", "pala", { merge: true }]
  ]);
});

test("az alapszínre visszaállás az ingyenes tanárnak is szabad, és a mezőt törli (nem a nevet írja)", async () => {
  const fs = hamisFirestore(ADAT);
  assert.deepEqual(await t.temaBeallitasLogika(fs, "ingyenes", { tema: "narancs" }, PROD), { tema: "narancs" });
  assert.equal(fs.irasok.length, 1);
  assert.equal(fs.irasok[0].ut, "felhasznalok/ingyenes");
  assert.notEqual(fs.irasok[0].adat.tema, "narancs");
  assert.equal(typeof fs.irasok[0].adat.tema, "object", "a mező törlésjelzője (FieldValue.delete)");
});

test("a pilotban a csomag nem számít; az ismeretlen téma mindenhol hiba", async () => {
  const fs = hamisFirestore(ADAT);
  assert.deepEqual(await t.temaBeallitasLogika(fs, "ingyenes", { tema: "lila" }, PILOT), { tema: "lila" });
  for (const rossz of [undefined, "piros", "__proto__"]) {
    assert.equal(await kod(() => t.temaBeallitasLogika(fs, "profi", { tema: rossz }, PROD)), "tema_ervenytelen", String(rossz));
  }
  assert.equal(await kod(() => t.temaBeallitasLogika(fs, "profi", undefined, PROD)), "tema_ervenytelen");
});

test("a színválasztás az Alaptól elérhető (a funkciótábla), az ingyenesnek nem", () => {
  assert.equal(kvota.funkcioEngedelyezett(true, "ingyenes", "szinvalasztas"), false);
  for (const csomag of ["alap", "profi", "korlatlan"]) {
    assert.equal(kvota.funkcioEngedelyezett(true, csomag, "szinvalasztas"), true, csomag);
  }
  assert.equal(kvota.funkcioEngedelyezett(false, "ingyenes", "szinvalasztas"), true, "pilot");
});

// ── a téma az előfizetéssel jár: csomagváltásnál visszaáll az alapszínre ──

const { FieldValue } = require("firebase-admin/firestore");
const torles = (v) => v && typeof v === "object" && typeof v.isEqual === "function" && v.isEqual(FieldValue.delete());

// Memóriabeli Firestore tranzakcióval: elég a webhook és az admin csomagbeállítás útjához.
function memFirestore(kezdo) {
  const tar = structuredClone(kezdo);
  const ir = (ut, adat, opcio) => {
    const regi = opcio?.merge ? { ...(tar[ut] || {}) } : {};
    for (const [k, v] of Object.entries(adat)) {
      if (torles(v)) delete regi[k]; else regi[k] = v;
    }
    tar[ut] = regi;
  };
  const doc = (ut) => ({
    path: ut,
    get: async () => ({ exists: ut in tar, data: () => tar[ut] }),
    set: async (adat, opcio) => ir(ut, adat, opcio)
  });
  return {
    tar,
    collection: (nev) => ({ doc: (id) => doc(`${nev}/${id}`) }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: ref.path in tar, data: () => tar[ref.path] }),
      set: (ref, adat, opcio) => ir(ref.path, adat, opcio)
    })
  };
}

const AR = "price_alap_teszt";
const AR_PROFI = "price_profi_teszt";
const BE = { kvota: true, fizetes: true, fizetesArAlap: AR, fizetesArProfi: AR_PROFI };
let sorszam = 0;
const esemeny = (tipus, ar, objFelul = {}) => ({
  id: `evt_${++sorszam}`, type: tipus, created: 1000 + sorszam,
  data: { object: {
    id: "sub_1", customer: "cus_1", status: "active", metadata: { uid: "t1" },
    cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ price: { id: ar }, current_period_end: 5000 }] }, ...objFelul
  } }
});
const kezdo = (csomag, extra = {}) => ({
  "tanarok/t1": { csomag, csomag_forras: "stripe", ...extra },
  "felhasznalok/t1": { nev: "Teszt Tanár", tema: "kek" }
});

test("a lemondott előfizetés a forduló végén megszűnik: a téma visszaáll az alapszínre, a név marad", async () => {
  const fs = memFirestore(kezdo("alap"));
  const r = await t.stripeEsemenyFeldolgozas(fs, esemeny("customer.subscription.deleted", AR), BE);
  assert.equal(r.csomag, "ingyenes");
  assert.equal(fs.tar["tanarok/t1"].csomag, "ingyenes");
  assert.equal(fs.tar["felhasznalok/t1"].tema, undefined, "a téma törlődik");
  assert.equal(fs.tar["felhasznalok/t1"].nev, "Teszt Tanár", "a többi mező érintetlen");
});

test("a hó közben lemondott (még élő) előfizetés megtartja a színt a fordulóig", async () => {
  const fs = memFirestore(kezdo("alap"));
  const r = await t.stripeEsemenyFeldolgozas(fs, esemeny("customer.subscription.updated", AR, { cancel_at_period_end: true }), BE);
  assert.equal(r.csomag, "alap");
  assert.equal(fs.tar["felhasznalok/t1"].tema, "kek");
});

test("a csomagváltás Profiról Alapra nem vesz el színt; a fizetési hiba (past_due) alatt is marad", async () => {
  const fs = memFirestore(kezdo("profi"));
  await t.stripeEsemenyFeldolgozas(fs, esemeny("customer.subscription.updated", AR), BE);
  assert.equal(fs.tar["tanarok/t1"].csomag, "alap");
  assert.equal(fs.tar["felhasznalok/t1"].tema, "kek");
  await t.stripeEsemenyFeldolgozas(fs, esemeny("customer.subscription.updated", AR, { status: "past_due" }), BE);
  assert.equal(fs.tar["felhasznalok/t1"].tema, "kek");
});

test("az admin által adott csomagot a Stripe nem bántja, így a színt sem", async () => {
  const fs = memFirestore(kezdo("profi", { csomag_forras: "admin" }));
  await t.stripeEsemenyFeldolgozas(fs, esemeny("customer.subscription.deleted", AR), BE);
  assert.equal(fs.tar["tanarok/t1"].csomag, "profi");
  assert.equal(fs.tar["felhasznalok/t1"].tema, "kek");
});

test("ugyanaz az esemény kétszer nem csinál semmit, és az ingyenesen már nincs mit visszaállítani", async () => {
  const fs = memFirestore(kezdo("alap"));
  const e = esemeny("customer.subscription.deleted", AR);
  await t.stripeEsemenyFeldolgozas(fs, e, BE);
  fs.tar["felhasznalok/t1"].tema = "zold";   // közben (valamiért) mégis lett témája
  const masodik = await t.stripeEsemenyFeldolgozas(fs, e, BE);
  assert.equal(masodik.kihagyva, "mar_feldolgozva");
  assert.equal(fs.tar["felhasznalok/t1"].tema, "zold", "az idempotens újrajátszás nem nyúl hozzá");
});

test("az admin az alapcsomagra állítja: a téma visszaáll; fizetősre állítva marad; pilotban semmi", async () => {
  let fs = memFirestore(kezdo("profi"));
  await t.csomagBeallitasLogika(fs, "t1", "ingyenes", BE);
  assert.equal(fs.tar["felhasznalok/t1"].tema, undefined);
  assert.equal(fs.tar["tanarok/t1"].csomag, "ingyenes");

  fs = memFirestore(kezdo("ingyenes"));
  await t.csomagBeallitasLogika(fs, "t1", "profi", BE);
  assert.equal(fs.tar["felhasznalok/t1"].tema, "kek");

  fs = memFirestore(kezdo("profi"));
  await t.csomagBeallitasLogika(fs, "t1", "ingyenes", PILOT);
  assert.equal(fs.tar["felhasznalok/t1"].tema, "kek", "kvóta nélkül a csomag nem számít");
});

test("a temaElveszik a funkciótáblát követi", () => {
  assert.equal(t.temaElveszik("ingyenes", PROD), true);
  assert.equal(t.temaElveszik(undefined, PROD), true);
  for (const csomag of ["alap", "profi", "korlatlan"]) assert.equal(t.temaElveszik(csomag, PROD), false, csomag);
  assert.equal(t.temaElveszik("ingyenes", PILOT), false);
});
