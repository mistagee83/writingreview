# WritingReview – két környezet: pilot (teszt) és kereskedelmi

*Terv, 2026-10-01; **az A. és a B. lépés kész** (lásd 7. A és B), a C. és D. még hátravan. Az állapotról és az indulásról a
[`folytatas.md`](folytatas.md) szól, a működésről a [`mukodesi-leiras.md`](mukodesi-leiras.md).*

## 1. Döntések (a tulajdonos válaszai)

| Kérdés | Döntés |
|---|---|
| Funkciók | A kereskedelmi verzió **többet tud**: a **kvóta és az előfizetés csak ott van**. A pilot nem számláz és nem korlátoz. |
| Célpiac | **Európa.** Egyelőre két nyelv: **angol és magyar** (a felület és az AI-visszajelzés is). |
| Számlázás | A kereskedelmi projekt a **tulajdonos saját számlázási fiókja** alatt fut. |
| Pilot | Marad a mostani projekt (`writingreview-41e59`), **„TESZT” sávval** és magyar alapnyelvvel. A kereskedelmi verzió alapnyelve angol. |
| Munkamód | A cloud-munkamenet nem alkalmas a deployra és a hitelesítésre; a megvalósítás a **saját gépen** folyik (lásd 9.). |

## 2. Az elv: egy kódbázis, két telepítés

- **Egy repo, egy `main` ág.** Nincs hosszú életű külön ág vagy fork: az idővel szétcsúszna, és a hibajavítást kétszer kellene elvégezni.
- **Két Firebase-projekt**: `pilot` (a mostani) és `prod` (új). Külön Auth, Firestore, Storage, Functions, Hosting, titkok és számlázás.
- A két környezet **konfigurációban** tér el (projekt, domain, alapnyelv, kvóta be/ki, „TESZT” sáv), **nem kódágakban**.
- **Nincs adatátköltöztetés.** A pilot felhasználói és adatai a pilotban maradnak; a kereskedelmi verzió üresen indul.
- Az új funkció előbb a pilotra kerül, ott tesztelünk; a jóváhagyott verziót **címkével** (`v1.2.0`) emeljük át a `prod`-ra.

```
 fejlesztés ──► PR ──► main ──► (CI: tesztek) ──► deploy: pilot
                          │
                          └── verziócímke v1.x.y ──► (kézi jóváhagyás) ──► deploy: prod
```

## 3. Mi van ma beégetve a mostani projektre

Ezeket kell környezetfüggővé tenni (a `writingreview-41e59` szöveges keresés alapján):

| Hely | Mi | Teendő |
|---|---|---|
| `public/js/firebase-config.js` (19–21. sor) | web-config: `authDomain`, `projectId`, `storageBucket`, kulcsok | a build a kiválasztott környezet konfigjából írja |
| `.firebaserc` | egyetlen `default` projekt | `pilot` és `prod` alias |
| `functions/index.js` (91–92. sor) | CORS: a két `writingreview-41e59` cím | a projekt azonosítójából és egy domain-listából épüljön |
| `functions/scripts/szerep.mjs` (28. sor) | fix `PROJECT_ID` az admin-kinevezéshez | paraméter vagy környezeti változó |
| `tests/rules.test.mjs` (36. sor), `tests/package.json` (6. sor) | az emulátor projektazonosítója | maradhat (az emulátornak mindegy); nem sürgős |
| `cors.json` | a Storage CORS-szabálya | `prod`-ra külön kell alkalmazni (`gsutil cors set`) |
| Firebase konzol | `GEMINI_API_KEY` secret, Auth szolgáltatók és engedélyezett domainek, Storage, Firestore szabályok és indexek | projektenként külön beállítani |

A funkciók régiója (`europe-west1`) és a `REGION` állandó a két környezetben azonos maradhat.

## 4. A környezeti konfiguráció felépítése

**Kliens (hosting):**
- `config/pilot.json` és `config/prod.json`: web-config (az nem titok), `kornyezet` (`"pilot"`/`"prod"`), alapnyelv, a „TESZT” sáv, kvóta-megjelenítés.
- A `scripts/build.mjs` kap egy környezet-kapcsolót (`--env prod` vagy `WR_ENV`), és a kiválasztott konfigból generálja a `firebase-config.js`-t és egy `kornyezet.js`-t a `dist/`-ben. A `public/` mappa alapból a pilot konfigját tartalmazza, így a helyi előnézet változatlanul működik.
- A „TESZT” sáv és az alapnyelv a `kornyezet.js`-ből jön (a `i18n.js` a böngésző nyelve és a mentett választás után ezt használja tartaléknak).

**Szerver (functions):**
- Firebase-paraméterek és környezetfájlok: `functions/.env.pilot`, `functions/.env.prod` (pl. `KORNYEZET`, `ENGEDELYEZETT_DOMAINEK`, kvóta-beállítások). Titok csak a Secret Managerben van.
- A CORS-címek a `GCLOUD_PROJECT`-ből (`https://<projekt>.web.app`, `.firebaseapp.com`) és az `ENGEDELYEZETT_DOMAINEK` listából (egyéni domain) állnak össze.
- A `KORNYEZET` paraméter kapcsolja a kvóta-ellenőrzést: `pilot`-ban kikapcsolva, `prod`-ban bekapcsolva.

**Deploy:** `firebase deploy --project pilot` / `--project prod`. A hostingnál a build előtt a megfelelő `--env`-vel kell futnia; ezt egy `npm`/shell szkript fogja össze (`deploy:pilot`, `deploy:prod`), hogy ne lehessen elrontani.

## 5. A kereskedelmi verzió extrái (csak `prod`)

### 5.0 Önkiszolgáló tanári regisztráció
- **Ma:** mindenki diákként regisztrál, a tanári szerepet admin állítja kézzel (Felhasználók oldal „Tanárrá” gomb, vagy `szerep.mjs`). A pilotban ez elég, **a kereskedelmi verzióban nem működik**.
- **Cél:** a tanár maga regisztrál tanárként, és azonnal használhatja a szolgáltatást (a csomagja kvótájával), az üzemeltető beavatkozása nélkül.
- **Védelem:** a tanári jogot (és vele az AI-költséget) diák ne szerezhesse meg magának; a szerepet kizárólag a szerver állítsa (callable függvény), megerősített e-mail és/vagy meghívó/iskolai domain/előfizetés alapján. A szerep és a csomag együtt tervezendő az 5.1-gyel.
- Nyitott: a próbaidőszak, az iskolai (több tanáros) fiókok.
- **Megvalósítva (2026-10-05, a `main`-en; még nincs deployolva):** a regisztrációs űrlapon **„Diák vagyok / Tanár vagyok” választó** (a `tanari_onregisztracio` kapcsoló a `config/<env>.json`-ban: prod igen, pilot nem; a szerver ugyanezt a `KORNYEZET`-ből dönti el). Tanári választásnál a profil `tanari_kerelem: true` jelzést kap (csak létrehozáskor írható), **megerősített e-mail kötelező**, és a `tanariRegisztracio` Function (functions/index.js) állítja át a claimet és a tükröt, ha: be van kapcsolva, az Auth-rekordban megerősített az e-mail, van `tanari_kerelem`, és a fiók még nem tagja osztálynak. Tesztek: `tests/functions.test.mjs`, `tests/rules.test.mjs`, `tests/kornyezet.test.mjs`. **Szándékosan nincs benne kvóta/próbacsomag:** amíg a kvóta és a fizetés nincs kész, a regisztrációs cím nem kerül nyilvánosságra (a tulajdonos döntése); a kvótát az 5.1 hozza.

### 5.1 Kvóta és előfizetés
- **Kvóta:** tanáronkénti havi AI-használat (pl. beadások száma), a csomagtól függően. A számlálót a szerver vezeti (tranzakcióban), és **minden AI-hívó függvényben a Gemini-hívás előtt** ellenőrzi; a kliens csak megjeleníti.
- **Csomagok:** a `config`-ban vagy egy Firestore-dokumentumban (pl. `ingyenes`, `alap`, `profi`), kvótával és ponthatárral. A tanár profiljában az aktuális csomag és a hónap használata.
- **Fizetés:** külső szolgáltató (pl. Stripe) webhookkal; a szerver a webhookból állítja a tanár jogosultságát (Firestore-dokumentum vagy custom claim). Az **EU-s áfa-kezelést** (helyi szabályok, számlázás) könyvelővel kell egyeztetni, mielőtt élesedik.
- A pilotban a kvóta ki van kapcsolva, a használat nincs korlátozva (az AI-költség a pilot számláján marad).

### 5.2 Adatvédelem és jog (EU, kiskorúak kézírása megy AI-hoz)
- Adatkezelési tájékoztató és felhasználási feltételek (angolul és magyarul), adatfeldolgozói megállapodás az iskolákkal/tanárokkal.
- **Az AI feldolgozásának helye.** Ma a szerver közvetlenül a Gemini API-t hívja (`generativelanguage.googleapis.com`, API-kulccsal). Az **EU-s feldolgozás garanciájához** valószínűleg regionális végpont (pl. Vertex AI EU-régióban) kell. **Ezt a szolgáltatónál ellenőrizni kell**, mielőtt éles gyerekadat kerül bele.
- **A Google szolgáltatási feltételeinek korhatár-kikötése (2026-10-09, elsődleges forrásból ellenőrizve) – BLOKKOLÓ, jogi értelmezés kell.**
  Mindkét úton szerepel: a **Gemini API** feltételei (<https://ai.google.dev/gemini-api/terms>, „Age Requirements”: nem használható olyan
  weboldal/alkalmazás részeként, ami „directed towards or is likely to be accessed by individuals under the age of 18”), és a **Google Cloud**
  Service Specific Terms generatív AI-szolgáltatásokra (<https://cloud.google.com/terms/service-terms>, „Age Restrictions”: ugyanez, az
  ügyfél „nem engedi az End Usereknek” sem). **Ez nem függ a fizetős/ingyenes szinttől.** A WritingReview diákja kiskorú, és a diák
  tölt fel fotót az appba, ezért a szó szerinti olvasat szerint az app a „likely to be accessed by under 18” körbe esik. Lehetséges kezelés
  (jogász döntse): (a) írásos egyeztetés/kivétel a Google-lel; (b) a diák ne férjen hozzá az apphoz (a tanár tölti fel a fotót) – ez
  a termék lényegén változtat; (c) más szolgáltató (annak feltételeit ugyanígy ellenőrizni); (d) EU-ban üzemeltetett modell.
  **Amíg ez nincs tisztázva, éles kiskorú diák-használatot ne indíts a prodon.**
- **Alternatíva: Claude (Anthropic) – elsődleges forrásból ellenőrizve 2026-10-09.** A korhatár NEM tiltás: az Anthropic Usage Policy engedi a
  kiskorúak által használt, az API-ra épülő terméket, ha a fejlesztő megfelel a „Guidelines for Organizations Serving Minors” útmutatónak
  (<https://support.claude.com/en/articles/9307344>): korhatár/hozzáférés-ellenőrzés a szándékolt felhasználókra, tartalomszűrés, monitorozás,
  adatvédelmi jogszabályok betartása és ennek nyilvános kimondása, tájékoztatás, hogy AI-val van dolguk; Anthropic időnként auditál. A
  Commercial Terms-ben nincs korhatár-kikötés (kiskorú/18 szó nem szerepel). **EU-s feldolgozás:** az Anthropic saját API-ján az `inference_geo`
  csak `global`/`us`, a workspace geo is csak `us` (<https://platform.claude.com/docs/en/manage-claude/data-residency>) → EU csak Amazon
  Bedrock (EU profil) vagy Google Cloud/Vertex (EU régió/multi-régió) útján, partner-áron; ott a platform saját feltételeit (az AWS-ét,
  illetve a Google Cloud generatív AI korhatár-kikötése a harmadik fél modelljére is vonatkozik-e) külön ellenőrizni kell. A kézírás-átírás
  pontosságát és a költséget (Haiku 5.5 $0,10/$0,50, Haiku 4.5 $1/$5, Sonnet 5.5 $2/$10 per 1M token, első fél áron; a Gemini 3.8 Flash $0,75/$3,75)
  a `scripts/atiras-osszehasonlitas.mjs`-hoz hasonló szkripttel kell mérni, mielőtt döntesz.
- **Az AI feldolgozás helye (ellenőrizve):** a Gemini API fizetős szintje nem tanít az adatokon, de „may be stored transiently or cached in
  any country” – EU-garancia nincs. EU-s feldolgozás csak a Cloud-oldali platformon (a Vertex AI-t átnevezték: **Gemini Enterprise Agent
  Platform**) EU-végpontról lehetséges (`aiplatform.eu.rep.googleapis.com`, vagy `europe-west*` régió); a globális végpont nem garantál
  semmit. Modell-támogatás (3.8/3.7 Flash, 3.5 Flash-Lite) a Google modell-oldalán ellenőrizendő a migráció előtt.
- Adatmegőrzés és törlés: meddig marad meg a fotó és az átirat, hogyan törölhet a tanár/diák (GDPR: hozzáférés, törlés).
- Országspecifikus kiegészítések később (a célpiac szűkülésekor).

### 5.3 Üzemeltetés
- **Egyéni domain** a `prod` hostingra; a Firebase Auth engedélyezett domainjei és a CORS-lista frissítése.
- Költségkeret és riasztás a számlázási fiókon (a Gemini-használat miatt), külön a két projektre.
- Naplózás és hibafigyelés (legalább a Cloud Functions hibák riasztása).
- Biztonsági mentés: a Firestore ütemezett exportja `prod`-ra.

## 6. Kiadási folyamat és CI/CD

Ma **nincs CI**, és a cloud-munkamenetből nem lehet deployolni (nincs hitelesítés). A célállapot egy GitHub Actions folyamat:

1. **PR-on:** a teljes tesztsor, az emulátoros tesztekkel együtt (Java 21 és Firebase CLI kell a futtatóra), és `node scripts/build.mjs`.
2. **`main`-re:** automatikus deploy a `pilot`-ra (hosting + functions; a szabályok és indexek, ha változtak).
3. **Verziócímkére** (`v*`): deploy a `prod`-ra **kézi jóváhagyással** (GitHub „environment” védelem).
4. **Hitelesítés:** egy-egy **service account** projektenként (jogosultságok: Firebase Hosting/Functions/Firestore szabályok telepítése), a kulcs a GitHub titkai között, vagy – jobb – Workload Identity Federation. A `firebase login:ci` token már nem ajánlott.
5. A tesztek **emulátoron futnak**, nem éles projekten.

**Adatmodell-változások szabálya:** minden változás **visszafelé kompatibilis** kell legyen a már tárolt adatokkal (ahogy a jegyskálánál: a skála nélküli régi feladat a ponthatárokból magyar 1–5 lesz). A két környezet közti eltérés így sosem okoz adatvesztést.

## 7. Lépések (sorrendben)

### A. Környezeti vezetékezés (kicsi, a működést nem változtatja; pilot változatlan) – **kész, a pilotra még nincs deployolva**

*Megvalósítva:* `config/pilot.json` + `config/prod.json` (a prod web-config üres, a B. lépésben kell kitölteni; addig `--env prod` build és `deploy prod` hibával megáll); `scripts/kornyezet-config.mjs`; `node scripts/build.mjs [--env prod]` (vagy `WR_ENV`); `public/js/kornyezet.js` (a build felülírja a dist-ben; opcionális „TESZT · TEST” sáv – a `teszt_sav` kapcsolóval, ALAPBÓL KI, mert a pilotot a kollégák éles munkára is használják; alapnyelv); `functions/kornyezet.js` + `functions/.env.pilot|.prod` (CORS a projektből és az `ENGEDELYEZETT_DOMAINEK`-ből, `KORNYEZET`, `kvota`); `.firebaserc` `pilot` alias (a `prod` aliast a B. lépésben kell felvenni: `firebase use --add`); `functions/scripts/szerep.mjs --projekt <id>`; `node scripts/deploy.mjs <pilot|prod> [--yes]`; tesztek: `tests/kornyezet.test.mjs`. *Viselkedésváltozás a pilotban:* a nyelvi tartalék (se mentett választás, se hu/en böngésző) magyar lett angol helyett, (a „TESZT” sáv ki van kapcsolva).

- `config/pilot.json`, `config/prod.json`; a build `--env` kapcsolója; a `firebase-config.js` generálása; `kornyezet.js` (alapnyelv, „TESZT” sáv).
- `.firebaserc` alias-ok; `functions/.env.*` és a CORS a projekt-azonosítóból; a `szerep.mjs` paraméteres.
- „TESZT” sáv a pilotban; alapnyelv környezetenként.
- Tesztek: a konfigok érvényessége és a két környezet kulcskészletének egyezése; a CORS-lista képzése; a build mindkét `--env`-re lefut.
- **Kész, ha:** a pilot ugyanúgy működik, mint ma, és `deploy:prod` (még üres projektre) ugyanazt a kódot építi, a prod konfiggal.

### B. A kereskedelmi projekt létrehozása (a saját gépeden, a konzolban) – **kész (2026-10-01)**

*Megvalósítva:* projekt `writerev2` (Blaze, a tulajdonos számlázási fiókja alatt); Firestore `(default)`, **`eur3`** (az első, véletlenül `nam5` adatbázist töröltük és újra létrehoztuk, amíg üres volt); `GEMINI_API_KEY` secret külön kulccsal; web-config a `config/prod.json`-ban; a functions (12 db, `europe-west1`), a szabályok/indexek/Storage-szabály és a hosting deployolva; az első admin kinevezve; a belépés működik. **Hosting-oldal: `writing-review` → <https://writing-review.web.app>** (az alapoldal `writerev2.web.app` azonosítója nem módosítható, ezért külön oldalt vettünk fel; a `firebase.json` hostingja `target: app`, a `.firebaserc` `targets` köti: prod → `writing-review`, pilot → a saját alapoldala). A CORS-ba az új oldal címei a `functions/.env.prod`-ban (`ENGEDELYEZETT_DOMAINEK`); az Authentication engedélyezett domainjei között az új cím felvéve. *Nincs ellenőrizve:* a Storage-bucket helye és CORS-a, a költségkeret/riasztás, az ütemezett mentés, a teljes smoke teszt – lásd `folytatas.md` 5–6.

*Eredeti terv (a lépések):*
1. Új Firebase-projekt, **Blaze** csomag, a saját számlázási fiók hozzákötve; költségkeret és riasztás.
2. **Firestore-hely: jól válaszd meg, utólag nem módosítható** (a pilot `eur3`-at használ; EU célpiacra az is jó, vagy egy konkrét EU-régió). Storage-bucket EU-ban, Functions: `europe-west1`.
3. Auth: e-mail/jelszó és Google bekapcsolása, engedélyezett domainek.
4. `GEMINI_API_KEY` secret beállítása a projektben (külön kulcs, külön kvótával).
5. `node scripts/deploy.mjs prod --yes` (szabályok, indexek, Storage-szabály, functions, hosting); a Storage CORS alkalmazása (`cors.json`).
6. Az első admin kinevezése (`szerep.mjs`, `gcloud auth application-default login` után).
7. **Smoke teszt:** belépés, osztály, feladat, egy beadás végig (magyarul és angolul is), a jegyskála, a diák nézete.

### C. CI/CD
- Tesztek PR-on; automatikus deploy a pilotra; címkés, jóváhagyásos deploy a prodra (6. pont).

### D. Kereskedelmi funkciók
- **Önkiszolgáló tanári regisztráció (5.0)**, kvóta és csomagok (5.1), fizetés és webhook; jogi dokumentumok és az EU-s AI-feldolgozás (5.2); egyéni domain; üzemeltetési háló (5.3).
- Közben nyitva marad: az éles átkattintás angol AI-visszajelzéssel, és a `docs/folytatas.md` többi pontja (fordítási rések, GPA-skála).

## 8. Nyitott kérdések

- **A fizetési szolgáltató** és az áfa/számlázás kezelése (EU).
- **Az EU-s AI-feldolgozás** pontos módja és költsége (Gemini API vs. regionális végpont).
- **A Firestore-hely** a `prod`-ban.
- **Csomagok és árak**: mennyi a kvóta, mi az ingyenes szint, van-e iskolai/csoportos csomag.
- **Márka és domain** a kereskedelmi verzióhoz.
- A pilot **meddig él** a jelenlegi alakban, és mikor emelhetők át onnan a kollégák a kereskedelmi verzióra (ha egyáltalán).

## 9. Munkamód a megvalósításhoz

A cloud-munkamenet alapból **nem képes**: Firebase-hitelesítéssel, deploytal, a konzol beállításaival dolgozni; a gépen futó Java/CLI beállításokat sem őrzi meg. Ezért:

- A megvalósítás a **saját gépen** megy (`git clone`, `npm install` a `functions` és `tests` mappában, **Node 24**, **Java 21**, `npm i -g firebase-tools`, `firebase login`; lásd `folytatas.md` 2–3.).
- Az **A. lépés kódja** és a **C. lépés** (CI) a repóban, PR-okkal készülhet; a **B. lépés** konzolos és számlázás-érzékeny, azt a tulajdonos végzi.
- Ha később mégis cloud-munkamenetben szeretnél dolgozni deployjal, az környezeti titkot igényel (service account kulcs az environment beállításaiban, **soha nem a chatben**).
