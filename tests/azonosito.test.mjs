// Diák-azonosító: felhasználónévből kitalált cím (a diákról nem kérünk valódi e-mailt)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  felhasznalonevNormalizalas, felhasznalonevErvenyes, felhasznalonevEmailre, belepesiEmail, azonositoMegjelenites
} from "../public/js/azonosito.js";

test("a felhasználónév kisbetűs és ékezet nélküli", () => {
  assert.equal(felhasznalonevNormalizalas("  Kiss.Péter "), "kiss.peter");
});

test("érvényes és érvénytelen felhasználónevek", () => {
  for (const jo of ["kiss.peter", "abc", "a_b-c.9", "Őrült.Béla"]) assert.ok(felhasznalonevErvenyes(jo), jo);
  for (const rossz of ["", "ab", "a b c", "x@y.hu", ".kezdet", "a".repeat(31)]) assert.ok(!felhasznalonevErvenyes(rossz), rossz);
});

test("a felhasználónévből nem létező (.invalid) cím lesz", () => {
  assert.equal(felhasznalonevEmailre("Kiss.Péter"), "kiss.peter@diak.invalid");
});

test("belépésnél az e-mail-cím változatlan, a felhasználónév átalakul", () => {
  assert.equal(belepesiEmail("tanar@suli.hu"), "tanar@suli.hu");
  assert.equal(belepesiEmail("Kiss.Peter"), "kiss.peter@diak.invalid");
});

test("a listákban a kitalált cím helyett a felhasználónév látszik", () => {
  assert.equal(azonositoMegjelenites("kiss.peter@diak.invalid"), "kiss.peter");
  assert.equal(azonositoMegjelenites("tanar@suli.hu"), "tanar@suli.hu");
  assert.equal(azonositoMegjelenites(undefined), "");
});

test("a regisztrációs űrlap diáknak nem kér e-mail-címet", () => {
  const html = readFileSync(new URL("../public/belepes.html", import.meta.url), "utf8");
  assert.match(html, /id="reg-felhasznalonev-csoport"/);
  assert.match(html, /id="reg-email-csoport"[^>]*hidden/);
});

test("a Google-gomb és az elfelejtett jelszó csak a tanári nézetben látszik; a diáknak útmutató jár", () => {
  const html = readFileSync(new URL("../public/belepes.html", import.meta.url), "utf8");
  for (const id of ["btn-google-login", "btn-google-reg", "btn-elfelejtett"]) {
    assert.match(html, new RegExp(`class="[^"]*csak-tanar[^"]*"[^>]*id="${id}"`), id);
  }
  assert.match(html, /class="jelszo-sugo csak-diak"/);
});
