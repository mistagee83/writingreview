// ══════════════════════════════════════════════════════
// WritingReview – kép beillesztése a vágólapról (Ctrl+V)
//
// A feladat űrlapján a feladatlapot és a tananyagot nemcsak kiválasztani vagy
// ide húzni lehet, hanem beilleszteni is (pl. képernyőkép). A beillesztett
// fájl UGYANAZT az utat járja, mint a kiválasztott: a fájlmező `change`
// eseményét váltjuk ki, így a méretezés, a feltöltés és az AI-elemzés
// egyetlen helyen van (feladatok.html, kifejtos-urlap.js).
//
// A döntési logika tiszta függvény, hogy Node-ban tesztelhető legyen
// (tests/beillesztes.test.mjs).
// ══════════════════════════════════════════════════════

const KEP_KITERJESZTES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

const elfogadott = (f) => f && (String(f.type).startsWith("image/") || f.type === "application/pdf");

/**
 * A vágólap képei és PDF-jei. Sima szövegnél üres (a böngésző szokásos
 * beillesztése marad). A `files` és az `items` ugyanazt a fájlt is adhatja
 * (böngészőtől függően): a kettőt összevonjuk, ismétlődés nélkül.
 * @param {DataTransfer|object|null} vagolap
 * @returns {File[]}
 */
export function fajlokVagolapbol(vagolap) {
  const ki = [];
  const lat = (f) => ki.some((x) => x === f || (x.size === f.size && x.type === f.type && x.lastModified === f.lastModified));
  for (const f of Array.from(vagolap?.files || [])) if (elfogadott(f) && !lat(f)) ki.push(f);
  for (const it of Array.from(vagolap?.items || [])) {
    if (it.kind !== "file") continue;
    const f = it.getAsFile?.();
    if (elfogadott(f) && !lat(f)) ki.push(f);
  }
  return ki;
}

/**
 * A beillesztett kép neve: a vágólap minden képét "image.png"-nak hívja, ami a
 * listában megkülönböztethetetlen lenne. Nyelvfüggetlen, időbélyeges név.
 */
export function beillesztettNev(fajl, most = new Date(), sorszam = 0) {
  const kit = KEP_KITERJESZTES[fajl.type] || (fajl.type === "application/pdf" ? "pdf" : "png");
  const ido = [most.getHours(), most.getMinutes(), most.getSeconds()].map((n) => String(n).padStart(2, "0")).join("");
  return `pasted-${ido}${sorszam ? `-${sorszam}` : ""}.${kit}`;
}

/**
 * Hová kerüljön a beillesztett fájl?
 *  - ha a tanár egy zónát már használt (föléje ért, rákattintott, fókuszba
 *    került), akkor oda; a tananyag-zóna csak kifejtős módban létezik;
 *  - különben: kifejtősnél, ha a feladatlap már megvan, a tananyaghoz
 *    (az hozzáad, nem ír felül); egyébként a feladatlaphoz.
 * `csere`: a feladatlap már megvan, és a beillesztés lecserélné – ezt meg kell
 * erősíttetni (a csere új AI-elemzést indít, ami átírja az űrlap mezőit).
 *
 * @param {{aktiv: ('feladatlap'|'tananyag'|null), kifejtos: boolean, vanFeladatlap: boolean}} p
 * @returns {{cel: 'feladatlap'|'tananyag', csere: boolean}}
 */
export function celValasztas({ aktiv, kifejtos, vanFeladatlap }) {
  let cel;
  if (aktiv === "tananyag" && kifejtos) cel = "tananyag";
  else if (aktiv === "feladatlap") cel = "feladatlap";
  else cel = kifejtos && vanFeladatlap ? "tananyag" : "feladatlap";
  return { cel, csere: cel === "feladatlap" && vanFeladatlap };
}

/** A fájlok betétele a fájlmezőbe és a `change` kiváltása (mint egy tallózásnál). */
export function fajlokBeadasa(mezo, fajlok) {
  const lista = new DataTransfer();
  for (const f of fajlok) lista.items.add(f);
  mezo.files = lista.files;
  mezo.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * A Ctrl+V bekötése az űrlapra.
 * @param {object} o
 * @param {HTMLElement} o.feladatlapZona  a feladatlap feltöltő zónája
 * @param {HTMLElement} o.tananyagZona    a tananyag zónája (kifejtős módban látszik)
 * @param {HTMLInputElement} o.feladatlapMezo
 * @param {HTMLInputElement} o.tananyagMezo
 * @param {() => boolean} o.kifejtos      kifejtős módban vagyunk-e
 * @param {() => boolean} o.vanFeladatlap már van-e feltöltött feladatlap
 * @param {() => boolean} o.csereMehet    megerősítés a csere előtt (confirm)
 */
export function beillesztesBekotes(o) {
  let aktiv = null;
  const lathato = (el) => el.getClientRects().length > 0;
  for (const [zona, nev] of [[o.feladatlapZona, "feladatlap"], [o.tananyagZona, "tananyag"]]) {
    for (const esemeny of ["pointerenter", "pointerdown", "focusin"]) {
      zona.addEventListener(esemeny, () => { aktiv = nev; });
    }
  }

  document.addEventListener("paste", (e) => {
    const fajlok = fajlokVagolapbol(e.clipboardData);
    if (!fajlok.length) return;                       // sima szöveg: a böngésző dolga
    if (!lathato(o.feladatlapZona) && !lathato(o.tananyagZona)) return;   // az űrlap zárva

    const { cel, csere } = celValasztas({
      aktiv: aktiv && lathato(aktiv === "feladatlap" ? o.feladatlapZona : o.tananyagZona) ? aktiv : null,
      kifejtos: o.kifejtos(),
      vanFeladatlap: o.vanFeladatlap()
    });
    e.preventDefault();
    if (csere && !o.csereMehet()) return;

    const most = new Date();
    const nevezett = fajlok.map((f, i) => new File([f], beillesztettNev(f, most, i), { type: f.type }));
    // a feladatlapból egy van; a tananyag többet is elvisel
    const kuld = cel === "feladatlap" ? nevezett.slice(0, 1) : nevezett;
    fajlokBeadasa(cel === "feladatlap" ? o.feladatlapMezo : o.tananyagMezo, kuld);   // a lista/előnézet mutatja
  });
}
