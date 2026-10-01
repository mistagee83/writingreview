# WritingReview – folytatás másik gépen

*Állapot: 2026-10-01 (a jegyskála-munkával frissítve). Ez a jegyzet azt írja le, hol tart a projekt, hogyan lehet másik gépen
folytatni, és mi a következő lépés. A program működéséről a
[`mukodesi-leiras.md`](mukodesi-leiras.md) szól (a 13. fejezet a kétnyelvűségről).*

## 1. Hol tart most

- **Éles, deployolva** (2026-10-01): <https://writingreview-41e59.web.app>, Firebase-projekt:
  `writingreview-41e59`, funkciók régiója: `europe-west1`.
- **Kétnyelvű (magyar/angol) felület kész**, a teljes felületre: diák és tanári oldalak,
  kifejtős modulok, bemutató. A szerveroldal is: feladatonként állítható visszajelzés-nyelv
  (`rubrika.kimeneti_nyelv`), kódolt szerverhibák.
- A `main` ág és az `origin/main` megegyezik (GitHub: `mistagee83/writingreview`).
- **Cél:** nemzetközi piac, elsősorban nyelvtanároknak; a mostani (magyar, pilot) verzió
  megmarad kollégákkal való teszteléshez. Konkrét célország még nincs.

## 2. Másik gépen indulás

```bash
git clone https://github.com/mistagee83/writingreview.git
cd writingreview
(cd functions && npm install)
(cd tests && npm install)
```

- **Node 24** kell (a `functions` ezt írja elő). Firebase CLI: `npm i -g firebase-tools`, majd
  `firebase login`.
- A projekt azonosítója a `.firebaserc`-ben van (`default` → `writingreview-41e59`).
- Titkok (Gemini API-kulcs) a Firebase-ben vannak (`GEMINI_API_KEY` secret), repóban nincs.
- **Nem része a repónak** (szándékosan): `dist/` (a build generálja), `tests/dolgozatok/`
  (valódi diákmunkák, szerzői anyag), `node_modules/`. Ha a mintadolgozatokra szükség van,
  azokat kézzel kell átvinni.
- Helyi előnézet: `.claude/launch.json` – `writingreview` (a `public/` mappa, 5500-as port) és
  `writingreview-dist` (a `dist/`, 5501). **Figyelem:** a helyi szerver és a service worker
  gyorsítótárazza a fájlokat; régi tartalom látszhat. Ilyenkor a böngészőben a service
  workert és a gyorsítótárat törölni kell (vagy privát ablak).

## 3. Mindennapi parancsok

| mit | hogyan |
|---|---|
| Tesztek (emulátor nélkül) | `for f in tests/*.test.mjs; do node --test $f; done` – a `rules`, `claim`, `functions` tesztet kihagyva |
| Tesztek emulátorral | `cd tests && npm test` (Firestore-emulátor, **Java** kell – lásd 5.) |
| Build | `node scripts/build.mjs` (a `dist/`-et csinálja; a deploy is lefuttatja) |
| A kifejtős kliensmodul újragenerálása | `node scripts/kifejtos-kliens.mjs` (a `public/js/kifejtos.js` GENERÁLT, a `functions/kifejtos.js`-ből; **ne szerkeszd kézzel**) |
| Deploy | `firebase deploy --only hosting,functions` (a szabályok/indexek csak ha változtak: `--only firestore:rules,firestore:indexes,storage`) |
| Első admin / szerep kinevezése | `cd functions && node scripts/szerep.mjs email@x.hu tanar admin` (előtte `gcloud auth application-default login`) |

## 4. Hogyan épül a kétnyelvűség (röviden)

- `public/js/i18n.js` – `t('kulcs', {param})`, `data-i18n*` attribútumok, nyelvválasztó.
  Szótárak: `i18n-hu.js` (forrásnyelv), `i18n-en.js`. **A két szótár kulcskészlete azonos
  kell legyen** (a teszt ellenőrzi).
- Új szöveg: először a magyar szótárba, utána az angolba; a HTML-ben marad a magyar tartalék.
- **A teszt védi a hibákat:** `tests/i18n.test.mjs` – azonos kulcsok és `{helyőrzők}`, nincs
  beégetett magyar szöveg az átalakított lapokban, **minden lap szkriptje szintaktikailag
  érvényes** (ezt azért vettük be, mert egy idézőjel-hiba a `diak.html`-t betölthetetlenné
  tette, és semmi más nem fogta meg).
- Szerver: a hibák `details.kod`-ot hordoznak (`functions/index.js`, `HIBA_SZOVEG`); az AI
  kimenet nyelvét a `kimenet()` adja (`functions/kifejtos.js`); lásd
  `tests/kimenet.test.mjs`.
- Új nyelv felvétele: `mukodesi-leiras.md` 13.4.

## 5. Ismert hiányosságok és figyelmeztetések

- **Emulátoros tesztek:** a másik gépen, ahol a kétnyelvűségi munka folyt, a Firestore-emulátor
  **nem indult el** (`Firestore Emulator has exited with code 1`; gyanú: túl új Java – Java 26).
  **Java 21-gyel elindul**, és a teljes készlet (341 teszt) lefutott a jegyskála-munka után
  (`cd tests && npm test`, most 349 teszt). Ha nálad nem indul, használj Java 17/21-et. Windowson a
  JAVA_HOME/PATH-ot a Temurin 21 mappájára kell állítani a futtatás idejére.
- **A jegy-elküldés** (`visszajelzesJovahagyas`) emulátoros tesztet kapott (`tests/functions.test.mjs`,
  a logika `jovahagyasLogika`-ként kiemelve): skála betöltése, jegy ellenőrzése, tárolás, jogosultság, státusz.
- **A jegyskála-űrlap és a javító nézet éles kipróbálása** még hátravan (belépéssel): a szerkesztőt
  böngészőben, a lap többi részétől elkülönítve próbáltuk ki.
- **A mentett rubrika-sablonok nem hordozzák a jegyskálát**, és a skála alapértéke (az utoljára
  használt) csak böngészőnként van meg, nem a tanár fiókjához kötve. A GPA-skála nincs.
- **A bemutató (`tura-demo.js`) javító nézete** továbbra is fix 1–5 jegyeket mutat.
- **Éles átkattintás nem történt**: belépéssel, valódi Gemini-hívással az angol felület és az
  angol AI-visszajelzés még nincs végigpróbálva. A lapok szkriptjeit csak Node-ban, kitalált
  adatokkal futtattuk.
- A `docs/` PDF-je (`WritingReview_mukodesi_leiras.pdf`) elavult és nincs a repóban.
- A `beadas.hiba` (hibaállapot szövege) technikai, magyar/angol keverék; az AI hibakategóriái
  a javító nézetben nyers kóddal látszanak; a „Névtelen” alapnév magyar adat a profilban.
- A feladat adatában a kódszavak magyarok (`angol`, `esszé`, `5-6. évfolyam`…); a megjelenítés
  fordít. Bővítéskor a kliens és a szerver listáját is át kell írni.

## 6. Javasolt következő lépések (sorrendben)

1. **Éles átkattintás** (15 perc): tanárként belépés → osztály létrehozása → feladat az új
   „A visszajelzés nyelve” mezővel → egy beadás végig (fotó → átirat → AI → jóváhagyás →
   diák nézet). Magyarul és angolul is.
2. ~~Emulátoros tesztek~~ – megoldva (Java 21), lásd 5.
3. **Célpiac eldöntése** – ettől függ a jegyskála, az évfolyam-skála és a jogi környezet.
4. ~~Állítható jegyskála~~ – kész: feladatonként magyar 1–5, A–F, százalék vagy egyéni
   fokozatok (`rubrika.skala`, lásd a működési leírás 4.3 és 7.8). Hátra van: GPA, a rubrika-sablon
   skálája, a tanári fiókhoz kötött alapérték, és az éles kipróbálás (5. pont).
5. **Két környezet**: a mostani Firebase-projekt marad teszt/pilot, új, különálló projekt a
   nemzetközi éles verziónak (`firebase use` aliasok; külön adatbázis, felhasználók,
   számlázás). Egy kódbázis, két telepítés.
   **A terv: [`kornyezetek-terv.md`](kornyezetek-terv.md)** (döntések, lépések A–D). Az **A. lépés kódja kész** (a pilotra még nincs deployolva); következő a B. (új projekt a konzolban – a tulajdonos).
6. **Adatvédelem** (kiskorúak kézírásmintái mennek AI-hoz): adatkezelési tájékoztató,
   adatfeldolgozói megállapodás, **EU-s feldolgozási régió** a modellhez, országspecifikus
   szabályok (GDPR; USA-ban FERPA/COPPA).
7. **Fizetés és használati limit**: előfizetés, csomagok, tanáronkénti AI-kvóta (a program
   jelenleg nem tartalmaz ilyet; az AI-költség a saját számlán van).
8. **A fennmaradó fordítási rések** (5. pont), majd az angol visszajelzés minőségének
   ellenőrzése valódi diákmunkával, és a nem magyar kézírás pontossága.
9. A működési leírás PDF-jének újragenerálása, ha az átadáshoz kell.

## 7. Munkamódszer, amit érdemes megtartani

- **Commitot és deployt csak kérésre**; a deploy előtt egyeztetés (éles projekt, a kollégák
  használják).
- Nagyobb módosítás után: **az összes teszt, a `node scripts/build.mjs`**, és ha a felületet
  érinti, **a lap futtatása Node-ban kitalált adatokkal vagy böngészőben** – a szintaxis- és
  kulcsteszt nem fog meg mindent (pl. rossz idézőjelezés egy sztringben, hibás sablon).
- Python-szkriptekkel végzett tömeges szövegcsere esetén vigyázz a `\b` jelre: sima
  sztringben visszatérő karakterré (backspace) alakul – reguláris kifejezéseknél nyers
  sztringet (`r"..."`) használj.
- A repo CRLF/LF vegyes; a Git figyelmeztet, de ez ártalmatlan.
