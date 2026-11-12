# WritingReview – útmutató a munkához

Nyelvtanári levél- és esszéfeladatok AI-val támogatott javítása. A `main` (prod) célja: a tanár
24 órás feladatlinket indít → a diák becenévvel, fiók nélkül beírja a szöveget → a tanár indítja az
AI-értékelést → jóváhagy, és a diák a saját linkjén kapja meg (átalakítás folyamatban:
[`docs/prod-atalakitas-terv.md`](docs/prod-atalakitas-terv.md)). A `pilot` ág a régi, kézírásos,
diákfiókos változat. Firebase (hosting + Cloud Functions + Firestore), Gemini; kétnyelvű
(magyar/angol) felület.

**Először olvasd el:** [`docs/folytatas.md`](docs/folytatas.md) (állapot, indulás másik
gépen, következő lépések) és szükség esetén a [`docs/mukodesi-leiras.md`](docs/mukodesi-leiras.md)
(működés, AI-promptok, a 13. fejezet a kétnyelvűségről).

Rövid szabályok:

- Magyarul kommunikálj a felhasználóval.
- Magyar felületi szövegnél kövesd a [`docs/magyar-szovegek.md`](docs/magyar-szovegek.md)
  hangnemét és szójegyzékét új szöveg írásakor és meglévő szöveg átnézésekor is.
- **Commitot, pusht és deployt csak kérésre végezz** (a deploy éles projektre megy).
- Új felhasználói szöveg: szótári kulcs (`public/js/i18n-hu.js` + `i18n-en.js`), nem beégetett
  szöveg. A `public/js/skala.js` generált fájl (forrása `functions/skala.js`) – ne szerkeszd kézzel.
- Módosítás után futtasd a teszteket (`node --test tests/<fájl>`; a `rules`/`claim`/`functions`
  teszt Firebase-emulátort igényel) és a `node scripts/build.mjs`-t.
- **Két telepítés, két ág (2026-11-12 óta):** a **pilot** a `pilot` ágon él (a teljes, régi
  alkalmazás: kézírás, kifejtős mód, diákfiók; kézi deploy), a **prod** a `main`-en (nyelvtanári,
  diákfiók nélküli változat, lásd [`docs/prod-atalakitas-terv.md`](docs/prod-atalakitas-terv.md);
  címkés kiadás). A `scripts/deploy.mjs` rossz ágról nem enged deployt. Új funkció csak a saját
  ágára kerül. Ha **közös részben** javítasz hibát, nézd meg, hogy a másik ágon is megvan-e; ha
  igen, ott is javítani kell (cherry-pick vagy külön javítás). A végén mondd ki, melyik ágon és
  melyik környezetben fut még a régi kód, és a `docs/folytatas.md` „Ismert hiányosságok”
  részébe írd fel, hol kell még javítani vagy deployolni (a deployt a felhasználó
  engedélyével/kérésére végezd, lásd fent). A javításhoz kerüljön regressziós teszt.
- **Párhuzamos kódutak:** ha a hiba a másik úton is meglehet (pl. leveles és kifejtős
  feladat, diák/tanári oldal), nézd meg ott is, javítsd a közös részen, és az összegzésben
  mondd ki, mit ellenőriztél.
