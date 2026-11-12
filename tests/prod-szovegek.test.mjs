// ══════════════════════════════════════════════════════
// A felület szövegei a prod működését írják le (docs/prod-atalakitas-terv.md)
//
// Miért teszt: a 2026-11-12-i helyi, emulátoros végigpróbálás három olyan szöveget talált,
// ami még a régi (osztályos, diákfiókos, beadáskor automatikusan AI-t indító) működést írta le:
// a feladat mentésének üzenete, a bemutató két lépése, és a javítási sor súgója, ami nem létező
// szűrőnévre hivatkozott. A kódtesztek ezeket nem fogják meg, a tanárt viszont félrevezetik.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";

const hu = (await import("../public/js/i18n-hu.js")).default;
const en = (await import("../public/js/i18n-en.js")).default;

// A régi működés fordulatai. A pilot ágon ezek érvényesek, a prodon nem.
const TILTOTT = {
  hu: [/osztálykód/i, /osztályuk/i, /osztályhoz csatlakoz/i, /diákok felületén/i, /magától (elkezdi|indul)/i,
       /lefényképezi|fényképet tölt/i, /kézzel írt/i, /\bleirat/i, /kifejtős/i],
  en: [/class code/i, /in their class/i, /students' screens/i, /starts processing it by itself/i,
       /photograph/i, /handwrit/i, /transcri/i]
};
// Kivételek: kulcsok, ahol a szó szándékosan szerepel. A feladatlapot a TANÁR fényképezi le (ma is így van).
const KIVETEL = new Set(["tura.feladatok_2_cim"]);

for (const [nyelv, szotar] of [["hu", hu], ["en", en]]) {
  test(`${nyelv}: egyik szöveg sem a régi (osztályos, kézírásos, automatikus AI-s) működést írja le`, () => {
    const talalat = [];
    for (const [k, v] of Object.entries(szotar)) {
      if (KIVETEL.has(k) || typeof v !== "string") continue;
      for (const minta of TILTOTT[nyelv]) if (minta.test(v)) talalat.push(`${k}: ${minta} → "${v.slice(0, 80)}"`);
    }
    assert.deepEqual(talalat, []);
  });
}

test("a javítási sor súgója a szűrő valódi nevére hivatkozik (jav.szuro_javitva)", () => {
  for (const [nyelv, szotar] of [["hu", hu], ["en", en]]) {
    const szuroNev = szotar["jav.szuro_javitva"].replace(/^[^\p{L}]+/u, "").trim();
    assert.ok(szotar["jav.mind_tipp"].includes(szuroNev), `${nyelv}: „${szuroNev}” nincs a jav.mind_tipp-ben`);
  }
});

test("a bemutató szerint a tanár indítja az értékelést, nem a diák beadása", () => {
  assert.match(hu["tura.javitas_1_szoveg"], /te indítod az értékelést/);
  assert.match(en["tura.javitas_1_szoveg"], /you start grading/);
});
