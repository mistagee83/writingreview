// ══════════════════════════════════════════════════════
// A diáknak kimenő pontozási táblázat (pontTablazat)
//
// Miért külön teszt: ezt a táblázatot a DIÁK látja. A váz az
// AI-értékelésből jön, a tanár csak pontot és megjegyzést írhat át –
// ha a kliens a maximumot vagy egy nem létező szempontot is
// becsempészhetne, a diák hamis pontszámot kapna.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-pontozas-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let t;

before(() => {
  t = require("./index.js")._teszt;
});

const ai = {
  szempontok: [
    { kulcs: "tartalom", pont: 7, max: 10, megjegyzes: "Két szempont hiányzik." },
    { kulcs: "nyelvtan", pont: 8, max: 10, megjegyzes: "Kevés hiba." }
  ]
};
const rubrika = {
  szempontok: [
    { kulcs: "tartalom", cim: "Tartalom", suly: 10 },
    { kulcs: "nyelvtan", cim: "Nyelvhelyesség", suly: 10 }
  ]
};

test("módosítás nélkül az AI pontjai mennek ki, a rubrika címeivel", () => {
  const r = t.pontTablazat(ai, rubrika);
  assert.deepEqual(r.szempontok.map((sz) => [sz.cim, sz.pont, sz.max]),
    [["Tartalom", 7, 10], ["Nyelvhelyesség", 8, 10]]);
  assert.equal(r.osszpontszam, 15);
  assert.equal(r.max_pontszam, 20);
  assert.equal(r.szazalek, 75);
});

test("a tanár pontja és megjegyzése felülírja az AI-ét, az összeg újraszámolódik", () => {
  const r = t.pontTablazat(ai, rubrika, [
    { kulcs: "tartalom", pont: 9, megjegyzes: "Szép munka!" }
  ]);
  assert.equal(r.szempontok[0].pont, 9);
  assert.equal(r.szempontok[0].megjegyzes, "Szép munka!");
  assert.equal(r.szempontok[1].pont, 8, "a nem módosított szempont marad");
  assert.equal(r.osszpontszam, 17);
  assert.equal(r.szazalek, 85);
});

test("a maximumot és a szempontlistát a kliens nem írhatja át", () => {
  const r = t.pontTablazat(ai, rubrika, [
    { kulcs: "tartalom", pont: 5, max: 100 },
    { kulcs: "kitalalt", pont: 50 }
  ]);
  assert.equal(r.szempontok.length, 2);
  assert.equal(r.max_pontszam, 20);
  assert.equal(r.osszpontszam, 13);
});

test("a maximumnál több vagy negatív pont hibát dob", () => {
  assert.throws(() => t.pontTablazat(ai, rubrika, [{ kulcs: "tartalom", pont: 11 }]), /Tartalom/);
  assert.throws(() => t.pontTablazat(ai, rubrika, [{ kulcs: "tartalom", pont: -1 }]));
  assert.throws(() => t.pontTablazat(ai, rubrika, [{ kulcs: "tartalom", pont: "sok" }]));
});

test("üres pontmező = az AI pontja marad (nem 0)", () => {
  const r = t.pontTablazat(ai, rubrika, [{ kulcs: "tartalom", pont: "" }]);
  assert.equal(r.szempontok[0].pont, 7);
});

test("fél pont megengedett", () => {
  const r = t.pontTablazat(ai, rubrika, [{ kulcs: "nyelvtan", pont: 7.5 }]);
  assert.equal(r.osszpontszam, 14.5);
});

test("törölt feladat (nincs rubrika): a kulcs lesz a cím", () => {
  const r = t.pontTablazat(ai, undefined);
  assert.equal(r.szempontok[0].cim, "tartalom");
});
