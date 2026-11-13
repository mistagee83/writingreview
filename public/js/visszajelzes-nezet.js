// A diák jóváhagyott visszajelzésének megjelenítése (a diakVisszajelzes függvény "kesz" válaszából).
// Közös: a visszajelzes.html (a diák saját linkje) és az iras.html nyugtája is ezt rajzolja,
// hogy a diák ugyanazt lássa, akár a linkről, akár a feladatlinkről jön vissza.
import { t, datumSzoveg } from './i18n.js';
import { esc } from './esc.js';
import { jegyMegjelenit } from './ui.js';

export const idoSzoveg = (iso) => (iso ? datumSzoveg(new Date(iso)) : '');

export function visszajelzesHtml(a) {
  const v = a.visszajelzes;
  const jegy = v.jegy != null ? esc(jegyMegjelenit(v.jegy, v.jegy_tipus)) : '';
  const tabla = v.szempontok.length ? `
    <div class="panel">
      <div class="panel-header"><h2>${t('vj.pontozas_cim')}</h2></div>
      <div class="panel-body">
        <div class="tabla-gorgeto">
          <table class="tabla eredmeny-tabla">
            <thead><tr><th>${t('beadas.szempont')}</th><th>${t('beadas.pont')}</th><th>${t('vj.megjegyzes')}</th></tr></thead>
            <tbody>${v.szempontok.map((sz) => `
              <tr>
                <td>${esc(sz.cim)}</td>
                <td>${esc(sz.pont ?? '–')} / ${esc(sz.max ?? '–')}</td>
                <td class="megj">${esc(sz.megjegyzes)}</td>
              </tr>`).join('')}</tbody>
            <tfoot><tr>
              <td>${t('vj.osszesen')}</td>
              <td>${t('vj.pont_osszes', { ossz: esc(v.osszpontszam ?? '–'), max: esc(v.max_pontszam ?? '–') })}</td>
              <td>${v.szazalek != null ? `${esc(v.szazalek)}%` : ''}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    </div>` : '';

  return `
    <div class="page-header">
      <h1>${esc(a.cim || t('vj.cim'))}</h1>
      <p>${t('vj.alcim', { becenev: esc(a.becenev), datum: esc(idoSzoveg(a.beadva)) })}</p>
    </div>

    ${jegy ? `
      <div class="jegy-kartya">
        <div class="jegy-label">${t('vj.jegy')}</div>
        <div class="jegy-szam">${jegy}</div>
      </div>` : ''}

    <div class="panel">
      <div class="panel-header"><h2>${t('vj.tanari_cim')}</h2></div>
      <div class="panel-body">
        <div class="visszajelzes-szoveg">${esc(v.szoveg).replace(/\n/g, '<br/>')}</div>
        ${v.jovahagyva ? `<p class="halvany" style="margin-top:1.2rem;">${t('vj.elkuldve', { datum: esc(idoSzoveg(v.jovahagyva)) })}</p>` : ''}
      </div>
    </div>

    ${tabla}

    <div class="panel">
      <div class="panel-header"><h2>${t('vj.szoveged_cim')}</h2></div>
      <div class="panel-body"><pre class="atirat">${esc(a.szoveg)}</pre></div>
    </div>

    <p class="halvany">${t('vj.eddig_el', { datum: esc(idoSzoveg(a.lejar)) })}</p>`;
}
