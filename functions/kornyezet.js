// ══════════════════════════════════════════════════════
// A szerver környezet-függő beállításai (pilot / prod)
//
// A két telepítés ugyanazt a kódot futtatja; az eltérés a
// functions/.env.<alias> fájlokból (KORNYEZET, ENGEDELYEZETT_DOMAINEK)
// és a GCLOUD_PROJECT-ből jön. Lásd docs/kornyezetek-terv.md 4.
// ══════════════════════════════════════════════════════

const HELYI_CIMEK = ["http://127.0.0.1:5500", "http://localhost:5500"];
const ALAP_PROJEKT = "writingreview-41e59"; // a pilot; ha a GCLOUD_PROJECT nincs beállítva
const KORNYEZETEK = ["pilot", "prod"];

/**
 * A CORS-ban engedélyezett eredetek: a helyi előnézet, a projekt két
 * Firebase-címe, és az egyéni domainek (vesszővel elválasztott lista).
 * Csak https-eredet fogadható el egyéni domainként – egy elgépelt vagy
 * jokeres bejegyzés ne nyithassa meg a hívásokat.
 */
function corsLista(projekt, domainek = "") {
  const ki = [...HELYI_CIMEK];
  if (projekt) ki.push(`https://${projekt}.web.app`, `https://${projekt}.firebaseapp.com`);
  for (const d of String(domainek).split(",").map((x) => x.trim()).filter(Boolean)) {
    const eredet = d.replace(/\/+$/, "");
    if (/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?$/i.test(eredet)) ki.push(eredet);
  }
  return [...new Set(ki)];
}

/** A beállítások egy környezeti változó-készletből (alapból a process.env-ből). */
function beallitasok(env = process.env) {
  const kornyezet = KORNYEZETEK.includes(env.KORNYEZET) ? env.KORNYEZET : "pilot";
  const projekt = env.GCLOUD_PROJECT || ALAP_PROJEKT;
  return {
    kornyezet,
    projekt,
    // A kvóta csak a kereskedelmi verzióban él (a pilot nem korlátoz).
    kvota: kornyezet === "prod",
    // Az önkiszolgáló tanári regisztráció ugyanígy csak a kereskedelmi verzióban él;
    // a pilotban a tanári szerepet továbbra is az admin adja.
    tanariOnregisztracio: kornyezet === "prod",
    cors: corsLista(projekt, env.ENGEDELYEZETT_DOMAINEK)
  };
}

module.exports = { corsLista, beallitasok, KORNYEZETEK, HELYI_CIMEK };
