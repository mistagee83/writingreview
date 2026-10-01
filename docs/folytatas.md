# WritingReview – folytatás másik gépen

*Állapot: 2026-10-01 este (a két környezet szétválasztásával: pilot + prod; frissítve). Ez a jegyzet azt írja le, hol tart a projekt, hogyan lehet másik gépen
folytatni, és mi a következő lépés. A program működéséről a
[`mukodesi-leiras.md`](mukodesi-leiras.md) szól (a 13. fejezet a kétnyelvűségről).*

## 1. Hol tart most

- **Két telepítés, egy kódbázis** (lásd [`kornyezetek-terv.md`](kornyezetek-terv.md)):

  | | **pilot** (a kollégák használják, éles munkára is) | **prod** (kereskedelmi, még üres) |
  |---|---|---|
  | Firebase-projekt | `writingreview-41e59` | `writerev2` |
  | Cím | <https://writingreview-41e59.web.app> | <https://writing-review.web.app> |
  | `firebase --project` alias | `pilot` (és `default`) | `prod` |
  | Alapnyelv | magyar | angol |
  | Firestore | `(default)`, `eur3` | `(default)`, `eur3` (lásd 5.) |
  | Funkciók | `europe-west1` | `europe-west1` (mind a 12 fent van) |
  | Kvóta/előfizetés | nincs | a kód jelzi (`kvota`), **még nincs megvalósítva** |
  | „TESZT” sáv | nincs (a kollégák éles munkára is használják) | nincs |

  A **pilot éles oldala még a régi kódot futtatja**: az A. lépés (környezeti vezetékezés)
  után nem volt pilot-deploy. Lásd 6. lépés.
- **Kétnyelvű (magyar/angol) felület kész**, a teljes felületre: diák és tanári oldalak,
  kifejtős modulok, bemutató. A szerveroldal is: feladatonként állítható visszajelzés-nyelv
  (`rubrika.kimeneti_nyelv`), kódolt szerverhibák.
- A `main` ág és az `origin/main` megegyezik (GitHub: `mistagee83/writingreview`); az A. és B. lépés
  a `main`-en van. A régi `claude/happy-ritchie-kel1hp` ág már nem hordoz újat.
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
  `firebase login` (a `hudenagymail@gmail.com` fiókkal, ami mindkét projekthez hozzáfér).
- A projektek a `.firebaserc`-ben: aliasok `pilot` (= `default`) és `prod`; a hosting-célok
  (`targets`) kötik, melyik projekt melyik hosting-oldalra deployol (prod → `writing-review`).
- Titkok (Gemini API-kulcs) projektenként a Firebase-ben vannak (`GEMINI_API_KEY` secret, a
  két projektben **külön kulccsal**), repóban nincs. Új gépen nem kell újra beállítani.
- **Emulátoros tesztekhez Java 21** kell (Java 26-tal nem indul). Windowson egy Java 21 JRE-vel
  futtatva: `JAVA_HOME` és `PATH` állítása a futtatás idejére.
- Az admin-kinevezéshez (`szerep.mjs`) `gcloud auth application-default login` is kell.
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
| Deploy | **`node scripts/deploy.mjs pilot [--only ...]`** és **`node scripts/deploy.mjs prod --yes [--only ...]`** (a prod `--yes` nélkül nem megy). Ez köti össze a buildet (`WR_ENV`) és a projektet; sima `firebase deploy` a pilotra menne, de nem a prod konfiggal épülne. Részek: `--only hosting`, `--only functions`, `--only firestore:rules,firestore:indexes,storage` (a szabályok/indexek csak ha változtak) |
| Build adott környezetre | `node scripts/build.mjs [--env prod]` (alapból pilot; a dist-be a `config/<env>.json` kerül) |
| Első admin / szerep kinevezése | `cd functions && node scripts/szerep.mjs email@x.hu tanar admin --projekt <projekt-id>` (előtte `gcloud auth application-default login`; `--projekt` nélkül a **pilot**) |

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

- **A tanári regisztráció kézi, és a kereskedelmi verzióban így nem működhet.** Ma mindenki
  **diákként** regisztrál (`index.html`), a tanári szerepet egy **admin** adja meg: a
  Felhasználók oldalon a „Tanárrá” gombbal (`szerepBeallitas`), vagy a `szerep.mjs` szkripttel.
  A kereskedelmi verzióban a tanárnak **önállóan kell tudnia tanárként regisztrálni és
  használatba venni a szolgáltatást** (próba/ingyenes csomag, majd előfizetés), anélkül hogy
  az üzemeltető kézzel állítaná át. Közben **tanári jogot diák nem szerezhet magának**
  (hamisítás, visszaélés a kvótával): ehhez kell visszaélés-védelem (pl. e-mail-megerősítés,
  csomaghoz kötött jogosultság, iskolai meghívó/domain, a szerepet kizárólag a szerver állítsa).
  Ez a **D. lépés** része (6. pont), a kvótával és a fizetéssel együtt tervezendő.
- **A prod ellenőrzése nincs végigvíve.** A prodon a belépés, az admin fiók és az oldal működik,
  de a teljes kör (osztály → feladat → beadás fotóval → AI → jóváhagyás → diák nézete, magyarul
  és angolul) **nem lett végigpróbálva**, és nem ellenőriztük: a prod **Storage-bucket helyét**
  (utólag nem módosítható, EU legyen!), a **Storage CORS-t** (`cors.json`:
  `gsutil cors set cors.json gs://writerev2.firebasestorage.app`, előtte a címeket nézd meg),
  a **költségkeretet és riasztást**, a Firestore ütemezett mentését.
- **Firestore-hely a prodban:** a projekt először véletlenül az USA-ban (`nam5`) kapta az
  `(default)` adatbázist; azt töröltük és `eur3`-mal újra létrehoztuk, **amíg üres volt**. (Egy
  korábbi, `writerev2` nevű üres adatbázist is töröltünk.) Ha új projektet hozol létre, a
  Firestore és a Storage **helyét** jól válaszd: utólag nem módosítható.
- **Claude (az MI-asszisztens) a prod-deployt nem futtathatja** (az engedély-rendszer megállítja):
  a `node scripts/deploy.mjs prod ...` parancsokat a tulajdonos futtatja a saját terminálján.
  Csak olvasó prod-parancsok (pl. `firebase functions:list --project prod`) mennek.
- **A prod első deployán átmeneti hiba volt** (409 bucket-létrehozás, 500 Cloud Run): az újrafuttatás
  megoldotta, nem a kód hibája. Új projektnél érdemes ezzel számolni.
- **A `firebase-functions` csomag régi** (`^5`): a CLI minden deploynál figyelmeztet. Frissítés
  breaking change-ekkel jár, külön feladat.
- A prod konténerkép-tisztítási szabálya 1 nap (a deploy kérdezte), tehát a régi képek törlődnek.
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

1. **A prod végigpróbálása** (smoke teszt, magyarul és angolul): belépés → osztály → feladat →
   egy beadás végig (fotó → átirat → AI → jóváhagyás → diák nézete), jegyskála. Közben az **5. pont
   ellenőrző listája** (Storage hely és CORS, költségkeret, mentés). Az első Gemini-hívás a prod
   kulcsán éles költséggel jár.
2. **A pilot frissítése az A. lépés kódjával:** `node scripts/deploy.mjs pilot`. **Az első
   pilot-deployt figyeld**: a `firebase.json` hostingja mostantól hosting-célt (`target: app`)
   használ, a pilot a saját alapoldalára kötve (`.firebaserc` `targets`). Ami változik a
   pilotban: a nyelvi tartalék (se mentett nyelv, se hu/en böngésző) magyar lett angol helyett;
   a CORS a projektből áll össze (ugyanaz a lista). A kollégákat ez nem érinti.
3. **C. lépés – CI/CD** (`kornyezetek-terv.md` 6.): PR-on tesztek (emulátorral, Java 21),
   `main`-re automatikus pilot-deploy, verziócímkére prod-deploy kézi jóváhagyással.
4. **D. lépés – kereskedelmi funkciók** (`kornyezetek-terv.md` 5.): **önkiszolgáló tanári
   regisztráció** (a kézi szerepátállítás helyett, lásd 5.), kvóta és csomagok, fizetés,
   jogi dokumentumok, **EU-s AI-feldolgozás** (a Gemini API helyett regionális végpont?),
   egyéni domain. **Éles gyerekadat előtt az adatvédelmi kérdéseket tisztázni kell.**
5. **A jegyskála hátralévő része:** GPA, a rubrika-sablon skálája, a tanári fiókhoz kötött
   alapérték (5. pont); a bemutató javító nézete.
6. **A fennmaradó fordítási rések** (5. pont), az angol visszajelzés minőségének ellenőrzése
   valódi diákmunkával, a nem magyar kézírás pontossága.
7. A működési leírás PDF-jének újragenerálása, ha az átadáshoz kell.

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
