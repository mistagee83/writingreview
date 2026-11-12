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
      nev: "Diák Dóra", email: "diak@iskola.hu", szerep: "nincs", letrehozva: new Date()
    });
    await setDoc(doc(db, "felhasznalok", TANAR), {
      nev: "Tanár Tamás", email: "tanar@iskola.hu", szerep: "tanar", letrehozva: new Date()
    });

    await setDoc(doc(db, "feladatok", FELADAT), {
      tanar_id: TANAR, cim: "Essay – My hometown",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé", szint: "B1" },
      feladatlap: { path: "feladatlapok/x/y.jpg", url: "https://x" },
      letrehozva: new Date()
    });

    await setDoc(doc(db, "beadasok", BEADAS), {
      feladat_id: FELADAT, tanar_id: TANAR,
      forras: "szoveg", szoveg: "I go to the cinema yesterday.",
      statusz: "javitva",
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

// ── Kontextusok ──
const diak = () => env.authenticatedContext(DIAK, { szerep: "diak" }).firestore();
const diak2 = () => env.authenticatedContext(DIAK2, { szerep: "diak" }).firestore();
const tanar = () => env.authenticatedContext(TANAR, { szerep: "tanar" }).firestore();
const tanar2 = () => env.authenticatedContext(TANAR2, { szerep: "tanar" }).firestore();
const nemBelepett = () => env.unauthenticatedContext().firestore();
// Claim nélküli felhasználó – a rules szerint nem tanár
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
  nev: "Új Tanár", email: "uj@iskola.hu", szerep: "nincs", letrehozva: new Date(), ...extra
});

test("regisztrációkor kérhető a tanári regisztráció jelzése, de a profil 'nincs' szerepű marad", async () => {
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

test("regisztrációkor a régi 'diak' szerep sem írható (2026-11-12 óta nincs diák szerep)", async () => {
  await assertFails(setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ szerep: "diak" })));
  const szerepNelkul = ujProfil(); delete szerepNelkul.szerep;
  await assertFails(setDoc(doc(ujFelh(), "felhasznalok", UJ), szerepNelkul));
});

test("regisztrációkor nem írhatók be a szerver mezői (tanar_regisztralt)", async () => {
  await assertFails(
    setDoc(doc(ujFelh(), "felhasznalok", UJ), ujProfil({ tanar_regisztralt: new Date() }))
  );
});

test("meglévő, kérelem nélküli fiók utólag NEM kérhet tanári regisztrációt (a jelzés csak létrehozáskor írható)", async () => {
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

test("a tanár SEM olvashatja más felhasznalok dokumentumát", async () => {
  await assertFails(getDoc(doc(tanar(), "felhasznalok", DIAK)));
});

test("hamis szerep-claim nélkül a felhasználó nem kap tanári jogot", async () => {
  await assertFails(
    setDoc(doc(claimNelkul(), "feladatok", "uj-feladat"), {
      tanar_id: DIAK, cim: "Hamis", rubrika: {}
    })
  );
});

// ══════════════════════════════════════════
// A RÉGI OSZTÁLYOK (2026-11-12 óta nincs diákfiók és osztály)
// A szabályuk kikerült: a gyűjtemények mindenki elől zárva.
// ══════════════════════════════════════════

test("az osztályok, a tagok, a kódok és a diák osztálytükre mindenki elől zárva", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "osztalyok", "osztaly-1"), { nev: "9.B", kod: "9BK-4M2T", tanar_id: TANAR, aktiv: true });
    await setDoc(doc(db, "osztalyok", "osztaly-1", "tagok", DIAK), { nev: "Diák Dóra" });
    await setDoc(doc(db, "kodok", "9BK-4M2T"), { osztaly_id: "osztaly-1" });
    await setDoc(doc(db, "felhasznalok", DIAK, "osztalyaim", "osztaly-1"), { nev: "9.B" });
  });
  for (const db of [tanar(), tanar2(), diak()]) {
    await assertFails(getDoc(doc(db, "osztalyok", "osztaly-1")));
    await assertFails(getDoc(doc(db, "osztalyok", "osztaly-1", "tagok", DIAK)));
    await assertFails(getDoc(doc(db, "kodok", "9BK-4M2T")));
    await assertFails(setDoc(doc(db, "osztalyok", "uj"), { nev: "x", tanar_id: TANAR }));
  }
  await assertFails(getDoc(doc(diak(), "felhasznalok", DIAK, "osztalyaim", "osztaly-1")));
});

// ══════════════════════════════════════════
// FELADATOK
// ══════════════════════════════════════════

test("a tanár létrehozhat feladatot (osztály nélkül)", async () => {
  await assertSucceeds(
    setDoc(doc(tanar(), "feladatok", "uj-feladat"), {
      tanar_id: TANAR, cim: "Letter writing",
      aktiv: true, hatarido: null, rubrika: { tipus: "levél" },
      feladatlap: FELADATLAP, letrehozva: new Date()
    })
  );
});

// ── Külső audit 3. kör: a tanár által írt, a diák felületén megjelenő mezők ──
const ujFeladat = (felul = {}) => ({
  tanar_id: TANAR, cim: "Letter writing",
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
      tanar_id: TANAR, cim: "Saját feladat",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé" },
      letrehozva: new Date()
    })
  );
});

test("a feladatlap nélküli feladatot csak a tanára olvassa (a diák nem)", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", "kezi-feladat"), {
      tanar_id: TANAR, cim: "Saját feladat",
      aktiv: true, hatarido: null, rubrika: { tipus: "esszé" },
      letrehozva: new Date()
    });
  });
  await assertSucceeds(getDoc(doc(tanar(), "feladatok", "kezi-feladat")));
  await assertFails(getDoc(doc(diak(), "feladatok", "kezi-feladat")));
});

test("a feladatlap nélküli feladat szerkeszthető", async () => {
  // Szerkesztésnél a mentés csak a cím / határidő / rubrika mezőt írja.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "feladatok", "kezi-feladat"), {
      tanar_id: TANAR, cim: "Saját feladat",
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

// Az `ujFeladat` fixtúra (fent) minden más szempontból érvényes (feladatlap
// nélkül): a negatív tesztekben egyetlen mező tér el, így az elutasítás oka egyértelmű.
test("a tanár létrehozhat feladatot (kontroll)", async () => {
  await assertSucceeds(setDoc(doc(tanar(), "feladatok", "uj-feladat-kontroll"), ujFeladat()));
});

test("a feladat nem köthető osztályhoz (osztaly_id mezővel elutasítva)", async () => {
  await assertFails(setDoc(doc(tanar(), "feladatok", "uj-feladat"), ujFeladat({ osztaly_id: "osztaly-1" })));
});

test("a feladat tanar_id-je nem hamisítható más tanárra", async () => {
  await assertFails(
    setDoc(doc(tanar(), "feladatok", "uj-feladat"), ujFeladat({ tanar_id: TANAR2 }))
  );
});

test("diák (nem tanár) NEM olvashatja a feladatot – a feladatleírást a feladatlinken kapja", async () => {
  await assertFails(getDoc(doc(diak(), "feladatok", FELADAT)));
  await assertFails(getDocs(query(collection(diak(), "feladatok"), where("tanar_id", "==", TANAR))));
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

test("a feladathoz utólag sem adható osztály", async () => {
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
  // 2026-11-12 óta a diák a feladatot sem olvassa (csak a tanára), az elemzést végképp nem;
  // a tanár olvassa (kontroll: a dokumentum létezik, a tiltás a szabályé)
  await assertFails(getDoc(doc(diak(), "feladatok", FELADAT)));
  await assertFails(getDoc(doc(diak(), "feladatok", FELADAT, "elemzes", "osszegzes")));
  await assertSucceeds(getDoc(doc(tanar(), "feladatok", FELADAT, "elemzes", "osszegzes")));
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
// A RÉGI MEGOLDÓKULCS (kifejtős dolgozat, 2026-11-12 óta nincs)
// Az alkollekció szabálya kikerült: senki nem olvashatja és írhatja.
// ══════════════════════════════════════════

test("a régi kulcs-alkollekció mindenki elől zárva (a tanár elől is)", async () => {
  const KULCS = { kerdesek: [{ sorszam: "1", max_pont: 1 }] };
  for (const db of [tanar(), tanar2(), diak()]) {
    await assertFails(setDoc(doc(db, "feladatok", FELADAT, "kulcs", "aktualis"), KULCS));
    await assertFails(getDoc(doc(db, "feladatok", FELADAT, "kulcs", "aktualis")));
  }
});

// ══════════════════════════════════════════
// FELADATLINKEK
// ══════════════════════════════════════════

test("a linket csak a feladat tanára olvassa; kliensről senki nem írja", async () => {
  const LINK = "a".repeat(64);
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "linkek", LINK), {
      feladat_id: FELADAT, tanar_id: TANAR, token: "t".repeat(32), lezarva: false, beadas_db: 0, beadas_max: 60,
      lejar: new Date(Date.now() + 3600 * 1000), letrehozva: new Date()
    });
  });
  await assertSucceeds(getDoc(doc(tanar(), "linkek", LINK)));
  await assertSucceeds(getDocs(query(collection(tanar(), "linkek"), where("tanar_id", "==", TANAR), where("feladat_id", "==", FELADAT))));
  await assertFails(getDoc(doc(tanar2(), "linkek", LINK)));
  await assertFails(getDoc(doc(diak(), "linkek", LINK)));
  await assertFails(getDoc(doc(nemBelepett(), "linkek", LINK)));
  await assertFails(getDocs(collection(tanar(), "linkek")), "szűrő nélküli lista");
  // írás: a tanár sem (a lejáratot, a plafont és a lezárást a szerver állítja)
  await assertFails(updateDoc(doc(tanar(), "linkek", LINK), { lezarva: true }));
  await assertFails(updateDoc(doc(tanar(), "linkek", LINK), { beadas_max: 999 }));
  await assertFails(setDoc(doc(tanar(), "linkek", "b".repeat(64)), { feladat_id: FELADAT, tanar_id: TANAR }));
  await assertFails(deleteDoc(doc(tanar(), "linkek", LINK)));
  await assertFails(setDoc(doc(diak(), "linkek", "c".repeat(64)), { tanar_id: TANAR }));
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

// 2026-11-12 óta kliensről nem hozható létre beadás: diákfiók nincs, a beadás a
// feladatlinken, Cloud Functionön át jön létre (docs/prod-atalakitas-terv.md).
test("kliensről senki nem hozhat létre beadást (diák, tanár, claim nélkül sem)", async () => {
  const beadas = {
    feladat_id: FELADAT, tanar_id: TANAR, forras: "szoveg", szoveg: "Dear Ben.",
    statusz: "feltoltve", hiba: null, letrehozva: new Date(), frissitve: new Date()
  };
  for (const db of [diak(), claimNelkul(), tanar()]) {
    await assertFails(setDoc(doc(db, "beadasok", `${FELADAT}_uj`), beadas));
  }
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

test("diák (nem tanár) NEM olvashatja a beadást", async () => {
  await assertFails(getDoc(doc(diak(), "beadasok", BEADAS)));
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

test("a diák 'elkuldve' státuszban SEM olvashatja kliensről a tanári visszajelzést (a diáklinken kapja)", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "beadasok", BEADAS), { statusz: "elkuldve" });
  });
  await assertFails(getDoc(doc(diak(), "beadasok", BEADAS, "ertekeles", "tanari")));
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
  await assertFails(getDoc(doc(nemBelepett(), "felhasznalok", DIAK)));
});

// ══════════════════════════════════════════
// KVÓTA ÉS FIZETÉS: a csomag, a használat és a Stripe-adatok csak a szervernek valók
// ══════════════════════════════════════════

test("a tanárok csomagját, használatát és a Stripe-gyűjteményeket kliens sem olvashatja, sem írhatja", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adat = ctx.firestore();
    await setDoc(doc(adat, "tanarok", TANAR), { csomag: "alap", elofizetes: { stripe_ugyfel_id: "cus_1" } });
    await setDoc(doc(adat, "tanarok", TANAR, "hasznalat", "2026-10"), { egyseg: 3 });
    await setDoc(doc(adat, "stripe_esemenyek", "evt_1"), { tipus: "x" });
    await setDoc(doc(adat, "stripe_ugyfelek", "cus_1"), { uid: TANAR });
  });
  for (const [nev, kliens] of [["tanár", tanar()], ["diák", diak()], ["be nem lépett", nemBelepett()]]) {
    for (const ut of [["tanarok", TANAR], ["tanarok", TANAR, "hasznalat", "2026-10"], ["stripe_esemenyek", "evt_1"], ["stripe_ugyfelek", "cus_1"]]) {
      await assertFails(getDoc(doc(kliens, ...ut)));
      await assertFails(setDoc(doc(kliens, ...ut), { csomag: "korlatlan", egyseg: 0, uid: "x" }, { merge: true }));
    }
  }
  // a tanár a saját csomagját sem állíthatja magának (ez volna az ingyenes fizetés)
  await assertFails(setDoc(doc(tanar(), "tanarok", TANAR), { csomag: "korlatlan" }, { merge: true }));
});

// ══════════════════════════════════════════
// CSOPORTOK (8b)
// ══════════════════════════════════════════

test("csoport: a tanár létrehozza, átnevezi és archiválja a sajátját; törölni, idegent olvasni nem lehet", async () => {
  const { serverTimestamp } = await import("firebase/firestore");
  const uj = (felul = {}) => ({ tanar_id: TANAR, nev: "9.B angol", aktiv: true, letrehozva: serverTimestamp(), ...felul });
  await assertSucceeds(setDoc(doc(tanar(), "csoportok", "cs1"), uj()));
  await assertSucceeds(getDoc(doc(tanar(), "csoportok", "cs1")));
  await assertSucceeds(getDocs(query(collection(tanar(), "csoportok"), where("tanar_id", "==", TANAR))));
  await assertSucceeds(updateDoc(doc(tanar(), "csoportok", "cs1"), { nev: "9.B angol (haladó)" }));
  await assertSucceeds(updateDoc(doc(tanar(), "csoportok", "cs1"), { aktiv: false }));
  await assertSucceeds(updateDoc(doc(tanar(), "csoportok", "cs1"), { aktiv: true }));
  // rossz létrehozás: idegen tanar_id, üres vagy túl hosszú név, archivált indulás, extra mező, nem diák/nem belépett
  await assertFails(setDoc(doc(tanar(), "csoportok", "cs2"), uj({ tanar_id: TANAR2 })));
  await assertFails(setDoc(doc(tanar(), "csoportok", "cs2"), uj({ nev: "" })));
  await assertFails(setDoc(doc(tanar(), "csoportok", "cs2"), uj({ nev: "x".repeat(61) })));
  await assertFails(setDoc(doc(tanar(), "csoportok", "cs2"), uj({ aktiv: false })));
  await assertFails(setDoc(doc(tanar(), "csoportok", "cs2"), uj({ diakok: [] })));
  await assertFails(setDoc(doc(diak(), "csoportok", "cs2"), uj()));
  await assertFails(setDoc(doc(nemBelepett(), "csoportok", "cs2"), uj()));
  // módosítás: a tulajdonos nem cserélhető, más mező nem írható, idegen nem módosíthat
  await assertFails(updateDoc(doc(tanar(), "csoportok", "cs1"), { tanar_id: TANAR2 }));
  await assertFails(updateDoc(doc(tanar(), "csoportok", "cs1"), { nev: "" }));
  await assertFails(updateDoc(doc(tanar(), "csoportok", "cs1"), { aktiv: "nem" }));
  await assertFails(updateDoc(doc(tanar2(), "csoportok", "cs1"), { nev: "Enyém" }));
  // olvasás és törlés
  await assertFails(getDoc(doc(tanar2(), "csoportok", "cs1")));
  await assertFails(getDoc(doc(diak(), "csoportok", "cs1")));
  await assertFails(getDocs(collection(tanar(), "csoportok")), "szűrő nélküli lista");
  await assertFails(deleteDoc(doc(tanar(), "csoportok", "cs1")));
});

test("csoport diákjai (8b/2): csak a csoport tanára olvassa, kliensről senki nem írja; a becenév-hozzárendelés zárt", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "csoportok", "csd"), { tanar_id: TANAR, nev: "9.B", aktiv: true });
    await setDoc(doc(db, "csoportok", "csd", "diakok", "d1"), { nev: "Kék Sárkány", becenevek: ["keksarkany"] });
    await setDoc(doc(db, "csoportok", "csd", "becenevek", "keksarkany"), { diak_id: "d1" });
  });
  await assertSucceeds(getDoc(doc(tanar(), "csoportok", "csd", "diakok", "d1")));
  await assertSucceeds(getDocs(collection(tanar(), "csoportok", "csd", "diakok")));
  await assertFails(getDoc(doc(tanar2(), "csoportok", "csd", "diakok", "d1")));
  await assertFails(getDocs(collection(tanar2(), "csoportok", "csd", "diakok")));
  await assertFails(getDoc(doc(diak(), "csoportok", "csd", "diakok", "d1")));
  await assertFails(getDoc(doc(nemBelepett(), "csoportok", "csd", "diakok", "d1")));
  // a tanár sem írhatja: a párosítás a beadásokkal együtt, a szerveren változik
  await assertFails(setDoc(doc(tanar(), "csoportok", "csd", "diakok", "d2"), { nev: "X", becenevek: [] }));
  await assertFails(updateDoc(doc(tanar(), "csoportok", "csd", "diakok", "d1"), { nev: "Más" }));
  await assertFails(deleteDoc(doc(tanar(), "csoportok", "csd", "diakok", "d1")));
  for (const kliens of [tanar(), tanar2(), diak(), nemBelepett()]) {
    await assertFails(getDoc(doc(kliens, "csoportok", "csd", "becenevek", "keksarkany")));
    await assertFails(setDoc(doc(kliens, "csoportok", "csd", "becenevek", "masik"), { diak_id: "d1" }));
  }
});
