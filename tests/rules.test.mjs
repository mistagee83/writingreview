// ══════════════════════════════════════════════════════
// firestore.rules – biztonsági tesztek
//
// Futtatás a tests/ könyvtárból:
//   npm test
//
// Az emulátort az npm script indítja (firebase emulators:exec).
// ══════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, writeBatch
} from "firebase/firestore";

const TANAR = "tanar-uid";
const TANAR2 = "masik-tanar-uid";
const DIAK = "diak-uid";
const DIAK2 = "masik-diak-uid";
const OSZTALY = "osztaly-1";
const FELADAT = "feladat-1";
const BEADAS = "beadas-1";

let env;

before(async () => {
  // Ha a szabályfájl nem fordul le, ez a hívás elhasal – tehát ez
  // egyben a szintaktikai ellenőrzés is.
  env = await initializeTestEnvironment({
    projectId: "writingreview-41e59",
    firestore: {
      rules: readFileSync("../firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080
    }
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Kezdőállapot a szabályok kikapcsolásával
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "felhasznalok", DIAK), {
      nev: "Diák Dóra", email: "diak@iskola.hu", szerep: "diak", letrehozva: new Date()
    });
    await setDoc(doc(db, "felhasznalok", TANAR), {
      nev: "Tanár Tamás", email: "tanar@iskola.hu", szerep: "tanar", letrehozva: new Date()
    });

    await setDoc(doc(db, "osztalyok", OSZTALY), {
      nev: "9.B angol", kod: "9BK-4M2T", tanar_id: TANAR,
      aktiv: true, diak_szam: 1, letrehozva: new Date()
    });
    await setDoc(doc(db, "osztalyok", OSZTALY, "tagok", DIAK), {
      nev: "Diák Dóra", email: "diak@iskola.hu", csatlakozott: new Date()
    });

    await setDoc(doc(db, "kodok", "9BK-4M2T"), { osztaly_id: OSZTALY });

    await setDoc(doc(db, "feladatok", FELADAT), {
      osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Essay – My hometown",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé", szint: "B1" },
      feladatlap: { path: "feladatlapok/x/y.jpg", url: "https://x" },
      letrehozva: new Date()
    });

    await setDoc(doc(db, "beadasok", BEADAS), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: [`beadasok/${DIAK}/${BEADAS}/1.jpg`],
      statusz: "javitva", atirat: "I go to the cinema yesterday.",
      hiba: null, letrehozva: new Date(), frissitve: new Date()
    });
    await setDoc(doc(db, "beadasok", BEADAS, "ertekeles", "ai"), {
      osszpontszam: 77, hibak: [], diak_szoveg: "Jó munka!", model: "gemini"
    });
    await setDoc(doc(db, "beadasok", BEADAS, "ertekeles", "tanari"), {
      jegy: 4, szoveg: "Szép munka, figyelj a past simple-re.", tanar_id: TANAR
    });
  });
});

const FELADATLAP = {
  path: `feladatlapok/${TANAR}/123_lap.jpg`,
  url: "https://firebasestorage.googleapis.com/v0/b/proj.appspot.com/o/lap.jpg?alt=media&token=abc"
};
// A beadás azonosítója kötött: <feladat_id>_<diak_uid>
const ujId = (feladat = FELADAT, uid = DIAK) => `${feladat}_${uid}`;

// ── Kontextusok ──
const diak = () => env.authenticatedContext(DIAK, { szerep: "diak" }).firestore();
const diak2 = () => env.authenticatedContext(DIAK2, { szerep: "diak" }).firestore();
const tanar = () => env.authenticatedContext(TANAR, { szerep: "tanar" }).firestore();
const tanar2 = () => env.authenticatedContext(TANAR2, { szerep: "tanar" }).firestore();
const nemBelepett = () => env.unauthenticatedContext().firestore();
// Claim nélküli felhasználó – a rules szerint diáknak kell számítania
const claimNelkul = () => env.authenticatedContext(DIAK).firestore();

// ══════════════════════════════════════════
// SZEREPKÖR-ESZKALÁCIÓ
// ══════════════════════════════════════════

test("a diák NEM írhatja át magát tanárrá", async () => {
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { szerep: "tanar" })
  );
});

test("a diák átírhatja a saját nevét", async () => {
  await assertSucceeds(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { nev: "Diák Dorottya" })
  );
});

test("a diák NEM írhatja át a saját email címét", async () => {
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { email: "masik@iskola.hu" })
  );
});

// ── ÖNKISZOLGÁLÓ TANÁRI REGISZTRÁCIÓ ──
// A tanari_kerelem csak jelzés a regisztrációkor; a tanári jogot kizárólag a
// tanariRegisztracio Function adja. A kliens semmiképp nem lehet tanár.

const UJ = "uj-felhasznalo-uid";
const ujFelh = () => env.authenticatedContext(UJ).firestore();
const ujProfil = (extra = {}) => ({
  nev: "Új Tanár", email: "uj@iskola.hu", szerep: "diak", letrehozva: new Date(), ...extra
});

test("regisztrációkor kérhető a tanári regisztráció jelzése, de a profil diák marad", async () => {
  await assertSucceeds(
    setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ tanari_kerelem: true }))
  );
});

test("a tanari_kerelem csak igaz lehet", async () => {
  await assertFails(
    setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ tanari_kerelem: false }))
  );
  await assertFails(
    setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ tanari_kerelem: "igen" }))
  );
});

test("regisztrációkor a profilba nem írható közvetlenül a tanári szerep", async () => {
  await assertFails(
    setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ szerep: "tanar", tanari_kerelem: true }))
  );
});

test("regisztrációkor nem írhatók be a szerver mezői (tanar_regisztralt)", async () => {
  await assertFails(
    setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ tanar_regisztralt: new Date() }))
  );
});

test("a meglévő diák utólag NEM kérhet tanári regisztrációt (a jelzés csak létrehozáskor írható)", async () => {
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { tanari_kerelem: true })
  );
});

test("a tanari_kerelem utólag nem is törölhető/módosítható a kliensről", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "felhasznalok", UJ), ujProfil({ tanari_kerelem: true }));
  });
  await assertFails(
    updateDoc(doc(ujFelh(), "felhasznalok", UJ), { tanari_kerelem: false })
  );
  await assertFails(
    updateDoc(doc(ujFelh(), "felhasznalok", UJ), { szerep: "tanar" })
  );
});

// ── AI-HASZNÁLAT NAPLÓ ──
test("az ai_hasznalat naplót kliens sem olvashatja, sem írhatja (tanár és diák sem)", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "ai_hasznalat", "r1"), { tanar_id: TANAR, muvelet: "elemzes" });
  });
  for (const kontextus of [tanar(), diak(), nemBelepett()]) {
    await assertFails(getDoc(doc(kontextus, "ai_hasznalat", "r1")));
    await assertFails(setDoc(doc(kontextus, "ai_hasznalat", "r2"), { tanar_id: TANAR, muvelet: "elemzes" }));
    await assertFails(getDocs(collection(kontextus, "ai_hasznalat")));
  }
});

// ── A BEMUTATÓ ÁLLAPOTA ──
// A saját profiljában tárolja, hogy látta-e már a bemutatót. Enélkül
// minden gépen újra felnyílna, de a mező NEM lehet szabad tárhely.

test("a felhasználó elmentheti, hogy látta a bemutatót", async () => {
  await assertSucceeds(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { tura_kesz: true })
  );
});

test("a látott szakaszok listája menthető", async () => {
  await assertSucceeds(
    updateDoc(doc(diak(), "felhasznalok", DIAK), {
      tura_latott: ["osztalyok", "feladatok"]
    })
  );
});

test("a bemutató mezője nem lehet akármilyen típusú", async () => {
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { tura_kesz: "igen" })
  );
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), { tura_latott: "osztalyok" })
  );
});

test("a bemutató mezője nem használható korlátlan tárolásra", async () => {
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), {
      tura_latott: Array.from({ length: 21 }, (_, i) => `x${i}`)
    })
  );
});

test("a bemutató mezője mellé NEM csúsztatható be a szerep", async () => {
  await assertFails(
    updateDoc(doc(diak(), "felhasznalok", DIAK), {
      tura_kesz: true, szerep: "tanar"
    })
  );
});

test("a diák NEM olvashatja más felhasználó profilját", async () => {
  await assertFails(getDoc(doc(diak(), "felhasznalok", TANAR)));
});

test("a tanár SEM olvashatja a diák felhasznalok dokumentumát (a névsor a tagokban van)", async () => {
  await assertFails(getDoc(doc(tanar(), "felhasznalok", DIAK)));
});

test("hamis szerep-claim nélkül a felhasználó nem kap tanári jogot", async () => {
  await assertFails(
    setDoc(doc(claimNelkul(), "feladatok", "uj-feladat"), {
      osztaly_id: OSZTALY, tanar_id: DIAK, cim: "Hamis", rubrika: {}
    })
  );
});

// ══════════════════════════════════════════
// KÓD-NYILVÁNTARTÓ
// ══════════════════════════════════════════

test("a kódokat senki nem olvashatja kliensről (nem próbálhatók végig)", async () => {
  await assertFails(getDoc(doc(diak(), "kodok", "9BK-4M2T")));
  await assertFails(getDoc(doc(tanar(), "kodok", "9BK-4M2T")));
});

// ══════════════════════════════════════════
// OSZTÁLYOK
// ══════════════════════════════════════════

test("a tanár olvashatja a saját osztályát", async () => {
  await assertSucceeds(getDoc(doc(tanar(), "osztalyok", OSZTALY)));
});

test("a másik tanár NEM olvashatja", async () => {
  await assertFails(getDoc(doc(tanar2(), "osztalyok", OSZTALY)));
});

test("a tagként bejegyzett diák olvashatja az osztályát", async () => {
  await assertSucceeds(getDoc(doc(diak(), "osztalyok", OSZTALY)));
});

test("a nem tag diák NEM olvashatja", async () => {
  await assertFails(getDoc(doc(diak2(), "osztalyok", OSZTALY)));
});

test("a tanár NEM hozhat létre osztályt kliensről (a kód mintázása Function)", async () => {
  await assertFails(
    setDoc(doc(tanar(), "osztalyok", "uj-osztaly"), {
      nev: "10.A angol", kod: "AAA-BBBB", tanar_id: TANAR,
      aktiv: true, diak_szam: 0, letrehozva: new Date()
    })
  );
});

test("a tanár átnevezheti és deaktiválhatja a saját osztályát", async () => {
  await assertSucceeds(
    updateDoc(doc(tanar(), "osztalyok", OSZTALY), { nev: "9.B angol (2026)", aktiv: false })
  );
});

test("a tanár NEM írhatja át az osztály kódját vagy létszámát", async () => {
  await assertFails(updateDoc(doc(tanar(), "osztalyok", OSZTALY), { kod: "XXX-YYYY" }));
  await assertFails(updateDoc(doc(tanar(), "osztalyok", OSZTALY), { diak_szam: 999 }));
});

test("a diák NEM írhatja be magát tagnak (a csatlakozás Function)", async () => {
  await assertFails(
    setDoc(doc(diak2(), "osztalyok", OSZTALY, "tagok", DIAK2), {
      nev: "Betolakodó", email: "x@y.hu", csatlakozott: new Date()
    })
  );
});

test("a tanár olvashatja a saját osztálya névsorát", async () => {
  await assertSucceeds(getDoc(doc(tanar(), "osztalyok", OSZTALY, "tagok", DIAK)));
});

// ══════════════════════════════════════════
// FELADATOK
// ══════════════════════════════════════════

test("a tanár létrehozhat feladatot a saját osztályába", async () => {
  await assertSucceeds(
    setDoc(doc(tanar(), "feladatok", "uj-feladat"), {
      osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Letter writing",
      aktiv: true, hatarido: null, rubrika: { tipus: "levél" },
      feladatlap: FELADATLAP, letrehozva: new Date()
    })
  );
});

// ── Külső audit 3. kör: a tanár által írt, a diák felületén megjelenő mezők ──
const ujFeladat = (felul = {}) => ({
  osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Letter writing",
  aktiv: true, hatarido: null, rubrika: { tipus: "levél" }, letrehozva: new Date(), ...felul
});

test("feladat: a szószámhatár csak szám vagy null lehet (HTML/szöveg nem)", async () => {
  await assertSucceeds(setDoc(doc(tanar(), "feladatok", "f-ok1"), ujFeladat({ rubrika: { min_szo: 100, max_szo: 180 } })));
  await assertSucceeds(setDoc(doc(tanar(), "feladatok", "f-ok2"), ujFeladat({ rubrika: { min_szo: null, max_szo: null } })));
  for (const rossz of ['<img src=x onerror=alert(1)>', "120", { a: 1 }, [1], -5, 1e9]) {
    await assertFails(setDoc(doc(tanar(), "feladatok", "f-rossz"), ujFeladat({ rubrika: { min_szo: rossz, max_szo: 180 } })));
    await assertFails(setDoc(doc(tanar(), "feladatok", "f-rossz"), ujFeladat({ rubrika: { min_szo: 100, max_szo: rossz } })));
  }
});

test("feladat: a szószám szerkesztéskor sem lehet szöveg", async () => {
  await assertFails(updateDoc(doc(tanar(), "feladatok", FELADAT), { rubrika: { min_szo: "<b>x</b>", max_szo: 5 } }));
  await assertSucceeds(updateDoc(doc(tanar(), "feladatok", FELADAT), { rubrika: { min_szo: 50, max_szo: 90 } }));
});

test("feladat: a feladatlap csak a tanár saját feltöltése és Storage-URL lehet", async () => {
  await assertSucceeds(setDoc(doc(tanar(), "feladatok", "f-lap"), ujFeladat({ feladatlap: FELADATLAP })));
  for (const rossz of [
    { ...FELADATLAP, url: "javascript:alert(1)" },
    { ...FELADATLAP, url: "https://evil.example/lap.jpg" },
    { ...FELADATLAP, url: "http://firebasestorage.googleapis.com/x" },
    { ...FELADATLAP, path: "feladatlapok/masik-tanar-uid/123_lap.jpg" },
    { ...FELADATLAP, path: "beadasok/diak-uid/b/1.jpg" },
    { ...FELADATLAP, extra: 1 },
    {}, "szöveg"
  ]) {
    await assertFails(setDoc(doc(tanar(), "feladatok", "f-lap"), ujFeladat({ feladatlap: rossz })));
  }
});

test("feladat: a feladatlap cserélhető szerkesztéskor (saját feltöltésre), idegenre nem", async () => {
  const uj = { ...FELADATLAP, path: `feladatlapok/${TANAR}/456_uj.jpg` };
  await assertSucceeds(updateDoc(doc(tanar(), "feladatok", FELADAT), { feladatlap: uj }));
  await assertFails(updateDoc(doc(tanar(), "feladatok", FELADAT), { feladatlap: { ...uj, url: "javascript:alert(1)" } }));
  await assertFails(updateDoc(doc(tanar(), "feladatok", FELADAT), { feladatlap: { ...uj, path: "feladatlapok/masik-tanar-uid/x.jpg" } }));
});

test("feladat: a régi (nem szabványos) feladatlap-rekord szerkeszthető marad, ha a feladatlap nem változik", async () => {
  // a fixture feladata `https://x` URL-t tárol: a cím átírása nem érintheti
  await assertSucceeds(updateDoc(doc(tanar(), "feladatok", FELADAT), { cim: "Új cím" }));
});

// A feladatlap (kép/PDF) NEM kötelező: a tanár magától is összeállíthat
// feladatot. Ilyenkor a mező nem kerül a dokumentumba – pontosan ezt
// írja az oldal, ezért pontosan ezt a dokumentumot próbáljuk.
test("a tanár létrehozhat feladatot feladatlap NÉLKÜL is", async () => {
  await assertSucceeds(
    setDoc(doc(tanar(), "feladatok", "kezi-feladat"), {
      osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Saját feladat",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé" },
      letrehozva: new Date()
    })
  );
});

test("a feladatlap nélküli feladatot a diák is olvashatja", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", "kezi-feladat"), {
      osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Saját feladat",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé" },
      letrehozva: new Date()
    });
  });
  await assertSucceeds(getDoc(doc(diak(), "feladatok", "kezi-feladat")));
});

test("a feladatlap nélküli feladat szerkeszthető", async () => {
  // Szerkesztésnél a mentés csak a cím / határidő / rubrika mezőt írja.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", "kezi-feladat"), {
      osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Saját feladat",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé" },
      letrehozva: new Date()
    });
  });
  await assertSucceeds(
    updateDoc(doc(tanar(), "feladatok", "kezi-feladat"), {
      cim: "Átírt cím", hatarido: null, rubrika: { tipus: "levél" }
    })
  );
});

test("a tanár NEM hozhat létre feladatot más osztályába", async () => {
  await assertFails(
    setDoc(doc(tanar2(), "feladatok", "uj-feladat"), {
      osztaly_id: OSZTALY, tanar_id: TANAR2, cim: "Idegen",
      aktiv: true, hatarido: null, rubrika: {}, feladatlap: {}, letrehozva: new Date()
    })
  );
});

test("a feladat tanar_id-je nem hamisítható más tanárra", async () => {
  await assertFails(
    setDoc(doc(tanar2(), "feladatok", "uj-feladat"), {
      osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Hamisított",
      aktiv: true, hatarido: null, rubrika: {}, feladatlap: {}, letrehozva: new Date()
    })
  );
});

test("az osztály diákja olvashatja a feladatot (a rubrikát is)", async () => {
  await assertSucceeds(getDoc(doc(diak(), "feladatok", FELADAT)));
});

test("kívülálló diák NEM olvashatja a feladatot", async () => {
  await assertFails(getDoc(doc(diak2(), "feladatok", FELADAT)));
});

test("a tanár szerkesztheti a feladat címét, határidejét és rubrikáját", async () => {
  await assertSucceeds(
    updateDoc(doc(tanar(), "feladatok", FELADAT), {
      cim: "Essay – My hometown (javított)",
      hatarido: new Date(2026, 9, 1),
      rubrika: { tipus: "esszé", szint: "B2", szempontok: [{ kulcs: "nyelvtan", suly: 50 }] }
    })
  );
});

test("a feladat osztálya NEM módosítható (a beadások ahhoz tartoznak)", async () => {
  await assertFails(
    updateDoc(doc(tanar(), "feladatok", FELADAT), { osztaly_id: "masik-osztaly" })
  );
});

test("a feladat tanar_id-je NEM módosítható", async () => {
  await assertFails(
    updateDoc(doc(tanar(), "feladatok", FELADAT), { tanar_id: TANAR2 })
  );
});

test("idegen tanár NEM szerkesztheti a feladatot", async () => {
  await assertFails(
    updateDoc(doc(tanar2(), "feladatok", FELADAT), { cim: "Elrabolva" })
  );
});

test("a diák NEM szerkesztheti a feladatot", async () => {
  await assertFails(
    updateDoc(doc(diak(), "feladatok", FELADAT), { cim: "Diák írta" })
  );
});

test("a diák NEM törölhet feladatot", async () => {
  await assertFails(deleteDoc(doc(diak(), "feladatok", FELADAT)));
});

// ══════════════════════════════════════════
// OSZTÁLYSZINTŰ ELEMZÉS
// ══════════════════════════════════════════

// Ezek pontosan azok a query-k, amiket az elemzes.html futtat.
test("[elemzes.html] a tanár lekérheti a feladat beadásait (feladat_id + tanar_id)", async () => {
  await assertSucceeds(getDocs(query(
    collection(tanar(), "beadasok"),
    where("feladat_id", "==", FELADAT),
    where("tanar_id", "==", TANAR)
  )));
});

test("CSAK feladat_id-re szűrve a szabály megtagadja (a query bizonyítsa a jogot)", async () => {
  await assertFails(getDocs(query(
    collection(tanar(), "beadasok"),
    where("feladat_id", "==", FELADAT)
  )));
});

test("[elemzes.html] a tanár lekérheti a saját feladatát", async () => {
  await assertSucceeds(getDoc(doc(tanar(), "feladatok", FELADAT)));
});

test("[elemzes.html] a nem létező elemzés olvasása is engedélyezett (nem hiba)", async () => {
  await assertSucceeds(getDoc(doc(tanar(), "feladatok", FELADAT, "elemzes", "osszegzes")));
});

test("idegen tanár NEM kérheti le a feladat beadásait", async () => {
  await assertFails(getDocs(query(
    collection(tanar2(), "beadasok"),
    where("feladat_id", "==", FELADAT)
  )));
});

test("a tanár olvashatja a saját feladata elemzését", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", FELADAT, "elemzes", "osszegzes"), {
      osszegzes: "Az osztály jól teljesített.", tipushibak: [], gyakorlatok: []
    });
  });
  await assertSucceeds(getDoc(doc(tanar(), "feladatok", FELADAT, "elemzes", "osszegzes")));
});

test("a DIÁK NEM olvashatja az elemzést (más diákok hibái vannak benne)", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", FELADAT, "elemzes", "osszegzes"), {
      osszegzes: "Az osztály jól teljesített.", tipushibak: [], gyakorlatok: []
    });
  });
  // A feladatot olvashatja, az elemzést nem
  await assertSucceeds(getDoc(doc(diak(), "feladatok", FELADAT)));
  await assertFails(getDoc(doc(diak(), "feladatok", FELADAT, "elemzes", "osszegzes")));
});

test("idegen tanár NEM olvashatja az elemzést", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", FELADAT, "elemzes", "osszegzes"), {
      osszegzes: "x", tipushibak: [], gyakorlatok: []
    });
  });
  await assertFails(getDoc(doc(tanar2(), "feladatok", FELADAT, "elemzes", "osszegzes")));
});

test("az elemzést kliensről senki nem írhatja", async () => {
  await assertFails(
    setDoc(doc(tanar(), "feladatok", FELADAT, "elemzes", "osszegzes"), { osszegzes: "hamis" })
  );
  await assertFails(
    setDoc(doc(diak(), "feladatok", FELADAT, "elemzes", "osszegzes"), { osszegzes: "hamis" })
  );
});

// ══════════════════════════════════════════
// MEGOLDÓKULCS (kifejtős dolgozat)
// A feladatot a diák olvashatja – a kulcsot SOHA.
// ══════════════════════════════════════════

const KULCS = { kerdesek: [{ sorszam: "1", tipus: "zart_felsorolas", max_pont: 1,
  elemek: [{ id: "e1", allitas: "Beszerzés", pont: 1 }] }] };

async function kulcsotLetrehoz() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", FELADAT, "kulcs", "aktualis"), KULCS);
  });
}

test("a tanár olvashatja és írhatja a saját feladata kulcsát", async () => {
  await assertSucceeds(setDoc(doc(tanar(), "feladatok", FELADAT, "kulcs", "aktualis"), KULCS));
  await assertSucceeds(getDoc(doc(tanar(), "feladatok", FELADAT, "kulcs", "aktualis")));
});

test("a DIÁK NEM olvashatja a kulcsot, pedig a feladatot igen", async () => {
  await kulcsotLetrehoz();
  await assertSucceeds(getDoc(doc(diak(), "feladatok", FELADAT)));
  await assertFails(getDoc(doc(diak(), "feladatok", FELADAT, "kulcs", "aktualis")));
  await assertFails(getDocs(collection(diak(), "feladatok", FELADAT, "kulcs")));
});

test("a diák NEM írhatja a kulcsot", async () => {
  await assertFails(setDoc(doc(diak(), "feladatok", FELADAT, "kulcs", "aktualis"), KULCS));
});

test("idegen tanár NEM olvashatja és NEM írhatja a kulcsot", async () => {
  await kulcsotLetrehoz();
  await assertFails(getDoc(doc(tanar2(), "feladatok", FELADAT, "kulcs", "aktualis")));
  await assertFails(setDoc(doc(tanar2(), "feladatok", FELADAT, "kulcs", "aktualis"), KULCS));
});

test("új feladat és a kulcsa EGY batch-ben menthető (a diák nem kaphat kulcs nélküli feladatot)", async () => {
  const db = tanar();
  const b = writeBatch(db);
  const ref = doc(collection(db, "feladatok"));
  b.set(ref, {
    osztaly_id: OSZTALY, tanar_id: TANAR, cim: "Beszerzés", aktiv: true,
    rubrika: { mod: "kifejtos", kerdesek: [{ sorszam: "1", max_pont: 1 }] }, letrehozva: new Date()
  });
  b.set(doc(db, "feladatok", ref.id, "kulcs", "aktualis"), KULCS);
  await assertSucceeds(b.commit());
});

test("nem létező feladathoz nem írható kulcs", async () => {
  await assertFails(setDoc(doc(tanar(), "feladatok", "nincs-ilyen", "kulcs", "aktualis"), KULCS));
});

test("üres kulcs nem menthető", async () => {
  await assertFails(setDoc(doc(tanar(), "feladatok", FELADAT, "kulcs", "aktualis"), { kerdesek: [] }));
  await assertFails(setDoc(doc(tanar(), "feladatok", FELADAT, "kulcs", "aktualis"), { valami: 1 }));
});

// ══════════════════════════════════════════
// RUBRIKA-SABLONOK
// ══════════════════════════════════════════

test("a tanár létrehozhat sablont magának", async () => {
  await assertSucceeds(
    setDoc(doc(tanar(), "rubrikak", "sablon-1"), {
      nev: "Esszé B1 – 50 pont", rubrika: { tipus: "esszé", szempontok: [] },
      tanar_id: TANAR, letrehozva: new Date()
    })
  );
});

test("a tanár NEM hozhat létre sablont más tanár nevében", async () => {
  await assertFails(
    setDoc(doc(tanar(), "rubrikak", "sablon-1"), {
      nev: "Idegen", rubrika: {}, tanar_id: TANAR2, letrehozva: new Date()
    })
  );
});

test("a diák NEM hozhat létre sablont", async () => {
  await assertFails(
    setDoc(doc(diak(), "rubrikak", "sablon-1"), {
      nev: "Diák sablon", rubrika: {}, tanar_id: DIAK, letrehozva: new Date()
    })
  );
});

test("név nélküli sablon elutasítva", async () => {
  await assertFails(
    setDoc(doc(tanar(), "rubrikak", "sablon-1"), {
      nev: "", rubrika: {}, tanar_id: TANAR, letrehozva: new Date()
    })
  );
});

test("idegen tanár NEM olvashatja a sablont", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "rubrikak", "sablon-1"), {
      nev: "Enyém", rubrika: {}, tanar_id: TANAR, letrehozva: new Date()
    });
  });
  await assertSucceeds(getDoc(doc(tanar(), "rubrikak", "sablon-1")));
  await assertFails(getDoc(doc(tanar2(), "rubrikak", "sablon-1")));
  await assertFails(getDoc(doc(diak(), "rubrikak", "sablon-1")));
});

test("a sablon tanar_id-je nem írható át update-ben", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "rubrikak", "sablon-1"), {
      nev: "Enyém", rubrika: {}, tanar_id: TANAR, letrehozva: new Date()
    });
  });
  await assertFails(
    updateDoc(doc(tanar(), "rubrikak", "sablon-1"), { tanar_id: TANAR2 })
  );
  await assertSucceeds(
    updateDoc(doc(tanar(), "rubrikak", "sablon-1"), { nev: "Átnevezve" })
  );
});

test("a tanár törölheti a saját sablonját, idegen nem", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "rubrikak", "sablon-1"), {
      nev: "Enyém", rubrika: {}, tanar_id: TANAR, letrehozva: new Date()
    });
  });
  await assertFails(deleteDoc(doc(tanar2(), "rubrikak", "sablon-1")));
  await assertSucceeds(deleteDoc(doc(tanar(), "rubrikak", "sablon-1")));
});

// ══════════════════════════════════════════
// BEADÁSOK
// ══════════════════════════════════════════

test("a diák beadhatja a sajátját 'feltoltve' státusszal", async () => {
  await assertSucceeds(
    setDoc(doc(diak(), "beadasok", ujId()), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: [`beadasok/diak-uid/${ujId()}/1.jpg`],
      statusz: "feltoltve", atirat: null, hiba: null,
      letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("a diák NEM adhat be 'elkuldve' státusszal (jegyet nem hamisíthat)", async () => {
  await assertFails(
    setDoc(doc(diak(), "beadasok", ujId()), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: [`beadasok/diak-uid/${ujId()}/1.jpg`],
      statusz: "elkuldve", atirat: null, hiba: null,
      letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("a diák NEM adhat be más diák nevében", async () => {
  await assertFails(
    setDoc(doc(diak(), "beadasok", ujId()), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK2,
      diak_nev: "Más", tanar_id: TANAR,
      kep_paths: ["beadasok/x/1.jpg"], statusz: "feltoltve",
      atirat: null, hiba: null, letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("kívülálló diák NEM adhat be az osztály feladatára", async () => {
  await assertFails(
    setDoc(doc(diak2(), "beadasok", ujId(FELADAT, DIAK2)), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK2,
      diak_nev: "Kívülálló", tanar_id: TANAR,
      kep_paths: ["beadasok/x/1.jpg"], statusz: "feltoltve",
      atirat: null, hiba: null, letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("kép nélküli beadás elutasítva", async () => {
  await assertFails(
    setDoc(doc(diak(), "beadasok", ujId()), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: [], statusz: "feltoltve",
      atirat: null, hiba: null, letrehozva: new Date(), frissitve: new Date()
    })
  );
});

// A beadás hivatkozásait a kliens írja – a szabály kényszeríti az összetartozást
// (audit 1. kör, 2026-10-06).
const ujBeadas = (felul = {}) => ({
  feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
  diak_nev: "Diák Dóra", tanar_id: TANAR,
  kep_paths: [`beadasok/diak-uid/${ujId()}/1.jpg`],
  statusz: "feltoltve", atirat: null, hiba: null,
  letrehozva: new Date(), frissitve: new Date(),
  ...felul
});

test("beadás: hamis tanar_id elutasítva (idegen tanár nevére nem adható be)", async () => {
  await assertFails(setDoc(doc(diak(), "beadasok", ujId()), ujBeadas({ tanar_id: TANAR2 })));
});

test("beadás: a feladat másik osztályé, mint a megadott osztály_id – elutasítva", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", "idegen-feladat"), {
      osztaly_id: "masik-osztaly", tanar_id: TANAR2, cim: "Idegen", aktiv: true, rubrika: {}
    });
  });
  await assertFails(setDoc(doc(diak(), "beadasok", ujId("idegen-feladat")), ujBeadas({ feladat_id: "idegen-feladat" })));
  // a feladat tanárát és osztályát is hamisítva: az osztály tagsága ekkor hasal el
  await assertFails(setDoc(doc(diak(), "beadasok", ujId("idegen-feladat")),
    ujBeadas({ feladat_id: "idegen-feladat", osztaly_id: "masik-osztaly", tanar_id: TANAR2 })));
});

test("beadás: nem létező feladat elutasítva; nem string feladat_id is", async () => {
  await assertFails(setDoc(doc(diak(), "beadasok", ujId("nincs-ilyen")), ujBeadas({ feladat_id: "nincs-ilyen" })));
  await assertFails(setDoc(doc(diak(), "beadasok", ujId(42)), ujBeadas({ feladat_id: 42 })));
});

test("beadás: lezárt (nem aktív) feladatra nem lehet beadni", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", FELADAT), { aktiv: false }, { merge: true });
  });
  await assertFails(setDoc(doc(diak(), "beadasok", ujId()), ujBeadas()));
});

test("beadás: ismeretlen (extra) mező elutasítva", async () => {
  await assertFails(setDoc(doc(diak(), "beadasok", ujId()), ujBeadas({ jegy: 5 })));
});

test("beadás: kötött azonosító – véletlen azonosítóval nem hozható létre", async () => {
  await assertFails(setDoc(doc(diak(), "beadasok", "veletlen-azonosito"), ujBeadas()));
});

test("beadás: másik diák azonosítójával (vagy másik feladatéval) nem hozható létre", async () => {
  await assertFails(setDoc(doc(diak(), "beadasok", ujId(FELADAT, DIAK2)), ujBeadas()));
  await assertFails(setDoc(doc(diak(), "beadasok", ujId("masik-feladat")), ujBeadas()));
});

test("beadás: ugyanarra a feladatra másodszor nem adhat be (a második létrehozás elhasal)", async () => {
  await assertSucceeds(setDoc(doc(diak(), "beadasok", ujId()), ujBeadas()));
  await assertFails(setDoc(doc(diak(), "beadasok", ujId()), ujBeadas()));
});

test("a diák NEM állíthatja át a saját beadása státuszát", async () => {
  await assertFails(
    updateDoc(doc(diak(), "beadasok", BEADAS), { statusz: "elkuldve" })
  );
});

test("a tanár SEM állíthatja át kliensről (ez Function dolga)", async () => {
  await assertFails(
    updateDoc(doc(tanar(), "beadasok", BEADAS), { statusz: "elkuldve" })
  );
});

test("a diák olvashatja a saját beadását", async () => {
  await assertSucceeds(getDoc(doc(diak(), "beadasok", BEADAS)));
});

test("a tanár olvashatja a hozzá tartozó beadást", async () => {
  await assertSucceeds(getDoc(doc(tanar(), "beadasok", BEADAS)));
});

test("idegen tanár NEM olvashatja a beadást", async () => {
  await assertFails(getDoc(doc(tanar2(), "beadasok", BEADAS)));
});

test("más diák NEM olvashatja a beadást", async () => {
  await assertFails(getDoc(doc(diak2(), "beadasok", BEADAS)));
});

// ══════════════════════════════════════════
// ÉRTÉKELÉS – a mező-szintű láthatóság kiváltása
// ══════════════════════════════════════════

test("a diák SOHA nem olvashatja az AI nyers értékelését", async () => {
  await assertFails(getDoc(doc(diak(), "beadasok", BEADAS, "ertekeles", "ai")));
});

test("a diák NEM olvashatja a tanári visszajelzést 'javitva' státuszban", async () => {
  await assertFails(getDoc(doc(diak(), "beadasok", BEADAS, "ertekeles", "tanari")));
});

test("a diák OLVASHATJA a tanári visszajelzést, ha a státusz 'elkuldve'", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "beadasok", BEADAS), { statusz: "elkuldve" });
  });
  await assertSucceeds(getDoc(doc(diak(), "beadasok", BEADAS, "ertekeles", "tanari")));
});

test("a diák MÉG 'elkuldve' státuszban SEM olvashatja az AI nyers kimenetét", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "beadasok", BEADAS), { statusz: "elkuldve" });
  });
  await assertFails(getDoc(doc(diak(), "beadasok", BEADAS, "ertekeles", "ai")));
});

test("a tanár olvashatja az AI értékelést", async () => {
  await assertSucceeds(getDoc(doc(tanar(), "beadasok", BEADAS, "ertekeles", "ai")));
});

test("idegen tanár NEM olvashatja az értékelést", async () => {
  await assertFails(getDoc(doc(tanar2(), "beadasok", BEADAS, "ertekeles", "ai")));
});

test("az értékelést kliensről senki nem írhatja", async () => {
  await assertFails(
    setDoc(doc(tanar(), "beadasok", BEADAS, "ertekeles", "tanari"), { jegy: 5 })
  );
  await assertFails(
    setDoc(doc(diak(), "beadasok", BEADAS, "ertekeles", "tanari"), { jegy: 5 })
  );
});

// ══════════════════════════════════════════
// BE NEM LÉPETT FELHASZNÁLÓ
// ══════════════════════════════════════════

test("be nem lépett felhasználó semmit nem olvashat", async () => {
  await assertFails(getDoc(doc(nemBelepett(), "feladatok", FELADAT)));
  await assertFails(getDoc(doc(nemBelepett(), "beadasok", BEADAS)));
  await assertFails(getDoc(doc(nemBelepett(), "osztalyok", OSZTALY)));
  await assertFails(getDoc(doc(nemBelepett(), "felhasznalok", DIAK)));
});
