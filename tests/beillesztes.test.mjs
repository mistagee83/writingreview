// ══════════════════════════════════════════════════════
// Kép beillesztése a vágólapról (Ctrl+V) a feladat űrlapján
//
// Miért: a beillesztés a fájlválasztóval azonos úton megy (change esemény),
// ezért a hibalehetőség a döntésben van: mi számít fájlnak a vágólapon, hová
// kerül, és mikor kell megerősítés (a csere új AI-elemzést indít, ami
// átírja az űrlap mezőit). A DOM-os részt böngészőben ellenőriztük.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fajlokVagolapbol, beillesztettNev, celValasztas } from "../public/js/beillesztes.js";

const fajl = (nev, type, meret = 10) => new File([new Uint8Array(meret)], nev, { type, lastModified: 1 });
const elem = (f) => ({ kind: "file", getAsFile: () => f });

test("a vágólap képét és PDF-jét elfogadja, a szöveget és más fájlt nem", () => {
  const kep = fajl("image.png", "image/png");
  const pdf = fajl("a.pdf", "application/pdf", 20);
  const doc = fajl("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 30);
  const r = fajlokVagolapbol({ files: [kep, pdf, doc], items: [] });
  assert.deepEqual(r.map((f) => f.name), ["image.png", "a.pdf"]);
});

test("sima szöveg a vágólapon: nincs fájl, a böngésző szokásos beillesztése marad", () => {
  assert.deepEqual(fajlokVagolapbol({ files: [], items: [{ kind: "string", getAsFile: () => null }] }), []);
  assert.deepEqual(fajlokVagolapbol(null), []);
  assert.deepEqual(fajlokVagolapbol(undefined), []);
  assert.deepEqual(fajlokVagolapbol({}), []);
});

test("ha a files és az items ugyanazt a képet adja, egyszer szerepel", () => {
  const kep = fajl("image.png", "image/png");
  assert.equal(fajlokVagolapbol({ files: [kep], items: [elem(kep)] }).length, 1);
  // másik példány ugyanazzal a tartalommal/mérettel is ugyanaz a kép
  assert.equal(fajlokVagolapbol({ files: [kep], items: [elem(fajl("image.png", "image/png"))] }).length, 1);
});

test("csak items-en érkező kép (a files üres) is megvan; a nem-fájl elemek kimaradnak", () => {
  const kep = fajl("image.png", "image/png");
  const r = fajlokVagolapbol({ files: [], items: [{ kind: "string", getAsFile: () => null }, elem(kep)] });
  assert.equal(r.length, 1);
});

test("két különböző beillesztett kép mindkettő megmarad", () => {
  const a = fajl("image.png", "image/png", 10);
  const b = fajl("image.png", "image/png", 99);
  assert.equal(fajlokVagolapbol({ files: [a, b], items: [] }).length, 2);
});

test("a beillesztett kép neve egyedi, nyelvfüggetlen és a típushoz illő kiterjesztésű", () => {
  const ido = new Date(2026, 9, 6, 9, 5, 3);
  assert.equal(beillesztettNev(fajl("image.png", "image/png"), ido), "pasted-090503.png");
  assert.equal(beillesztettNev(fajl("x", "image/jpeg"), ido), "pasted-090503.jpg");
  assert.equal(beillesztettNev(fajl("x", "image/webp"), ido), "pasted-090503.webp");
  assert.equal(beillesztettNev(fajl("x", "application/pdf"), ido), "pasted-090503.pdf");
  assert.equal(beillesztettNev(fajl("x", "image/bmp"), ido), "pasted-090503.png", "ismeretlen képtípus → png");
  // egyszerre több kép: sorszám különbözteti meg
  assert.equal(beillesztettNev(fajl("x", "image/png"), ido, 2), "pasted-090503-2.png");
  assert.match(beillesztettNev(fajl("x", "image/png"), ido), /^[\x20-\x7e]+$/, "nincs ékezetes vagy speciális karakter a Storage-útvonalban");
});

test("hová kerül: a már használt zónába; jelöletlenül a feladatlapra, kifejtősnél a meglévő mellé a tananyagra", () => {
  const c = (aktiv, kifejtos, vanFeladatlap) => celValasztas({ aktiv, kifejtos, vanFeladatlap });
  // fogalmazás: csak feladatlap van
  assert.deepEqual(c(null, false, false), { cel: "feladatlap", csere: false });
  assert.deepEqual(c("tananyag", false, false), { cel: "feladatlap", csere: false }, "tananyag-zóna fogalmazásnál nincs");
  // kifejtős, még nincs feladatlap
  assert.deepEqual(c(null, true, false), { cel: "feladatlap", csere: false });
  // kifejtős, van feladatlap: jelöletlenül a tananyaghoz (nem ír felül semmit)
  assert.deepEqual(c(null, true, true), { cel: "tananyag", csere: false });
  // a tanár kifejezetten a feladatlap-zónával dolgozott
  assert.deepEqual(c("feladatlap", true, false), { cel: "feladatlap", csere: false });
  assert.deepEqual(c("tananyag", true, true), { cel: "tananyag", csere: false });
});

test("a meglévő feladatlap cseréje megerősítést kér, a tananyag hozzáadása nem", () => {
  assert.equal(celValasztas({ aktiv: "feladatlap", kifejtos: false, vanFeladatlap: true }).csere, true);
  assert.equal(celValasztas({ aktiv: null, kifejtos: false, vanFeladatlap: true }).csere, true, "fogalmazásnál a jelöletlen beillesztés is a feladatlapra megy");
  assert.equal(celValasztas({ aktiv: "feladatlap", kifejtos: true, vanFeladatlap: true }).csere, true);
  assert.equal(celValasztas({ aktiv: "tananyag", kifejtos: true, vanFeladatlap: true }).csere, false);
  assert.equal(celValasztas({ aktiv: null, kifejtos: true, vanFeladatlap: true }).csere, false);
});

test("a feladatok.html bekötötte a beillesztést, és mindkét zónán jelzi a tippet", () => {
  const html = readFileSync(new URL("../public/feladatok.html", import.meta.url), "utf8");
  assert.match(html, /import \{ beillesztesBekotes \} from '\.\/js\/beillesztes\.js'/);
  assert.match(html, /beillesztesBekotes\(\{/);
  assert.equal([...html.matchAll(/data-i18n="fel\.beillesztes_tipp"/g)].length, 2, "a feladatlap és a tananyag zónán is");
  assert.match(html, /id="tananyag-zona"/);
});
