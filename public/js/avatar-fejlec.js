// ══════════════════════════════════════════════════════
// A tanár hubon választott avatárja a felső sávban (2026-11-25)
//
// Az érték a hub users/{uid}.avatar mezője (a hub /account → Settings → Your picture
// állítja; a saját dokumentumot a hub rules szerint a felhasználó olvashatja).
// A kép a hubról jön: <hub>/brand/avatars/<id>.svg. Nincs vagy ismeretlen → monogram.
// A ./hub/avatar.js a hub shared/avatar.js másolata (scripts/hub-masolat.mjs).
// ══════════════════════════════════════════════════════

import { db, doc, getDoc } from "./firebase-config.js";
import { HUB_ORIGIN, avatarSrc, initialOf } from "./hub/avatar.js";

/** A #user-name elé kerülő elem: <img> vagy monogramos kör. */
export function avatarElem(avatar, nev, email) {
  const src = avatarSrc(avatar, HUB_ORIGIN);
  if (src) {
    const img = document.createElement("img");
    img.className = "user-avatar";
    img.src = src;
    img.alt = "";
    img.width = 30;
    img.height = 30;
    return img;
  }
  const kor = document.createElement("span");
  kor.className = "user-avatar user-avatar-betu";
  kor.setAttribute("aria-hidden", "true");
  kor.textContent = initialOf(nev, email);
  return kor;
}

export async function avatarFejlec(user, profil) {
  const nevEl = document.getElementById("user-name");
  if (!nevEl || nevEl.parentElement?.querySelector(".user-avatar")) return;
  let avatar = null;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    avatar = snap.exists() ? snap.data().avatar : null;
  } catch (e) {
    console.warn("A hub-profil (avatár) nem olvasható:", e);
  }
  nevEl.before(avatarElem(avatar, profil?.nev, user.email));
}
