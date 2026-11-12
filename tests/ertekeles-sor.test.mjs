// ══════════════════════════════════════════════════════
// Az értékelés sorba állítása – a tiszta szabályok (functions/index.js, 14. szakasz)
//
// Miért teszt: a sor feldolgozója Firestore-trigger. Ha rosszkor indul, AI-t futtat a
// tanár szándéka nélkül (pl. a diák beadására) – ez a korhatár-érvelés lényegét sértené –,
// vagy kétszer fizetünk ugyanazért.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

process.env.GCLOUD_PROJECT = "wr-ertekeles-sor-teszt";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
let t;
before(() => { t = require("./index.js")._teszt; });

const ts = (ms) => ({ toMillis: () => ms });

test("a trigger CSAK a sorba lépésre indul: a diák beadására (feltoltve) nem", () => {
  assert.equal(t.sorIndul(undefined, { statusz: "feltoltve" }), false, "új beadás: nincs AI");
  assert.equal(t.sorIndul({ statusz: "feltoltve" }, { statusz: "feltoltve" }), false);
  assert.equal(t.sorIndul({ statusz: "feltoltve" }, { statusz: "sorban", sorba_allitva: ts(1) }), true);
  assert.equal(t.sorIndul({ statusz: "hiba" }, { statusz: "sorban", sorba_allitva: ts(1) }), true);
});

test("a trigger nem indul újra a saját írásaira (sorban → folyamatban → javítva)", () => {
  assert.equal(t.sorIndul({ statusz: "sorban", sorba_allitva: ts(1) }, { statusz: "folyamatban", sorba_allitva: ts(1) }), false);
  assert.equal(t.sorIndul({ statusz: "folyamatban" }, { statusz: "javitva" }), false);
  assert.equal(t.sorIndul({ statusz: "sorban", sorba_allitva: ts(1) }, { statusz: "sorban", sorba_allitva: ts(1) }), false,
    "egy más mező írása a sorban lévőn nem indít újabb futást");
});

test("az elakadt sor újraindítható: új sorba állítási idő → új futás", () => {
  assert.equal(t.sorIndul({ statusz: "sorban", sorba_allitva: ts(1) }, { statusz: "sorban", sorba_allitva: ts(2) }), true);
});

test("sorba állítható: a beadott, és a 10 percnél régebben elakadt sorban lévő; más nem", () => {
  const most = 100 * 60 * 1000;
  assert.equal(t.sorbaAllithato({ statusz: "feltoltve" }, most), true);
  assert.equal(t.sorbaAllithato({ statusz: "sorban", sorba_allitva: ts(most - 60 * 1000) }, most), false, "friss: már sorban van");
  assert.equal(t.sorbaAllithato({ statusz: "sorban", sorba_allitva: ts(most - 11 * 60 * 1000) }, most), true, "elakadt");
  for (const statusz of ["folyamatban", "javitva", "elkuldve", "hiba"]) {
    assert.equal(t.sorbaAllithato({ statusz }, most), false, statusz);
  }
  assert.equal(t.sorbaAllithato(null, most), false);
});

test("a feldolgozó legfeljebb 5 példányban, egyesével fut, és nem ismétel (fizetős AI)", () => {
  const forras = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");
  const blokk = forras.slice(forras.indexOf("exports.ertekelesSor = onDocumentUpdated("));
  assert.match(blokk, /retry: false/);
  assert.match(blokk, /concurrency: 1/);
  assert.match(blokk, /maxInstances: 5/);
  assert.match(blokk, /if \(!sorIndul\(/, "a feldolgozás előtt a sorIndul dönt");
  assert.doesNotMatch(forras, /onDocumentCreated/, "beadás létrejöttére nincs trigger");
});
