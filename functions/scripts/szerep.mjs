// ══════════════════════════════════════════════════════
// Szerepkör és admin jog beállítása – custom claim + Firestore tükör
//
// A security rules a request.auth.token.szerep claim-et olvassák, az
// admin funkciók pedig a request.auth.token.admin-t. Ez a szkript
// állítja be őket.
//
// Az admin felület (admin.html) ugyanezt tudja weben – ez a szkript
// az ELSŐ admin kinevezéséhez kell, illetve ha kizárnád magad.
//
// Előkészítés (egyszer):
//   gcloud auth application-default login
//
// Használat a functions/ könyvtárból:
//   node scripts/szerep.mjs tanar@iskola.hu tanar
//   node scripts/szerep.mjs tanar@iskola.hu tanar admin      ← első admin
//   node scripts/szerep.mjs tanar@iskola.hu tanar nem-admin
//   node scripts/szerep.mjs diak@iskola.hu diak
//
// A felhasználónak utána újra be kell lépnie (vagy getIdToken(true)),
// hogy az új claim bekerüljön a tokenjébe.
// ══════════════════════════════════════════════════════

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// A célprojekt: --projekt <id>, vagy a GCLOUD_PROJECT változó; alapból a pilot.
// A kereskedelmi projektre CSAK kifejezetten megadva fut (--projekt <prod-id>).
const argv = process.argv.slice(2);
const pIdx = argv.indexOf("--projekt");
const PROJECT_ID = (pIdx >= 0 ? argv.splice(pIdx, 2)[1] : null) || process.env.GCLOUD_PROJECT || "writingreview-41e59";
const ERVENYES_SZEREPEK = ["tanar", "diak"];

const [email, szerep, adminArg] = argv;

function hasznalat(hiba) {
  if (hiba) console.error(`\n${hiba}\n`);
  console.error("Használat:");
  console.error("  node scripts/szerep.mjs <email> <tanar|diak> [admin|nem-admin] [--projekt <projekt-id>]\n");
  console.error("Példák:");
  console.error("  node scripts/szerep.mjs tanar@iskola.hu tanar");
  console.error("  node scripts/szerep.mjs tanar@iskola.hu tanar admin");
  process.exit(1);
}

if (!email || !szerep) hasznalat();
if (!ERVENYES_SZEREPEK.includes(szerep)) {
  hasznalat(`Érvénytelen szerep: "${szerep}". Lehetséges: ${ERVENYES_SZEREPEK.join(", ")}`);
}
if (adminArg !== undefined && !["admin", "nem-admin"].includes(adminArg)) {
  hasznalat(`Érvénytelen harmadik paraméter: "${adminArg}". Lehetséges: admin, nem-admin`);
}

console.log(`Projekt: ${PROJECT_ID}`);
initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });

try {
  const user = await getAuth().getUserByEmail(email);

  // A setCustomUserClaims a TELJES halmazt felülírja, ezért a meglévő
  // claim-eket be kell olvasni és összefűzni – különben egy
  // szerep-állítás letörölné az admin jelzőt.
  const claimek = { ...(user.customClaims || {}), szerep };

  if (adminArg === "admin") claimek.admin = true;
  if (adminArg === "nem-admin") delete claimek.admin;

  await getAuth().setCustomUserClaims(user.uid, claimek);

  // A Firestore-mezők csak megjelenítési tükrök, de tartsuk igazat –
  // a guard.js ebből veszi észre, hogy a token elavult.
  await getFirestore()
    .collection("felhasznalok")
    .doc(user.uid)
    .set({ szerep, admin: claimek.admin === true }, { merge: true });

  console.log(`✅ ${email} (${user.uid})`);
  console.log(`   szerep: ${claimek.szerep}`);
  console.log(`   admin:  ${claimek.admin === true ? "igen" : "nem"}`);
  console.log("   A felhasználónak újra be kell lépnie, hogy érvényesüljön.");
} catch (e) {
  if (e.code === "auth/user-not-found") {
    console.error(`Nincs ilyen felhasználó: ${email}`);
    console.error("Előbb regisztrálnia kell a belépő oldalon.");
  } else {
    console.error("Hiba:", e.message);
  }
  process.exit(1);
}
