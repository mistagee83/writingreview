// ══════════════════════════════════════════════════════
// A callable függvények jogosultsági kapui (külső audit 5. kör, [2])
//
// Az éles `onCall` exportokat hívjuk (`.run(request)`), nem a hitelesítés
// mögé kiemelt logikát: ha egy refaktor kihagyja a belépés-/tanár-/admin-
// ellenőrzést, itt elbukik. A negatív esetekben a kapu még az adatok
// vizsgálata és bármilyen Firestore/Auth/AI-hívás ELŐTT utasít el – ezt a
// hibakód igazolja (más kód = a kapun túljutott).
// ══════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "wr-callable-teszt";
process.env.GEMINI_API_KEY = "teszt-kulcs";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
const fn = require("./index.js");

const kerel = (token, data = {}) =>
  token === null ? { data } : { auth: { uid: "u1", token }, data };

const MINDEN_KAPUS = {
  belepes: ["nevModositas", "tanariRegisztracio"],
  tanar: [
    "feladatlapElemzes", "beadasUjrafuttatas",
    "visszajelzesJovahagyas", "feladatElemzes", "kvotaAllapot",
    "fizetesIndit", "fizetesKezeles", "temaBeallitas", "linkInditas", "linkLezaras", "ertekelesInditas",
    "csoportDiakOsszevonas", "csoportBeadasLevalasztas", "csoportFejlodesLista", "csoportFejlodesDiak"
  ],
  admin: ["felhasznalokListaja", "szerepBeallitas", "aiHasznalatJelentes", "csomagBeallitas", "szamlazandoLista", "szamlaJeloles"],
  // Belépés NÉLKÜL hívható (a diák a feladatlinken): a jogosultság a token, a függvény maga ellenőrzi
  nyilvanos: ["linkAdatok", "linkBeadas", "diakVisszajelzes"]
};

async function kod(nev, request) {
  try {
    await fn[nev].run(request);
  } catch (e) {
    return e.code;
  }
  return "nem-hibazott";
}

// A hamis kliensadat soha nem ad jogot: a szerep/admin a tokenből jön.
const HAMIS = { szerep: "tanar", admin: true, adminJog: true, uid: "u1", tanar_id: "u1" };

for (const nev of [...MINDEN_KAPUS.belepes, ...MINDEN_KAPUS.tanar, ...MINDEN_KAPUS.admin]) {
  test(`${nev}: bejelentkezés nélkül elutasít (unauthenticated)`, async () => {
    assert.equal(await kod(nev, kerel(null, HAMIS)), "unauthenticated");
  });
}

for (const nev of [...MINDEN_KAPUS.tanar, ...MINDEN_KAPUS.admin]) {
  test(`${nev}: diák tokennel elutasít (permission-denied), hamis kliensadat mellett is`, async () => {
    assert.equal(await kod(nev, kerel({ szerep: "diak" }, HAMIS)), "permission-denied");
  });

  test(`${nev}: claim nélküli felhasználóval elutasít`, async () => {
    assert.equal(await kod(nev, kerel({}, HAMIS)), "permission-denied");
  });
}

for (const nev of MINDEN_KAPUS.admin) {
  test(`${nev}: tanár (nem admin) tokennel is elutasít`, async () => {
    assert.equal(await kod(nev, kerel({ szerep: "tanar" }, HAMIS)), "permission-denied");
  });

  test(`${nev}: az admin jelző csak a logikai true érvényes (szöveg/szám nem)`, async () => {
    for (const hamisAdmin of ["true", 1, "admin", {}]) {
      assert.equal(
        await kod(nev, kerel({ szerep: "tanar", admin: hamisAdmin }, HAMIS)),
        "permission-denied",
        `admin: ${JSON.stringify(hamisAdmin)}`
      );
    }
  });
}

for (const nev of MINDEN_KAPUS.tanar) {
  test(`${nev}: admin claim szerep nélkül nem helyettesíti a tanári szerepet`, async () => {
    assert.equal(await kod(nev, kerel({ admin: true }, HAMIS)), "permission-denied");
  });
}

// A nyilvános (diák) függvények belépés nélkül is futnak, de érvénytelen tokennel adatbázis-olvasás
// előtt elutasítanak – a hamis kliensadat (szerep, admin) itt sem számít.
for (const nev of MINDEN_KAPUS.nyilvanos) {
  test(`${nev}: belépés nélkül, hiányzó vagy hibás tokennel invalid-argument (nem olvas adatbázist)`, async () => {
    for (const token of [undefined, "", "rovid", "a".repeat(31) + "/", 42]) {
      assert.equal(await kod(nev, kerel(null, { ...HAMIS, token })), "invalid-argument", String(token));
    }
  });
}

test("a kapuk listája teljes: minden callable export szerepel a csoportokban", () => {
  const kapusok = new Set(Object.values(MINDEN_KAPUS).flat());
  const callable = Object.keys(fn).filter((k) => fn[k]?.__endpoint?.callableTrigger);
  const hianyzik = callable.filter((k) => !kapusok.has(k));
  assert.deepEqual(hianyzik, [], "új callable: vegyük fel a jogosultsági tesztbe");
});

