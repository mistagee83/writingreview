# WritingReview – útmutató a munkához

Kézzel írt dolgozatok AI-val támogatott javítása (diák fényképez → AI átír és értékel →
tanár jóváhagy). Firebase (hosting + Cloud Functions + Firestore), Gemini; kétnyelvű
(magyar/angol) felület.

**Először olvasd el:** [`docs/folytatas.md`](docs/folytatas.md) (állapot, indulás másik
gépen, következő lépések) és szükség esetén a [`docs/mukodesi-leiras.md`](docs/mukodesi-leiras.md)
(működés, AI-promptok, a 13. fejezet a kétnyelvűségről).

Rövid szabályok:

- Magyarul kommunikálj a felhasználóval.
- **Commitot, pusht és deployt csak kérésre végezz** (a deploy éles projektre megy).
- Új felhasználói szöveg: szótári kulcs (`public/js/i18n-hu.js` + `i18n-en.js`), nem beégetett
  szöveg. A `public/js/kifejtos.js` generált fájl – ne szerkeszd kézzel.
- Módosítás után futtasd a teszteket (`node --test tests/<fájl>`; a `rules`/`claim`/`functions`
  teszt Firebase-emulátort igényel) és a `node scripts/build.mjs`-t.
