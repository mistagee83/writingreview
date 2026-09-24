// ══════════════════════════════════════════════════════
// WritingReview – közös UI segédek
// ══════════════════════════════════════════════════════

/**
 * Státusz-címkék.
 *
 * A tanár és a diák SZÁNDÉKOSAN mást lát 'javitva' állapotban: a diák
 * ilyenkor még semmit nem kaphat meg (a szabályok is tiltják), tehát
 * nem szabad "kész"-nek látszania.
 */
export const STATUSZ_TANAR = {
  feltoltve:   { cimke: "⏳ Feltöltve",        osztaly: "feltoltve" },
  folyamatban: { cimke: "⚙️ AI dolgozik",      osztaly: "folyamatban" },
  javitva:     { cimke: "📝 Ellenőrzésre vár", osztaly: "javitva" },
  elkuldve:    { cimke: "📧 Elküldve",         osztaly: "elkuldve" },
  hiba:        { cimke: "⚠️ Hiba",             osztaly: "hiba" }
};

export const STATUSZ_DIAK = {
  feltoltve:   { cimke: "⏳ Beadva",                osztaly: "feltoltve" },
  folyamatban: { cimke: "⚙️ Feldolgozás alatt",     osztaly: "folyamatban" },
  javitva:     { cimke: "👀 Tanári ellenőrzés alatt", osztaly: "javitva" },
  elkuldve:    { cimke: "✅ Visszajelzés kész",     osztaly: "elkuldve" },
  hiba:        { cimke: "⚠️ Hiba – szólj a tanárnak", osztaly: "hiba" }
};

export function statuszBadge(statusz, tabla = STATUSZ_TANAR) {
  const s = tabla[statusz] || { cimke: statusz || "–", osztaly: "inaktiv" };
  return `<span class="badge ${s.osztaly}">${s.cimke}</span>`;
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

/** Callable-hibák magyarítása. */
export function hibaSzoveg(e) {
  const map = {
    unauthenticated: "Nem vagy bejelentkezve. Lépj be újra.",
    "permission-denied": "Ehhez nincs jogosultságod.",
    "not-found": "A keresett elem nem található.",
    "failed-precondition": "Ez a művelet most nem végezhető el.",
    "invalid-argument": "Hibás vagy hiányzó adat.",
    "resource-exhausted": "Túl sok kérés. Próbáld újra kicsit később.",
    unavailable: "A szolgáltatás nem elérhető. Ellenőrizd az internetet."
  };
  // A Function saját magyar üzenete elsőbbséget kap
  if (e?.message && !/^INTERNAL$/i.test(e.message)) return e.message;
  return map[e?.code?.replace(/^functions\//, "")] || "Váratlan hiba történt.";
}

/** Gomb "dolgozik" állapot – visszaad egy függvényt a visszaállításhoz. */
export function gombVar(gomb, szoveg = "Dolgozom...") {
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
    gomb.textContent = "✅ Másolva!";
  } catch (_) {
    gomb.textContent = "❌ Nem sikerült";
  }
  setTimeout(() => { gomb.textContent = eredeti; }, 2000);
}
