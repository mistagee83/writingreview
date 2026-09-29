// ══════════════════════════════════════════════════════
// Kifejtős dolgozat – a javító nézet kérdésenkénti része
// Terv: docs/kifejtos-mod-terv.md → 3. fázis
//
// Itt történik az ellenőrzés: a tanár kérdésenként látja a diák válaszát
// és a kulcs elemeit az AI döntésével, és egy kattintással felülírhatja.
// A pont ÉLŐBEN számolódik, ugyanazzal a függvénnyel, amivel a szerver
// a jóváhagyáskor ír (kifejtosTanariEredmeny, js/kifejtos.js – generált).
// A szerver felé csak a felülírt státuszok mennek, pont soha.
//
// A javitas.html használja:
//   const kf = kifejtosJavitas({ el, beadas, ai, kulcsAdat, feladat, tanari, onValtozas });
//   kf.modositasok()  → a visszajelzesJovahagyas `kerdesek` paramétere
//   kf.eredmeny()     → a diáknak kimenő eredmény (pont, jegyjavaslat)
// ══════════════════════════════════════════════════════

import { esc } from './guard.js';
import {
  ELEM_STATUSZOK, kulcsEllenorzes, kifejtosTanariEredmeny, valaszSzovegek
} from './kifejtos.js';

const GOMBOK = [
  ['megvan', '✓', 'Megvan'],
  ['reszben', '½', 'Részben'],
  ['hianyzik', '✕', 'Hiányzik'],
  ['teves', 'téves', 'Téves állítás (0 pont, a diák jelzést kap)']
];
const JEL = { megvan: '✓', reszben: '½', hianyzik: '✕', teves: '✕' };

// A sorrend-szabály szövege: ha egy leírt lépés 0 pontot ér, a tanár lássa, miért.
const SORREND_SZABALY = {
  relativ: 'Sorrend: relatív – a rossz helyre tett lépés nem ér pontot.',
  pozicio: 'Sorrend: szigorú – csak a pontosan a helyén lévő lépés ér pontot.'
};

export function kifejtosJavitas({ el, beadas, ai, kulcsAdat, feladat, tanari, onValtozas }) {
  const kulcs = kulcsEllenorzes(kulcsAdat);
  const rubrika = feladat?.rubrika || {};
  const opciok = {
    ponthatarok: rubrika.ponthatarok,
    helyesLathato: rubrika.helyes_valaszok_lathatok !== false
  };
  const valaszok = valaszSzovegek({ valaszok: beadas.atirat_valaszok, tablazatok: beadas.atirat_tablazatok });
  const aiKerdesek = new Map((ai.kerdesek || []).map((k) => [String(k.sorszam), k]));
  const hianyzoErtekeles = new Set(
    (ai.figyelmeztetesek || []).filter((f) => f.tipus === 'nincs_ertekeles').map((f) => String(f.kerdes))
  );

  // ── A tanár felülírásai: sorszám → { elemek: Map(id → statusz), kivul: Map(index → bool) } ──
  const modositas = new Map(kulcs.kerdesek.map((k) => [k.sorszam, { elemek: new Map(), kivul: new Map() }]));

  // Már elküldött visszajelzésnél az akkori döntések töltődnek vissza.
  for (const tk of tanari?.kerdesek || []) {
    const m = modositas.get(String(tk.sorszam));
    const ak = aiKerdesek.get(String(tk.sorszam));
    if (!m || !ak) continue;
    const aiStatusz = new Map((ak.elemek || []).map((e) => [e.id, e.statusz]));
    for (const e of tk.elemek || []) {
      if (e.id && ELEM_STATUSZOK.includes(e.statusz) && e.statusz !== aiStatusz.get(e.id)) {
        m.elemek.set(e.id, e.statusz);
      }
    }
    (tk.kulcson_kivul || []).forEach((t, i) => {
      if (typeof t.elfogadva === 'boolean' && t.elfogadva !== ak.kulcson_kivul?.[i]?.elfogadva) {
        m.kivul.set(i, t.elfogadva);
      }
    });
  }

  function modositasok() {
    return [...modositas].map(([sorszam, m]) => ({
      sorszam,
      elemek: [...m.elemek].map(([id, statusz]) => ({ id, statusz })),
      kulcson_kivul: [...m.kivul].map(([index, elfogadva]) => ({ index, elfogadva }))
    })).filter((m) => m.elemek.length || m.kulcson_kivul.length);
  }

  const eredmeny = () => kifejtosTanariEredmeny(kulcs, ai, modositasok(), opciok);

  // ══════════════════════════════════════════
  // MEGJELENÍTÉS
  // ══════════════════════════════════════════

  function kerdesHtml(kk, ek) {
    const ak = aiKerdesek.get(kk.sorszam) || {};
    const aiElemek = new Map((ak.elemek || []).map((e) => [e.id, e]));
    const valasz = valaszok.get(kk.sorszam);
    const kulcsElem = new Map(
      [...kk.elemek, ...(kk.agak || []).flatMap((a) => a.elemek)].map((e) => [e.id, e])
    );

    const elemek = ek.elemek.map((e) => {
      const a = aiElemek.get(e.id) || {};
      const k = kulcsElem.get(e.id);
      const jelzesek = [];
      if (a.idezet_ok === false) {
        jelzesek.push(`<span class="elem-jel atnez" title="Az AI ezt „${esc(a.ai_statusz)}” jelölte, de az idézetét nem találtuk a diák válaszában – ezért nem kapott érte pontot.">⚠ az AI idézete nincs a válaszban</span>`);
      }
      if (e.rossz_helyen) {
        jelzesek.push('<span class="elem-jel atnez" title="A diák leírta, de a sorrend-szabály szerint nincs a helyén.">↕ nem a helyén</span>');
      }
      if (e.tanar_modositotta) {
        jelzesek.push(`<span class="elem-jel altalanos">AI: ${esc(JEL[a.statusz] || '✕')}</span>`);
      }
      return `
        <li class="jk-elem s-${esc(e.statusz)}">
          <div class="jk-elem-szoveg">
            <span>${esc(k?.allitas || e.id)}</span>
            ${e.idezet ? `<em>„${esc(e.idezet)}”</em>` : ''}
            ${jelzesek.join('')}
          </div>
          <div class="jk-gombok" role="group" aria-label="${esc(k?.allitas || e.id)}">
            ${GOMBOK.map(([s, felirat, cim]) => `
              <button type="button" class="${e.statusz === s ? 'aktiv' : ''}" aria-pressed="${e.statusz === s}"
                data-sorszam="${esc(kk.sorszam)}" data-elem="${esc(e.id)}" data-statusz="${s}" title="${esc(cim)}">${felirat}</button>`).join('')}
          </div>
          <span class="jk-elem-pont">${esc(e.pont)}</span>
        </li>`;
    }).join('');

    const kivul = ek.kulcson_kivul.map((t, i) => `
      <li class="jk-elem ${t.elfogadva ? 's-megvan' : 's-hianyzik'}">
        <div class="jk-elem-szoveg"><span>Kulcson kívül:</span> <em>„${esc(t.idezet)}”</em>
          ${t.elfogadva === null ? '<span class="elem-jel atnez">⚠ döntsd el</span>' : ''}</div>
        <div class="jk-gombok" role="group" aria-label="Kulcson kívüli tétel">
          <button type="button" class="${t.elfogadva === true ? 'aktiv' : ''}" aria-pressed="${t.elfogadva === true}"
            data-sorszam="${esc(kk.sorszam)}" data-kivul="${i}" data-elfogad="1" title="Elfogadom (1 pont, nyílt felsorolásnál)">elfogad</button>
          <button type="button" class="${t.elfogadva === false ? 'aktiv' : ''}" aria-pressed="${t.elfogadva === false}"
            data-sorszam="${esc(kk.sorszam)}" data-kivul="${i}" data-elfogad="0" title="Nem fogadom el">nem</button>
        </div>
        <span class="jk-elem-pont"></span>
      </li>`).join('');

    return `
      <div class="jk-fej">
        <strong>${esc(kk.sorszam)}.</strong>
        <span class="jk-szoveg">${esc(kk.szoveg || '')}</span>
        <span class="jk-pont">${esc(ek.pont)} / ${esc(ek.max)}</span>
      </div>
      ${hianyzoErtekeles.has(kk.sorszam) ? '<p class="hiba-szoveg">Ehhez a kérdéshez az AI nem adott értékelést – nézd meg kézzel.</p>' : ''}
      <div class="jk-valasz">${valasz
        ? `<pre class="atirat">${esc(valasz)}</pre>`
        : '<p class="halvany">A diák nem válaszolt erre a kérdésre (vagy az AI nem olvasta ki).</p>'}</div>
      ${ek.valasztott ? `<p class="halvany">Választott lehetőség: <strong>${esc(ek.valasztott)}</strong></p>` : ''}
      ${ek.sorrend ? `<p class="halvany">↕ ${esc(SORREND_SZABALY[ek.sorrend] || '')} A feladat szerkesztésénél átállíthatod.</p>` : ''}
      <ul class="jk-elemek">${elemek}${kivul}</ul>
      ${ak.visszajelzes ? `<p class="halvany">🤖 ${esc(ak.visszajelzes)}</p>` : ''}`;
  }

  function render(csakEzt) {
    const e = eredmeny();
    const ek = new Map(e.kerdesek.map((k) => [k.sorszam, k]));
    if (csakEzt) {
      const blokk = el.querySelector(`[data-kerdes="${CSS.escape(csakEzt)}"]`);
      const kk = kulcs.kerdesek.find((k) => k.sorszam === csakEzt);
      if (blokk && kk) blokk.innerHTML = kerdesHtml(kk, ek.get(csakEzt));
    } else {
      el.innerHTML = kulcs.kerdesek.map((kk) => `
        <div class="jk-kerdes" data-kerdes="${esc(kk.sorszam)}">${kerdesHtml(kk, ek.get(kk.sorszam))}</div>`).join('');
    }
    onValtozas?.(e);
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-sorszam]');
    if (!b) return;
    const sorszam = b.dataset.sorszam;
    const m = modositas.get(sorszam);
    const ak = aiKerdesek.get(sorszam) || {};
    if (!m) return;

    if (b.dataset.elem) {
      const id = b.dataset.elem;
      const aiStatusz = (ak.elemek || []).find((x) => x.id === id)?.statusz;
      // Ha visszaállította az AI döntésére, az már nem felülírás.
      if (b.dataset.statusz === aiStatusz) m.elemek.delete(id);
      else m.elemek.set(id, b.dataset.statusz);
    } else if (b.dataset.kivul !== undefined) {
      const i = Number(b.dataset.kivul);
      const elfogad = b.dataset.elfogad === '1';
      if (elfogad === ak.kulcson_kivul?.[i]?.elfogadva) m.kivul.delete(i);
      else m.kivul.set(i, elfogad);
    }
    render(sorszam);
  });

  render();
  return { modositasok, eredmeny };
}
