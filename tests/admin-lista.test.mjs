// ══════════════════════════════════════════════════════
// Az admin felhasználólistája a közös mrashub Auth-ban (4d): csak a WR felhasználói látszanak,
// a QotD anonim játékosai és a csak a hubot / más appot használó fiókok nem. Emulátor nélkül fut.
// ══════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-admin-lista-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const t = require("./index.js")._teszt;

const google = [{ providerId: "google.com" }];
const fiok = (uid, extra = {}) => ({ uid, providerData: google, customClaims: {}, ...extra });

test("csak a WR felhasználói: WR-profil, szerep- vagy admin-claim; anonim soha", () => {
  const profil = new Set(["regisztralt", "anon-profillal"]);
  const ki = (u) => t.wrFelhasznalo(u, profil);
  assert.equal(ki(fiok("regisztralt")), true, "WR-profil (felhasznalok/{uid})");
  assert.equal(ki(fiok("tanar", { customClaims: { szerep: "tanar" } })), true);
  assert.equal(ki(fiok("admin", { customClaims: { admin: true } })), true);
  assert.equal(ki(fiok("csak-hub")), false, "hub-vásárló vagy QotD-tanár WR nélkül");
  assert.equal(ki({ uid: "anon", providerData: [] }), false, "QotD anonim játékos");
  assert.equal(ki({ uid: "anon-profillal", providerData: [] }), false, "anonim akkor sem, ha valahogy profilja van");
});

test("az Auth-lista lapozva jön, és a lapszám-határnál jelzi, hogy van még", async () => {
  let hivas = 0;
  const auth = { listUsers: async (_n, token) => {
    hivas++;
    const lap = Number(token ?? 0);
    return { users: [fiok(`u${lap}`)], pageToken: lap < 2 ? String(lap + 1) : undefined };
  } };
  const r = await t.wrFelhasznalok(auth);
  assert.deepEqual(r.users.map((u) => u.uid), ["u0", "u1", "u2"]);
  assert.equal(r.pageToken, undefined);
  assert.equal(hivas, 3);

  const vegtelen = { listUsers: async () => ({ users: [fiok("x")], pageToken: "tovabb" }) };
  const v = await t.wrFelhasznalok(vegtelen);
  assert.equal(v.users.length, 20);
  assert.equal(v.pageToken, "tovabb", "csonkolt lista");
});
