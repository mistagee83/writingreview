// ══════════════════════════════════════════════════════
// Érettségi feladattár – a tár modulja (functions/feladattar.js) és az oldal tiszta segédfüggvényei
// (public/js/feladattar-nezet.js). Emulátor nem kell; az adatbázisos rész: feladattar-adatbazis.test.mjs.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const tar = require("./feladattar.js");
const hu = (await import("../public/js/i18n-hu.js")).default;
const en = (await import("../public/js/i18n-en.js")).default;
const { szuresTar, mufajKulcs } = await import("../public/js/feladattar-nezet.js");
const olvas = (ut) => readFileSync(new URL(ut, import.meta.url), "utf8");

test("a lista mind a 176 feladatot adja, a legfrissebb vizsgától, és csak a szűréshez kellő mezőkkel", () => {
  const l = tar.lista();
  assert.equal(l.length, 176);
  assert.equal(new Set(l.map((f) => f.id)).size, 176);
  assert.equal(l[0].vizsga.ev, 2026);
  assert.equal(l.at(-1).vizsga.ev, 2005);
  for (let i = 1; i < l.length; i++) assert.ok(l[i - 1].vizsga.ev >= l[i].vizsga.ev, "évszám szerint csökkenő");
  for (const f of l) {
    assert.equal(f.sablon, `${f.vizsga.szint}-${f.sorszam === 1 ? "level" : "fogalmazas"}`, f.id);
    assert.deepEqual(Object.keys(f).sort(), ["cim", "helyzet", "id", "mufaj", "sablon", "sorszam", "szoszam", "tipus", "vizsga"]);
  }
});

test("a feladatleírás a feladatlap sorrendjében: helyzet, bemeneti szöveg, teendő, irányító szempontok, kezdés", () => {
  const l = tar.leiras(tar.keres("2024-maj-kozep-W2").feladat);
  const sorrend = ["You received the following email", "You know how opinionated my mum is",
    "Write an email of 100-120 words", "• of teenagers dying their hair,", "Begin like this:\nHi,"];
  let elozo = -1;
  for (const r of sorrend) {
    const i = l.indexOf(r);
    assert.ok(i > elozo, `${r} a helyén`);
    elozo = i;
  }
  // minden tárbeli feladatnak van leírása, és a záró utasítás nem vész el
  const zaros = tar.lista().map((f) => tar.keres(f.id).feladat).filter((f) => f.zaro_utasitas);
  assert.ok(zaros.length >= 7);
  for (const f of zaros) assert.ok(tar.leiras(f).includes(f.zaro_utasitas), f.id);
});

test("a tárból készült rubrika: az érettségi sablon szempontjai, a feladat típusa, szószáma és eredetjelzője", () => {
  const r = tar.rubrikaTarbol("2024-maj-kozep-W2", { kimenetiNyelv: "en" });
  const sablon = tar.sablonok({ nyelv: "en" }).find((s) => s.id === "kozep-fogalmazas");
  assert.deepEqual(r.szempontok, sablon.rubrika.szempontok);
  // angolul kiadott feladat: angol szempontnevek, a WR rubrikájának alakjában (cim_en nem kerül a feladatba)
  assert.equal(r.szempontok[0].cim, "Task achievement, covering the given points");
  assert.ok(r.szempontok.every((sz) => Object.keys(sz).sort().join() === "cim,kulcs,suly"));
  assert.equal(tar.rubrikaTarbol("2024-maj-kozep-W2").szempontok[0].cim, "A feladat teljesítése, a megadott szempontok követése");
  assert.equal(r.egyeb_utasitas, sablon.rubrika.egyeb_utasitas);
  assert.equal(r.szint, "B1");
  assert.equal(r.tipus, "levél");
  assert.equal(r.min_szo, 100);
  assert.equal(r.max_szo, 120);
  assert.equal(r.kimeneti_nyelv, "en");
  assert.deepEqual(r.tar, { id: "2024-maj-kozep-W2", verzio: 1 });
  assert.ok(r.feladat_leiras.startsWith("You received the following email"));
  // ismeretlen visszajelzés-nyelv: magyar (mint a régi feladatoknál)
  assert.equal(tar.rubrikaTarbol("2024-maj-kozep-W2", { kimenetiNyelv: "de" }).kimeneti_nyelv, "hu");
  // a Firestore-szabály (rubrikaMezokOk) legfeljebb 40 kulcsot enged
  assert.ok(Object.keys(r).length <= 40);
  // a sablon nem változik attól, hogy egy feladat rubrikáját átírjuk
  r.szempontok[0].suly = 99;
  assert.notEqual(tar.sablonok().find((s) => s.id === "kozep-fogalmazas").rubrika.szempontok[0].suly, 99);
});

test("az „about N words” feladatnál a szószám üres marad (nincs kitalált határ)", () => {
  const f = tar.lista().map((x) => tar.keres(x.id).feladat).find((x) => x.szoszam.min === null);
  if (!f) return;   // ha a kinyerés minden feladatnál ad határt, nincs mit nézni
  const r = tar.rubrikaTarbol(f.id);
  assert.equal(r.min_szo, null);
  assert.equal(r.max_szo, null);
});

test("ismeretlen vagy rossz alakú azonosító: nincs találat (nincs útvonal-trükk, nincs prototípus-kulcs)", () => {
  for (const id of [undefined, null, 42, "", "2024-maj-kozep", "2024-maj-kozep-W3", "../sablonok", "__proto__",
    "2099-maj-kozep-W1", "2024-maj-kozep-W2 ", { id: "2024-maj-kozep-W2" }]) {
    assert.equal(tar.keres(id), null, String(id));
    assert.equal(tar.elonezet(id), null);
    assert.equal(tar.rubrikaTarbol(id), null);
  }
});

test("az előnézet a diáknak szóló feladatot és a szempontokat adja, a kinyerés belső adatait nem", () => {
  const e = tar.elonezet("2024-maj-kozep-W2");
  assert.equal(e.sablon.osszpont, 22);
  assert.equal(e.sablon.szempontok.length, 5);
  assert.equal(e.iranyito_szempontok.length, 4);
  const s = JSON.stringify(e);
  for (const belso of ["forras", "oldalak", "megjegyzesek", "forras_fajlok", "egyeb_utasitas", "reddit"]) {
    assert.ok(!s.includes(belso), `${belso} nem megy ki`);
  }
});

test("minden műfajnak, időszaknak, szintnek és sablonnak van felirata mindkét nyelven", () => {
  const l = tar.lista();
  const kulcsok = new Set([
    ...l.map((f) => mufajKulcs(f.mufaj)),
    ...l.map((f) => `tar.idoszak_${f.vizsga.idoszak}`),
    ...l.map((f) => `tar.szint_${f.vizsga.szint}`),
    ...l.map((f) => `tar.sablon_${f.sablon}`),
    ...l.map((f) => `tar.sorszam_${f.sorszam}`)
  ]);
  for (const k of kulcsok) {
    assert.ok(hu[k], `hu: ${k}`);
    assert.ok(en[k], `en: ${k}`);
  }
});

test("a szűrés: szint, év, időszak, sorszám, műfaj, és ékezet- és sorrendfüggetlen keresés a címben és a helyzetben", () => {
  const l = tar.lista();
  assert.equal(szuresTar(l, {}).length, 176);
  assert.ok(szuresTar(l, { szint: "emelt" }).every((f) => f.vizsga.szint === "emelt"));
  assert.ok(szuresTar(l, { ev: "2024" }).every((f) => f.vizsga.ev === 2024));
  assert.ok(szuresTar(l, { sorszam: "1" }).every((f) => f.sorszam === 1));
  assert.ok(szuresTar(l, { idoszak: "okt", mufaj: "email" }).every((f) => f.vizsga.idoszak === "okt" && f.mufaj === "email"));
  const kek = szuresTar(l, { kereses: "  HAIR   Pavel " });
  assert.ok(kek.some((f) => f.id === "2024-maj-kozep-W2"));
  assert.ok(kek.every((f) => /hair/i.test(f.cim + f.helyzet) && /pavel/i.test(f.cim + f.helyzet)));
  assert.deepEqual(szuresTar(l, { kereses: "pável" }).map((f) => f.id), szuresTar(l, { kereses: "pavel" }).map((f) => f.id));
  assert.equal(szuresTar(l, { kereses: "nincsilyenszo" }).length, 0);
});

test("a feladat-űrlap szerkesztéskor és másoláskor megőrzi az eredetjelzőt (rubrika.tar)", () => {
  const html = olvas("../public/feladatok.html");
  assert.match(html, /tarEredet = f\.rubrika\?\.tar \|\| null;/, "betöltéskor átveszi");
  assert.match(html, /\.\.\.\(tarEredet \? \{ tar: tarEredet \} : \{\}\)/, "mentéskor visszaírja");
  assert.match(html, /tarEredet = null;/, "az űrlap ürítése törli (új feladatnál ne maradjon)");
});

test("a feladattár ikonja mindenhol ugyanaz az emoji (🎓, a tulajdonos döntése 2026-11-26), és csak bekapcsolt tárnál van menüpont", () => {
  // a menü többi ikonja is emoji: egy saját rajz kilógott a sorból
  const nav = olvas("../public/js/nav.js");
  assert.ok(nav.includes('...(ERETTSEGI_TAR ? [{ href: "feladattar.html", ikon: "🎓", cim: "nav.feladattar" }] : [])'));
  assert.ok(olvas("../public/tanar.html").includes('<div class="module-icon">🎓</div>'));
  assert.ok(olvas("../public/feladattar.html").includes('<span class="tar-fejlec-ikon" aria-hidden="true">🎓</span>'));
  assert.ok(olvas("../public/index.html").includes('<span class="lp-matura-ikon" aria-hidden="true">🎓</span>'));
  assert.ok(!/📚/.test(nav + olvas("../public/feladattar.html") + olvas("../public/tanar.html")));
});

test("a szempontnevek a felület nyelvén: magyarul a hivatalos név, angolul a fordítás; ismeretlen nyelv: magyar", () => {
  const nev = (nyelv) => tar.elonezet("2024-maj-kozep-W2", { nyelv }).sablon.szempontok.map((sz) => sz.cim);
  assert.deepEqual(nev("hu"), ["A feladat teljesítése, a megadott szempontok követése", "Hangnem, az olvasóban keltett benyomás",
    "Szövegalkotás", "Szókincs, kifejezésmód", "Nyelvhelyesség, helyesírás"]);
  assert.deepEqual(nev("en"), ["Task achievement, covering the given points", "Tone and effect on the reader",
    "Organisation and coherence", "Vocabulary and expression", "Grammar and spelling"]);
  assert.deepEqual(nev("de"), nev("hu"));
  assert.deepEqual(nev(undefined), nev("hu"));
  // minden sablon minden szempontjának van angol neve, és nem azonos a magyarral
  for (const s of tar.sablonok({ nyelv: "en" })) {
    const hu = tar.sablonok().find((x) => x.id === s.id).rubrika.szempontok;
    s.rubrika.szempontok.forEach((sz, i) => {
      assert.ok(sz.cim && sz.cim !== hu[i].cim, `${s.id} ${sz.kulcs}`);
      assert.equal(sz.suly, hu[i].suly);
      assert.ok(!("cim_en" in sz));
    });
  }
});
