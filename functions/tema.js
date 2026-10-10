// ══════════════════════════════════════════════════════
// A tanári felület színtémái (a színválasztó, Alap csomagtól)
//
// Fix, kontraszt-ellenőrzött paletták (nem szabad színválasztó: a hozzáférhetőség
// miatt). A színértékek a public/css/app.css-ben vannak (`:root[data-tema="…"]`);
// itt csak a megengedett nevek listája van, hogy a kliens ne tárolhasson mást.
// A listát a public/js/tema.js és a tema-korai.js tükrözi; tests/tema.test.mjs
// ellenőrzi, hogy mind a négy hely egyezik.
// ══════════════════════════════════════════════════════

/** Az alapszín (narancs): ez a téma-mező hiánya, mindenkinek mindig választható. */
const ALAP_TEMA = "narancs";

const TEMAK = ["narancs", "kek", "zold", "lila", "bordo", "pala"];

/**
 * A kért téma neve érvényes-e? Érvényes név → a név, egyébként undefined.
 * A prototípus-kulcsok ("__proto__", "toString") és a nem szöveg értékek érvénytelenek.
 */
function temaNev(ertek) {
  return typeof ertek === "string" && TEMAK.includes(ertek) ? ertek : undefined;
}

module.exports = { ALAP_TEMA, TEMAK, temaNev };
