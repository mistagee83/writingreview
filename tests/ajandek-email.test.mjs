// Az ajándékkredit e-mail-címenkénti jele (hub biztonsági audit 2026-11-22, K-4). A normalizálásnak
// pontosan egyeznie kell a hub functions/credits-store.js normalizeBonusEmail / bonusEmailKey függvényével:
// ugyanezek a példák szerepelnek a hub tests/refunds.test.mjs-ében. Emulátor nélkül is fut.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ajandekEmailNormal, ajandekEmailKulcs } = require("../functions/kredit.js");

test("ajandekEmailNormal: kisbetű, +utótag nélkül, Gmailnél pontok nélkül", () => {
  assert.equal(ajandekEmailNormal(" A.B+c@GoogleMail.com "), "ab@gmail.com");
  assert.equal(ajandekEmailNormal("a.b+c@example.com"), "a.b@example.com");
  assert.equal(ajandekEmailNormal("Jane.Doe@gmail.com"), "janedoe@gmail.com");
  assert.equal(ajandekEmailNormal("janedoe+qotd@gmail.com"), "janedoe@gmail.com");
  assert.equal(ajandekEmailNormal("nope"), "");
  assert.equal(ajandekEmailNormal(null), "");
});

test("ajandekEmailKulcs: a normalizált cím SHA-256 lenyomata, cím nélkül null", () => {
  const varhato = createHash("sha256").update("janedoe@gmail.com").digest("hex");
  assert.equal(ajandekEmailKulcs("Jane.Doe@gmail.com"), varhato);
  assert.equal(ajandekEmailKulcs("JANEDOE@googlemail.com"), varhato);
  assert.notEqual(ajandekEmailKulcs("jane.doe@school.edu"), ajandekEmailKulcs("janedoe@school.edu"));
  assert.equal(ajandekEmailKulcs(null), null);
});
