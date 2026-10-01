// ══════════════════════════════════════════════════════
// WritingReview – tanári oldalsáv
//
// Egy helyen, hogy az öt tanári oldalon ne kelljen ötször
// karbantartani. Használat:
//   import { oldalsav } from './js/nav.js';
//   oldalsav('feladatok.html');
// ══════════════════════════════════════════════════════

// Csak létező oldalak szerepelnek itt – a még el nem készült modulokat
// a tanar.html modul-kártyái hirdetik, nem a menü.
// (Az osztálynévsor az osztalyok.html-ben van, nincs külön "Diákok".)
import { t } from "./i18n.js";

const MENU = [
  { label: "nav.menu" },
  { href: "tanar.html",     ikon: "🏠", cim: "nav.fooldal" },
  { href: "osztalyok.html", ikon: "🎓", cim: "nav.osztalyok" },
  { href: "feladatok.html", ikon: "📋", cim: "nav.feladatok" },
  { href: "javitas.html",   ikon: "✏️", cim: "nav.javitas" }
];

// Csak adminnak jelenik meg
const ADMIN_MENU = [
  { label: "nav.adminisztracio" },
  { href: "admin.html", ikon: "🔑", cim: "nav.szerepkezeles" }
];

/**
 * Kirendereli az oldalsávot a #sidebar elembe.
 * @param {string} aktivHref pl. 'feladatok.html'
 * @param {{admin?: boolean}} [opciok] admin: true → az admin menü is látszik
 */
export function oldalsav(aktivHref, opciok = {}) {
  const el = document.getElementById("sidebar");
  if (!el) return;

  const menu = opciok.admin ? [...MENU, ...ADMIN_MENU] : MENU;

  el.innerHTML = menu.map((item) => {
    if (item.label) {
      return `<div class="nav-label">${t(item.label)}</div>`;
    }
    const aktiv = item.href === aktivHref ? " active" : "";
    return `<a class="nav-item${aktiv}" href="${item.href}">
      <span class="nav-icon">${item.ikon}</span> ${t(item.cim)}
    </a>`;
  }).join("");
}
