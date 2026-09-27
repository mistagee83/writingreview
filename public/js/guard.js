// ══════════════════════════════════════════════════════
// WritingReview – közös auth + szerepkör kapu
//
// Eddig ez a logika be volt másolva a tanar.html, diak.html és
// feladatok.html fájlokba, három kicsit eltérő változatban (és
// kettő a nem létező login.html-re irányított). Innentől egy helyen van.
//
// Használat a védett oldalakon:
//   import { vedettOldal } from './js/guard.js';
//   const { user, profil } = await vedettOldal('tanar');
// ══════════════════════════════════════════════════════

import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from "./firebase-config.js";

export const BELEPO_OLDAL = "index.html";

const KEZDOLAP = {
  tanar: "tanar.html",
  diak:  "diak.html"
};

/**
 * Kilépés – a topbar "Kilépés" gombja ezt hívja (window.logout).
 */
export async function kilepes() {
  try {
    await signOut(auth);
  } finally {
    // replace(), hogy a "vissza" gomb ne dobjon vissza a védett oldalra
    window.location.replace(BELEPO_OLDAL);
  }
}
window.logout = kilepes;

/**
 * Védett oldal kapuja.
 *
 * A szerepkört a token custom claim-jéből olvassa – ugyanabból, amit a
 * Firestore szabályok és a Cloud Functionök is látnak. A felhasznalok
 * dokumentum szerep mezője csak megjelenítési tükör.
 *
 * - nincs belépve             → irány a belépő oldal
 * - nincs Firestore profil    → kiléptetés + belépő oldal
 * - rossz szerepkör           → irány a szerepnek megfelelő kezdőlap
 * - tükör tanár / claim nem   → magyarázó üzenet, nem néma átirányítás
 * - minden rendben            → UI megjelenítése, majd { user, profil, szerep }
 *
 * @param {'tanar'|'diak'} elvartSzerep
 * @param {{admin?: boolean}} [opciok] admin: true → admin claim is kell
 * @returns {Promise<{user: object, profil: object, szerep: string, admin: boolean}>}
 */
export function vedettOldal(elvartSzerep, opciok = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.replace(BELEPO_OLDAL);
        return;
      }

      let profil;
      try {
        const snap = await getDoc(doc(db, "felhasznalok", user.uid));
        if (!snap.exists()) {
          // Auth-fiók van, profil nincs – nincs mit engedélyezni
          await signOut(auth);
          window.location.replace(BELEPO_OLDAL);
          return;
        }
        profil = snap.data();
      } catch (e) {
        // Hálózati vagy security-rules hiba: ne dobjuk ki a felhasználót
        // egy néma átirányítással, mondjuk meg neki, mi történt.
        console.error("Profil betöltési hiba:", e);
        hibaKijelzes("Nem sikerült betölteni a profilod. Töltsd újra az oldalt.");
        return;
      }

      // A JOGOSULTSÁGOT A CLAIM ADJA, nem a Firestore-mező.
      // A felhasznalok.szerep csak megjelenítési tükör – ha abból
      // indulnánk ki, a felhasználó teljes tanári felületet kapna,
      // amin utána minden művelet "permission-denied"-del elhasal.
      let { szerep, admin } = await claimok(user, false);

      // Ha a tükör mást mond, mint a claim, a token valószínűleg elavult
      // (pl. épp most állították át a szerepet) – egyszer frissítjük.
      // MINDKÉT jelzőt nézzük: az admin jog önmagában is változhat, és
      // e nélkül a menüpont csak a token lejárta után jelenne meg.
      // Csak akkor hasonlítunk, ha a tükörben VAN érték: a hiányzó mező
      // "nincs információ", nem "eltérés". Régebbi profiloknál nincs
      // admin mező – e nélkül minden oldalbetöltés feleslegesen
      // újrakérné a tokent.
      const szerepEltero = profil.szerep && profil.szerep !== szerep;
      const adminEltero = typeof profil.admin === "boolean" && profil.admin !== admin;
      if (szerepEltero || adminEltero) {
        ({ szerep, admin } = await claimok(user, true));
      }

      // Admin-oldal: a szerep önmagában nem elég
      if (opciok.admin && !admin) {
        // Lehet, hogy csak elavult a token – egy frissítés még belefér
        ({ szerep, admin } = await claimok(user, true));
        if (!admin) {
          hibaKijelzes(
            "Ehhez az oldalhoz admin jogosultság kell. Ha most kaptad meg, " +
            "lépj ki és be újra."
          );
          return;
        }
      }

      if (szerep !== elvartSzerep) {
        // Beállítási hiba: a tükör szerint tanár, a claim szerint nem.
        // Ilyenkor NE irányítsunk át némán – mondjuk meg, mi a teendő.
        if (profil.szerep === "tanar" && szerep !== "tanar") {
          hibaKijelzes(
            "A fiókod a Firestore-ban tanárként szerepel, de a jogosultság " +
            "(token-claim) nincs beállítva. A functions könyvtárból futtasd: " +
            `node scripts/szerep.mjs ${user.email} tanar — majd lépj be újra.`
          );
          return;
        }
        window.location.replace(KEZDOLAP[szerep] || BELEPO_OLDAL);
        return;
      }

      megjelenit(user, profil);

      // A bemutató (villanykörte a topbaron, első belépéskor menü) egy
      // helyen kapcsolódik be, nem öt lapon külön. Dinamikus import:
      // ha bármi hibája van, az ne akadályozza meg a belépést.
      import("./tura.js")
        .then((m) => m.turaBeallit({ szerep, user, profil }))
        .catch((e) => console.warn("A bemutató nem indult el:", e));

      // A service worker a belépő lapon is bejegyződik, de aki telepített
      // appból indul, az egyenesen ide érkezik – ilyenkor innen kell.
      import("./pwa.js")
        .then((m) => m.swRegisztracio())
        .catch((e) => console.warn("A service worker nem indult el:", e));

      resolve({ user, profil, szerep, admin });
    });
  });
}

/**
 * A szerepkör a token custom claim-jéből. Ugyanaz az érték, amit a
 * Firestore szabályok és a Cloud Functionök is látnak.
 *
 * @param {boolean} frissites true → kényszerített token-újrakérés
 *   (a claim csak új tokenben jelenik meg; szerepváltás után kell)
 * @returns {Promise<'tanar'|'diak'>} claim nélkül diák, a legkisebb jog
 */
async function claimok(user, frissites) {
  try {
    const token = await user.getIdTokenResult(frissites);
    return {
      szerep: token.claims.szerep || "diak",
      admin: token.claims.admin === true
    };
  } catch (e) {
    console.error("Token olvasási hiba:", e);
    return { szerep: "diak", admin: false };
  }
}

/** Betöltőképernyő le, kapuzott UI fel. */
function megjelenit(user, profil) {
  const nevEl = document.getElementById("user-name");
  if (nevEl) nevEl.textContent = profil.nev || user.email;

  const loading = document.getElementById("loading-screen");
  if (loading) loading.remove();

  document.querySelectorAll(".gated").forEach((el) => el.classList.remove("gated"));
}

function hibaKijelzes(szoveg) {
  const loading = document.getElementById("loading-screen");
  if (loading) loading.textContent = szoveg;
}

/**
 * HTML-escape – listákat innentől ezzel rendereljünk, mert a
 * feladatcímeket és diáknevek felhasználói input.
 */
export function esc(ertek) {
  return String(ertek ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

/** Firestore Timestamp → "2026. 09. 23." formátumú magyar dátum. */
export function datum(ts) {
  return ts?.toDate ? ts.toDate().toLocaleDateString("hu-HU") : "–";
}
