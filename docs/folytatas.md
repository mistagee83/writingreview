# WritingReview – folytatás másik gépen

*Állapot: 2026-10-05 (pilot + prod élesben, végigpróbálva; CI/CD kész). Ez a jegyzet azt írja le, hol tart a projekt, hogyan lehet másik gépen
folytatni, és mi a következő lépés. A program működéséről a
[`mukodesi-leiras.md`](mukodesi-leiras.md) szól (a 13. fejezet a kétnyelvűségről).*

## 0. Utolsó munkamenet összegzése (2026-10-05) – ha másik gépen folytatod, ezt olvasd először

**Kész és élesben van** (pilot és prod is; a `main` a GitHubon a `976ecd9`-nél és az azt követő
jegyzet-commitnál tart, a prod a `v1.4.0` címkén fut, 2026-10-09 (AI-kvóta)):

- az éles kipróbálás hibái javítva és deployolva: egyéni jegyskála mentése, a feladatleírás (helyzet +
  cikk összefoglalva + teendő, E/2), jegyjavaslat a leveles javításnál, a visszajelzés minden mezője a
  kért nyelven, a diák szövege bekezdésekre tagolva (részletek az 5. pontban);
- a prod ellenőrző lista lezárva (EU-s tárhely, CORS, Firestore-mentés, költségkeret; a számlázás
  egy számlán, lásd 5.);
- **CI/CD kész**: tesztek PR-on és `main`-en; prod-kiadás címkére, kézi jóváhagyással
  ([`ci-cd.md`](ci-cd.md)). A pilot szándékosan kézi deploy (a kollégák éles munkára használják,
  funkcióban nem bővül).

**Másik gépen mire figyelj:**

- A prod kiadása **már nem a saját terminálodról megy**: `git tag vX.Y.Z && git push origin vX.Y.Z`,
  majd a GitHubon (Actions) jóváhagyod. A tesztek a GitHubon futnak (Java 21), helyben nem kell
  emulátor, ha csak kiadsz.
- Helyi emulátoros tesztekhez Java 21 kell (a Java 26 nem jó); lásd 2.
- A `gcloud` és a `firebase` CLI belépését (`hudenagymail@gmail.com`) a másik gépen újra el kell
  végezni. Git Bash-ben a beillesztés **Shift+Insert**, nem Ctrl+V.
- A Claude (MI) a prod éles beavatkozásait (deploy, IAM, titkok olvasása) a munkamenetben nem
  futtathatja; ezeket te végzed a saját terminálodon.

**Következő lépés:** a **D. lépés – kereskedelmi funkciók** (6. pont): érdemes a **tanári
önregisztrációval** kezdeni (a legközvetlenebb akadály a külső tanárok bevonása előtt), visszaélés-
védelemmel (diák nem szerezhet tanári jogot); utána kvóta/csomagok, fizetés, jogi dokumentumok, EU-s
AI-feldolgozás, egyéni domain. **Éles gyerekadat előtt az adatvédelmi kérdéseket tisztázni kell.**
A D. lépés új funkciói a pilotra ne hassanak (a kvóta a környezeti konfigon át, `kvota`).
Nagyobb munka, tervezéssel kezdd: `kornyezetek-terv.md` 5.

## 0/c. AI-használat mérése és admin nézet (2026-10-05) – **pilotra deployolva (14b97eb)**, prodra a `v1.3.0`-val kiment

A kvóta előtti lépés: **mérni kell, mennyibe kerül egy dolgozat**, mert a csomagárak csak mért adatból
számolhatók. Mindkét környezetben fut, korlát nélkül.

- Minden Gemini-hívás tokenszáma az `ai_hasznalat` gyűjteménybe kerül (`functions/ai-hasznalat.js`,
  `aiHasznalatNaplo` az `index.js`-ben); a `geminiHivas()` 4. paramétere a kontextus (tanár, művelet,
  feladat, beadás, mód). Új AI-hívóhelynél a kontextus kötelező (teszt védi: `tests/ai-hasznalat.test.mjs`).
- Új admin oldal: **📈 AI-használat** (`public/ai-hasznalat.html`, callable: `aiHasznalatJelentes`) –
  összesítés, bontások és egy csomagár-**számoló**. Lásd `mukodesi-leiras.md` 4.7.
- **Deploy-hatás:** új Firestore-szabály (`ai_hasznalat`: kliensnek tiltva), módosított függvények, új
  függvény (`aiHasznalatJelentes`), új lap. **Pilot** (a mérésért): `node scripts/deploy.mjs pilot --only
  hosting,functions,firestore:rules`. **Prod:** címkés kiadással. A pilotra 2026-10-05-én kiment (hosting, functions, `firestore:rules`); a prodon addig nem mér, amíg nincs új címkés kiadás. A `gemini-3.7-flash` ára ugyanannyi, mint a 3.8-é (a tulajdonos megerősítése), így nincs ismeretlen árú modell.
- **Az első éles mérés (pilot, 13 dolgozat, 1 rövid levél-feladat):** ~$0,022 / dolgozat (átírás ~$0,012 +
  értékelés ~$0,010; a tanári oldal +8%). A költség nagy része a kimenet+gondolkodás tokenje (átírás:
  ~2900 / hívás egy ~150 szavas levélnél). A kifejtős mód és a többoldalas beadás még nincs mérve.
- **Gondolkodási szint (2026-10-06, kód kész; a PILOTRA deployolva (functions), a PRODRA a `v1.3.0`-val kiment):** az átírás
  (`geminiHivas("atiras")`, leveles és kifejtős egyaránt) `thinkingConfig.thinkingLevel: "low"`-val megy
  (`GONDOLKODAS` az `index.js`-ben; teszt: `tests/gemini.test.mjs`). A 3.8/3.7 Flash alapértelmezése
  `medium`, kikapcsolni nem lehet, a `minimal` csak a Flash-Lite-on érvényes. Az értékelés, rubrika és
  elemzés változatlan. **Deploy:** a pilotra kiment (`node scripts/deploy.mjs pilot --only functions`,
  mind a 14 függvény frissült); a prod címkés kiadással (és ott a mérés is csak ezzel indul). **Utána ellenőrizni:** az átírás pontossága a
  mintadolgozatokon (rosszabb félreolvasás?), és az admin nézeten a „Submission: transcription (photo)”
  átlaga ($0,0119-hez képest). Az értékelés gondolkodásának csökkentése csak összehasonlító mérés után.
- **Offline mérés 4 valódi levélen (2026-10-06, 2 szint × 2 futás):** `low` ~74–82%-kal olcsóbb átírásnál, a
  felismerés nem rosszabb, és hűségesebb a diák hibáihoz (a `medium` csendben javít: „actualy”→„actually”).
  A leveles átírás promptja nem tiltotta az áthúzott szöveget: `low`-nál élő szövegként vagy „[áthúzva: …]”
  jelölővel került az átiratba. **Javítva** (a prompt kihagyatja, jelölő nélkül; a kifejtős promptban már
  megvolt), újramérve: a jelölők és a kihúzott szavak eltűntek. **Ismert maradék:** a `low` a 2. levélen
  mindkét futásban kihagyta a „lazy” szót (egy kihúzott szó mellett). A prompt-javítás és a
  gondolkodási szint **a pilotra deployolva** (2026-10-06, functions, mind a 14); **a prodra a `v1.3.0`-val (2026-10-07) kiment**
  (címkés kiadás kell, és ott a mérés is csak azzal indul).
- **Éles igazolás a pilotban (2026-10-09, 7 új dolgozat a deploy után):** átírás $0,0119 → **$0,0036** / hívás
  (−70%, kimenet+gondolkodás ~2900 → ~700 token), az értékelés változatlan ($0,0102). Dolgozatonként
  ~$0,022 → **~$0,014**; az értékelés most a költség ~74%-a. A tulajdonos szerint az átiratok jók, nem
  lényegesen rosszabbak. A számoló kevert átlagból dolgozik (régi+új), ezért az ajánlott 100 dolgozatos ár
  €8,50 → €7,50; kb. 20–30 új beadás után lesz pontos. **Következő lehetséges lépés:** az értékelés
  gondolkodásának visszavétele – csak pontszám-összehasonlító mérés után (az értékelés megy a diákhoz).
- **Átírás-összehasonlító szkript (offline, meglévő fotókon):** `scripts/atiras-osszehasonlitas.mjs`
  (teszt: `tests/atiras-osszehasonlitas.test.mjs`). Ugyanazokat a fotókat átírja `medium` és `low` szinttel
  (az éles `geminiKeres`-sel, prompttal, sémával; Firebase-t nem érint), kiírja a költséget és a szó-szintű
  eltérést, a „zajt” (a viszonyítás 2. futása) is. **Melyik olvas jobban:** ehhez a fotó mellé `<név>.txt` kell, a
  diák szövegével szó szerint, hibákkal együtt – ilyenkor szintenkénti hibaarányt is számol. A fotók a `tests/dolgozatok/` alá menjenek (gitignore-olt).
  Futtatás: `$env:GEMINI_API_KEY = (firebase functions:secrets:access GEMINI_API_KEY --project pilot)`, majd
  `node scripts/atiras-osszehasonlitas.mjs tests/dolgozatok/levelek`. Az app 1500 px-re kicsinyít feltöltéskor;
  ezt a szkript `sharp`-pal utánozza (`cd tests && npm i --no-save sharp`).
- **AI-kvóta (2026-10-09, a `main`-en; a PRODRA kiment a `v1.4.0` címkével, a pilotban ki van kapcsolva):**
  csak a **prodon** él (`kvota` kapcsoló a `functions/.env.<környezet>`-ben; a pilotban ki van kapcsolva, ott
  semmi nem korlátozódik és semmi nem íródik – teszt védi). Csomagok (`functions/kvota.js`, egy helyen):
  **`ingyenes` 20 egység EGYSZERI** (nem újul meg; az önkiszolgáló tanári regisztráció alapcsomagja),
  **`alap` 150 egység/hó**, **`korlatlan`** (csak az admin adhatja). Terv: alap ~€7/hó; nagyobb csomag
  (500) szándékosan nincs – ha valakinek elfogy a 150, az adat az árazáshoz (egy sor hozzáadás). Egység: beadás
  1, feladatlap-javaslat 1, osztályelemzés 1, kifejtős kulcs 2 (a kulcs költsége nincs mérve). Menete: foglalás
  tranzakcióban a beadás-foglalás ELŐTT (elfogyott keretnél a beadás állapota érintetlen), hibánál és
  „kihagyva”-nál visszaadás. A kód a használatot `tanarok/{uid}/hasznalat/{osszes|ÉÉÉÉ-HH}` alá írja.
  Új szerver-hibakód: `kvota_elfogyott_egyszeri`. **Hiányzik:** fizetés (Stripe; addig az admin állítja a
  csomagot a Felhasználók oldalon), az ingyenes keret elfogyása utáni „fizess” felület, jogi dokumentumok,
  EU-s AI-feldolgozás. **Teszt:** `tests/kvota.test.mjs` (tiszta), `tests/kvota-adatbazis.test.mjs` (emulátor –
  ezt az MI nem tudta futtatni, mert a környezetében az emulátor nem indul el; **futtasd a saját
  terminálodból: `cd tests && npm test`**, Java 21-gyel, lásd 2.).
- Az első mérés: a 10 fős tesztóra a pilotban (valódi dolgozatok). Mérés előtt a pilotot deployolni kell.

## 0/b. Tanári önregisztráció (2026-10-05) – kód kész, **prodra deployolva (v1.1.0)**

A D. lépés első része a `main`-en van (commit `6cd81c9`), a **prodra a `v1.1.0` címkével kiment**
(2026-10-05), a **pilotra nincs deployolva** (ott nincs is rá szükség, a választó rejtve van).
**Eltérés:** a GitHub `prod` environmentjén **nincs „Required reviewers”**, ezért a kiadás
jóváhagyás nélkül ment ki. A `docs/ci-cd.md` szerint kellene (Settings → Environments → prod →
Required reviewers); ezt a tulajdonos állíthatja be.

- Regisztrációs űrlap: „Diák vagyok / Tanár vagyok” választó **csak a prodban** (`tanari_onregisztracio`
  a `config/*.json`-ban). Tanárnál megerősített e-mail kell; a tanári jogot a `tanariRegisztracio`
  Function adja (megerősített e-mail + `tanari_kerelem` + nincs diákmúlt). Részletek:
  `mukodesi-leiras.md` (Szerepek), `kornyezetek-terv.md` 5.0.
- **Deploy-hatás:** a **prod** deployán (címke) a tanári regisztráció **azonnal éles lesz** – kvóta
  nélkül, mert a kvóta még nincs megépítve; ez a tulajdonos döntése (a regisztrációs cím nincs
  reklámozva). A **pilot** deployán a Firestore-szabály és a függvény frissül, de a pilotban a
  választó rejtve van, a függvény pedig elutasít (`onregisztracio_ki`): a pilot viselkedése változatlan.
  A prod deploy **tartalmaz szabályváltozást** is (`firestore:rules`), a függvény új: `tanariRegisztracio`.
- **Prod-teendő a konzolon (a tulajdonosé):** Authentication → Templates → *Email address
  verification*: a levél feladója/szövege/nyelve itt szabható (a kód a felület nyelvét küldi el). Az
  Authentication engedélyezett domainjei között a prod cím már szerepel (B. lépés).
- **Nyitott:** kvóta/próbacsomag (5.1), eldobható e-mail-címek elleni védelem (a megerősítés csak a
  cím birtoklását bizonyítja), iskolai meghívó/domain. A kvótáig a prod nyilvános kiadása nem javasolt.

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

  **Mindkét környezet a 2026-10-02-i kódon fut** (a `main` `e87d500` commitjáig: minden javítás
  deployolva a pilotra és a prodra), és a tulajdonos mindkettőn **végigpróbálta a teljes kört
  magyarul és angolul** (osztály → feladat → beadás fotóval → AI → jóváhagyás → diák nézete): minden jó.
- **CI/CD működik** (GitHub Actions): a `main`-re és a PR-okra lefutnak a tesztek; a prod-kiadás
  verziócímkére, kézi jóváhagyással megy (a `prod` environment védi, a címkék szabálya: Tag `v*`).
  Hitelesítés: Workload Identity Federation a `writerev2` `github-deploy` szolgáltatásfiókjával.
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
| Prod kiadás (CI/CD) | **verziócímkével:** `git tag v1.0.1 && git push origin v1.0.1` → tesztek → **kézi jóváhagyás a GitHubon** (Actions → Review deployments) → deploy a prodra. Lásd [`ci-cd.md`](ci-cd.md). A pilotra nincs automatikus deploy |
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

- **DEPLOY ÁLLAPOT (2026-10-10):** a fejlődés-követés és az osztályelemzés az Alap csomagba (5/f) a **`v1.8.0` címkén a prodra jóváhagyásra vár** (a tulajdonos hagyja jóvá a GitHubon).
  A **színválasztó (B, 5/g) csak a commitban van, NINCS címkézve és deployolva**: a prodon ez egy újabb kiadás (pl. `v1.9.0`). A **pilot a régi kódot futtatja**, ahova szándékosan nem megy semmi, ami
  a csomagokról/fizetésről szól; a pilotra csak a fejlődés-követés kerülhet, a tulajdonos kérésére: `node scripts/deploy.mjs pilot --only hosting,functions:fejlodesLista,functions:fejlodesDiak`
  (a teljes functions-deploy a Stripe-titkokat várná a pilotban is). Pilotban a csomag-megjegyzések és a zárak maguktól nem látszanak (nincs kvóta/fizetés), a színválasztó viszont mindenkinek nyitott.
- **Külső audit 5. kör (tesztek):** a gyenge tesztek javítva; új `storage.test.mjs` (Storage-emulátor az `npm test`-ben) és `callable-jogosultsag.test.mjs`. **A Storage-teszt szabályhézagot talált:** létező fájl felülírása átment a `create` szabályon; a `storage.rules` `create` ágai most `resource == null`-t kérnek. **A Storage-szabály deployolva: pilot és prod is (2026-10-07, `--only storage`).** Részletek: `audit/ellenorzes/kor-5.md`.
- **A tanári regisztráció kézi, és a kereskedelmi verzióban így nem működhet.** Ma mindenki
  **diákként** regisztrál (`index.html`), a tanári szerepet egy **admin** adja meg: a
  Felhasználók oldalon a „Tanárrá” gombbal (`szerepBeallitas`), vagy a `szerep.mjs` szkripttel.
  A kereskedelmi verzióban a tanárnak **önállóan kell tudnia tanárként regisztrálni és
  használatba venni a szolgáltatást** (próba/ingyenes csomag, majd előfizetés), anélkül hogy
  az üzemeltető kézzel állítaná át. Közben **tanári jogot diák nem szerezhet magának**
  (hamisítás, visszaélés a kvótával): ehhez kell visszaélés-védelem (pl. e-mail-megerősítés,
  csomaghoz kötött jogosultság, iskolai meghívó/domain, a szerepet kizárólag a szerver állítsa).
  Ez a **D. lépés** része (6. pont), a kvótával és a fizetéssel együtt tervezendő.
- **Az éles kipróbálás (2026-10-02) során javított hibák** (mind a forrásban, tesztekkel; a
  `main`-en, commitok: `f54b466`, `b99f2e5`, `88cd7a8`, `e87d500`):
  - az **egyéni jegyskála mentése** `undefined` mező (`rubrika.skala.sablon`) miatt elhasalt
    (`tests/skala.test.mjs`);
  - a **feladatleírás** (`feladat_leiras`) három részből áll: helyzet, a feladatlapon szereplő
    szöveg (hirdetés, cikk) **összefoglalva**, teendő. Azonos nyelven az utasítás megfogalmazása
    marad, más nyelvre E/2-ben készül. Olvasmányt nem másol (a „szó szerint add vissza” kérés
    Gemini `RECITATION`-hibát okozott). Leveles: `rubrikaPrompt`, kifejtős: `kulcsKeszitesPrompt`;
  - a leveles **javító nézet jegyjavaslatot** mutat a feladat skáláján (élő, a pontokból);
  - az értékelő prompt **„KIMENET NYELVE”** pontja: a `megjegyzes`, `magyarazat`, `erossegek`,
    `fejlesztendo` és `diak_szoveg` mind a kért nyelven készül (korábban a tanári rész magyar maradt
    angol diákszöveg mellett). Ha a tanári rész nyelvét külön kell választani a diákétól, az új
    beállítás;
  - a diáknak szóló szöveg **bekezdésekre tagolva** megy ki (`bekezdesekre`, `functions/kifejtos.js`):
    a prompt üres sort kér, a szerver mentés előtt tagol. A régi, már mentett értékeléseket nem
    javítja.
  - **Deploy-állapot:** mind az öt javítás deployolva a pilotra és a prodra is.
- **Külső audit, 1. kör (2026-10-06) – javítva a forrásban, DEPLOY MÉG NEM TÖRTÉNT (pilot és prod is a régi kóddal fut):**
  a beadás (`beadasok`) hivatkozásait a kliens írja, és nem volt ellenőrizve. (1) A `kep_paths` idegen Storage-útvonalat
  tartalmazhatott, amit a szerver Admin SDK-val letöltött és átírt; (2) a `tanar_id`/`feladat_id` hamisítható volt (idegen
  tanár hagyhatta jóvá, másik osztály feladatát lehetett használni); lezárt feladatra a szabály nem tiltotta a beadást.
  Javítás: `firestore.rules` (`beadasok` create: feladat–osztály–tanár egyezés, `aktiv`, mezőlista), `functions/index.js`
  (`beadasOsszerendeles`: képutak és összerendelés a letöltés előtt; a jóváhagyás csak a feladat tanárának), tesztek:
  `tests/rules.test.mjs`, `tests/functions.test.mjs`. **Deploy:** `firestore:rules` + `functions`, pilotra és prodra is.
  Nyitott (alacsony): a „diákmúlt” a tanári önregisztrációnál csak a jelenlegi tagságot nézi (`audit/ellenorzes/kor-1.md`).
- **Külső audit, 2. kör, A csomag (2026-10-07) – javítva a forrásban, DEPLOY MÉG NEM TÖRTÉNT (pilot és prod is a régi kóddal fut):**
  (1)+(2) a beadás feldolgozása tranzakciós **foglalással** indul (`beadasFoglalas`, `futas_id`): a duplikált trigger-esemény és a
  tanári dupla kattintás nem indít második futást, az elavult futás nem ír felül újabb állapotot, a 10 percnél régebbi `folyamatban`
  állapot (megszakadt futás) újrafuttatható; (3) a leveles pontozás a tanár rubrikájához kötött (`szempontokTisztitas`: ismert
  kulcsok, a maximum a rubrikából, a pont 0..max), a jóváhagyás a már mentett AI-adatot is ide szorítja; (5) hibás AI-válasznál is
  naplózódik a tokenhasználat; a beadás képeinek összmérete a letöltés előtt korlátozott (14 MB). **Deploy:** csak `functions`,
  pilotra és prodra is. Nyitott: a 2. kör [4] pontja (több beadás ugyanarra a feladatra – determinisztikus beadás-azonosító, kliens
  + szabály + hosting), a prompt injection pilotos kipróbálása, az osztályelemzés adatforrása leveles feladatnál (termékdöntés).
  Lásd `audit/ellenorzes/kor-2.md`.
- **Külső audit, 2. kör, B csomag (2026-10-07) – javítva a forrásban, DEPLOY MÉG NEM TÖRTÉNT (pilot és prod is a régi kóddal fut):**
  a beadás azonosítója kötött: `<feladat_id>_<diak_uid>` (`firestore.rules`, `public/beadas.html`), így egy diák egy feladatra csak
  egyszer adhat be (a második létrehozás elhasal). A régi, véletlen azonosítójú beadások érintetlenek (egy ilyen diák még egy új
  azonosítójú beadást létrehozhat). **Deploy-sorrend: a `firestore:rules` és a `hosting` EGYÜTT megy ki** (a régi, gyorsítótárazott
  kliens véletlen azonosítóval próbálna beadni, amit az új szabály elutasít, amíg a service worker frissül). Pilot: `node scripts/deploy.mjs
  pilot --only hosting,firestore:rules`; prod: címkés kiadás.
- **Külső audit, 3. kör, C csomag (2026-10-07) – javítva a forrásban, DEPLOY MÉG NEM TÖRTÉNT (pilot és prod is a régi kóddal fut):**
  (1) **tárolt XSS**: a tanár által írt `rubrika.min_szo/max_szo` escape nélkül került a diák feladatlistájába (`diak.html`) – most
  `esc()` védi, és a szabály csak számot/`null`-t enged; (+) a **feladatlap URL-je** nem ellenőrzött sémájú volt (`javascript:` a diák
  linkjében) – a kliens csak `https` Storage-URL-t renderel (`public/js/biztonsag.js`), a szabály a `feladatlap` mezőt típusozza (a tanár
  saját `feladatlapok/<uid>/` útja + `firebasestorage.googleapis.com` URL); (5) a feladatlap cseréje szerkesztéskor mostantól mentődik
  (szabály + kliens); (4) feltöltés alatt a képlista zárolt és másolatból dolgozik (nem maradhat ki oldal); (3) a javítóablak
  kérésazonosítót használ (lassú korábbi lekérés nem írja felül az újabbat); (6) a PWA-regisztráció a load után is elindul.
  **Deploy:** `hosting` + `firestore:rules`, pilotra és prodra is (a B csomag deployával együtt javasolt, egy kiadásban).
  Nyitott: a 3. kör [2] (késő AI-kulcs másik feladatlaphoz, tanári űrlap) és [7] (guard-üzenetek, 404 és offline lap kétnyelvűsége);
  opcionális: Content-Security-Policy fejléc (`firebase.json`; inline szkriptek miatt óvatosan). Lásd `audit/ellenorzes/kor-3.md`.
- **Külső audit, 4. kör, D csomag (2026-10-07) – javítva a forrásban; a build/deploy eszközök és a workflow-k változtak, élő rendszer nem érintett:**
  (1) a build a környezetet a `WR_ENV` mellett a Firebase CLI által a predeploy hooknak átadott célprojektből (`GCLOUD_PROJECT`) is
  veszi, és az ellentmondást megtagadja – egy közvetlen `firebase deploy --project prod` sem épülhet pilot konfiggal (és fordítva);
  (2) a konfig fájlja a kért környezethez és a `.firebaserc` szerinti projekthez kötött (a `build.mjs` és a `deploy.mjs` is ellenőrzi:
  egy átmásolt/felcserélt `config/prod.json` nem mehet ki); a `deploy.mjs` elutasítja a `--project/-P/--config/--token/--account`
  kapcsolót és a shell-metakaraktereket tartalmazó paramétert; a workflow-k a Firebase CLI **15.17.0** verzióját telepítik.
  **Teendő a tulajdonosra (prod IAM, a `writerev2` projektben):** a Workload Identity provider feltételét szűkíteni kell a `prod`
  environmentre – a javítás a `docs/ci-cd.md` receptjében van, de a már létező providert át kell állítani:
  `gcloud iam workload-identity-pools providers update-oidc github --project writerev2 --location=global --workload-identity-pool=github
  --attribute-condition="assertion.repository=='mistagee83/writingreview' && assertion.sub=='repo:mistagee83/writingreview:environment:prod'"`
  (az első címkés kiadás igazolja, hogy a deploy továbbra is átmegy; hiba esetén a feltétel visszaállítható). A `prod` GitHub environmentre
  a „Required reviewers” beállítása továbbra is a tulajdonosra vár (v1.1.0 jóváhagyás nélkül ment ki). Nyitott: a régi címke újrafuttatása
  (rollback) szándékos-e; a GitHub Actions action-ök commit SHA-ra rögzítése; a Storage CORS tényleges alkalmazása (`cors.prod.json`).
  Lásd `audit/ellenorzes/kor-4.md`.
- **Munkaszabály** (a `CLAUDE.md`-ben): hibajavításnál mindig meg kell mondani, melyik környezet
  fut még a régi kóddal, és a párhuzamos kódutat (leveles/kifejtős) is meg kell nézni.
- **A prod ellenőrzése kész** (2026-10-05). A teljes kör végig lett próbálva. Ellenőrizve: a
  **Storage-bucket** EU-ban van (`europe-central2`), a **Storage CORS** csak a két prod címet engedi
  (`cors.prod.json`; a pilot `cors.json`-ja `*`), a Firestore-on **pont-időbeli visszaállítás** és
  **törlésvédelem** be van kapcsolva, **napi mentés** fut 14 napos megőrzéssel, a **költségkeret és
  riasztás** beállítva (a tulajdonos állítása, a konzolon).
- **Számlázás:** a prod költségei egy számlán vannak: **„Writing review_commercial”**
  (`01C3E4-FF8451-46A92E`) alatt a `writerev2` (Firebase) és a `gen-lang-client-0529329642`
  („Writing-review”, **ebben van a Gemini API-kulcs**, az AI-hívások költsége ide megy). A pilot
  (`writingreview-41e59`) a „Firebase Payment” számlán van (`01509C-259013-0B3D6E`). A Gemini
  költsége annak a projektnek a számláján jelenik meg, amelyben a kulcs létrejött, nem a
  Firebase-projekten.
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
- **A jegyskála-űrlap és a javító nézet** éles kipróbálása megtörtént (egyéni skála mentése, jegyjavaslat
  a leveles és a kifejtős javításnál).
- **A mentett rubrika-sablonok nem hordozzák a jegyskálát**, és a skála alapértéke (az utoljára
  használt) csak böngészőnként van meg, nem a tanár fiókjához kötve. A GPA-skála nincs.
- **A bemutató (`tura-demo.js`) javító nézete** továbbra is fix 1–5 jegyeket mutat.
- **Éles átkattintás megtörtént** (2026-10-02, pilot és prod, magyar és angol vonal, valódi Gemini-
  híváson). Nyitva: az angol visszajelzés minőségének értékelése nagyobb mintán, nem magyar kézírás.
- A `docs/` PDF-je (`WritingReview_mukodesi_leiras.pdf`) elavult és nincs a repóban.
- A `beadas.hiba` (hibaállapot szövege) technikai, magyar/angol keverék; az AI hibakategóriái
  a javító nézetben nyers kóddal látszanak; a „Névtelen” alapnév magyar adat a profilban.
- A feladat adatában a kódszavak magyarok (`angol`, `esszé`, `5-6. évfolyam`…); a megjelenítés
  fordít. Bővítéskor a kliens és a szerver listáját is át kell írni.

## 5/c. Adatvédelmi előkészítés (2026-10-10)

- **Google Fonts helyi kiszolgálása – kód kész, a `main`-en lesz; deploy még NINCS (pilot: hosting; prod: címkés kiadás).** A Syne és a DM Sans
  változó betűtípusok a `public/css/fonts/`-ban (latin + latin-ext a magyar ő/ű miatt, 6 fájl, ~165 kB), az `@font-face` az `app.css`-ben;
  a lapokból kikerültek a `fonts.googleapis.com` hivatkozások. Teszt: `tests/betutipusok.test.mjs` (nincs külső betűtípus, a fájlok léteznek).
  Az `offline.html` rendszer-betűtípusra esik vissza (offline úgysem tölt be más). **Következő hasonló kérdés:** a Firebase SDK-t a lapok a
  Google CDN-jéről (`www.gstatic.com`) töltik be (`public/js/firebase-config.js`) – ez szintén kiadja a látogató IP-címét; helyi kiszolgálás
  nagyobb, külön feladat (a böngészős modul-importok miatt).
- **Kérdéslista az adatvédelmi jogásznak:** `adatvedelmi-kerdesek.md` (a Gmail-piszkozat ugyanez). Nincs még fiók-/adattörlési funkció és
  megőrzési idő: a jogász válasza alapján kell megépíteni.

## 5/d. Beírt dolgozat (leveles mód) és írás közbeni jelzések (2026-10-10) – kód kész, **még NINCS deployolva**

- A tanár feladatonként állítja (`rubrika.beadasi_mod`: foto | szoveg | mindketto; alap foto, a régi feladatok változatlanok); csak
  fogalmazás-feladatnál. Beírt beadásnál nincs átírás és nincs kép: a diák szövege az átirat, csak az értékelés fut. Két tényjelzés a tanárnak
  (az ablak elhagyása, beillesztés; a beillesztett részek sárgával kiemelve); a diák előre látja őket. Nem MI-detektor, nem bizonyíték.
  Részletek: `mukodesi-leiras.md` 5.2, `adatmodell.md`.
- **Fájlok:** `public/js/iras-jelzes.js` (jelzések), `public/beadas.html` (diák), `public/feladatok.html` (tanári választó), `public/javitas.html`
  (jelzések + kiemelt szöveg), `firestore.rules` (új alakú beadás, `beadasiMod`, `jelzesekOk`), `functions/index.js` (`beadasiMod`,
  `beadasOsszerendeles`, átírás átugrása, prompt-fejléc). Tesztek: `iras-jelzes`, `beirt-beadas` (tiszta), `beirt-beadas-adatbazis` (emulátor),
  `rules` (emulátor; új esetek a beírt beadásra).
- **Deploy-hatás:** új Firestore-szabály (**`firestore:rules` kell**), módosított függvények, új hosting. Pilot: `node scripts/deploy.mjs pilot
  --only hosting,functions,firestore:rules`; prod: címkés kiadás. A régi feladatok és beadások viselkedése nem változik.
- **Jogi kérdés:** a kiskorúak viselkedésének megfigyelése (17. kérdés az `adatvedelmi-kerdesek.md`-ben) – a jogász válaszáig a prodon óvatosan.
- **Nincs meg (tudatosan):** kifejtős (kérdésenkénti) beírt mód; a beírt dolgozat szerkesztése beadás után; a jelzések küszöbeinek állíthatósága.

## 5/e. Stripe-fizetés (2026-10-10) – **a prodon él TESZTMÓDBAN (v1.6.1)**, a tesztfizetés végigment (Checkout → webhook → csomag `alap`)

- Checkout + Customer Portal + webhook; a csomagot a szerver állítja (`ingyenes` ↔ `alap`, havi 150 egység). Csak a prodon, és csak ha a `functions/.env.prod`-ban
  a `FIZETES_AR_ALAP` ki van töltve. Beállítás, kipróbálás és élesítés előtti lista: **`stripe.md`**.
- **Állapot (2026-10-10):** a titkok (teszt) beállítva a prodon, a webhook (`creative-breeze`, `stripeWebhook`, 4 esemény) a Stripe tesztmódjában létrehozva, az `FIZETES_AR_ALAP` a
  teszt `price_...`. Tesztfizetés teszt-kártyával: a csomag `alap`-ra váltott. **Hátra:** az éles módra váltás (éles termék/ár, portál, webhook, `sk_live` és éles `whsec` a prodra,
  az éles `price_...` a `.env.prod`-ba, kiadás, kis összegű próbafizetés visszatérítéssel); a számlázz.hu-bekötés; áfa; jogi dokumentumok; a nagyobb (500-as) csomag.
- **Tanulság a deploynál:** az új titkokhoz a futtató szolgáltatásfióknak (`<projektszám>-compute@developer.gserviceaccount.com`) `roles/secretmanager.secretAccessor` kell az adott titkon,
  és a CI-fióknak (`github-deploy`) nincs joga ezt beállítani: kézzel kell megadni (`gcloud secrets add-iam-policy-binding ...`). Új titok után a függvényeket újra kell deployolni.
- **Deploy-figyelmeztetés:** a három új függvény (`stripeWebhook`, `fizetesIndit`, `fizetesKezeles`) a `STRIPE_SECRET_KEY` és `STRIPE_WEBHOOK_SECRET` titkot várja
  **minden projektben** (a pilotban helyőrző is jó). Titok nélkül a deploy elhasal, ezért a következő kiadás (pilot és prod) ELŐTT be kell állítani őket.
- **Nem kész:** a **számlázz.hu** (NAV-s számla) automatikus kiállítása a befizetésekről; az áfa/Stripe Tax a könyvelői válasz után; a jogi dokumentumok. Ezek nélkül éles fizetés nem indítható.

## 5/f. Fejlődés az idő mentén és csomaghoz kötött funkciók (2026-10-10) – kód kész, **még NINCS deployolva és commitolva**

- **Csomag-szintek (prod; a pilotban nincs kvóta, ott minden funkció mindenkinek elérhető):** Ingyenes = javítás és jóváhagyás egyszeri kerettel; **Alap** = + **osztályszintű
  elemzés** (`feladatElemzes`); **Profi** = + **fejlődés-követés** (Diákok menü). A `korlatlan` mindkettőt kapja. A tábla egy helyen: `functions/kvota.js` → `FUNKCIOK`
  (új csomaghoz kötött funkció = egy sor + egy zár). A zár **szerveroldali** (`funkcioEngedett`, `fejlodesKapu`, `osztalyElemzesKapu` a `functions/index.js`-ben); a felület csak a barátságos kártyát adja
  a szerver hibakódja (`csomag_profi_kell`, `csomag_alap_kell`) alapján. Az ismeretlen csomag/funkció zárt.
- **Fejlődés-követés (Diákok menü, `public/diakok.html`):** osztály kiválasztása → diáklista (jóváhagyott beadások, utolsó eredmény, trend) → diákonként két grafikon
  (pontszázalék-vonal; hibák kategóriánként, halmozott oszlop) + ismétlődő hibatípusok (legalább két feladatban). **A pont a tanár által jóváhagyott** (`ertekeles/tanari.szazalek`,
  csak `statusz: elkuldve`), **a hibák az AI-értékelésből** (`ertekeles/ai.hibak[]`; a tanári oldalon nincs hibalista). Szerver: `functions/fejlodes.js` (tiszta számtan),
  callable-ök: `fejlodesLista`, `fejlodesDiak` (osztály-tulajdonos és `tanar_id` ellenőrzéssel). Grafikon: `public/js/fejlodes-grafikon.js` (dataviz-szabályok, validált paletta,
  tooltip hoverre és fókuszra, összecsukható adattáblázat). Az oldal csak világos módú; a sötét tokenek (`:root[data-theme="dark"] .viz-root`) előkészítve.
- **Osztályszintű elemzés az Alapba került:** az ingyenes tanár `csomag_alap_kell` hibát kap, az `elemzes.html` az „Az Alap csomagtól elérhető” kártyát mutatja. **A korábban,
  ingyenesen generált, mentett elemzések (`feladatok/*/elemzes/osszegzes`) továbbra is olvashatók** (a tanár közvetlenül olvassa a szabályok szerint); újat már nem tud készíteni.
- **Csomag-panel (`tanar.html`):** a csomagok tartalma (kiemelve a tiéd), új „Diákok fejlődése” modul-kártya; a szövegekben nincs beégetett szám vagy ár.
- **Tesztek:** `tests/fejlodes.test.mjs` (emulátor nélkül, hamis Firestore-ral: számtan, zárak, tulajdonos-ellenőrzés, a `feladatElemzes` zárjának sorrendje, szótárak),
  `callable-jogosultsag` (új callable-ök), `i18n`, `fejlec`. Emulátoros teszt ehhez nem készült; a Firestore-lekérdezések (`osztaly_id`/`diak_id` + `statusz`, csak egyenlőség) összetett indexet
  nem igényelnek, de **élesben (a prodon) az első használatkor érdemes megnézni, nem kér-e indexet a konzol.**
- **Nem próbálva böngészőben valódi adattal** (belépés és Firestore kell hozzá): a grafikon kitalált adattal ellenőrizve (asztali és telefonos szélesség), az oldalak maguk nem.
- **Teljesítmény:** a lista beadásonként 2–3 olvasást végez (tanári + AI-értékelés + feladatcím gyorsítótárral). Nagy osztályoknál később érdemes előre számolt összesítőt tárolni.
- **Jogi megjegyzés (fontos):** a fejlődés-követés a diák adatát **hosszabb ideig, több feladaton át** követi és összesíti: ez a megőrzési időt és az adatvédelmi jogász válaszát érinti
  (új, 18. kérdés az `adatvedelmi-kerdesek.md`-ben). A funkció nem épít új adatot (a meglévő jóváhagyott beadásokból számol), de a megőrzési idő/törlés jövőbeli megépítésekor ezt is figyelembe kell venni.
- **Még hátra a leirat szerint:** C) landing oldal (a csomagok tartalma: a fentiek és az 5/g). Osztályszintű, több feladatot átfogó hibaalakulás (a leirat A) pont második fele) még nincs.

## 5/g. Színválasztó a tanári felületen (B, 2026-10-10) – kód kész és commitolva, **még NINCS deployolva**

- **Mit tud:** hat fix, kontraszt-ellenőrzött színtéma (narancs = alap, kék, zöld, lila, bordó, pala). Mindegyikhez tartozik egy vonalas SVG-motívum, ami a fejléc halvány díszeként (csak tanári oldalon, 760 px felett)
  és a választógombokon látszik. A diák felület kék marad (`body.theme-diak`; a téma a `<html data-tema>`-n van, a body saját akcentusa felülírja).
- **Csomag:** az **Alap**tól; a narancsra (alapszín) visszaállás mindenkinek szabad. Zár: `temaBeallitas` callable (`functions/index.js`, `szinvalasztasKapu`, `kvota.FUNKCIOK.szinvalasztas`), hibakód `szinvalasztas_alap_kell`.
- **Tárolás:** `felhasznalok/{uid}.tema` (csak a szerver írja; a szabályok már most tiltják a klienstől: `csakEzekValtoznak([nev, tura_*])`); az alapszín a mező hiánya (törlés). A `guard.js` a profilból állítja be a tanári oldalakon,
  a `localStorage` (`wr_tema`) csak a villanásmentes betöltést adja (`js/tema-korai.js`, blokkoló szkript a tanári oldalak `<head>`-jében).
- **Fájlok:** `functions/tema.js` (névlista), `public/js/tema.js`, `public/js/tema-korai.js`, `public/css/app.css` (paletták, motívumok, választó), `public/tanar.html` (választó panel), `public/js/guard.js`.
  **A névlista négy helyen él** (`functions/tema.js`, `js/tema.js`, `js/tema-korai.js`, a CSS): `tests/tema.test.mjs` az egyezést, a kontrasztot (>= 4,5:1) és a zárat védi. Új téma = mind a négy hely + két szótári név.
- **Ismert apróságok:** aki lemond az előfizetésről, megtartja a már választott színt (nem vonjuk vissza; az alapszínre bármikor visszaállhat). A funkció nem hoz új adatot, csak egy mezőt a profilban.
- **Nem próbálva valódi belépéssel:** a paletták, motívumok és a választó kitalált oldalon ellenőrizve (böngésző), a mentés hamis Firestore-ral tesztelve.
- **Tanulság:** a service worker a fejlesztői előnézetben a régi CSS-t szolgálja ki; ha a stílus nem frissül, a tab service workerét és a gyorsítótárát törölni kell.

## 5/b. BLOKKOLÓ: a Google korhatár-kikötése (2026-10-09)

A Gemini API és a Google Cloud generatív AI feltételei is tiltják, hogy az AI-t olyan alkalmazás részeként használjuk, ami „likely to be
accessed by individuals under 18” – szinttől függetlenül. A diákjaink kiskorúak. **Éles kiskorú használat előtt jogi tisztázás kell**
(részletek, forrás-linkek és kezelési lehetőségek: `kornyezetek-terv.md` 5.2). Az EU-s feldolgozás ettől külön kérdés: a Gemini API-nál nincs
EU-garancia, a Cloud-oldali platformon (a Vertex AI új neve) van EU-végpont.

## 6. Javasolt következő lépések (sorrendben)

1. *(A prod ellenőrző listája lezárva, a költségkeret is.)*
2. **Éles használat figyelése:** a bekezdés-tagolás, az angol vonal visszajelzése valódi
   diákmunkával; a nem magyar kézírás pontossága.
3. ~~**C. lépés – CI/CD**~~ **kész** (2026-10-05): `ci.yml` (tesztek PR-on és `main`-en, emulátorral),
   `prod.yml` (címkére, jóváhagyással, `main`-ről); az első kiadás a `v1.0.0` volt, sikeres. A pilot
   szándékosan kézi deploy marad. Beállítás és kiadás: [`ci-cd.md`](ci-cd.md).
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
