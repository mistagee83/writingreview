// ══════════════════════════════════════════════════════
// Szakmai dolgozat – a feladat-űrlap szakmai része
// Terv: docs/szakmai-mod-terv.md → 2. fázis
//
// A feladatok.html használja:
//   const szakmaiUi = szakmaiUrlap({ user, feladatlapPath: () => fajlPath });
//   szakmaiUi.kitolt(rubrika, tananyagIds, kulcsAdat)   – szerkesztés
//   szakmaiUi.beolvas()   → { hiba } vagy { rubrika, tananyagIds, kulcs, atnezendo }
//   szakmaiUi.torles()
//
// A kulcsot a szerverrel AZONOS függvény ellenőrzi mentés előtt
// (js/szakmai.js – generált, a functions/szakmai.js-ből). Így a tanár
// nem menthet olyan kulcsot, amivel aztán minden beadás hibára futna.
// ══════════════════════════════════════════════════════

import { esc } from './guard.js';
import { uzenet, uzenetTorles, hibaSzoveg, gombVar } from './ui.js';
import { atmeretez, tulNagy, meret } from './kep.js';
import {
  db, storage, functions, httpsCallable,
  collection, getDocs, query, where, serverTimestamp,
  storageRef, uploadBytes
} from './firebase-config.js';
import {
  ALAP_BEALLITAS, ALAP_PONTHATAROK, KERDES_TIPUSOK, KIVONAT_FIGYELMEZTETES_TOKEN,
  kulcsEllenorzes, szoszedetGyujtes, ponthatarokEllenorzes
} from './szakmai.js';

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
    ['nem_szamit', 'Nem számít'],
    ['relativ', 'Relatív (a jó sorrendű részek)'],
    ['pozicio', 'Pozíció (csak ami a helyén van)']
  ],
  szakszo: [
    ['lenyeg', 'Elég a lényeg'],
    ['pontos', 'Pontos szakkifejezés kell']
  ],
  reszpont: [
    ['0', 'nem ér pontot'],
    ['0.5', 'fél pontot ér'],
    ['1', 'teljes pontot ér']
  ],
  kulcson_kivul: [
    ['elfogad', 'A helyes, kulcson kívüli tétel automatikusan jár'],
    ['tanar_dont', 'A kulcson kívüli tételről én döntök']
  ]
};

const TANANYAG_FAJL_MAX = 5;

const $ = (id) => document.getElementById(id);

export function szakmaiUrlap({ user, feladatlapPath }) {
  const tananyagFeldolgozas = httpsCallable(functions, 'tananyagFeldolgozas');
  const kulcsKeszites = httpsCallable(functions, 'kulcsKeszites');
  const probaErtekeles = httpsCallable(functions, 'probaErtekeles');

  // ── ÁLLAPOT ──
  let kerdesek = [];
  // A kulcs eredete: melyik modell vázlata (null = kézzel írt), és mikor.
  // generalva: 'most' = ebben a munkamenetben generált, mentéskor szerveridő.
  let kulcsMeta = { model: null, generalva: null };
  let tananyagok = [];
  let kivalasztott = new Set();
  const probaValaszok = {};

  const kerdesekEl = $('kulcs-kerdesek');
  const tananyagListaEl = $('tananyag-lista');

  // ══════════════════════════════════════════
  // TANANYAGTÁR
  // ══════════════════════════════════════════

  async function tananyagokBetolt() {
    try {
      const [sajat, megosztott] = await Promise.all([
        getDocs(query(collection(db, 'tananyagok'), where('tanar_id', '==', user.uid))),
        getDocs(query(collection(db, 'tananyagok'), where('megosztva', 'array-contains', user.uid)))
      ]);
      const lista = [
        ...sajat.docs.map((d) => ({ id: d.id, ...d.data(), sajat: true })),
        ...megosztott.docs.map((d) => ({ id: d.id, ...d.data(), sajat: false }))
      ];
      lista.sort((a, b) => (b.letrehozva?.toMillis?.() ?? 0) - (a.letrehozva?.toMillis?.() ?? 0));
      tananyagok = lista;
    } catch (e) {
      console.error('Tananyagok betöltése:', e);
      uzenet('tananyag-msg', 'A tananyagtár nem tölthető be: ' + hibaSzoveg(e));
    }
    tananyagRender();
  }

  function tananyagRender() {
    if (tananyagok.length === 0) {
      tananyagListaEl.innerHTML = '<p class="halvany">Még nincs tananyag a tárban.</p>';
    } else {
      tananyagListaEl.innerHTML = tananyagok.map((t) => `
        <div class="tananyag-sor">
          <label class="tananyag-valaszt">
            <input type="checkbox" data-tananyag="${esc(t.id)}" ${kivalasztott.has(t.id) ? 'checked' : ''} />
            <span>${esc(t.cim || 'Tananyag')}</span>
          </label>
          <span class="halvany">${[
            t.tantargy ? esc(t.tantargy) : null,
            t.kivonat_tokenek ? `~${Number(t.kivonat_tokenek).toLocaleString('hu-HU')} token` : null,
            t.sajat ? null : 'megosztva veled'
          ].filter(Boolean).join(' · ')}</span>
          <details class="kivonat-nezet">
            <summary>Mit látott az AI?</summary>
            <div class="kivonat-szoveg">${esc(t.kivonat || '')}</div>
          </details>
        </div>`).join('');
    }
    tananyagFigyelmeztetes();
  }

  function tananyagFigyelmeztetes() {
    const el = $('tananyag-figyelmeztetes');
    const tokenek = tananyagok
      .filter((t) => kivalasztott.has(t.id))
      .reduce((s, t) => s + (Number(t.kivonat_tokenek) || 0), 0);

    if (kivalasztott.size === 0) {
      el.className = 'tananyag-jelzes';
      el.textContent =
        'Tananyag nélkül az AI a saját szakmai tudásából készít kulcsot. Az általános ' +
        'kérdéseknél (pl. a 4P) ez rendben van, de ahol a tankönyv egy adott változatot ' +
        'tanít (pl. egy folyamat szakaszait), a kulcs eltérhet attól, amit tanítottál.';
    } else if (tokenek > KIVONAT_FIGYELMEZTETES_TOKEN) {
      el.className = 'tananyag-jelzes figyelem';
      el.textContent =
        `A kiválasztott tananyag nagy (~${tokenek.toLocaleString('hu-HU')} token). ` +
        'Minden beadás javításánál bekerül az AI-hoz – lassabb és drágább lesz. ' +
        'Ha lehet, csak a dolgozathoz tartozó részt válaszd.';
    } else {
      el.className = 'tananyag-jelzes';
      el.textContent = '';
    }
  }

  tananyagListaEl.addEventListener('change', (e) => {
    const id = e.target.dataset?.tananyag;
    if (!id) return;
    if (e.target.checked) kivalasztott.add(id); else kivalasztott.delete(id);
    tananyagFigyelmeztetes();
  });

  $('btn-tananyag-feltolt').addEventListener('click', async (e) => {
    uzenetTorles('tananyag-msg');
    const fajlok = [...$('tu-fajl').files];
    if (fajlok.length === 0) { uzenet('tananyag-msg', 'Válassz ki legalább egy fájlt.'); return; }
    if (fajlok.length > TANANYAG_FAJL_MAX) {
      uzenet('tananyag-msg', `Egy tananyag legfeljebb ${TANANYAG_FAJL_MAX} fájl lehet.`);
      return;
    }
    const rossz = fajlok.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (rossz) {
      uzenet('tananyag-msg', `„${rossz.name}”: csak PDF vagy kép lehet. A Word/PowerPoint fájlt mentsd PDF-be.`);
      return;
    }

    const vissza = gombVar(e.currentTarget, 'Feltöltés és feldolgozás...');
    try {
      const feltoltott = [];
      for (const [i, eredeti] of fajlok.entries()) {
        const f = await atmeretez(eredeti);
        if (tulNagy(f)) throw new Error(`„${f.name}” túl nagy (${meret(f.size)}), a korlát 10 MB.`);
        const path = `tananyagok/${user.uid}/${Date.now()}_${i}_${f.name}`;
        await uploadBytes(storageRef(storage, path), f);
        feltoltott.push({ path, nev: eredeti.name });
      }

      const { data } = await tananyagFeldolgozas({
        cim: $('tu-cim').value.trim(),
        tantargy: $('sz-tantargy').value.trim(),
        fajlok: feltoltott
      });

      kivalasztott.add(data.id);
      await tananyagokBetolt();
      $('tu-cim').value = '';
      $('tu-fajl').value = '';
      $('tananyag-uj').open = false;
      uzenet('tananyag-msg',
        `„${data.cim}” feldolgozva és kiválasztva. A „Mit látott az AI?” alatt ellenőrizheted.`,
        'success');
    } catch (err) {
      uzenet('tananyag-msg', 'A tananyag feldolgozása nem sikerült: ' + hibaSzoveg(err));
    } finally {
      vissza();
    }
  });

  // ══════════════════════════════════════════
  // KULCS KÉSZÍTÉSE
  // ══════════════════════════════════════════

  function toltes(be, szoveg) {
    $('kulcs-tolt-szoveg').textContent = szoveg || '';
    $('kulcs-tolt').classList.toggle('show', be);
  }

  $('btn-kulcs-keszit').addEventListener('click', async () => {
    uzenetTorles('kulcs-msg');
    const path = feladatlapPath();
    if (!path) {
      uzenet('kulcs-msg', 'A kulcsvázlathoz tölts fel feladatlapot (fent). Kézzel is összeállíthatod: „＋ Kérdés”.');
      return;
    }
    if (kerdesek.length && !confirm('Az új vázlat felülírja a mostani kulcsot. Folytatod?')) return;

    toltes(true, 'Gemini elkészíti a kulcsvázlatot... (fél–egy perc)');
    try {
      const { data } = await kulcsKeszites({
        feladatlapPath: path,
        tananyagIds: [...kivalasztott],
        tantargy: $('sz-tantargy').value.trim()
      });

      kerdesek = data.kulcs.kerdesek;
      kulcsMeta = { model: data.model || null, generalva: 'most' };
      Object.keys(probaValaszok).forEach((k) => delete probaValaszok[k]);

      if (data.cim_javaslat && !$('f-cim').value.trim()) $('f-cim').value = data.cim_javaslat;
      if (data.feladat_leiras && !$('r-leiras').value.trim()) $('r-leiras').value = data.feladat_leiras;
      if (data.tantargy && !$('sz-tantargy').value.trim()) $('sz-tantargy').value = data.tantargy;

      render();
      $('kulcs-badge').style.display = 'inline-flex';

      const reszek = [`${kerdesek.length} kérdés.`];
      const atnez = atnezendoSzam();
      reszek.push(atnez
        ? `${atnez} elemet az AI bizonytalannak jelölt (⚠) – ezeket nézd át.`
        : 'Az AI egyetlen elemet sem jelölt bizonytalannak – azért fusd át.');
      if (data.kihagyott?.length) {
        reszek.push(`Ezekhez a kérdésekhez nem tudott kulcsot adni, pótold kézzel: ${data.kihagyott.join(', ')}.`);
      }
      if (!data.van_tananyag) reszek.push('Tananyag nélkül készült: minden elem az AI általános tudásából jön.');
      uzenet('kulcs-msg', reszek.join(' '), 'success');
    } catch (err) {
      uzenet('kulcs-msg', 'A kulcs elkészítése nem sikerült: ' + hibaSzoveg(err));
    } finally {
      toltes(false);
    }
  });

  // ══════════════════════════════════════════
  // KÉRDÉSKÁRTYÁK
  // ══════════════════════════════════════════

  const osszes = (k) => [...(k.elemek || []), ...(k.agak || []).flatMap((a) => a.elemek)];

  function atnezendoSzam() {
    return kerdesek.reduce((s, k) => s + osszes(k).filter((e) => e.ellenorizendo).length, 0);
  }

  function ujElemId(k, elotag) {
    const foglalt = new Set(osszes(k).map((e) => e.id));
    let n = 1;
    while (foglalt.has(`${elotag}${n}`)) n++;
    return `${elotag}${n}`;
  }

  function ujElem(k, elotag) {
    return {
      id: ujElemId(k, elotag), allitas: '', pont: 1, elfogadhato: [],
      forras: 'tanar', ellenorizendo: false
    };
  }

  function opciok(lista, ertek) {
    return lista.map(([v, c]) =>
      `<option value="${esc(v)}" ${String(ertek) === v ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }

  function elemSor(e, ki, ai, ei, sorrendes) {
    const jelek = [];
    if (e.ellenorizendo) {
      jelek.push(`<button type="button" class="elem-jel atnez" data-akcio="elem-ok" ${cim(ki, ai, ei)}
        title="Az AI bizonytalannak jelölte. Kattints, ha átnézted.">⚠ átnézendő</button>`);
    }
    if (e.forras === 'altalanos') {
      jelek.push(`<span class="elem-jel altalanos" title="Nem a tananyagból, hanem az AI általános tudásából jön – itt térhet el legkönnyebben attól, amit tanítottál.">általános</span>`);
    }
    return `
      <div class="elem-sor${e.ellenorizendo ? ' jelolt' : ''}">
        ${sorrendes ? `<span class="elem-szam">${ei + 1}.</span>` : ''}
        <input type="text" data-mezo="allitas" ${cim(ki, ai, ei)} value="${esc(e.allitas)}"
          placeholder="Amit a diáknak le kell írnia" aria-label="Elem" />
        <input type="text" data-mezo="elfogadhato" ${cim(ki, ai, ei)} value="${esc((e.elfogadhato || []).join('; '))}"
          placeholder="Elfogadható még (; választja el)" aria-label="Elfogadható változatok" />
        <input type="number" data-mezo="pont" ${cim(ki, ai, ei)} value="${esc(e.pont)}"
          min="0" step="0.5" aria-label="Pont" />
        <span class="elem-gombok">
          ${ei > 0 ? `<button type="button" class="btn-sm" data-akcio="elem-fel" ${cim(ki, ai, ei)} title="Feljebb">↑</button>` : ''}
          <button type="button" class="btn-sm danger" data-akcio="elem-torol" ${cim(ki, ai, ei)} title="Törlés">✕</button>
        </span>
        ${jelek.length ? `<div class="elem-jelek">${jelek.join('')}</div>` : ''}
      </div>`;
  }

  function cim(ki, ai = -1, ei = -1) {
    return `data-k="${ki}" data-a="${ai}" data-e="${ei}"`;
  }

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
            ${a.elemek.map((e, ei) => elemSor(e, ki, ai, ei, false)).join('')}
            <button type="button" class="btn-sm" data-akcio="elem-uj" ${cim(ki, ai)}>＋ Elem</button>
          </div>`).join('')}
          <button type="button" class="btn-sm" data-akcio="ag-uj" ${cim(ki)}>＋ Lehetőség</button>`
      : `${(k.elemek || []).map((e, ei) => elemSor(e, ki, -1, ei, sorrendes)).join('')}
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
        <textarea rows="2" data-mezo="szoveg" ${cim(ki)} placeholder="A kérdés szövege">${esc(k.szoveg || '')}</textarea>
        ${k.megjegyzes ? `<p class="kulcs-megjegyzes">⚠ ${esc(k.megjegyzes)}</p>` : ''}
        ${k.tipus === 'nyilt_felsorolas' ? '<p class="halvany">Adj meg minden elfogadható tételt – a diák a max. pontig kap pontot.</p>' : ''}
        ${sorrendes ? '<p class="halvany">Az elemek sorrendje a helyes sorrend (↑ gombbal rendezheted).</p>' : ''}
        <div class="kulcs-elemek">${elemResz}</div>
        <p class="kulcs-osszeg${o.keves ? ' figyelem' : ''}" id="kulcs-osszeg-${ki}">${esc(o.szoveg)}</p>
        <div class="kulcs-beallitas">
          ${sorrendes ? `<label>Sorrend
            <select data-mezo="b-sorrend" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.sorrend, b.sorrend)}</select></label>` : ''}
          <label>Szakszóhasználat
            <select data-mezo="b-szakszo" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.szakszo, b.szakszo)}</select></label>
          <label>A részben jó válasz
            <select data-mezo="b-reszpont" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.reszpont, b.reszpont)}</select></label>
          ${k.tipus === 'nyilt_felsorolas' ? `<label>Kulcson kívüli tétel
            <select data-mezo="b-kulcson_kivul" ${cim(ki)}>${opciok(BEALLITAS_OPCIOK.kulcson_kivul, b.kulcson_kivul)}</select></label>` : ''}
        </div>
      </div>`;
  }

  function render() {
    kerdesekEl.innerHTML = kerdesek.length
      ? kerdesek.map(kartya).join('')
      : '<p class="halvany">Még nincs kérdés. Kérj vázlatot a feladatlapból, vagy add hozzá kézzel.</p>';
    atnezendoFrissit();
    if ($('proba').open) probaRender();
  }

  function atnezendoFrissit() {
    const n = atnezendoSzam();
    const el = $('kulcs-atnezendo');
    el.textContent = n ? `⚠ ${n} elem átnézésre vár` : '';
    el.style.display = n ? 'inline-flex' : 'none';
  }

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

  $('btn-kerdes-uj').addEventListener('click', () => {
    const foglalt = new Set(kerdesek.map((k) => k.sorszam));
    let n = kerdesek.length + 1;
    while (foglalt.has(String(n))) n++;
    const k = {
      sorszam: String(n), szoveg: '', tipus: 'zart_felsorolas', max_pont: 1,
      elemek: [], agak: null, beallitas: { ...ALAP_BEALLITAS }, megjegyzes: ''
    };
    k.elemek.push(ujElem(k, 'e'));
    kerdesek.push(k);
    render();
    kerdesekEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

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
  // ELLENŐRZÉS ÉS BEOLVASÁS
  // ══════════════════════════════════════════

  /** A kulcs a szerkesztőből – a szerverrel azonos ellenőrzéssel. */
  function kulcsEllenorzott() {
    return kulcsEllenorzes({ kerdesek });
  }

  function beolvas() {
    let kulcs;
    try {
      kulcs = kulcsEllenorzott();
    } catch (e) {
      return { hiba: e.message.replace(/^Hibás megoldókulcs: nincs egy kérdés sem\.$/,
        'A szakmai dolgozathoz megoldókulcs kell: kérj vázlatot a feladatlapból, vagy add meg a kérdéseket kézzel.') };
    }

    const nyersHatarok = ponthatarokBeolvas();
    const ponthatarok = ponthatarokEllenorzes(nyersHatarok);
    if ([2, 3, 4, 5].some((j) => ponthatarok[j] !== nyersHatarok[j])) {
      return { hiba: 'A ponthatárok 0 és 100 közötti, növekvő számok legyenek (2-es < 3-as < 4-es < 5-ös).' };
    }

    return {
      rubrika: {
        mod: 'szakmai',
        tantargy: $('sz-tantargy').value.trim().slice(0, 60),
        ponthatarok,
        helyes_valaszok_lathatok: $('sz-helyes-lathato').checked,
        // A NYILVÁNOS rész: a diák látja, hány pontos az egyes kérdés.
        // A kulcs maga külön, csak tanári alkollekcióba megy.
        kerdesek: kulcs.kerdesek.map((k) => ({ sorszam: k.sorszam, max_pont: k.max_pont }))
      },
      tananyagIds: [...kivalasztott],
      kulcs: {
        kerdesek: kulcs.kerdesek,
        szoszedet: szoszedetGyujtes(kulcs),
        model: kulcsMeta.model,
        generalva: kulcsMeta.generalva === 'most' ? serverTimestamp() : (kulcsMeta.generalva || null),
        modositva: serverTimestamp()
      },
      atnezendo: atnezendoSzam()
    };
  }

  // ══════════════════════════════════════════
  // PRÓBAJAVÍTÁS
  // ══════════════════════════════════════════

  function probaRender() {
    const el = $('proba-valaszok');
    el.innerHTML = kerdesek.length
      ? kerdesek.map((k) => `
          <div class="form-group">
            <label class="proba-cimke">${esc(k.sorszam)}. ${esc(k.szoveg || 'kérdés')}</label>
            <textarea rows="2" data-proba="${esc(k.sorszam)}"
              placeholder="Egy diák válasza erre a kérdésre">${esc(probaValaszok[k.sorszam] || '')}</textarea>
          </div>`).join('')
      : '<p class="halvany">Előbb állítsd össze a kulcsot.</p>';
  }

  $('proba').addEventListener('toggle', () => { if ($('proba').open) probaRender(); });

  $('proba-valaszok').addEventListener('input', (e) => {
    const s = e.target.dataset?.proba;
    if (s !== undefined) probaValaszok[s] = e.target.value;
  });

  $('btn-proba').addEventListener('click', async (e) => {
    uzenetTorles('proba-msg');
    $('proba-eredmeny').innerHTML = '';
    let kulcs;
    try {
      kulcs = kulcsEllenorzott();
    } catch (err) {
      uzenet('proba-msg', err.message);
      return;
    }
    const valaszok = Object.fromEntries(
      kulcs.kerdesek.map((k) => [k.sorszam, (probaValaszok[k.sorszam] || '').trim()]).filter(([, v]) => v)
    );
    if (Object.keys(valaszok).length === 0) {
      uzenet('proba-msg', 'Írj be legalább egy kérdésre mintaválaszt.');
      return;
    }

    const vissza = gombVar(e.currentTarget, 'AI pontoz...');
    try {
      const { data } = await probaErtekeles({
        kulcs: { kerdesek: kulcs.kerdesek },
        valaszok,
        cim: $('f-cim').value.trim(),
        tantargy: $('sz-tantargy').value.trim(),
        tananyagIds: [...kivalasztott],
        ponthatarok: ponthatarokEllenorzes(ponthatarokBeolvas())
      });
      probaEredmeny(kulcs, data);
    } catch (err) {
      uzenet('proba-msg', 'A próbajavítás nem sikerült: ' + hibaSzoveg(err));
    } finally {
      vissza();
    }
  });

  const STATUSZ_JEL = {
    megvan: ['✓', 'megvan', 'jó'],
    reszben: ['½', 'reszben', 'részben'],
    hianyzik: ['✗', 'hianyzik', 'hiányzik'],
    teves: ['✗', 'teves', 'téves']
  };

  function probaEredmeny(kulcs, r) {
    const kerdesTerkep = new Map(kulcs.kerdesek.map((k) => [k.sorszam, k]));
    const allitas = (k, id) => [...k.elemek, ...(k.agak || []).flatMap((a) => a.elemek)]
      .find((e) => e.id === id)?.allitas || id;

    $('proba-eredmeny').innerHTML = `
      <div class="proba-osszeg">
        <strong>${esc(r.osszpontszam)} / ${esc(r.max_pontszam)} pont</strong>
        ${r.szazalek != null ? `(${esc(r.szazalek)}%)` : ''}
        ${r.javasolt_jegy ? ` · javasolt jegy: <strong>${esc(r.javasolt_jegy)}</strong>` : ''}
      </div>
      ${r.kerdesek.map((kr) => {
        const k = kerdesTerkep.get(kr.sorszam);
        const ag = kr.valasztott_ag ? k.agak?.find((a) => a.id === kr.valasztott_ag) : null;
        return `
          <div class="proba-kerdes">
            <div class="proba-kerdes-fej">
              <strong>${esc(kr.sorszam)}. kérdés</strong>
              <span>${esc(kr.pont)} / ${esc(kr.max)} pont</span>
            </div>
            ${ag ? `<p class="halvany">Választott: ${esc(ag.cim)}</p>` : ''}
            <ul class="proba-elemek">
              ${kr.elemek.map((e) => {
                const [jel, osztaly, felirat] = STATUSZ_JEL[e.statusz] || STATUSZ_JEL.hianyzik;
                return `<li class="${osztaly}">
                  <span class="proba-jel" title="${esc(felirat)}">${jel}</span>
                  <span>${esc(allitas(k, e.id))}${e.idezet && e.idezet_ok ? ` – <em>„${esc(e.idezet)}”</em>` : ''}
                    ${e.idezet_ok === false ? `<span class="elem-jel atnez" title="Az AI ezt „${esc(e.ai_statusz)}” jelölte, de az idézetét nem találtuk a válaszban – ezért nem jár érte pont.">⚠ idézet nem található</span>` : ''}
                  </span>
                  <span class="proba-pont">${esc(e.pont)}</span>
                </li>`;
              }).join('')}
              ${kr.kulcson_kivul.map((t) => `<li class="${t.elfogadva ? 'megvan' : t.elfogadva === null ? 'reszben' : 'hianyzik'}">
                  <span class="proba-jel">+</span>
                  <span>Kulcson kívül: <em>„${esc(t.idezet)}”</em>
                    – ${t.elfogadva ? 'elfogadva' : t.elfogadva === null ? 'a tanár dönt' : 'nem fogadható el'}${t.megjegyzes ? ` (${esc(t.megjegyzes)})` : ''}</span>
                </li>`).join('')}
            </ul>
            ${kr.visszajelzes ? `<p class="halvany">${esc(kr.visszajelzes)}</p>` : ''}
          </div>`;
      }).join('')}
      <p class="halvany">Ha a pontozás nem az, amit vártál, a kérdés beállításain (sorrend, szakszó,
        részpont) vagy az elemeken állíts, és futtasd újra. A próba semmit nem ment.</p>`;
  }

  // ══════════════════════════════════════════
  // KÜLSŐ FELÜLET
  // ══════════════════════════════════════════

  function torles() {
    kerdesek = [];
    kulcsMeta = { model: null, generalva: null };
    kivalasztott = new Set();
    Object.keys(probaValaszok).forEach((k) => delete probaValaszok[k]);
    $('sz-tantargy').value = '';
    $('sz-helyes-lathato').checked = true;
    ponthatarokKitolt(ALAP_PONTHATAROK);
    $('kulcs-badge').style.display = 'none';
    $('proba').open = false;
    $('proba-eredmeny').innerHTML = '';
    $('tananyag-uj').open = false;
    ['tananyag-msg', 'kulcs-msg', 'proba-msg'].forEach(uzenetTorles);
    render();
    tananyagRender();
  }

  /**
   * Meglévő feladat betöltése (szerkesztés, kiadás).
   * @param {object} rubrika a feladat rubrikája
   * @param {string[]} tananyagIds
   * @param {object|null} kulcsAdat a kulcs/aktualis dokumentum
   */
  function kitolt(rubrika, tananyagIds, kulcsAdat) {
    torles();
    $('sz-tantargy').value = rubrika?.tantargy || '';
    $('sz-helyes-lathato').checked = rubrika?.helyes_valaszok_lathatok !== false;
    ponthatarokKitolt(rubrika?.ponthatarok);
    kivalasztott = new Set(Array.isArray(tananyagIds) ? tananyagIds : []);
    kerdesek = structuredClone(kulcsAdat?.kerdesek || []);
    kulcsMeta = { model: kulcsAdat?.model || null, generalva: kulcsAdat?.generalva || null };
    render();
    tananyagRender();
    if (!kulcsAdat) {
      uzenet('kulcs-msg', 'Ehhez a feladathoz nem található kulcs – állítsd össze újra.');
    }
  }

  ponthatarokKitolt(ALAP_PONTHATAROK);
  render();
  tananyagokBetolt();

  return { torles, kitolt, beolvas };
}
