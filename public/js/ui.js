// ══════════════════════════════════════════════════════
// WritingReview – közös UI segédek
// ══════════════════════════════════════════════════════

import { t, nyelv } from "./i18n.js";

/**
 * Státusz-címkék.
 *
 * A tanár és a diák SZÁNDÉKOSAN mást lát 'javitva' állapotban: a diák
 * ilyenkor még semmit nem kaphat meg (a szabályok is tiltják), tehát
 * nem szabad "kész"-nek látszania.
 */
export const STATUSZ_TANAR = {
  feltoltve:   { kulcs: "statusz.tanar.feltoltve", osztaly: "feltoltve" },
  folyamatban: { kulcs: "statusz.tanar.folyamatban", osztaly: "folyamatban" },
  javitva:     { kulcs: "statusz.tanar.javitva", osztaly: "javitva" },
  elkuldve:    { kulcs: "statusz.tanar.elkuldve", osztaly: "elkuldve" },
  hiba:        { kulcs: "statusz.tanar.hiba", osztaly: "hiba" }
};

export const STATUSZ_DIAK = {
  feltoltve:   { kulcs: "statusz.diak.feltoltve", osztaly: "feltoltve" },
  folyamatban: { kulcs: "statusz.diak.folyamatban", osztaly: "folyamatban" },
  javitva:     { kulcs: "statusz.diak.javitva", osztaly: "javitva" },
  elkuldve:    { kulcs: "statusz.diak.elkuldve", osztaly: "elkuldve" },
  hiba:        { kulcs: "statusz.diak.hiba", osztaly: "hiba" }
};

export function statuszBadge(statusz, tabla = STATUSZ_TANAR) {
  const s = tabla[statusz];
  const cimke = s ? t(s.kulcs) : (statusz || "–");
  return `<span class="badge ${s?.osztaly || "inaktiv"}">${cimke}</span>`;
}

// ── ÜZENETEK ──

export function uzenet(elemId, szoveg, tipus = "error") {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.textContent = szoveg;
  el.className = `msg ${tipus}`;
}

export function uzenetTorles(elemId) {
  const el = document.getElementById(elemId);
  if (!el) return;
  el.className = "msg";
  el.textContent = "";
}

/** Callable-hibák szövege az aktuális nyelven. */
export function hibaSzoveg(e) {
  // A Function saját üzenete egyelőre MAGYAR, ezért csak magyar felületen
  // mutatjuk meg (pontosabb, mint az általános kódszöveg). Más nyelven
  // az általános, lefordított szöveg jelenik meg, amíg a szerver is
  // üzenetkódokat nem küld.
  if (nyelv() === "hu" && e?.message && !/^INTERNAL$/i.test(e.message)) return e.message;
  const kod = e?.code?.replace(/^functions\//, "");
  const kulcs = `hiba.${kod}`;
  const ismert = kod && t(kulcs) !== kulcs;
  return t(ismert ? kulcs : "hiba.ismeretlen");
}

/** Gomb "dolgozik" állapot – visszaad egy függvényt a visszaállításhoz. */
export function gombVar(gomb, szoveg = t("gomb.dolgozom")) {
  const eredeti = gomb.innerHTML;
  gomb.disabled = true;
  gomb.innerHTML = `<span class="spinner inline"></span>${szoveg}`;
  return () => {
    gomb.disabled = false;
    gomb.innerHTML = eredeti;
  };
}

/** Vágólapra másolás visszajelzéssel. */
export async function vagolapra(szoveg, gomb) {
  const eredeti = gomb.textContent;
  try {
    await navigator.clipboard.writeText(szoveg);
    gomb.textContent = t("vagolap.kesz");
  } catch (_) {
    gomb.textContent = t("vagolap.hiba");
  }
  setTimeout(() => { gomb.textContent = eredeti; }, 2000);
}
