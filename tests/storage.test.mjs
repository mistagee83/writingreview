// ══════════════════════════════════════════════════════
// storage.rules – biztonsági tesztek (külső audit 5. kör, [1])
//
// Futtatás: npm test (a tests/ könyvtárból; Firestore- ÉS Storage-emulátor).
// A beadási fotók tanári olvasása a Firestore-beli beadás tanar_id-jétől
// függ (cross-service rules), ezért mindkét emulátor kell.
// ══════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const TANAR = "tanar-uid";
const TANAR2 = "masik-tanar-uid";
const DIAK = "diak-uid";
const DIAK2 = "masik-diak-uid";
const BEADAS = "feladat-1_diak-uid";

const KEP = { contentType: "image/jpeg" };
const PDF = { contentType: "application/pdf" };
const BAJTOK = new Uint8Array([1, 2, 3, 4]);

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "writingreview-41e59",
    firestore: {
      rules: readFileSync("../firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080
    },
    storage: {
      rules: readFileSync("../storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199
    }
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "beadasok", BEADAS), {
      feladat_id: "feladat-1", osztaly_id: "osztaly-1", diak_id: DIAK, tanar_id: TANAR,
      statusz: "javitva", letrehozva: new Date()
    });
    const st = ctx.storage();
    await uploadBytes(ref(st, `beadasok/${DIAK}/${BEADAS}/1.jpg`), BAJTOK, KEP);
    await uploadBytes(ref(st, `feladatlapok/${TANAR}/lap.jpg`), BAJTOK, KEP);
    await uploadBytes(ref(st, `tananyagok/${TANAR}/anyag.pdf`), BAJTOK, PDF);
  });
});

const diak = () => env.authenticatedContext(DIAK, { szerep: "diak" }).storage();
const diak2 = () => env.authenticatedContext(DIAK2, { szerep: "diak" }).storage();
const tanar = () => env.authenticatedContext(TANAR, { szerep: "tanar" }).storage();
const tanar2 = () => env.authenticatedContext(TANAR2, { szerep: "tanar" }).storage();
const claimNelkul = () => env.authenticatedContext(DIAK).storage();
const nemBelepett = () => env.unauthenticatedContext().storage();

const BEADAS_KEP = `beadasok/${DIAK}/${BEADAS}/1.jpg`;
const FELADATLAP = `feladatlapok/${TANAR}/lap.jpg`;
const TANANYAG = `tananyagok/${TANAR}/anyag.pdf`;

// ── Dolgozatfotók ──

test("a diák olvashatja a saját dolgozatfotóját", async () => {
  await assertSucceeds(getBytes(ref(diak(), BEADAS_KEP)));
});

test("a beadás tanára olvashatja a dolgozatfotót", async () => {
  await assertSucceeds(getBytes(ref(tanar(), BEADAS_KEP)));
});

test("idegen diák NEM olvashatja a dolgozatfotót", async () => {
  await assertFails(getBytes(ref(diak2(), BEADAS_KEP)));
});

test("idegen tanár NEM olvashatja a dolgozatfotót", async () => {
  await assertFails(getBytes(ref(tanar2(), BEADAS_KEP)));
});

test("be nem lépett kliens NEM olvashatja a dolgozatfotót", async () => {
  await assertFails(getBytes(ref(nemBelepett(), BEADAS_KEP)));
});

test("beadás-dokumentum nélkül a tanár NEM olvashatja a fotót", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), `beadasok/${DIAK}/nincs-doksi/1.jpg`), BAJTOK, KEP);
  });
  await assertFails(getBytes(ref(tanar(), `beadasok/${DIAK}/nincs-doksi/1.jpg`)));
});

test("a diák feltöltheti a saját fotóját (kép és PDF), idegen mappába nem", async () => {
  await assertSucceeds(uploadBytes(ref(diak(), `beadasok/${DIAK}/uj-beadas/2.jpg`), BAJTOK, KEP));
  await assertSucceeds(uploadBytes(ref(diak(), `beadasok/${DIAK}/uj-beadas/3.pdf`), BAJTOK, PDF));
  await assertFails(uploadBytes(ref(diak(), `beadasok/${DIAK2}/uj-beadas/2.jpg`), BAJTOK, KEP));
  await assertFails(uploadBytes(ref(nemBelepett(), `beadasok/${DIAK}/uj-beadas/4.jpg`), BAJTOK, KEP));
});

test("dolgozatfotó: nem kép/PDF típus és a 10 MB-os méret tiltott", async () => {
  await assertFails(uploadBytes(ref(diak(), `beadasok/${DIAK}/uj/x.html`), BAJTOK, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(diak(), `beadasok/${DIAK}/uj/x.jpg`), new Uint8Array(10 * 1024 * 1024), KEP));
});

test("a beadott fotó nem írható felül és nem törölhető (diák, tanár sem)", async () => {
  await assertFails(uploadBytes(ref(diak(), BEADAS_KEP), BAJTOK, KEP));
  await assertFails(deleteObject(ref(diak(), BEADAS_KEP)));
  await assertFails(deleteObject(ref(tanar(), BEADAS_KEP)));
});

// ── Feladatlapok ──

test("feladatlap: a tanár a saját mappájába tölthet fel és olvashat", async () => {
  await assertSucceeds(uploadBytes(ref(tanar(), `feladatlapok/${TANAR}/uj.jpg`), BAJTOK, KEP));
  await assertSucceeds(getBytes(ref(tanar(), FELADATLAP)));
});

test("feladatlap: idegen tanár/diák NEM tölthet fel és NEM olvashat", async () => {
  await assertFails(uploadBytes(ref(tanar2(), `feladatlapok/${TANAR}/uj.jpg`), BAJTOK, KEP));
  await assertFails(uploadBytes(ref(diak(), `feladatlapok/${DIAK}/uj.jpg`), BAJTOK, KEP));
  await assertFails(getBytes(ref(tanar2(), FELADATLAP)));
  await assertFails(getBytes(ref(nemBelepett(), FELADATLAP)));
});

test("feladatlap: claim nélküli (diák) felhasználó a saját mappájába sem tölthet fel", async () => {
  await assertFails(uploadBytes(ref(claimNelkul(), `feladatlapok/${DIAK}/uj.jpg`), BAJTOK, KEP));
});

test("feladatlap: típus- és méretkorlát, felülírás/törlés tiltott", async () => {
  await assertFails(uploadBytes(ref(tanar(), `feladatlapok/${TANAR}/x.html`), BAJTOK, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(tanar(), `feladatlapok/${TANAR}/nagy.jpg`), new Uint8Array(10 * 1024 * 1024), KEP));
  await assertFails(uploadBytes(ref(tanar(), FELADATLAP), BAJTOK, KEP));
  await assertFails(deleteObject(ref(tanar(), FELADATLAP)));
});

// ── Tananyagok (kifejtős) ──

test("tananyag: csak a tulajdonos tanár tölthet fel és olvashat", async () => {
  await assertSucceeds(uploadBytes(ref(tanar(), `tananyagok/${TANAR}/uj.pdf`), BAJTOK, PDF));
  await assertSucceeds(getBytes(ref(tanar(), TANANYAG)));
  await assertFails(getBytes(ref(tanar2(), TANANYAG)));
  await assertFails(getBytes(ref(diak(), TANANYAG)));
  await assertFails(getBytes(ref(nemBelepett(), TANANYAG)));
  await assertFails(uploadBytes(ref(tanar2(), `tananyagok/${TANAR}/uj.pdf`), BAJTOK, PDF));
  await assertFails(uploadBytes(ref(diak(), `tananyagok/${DIAK}/uj.pdf`), BAJTOK, PDF));
});

test("tananyag: típus- és méretkorlát, felülírás/törlés tiltott", async () => {
  await assertFails(uploadBytes(ref(tanar(), `tananyagok/${TANAR}/x.html`), BAJTOK, { contentType: "text/html" }));
  await assertFails(uploadBytes(ref(tanar(), `tananyagok/${TANAR}/nagy.pdf`), new Uint8Array(10 * 1024 * 1024), PDF));
  await assertFails(uploadBytes(ref(tanar(), TANANYAG), BAJTOK, PDF));
  await assertFails(deleteObject(ref(tanar(), TANANYAG)));
});

// ── Minden más tiltott ──

test("ismeretlen útvonalra senki nem írhat/olvashat", async () => {
  await assertFails(uploadBytes(ref(tanar(), "egyeb/x.jpg"), BAJTOK, KEP));
  await assertFails(getBytes(ref(tanar(), "egyeb/x.jpg")));
});
