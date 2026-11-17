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
 * A hub egy https-címe (pl. a fiókoldal): csak https-eredet + útvonal, egyébként az alapérték.
 * A tanár ide megy kreditért és Hub passért (a fizetés a hub fizetési központjában van, 4d).
 */
function hubUrl(ertek, alap) {
  const e = String(ertek || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?(\/[A-Za-z0-9._~\/#-]*)?$/i.test(e) ? e : alap;
}

/** A beállítások egy környezeti változó-készletből (alapból a process.env-ből). */
function beallitasok(env = process.env) {
  const kornyezet = KORNYEZETEK.includes(env.KORNYEZET) ? env.KORNYEZET : "pilot";
  const projekt = env.GCLOUD_PROJECT || ALAP_PROJEKT;
  return {
    kornyezet,
    projekt,
    // A hub-kredit csak a kereskedelmi verzióban él (a pilot nem korlátoz). Lásd functions/kredit.js.
    kredit: kornyezet === "prod",
    // Az AI-szolgáltató: "claude" (AI_SZOLGALTATO=claude a functions/.env.<alias>-ban) vagy alapból "gemini".
    aiSzolgaltato: String(env.AI_SZOLGALTATO || "").trim().toLowerCase() === "claude" ? "claude" : "gemini",
    // Az Anthropic-munkaterület azonosítója (nem titok): akkor kell, ha a kulcs nem munkaterülethez kötött
    // (a kérés anthropic-workspace-id fejlécet kap). Csak a "wrkspc_..." alak fogadható el.
    anthropicWorkspace: /^wrkspc_[A-Za-z0-9_-]+$/.test(String(env.ANTHROPIC_WORKSPACE_ID || "").trim())
      ? String(env.ANTHROPIC_WORKSPACE_ID).trim() : "",
    // Az önkiszolgáló tanári regisztráció mindkét környezetben él (a pilotban 2026-10-13-tól, a tulajdonos döntése:
    // kevés kolléga használja). FIGYELEM: a pilotban nincs AI-keret, így minden regisztrált tanár korlátlanul költhet.
    tanariOnregisztracio: true,
    // App Check a diákoldali függvényeken (linkAdatok, linkBeadas, diakVisszajelzes): csak ha APP_CHECK=igen.
    // Előbb a kliensnek kell küldenie a tokent (config/<env>.json: app_check_kulcs), különben minden diákhívás elbukik.
    appCheck: String(env.APP_CHECK || "").trim().toLowerCase() === "igen",
    // A hub fiókoldala (kredit, Hub pass) és adminja (kézi jóváírás): HUB_FIOK_URL / HUB_ADMIN_URL a functions/.env.<alias>-ban.
    hubFiokUrl: hubUrl(env.HUB_FIOK_URL, "https://mrandrewshub.com/account"),
    hubAdminUrl: hubUrl(env.HUB_ADMIN_URL, "https://mrandrewshub.com/admin/#/credits"),
    cors: corsLista(projekt, env.ENGEDELYEZETT_DOMAINEK)
  };
}

module.exports = { corsLista, beallitasok, hubUrl, KORNYEZETEK, HELYI_CIMEK };
