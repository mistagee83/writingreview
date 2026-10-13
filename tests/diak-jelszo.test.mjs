// ══════════════════════════════════════════════════════
// Diák jelszavának visszaállítása (admin / a diák tanára)
//
// A diákról nincs valódi e-mail-cím, ezért a visszaállítást szerver végzi.
// Emulátor nélkül fut: az adatbázis és az Auth egyszerű hamisítvány.
// ══════════════════════════════════════════════════════
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.GCLOUD_PROJECT = "wr-diak-jelszo-teszt";
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { ideiglenesJelszo, diakJelszoVisszaallitasLogika } = require("./index.js")._teszt;

// osztalyok: { id: { tanar_id, tagok: [uid] } }, osztalyaim: { diakUid: [osztalyId] }
function hamisDb({ osztalyok = {}, osztalyaim = {} }) {
  const doc = (ut) => ({
    get: async () => {
      const [gy, id] = ut;
      const o = gy === "osztalyok" ? osztalyok[id] : null;
      return { exists: Boolean(o), id, data: () => o && { tanar_id: o.tanar_id }, ref: { collection: () => ({ doc: (u) => ({ get: async () => ({ exists: Boolean(o?.tagok.includes(u)) }) }) }) } };
    },
    collection: (alnev) => ({
      get: async () => ({ docs: (alnev === "osztalyaim" ? osztalyaim[ut[1]] || [] : []).map((id) => ({ id })) })
    })
  });
  return { collection: (gy) => ({ doc: (id) => doc([gy, id]) }) };
}

function hamisAuth(user) {
  const naplo = { frissit: null, tokenVissza: false };
  return {
    naplo,
    getUser: async () => { if (!user) throw new Error("nincs"); return user; },
    updateUser: async (uid, v) => { naplo.frissit = { uid, ...v }; },
    revokeRefreshTokens: async () => { naplo.tokenVissza = true; }
  };
}

const DIAK = { email: "kiss.peter@diak.invalid", customClaims: { szerep: "diak" }, providerData: [{ providerId: "password" }] };
const ADAT = { osztalyok: { o1: { tanar_id: "t1", tagok: ["d1"] } }, osztalyaim: { d1: ["o1"] } };

const kod = async (fut) => { try { await fut; } catch (e) { return e.code; } return "nem-hibazott"; };

test("az ideiglenes jelszó 10 karakter, félreolvasható karakterek nélkül", () => {
  for (let i = 0; i < 50; i++) assert.match(ideiglenesJelszo(), /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
  assert.notEqual(ideiglenesJelszo(), ideiglenesJelszo());
});

test("a diák tanára új jelszót állít, a régi munkamenetek érvénytelenek", async () => {
  const auth = hamisAuth(DIAK);
  const r = await diakJelszoVisszaallitasLogika(hamisDb(ADAT), auth, { uid: "t1", admin: false }, "d1");
  assert.equal(r.azonosito, "kiss.peter@diak.invalid");
  assert.equal(auth.naplo.frissit.password, r.jelszo);
  assert.equal(auth.naplo.tokenVissza, true);
});

test("más tanár nem állíthatja vissza a diák jelszavát (és nem is módosul semmi)", async () => {
  const auth = hamisAuth(DIAK);
  assert.equal(await kod(diakJelszoVisszaallitasLogika(hamisDb(ADAT), auth, { uid: "t2", admin: false }, "d1")), "permission-denied");
  assert.equal(auth.naplo.frissit, null);
});

test("az osztály tanára sem, ha a diák már nem tag", async () => {
  const adat = { osztalyok: { o1: { tanar_id: "t1", tagok: [] } }, osztalyaim: { d1: ["o1"] } };
  assert.equal(await kod(diakJelszoVisszaallitasLogika(hamisDb(adat), hamisAuth(DIAK), { uid: "t1", admin: false }, "d1")), "permission-denied");
});

test("az admin osztálytagság nélkül is visszaállíthat", async () => {
  const r = await diakJelszoVisszaallitasLogika(hamisDb({}), hamisAuth(DIAK), { uid: "a1", admin: true }, "d1");
  assert.ok(r.jelszo);
});

test("tanár vagy admin jelszava így nem állítható (az e-mailes úton megy)", async () => {
  for (const claims of [{ szerep: "tanar" }, { szerep: "diak", admin: true }]) {
    const auth = hamisAuth({ ...DIAK, customClaims: claims });
    assert.equal(await kod(diakJelszoVisszaallitasLogika(hamisDb({}), auth, { uid: "a1", admin: true }, "d1")), "failed-precondition");
    assert.equal(auth.naplo.frissit, null);
  }
});

test("a Google-fióknak nincs jelszava, azt nem hozzuk létre", async () => {
  const auth = hamisAuth({ ...DIAK, providerData: [{ providerId: "google.com" }] });
  assert.equal(await kod(diakJelszoVisszaallitasLogika(hamisDb({}), auth, { uid: "a1", admin: true }, "d1")), "failed-precondition");
  assert.equal(auth.naplo.frissit, null);
});

test("nem létező felhasználó: not-found", async () => {
  assert.equal(await kod(diakJelszoVisszaallitasLogika(hamisDb({}), hamisAuth(null), { uid: "a1", admin: true }, "d1")), "not-found");
});
