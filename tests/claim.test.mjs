// ══════════════════════════════════════════════════════
// Claim-összefűzés
//
// Miért külön teszt: a setCustomUserClaims a TELJES claim-halmazt
// felülírja. Ha egy szerep-állítás nem fűzi össze a meglévőkkel, csendben
// eltűnik az admin jelző – és a hiba csak akkor derül ki, amikor valaki
// már nem tud belépni az admin felületre.
// ══════════════════════════════════════════════════════

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-claim-teszt";

const require = createRequire(new URL("../functions/package.json", import.meta.url));

let osszefuz;

before(() => {
  osszefuz = require("./index.js")._teszt.claimOsszefuzes;
});

test("szerep beállítása MEGTARTJA a meglévő admin jelzőt", () => {
  const eredmeny = osszefuz({ szerep: "diak", admin: true }, { szerep: "tanar" });
  assert.deepEqual(eredmeny, { szerep: "tanar", admin: true });
});

test("admin jelző beállítása MEGTARTJA a meglévő szerepet", () => {
  const eredmeny = osszefuz({ szerep: "tanar" }, { admin: true });
  assert.deepEqual(eredmeny, { szerep: "tanar", admin: true });
});

test("null értékkel törölhető egy claim", () => {
  const eredmeny = osszefuz({ szerep: "tanar", admin: true }, { admin: null });
  assert.deepEqual(eredmeny, { szerep: "tanar" });
  assert.equal("admin" in eredmeny, false, "a kulcsnak el kell tűnnie, nem null-nak lennie");
});

test("üres kiinduló claim-halmaz kezelése", () => {
  assert.deepEqual(osszefuz(undefined, { szerep: "tanar" }), { szerep: "tanar" });
  assert.deepEqual(osszefuz(null, { szerep: "tanar" }), { szerep: "tanar" });
  assert.deepEqual(osszefuz({}, { szerep: "tanar" }), { szerep: "tanar" });
});

test("nem érinti az idegen claim-eket", () => {
  const eredmeny = osszefuz(
    { szerep: "tanar", admin: true, valami_mas: "x" },
    { szerep: "diak" }
  );
  assert.deepEqual(eredmeny, { szerep: "diak", admin: true, valami_mas: "x" });
});

test("nem módosítja a bemenetet (nincs mellékhatás)", () => {
  const eredeti = { szerep: "diak", admin: true };
  osszefuz(eredeti, { szerep: "tanar", admin: null });
  assert.deepEqual(eredeti, { szerep: "diak", admin: true }, "az eredeti objektum nem változhat");
});

test("egyszerre több claim állítható", () => {
  const eredmeny = osszefuz({ szerep: "diak" }, { szerep: "tanar", admin: true });
  assert.deepEqual(eredmeny, { szerep: "tanar", admin: true });
});
