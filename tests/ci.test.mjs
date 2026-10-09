// ══════════════════════════════════════════════════════
// A CI/CD-folyamatok biztonsági szabályai (.github/workflows)
//
// Miért teszt: egy elgépelt trigger vagy egy kitörölt jóváhagyás-sor csendben
// azt jelentené, hogy a prodra jóváhagyás nélkül, vagy a pilotra (ahol a
// kollégák éles munkát végeznek) automatikusan megy a telepítés.
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const mappa = new URL("../.github/workflows/", import.meta.url);
const olvas = (f) => readFileSync(new URL(f, mappa), "utf8");

test("a prod-deploy csak verziócímkére megy, jóváhagyással és a main-ről", () => {
  const p = olvas("prod.yml");
  assert.match(p, /tags:\s*\["v\*"\]/);
  assert.doesNotMatch(p, /branches:/, "ágra pusholás nem indíthat prod-deployt");
  assert.match(p, /environment:\s*prod/, "a prod environment adja a kézi jóváhagyást");
  assert.match(p, /merge-base --is-ancestor/, "csak a main-en lévő commit mehet");
  assert.match(p, /needs:\s*teszt/, "deploy csak zöld tesztek után");
  assert.match(p, /deploy\.mjs prod --yes/);
});

test("a pilotra nincs automatikus deploy", () => {
  for (const f of readdirSync(mappa)) {
    const s = olvas(f);
    assert.doesNotMatch(s, /deploy\.mjs pilot/, `${f}: a pilot kézzel frissül`);
  }
});

test("a CI emulátort használ Java 21-gyel, és Node 24-en fut", () => {
  const c = olvas("ci.yml");
  assert.match(c, /java-version:\s*21/);
  assert.match(c, /node-version:\s*24/);
  assert.match(c, /npm test --prefix tests/);
  assert.match(c, /workflow_call/);
});

test("nincs kulcsfájl vagy token a workflow-kban (Workload Identity Federation)", () => {
  for (const f of readdirSync(mappa)) {
    const s = olvas(f);
    assert.doesNotMatch(s, /FIREBASE_TOKEN|credentials_json|GOOGLE_APPLICATION_CREDENTIALS/i, f);
  }
});

test("a Firebase CLI verziója rögzítve van a workflow-kban (a deploy ne változzon magától)", () => {
  for (const f of ["ci.yml", "prod.yml"]) {
    const s = olvas(f);
    assert.match(s, /npm install -g firebase-tools@\d+\.\d+\.\d+/, `${f}: nincs rögzített firebase-tools verzió`);
    assert.doesNotMatch(s, /firebase-tools(?!@\d)/, `${f}: rögzítetlen firebase-tools`);
  }
});

test("a WIF-recept a provider szintjén a prod environmentre szűkít (nem csak a repóra)", () => {
  const d = readFileSync(new URL("../docs/ci-cd.md", import.meta.url), "utf8");
  assert.match(d, /attribute-condition="assertion\.repository==[^"]*assertion\.sub==[^"]*environment:prod/);
});
