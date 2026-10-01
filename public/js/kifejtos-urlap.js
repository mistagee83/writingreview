// ══════════════════════════════════════════════════════
// Kifejtős dolgozat – a feladat-űrlap kulcs része
// Terv: docs/kifejtos-mod-terv.md
//
// A tanár útja szándékosan rövid:
//   feladatlap fel → tananyag fel (nem kötelező) → „Megoldókulcs készítése”
//   → mentés.
// A kulcs szerkesztése és minden beállítás ÖSSZECSUKVA van: aki nem nyitja
// le, annak is működik (alapértékek: kifejtos.js → ALAP_BEALLITAS).
// Próbajavítás nincs: a tanár a javító nézetben látja és javítja, ha
// valami rosszul pontozódott.
//
// A feladatok.html használja:
//   const ui = kifejtosUrlap({ user, feladatlapPath: () => fajlPath });
//   ui.kitolt(rubrika, kulcsAdat)   – szerkesztés, kiadás
//   ui.beolvas()   → { hiba } vagy { rubrika, kulcs }
//   ui.frissit()   – a feladatlap változott (gomb, elavultság-jelzés)
//   ui.torles()
//
// A kulcsot a szerverrel AZONOS függvény ellenőrzi mentés előtt
// (js/kifejtos.js – generált, a functions/kifejtos.js-ből).
// ══════════════════════════════════════════════════════

import { t, kulcsHibaSzoveg } from './i18n.js';
import { esc } from './guard.js';
import { uzenet, uzenetTorles, hibaSzoveg } from './ui.js';
import { atmeretez, tulNagy, meret } from './kep.js';
import {
  storage, functions, httpsCallable, serverTimestamp, storageRef, uploadBytes
} from './firebase-config.js';
import {
  ALAP_BEALLITAS, ALAP_PONTHATAROK, KERDES_TIPUSOK,
  kulcsEllenorzes, szoszedetGyujtes, ponthatarokEllenorzes
} from './kifejtos.js';

// Szótári kulcsok – a t() megjelenítéskor fordít
const TIPUS_CIMKE = {
  zart_felsorolas: 'kf.tipus_zart_felsorolas',
  nyilt_felsorolas: 'kf.tipus_nyilt_felsorolas',
  sorrend: 'kf.tipus_sorrend',
  tablazat: 'kf.tipus_tablazat',
  magyarazat: 'kf.tipus_magyarazat',
  valasztos: 'kf.tipus_valasztos'
};

const BEALLITAS_OPCIOK = {
  sorrend: [
    ['relativ', 'kf.o_sorrend_relativ'],
    ['pozicio', 'kf.o_sorrend_pozicio'],
    ['nem_szamit', 'kf.o_sorrend_nem_szamit']
  ],
  szakszo: [
    ['lenyeg', 'kf.o_szakszo_lenyeg'],
    ['pontos', 'kf.o_szakszo_pontos']
  ],
  reszpont: [
    ['0.5', 'kf.o_reszpont_0_5'],
    ['0', 'kf.o_reszpont_0'],
    ['1', 'kf.o_reszpont_1']
  ],
  kulcson_kivul: [
    ['elfogad', 'kf.o_kkivul_elfogad'],
    ['tanar_dont', 'kf.o_kkivul_tanar_dont']
  ]
};

const TANANYAG_FAJL_MAX = 5;

const $ = (id) => document.getElementById(id);

export function kifejtosUrlap({ user, feladatlapPath }) {
  const kulcsKeszites = httpsCallable(functions, 'kulcsKeszites');

  // ── ÁLLAPOT ──
  let kerdesek = [];
  let tananyag = [];          // [{ path, nev }] – a feladathoz feltöltött fájlok
  // A kulcs eredete. generalva: 'most' = ebben a munkamenetben, mentéskor
  // szerveridő. alap: melyik feladatlapból és tananyagból készült – ebből
  // látszik, ha azóta változott valamelyik.
  let meta = { model: null, generalva: null, tananyagbol: false, alap: null };

  const kerdesekEl = $('kulcs-kerdesek');

  // ══════════════════════════════════════════
  // TANANYAG FELTÖLTÉSE
  // ══════════════════════════════════════════

  function tananyagRender() {
    $('tananyag-lista').innerHTML = tananyag.map((fa, i) => `
      <li><span>📄 ${esc(fa.nev)}</span>
        <button type="button" class="btn-sm" data-tananyag-torol="${i}" title="${esc(t('kf.tananyag_torol_tipp'))}">✕</button></li>`).join('');
  }

  $('tananyag-lista').addEventListener('click', (e) => {
    const i = e.target.closest('[data-tananyag-torol]')?.dataset.tananyagTorol;
    if (i === undefined) return;
    tananyag.splice(Number(i), 1);
    tananyagRender();
    frissit();
  });

  $('tananyag-fajl').addEventListener('change', async (e) => {
    uzenetTorles('tananyag-msg');
    const fajlok = [...e.target.files];
    e.target.value = '';
    if (!fajlok.length) return;
    if (tananyag.length + fajlok.length > TANANYAG_FAJL_MAX) {
      uzenet('tananyag-msg', t('kf.max_fajl', { db: TANANYAG_FAJL_MAX }));
      return;
    }
    const rossz = fajlok.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (rossz) {
      uzenet('tananyag-msg', t('kf.csak_pdf_kep', { nev: rossz.name }));
      return;
    }

    toltes(true, t('kf.tananyag_feltolt'));
    try {
      for (const [i, eredeti] of fajlok.entries()) {
        const f = await atmeretez(eredeti);
        if (tulNagy(f)) {
          const hibaObj = new Error(t('kf.fajl_nagy', { nev: eredeti.name, meret: meret(f.size) }));
          hibaObj.helyi = true;
          throw hibaObj;
        }
        const path = `tananyagok/${user.uid}/${Date.now()}_${i}_${f.name}`;
        await uploadBytes(storageRef(storage, path), f);
        tananyag.push({ path, nev: eredeti.name });
        tananyagRender();
      }
    } catch (err) {
      uzenet('tananyag-msg', t('kf.feltoltesi_hiba', { ok: hibaSzoveg(err) }));
    } finally {
      toltes(false);
      frissit();
    }
  });

  // ══════════════════════════════════════════
  // KULCS KÉSZÍTÉSE
  // ══════════════════════════════════════════

  function toltes(be, szoveg) {
    $('kulcs-tolt-szoveg').textContent = szoveg || '';
    $('kulcs-tolt').classList.toggle('show', be);
  }

  const alapKulcs = () => JSON.stringify({ f: feladatlapPath(), t: tananyag.map((fa) => fa.path) });

  $('btn-kulcs-keszit').addEventListener('click', async () => {
    uzenetTorles('kulcs-msg');
    const path = feladatlapPath();
    if (!path) {
      uzenet('kulcs-msg', t('kf.elobb_feladatlap'));
      return;
    }
    if (kerdesek.length && !confirm(t('kf.felulir_kerdes'))) return;

    toltes(true, t('kf.keszul'));
    try {
      const { data } = await kulcsKeszites({
        feladatlapPath: path,
        tananyagPaths: tananyag.map((fa) => fa.path),
        tantargy: $('kf-tantargy').value.trim()
      });

      kerdesek = data.kulcs.kerdesek;
      meta = { model: data.model || null, generalva: 'most', tananyagbol: data.van_tananyag, alap: alapKulcs() };

      if (data.cim_javaslat && !$('f-cim').value.trim()) $('f-cim').value = data.cim_javaslat;
      if (data.feladat_leiras && !$('r-leiras').value.trim()) $('r-leiras').value = data.feladat_leiras;
      if (data.tantargy && !$('kf-tantargy').value.trim()) $('kf-tantargy').value = data.tantargy;

      render();
      if (data.kihagyott?.length) {
        uzenet('kulcs-msg', t('kf.kihagyott', { lista: data.kihagyott.join(', ') }));
        $('kulcs-reszletek').open = true;
      }
    } catch (err) {
      uzenet('kulcs-msg', hibaSzoveg(err));
    } finally {
      toltes(false);
    }
  });

  $('btn-kulcs-kezi').addEventListener('click', () => {
    kerdesUj();
    $('kulcs-reszletek').open = true;
  });

  // ══════════════════════════════════════════
  // ÖSSZEFOGLALÓ ÉS ELAVULÁS
  // ══════════════════════════════════════════

  const osszes = (k) => [...(k.elemek || []), ...(k.agak || []).flatMap((a) => a.elemek)];

  function atnezendoSzam() {
    return kerdesek.reduce((s, k) => s + osszes(k).filter((e) => e.ellenorizendo).length, 0);
  }

  /** A gombfelirat, az összefoglaló és az elavultság-jelzés. */
  function frissit() {
    const van = kerdesek.length > 0;
    $('btn-kulcs-keszit').textContent = van ? t('kf.ujrakeszit') : t('fel.kulcs_keszit');
    $('btn-kulcs-kezi').hidden = van;
    $('kulcs-reszletek').hidden = !van;

    const el = $('kulcs-osszegzes');
    el.hidden = !van;
    if (van) {
      const pont = kerdesek.reduce((s, k) => s + (Number(k.max_pont) || 0), 0);
      const atnez = atnezendoSzam();
      const elavult = meta.alap && meta.alap !== alapKulcs();
      el.innerHTML = `
        <strong>${t('kf.kesz', { db: kerdesek.length, pont: esc(pont) })}</strong>
        ${meta.generalva && !meta.tananyagbol ? `<span>${t('kf.nincs_tananyag')}</span>` : ''}
        ${atnez ? `<span class="figyelem">${t('kf.atnez', { db: atnez })}</span>` : ''}
        ${elavult ? `<span class="figyelem">${t('kf.elavult')}</span>` : ''}`;
    }
  }

  // ══════════════════════════════════════════
  // KÉRDÉSKÁRTYÁK (a „Megnézem, szerkesztem” alatt)
  // ══════════════════════════════════════════

  function ujElemId(k, elotag) {
    const foglalt = new Set(osszes(k).map((e) => e.id));
    let n = 1;
    while (foglalt.has(`${elotag}${n}`)) n++;
    return `${elotag}${n}`;
  }

  function ujElem(k, elotag) {
    return { id: ujElemId(k, elotag), allitas: '', pont: 1, elfogadhato: [], forras: 'tanar', ellenorizendo: false };
  }

  function opciok(lista, ertek) {
    return lista.map(([v, c]) =>
      `<option value="${esc(v)}" ${String(ertek) === v ? 'selected' : ''}>${esc(t(c))}</option>`).join('');
  }

  const cim = (ki, ai = -1, ei = -1) => `data-k="${ki}" data-a="${ai}" data-e="${ei}"`;

  function elemSor(e, ki, ai, ei, sorrendes) {
    const jelek = [];
    if (e.ellenorizendo) {
      jelek.push(`<button type="button" class="elem-jel atnez" data-akcio="elem-ok" ${cim(ki, ai, ei)}
        title="${esc(t('kf.elem_atnez_tipp'))}">${t('kf.elem_atnez_gomb')}</button>`);
    }
    // Csak akkor jelezzük, ha VOLT tananyag: tananyag nélkül minden elem
    // ilyen, azt az összefoglaló egyszer mondja ki.
    if (meta.tananyagbol && e.forras === 'altalanos') {
      jelek.push(`<span class="elem-jel altalanos" title="${esc(t('kf.nem_tananyagbol_tipp'))}">${t('kf.nem_tananyagbol')}</span>`);
    }
    return `
      <div class="elem-sor${e.ellenorizendo ? ' jelolt' : ''}">
        ${sorrendes ? `<span class="elem-szam">${ei + 1}.</span>` : ''}
        <textarea rows="1" data-mezo="allitas" ${cim(ki, ai, ei)}
          placeholder="${esc(t('kf.allitas_pelda'))}" aria-label="${esc(t('kf.allitas_pelda'))}">${esc(e.allitas)}</textarea>
        <textarea rows="1" data-mezo="elfogadhato" ${cim(ki, ai, ei)}
          placeholder="${esc(t('kf.elfogadhato_pelda'))}" aria-label="${esc(t('kf.elfogadhato_aria'))}">${esc((e.elfogadhato || []).join('; '))}</textarea>
        <input type="number" data-mezo="pont" ${cim(ki, ai, ei)} value="${esc(e.pont)}"
          min="0" step="0.5" aria-label="${esc(t('kf.pont_aria'))}" />
        <span class="elem-gombok">
          ${ei > 0 ? `<button type="button" class="btn-sm" data-akcio="elem-fel" ${cim(ki, ai, ei)} title="${esc(t('kf.feljebb'))}">↑</button>` : ''}
          <button type="button" class="btn-sm danger" data-akcio="elem-torol" ${cim(ki, ai, ei)} title="${esc(t('kf.torles'))}">✕</button>
        </span>
        ${jelek.length ? `<div class="elem-jelek">${jelek.join('')}</div>` : ''}
      </div>`;
  }

  const elemFejlec = () => `
    <div class="elem-fejlec" aria-hidden="true">
      <span>${t('kf.fejlec_allitas')}</span><span>${t('kf.fejlec_elfogadhato')} <small>${t('kf.fejlec_elfogadhato_tipp')}</small></span><span>${t('kf.fejlec_pont')}</span>
    </div>`;

  function osszegSzoveg(k) {
    const elemPont = (lista) => lista.reduce((s, e) => s + (Number(e.pont) || 0), 0);
    const osszeg = k.tipus === 'valasztos'
      ? Math.max(0, ...(k.agak || []).map((a) => elemPont(a.elemek)))
      : elemPont(k.elemek || []);
    const max = Number(k.max_pont) || 0;
    // Nyílt felsorolásnál szándékosan több elem van, mint amennyi pont jár.
    const keves = k.tipus !== 'nyilt_felsorolas' && osszeg < max;
    return {
      szoveg: t('kf.osszeg', { osszeg, max }) + (keves ? t('kf.osszeg_keves') : ''),
      keves
    };
  }

  function kartya(k, ki) {
    const b = { ...ALAP_BEALLITAS, ...(k.beallitas || {}) };
    const sorrendes = k.tipus === 'sorrend';
    const o = osszegSzoveg(k);

    const elemResz = k.tipus === 'valasztos'
      ? `${(k.agak || []).map((a, ai) => `
          <div class="kulcs-ag">
            <div class="kulcs-ag-fej">
              <input type="text" data-mezo="ag-cim" ${cim(ki, ai)} value="${esc(a.cim)}" aria-label="${esc(t('kf.ag_cim_aria'))}" />
              <button type="button" class="btn-sm danger" data-akcio="ag-torol" ${cim(ki, ai)} title="${esc(t('kf.ag_torol'))}">✕</button>
            </div>
            ${a.elemek.length ? elemFejlec() : ''}
            ${a.elemek.map((e, ei) => elemSor(e, ki, ai, ei, false)).join('')}
            <button type="button" class="btn-sm" data-akcio="elem-uj" ${cim(ki, ai)}>${t('kf.elem_uj')}</button>
          </div>`).join('')}
          <button type="button" class="btn-sm" data-akcio="ag-uj" ${cim(ki)}>${t('kf.ag_uj')}</button>`
      : `${(k.elemek || []).length ? elemFejlec() : ''}
          ${(k.elemek || []).map((e, ei) => elemSor(e, ki, -1, ei, sorrendes)).join('')}
          <button type="button" class="btn-sm" data-akcio="elem-uj" ${cim(ki)}>${t('kf.elem_uj')}</button>`;

    return `
      <div class="kulcs-kartya">
        <div class="kulcs-kartya-fej">
          <input type="text" class="kulcs-sorszam" data-mezo="sorszam" ${cim(ki)} value="${esc(k.sorszam)}"
            aria-label="${esc(t('kf.sorszam_aria'))}" maxlength="10" />
          <select data-mezo="tipus" ${cim(ki)} aria-label="${esc(t('kf.tipus_aria'))}">
            ${KERDES_TIPUSOK.map((tp) => `<option value="${tp}" ${k.tipus === tp ? 'selected' : ''}>${esc(t(TIPUS_CIMKE[tp]))}</option>`).join('')}
          </select>
          <label class="kulcs-max">${t('kf.max')}
            <input type="number" data-mezo="max_pont" ${cim(ki)} value="${esc(k.max_pont)}" min="0.5" step="0.5" />
          </label>
          <button type="button" class="btn-sm danger" data-akcio="kerdes-torol" ${cim(ki)} title="${esc(t('kf.kerdes_torol'))}">🗑</button>
        </div>
        <textarea rows="1" data-mezo="szoveg" ${cim(ki)} placeholder="${esc(t('kf.kerdes_pelda'))}">${esc(k.szoveg || '')}</textarea>
        ${k.megjegyzes ? `<p class="kulcs-megjegyzes">⚠ ${esc(k.megjegyzes)}</p>` : ''}
        ${k.tipus === 'nyilt_felsorolas' ? `<p class="halvany">${t('kf.nyilt_leiras')}</p>` : ''}
        ${sorrendes ? `<p class="halvany">${t('kf.sorrend_leiras')}</p>` : ''}
        <div class="kulcs-elemek">${elemResz}</div>
        <p class="kulcs-osszeg${o.keves ? ' figyelem' : ''}" id="kulcs-osszeg-${ki}">${esc(o.szoveg)}</p>
        <div class="kulcs-beallitas">
          ${sorrendes ? `<label>${t('kf.b_sorrend')}
            <select data-mezo="b-sorrend" ${cim(ki)}
              title="${esc(t('kf.b_sorrend_tipp'))}">${opciok(BEALLITAS_OPCIOK.sorrend, b.sorrend)}</select></label>` : ''}
          <label>${t('kf.b_szakszo')}
            <select data-mezo="b-szakszo" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.szakszo, b.szakszo)}</select></label>
          <label>${t('kf.b_reszpont')}
            <select data-mezo="b-reszpont" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.reszpont, b.reszpont)}</select></label>
          ${k.tipus === 'nyilt_felsorolas' ? `<label>${t('kf.b_kulcson_kivul')}
            <select data-mezo="b-kulcson_kivul" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.kulcson_kivul, b.kulcson_kivul)}</select></label>` : ''}
        </div>
      </div>`;
  }

  /** A többsoros mezők a tartalmukhoz nőnek – a hosszú elem ne vágódjon le. */
  function magassag(el) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }

  function render() {
    kerdesekEl.innerHTML = kerdesek.map(kartya).join('');
    kerdesekEl.querySelectorAll('textarea').forEach(magassag);
    frissit();
  }

  // A lenyitáskor a mezők még rejtettek voltak (scrollHeight = 0).
  $('kulcs-reszletek').addEventListener('toggle', () => {
    if ($('kulcs-reszletek').open) kerdesekEl.querySelectorAll('textarea').forEach(magassag);
  });

  function hely(el) {
    const k = kerdesek[Number(el.dataset.k)];
    const ai = Number(el.dataset.a);
    const ei = Number(el.dataset.e);
    const ag = ai >= 0 ? k?.agak?.[ai] : null;
    const lista = ag ? ag.elemek : k?.elemek;
    return { k, ag, lista, ei, elem: ei >= 0 ? lista?.[ei] : null };
  }

  kerdesekEl.addEventListener('input', (e) => {
    const mezo = e.target.dataset?.mezo;
    if (!mezo) return;
    if (e.target.tagName === 'TEXTAREA') magassag(e.target);
    const { k, ag, elem } = hely(e.target);
    if (!k) return;
    const v = e.target.value;

    if (mezo === 'allitas') elem.allitas = v;
    else if (mezo === 'elfogadhato') elem.elfogadhato = v.split(';').map((x) => x.trim()).filter(Boolean);
    else if (mezo === 'pont') elem.pont = v === '' ? '' : Number(v);
    else if (mezo === 'sorszam') k.sorszam = v.trim();
    else if (mezo === 'szoveg') k.szoveg = v;
    else if (mezo === 'max_pont') k.max_pont = v === '' ? '' : Number(v);
    else if (mezo === 'ag-cim') ag.cim = v;
    else return;

    if (mezo === 'pont' || mezo === 'max_pont') {
      const o = osszegSzoveg(k);
      const el = $(`kulcs-osszeg-${e.target.dataset.k}`);
      el.textContent = o.szoveg;
      el.classList.toggle('figyelem', o.keves);
      frissit();
    }
  });

  kerdesekEl.addEventListener('change', (e) => {
    const mezo = e.target.dataset?.mezo;
    if (!mezo) return;
    const { k } = hely(e.target);
    if (!k) return;

    if (mezo === 'tipus') {
      const regi = k.tipus;
      const uj = e.target.value;
      if (uj === 'valasztos' && regi !== 'valasztos') {
        k.agak = [{ id: 'a1', cim: t('kf.ag_alap', { n: 1 }), elemek: k.elemek || [] }];
        k.elemek = [];
      } else if (regi === 'valasztos' && uj !== 'valasztos') {
        k.elemek = (k.agak || []).flatMap((a) => a.elemek);
        k.agak = null;
      }
      k.tipus = uj;
      render();
    } else if (mezo.startsWith('b-')) {
      const kulcs = mezo.slice(2);
      k.beallitas = { ...ALAP_BEALLITAS, ...(k.beallitas || {}) };
      k.beallitas[kulcs] = kulcs === 'reszpont' ? Number(e.target.value) : e.target.value;
    }
  });

  kerdesekEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcio]');
    if (!b) return;
    const { k, ag, lista, ei } = hely(b);
    if (!k) return;
    const ki = Number(b.dataset.k);

    switch (b.dataset.akcio) {
      case 'kerdes-torol':
        if (!confirm(t('kf.kerdes_torles_kerdes', { n: k.sorszam || ki + 1 }))) return;
        kerdesek.splice(ki, 1);
        break;
      case 'elem-uj':
        lista.push(ujElem(k, ag ? `${ag.id}e` : 'e'));
        break;
      case 'elem-torol':
        lista.splice(ei, 1);
        break;
      case 'elem-fel':
        [lista[ei - 1], lista[ei]] = [lista[ei], lista[ei - 1]];
        break;
      case 'elem-ok':
        lista[ei].ellenorizendo = false;
        break;
      case 'ag-uj': {
        const foglalt = new Set((k.agak || []).map((a) => a.id));
        let n = 1;
        while (foglalt.has(`a${n}`)) n++;
        k.agak = [...(k.agak || []), { id: `a${n}`, cim: t('kf.ag_alap', { n }), elemek: [] }];
        break;
      }
      case 'ag-torol':
        if (!confirm(t('kf.ag_torles_kerdes', { cim: ag.cim }))) return;
        k.agak.splice(Number(b.dataset.a), 1);
        break;
      default:
        return;
    }
    render();
  });

  function kerdesUj() {
    const foglalt = new Set(kerdesek.map((k) => k.sorszam));
    let n = kerdesek.length + 1;
    while (foglalt.has(String(n))) n++;
    const k = {
      sorszam: String(n), szoveg: '', tipus: 'magyarazat', max_pont: 1,
      elemek: [], agak: null, beallitas: { ...ALAP_BEALLITAS }, megjegyzes: ''
    };
    k.elemek.push(ujElem(k, 'e'));
    kerdesek.push(k);
    render();
    kerdesekEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('btn-kerdes-uj').addEventListener('click', kerdesUj);

  // ══════════════════════════════════════════
  // PONTHATÁROK
  // ══════════════════════════════════════════

  function ponthatarokKitolt(h) {
    const p = ponthatarokEllenorzes(h);
    for (const j of [2, 3, 4, 5]) $(`ph-${j}`).value = p[j];
  }

  function ponthatarokBeolvas() {
    const h = {};
    for (const j of [2, 3, 4, 5]) h[j] = Number($(`ph-${j}`).value);
    return h;
  }

  // ══════════════════════════════════════════
  // BEOLVASÁS (mentéshez)
  // ══════════════════════════════════════════

  function beolvas() {
    if (kerdesek.length === 0) {
      return { hiba: t('kf.kell_kulcs') };
    }
    let kulcs;
    try {
      kulcs = kulcsEllenorzes({ kerdesek });
    } catch (e) {
      $('kulcs-reszletek').open = true;
      return { hiba: kulcsHibaSzoveg(e) };
    }

    const nyersHatarok = ponthatarokBeolvas();
    const ponthatarok = ponthatarokEllenorzes(nyersHatarok);
    if ([2, 3, 4, 5].some((j) => ponthatarok[j] !== nyersHatarok[j])) {
      $('kulcs-reszletek').open = true;
      return { hiba: t('kf.ponthatar_hiba') };
    }

    return {
      rubrika: {
        mod: 'kifejtos',
        tantargy: $('kf-tantargy').value.trim().slice(0, 60),
        ponthatarok,
        helyes_valaszok_lathatok: $('kf-helyes-lathato').checked,
        // A NYILVÁNOS rész: a diák látja, hány pontos az egyes kérdés.
        // A kulcs maga külön, csak tanári alkollekcióba megy.
        kerdesek: kulcs.kerdesek.map((k) => ({ sorszam: k.sorszam, max_pont: k.max_pont }))
      },
      kulcs: {
        kerdesek: kulcs.kerdesek,
        szoszedet: szoszedetGyujtes(kulcs),
        // A tananyag a KULCSHOZ tartozik (csak a tanár látja), nem a
        // feladathoz – a diák a feladat dokumentumát olvashatja.
        tananyag: tananyag.map((fa) => ({ path: fa.path, nev: fa.nev })),
        tananyagbol: meta.tananyagbol === true,
        model: meta.model,
        generalva: meta.generalva === 'most' ? serverTimestamp() : (meta.generalva || null),
        modositva: serverTimestamp()
      }
    };
  }

  // ══════════════════════════════════════════
  // KÜLSŐ FELÜLET
  // ══════════════════════════════════════════

  function torles() {
    kerdesek = [];
    tananyag = [];
    meta = { model: null, generalva: null, tananyagbol: false, alap: null };
    $('kf-tantargy').value = '';
    $('kf-helyes-lathato').checked = true;
    ponthatarokKitolt(ALAP_PONTHATAROK);
    $('kulcs-reszletek').open = false;
    ['tananyag-msg', 'kulcs-msg'].forEach(uzenetTorles);
    tananyagRender();
    render();
  }

  /**
   * Meglévő feladat betöltése (szerkesztés, kiadás).
   * @param {object} rubrika a feladat rubrikája
   * @param {object|null} kulcsAdat a kulcs/aktualis dokumentum
   */
  function kitolt(rubrika, kulcsAdat) {
    torles();
    $('kf-tantargy').value = rubrika?.tantargy || '';
    $('kf-helyes-lathato').checked = rubrika?.helyes_valaszok_lathatok !== false;
    ponthatarokKitolt(rubrika?.ponthatarok);
    kerdesek = structuredClone(kulcsAdat?.kerdesek || []);
    tananyag = structuredClone(kulcsAdat?.tananyag || []);
    meta = {
      model: kulcsAdat?.model || null,
      generalva: kulcsAdat?.generalva || null,
      tananyagbol: kulcsAdat?.tananyagbol === true,
      alap: null
    };
    tananyagRender();
    render();
    if (!kulcsAdat) uzenet('kulcs-msg', t('kf.nincs_kulcs'));
  }

  ponthatarokKitolt(ALAP_PONTHATAROK);
  render();

  return { torles, kitolt, beolvas, frissit };
}
