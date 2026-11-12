// ══════════════════════════════════════════════════════
// WritingReview – közös Firebase inicializálás
//
// Ez a fájl egyben "facade" is: az oldalak NE közvetlenül a gstatic
// CDN-ről importáljanak, hanem innen – így az SDK verziószám egy
// helyen szerepel (itt és a guard.js-ben), nem hat fájlban.
// ══════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// A Firebase web-config szándékosan publikus – a védelmet a
// Firestore/Storage security rules adják, nem ez a kulcs.
const firebaseConfig = {
  apiKey: "AIzaSyB7d7ilMAAePfI-v43j-d8XiMwaVUDPQFY",
  authDomain: "writingreview-41e59.firebaseapp.com",
  projectId: "writingreview-41e59",
  storageBucket: "writingreview-41e59.firebasestorage.app",
  messagingSenderId: "606013353438",
  appId: "1:606013353438:web:10135615d431bf1d47414f"
};

// A Cloud Functions régiója – egyeznie kell a functions/index.js REGION-jával.
export const REGION = "europe-west1";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, REGION);
export const googleProvider = new GoogleAuthProvider();

/**
 * App Check a diákoldalakon (8e): a reCAPTCHA Enterprise igazolja, hogy a hívás a valódi oldalról jön, nem egy
 * szkriptből. Csak ha a környezet konfigjában van webkulcs (kornyezet.js: APP_CHECK_KULCS); kulcs nélkül semmit
 * nem tölt be. A tanári oldalak nem hívják. A token a callable hívásokhoz magától csatolódik.
 * @returns {Promise<boolean>} elindult-e
 */
export async function appCheckInditas(kulcs) {
  if (!kulcs) return false;
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js");
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(kulcs), isTokenAutoRefreshEnabled: true });
  return true;
}

// ── SDK ÚJRAEXPORTÁLÁS ──
// Az oldalak ezeket innen importálják, nem a CDN-ről.

export {
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
  writeBatch,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

export { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
