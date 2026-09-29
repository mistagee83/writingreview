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

const TIPUS_CIMKE = {
  zart_felsorolas: 'Zárt felsorolás',
  nyilt_felsorolas: 'Nyílt felsorolás („legalább N”)',
  sorrend: 'Folyamat, sorrend',
  tablazat: 'Táblázat',
  magyarazat: 'Rövid magyarázat',
  valasztos: 'Választós („fejts ki egyet”)'
};

const BEALLITAS_OPCIOK = {
  sorrend: [
    ['relativ', 'Relatív (ajánlott)'],
    ['pozicio', 'Szigorú pozíció'],
    ['nem_szamit', 'Nem számít']
  ],
  szakszo: [
    ['lenyeg', 'Elég a lényeg'],
    ['pontos', 'Pontos szakkifejezés kell']
  ],
  reszpont: [
    ['0.5', 'fél pontot ér'],
    ['0', 'nem ér pontot'],
    ['1', 'teljes pontot ér']
  ],
  kulcson_kivul: [
    ['elfogad', 'A helyes, kulcson kívüli tétel is jár'],
    ['tanar_dont', 'A kulcson kívüli tételről én döntök']
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
    $('tananyag-lista').innerHTML = tananyag.map((t, i) => `
      <li><span>📄 ${esc(t.nev)}</span>
        <button type="button" class="btn-sm" data-tananyag-torol="${i}" title="Eltávolítás">✕</button></li>`).join('');
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
      uzenet('tananyag-msg', `Legfeljebb ${TANANYAG_FAJL_MAX} tananyag-fájl lehet.`);
      return;
    }
    const rossz = fajlok.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (rossz) {
      uzenet('tananyag-msg', `„${rossz.name}”: csak PDF vagy kép lehet. A Word/PowerPoint fájlt mentsd PDF-be.`);
      return;
    }

    toltes(true, 'Tananyag feltöltése...');
    try {
      for (const [i, eredeti] of fajlok.entries()) {
        const f = await atmeretez(eredeti);
        if (tulNagy(f)) throw new Error(`„${eredeti.name}” túl nagy (${meret(f.size)}), a korlát 10 MB.`);
        const path = `tananyagok/${user.uid}/${Date.now()}_${i}_${f.name}`;
        await uploadBytes(storageRef(storage, path), f);
        tananyag.push({ path, nev: eredeti.name });
        tananyagRender();
      }
    } catch (err) {
      uzenet('tananyag-msg', 'A feltöltés nem sikerült: ' + hibaSzoveg(err));
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

  const alapKulcs = () => JSON.stringify({ f: feladatlapPath(), t: tananyag.map((t) => t.path) });

  $('btn-kulcs-keszit').addEventListener('click', async () => {
    uzenetTorles('kulcs-msg');
    const path = feladatlapPath();
    if (!path) {
      uzenet('kulcs-msg', 'Előbb töltsd fel a feladatlapot (fent) – abból olvassa ki az AI a kérdéseket.');
      return;
    }
    if (kerdesek.length && !confirm('Az új kulcs felülírja a mostanit, a módosításaiddal együtt. Folytatod?')) return;

    toltes(true, 'Készül a megoldókulcs... (kb. fél perc)');
    try {
      const { data } = await kulcsKeszites({
        feladatlapPath: path,
        tananyagPaths: tananyag.map((t) => t.path),
        tantargy: $('kf-tantargy').value.trim()
      });

      kerdesek = data.kulcs.kerdesek;
      meta = { model: data.model || null, generalva: 'most', tananyagbol: data.van_tananyag, alap: alapKulcs() };

      if (data.cim_javaslat && !$('f-cim').value.trim()) $('f-cim').value = data.cim_javaslat;
      if (data.feladat_leiras && !$('r-leiras').value.trim()) $('r-leiras').value = data.feladat_leiras;
      if (data.tantargy && !$('kf-tantargy').value.trim()) $('kf-tantargy').value = data.tantargy;

      render();
      if (data.kihagyott?.length) {
        uzenet('kulcs-msg',
          `Ezekhez a kérdésekhez az AI nem tudott kulcsot adni, pótold kézzel: ${data.kihagyott.join(', ')}.`);
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
    $('btn-kulcs-keszit').textContent = van ? '↻ Megoldókulcs újrakészítése' : '✨ Megoldókulcs készítése';
    $('btn-kulcs-kezi').hidden = van;
    $('kulcs-reszletek').hidden = !van;

    const el = $('kulcs-osszegzes');
    el.hidden = !van;
    if (van) {
      const pont = kerdesek.reduce((s, k) => s + (Number(k.max_pont) || 0), 0);
      const atnez = atnezendoSzam();
      const elavult = meta.alap && meta.alap !== alapKulcs();
      el.innerHTML = `
        <strong>✅ Kész a megoldókulcs: ${kerdesek.length} kérdés, ${esc(pont)} pont.</strong>
        ${meta.generalva && !meta.tananyagbol ? '<span>Tananyag nélkül készült – az AI a saját tudásából dolgozott.</span>' : ''}
        ${atnez ? `<span class="figyelem">⚠ ${atnez} elemnél az AI bizonytalan volt – érdemes megnézni.</span>` : ''}
        ${elavult ? '<span class="figyelem">A feladatlap vagy a tananyag azóta változott. Ha az új alapján kell, készítsd újra.</span>' : ''}`;
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
      `<option value="${esc(v)}" ${String(ertek) === v ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }

  const cim = (ki, ai = -1, ei = -1) => `data-k="${ki}" data-a="${ai}" data-e="${ei}"`;

  function elemSor(e, ki, ai, ei, sorrendes) {
    const jelek = [];
    if (e.ellenorizendo) {
      jelek.push(`<button type="button" class="elem-jel atnez" data-akcio="elem-ok" ${cim(ki, ai, ei)}
        title="Az AI bizonytalan volt ebben. Kattints, ha átnézted.">⚠ nézd meg – kész ✓</button>`);
    }
    // Csak akkor jelezzük, ha VOLT tananyag: tananyag nélkül minden elem
    // ilyen, azt az összefoglaló egyszer mondja ki.
    if (meta.tananyagbol && e.forras === 'altalanos') {
      jelek.push(`<span class="elem-jel altalanos" title="Ezt az AI nem a feltöltött tananyagból vette, hanem a saját tudásából – nézd meg, ugyanezt tanítottad-e.">nem a tananyagból</span>`);
    }
    return `
      <div class="elem-sor${e.ellenorizendo ? ' jelolt' : ''}">
        ${sorrendes ? `<span class="elem-szam">${ei + 1}.</span>` : ''}
        <textarea rows="1" data-mezo="allitas" ${cim(ki, ai, ei)}
          placeholder="Amit a diáknak le kell írnia" aria-label="Amit a diáknak le kell írnia">${esc(e.allitas)}</textarea>
        <textarea rows="1" data-mezo="elfogadhato" ${cim(ki, ai, ei)}
          placeholder="így is jó (nem kötelező)" aria-label="Így is elfogadható">${esc((e.elfogadhato || []).join('; '))}</textarea>
        <input type="number" data-mezo="pont" ${cim(ki, ai, ei)} value="${esc(e.pont)}"
          min="0" step="0.5" aria-label="Pont" />
        <span class="elem-gombok">
          ${ei > 0 ? `<button type="button" class="btn-sm" data-akcio="elem-fel" ${cim(ki, ai, ei)} title="Feljebb">↑</button>` : ''}
          <button type="button" class="btn-sm danger" data-akcio="elem-torol" ${cim(ki, ai, ei)} title="Törlés">✕</button>
        </span>
        ${jelek.length ? `<div class="elem-jelek">${jelek.join('')}</div>` : ''}
      </div>`;
  }

  const ELEM_FEJLEC = `
    <div class="elem-fejlec" aria-hidden="true">
      <span>Amit le kell írnia</span><span>Így is elfogadható <small>(; választja el)</small></span><span>Pont</span>
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
      szoveg: `Elemek: ${osszeg} pont · a kérdés max. ${max} pont` +
        (keves ? ' – az elemekből nem jön ki a maximum' : ''),
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
              <input type="text" data-mezo="ag-cim" ${cim(ki, ai)} value="${esc(a.cim)}" aria-label="Lehetőség neve" />
              <button type="button" class="btn-sm danger" data-akcio="ag-torol" ${cim(ki, ai)} title="Lehetőség törlése">✕</button>
            </div>
            ${a.elemek.length ? ELEM_FEJLEC : ''}
            ${a.elemek.map((e, ei) => elemSor(e, ki, ai, ei, false)).join('')}
            <button type="button" class="btn-sm" data-akcio="elem-uj" ${cim(ki, ai)}>＋ Elem</button>
          </div>`).join('')}
          <button type="button" class="btn-sm" data-akcio="ag-uj" ${cim(ki)}>＋ Lehetőség</button>`
      : `${(k.elemek || []).length ? ELEM_FEJLEC : ''}
          ${(k.elemek || []).map((e, ei) => elemSor(e, ki, -1, ei, sorrendes)).join('')}
          <button type="button" class="btn-sm" data-akcio="elem-uj" ${cim(ki)}>＋ Elem</button>`;

    return `
      <div class="kulcs-kartya">
        <div class="kulcs-kartya-fej">
          <input type="text" class="kulcs-sorszam" data-mezo="sorszam" ${cim(ki)} value="${esc(k.sorszam)}"
            aria-label="Sorszám" maxlength="10" />
          <select data-mezo="tipus" ${cim(ki)} aria-label="Kérdéstípus">
            ${KERDES_TIPUSOK.map((t) => `<option value="${t}" ${k.tipus === t ? 'selected' : ''}>${esc(TIPUS_CIMKE[t])}</option>`).join('')}
          </select>
          <label class="kulcs-max">max
            <input type="number" data-mezo="max_pont" ${cim(ki)} value="${esc(k.max_pont)}" min="0.5" step="0.5" />
          </label>
          <button type="button" class="btn-sm danger" data-akcio="kerdes-torol" ${cim(ki)} title="Kérdés törlése">🗑</button>
        </div>
        <textarea rows="1" data-mezo="szoveg" ${cim(ki)} placeholder="A kérdés szövege">${esc(k.szoveg || '')}</textarea>
        ${k.megjegyzes ? `<p class="kulcs-megjegyzes">⚠ ${esc(k.megjegyzes)}</p>` : ''}
        ${k.tipus === 'nyilt_felsorolas' ? '<p class="halvany">Adj meg minden elfogadható tételt – a diák a max. pontig kap pontot.</p>' : ''}
        ${sorrendes ? '<p class="halvany">Az elemek sorrendje a helyes sorrend (↑ gombbal rendezheted).</p>' : ''}
        <div class="kulcs-elemek">${elemResz}</div>
        <p class="kulcs-osszeg${o.keves ? ' figyelem' : ''}" id="kulcs-osszeg-${ki}">${esc(o.szoveg)}</p>
        <div class="kulcs-beallitas">
          ${sorrendes ? `<label>Rossz sorrend
            <select data-mezo="b-sorrend" ${cim(ki)}
              title="Relatív: csak a rossz helyre tett lépés veszít pontot. Szigorú: csak az ér pontot, ami pontosan a helyén van.">${opciok(BEALLITAS_OPCIOK.sorrend, b.sorrend)}</select></label>` : ''}
          <label>Szakszóhasználat
            <select data-mezo="b-szakszo" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.szakszo, b.szakszo)}</select></label>
          <label>A részben jó válasz
            <select data-mezo="b-reszpont" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.reszpont, b.reszpont)}</select></label>
          ${k.tipus === 'nyilt_felsorolas' ? `<label>Kulcson kívüli tétel
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
        k.agak = [{ id: 'a1', cim: '1. lehetőség', elemek: k.elemek || [] }];
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
        if (!confirm(`Törlöd a(z) ${k.sorszam || ki + 1}. kérdést a kulcsból?`)) return;
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
        k.agak = [...(k.agak || []), { id: `a${n}`, cim: `${n}. lehetőség`, elemek: [] }];
        break;
      }
      case 'ag-torol':
        if (!confirm(`Törlöd a(z) „${ag.cim}” lehetőséget?`)) return;
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
      return { hiba: 'Még nincs megoldókulcs: kattints a „Megoldókulcs készítése” gombra.' };
    }
    let kulcs;
    try {
      kulcs = kulcsEllenorzes({ kerdesek });
    } catch (e) {
      $('kulcs-reszletek').open = true;
      return { hiba: e.message };
    }

    const nyersHatarok = ponthatarokBeolvas();
    const ponthatarok = ponthatarokEllenorzes(nyersHatarok);
    if ([2, 3, 4, 5].some((j) => ponthatarok[j] !== nyersHatarok[j])) {
      $('kulcs-reszletek').open = true;
      return { hiba: 'A ponthatárok 0 és 100 közötti, növekvő számok legyenek (2-es < 3-as < 4-es < 5-ös).' };
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
        tananyag: tananyag.map((t) => ({ path: t.path, nev: t.nev })),
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
    if (!kulcsAdat) uzenet('kulcs-msg', 'Ehhez a feladathoz nem található kulcs – készítsd el újra.');
  }

  ponthatarokKitolt(ALAP_PONTHATAROK);
  render();

  return { torles, kitolt, beolvas, frissit };
}
