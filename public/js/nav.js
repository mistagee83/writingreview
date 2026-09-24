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
const MENU = [
  { label: "Menü" },
  { href: "tanar.html",     ikon: "🏠", cim: "Főoldal" },
  { href: "osztalyok.html", ikon: "🎓", cim: "Osztályok" },
  { href: "feladatok.html", ikon: "📋", cim: "Feladatok" },
  { href: "javitas.html",   ikon: "✏️", cim: "Javítási sor" }
];

// Csak adminnak jelenik meg
const ADMIN_MENU = [
  { label: "Adminisztráció" },
  { href: "admin.html", ikon: "🔑", cim: "Szerepkezelés" }
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
      return `<div class="nav-label">${item.label}</div>`;
    }
    const aktiv = item.href === aktivHref ? " active" : "";
    return `<a class="nav-item${aktiv}" href="${item.href}">
      <span class="nav-icon">${item.ikon}</span> ${item.cim}
    </a>`;
  }).join("");
}
