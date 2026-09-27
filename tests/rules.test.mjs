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
  collection, query, where, getDocs
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
      feladatlap: {}, letrehozva: new Date()
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
    setDoc(doc(diak(), "beadasok", "uj-beadas"), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: ["beadasok/diak-uid/uj-beadas/1.jpg"],
      statusz: "feltoltve", atirat: null, hiba: null,
      letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("a diák NEM adhat be 'elkuldve' státusszal (jegyet nem hamisíthat)", async () => {
  await assertFails(
    setDoc(doc(diak(), "beadasok", "uj-beadas"), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: ["beadasok/diak-uid/uj-beadas/1.jpg"],
      statusz: "elkuldve", atirat: null, hiba: null,
      letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("a diák NEM adhat be más diák nevében", async () => {
  await assertFails(
    setDoc(doc(diak(), "beadasok", "uj-beadas"), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK2,
      diak_nev: "Más", tanar_id: TANAR,
      kep_paths: ["beadasok/x/1.jpg"], statusz: "feltoltve",
      atirat: null, hiba: null, letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("kívülálló diák NEM adhat be az osztály feladatára", async () => {
  await assertFails(
    setDoc(doc(diak2(), "beadasok", "uj-beadas"), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK2,
      diak_nev: "Kívülálló", tanar_id: TANAR,
      kep_paths: ["beadasok/x/1.jpg"], statusz: "feltoltve",
      atirat: null, hiba: null, letrehozva: new Date(), frissitve: new Date()
    })
  );
});

test("kép nélküli beadás elutasítva", async () => {
  await assertFails(
    setDoc(doc(diak(), "beadasok", "uj-beadas"), {
      feladat_id: FELADAT, osztaly_id: OSZTALY, diak_id: DIAK,
      diak_nev: "Diák Dóra", tanar_id: TANAR,
      kep_paths: [], statusz: "feltoltve",
      atirat: null, hiba: null, letrehozva: new Date(), frissitve: new Date()
    })
  );
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
