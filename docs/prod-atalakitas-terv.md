# A prod átalakítása – nyelvtanári, diákfiók nélküli változat (terv)

*Készült: 2026-11-12. Állapot: terv, kód még nem változott. A prod (`writerev2`) a régi kódon fut, amíg a lenti lépések
el nem készülnek és a tulajdonos ki nem adja őket. A pilot (`writingreview-41e59`) marad a mostani formájában.*

## 1. A cél egy mondatban

A prod csak nyelvtanároknak szól (levél és esszé). Diák nem regisztrál: a tanár feladatonként **24 óráig élő linket**
indít (megosztási oldal, QR-kód, kivetítés). A diák ezen a linken, **becenévvel** írja meg és adja be a szöveget, és
egy **saját diáklinken** kapja vissza a tanár által jóváhagyott értékelést.

## 2. A rögzített döntések (2026-11-12)

| Kérdés | Döntés |
|---|---|
| Kinek szól | Csak nyelvtanároknak: leveles és esszé-feladat. A kifejtős (dolgozatos) ág kikerül a prodból. |
| Diákfiók | Nincs. Diákregisztráció, diákbelépés, osztály és osztálykód kikerül. |
| Kézírás | Nincs. Fotós beadás, átírás és a beadási képek tárolása kikerül. |
| Pilot | Saját **`pilot` git-ágra** kerül, kézi deployjal (mint eddig). A `main` lesz az új prod. |
| MI indítása | **A tanár indítja** a fiókjából. A diákoldal sosem hív MI-t, a diák csak jóváhagyott szöveget lát (a Google korhatár-kikötése miatt: lásd 9.). |
| Visszajelzés | Beadáskor a diák **saját, titkos diáklinket** kap (javaslat: 14 napig él). A feladat linkje ettől függetlenül 24 óra után lezárul. |
| Csalásellenőrzés | Marad, és erősödik: ablakelhagyás-jelzés (mint most) + **a beillesztés tiltása**. |
| Meglévő prod-adatok | Nincs megtartandó adat: a régi prod-adatok törölhetők. |
| Edtech hub | Most nem foglalkozunk vele, később kötjük be. |

## 3. A folyamat

1. **Tanár:** létrehozza a feladatot (feladatleírás, szempontok/rubrika, szószám, nyelv). Ez a mostani leveles
   feladatűrlap, a kifejtős és a fotós lehetőség nélkül.
2. **Tanár: „Link indítása”.** Létrejön egy véletlen, kitalálhatatlan link, 24 órás lejárattal. A megosztási oldalon:
   a link másolható, nagy QR-kód, kivetíthető feladatleírás (a mostani kivetítés megmarad), visszaszámláló, élő
   beadásszámláló, és egy „Link lezárása most” gomb.
3. **Diák:** megnyitja a linket. Látja a feladatleírást, megad egy becenevet (linkenként egyedi), és megírja a szöveget.
   A piszkozat a böngészőjében mentődik, így egy véletlen frissítés nem veszi el.
4. **Diák: beadás.** A szöveg a jelzésekkel együtt mentődik, **MI nélkül**. A diák egy nyugtát kap a saját diáklinkjével
   (és egy rövid kóddal). Ezt elmentheti, lefotózhatja, vagy QR-kóddal a telefonjára viheti.
5. **Tanár: „Értékelés indítása”.** A fiókjában egy gombbal értékelteti a beadott szövegeket (vagy csak a kiválasztottakat).
   Az értékelés csak a beadott szövegre és a feladat szempontjaira épül, átírás nincs.
6. **Tanár: jóváhagyás.** Átnézi, átírja és jóváhagyja a visszajelzést, ahogy most.
7. **Diák:** a saját diáklinkjén látja a jóváhagyott visszajelzést, amíg a link él. Utána csak a tanári fiókban érhető el.

## 4. Csalásellenőrzés a diákoldalon

A meglévő `public/js/iras-jelzes.js` adja az alapot (ablakelhagyás, beillesztés-követés, tiszta függvények tesztekkel).

**Marad:**
- az ablak elhagyása: hányszor, mennyi időre, és mikor (a mostani küszöbbel, 2 mp);
- a diák előre látja, mit jelzünk (mint most a `beadas.iras_figyelmeztetes`).

**Új:**
- **Beillesztés tiltása** az írómezőben: `paste`, `drop`, és a `beforeinput` `insertFromPaste` / `insertFromDrop` típusa
  is el van kapva (a mobil billentyűzetek vágólapsávja ezen jön). A tiltott **kísérlet** is jelzés a tanárnak (darabszám,
  időpont).
- A jobb klikkes menü letiltása az írómezőben (a beillesztés menüpont miatt).
- **Hirtelen nagy szövegbetoldás jelzése:** ha egyetlen bevitel sok karaktert tesz be beillesztés nélkül (pl. bővítmény,
  automatikus gépelő, fejlesztői eszközök, diktálás), az jelzés, időponttal. A küszöböt méréssel kell beállítani, mert a
  mobil automatikus javítás is cserél szavakat.
- **Írási idő:** az első leütéstől a beadásig eltelt idő, és az aktív írás ideje.
- **Tanári kapcsoló a feladaton:** a böngésző helyesírás-ellenőrzésének és automatikus javításának tiltása
  (`spellcheck`, `autocorrect`, `autocapitalize`). Nyelvi feladatnál ez valódi segítség lehet a diáknak, ezért a tanár döntse el
  (alapértelmezés: tiltva).

**A tanári felületen:** a mostani „Írás közbeni jelzések” blokk bővül az új jelzésekkel, egy időrendi listával (mikor hagyta el
az ablakot, mikor próbált beilleszteni), és a mostani figyelmeztetéssel: a jelzés tájékoztató, nem bizonyíték, mert a diák
böngészője küldi és kijátszható.

## 5. Adatmodell (vázlat; a részleteket az 5. lépés dönti el)

- `feladatok/{id}`: marad (tanári). Új mezők: `helyesiras_tiltas`. A kifejtős és a fotós mezők kikerülnek.
- **`linkek/{token-hash}`** (új): `feladat_id`, `tanar_id`, `letrehozva`, `lejar` (+24 óra), `lezarva`, `beadas_db`,
  `beadas_max` (visszaélés elleni plafon). A dokumentum azonosítója a token SHA-256 lenyomata, maga a token nincs tárolva.
- **`beadasok/{id}`**: `diak_id`, `osztaly_id`, `diak_nev`, `kep_paths` kikerül; új: `link_id`, `becenev`, `diak_token_hash`,
  `diaklink_lejar`. A `szoveg`, `jelzesek`, `statusz`, értékelés marad.
- A diák **nem fér hozzá közvetlenül a Firestore-hoz.** Minden diákoldali művelet hívható függvényen (callable) megy,
  a token ellenőrzésével: `linkAdatok`, `linkBeadas`, `diakVisszajelzes`. A Firestore-szabály így egyszerű:
  diák-útvonal nincs.
- **Visszaélés ellen:** linkenkénti beadásplafon, becenév-ütközés kizárása, a szöveghossz korlátja (meglévő `SZOVEG_MAX`),
  Firebase App Check a diákoldali függvényeken, és a tanár bármikor lezárhatja a linket. Mivel a beadás nem hív MI-t,
  egy kiszivárgott link nem tud MI-költséget okozni.
- **Megőrzés:** a lejárt linkek és diáklinkek tokenjei érvénytelenek, de a beadás a tanárnál marad. Javaslat: egy időzített
  függvény X hónap után törli a régi beadásokat (az X a tulajdonos döntése, a jogász válaszával összhangban).

## 6. Ami kikerül a prodból (a `main` ágból)

- Kifejtős mód: `functions/kifejtos.js`, `public/js/kifejtos*.js` (a `kifejtos.js` generált: a build-szkriptből is ki kell
  venni), `kulcsKeszites`, a kifejtős feladatelemzés.
- Fotós beadás és átírás: a fotós felület a `beadas.html`-ben, `kep.js`, az átírás az `index.js`-ben, a beadási képek
  Storage-szabálya.
- Diákfiók: diákregisztráció és -belépés (`belepes.html` diák ága), `diak.html`, `diakok.html`, `osztalyok.html`,
  `osztalyLetrehozas`, `osztalyhozCsatlakozas`, `diakEltavolitas`, `diakJelszoVisszaallitas`, a diák szerep a szabályokban.
- Automatikus feldolgozás beadáskor: a `beadasFeldolgozas` (Firestore-trigger) helyére tanári callable kerül.
- **Fejlődés-követés:** diákazonosság nélkül feladatokon átívelő követés nincs. A nyitóoldal a Profi csomagnál ezt
  ígéri (`landing` `fejlodes` pont), ezért **a csomagok tartalmát és az árakat újra kell gondolni.** Az osztályelemzés
  feladatonként (linkenként) megmaradhat.
- A nyitóoldal, a működési leírás és a tájékoztató szövegei, amelyek diákfiókról vagy fotóról szólnak.

A pilot (`pilot` ág) mindebből semmit nem veszít.

## 7. Lépések (egyszerre egy, mindegyik után tesztek és `node scripts/build.mjs`)

A prod a teljes átalakítás végéig a régi kódon fut. Részleges prod-deploy nincs: az első új kiadás a 8. lépés.

1. **Ágak szétválasztása.** `pilot` ág a mai `main`-ről; `scripts/deploy.mjs pilot` csak a `pilot` ágról engedjen deployt, a prod
   csak `main`-ről (címke). CI mindkét ágon. A `CLAUDE.md` „Két telepítés, egy kódbázis” szabálya átíródik: a közös
   hibajavítást át kell vinni a másik ágra is.
2. **Kivezetés.** A 6. pont elemeinek törlése a `main`-ről, a tesztekkel együtt. Utána a tanári felület leveles/esszé feladattal
   működik, beadás még nincs. Három részben:
   - **2a – kifejtős mód: kész (2026-11-12).** A közös rész (jegyskála, jegyjavaslat, bekezdésekre tagolás, a visszajelzés
     nyelve) átkerült a `functions/skala.js`-be, a böngészős példánya a generált `public/js/skala.js` (`scripts/skala-kliens.mjs`).
     Törölve: `functions/kifejtos.js`, `public/js/kifejtos*.js`, a `kulcsKeszites` függvény, a kifejtős ág a beadás-feldolgozásban,
     a jóváhagyásban és az elemzésben, a `feladatok/{id}/kulcs` és a `tananyagok/` szabálya, a kvóta `kulcs` művelete, a kapcsolódó
     szótári szövegek és tesztek. A nyitóoldal négy kifejtős állítása kiigazítva.
     **Maradt (későbbi takarítás):** a kifejtős CSS-blokk az `app.css`-ben (halott kód); az AI-használat oldalon a „Kifejtős”
     típus (a mérés általános, régi adatnál üres); a `mukodesi-leiras.md` kifejtős fejezetei (a 8. lépés írja át).
   - **2b – fotós beadás és átírás: kész (2026-11-12).** A beadás mindig beírt szöveg: a szerver (`beadasOsszerendeles`) és
     a Firestore-szabály csak `forras: "szoveg"`-et fogad el, kép- és átirat-mező nélkül. Törölve: az átírás (modell, tartalék,
     gondolkodási szint, prompt, séma), a képek betöltése, a beadási mód (`beadasi_mod`) és választója a feladat-űrlapon, a fotós
     panel a `beadas.html`-ből, a fotó- és átirat-rész a javító nézetből és a diák visszajelzéséből, a kézírás olvashatósága
     (javítási sor, elemzés), a Storage `beadasok/` útvonala, a pilothoz kötött összehasonlító szkriptek
     (`atiras-osszehasonlitas`, `gemini-osszevetes`; a pilot ágon megvannak), a kapcsolódó szótári szövegek. A bemutató túra a
     javító nézetben most a beírt szöveget és a jelzéseket mutatja. A tanár feladatlap-feltöltése (kép/PDF → rubrika) marad.
     **Közben javítva (a pilotot is érinti):** az AI-használat mérése a futást az értékelési hívásnál számolja (lásd
     `folytatas.md`, Ismert hiányosságok). **Maradt:** a nyitóoldal kézírásról szóló részei (a 8. lépés írja át); a
     `beadas.html` és a diákfiók a 2c-ben megy.
   - **2c – diákfiók, osztályok, fejlődés-követés.** Két részben:
     - **2c-1 – osztályok, fejlődés-követés, diákoldalak: kész (2026-11-12).** A feladat nem kötődik osztályhoz (a szabály
       `osztaly_id`-vel el is utasítja), csak a tanára olvassa. A beadást kliensről senki nem hozhatja létre és a diák nem
       olvassa (a 4. lépés callable-je hozza létre); az összerendelés csak a tanárt ellenőrzi. Törölve: `osztalyLetrehozas`,
       `osztalyhozCsatlakozas`, `diakEltavolitas`, `diakJelszoVisszaallitas`, `fejlodesLista`/`fejlodesDiak` (és
       `functions/fejlodes.js`), az osztálykód-generálás, az `osztalyok`/`kodok`/`tagok`/`osztalyaim` szabálya, a
       `diak.html`, `beadas.html`, `visszajelzes.html`, `osztalyok.html`, `diakok.html`, `fejlodes-grafikon.js`, a menüpontok,
       a kezdőlap osztály-/diák-kártyái, a túra osztályos szakasza (négy helyett három szakasz), a PWA „Dolgozat beadása”
       parancsa, az admin diák-jelszó gombja, kb. 195 szótári szöveg. A `nevModositas` csak a tanár profilját írja.
       A „Kiadás másik osztálynak” helyett **„Másolat készítése”** van a feladatlistán. Az osztályelemzés a beadást veszi
       diáknak (a beadás azonosítója).
       **Maradt (8. lépés):** a csomagok összehasonlító táblázata és a nyitóoldal még a fejlődés-követést hirdeti
       (`kvota.FUNKCIOK.fejlodes`, Profi csomag) – a csomagok tartalmáról a tulajdonos dönt.
     - **2c-2 – a diák szerep: kész (2026-11-12).** A szerep: `tanar`, vagy **`nincs`** (nincs tanári jog; a claimben a szerep
       hiánya, a profil-tükörben kifejezett érték, hogy a `guard.js` észrevegye a jog elvételét). A belépés csak tanárnak szól
       (e-mail + jelszó, elfelejtett jelszó, Google); a regisztráció mindig tanári kérelem (ahol az önregisztráció be van
       kapcsolva). Tanári jog és kérelem nélküli fiók magyarázatot kap a belépő oldalon, nem átirányítást. Törölve: a diák/tanár
       választó, a felhasználónév (`azonosito.js`), a diák-kezdőlap a `guard.js`/`fejlec.js`-ben, a `tanariRegisztracio`
       diákmúlt-ellenőrzése (`mar_diak_hasznalo`). A szerepkezelés (admin oldal, `szerepBeallitas`, `functions/scripts/szerep.mjs`)
       `tanar`/`nincs`-sel dolgozik; az admin oldalon „Tanári jog nélkül” címke és szűrő. A belépő oldal bal paneljének lépései
       az új folyamatot írják le (link, becenév, diáklink).
3. **Link és megosztási oldal (tanár).** `linkek` gyűjtemény, `linkInditas` / `linkLezaras` callable, megosztási oldal QR-kóddal
   (helyben tárolt QR-könyvtár, nem CDN), visszaszámlálóval, kivetítéssel.
   **Kész (2026-11-12).** `functions/feladatlink.js` (tiszta: token 192 bit base64url, SHA-256 lenyomat = `linkek/{id}`,
   24 óra, 60-as plafon, `linkAllapot`: aktiv / betelt / lejart / lezarva), `linkInditas` / `linkLezaras` (csak a feladat
   tanára; lezárt feladatra nem; egy feladathoz több link is indítható). Szabály: a linket csak a tanára olvassa, kliensről
   senki nem írja; index: `tanar_id + feladat_id + letrehozva` (a régi osztály- és diákindexek kikerültek). Oldal:
   `megosztas.html?feladat=…` (élő frissítés, QR, másolás, visszaszámláló, beadásszám, lezárás, kivetítés, korábbi linkek),
   a feladatlistán „🔗 Link” gomb. QR: `public/js/qrcode-generator.js` (qrcode-generator 1.4.4, MIT, helyben). A link a
   diákoldalra mutat (`iras.html?k=<token>`), ami a 4. lépésben készül – addig a link 404-et ad.
   Döntések: a QR-könyvtár helyben (nem CDN), a plafon 60, egy feladathoz több link is lehet.
4. **Diákoldal.** Új `iras.html?k=…`: feladatleírás, becenév, írómező, piszkozat, beadás callable-en át, nyugta a diáklinkkel.
   **Kész (2026-11-12).** `linkAdatok` (a feladat diáknak szóló része: cím, leírás, nyelv, szószám, szempontok címe és
   pontja – a tanár AI-nak szóló kérése és azonosítója nem) és `linkBeadas` (egy tranzakcióban: a link él és nincs
   betelve, a feladat nyitott, a becenév linkenként egyedi – `linkek/{id}/becenevek/{kulcs}`, kis/nagybetű, ékezet, szóköz
   nem számít –, létrejön a beadás, nő a számláló). Mindkettő belépés nélkül hívható, a token a jogosultság; hibás
   bemenetnél adatbázis-olvasás előtt elutasít. A beadás azonosítója a **diák saját tokenjének SHA-256 lenyomata**; a
   diák a tokenből lett diáklinket kapja (`visszajelzes.html?d=…`, 14 napig él – az oldal a 7. lépésben készül).
   Az ellenőrzők a `functions/feladatlink.js`-ben (becenév, szöveg ≤ 20 000, írás közbeni jelzések – a korábbi
   Firestore-szabály határaival). `iras.html`: feladat, becenév, írómező (helyesírás-ellenőrzés ki), szószámláló,
   piszkozat és nyugta a böngészőben, a meglévő írás közbeni jelzésekkel (ablakelhagyás, beillesztés), nyugta QR-kóddal.
   **Az automatikus AI-trigger (`beadasFeldolgozas`) kikerült:** a diák beadása nem indít AI-t. Átmenetileg a javítási sor
   „Beadva” szűrőjében egyenként indítható az értékelés („✨ Értékelés indítása” = `beadasUjrafuttatas`); a 6. lépés teszi
   kényelmessé. A javítási sor a becenevet mutatja. Ellenőrizve helyi, Firebase-helyettesítős előnézetben (beadás,
   foglalt becenév, nyugta újratöltés után, lejárt link, telefonszélesség).
   **Nyitott:** App Check a diákoldali függvényeken (még nincs beállítva a projektben); a diáklink élettartama (14 nap a
   javaslat).
5. **Csalásellenőrzés.** A 4. pont: beillesztés-tiltás, új jelzések, helyesírás-kapcsoló, a tanári megjelenítés bővítése.
   **Kész (2026-11-12).** `public/js/iras-jelzes.js`: `jelzesFigyelo(…, { tiltas: true })` – a `paste`, a `drop` és a
   `beforeinput` beillesztő típusai (`insertFromPaste`, `…AsQuotation`, `insertFromDrop`, `insertFromYank`) meg vannak
   akadályozva, a kísérlet jelzés (az ugyanahhoz a beillesztéshez tartozó paste + beforeinput egyszer számít). Új tiszta rész:
   `IrasNaplo` – aktív írási idő (a percnél hosszabb szünet nem számít), teljes idő, nagy betoldás (≥ 40 karakter egyszerre,
   beillesztés nélkül; a visszavonás nem számít), időrend (legfeljebb 50 esemény: elhagyás, beillesztési kísérlet, nagy
   betoldás). A szerver (`jelzesekErvenyesek`) az új mezőket kötelezően ellenőrzi; egy teszt a böngésző és a szerver alakját
   összeveti. Tanári kapcsoló: `rubrika.helyesiras_engedett` (alapból ki; a Grammarly-féle bővítmények mindig tiltva). A javító
   nézet mutatja a kísérleteket, a nagy betoldást, az írási időt és az időrendet, a régi figyelmeztetéssel (jelzés, nem
   bizonyíték). Valódi böngészőben ellenőrizve (helyettesítős előnézet): a beillesztés nem kerül a szövegbe.
   A jobb klikkes menüt szándékosan nem tiltjuk (a beillesztés úgyis tiltott, a helyesírás-javaslatokhoz kell).
6. **Tanári értékelésindítás.** A trigger helyett `ertekelesInditas` callable (egy vagy több beadás, párhuzamossági korláttal,
   kvótaegységgel). Az értékelő prompt csak a szöveget kapja.
   **Kész (2026-11-12).** `ertekelesInditas` (tanár): egy feladat beadottjai, a tanár összes beadottja, vagy legfeljebb 100
   kijelölt beadás kerül `sorban` állapotba (`sorba_allitva` időbélyeggel), a maradék AI-keretig – ami nem fér bele,
   `feltoltve` marad, és a válasz jelzi. A hívás nem várja meg az AI-t. A sort az `ertekelesSor` Firestore-trigger dolgozza
   fel (`onDocumentUpdated`, csak a `sorban` állapotba lépésre – a diák beadására nem; `retry: false`, `concurrency: 1`,
   `maxInstances: 5`). Ha a feldolgozáskor fogy el a keret, a beadás visszakerül `feltoltve`-be a keret-üzenettel. Az elakadt
   (10 percnél régebben sorban álló) beadás újra sorba állítható. Felület: a javítási sor „Beadva” szűrőjében „✨ Az összes
   beadott értékelése (N)”, soronként „✨ Értékelés indítása” (ez is a sorba megy), a „Feldolgozás alatt” szűrő a sorban
   állókat is mutatja; a megosztási oldalon a feladat beadottjainak száma és „✨ Értékelés indítása (N)”. Új index:
   `beadasok: tanar_id + feladat_id + statusz`. **Deploy-hatás:** új függvények (`ertekelesInditas`, `ertekelesSor`); a régi
   `beadasFeldolgozas` a deploykor törlődik.
7. **Visszajelzés a diáknak.** `diakVisszajelzes` callable, diáklink-oldal, lejárat. Időzített takarítás (5. pont, megőrzés).
8. **Prod-előkészítés és kiadás.** A régi prod-adatok törlése (a tulajdonos végzi, vagy kifejezett engedélyével), a régi
   függvények törlése a deployban, a Storage-szabály szigorítása, nyitóoldal és csomagok frissítése, végigpróbálás, címkés
   kiadás.

## 8. Tesztek

- Tiszta tesztek: token-ellenőrzés és lejárat, becenév-ütközés, beillesztés-tiltás döntési logikája, új jelzések összegzése.
- Emulátoros tesztek (`rules`, `functions`): a diák semmilyen Firestore-útvonalat nem ér el; lejárt vagy lezárt linkre nincs
  beadás; plafon felett nincs beadás; a diáklink csak a saját, jóváhagyott visszajelzést adja vissza; a diákoldali függvények
  nem hívnak MI-t.

## 9. Jogi oldal: mit old meg és mit nem

- **Megoldja vagy nagyon csökkenti:** diák személyes adatai (név, e-mail, jelszó, fotó, kézírás) nincsenek. A becenév és
  a szöveg álnevesített adat, ezért a GDPR szerint továbbra is személyes adat lehet (a levelekben a diákok gyakran magukról
  írnak), de a kockázat sokkal kisebb. A diákoldalon rövid tájékoztató kell: aláírásnak a becenevét használja, és ne írjon
  bele valódi személyes adatot.
- **Tanítás:** a fizetős Gemini API nem tanít a beküldött adatokon.
- **A korhatár-kikötést nem oldja meg magától** (`google-korhatar-level.md`). A tanár által indított MI erősebb érvelés: a
  generatív AI-t felnőtt használja, a diák MI-kimenetet csak tanári jóváhagyás után lát. A levélvázlatot ezzel a felállással
  frissíteni kell, és a nyilvános indulás előtt kell a Google vagy jogász válasza.

## 10. Nyitott kérdések (a megfelelő lépésnél kell dönteni)

- A diáklink élettartama (javaslat: 14 nap) és a tanári megőrzés ideje (javaslat: 12 hónap).
- Csomagok és árak a fejlődés-követés nélkül.
- Az edtech hub bekötése: később (tanári belépés módja).
