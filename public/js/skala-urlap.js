// ══════════════════════════════════════════════════════
// Jegyskála-szerkesztő a feladat űrlaphoz
//
// A skála a feladat rubrikájában él (rubrika.skala), a szerkezetét és az
// ellenőrzését a functions/kifejtos.js adja (a kifejtos.js generált példánya):
// a szerver és az űrlap ugyanazt fogadja el. Itt csak a szerkesztő van:
// sablonválasztó (magyar 1–5, A–F, százalék, egyéni) és fokozat-sorok.
//
// A sorok a fokozatok alsótól felső felé sorrendjében élnek, megjelenítve
// a legmagasabbtól a legalacsonyabbig (úgy olvassa a tanár). A legalsó
// fokozat határa mindig 0%.
// ══════════════════════════════════════════════════════

import { t } from './i18n.js';
import { SKALA_SABLONOK, ALAP_SKALA, skalaEllenorzes, skalaFeloldas } from './kifejtos.js';

const TAR_KULCS = 'wr_skala_alap';
const EGYENI = 'egyeni';

// ── Tiszta függvények (Node-ban tesztelhetők) ─────────

/** A skála sorai a szerkesztőhöz: alulról felfelé, szövegként. */
export function skalaSorokra(skala) {
  if (skala?.tipus !== 'fokozat') return [];
  return skala.fokozatok.map((f) => ({ cimke: String(f.cimke), min: String(f.min) }));
}

/**
 * A szerkesztő állapotából skála. Érvényes → { skala }; különben { hiba: true }.
 * A számként írt címke (1, 2…) számként tárolódik, hogy a magyar 1–5-ös
 * jegyek a régi, szám alakú jegyekkel egyezzenek.
 */
export function skalaSorokbol(sablon, sorok) {
  if (sablon === 'szazalek') return { skala: skalaEllenorzes({ tipus: 'szazalek', sablon }) };
  const fokozatok = sorok.map((s) => {
    const cimke = String(s.cimke ?? '').trim();
    return {
      cimke: /^\d+(\.\d+)?$/.test(cimke) ? Number(cimke) : cimke,
      min: String(s.min ?? '').trim() === '' ? NaN : Number(s.min)
    };
  });
  const skala = skalaEllenorzes({ tipus: 'fokozat', sablon: sablon === EGYENI ? undefined : sablon, fokozatok });
  return skala ? { skala } : { hiba: true };
}

/** Melyik sablon egyezik a skálával; ha egyik sem, 'egyeni'. */
export function sablonNeve(skala) {
  for (const [nev, s] of Object.entries(SKALA_SABLONOK)) {
    if (JSON.stringify(sablonTartalom(s)) === JSON.stringify(sablonTartalom(skala))) return nev;
  }
  return EGYENI;
}

const sablonTartalom = (s) => (s?.tipus === 'fokozat'
  ? { tipus: s.tipus, fokozatok: s.fokozatok.map((f) => [f.cimke, f.min]) }
  : { tipus: s?.tipus });

// ── Az utoljára használt skála (böngészőnként, kényelmi alapérték) ──

function alapSkala() {
  try {
    const mentett = JSON.parse(localStorage.getItem(TAR_KULCS));
    const jo = skalaEllenorzes(mentett);
    if (jo) return jo;
  } catch (_) { /* nincs tár, vagy sérült – marad az alap */ }
  return skalaFeloldas({ skala: SKALA_SABLONOK[ALAP_SKALA] });
}

/** A mentett feladat skálájának megjegyzése: ezzel indul a következő űrlap. */
export function skalaMegjegyzes(skala) {
  try { localStorage.setItem(TAR_KULCS, JSON.stringify(skala)); } catch (_) { /* nem baj */ }
}

// ── A szerkesztő ──────────────────────────────────────

/**
 * @param {{ sablon: HTMLSelectElement, sorok: HTMLElement, uj: HTMLElement, szazalekTipp: HTMLElement }} el
 */
export function skalaUrlap(el) {
  let sablon = ALAP_SKALA;
  let sorok = [];   // alulról felfelé

  const sablonBeallit = (s) => { sablon = s; el.sablon.value = s; };

  function render() {
    const szazalek = sablon === 'szazalek';
    el.sorok.hidden = szazalek;
    el.uj.hidden = szazalek;
    el.szazalekTipp.hidden = !szazalek;
    el.sorok.innerHTML = '';
    if (szazalek) return;

    // legmagasabbtól lefelé; az index az eredeti (alulról számolt) helyet jelöli
    for (let i = sorok.length - 1; i >= 0; i--) {
      const sor = document.createElement('div');
      sor.className = 'skala-sor';
      const legalso = i === 0;
      sor.innerHTML = `
        <input type="text" class="sk-cimke" maxlength="8" aria-label="${escAttr(t('fel.skala_cimke'))}" />
        <label class="sk-min"><span>${escAttr(t('fel.skala_min'))}</span>
          <input type="number" class="sk-min-mezo" min="0" max="100" step="any" ${legalso ? 'disabled' : ''} /></label>
        <button type="button" class="btn-sm sk-torol" aria-label="${escAttr(t('fel.skala_torol'))}"
          ${sorok.length <= 2 ? 'disabled' : ''}>✕</button>`;
      sor.querySelector('.sk-cimke').value = sorok[i].cimke;
      sor.querySelector('.sk-min-mezo').value = legalso ? '0' : sorok[i].min;
      sor.querySelector('.sk-cimke').addEventListener('input', (e) => { sorok[i].cimke = e.target.value; egyeniLett(); });
      sor.querySelector('.sk-min-mezo').addEventListener('input', (e) => { sorok[i].min = e.target.value; egyeniLett(); });
      sor.querySelector('.sk-torol').addEventListener('click', () => { sorok.splice(i, 1); egyeniLett(); render(); });
      el.sorok.appendChild(sor);
    }
  }

  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Bármilyen kézi szerkesztés után a skála már nem a sablon
  function egyeniLett() { if (sablon !== EGYENI) sablonBeallit(EGYENI); }

  function betolt(skala) {
    const s = skalaEllenorzes(skala) || skalaFeloldas({});
    sablonBeallit(sablonNeve(s));
    sorok = skalaSorokra(s);
    render();
  }

  el.sablon.addEventListener('change', () => {
    const v = el.sablon.value;
    if (v === EGYENI) {
      // százalékról érkezve nincsenek sorok: a magyar 1–5 a kiindulás
      if (sorok.length === 0) sorok = skalaSorokra(SKALA_SABLONOK[ALAP_SKALA]);
      sablon = EGYENI;
      render();
      return;
    }
    betolt(SKALA_SABLONOK[v]);
  });

  el.uj.addEventListener('click', () => {
    sorok.push({ cimke: '', min: '' });
    egyeniLett();
    render();
    el.sorok.querySelector('.sk-cimke')?.focus();
  });

  return {
    /** A feladat betöltött rubrikájából (régi feladat: a ponthatárokból). */
    kitolt(rubrika) { betolt(skalaFeloldas(rubrika)); },
    /** Új űrlap: az utoljára használt skála, ennek híján a magyar 1–5. */
    torles() { betolt(alapSkala()); },
    /** @returns {{skala: object}|{hiba: string}} */
    beolvas() {
      const r = skalaSorokbol(sablon, sorok.map((s, i) => (i === 0 ? { ...s, min: '0' } : s)));
      return r.skala ? { skala: r.skala } : { hiba: t('fel.skala_hiba') };
    }
  };
}
