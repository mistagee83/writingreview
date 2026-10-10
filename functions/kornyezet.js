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

/**
 * A fizetés visszatérési címe (a Stripe ide irányítja vissza a tanárt): csak https-eredet,
 * záró perjel nélkül; hiányzó vagy érvénytelen érték esetén a projekt Firebase-címe.
 */
function visszaUrl(projekt, ertek = "") {
  const e = String(ertek || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?$/i.test(e) ? e : `https://${projekt}.web.app`;
}

/** A beállítások egy környezeti változó-készletből (alapból a process.env-ből). */
function beallitasok(env = process.env) {
  const kornyezet = KORNYEZETEK.includes(env.KORNYEZET) ? env.KORNYEZET : "pilot";
  const projekt = env.GCLOUD_PROJECT || ALAP_PROJEKT;
  // A Stripe-os fizetés: csak a prodon, és csak ha az `alap` csomag árazonosítója be van állítva
  // (functions/.env.prod: FIZETES_AR_ALAP=price_...). Az árazonosító nem titok; a kulcsok a Secret Managerben vannak.
  const arAlap = String(env.FIZETES_AR_ALAP || "").trim();
  return {
    kornyezet,
    projekt,
    // A kvóta csak a kereskedelmi verzióban él (a pilot nem korlátoz).
    kvota: kornyezet === "prod",
    // Az önkiszolgáló tanári regisztráció ugyanígy csak a kereskedelmi verzióban él;
    // a pilotban a tanári szerepet továbbra is az admin adja.
    tanariOnregisztracio: kornyezet === "prod",
    fizetes: kornyezet === "prod" && /^price_[A-Za-z0-9_]+$/.test(arAlap),
    fizetesArAlap: arAlap,
    // a felületen megjelenő ár szövege (pl. "7 EUR / hó"); a tényleges árat a Stripe-ban állítod
    fizetesArSzoveg: String(env.FIZETES_AR_SZOVEG || "").trim().slice(0, 40),
    visszaUrl: visszaUrl(projekt, env.FIZETES_VISSZA_URL),
    cors: corsLista(projekt, env.ENGEDELYEZETT_DOMAINEK)
  };
}

module.exports = { corsLista, beallitasok, visszaUrl, KORNYEZETEK, HELYI_CIMEK };
