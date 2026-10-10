// A tanári oldalak <head>-jében fut (klasszikus, blokkoló szkript): a megjegyzett témát még az első
// kirajzolás előtt beállítja, hogy ne villanjon fel az alapszín. A névlista a js/tema.js-t tükrözi
// (az alapszín, a narancs, nem tárolódik); a téma igazi forrása a szerver (guard.js).
(function () {
  try {
    var tema = localStorage.getItem("wr_tema");
    if (/^(kek|zold|lila|bordo|pala)$/.test(tema)) document.documentElement.setAttribute("data-tema", tema);
  } catch (e) { /* nincs tárolás: az alapszín marad */ }
})();
