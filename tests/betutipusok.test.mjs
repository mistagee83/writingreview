// ══════════════════════════════════════════════════════
// Betűtípusok: helyi kiszolgálás (adatvédelem)
//
// A Google Fonts külső betöltése a látogató IP-címét a Google-nek adja ki
// (adatvédelmi kockázat). A Syne és a DM Sans a saját tárhelyünkről jön
// (public/css/fonts/, @font-face az app.css-ben). Ez a teszt őrzi, hogy
// egy lap se kerüljön vissza külső betűtípus-szolgáltatóhoz, és hogy minden
// @font-face-hez létezzen a fájl.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const olvas = (f) => readFileSync(join(PUBLIC, f), "utf8");

const lapok = readdirSync(PUBLIC).filter((f) => f.endsWith(".html"));

test("egyetlen lap sem tölt be betűtípust külső szolgáltatótól", () => {
  assert.ok(lapok.length >= 12, "a lapok listája üres?");
  for (const lap of lapok) {
    const t = olvas(lap);
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(t), `${lap}: külső betűtípus`);
  }
});

test("a stíluslapok és a szkriptek sem hivatkoznak külső betűtípus-szolgáltatóra", () => {
  for (const f of ["css/app.css", "css/auth.css", "sw.js"]) {
    if (!existsSync(join(PUBLIC, f))) continue;
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(olvas(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")), `${f}: külső betűtípus`);
  }
});

test("minden @font-face a saját fájlra mutat, és a fájl létezik (latin és latin-ext, a magyar ő/ű miatt)", () => {
  const css = olvas("css/app.css");
  const forrasok = [...css.matchAll(/@font-face\s*\{[^}]*?src:\s*url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(forrasok.length >= 6, `kevés @font-face: ${forrasok.length}`);
  for (const f of forrasok) {
    assert.ok(!/^https?:/.test(f), `külső forrás: ${f}`);
    assert.ok(existsSync(join(PUBLIC, "css", f)), `hiányzó betűtípus-fájl: ${f}`);
  }
  assert.ok(forrasok.some((f) => /syne-.*latin-ext/.test(f)), "Syne latin-ext hiányzik");
  assert.ok(forrasok.some((f) => /dmsans-normal-latin-ext/.test(f)), "DM Sans latin-ext hiányzik");
});

test("a használt betűcsaládok mind helyben vannak (Syne, DM Sans)", () => {
  const css = olvas("css/app.css");
  const deklaralt = new Set([...css.matchAll(/@font-face\s*\{[^}]*?font-family:\s*'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...deklaralt].sort(), ["DM Sans", "Syne"]);
});
