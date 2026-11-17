// ══════════════════════════════════════════════════════
// A Firestore- és Storage-szabályok (és az indexek) a közös mrashub-projektben a hub repójáé
// (Mr. Andrew's EdTech Hub: firestore.rules, storage.rules, firestore.indexes.json); ez a repó csak
// az emulátoros tesztekhez tartja a saját blokkját. Ez a predeploy-horog megállít minden deployt,
// ami felülírná őket. Változás: előbb itt, aztán ugyanaz a blokk a hub fájljába, és onnan deploy.
// (A pilot a `pilot` ágon, a saját projektjében, a saját firebase.json-jával él – ez rá nem vonatkozik.)
// ══════════════════════════════════════════════════════
const cel = process.argv[2] ?? "ez a cél";
console.error(
  `\n[WR] A(z) ${cel} deployja ebből a repóból tiltott: a mrashub-projektben a hub repója telepíti.\n` +
  `     A WR-ből: node scripts/deploy.mjs prod --yes --only hosting,functions:wr\n`
);
process.exit(1);
