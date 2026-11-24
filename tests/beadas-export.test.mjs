// A javítási sor letöltés- és törlésgombja (2026-11-24, adatvédelmi kérés: a tanár a beadást
// törölni tudja, előtte az eredményt letölteni). A letöltött fájl tartalma és a gombok bekötése.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eredmenyFajl, fajlnev } from "../public/js/beadas-export.js";

import szotar from "../public/js/i18n-hu.js";
const t = (k, p = {}) => String(szotar[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p[n] ?? "");
const ido = (s) => ({ toDate: () => new Date(s) });
const datum = (ts) => (ts?.toDate ? ts.toDate().toISOString().slice(0, 10) : "–");

const b = { becenev: "Kék Sárkány", letrehozva: ido("2026-11-20T10:00:00"), szoveg: "Dear Ben,\nthank you.", feladat_id: "f1",
  jelzesek: { elhagyas_db: 3 } };
const f = { cim: "Letter to Ben", rubrika: { szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvtan" }] } };
const ai = { osszpontszam: 7, max_pontszam: 10, szazalek: 70, diak_szoveg: "AI-SZÖVEG",
  szempontok: [{ kulcs: "nyelvtan", pont: 7, max: 10, megjegyzes: "AI-MEGJ" }] };
const tanari = { jegy: 4, jegy_tipus: "fokozat", szoveg: "Szép munka!", osszpontszam: 8, max_pontszam: 10, szazalek: 80,
  jovahagyva_at: ido("2026-11-21T09:00:00"), szempontok: [{ kulcs: "nyelvtan", cim: "Nyelvtan", pont: 8, max: 10, megjegyzes: "Jó" }] };

test("letöltés: jóváhagyott beadásnál a tanár visszajelzése és a diák szövege, az AI nyers javaslata nem", () => {
  const { nev, tartalom } = eredmenyFajl({ b, f, ai, tanari }, { t, datum });
  assert.equal(nev, "Letter-to-Ben_Kék-Sárkány_2026-11-20.txt");
  assert.match(tartalom, /Letter to Ben/);
  assert.match(tartalom, /Kék Sárkány/);
  assert.match(tartalom, /8\/10 \(80%\)/);
  assert.match(tartalom, /: 4\n/);
  assert.match(tartalom, /- Nyelvtan: 8\/10\n  Jó/);
  assert.match(tartalom, /Szép munka!/);
  assert.match(tartalom, /Dear Ben,\nthank you\./);
  assert.ok(!tartalom.includes("AI-SZÖVEG") && !tartalom.includes("AI-MEGJ"), "jóváhagyás után a tanár változata megy");
  assert.ok(!/elhagy/i.test(tartalom), "az írás közbeni jelzések nincsenek benne");
});

test("letöltés: jóváhagyás előtt az AI javaslata, megjelölve; értékelés nélkül csak a szöveg", () => {
  const javitott = eredmenyFajl({ b, f, ai, tanari: null }, { t, datum }).tartalom;
  assert.ok(javitott.includes(t("jav.letoltes_ai")));
  assert.match(javitott, /- Nyelvtan: 7\/10\n  AI-MEGJ/);
  assert.match(javitott, /AI-SZÖVEG/);
  const ures = eredmenyFajl({ b, f: null, ai: null, tanari: null }, { t, datum }).tartalom;
  assert.ok(ures.includes(t("jav.letoltes_nincs_ertekeles")));
  assert.match(ures, /Dear Ben/);
});

test("letöltés: a fájlnévben nincs tiltott karakter", () => {
  assert.equal(fajlnev('a/b\\c:d*?"<>|', "x  y", null), "a-b-c-d_x-y.txt");
  assert.ok(fajlnev("x".repeat(200), "y", null).length < 60);
});

test("javítási sor: minden kártyán letöltés, feldolgozás alatt nincs törlés; törlés előtt kérdés", () => {
  const html = readFileSync(new URL("../public/javitas.html", import.meta.url), "utf8");
  assert.match(html, /data-akcio="letolt"/);
  assert.match(html, /const torolheto = !\['sorban', 'folyamatban'\]\.includes\(b\.statusz\)/);
  assert.match(html, /\$\{torolheto\s*\? `<button class="btn-sm danger" data-akcio="torol"/);
  assert.match(html, /if \(!confirm\(t\('jav\.torles_kerdes'/);
  assert.match(html, /httpsCallable\(functions, 'beadasTorles'\)/);
});

test("csoport oldala: beadásonként letöltés és törlés, diákonként diák törlése; a csoportlistán törlés a név beírásával", () => {
  const cs = readFileSync(new URL("../public/csoport.html", import.meta.url), "utf8");
  assert.match(cs, /data-letolt="\$\{esc\(b\.id\)\}"/);
  assert.match(cs, /\$\{torolheto\(b\) \? `<button class="btn-sm danger" data-torol=/);
  assert.match(cs, /d\.beadasok\.every\(torolheto\) \? `<button class="btn-sm danger" data-diak-torol=/);
  assert.match(cs, /confirm\(t\('jav\.torles_kerdes'/);
  assert.match(cs, /confirm\(t\('csd\.diak_torles_kerdes'/);
  assert.match(cs, /httpsCallable\(functions, 'csoportDiakTorles'\)/);
  const lista = readFileSync(new URL("../public/csoportok.html", import.meta.url), "utf8");
  assert.match(lista, /data-torol="\$\{esc\(cs\.id\)\}"/);
  assert.match(lista, /prompt\(t\('cs\.torles_kerdes'/);
  assert.match(lista, /csoportNevTisztitas\(beirt\) !== csoportNevTisztitas\(cs\.nev\)/);
  assert.match(lista, /httpsCallable\(functions, 'csoportTorles'\)/);
});
