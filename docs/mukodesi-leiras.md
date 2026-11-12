# WritingReview – működési leírás

*Állapot: 2026-11-12. Ez a **prod** (a `main` ág) működését írja le: nyelvtanári, diákfiók és kézírás nélküli
változat. A pilot (a `pilot` ág: kézírás, kifejtős dolgozat, diákfiók) leírása ott maradt:
`git show pilot:docs/mukodesi-leiras.md`. Az átalakítás terve és lépései: [`prod-atalakitas-terv.md`](prod-atalakitas-terv.md).*

Ez a dokumentum azt írja le, **mit tud a program és hogyan működik**: milyen felületek vannak, mi történik egy-egy
gombnyomásra, hogyan dolgozik az AI, és milyen szabályok szerint számol a program. Technikai (stack-) leírás
szándékosan nincs benne; ahol egy technikai döntés a működést vagy a tanulságokat érinti, ott röviden szerepel.

A 8. fejezetben **az AI-promptok szó szerint** megtalálhatók (a mostani kódból kirenderelve, példaadattal), a
kimeneti szerkezetekkel együtt. A 13. fejezet a **kétnyelvű (magyar/angol) felületet** írja le.

## Tartalom

1. [Mi ez, és mire jó](#1-mi-ez-és-mire-jó)
2. [Fogalmak](#2-fogalmak)
3. [Belépés, szerepek, navigáció](#3-belépés-szerepek-navigáció)
4. [A tanári felület](#4-a-tanári-felület)
5. [A diák felülete](#5-a-diák-felülete)
6. [Az AI-folyamat: mi történik egy beadással](#6-az-ai-folyamat-mi-történik-egy-beadással)
7. [Írás közbeni jelzések (csalásellenőrzés)](#7-írás-közbeni-jelzések-csalásellenőrzés)
8. [Az AI-promptok és kimeneti szerkezetek](#8-az-ai-promptok-és-kimeneti-szerkezetek)
9. [Adatmodell (logikai)](#9-adatmodell-logikai)
10. [Amit a próbák és a hibák megtanítottak](#10-amit-a-próbák-és-a-hibák-megtanítottak)
11. [Állapot, hiányok, félretett ötletek](#11-állapot-hiányok-félretett-ötletek)
12. [Mit érdemes átvenni](#12-mit-érdemes-átvenni)
13. [Többnyelvű felület és nemzetközi használat](#13-többnyelvű-felület-és-nemzetközi-használat)

---

## 1. Mi ez, és mire jó

A WritingReview **nyelvtanároknak** készült: levél- és esszéfeladatok AI-val támogatott javítására. A tanár kiad egy
feladatot, és **24 órán át élő linket** indít hozzá (megosztási oldal, QR-kód, kivetítés). A diák ezen a linken,
**becenévvel**, fiók és regisztráció nélkül írja meg és adja be a dolgozatot. A tanár egy gombbal **értékelteti** az
AI-jal a beadott dolgozatokat, átnézi, szükség esetén módosítja, és **jóváhagyja** a visszajelzést. A diák a beadáskor
kapott **saját linkjén** látja a jóváhagyott visszajelzést.

| | |
|---|---|
| Kinek | nyelvtanároknak, akik rendszeresen íratnak levelet vagy esszét |
| A dolgozat nyelve | angol, német, francia, spanyol, olasz, orosz, latin, magyar |
| Az értékelés alapja | **értékelési szempontok** pontértékkel (a tanár adja meg, vagy a feladatlapból az AI javasolja) |
| Ki adja a pontot | az AI szempontonként javasol, a tanár módosíthatja; az összeget a program számolja |
| A visszajelzés nyelve | magyar vagy angol, feladatonként (4.2, 13) |
| A diák | nincs fiókja; becenévvel ír, a visszajelzést a saját linkjén olvassa |

### Alapelvek

1. **Az AI javasol, a tanár dönt.** A diák semmit nem lát, amíg a tanár jóvá nem hagyja. Az AI nyers értékelése soha
   nem jut el a diákhoz.
2. **Az AI-t a tanár indítja.** A diák beadása nem hív AI-t; a diákoldal sosem hív AI-t. A generatív AI-t felnőtt
   használja, a diák csak tanári jóváhagyás után lát AI-ból származó szöveget (9. pont a tervben).
3. **A számokat a program számolja, nem az AI.** Összpontszám, százalék, átlagok, jegyjavaslat, trend mind kódból jön.
4. **A diák nem fér hozzá az adatbázishoz.** Minden diákoldali művelet szerveroldali függvényen megy, a link
   tokenjével; a Firestore-szabályokban nincs diák-útvonal.
5. **A beillesztés tiltott, a többi jelzés tájékoztató.** A jelzések a diák böngészőjéből jönnek: nem bizonyítékok
   (7. fejezet).
6. **Ami mellé kézikönyv kell, az bukó.** Feladat, link, értékelés, jóváhagyás: minden részlet összecsukva van, jó
   alapértékekkel.

### Egy dolgozat útja (áttekintés)

```
TANÁR                                   RENDSZER                                 DIÁK
─────                                   ────────                                 ────
feladatot ad ki (feladatlap → az AI
   javasolja a szempontokat)
„Link indítása" (csoport választható) ► 24 órás link + QR-kód
kivetíti / megosztja  ───────────────────────────────────────────────────────►  megnyitja a linket
                                                                           ◄──  becenévvel megírja, beadja
                                        a beadás mentve (AI NÉLKÜL),        ──►  nyugta a saját diáklinkjével
                                        csoportnál a becenév szerint
                                        párosítva
„Értékelés indítása (N)"  ───────────►  sorba állít, legfeljebb 5 egyszerre:
                                        ① AI értékel (szempontok szerint)
                                        ② a program pontoz
                                           státusz: „Jóváhagyásra vár"
átnézi: szöveg, jelzések, pontok,
   hibák – módosít, jegyet ad
„Elküldés a diáknak"  ───────────────►  jóváhagyva                     ────►  a diáklinken látja: jegy, pontok,
                                                                                 visszajelzés, a saját szövege
osztályelemzést kér  ────────────────►  tipikus hibák, gyakorlatok, kész prompt
fejlődés (Profi, csoportban)  ───────►  diákonként: eredmény és hibák időrendben
```

Egy dolgozat kijavítása **egy AI-hívás** (értékelés); a 2026-10-i mérés szerint dolgozatonként nagyságrendileg
$0,01 (4.7).

---

## 2. Fogalmak

| fogalom | jelentése |
|---|---|
| **Feladat** | cím, feladatleírás, értékelési szempontok, szószám, nyelv, jegyskála, a visszajelzés nyelve. Csak a tanáré. |
| **Feladatlap** | a feladat képe vagy PDF-je (JPG, PNG, PDF; max. 10 MB). Nem kötelező; ha van, az AI ebből javasolja a szempontokat. |
| **Értékelési szempontok** | a szempontok listája pontértékekkel (az adatban `rubrika`). A diák a címüket és a pontjukat látja. |
| **Feladatlink** | egy feladathoz indított, kitalálhatatlan link (`iras.html?k=…`), **24 óráig él**, legfeljebb 60 beadással. A tanár bármikor lezárhatja. Egy feladathoz több link is indítható. |
| **Becenév** | a diák neve a linken: 2–30 karakter. Linkenként egyedi; a kis- és nagybetű, az ékezet, a szóköz és az írásjel nem számít („Kék Sárkány” = „kek-sarkany”). |
| **Diáklink** | a beadáskor kapott saját link (`visszajelzes.html?d=…`): ezen látja a diák a jóváhagyott visszajelzést. A beadástól **14 napig** él; ha a tanár ennél később vagy a vége felé hagy jóvá, a jóváhagyástól még legalább 7 napig. |
| **Csoport** | a tanár csoportja (pl. „9.B angol”). A link csoporthoz rendelhető (nem kötelező). Átnevezhető, archiválható, nem törölhető. |
| **A csoport diákja** | a csoportban az azonos becenévvel beadott dolgozatok egy diákhoz tartoznak. A tanár összevonhat két diákot, és leválaszthat egy beadást (4.5). |
| **Beadás** | egy diák dolgozata egy linken: a szöveg, a becenév, az írás közbeni jelzések, a státusz. |
| **Írás közbeni jelzések** | ablakelhagyás, beillesztési kísérlet, nagy betoldás, írási idő, időrend (7. fejezet). |
| **AI-értékelés** | az AI javaslata. Csak a tanár látja. |
| **Tanári visszajelzés** | amit a tanár jóváhagyott (pontok, jegy, szöveg). Ezt látja a diák a diáklinkjén. |
| **Egység** | a csomag keretének mértékegysége: egy dolgozat értékelése, egy feladatlap feldolgozása, egy osztályelemzés 1-1 egység. |

### A beadás státuszai

| státusz | jelentés | ki állítja át |
|---|---|---|
| `feltoltve` | a diák beadta, értékelésre vár | a diák beadása |
| `sorban` | a tanár elindította az értékelést, a sorra vár | a tanár (`ertekelesInditas`) |
| `folyamatban` | az AI dolgozik | a rendszer |
| `javitva` | az AI kész, **a tanár jóváhagyására vár** | a rendszer |
| `elkuldve` | a tanár jóváhagyta, a diák látja | a tanár jóváhagyása |
| `hiba` | a feldolgozás elhasalt (a hibaüzenet olvasható) | a rendszer |

A státuszt kizárólag a szerver írja; kliensről a beadás sem létre nem hozható, sem nem módosítható.

---

## 3. Belépés, szerepek, navigáció

### Belépő oldal (`belepes.html`)

Csak tanároknak szól (a diák a feladatlinken dolgozik, nem lép be).

- **E-mail + jelszó** vagy **Google-fiók**; „Elfelejtett jelszó” e-mailben.
- **Regisztráció** csak ott, ahol az önkiszolgáló tanári regisztráció be van kapcsolva (a prodban igen): a
  regisztráció mindig tanári kérelem. E-mail+jelszónál megerősítő levelet kap; a megerősítés után a
  `tanariRegisztracio` szerverfüggvény ellenőrzi (be van-e kapcsolva, megerősített-e az e-mail, van-e kérelem a
  profilban), és csak ezután adja meg a tanári jogot. Google-fióknál az e-mail eleve megerősített.
- A bal oldali panel a folyamatot írja le (link, becenév, diáklink).
- Tanári jog és kérelem nélküli fiók magyarázatot kap a belépő oldalon, nem átirányítást.
- **Nyelvválasztó** a jobb felső sarokban (belépés után a fejlécben); a választás a böngészőben megmarad.
- **Telepíthető alkalmazás (PWA):** a belépő oldal felkínálja a főképernyőre telepítést. Hálózat nélkül egy
  magyarázó oldal jön; a program nem működik offline.

### Szerepek

| szerep | mit tehet |
|---|---|
| **tanár** | feladatot, linket, csoportot hoz létre; a saját beadásait látja, értékeltet, jóváhagy, elemzést kér |
| **nincs** | tanári jog nélküli fiók (pl. megerősítetlen regisztráció, elvett jog): semmit nem ér el |
| **admin** | tanár mellett szerepeket és csomagokat oszt, látja az AI-használatot (külön jelző, nem külön szerep) |

A szerep a hitelesítési token claimjéből jön, nem egy módosítható adatmezőből; a profilban csak tükör van (hogy a
felület észrevegye, ha a jogot elvették). Diák szerep nincs.

### Navigáció

- **Tanári oldalsáv:** Főoldal · Feladatok · Javítási sor · Csoportok; adminnak még: Szerepkezelés, AI-használat,
  Számlázandók.
- **Fejléc:** a márkanév a főoldalra visz; a „vissza” gomb a **logikai szülőre** lép (nem a böngésző előzményeire:
  telepített appban, mélylinkről indulva az nem oda vinne). Például: Megosztás → Feladatok, Egy csoport diákjai →
  Csoportok.
- **Beépített bemutató (villanykörte a fejlécben):** a tanár első belépésekor menü nyílik, utána a villanykörtével
  hívható. Három szakasz (feladat, javítás, elemzés), reflektorfénnyel a valódi felületen, nyelvfüggő példaadattal.

---

## 4. A tanári felület

### 4.1 Főoldal

Számlálók: **Jóváhagyásra vár** (a `javitva` beadások → Javítási sor), **Aktív feladatok** (→ Feladatok), és az
**AI-keret** (havi, az ingyenes csomagnál egyszeri). Alatta modulkártyák (Feladatok, Javítási sor, Osztályszintű
elemzés), a csomag-panel (a jelenlegi csomag, előfizetés, a csomagok összehasonlítása) és a színválasztó (az Alap
csomagtól).

### 4.2 Feladatok

Az **➕ Új feladat** gomb nyitja az űrlapot.

| mező | leírás |
|---|---|
| Határidő | nem kötelező, tájékoztató; a beadás a link élettartamához kötött (24 óra), nem a határidőhöz |
| Cím | max. 200 karakter |
| Feladatlap | kép vagy PDF (max. 10 MB; a kép a vágólapról is beilleszthető). Feltöltéskor az AI **javaslatot** tesz (8.1): kitölti a címet (ha üres), a nyelvet, a típust, a szintet, a szószám-határokat, a szempontokat pontokkal és a feladat leírását; „✨ AI által kitöltve” jelzéssel. 1 egység. |
| A visszajelzés nyelve | **magyar** vagy **angol**: ezen készül a diáknak szóló AI-visszajelzés, a hibamagyarázatok, a szempontcímek (javaslatnál) és az osztályelemzés. Feladatonként mentődik (`rubrika.kimeneti_nyelv`). |
| Jegyskála | **Magyar 1–5**, **A–F**, **Százalék** vagy **Egyéni…** (2–15 fokozat, fokozatonként hány %-tól jár). A javítási sor erre a skálára kínálja és javasolja a jegyet. Az utoljára használt skála a böngészőben megmarad. |
| A feladat leírása | szabad szöveg; a diák látja (a linken és kivetítve), és az AI is használja. Az AI javaslata háromrészes: helyzet, a feladatlapon szereplő szöveg összefoglalva, teendő. |
| Nyelv, típus, szint | 8 nyelv; esszé, levél, leírás, elbeszélés, vélemény, egyéb. A **szint skálája a nyelvtől függ**: idegen nyelvnél CEFR (A1–C1), magyarnál évfolyam. „Nem releváns” is választható: ilyenkor a prompt nem említ szintet, és megtiltja, hogy az AI kitaláljon egyet. |
| Minimum/maximum szó | nem kötelező; a diák szószámlálója is ezt mutatja |
| Szempontok | kulcs (rövid azonosító), cím, pontszám (szabadon: 20, 50, 100…); az összeg élőben látszik. Feladatlap nélkül alapérték: tartalom 30, szerkezet 20, szókincs 25, nyelvtan 25. |
| Külön kérés az AI-nak | nem kötelező; bekerül az értékelő promptba. A diák nem látja. |
| Helyesírás-ellenőrzés | **„A diák böngészője ellenőrizheti a helyesírást írás közben”** – alapból ki: nyelvi feladatnál a helyesírás is a mérés része. A beillesztés mindig tiltott, a nyelvhelyesség-javító bővítmények is. |

**Sablonok:** a szempontok újrahasznosítható része (nyelv, típus, szint, szószám, szempontok, AI-kérés – a leírás
nem) névvel menthető, betölthető, törölhető; tanáronként külön.

**A feladatok listája** (élő): cím, *nyelv · típus · szint*, határidő, „Aktív / Zárt”. Gombok:

| gomb | mit csinál |
|---|---|
| 🔗 **Link** | a megosztási oldalra visz (4.3) |
| 👁 **Megtekintés, kivetítés** | órai kivetítés: cím, szószám, leírás és feladatlap – a pontok és a tanári AI-kérés nélkül. `F` = teljes képernyő, `Esc` = bezárás. |
| 📊 **Osztályszintű elemzés** | az elemzés oldalra visz (4.6) |
| ✏️ **Szerkesztés** | a korábbi értékeléseket nem írja át; az új szempontokkal a javítási sorban kell újrafuttatni |
| 📄 **Másolat készítése** | ugyanaz az űrlap, minden adat átvéve, új feladatként mentődik |
| ⏸ **Zárás** / ▶ **Nyitás** | lezárt feladatra nem indítható link, és a futó linken sem lehet beadni |
| 🗑 | törlés megerősítéssel |

### 4.3 Megosztási oldal (`megosztas.html?feladat=…`)

- **Link indítása:** előtte **csoport** választható (alapból az utoljára választott; archivált nem választható; „csoport
  nélkül” is lehet). A szerver (`linkInditas`) ellenőrzi, hogy a feladat a hívóé és nyitott, és a csoport a hívó
  saját, nem archivált csoportja.
- **Az élő link:** másolható cím, nagy **QR-kód** (helyben tárolt könyvtár, nem CDN), visszaszámláló, élő
  beadásszámláló, a csoport neve, **„Link lezárása most”**, és **kivetítés** (a feladat diáknak szóló része).
- **Értékelés indítása (N):** a feladat beadott dolgozatai egy gombbal a sorba kerülnek (6. fejezet).
- **Korábbi linkek** listája állapottal (aktív, betelt, lejárt, lezárva).

### 4.4 Javítási sor

**Szűrők:** 📝 Jóváhagyásra vár *(alapértelmezett)* · 📥 Beadva · ⚙️ Feldolgozás alatt (a sorban állók is) · 📧 Elküldve ·
⚠️ Hibás · Mind.

**A lista** (élő): becenév, a feladat címe, dátum, státusz; elküldöttnél pont, százalék, jegy; hibásnál a hibaüzenet.

- „Beadva” szűrőben: **„✨ Az összes beadott értékelése (N)”**, soronként **„✨ Értékelés indítása”** (mind a sorba megy).
- 🔄 **Újra** *(hibás vagy jóváhagyásra váró beadásnál)*: újra lefuttatja az értékelést, és felülírja az előzőt.

#### A részletes ablak

1. **A beadott szöveg** – ahogy a diák beírta; a beillesztett részek (ha a régi, tiltás előtti kliensből jöttek)
   kiemelve.
2. **Írás közbeni jelzések** – ablakelhagyás, beillesztési kísérletek, nagy betoldás, írási idő (aktív és teljes),
   időrend; a figyelmeztetéssel, hogy ez jelzés, nem bizonyíték (7. fejezet).
3. **🤖 AI-értékelés** – szempontonként pont / max és megjegyzés, összpontszám és százalék; **talált hibák**
   (kategória · címke, a diák szó szerinti idézete → javaslat, magyarázat); erősségek; fejlesztendő.
4. **📧 Visszajelzés a diáknak** – ezt (és csak ezt) látja a diák:
   - **pontozási táblázat**, szempontonként szerkeszthető pont (0 és a maximum között) és megjegyzés, élő összeggel
     (a szempontok vázát és a maximumokat a tanár nem írhatja át, az összeget a szerver számolja);
   - **jegy** a feladat skáláján, **jegyjavaslattal** a pontokból;
   - **szöveges visszajelzés**, előtöltve az AI javaslatával (a feladat visszajelzés-nyelvén, bekezdésekre tagolva);
   - **📧 Elküldés a diáknak** (elküldött beadásnál „Módosítás elküldése”).

**Az elküldéskor** a szerver ellenőrzi a jogosultságot (csak a saját beadásodat), hogy a szöveg nem üres és a jegy
szerepel a skálán, a pontokat a feladat szempontjaihoz szorítja, majd egyszerre kiírja a tanári visszajelzést és
`elkuldve`-re állítja a státuszt. Ha a diáklinkből 7 napnál kevesebb van hátra, meghosszabbítja a jóváhagyástól 7 napra.

### 4.5 Csoportok és fejlődéskövetés

**Csoportok (`csoportok.html`):** új csoport (név, 1–60 karakter), átnevezés, archiválás/visszaállítás; törölni nem
lehet (a linkek és a beadások hivatkoznak rá). Minden csomagban elérhető. Soronként „👤 Diákok”.

**Párosítás becenév szerint.** Csoportos linken a beadáskor a szerver (ugyanabban a tranzakcióban) megnézi a becenév
kulcsát a csoportban: ismert becenév → a meglévő diákhoz kerül, új becenév → új diák. A diák neve az első
becenevéből lesz.

**Egy csoport diákjai (`csoport.html?id=…`):** diákonként a beadások (feladat, becenév, dátum, állapot), a
becenév-alakok, az utolsó beadás ideje.

- **🔗 Összevonás másik diákkal:** ha egy diák más becenevet használt, a két diák egy lesz; a beadások és a becenevek a
  célhoz kerülnek, és **a következő ilyen becenevű beadás is oda** (a program megtanulta).
- **✂️ Leválasztás:** egy tévesen párosított beadásból új diák lesz. Ha a forrásnál nincs más beadás ezzel a
  becenévvel, a becenév is átköltözik (egy téves összevonás így visszacsinálható); ha van (két diák írt ugyanazzal a
  becenévvel), a következő ilyen beadás a régihez kerül, és a tanár teszi át kézzel.
- Mindkettő szerverfüggvény (`csoportDiakOsszevonas`, `csoportBeadasLevalasztas`), tranzakcióban a beadásokkal együtt.

**Fejlődés (Profi csomag):** a diák fejlécében az utolsó eredmény és az irány (▲ javul / ▼ romlik / ▬ változatlan;
5 százalékpont alatt változatlan); a **„📈 Fejlődés”** gomb alatt:

- vonaldiagram: a **tanár által jóváhagyott** pontszázalék feladatról feladatra;
- halmozott oszlopdiagram: az AI által jelölt hibák kategóriánként, feladatonként;
- **ismétlődő hibák:** hibatípusok, amelyek legalább két különböző feladatban előjöttek (jelölve, ha az utolsóban is);
- az adatok táblázatban is (olvasóprogramhoz).

Csak a jóváhagyott (`elkuldve`) beadás számít. A csomag-zár a **szerveren** van (`csomag_profi_kell`): a tanár a
szabályok szerint olvashatná a beadásokat, ezért a felület-zár kiskapu lenne. Nem Profi csomagnál a lap tetején
tájékoztató van a csomagok linkjével; az összevonás és a leválasztás minden csomagban működik.

### 4.6 Osztályszintű elemzés

A feladatlistában a 📊 gombbal nyílik. Első megnyitáskor **✨ Elemzés készítése** (csak ha van kiértékelt beadás;
3-nál kevesebbnél figyelmeztet). Mentve van; új beadások után **🔄 Elemzés újrafuttatása**. Az Alap csomagtól, 1 egység.

| blokk | tartalom | ki számolja |
|---|---|---|
| Kártyák | osztályátlag, kiértékelt dolgozatok száma | **program** |
| Szempontonként | átlagpont és százalék, a legrosszabbal kezdve | **program** |
| 🧭 Összegzés | 2–3 bekezdés: mi ment jól, mi hiányzik rendszerszinten | **AI** |
| 🔁 Típushibák | jelentés szerint összevont hibák gyakoriság-jelzéssel, diákidézetekkel | **AI** |
| 🎯 Javasolt gyakorlatok | 3–5 konkrét órai gyakorlat: cím, cél, leírás, időtartam | **AI** |
| ✨ Feladatgeneráló prompt | kész prompt, amit a tanár bármelyik AI-ba bemásolhat; 📋 Másolás | **AI** |

**Munkamegosztás oka:** az aritmetikát nem bízzuk a modellre. A hibacímkék elcsúszhatnak (`article_missing` /
`missing_article`), ezért a program csak gyakoriságot számol, az összevonást az AI végzi a jelentés alapján.

### 4.7 Admin oldalak

**Szerepkezelés:** keresés, szűrő (mindenki / tanárok / tanári jog nélkül / adminok); soronként tanári jog adása vagy
elvétele, admin jelző, csomag beállítása. A saját admin jogodat nem veheted el. „⏳ belépés kell”: a felhasználó
jogosultsága még a régi tokenben van.

**AI-használat és költség (📈 AI-használat):** minden AI-hívásról egy rekord (`ai_hasznalat`): tanár, művelet,
modell, tokenek (bemenet, kimenet, gondolkodás), újrapróbálkozások, tartalék modell. **Diákszöveg nincs benne.** Az
oldal hónap szerint mutatja a hívásokat, a becsült költséget (USD), a dolgozatonkénti költséget (egy javítási futás =
egy értékelő hívás), műveletek, modellek, tanárok és feladatok szerint; a **számoló** ebből ajánl csomagárat a
célárréshez (a képletek: `public/js/arszamolo.js`). Az árak a `functions/ai-hasznalat.js` ár-táblájából jönnek.

**Számlázandók:** a befizetések, amelyekről számlát kell kiállítani. A számla a számlázz.hu-ban készül (kézzel); a
számlaszámot itt kell beírni, és a tételt késznek jelölni.

---

## 5. A diák felülete

A diáknak nincs fiókja. Két oldala van, mindkettő belépés nélkül, a link tokenjével működik.

### 5.1 Írás és beadás (`iras.html?k=…`)

- **A feladat:** cím, leírás, a dolgozat nyelve, szószám, a szempontok címe és pontja – a tanár AI-nak szóló kérése
  és az azonosítók nem mennek ki (`linkAdatok`).
- **Becenév:** 2–30 karakter; linkenként egyedi. Csoportos linknél tipp: ebben a csoportban mindig ugyanazt a
  becenevet használja.
- **Írómező:** szószámláló a határokhoz; a böngésző helyesírás-ellenőrzése csak akkor, ha a tanár engedi; a
  beillesztés tiltott. A diák előre látja, mit jelzünk (7. fejezet). A **piszkozat a böngészőben mentődik**, így egy
  véletlen frissítés nem viszi el.
- **Beadás** (`linkBeadas`, egy tranzakcióban): a link él és nincs betelve, a feladat nyitott, a becenév szabad;
  létrejön a beadás, lefoglalódik a becenév, nő a számláló. **AI nem indul.**
- **Nyugta:** a saját **diáklink** (és QR-kódja, hogy telefonra vihesse); a nyugta újratöltés után is látszik
  (a böngészőben megmarad).
- Lejárt, lezárt, betelt vagy érvénytelen linknél érthető üzenet.

### 5.2 Visszajelzés (`visszajelzes.html?d=…`)

- **Várakozik:** amíg a tanár nem hagyta jóvá, a diák semmit nem lát (azt sem, hogy fut-e az értékelés).
- **Kész:** jegy, a tanár szöveges visszajelzése, pontozási táblázat (szempontonként pont, maximum, a tanár
  megjegyzése; összesen, százalék), a jóváhagyás ideje és a diák saját szövege.
- **Lejárt:** a diáklink lejárt; a beadás a tanárnál marad.

A szerver (`diakVisszajelzes`) **kifejezett mezőlistával** adja ki a tanári visszajelzést: az AI nyers értékelése, az
írás közbeni jelzések és az azonosítók nem mennek ki.

---

## 6. Az AI-folyamat: mi történik egy beadással

```
diák beadja ─► feltoltve   (AI nincs)
tanár: „Értékelés indítása" ─► sorban ─► folyamatban ─► [értékelés] ─► a program pontoz ─► javitva
                                                                                              │
                                                                tanár jóváhagyja ─► elkuldve ◄┘
bármelyik lépésben hiba ─► hiba (olvasható üzenettel; a tanár „Újra"-t nyomhat)
```

- **Sorba állítás (`ertekelesInditas`):** egy feladat beadottjai, a tanár összes beadottja, vagy legfeljebb 100
  kijelölt beadás kerül `sorban` állapotba, **a maradék AI-keretig**; ami nem fér bele, `feltoltve` marad, és a válasz
  jelzi. A hívás nem várja meg az AI-t (a böngészőt sem kell nyitva tartani).
- **Feldolgozás (`ertekelesSor`):** Firestore-trigger, csak a `sorban` állapotba lépésre indul (a diák beadására
  nem); legfeljebb **5 egyszerre**, újrapróbálás nélkül (fizetős hívás). A 10 percnél régebben sorban álló
  (elakadt) beadás újra sorba állítható. Ha feldolgozáskor fogy el a keret, a beadás visszakerül
  `feltoltve`-be a keret-üzenettel.
- **Foglalás:** a feldolgozás tranzakciós foglalással indul (`futas_id`): egy duplikált esemény vagy dupla kattintás
  nem indít második futást, és egy elavult futás nem ír felül újabb állapotot.
- **Értékelés (8.2):** a beírt szöveg + a feladat adatai → szempontonkénti pont és megjegyzés, hibalista
  (kategória, gépi címke, idézet, javaslat, magyarázat), erősségek, fejlesztendő, a diáknak szóló
  visszajelzés-javaslat, szószám. A pontokat a program a feladat szempontjaihoz szorítja (ismert kulcsok, a maximum a
  szempontból, a pont 0..max), és **maga számolja** az összeget, a maximumot és a százalékot. A diáknak szóló szöveget
  mentés előtt bekezdésekre tagolja.

### Hibakezelés és modellek

- **Átmeneti hiba** (túlterhelt modell): **háromszor újrapróbál**, növekvő várakozással. A feladatlap-javaslatnak van
  tartalék modellje, az **értékelésnek szándékosan nincs**: ha az egyik diákot egy másik modell pontozná, sérülne az
  összehasonlíthatóság. Inkább `hiba` lesz, és a tanár újrafuttatja.
- **Véglegesnek tűnő hiba** (hibás kérés, jogosultság): nincs ismétlés. Hibás AI-válasznál is naplózódik a
  tokenhasználat.
- Minden feldolgozás rögzíti, **melyik modell válaszolt ténylegesen**.
- **Szolgáltató:** Gemini (Flash-osztály). A kód Claude-ot is tud (`AI_SZOLGALTATO=claude` a környezeti
  beállításban); 2026-11-i összevetésben a Claude a Geminire hangolt prompttal jóval szigorúbban pontozott, ezért
  maradt a Gemini (`folytatas.md` 0/e).
- **Kimenet:** minden hívás **strukturált JSON**-t kér (válasz-séma megadásával). Szövegparse-olás nincs.
- **Nyelv:** az AI-nak szóló instrukciók magyarul vannak; a **kimenet nyelvét** a feladat `kimeneti_nyelv` mezője
  adja (magyar vagy angol), a dolgozat nyelvétől függetlenül.
- **Keret (kvóta, csak a prodban):** a foglalás az AI-hívás előtt tranzakcióban történik; hibánál visszaadja. Csomagok:
  **Ingyenes** 20 egység egyszer, **Alap** 150/hó, **Profi** 500/hó, **korlátlan** (csak az admin adhatja). A csomagok
  tartalma: `functions/kvota.js` (`CSOMAGOK`, `FUNKCIOK`).

---

## 7. Írás közbeni jelzések (csalásellenőrzés)

A diák a feladatlinken, a böngészőben ír; a jelzéseket a böngésző gyűjti (`public/js/iras-jelzes.js`), és a
beadással együtt küldi. **A diák előre látja, mit jelzünk.**

| jelzés | mit mér |
|---|---|
| **Beillesztés – tiltva** | a `paste`, a `drop` és a `beforeinput` beillesztő típusai (a mobil billentyűzet vágólapsávja is) meg vannak akadályozva; a **kísérlet** jelzés (darabszám, időpont) |
| **Ablakelhagyás** | hányszor, mennyi időre, mikor hagyta el az oldalt (a 2 másodpercnél rövidebb nem számít) |
| **Nagy betoldás** | egyetlen bevitel ≥ 40 karaktert tett be beillesztés nélkül (bővítmény, automatikus gépelő, diktálás); a visszavonás nem számít |
| **Írási idő** | aktív írás (a percnél hosszabb szünet nem számít) és a teljes idő az első leütéstől |
| **Időrend** | legfeljebb 50 esemény: elhagyás, beillesztési kísérlet, nagy betoldás |
| **Helyesírás-ellenőrzés** | a tanár kapcsolja feladatonként; a nyelvhelyesség-javító bővítmények (pl. Grammarly) mindig tiltva |

A szerver (`jelzesekErvenyesek`) az alakot szigorúan ellenőrzi (pontosan ezek a mezők, korlátos egész számok); egy
teszt a böngésző és a szerver alakját összeveti. A jobb klikkes menü szándékosan nincs tiltva (a beillesztés úgyis
tiltott, a helyesírási javaslatokhoz kell).

**A jelzés nem bizonyíték.** A diák böngészője küldi, kijátszható, és ártalmatlan oka is lehet (értesítés,
szótár). A tanári felület ezt ki is mondja; ez nem AI-detektor: tényt jelez, nem ítéletet.

---

## 8. Az AI-promptok és kimeneti szerkezetek

Az alábbi szövegek **a mostani kódból kirenderelt, élesben használt promptok**, példaadatokkal (*My hometown*, *B1*,
angol, magyar visszajelzés). A hívások strukturált JSON-választ kérnek, a séma a prompt alatt. A kód helye:
`functions/index.js` (`rubrikaPrompt`, `ertekelesPrompt`, `elemzesPrompt`).

**A kimenet nyelve.** Ha a feladat `kimeneti_nyelv` mezője `en`, az instrukciók ugyanezek maradnak (magyarul), csak
a kimenet nyelvét kérő részek cserélődnek (`magyarul` → `angolul`, `magyar nyelvű indoklás` → `angol nyelvű
indoklás`, `magyar címekkel` → `angol címekkel`, `aki magyar diákokat értékel` → `aki diákokat értékel`, `Egy magyar
osztály` → `Egy osztály`). Ismeretlen vagy hiányzó érték a magyar változatot adja. A kód: `kimenet()` a
`functions/skala.js`-ben; a `tests/kimenet.test.mjs` védi.

**Ismert apróság:** a nyelvnevet a prompt toldalékolás nélkül fűzi be („A angol nyelv…”, „a tanár angol-t jelölt
meg”). A modellnek nem okoz gondot.

### 8.1 Feladatlap → javaslat az értékelési szempontokra

**Mikor:** a tanár feltölt egy feladatlapot. **Bemenet:** a prompt + a feladatlap (kép/PDF). **Változó:** a nyelv
(a tanár választása; az AI felülírhatja), a kimenet nyelve.

```text
Te egy tapasztalt angoltanár vagy. A képen egy írásbeli
feladatlap látható.

Elemezd, és állítsd össze belőle az értékelési rubrikát:
- Milyen NYELVEN szól a feladat? A tanár angol-t jelölt meg, de ha a
  feladatlap alapján más nyelvről van szó, a "nyelv" mezőben azt add meg.
- Milyen típusú írásbeli feladat ez?
- Milyen CEFR-szintet céloz? Ha a feladatlapból nem derül ki,
  HAGYD ÜRESEN a "szint" mezőt – ne találj ki szintet.
- Mekkora terjedelmet vár el? (Ha a feladatlap megadja, azt használd.)
- Milyen szempontok szerint érdemes értékelni? Adj 3-5 szempontot,
  magyar címekkel. A pontszámokat úgy oszd el, hogy az összeg PONTOSAN
  100 legyen – ez csak javaslat, a tanár utólag átskálázhatja (pl. 50
  pontos dolgozatra). A "kulcs" rövid, ékezet nélküli azonosító legyen
  (pl. tartalom, szerkezet, szokincs, nyelvtan).
- A "feladat_leiras" mezőbe a diák teljes feladata kerül, úgy, hogy a
  kivetítve is érthető legyen. Három része van, ebben a sorrendben:
  1. A HELYZET: a feladatlap bevezetője (pl. kit ír, miért, mi történt).
  2. A FELADATLAPON SZEREPLŐ SZÖVEG (hirdetés, cikk, levél, e-mail, amire
     a diák reagál) ÖSSZEFOGLALVA, 2-4 mondatban, a lényeges adatokkal
     (mi, hol, ki, mit kínálnak, milyen feltétel, kapcsolattartó). Ezt a
     részt NE hagyd ki: a feladat nélküle nem érthető. Szó szerint, hosszan
     NE másold át, foglald össze.
  3. A TEENDŐ: mit kell írni (műfaj, címzett, terjedelem), és a kért
     tartalmi pontok felsorolva, ahogy a lapon állnak.
  Ha a feladatlapon nincs ilyen szöveg, a 2. rész elmarad.
  - Ha a feladatlap nyelve MEGEGYEZIK a kimeneti nyelvvel (magyar), a
    helyzet és a teendő megfogalmazását és személyét ne változtasd meg
    (tartsd meg úgy, ahogy a lapon áll), csak a szöveget foglald össze.
  - Ha a feladatlap MÁS nyelvű, mindent magyarul adj, és a helyzetet meg
    a teendőt másodikszemélyben (E/2) fogalmazd, a diákhoz szólva, ahogy egy
    feladatlap szokott (pl. "Írj egy levelet…", "Olvastál egy cikket,
    reagálj rá…"). Soha ne harmadik személyben ("A diáknak… kell írnia").

Ha valamit nem lehet kiolvasni a feladatlapból, adj józan
alapértelmezést – KIVÉVE a szintet: azt inkább hagyd üresen.
Egy kitalált szint rosszabb, mint a semmi, mert az értékelés ahhoz mér.
```

**Anyanyelvi (magyar) dolgozatnál** a szint kérdése így szól (a CEFR itt értelmetlen, évfolyamot kér):

```text
- Melyik ÉVFOLYAMNAK szól a feladatlap? Ezt írd a "szint" mezőbe.
  CEFR-szintet NE adj meg: a dolgozat anyanyelvi, ott nincs értelme.
  Ha az évfolyam nem derül ki, HAGYD ÜRESEN a mezőt – ne tippelj.
```

**Kimeneti szerkezet:**

```text
{
  cim_javaslat: string
  tipus: "esszé" | "levél" | "leírás" | "elbeszélés" | "vélemény" | "egyéb"
  nyelv: "angol" | "német" | "francia" | "spanyol" | "olasz" | "orosz" | "latin" | "magyar"
  szint?: a nyelv skálája szerint (CEFR, illetve évfolyam)
  min_szo?: integer
  max_szo?: integer
  szempontok: [ { kulcs: string, cim: string, suly: integer } ]
  feladat_leiras: string
}
```

A `szint` **szándékosan nem kötelező**: kötelező enum mellett a modell kénytelen volt szintet kitalálni ott is, ahol
a feladatlapból semmi nem utalt rá. A program a visszaadott szintet a visszaadott nyelv skáláján még egyszer ellenőrzi.

### 8.2 Értékelés

**Mikor:** a tanár által indított értékelés. **Bemenet:** kizárólag ez a szöveges prompt (a dolgozat és a feladat
adatai behelyettesítve). A prompt **fix sablon**: csak a feladat adatai változnak, így minden diák ugyanazzal a
mércével mérődik.

```text
Te egy tapasztalt angoltanár vagy, aki magyar diákokat értékel.

# A FELADAT
Cím: My hometown
A dolgozat nyelve: angol
Típus: esszé
Célszint (CEFR): B1
Elvárt hossz: 120–180 szó

A feladat leírása:
Write about the town where you live.

A tanár külön kérése:
Pay special attention to the use of the past tense.

# ÉRTÉKELÉSI SZEMPONTOK
  - tartalom ("Tartalom és feladatteljesítés"): max 30 pont
  - szerkezet ("Szerkezet és kohézió"): max 20 pont
  - szokincs ("Szókincs"): max 25 pont
  - nyelvtan ("Nyelvhelyesség"): max 25 pont

# A DIÁK DOLGOZATA (a diák beírta)
"""
<a diák beírt szövege>
"""

# UTASÍTÁSOK
1. Minden szemponthoz adj pontszámot. A "max" mező pontosan a fent
   megadott maximum legyen, a "pont" pedig 0 és a maximum között.
   A B1 szinthez mérj, ne anyanyelvi szinthez.
2. A "hibak" tömbbe vedd fel a konkrét hibákat. Minden hibánál az
   "idezet" a diák SZÓ SZERINTI szövegrészlete legyen, a "javaslat" a
   helyes változat, a "magyarazat" pedig egy rövid magyar nyelvű indoklás.
   A "tipus" egy rövid, gépi feldolgozásra alkalmas címke legyen,
   a angol nyelv nyelvtani fogalmaival (angolnál pl. "past_simple",
   "article_missing"; németnél pl. "dativ_falsch", "wortstellung") –
   ezekből készül az osztályszintű típushiba-statisztika, ezért
   ugyanarra a hibafajtára MINDIG ugyanazt a címkét használd.
3. A "diak_szoveg" a diáknak szóló visszajelzés MAGYARUL: barátságos,
   konstruktív hangnem, 3-5 bekezdés. Kezdd azzal, ami sikerült.
   Ne sorold fel az összes hibát – emeld ki a 2-3 legfontosabbat.
   Ne írj bele pontszámot és jegyet: azt a tanár állapítja meg.
   A bekezdéseket ÜRES SOR válassza el (a szövegben két sortörés), ne
   egyetlen összefüggő blokkot adj.
4. Az "erossegek" és "fejlesztendo" rövid, tömör felsorolások a tanárnak.
5. A KIMENET NYELVE: az összes szabad szöveges mező – a szempontonkénti
   "megjegyzes", a "magyarazat", az "erossegek", a "fejlesztendo" és a
   "diak_szoveg" – MAGYARUL készüljön, következetesen, még akkor is, ha
   a dolgozat más nyelven íródott. Csak az "idezet" és a "javaslat" marad a
   dolgozat nyelvén (angol).
```

**A „mérce” mondat négy változata** (az 1. utasítás vége). **Ha nincs megadva szint, a promptban semmilyen szint nem
szerepelhet**, különben az AI kitalál egyet, és ahhoz mér:

| eset | a mondat |
|---|---|
| idegen nyelv, van szint | „A B1 szinthez mérj, ne anyanyelvi szinthez.” |
| anyanyelv, van évfolyam | „Ez ANYANYELVI dolgozat, a mérce: 9-10. évfolyam. Ehhez mérj, ne CEFR-szinthez – a diáknak ez az anyanyelve.” |
| idegen nyelv, nincs szint | „A tanár nem adott meg célszintet: a feladatból és a szempontokból ítéld meg, mit lehet elvárni. CEFR-szintet ne találj ki.” |
| anyanyelv, nincs évfolyam | „Ez ANYANYELVI dolgozat, és a tanár nem adott meg évfolyamot: … Szintet ne találj ki, és ne CEFR-skálán gondolkodj.” |

A persona is a nyelvtől függ („tapasztalt **angol**tanár”, „**német**tanár”…): a nyelvek listáját ezért csak olyan
névvel szabad bővíteni, ami a `-tanár` szóval helyes összetételt ad.

**Kimeneti szerkezet:**

```text
{
  szempontok: [ { kulcs: string, pont: number, max: number, megjegyzes: string } ]
  hibak: [ {
    kategoria: "nyelvtan" | "szokincs" | "szerkezet" | "tartalom" | "helyesiras" | "irasjelek"
    tipus: string          // gépi címke a statisztikához (pl. "past_simple")
    idezet: string         // a diák szó szerinti szövegrésze
    javaslat: string
    magyarazat: string
  } ]
  erossegek: [ string ]
  fejlesztendo: [ string ]
  diak_szoveg: string      // a diáknak szóló visszajelzés-javaslat
  szoszam?: integer
}
```

### 8.3 Osztályszintű elemzés

**Mikor:** a tanár a 📊 gombbal elemzést kér. **Bemenet:** a program által kiszámolt összesítés (szempontátlagok,
hibacímkék gyakorisága, konkrét hibák mintája – legfeljebb 200) + a feladat adatai.

```text
Te egy tapasztalt angoltanár és szaktanácsadó vagy. Egy magyar 
osztály angol dolgozatainak összesített hibáit kapod meg, és a tanárnak
kell segítened: mire érdemes órán visszatérni.

# A FELADAT
Cím: My hometown
Nyelv: angol
Típus: esszé
Célszint (CEFR): B1
Leírás: Write about the town where you live.

# OSZTÁLYSZINTŰ SZÁMOK
Kiértékelt dolgozat: 22
Osztályátlag: 68%

Szempontonként (a legrosszabb elöl):
- nyelvtan: 14.2/25 (57%)
- szokincs: 17.5/25 (70%)

# HIBACÍMKÉK GYAKORISÁGA
FONTOS: ezeket a címkéket a javító AI adta, és ELCSÚSZHATNAK – ugyanaz a
hibafajta kaphatott többféle nevet (pl. "article_missing" és
"missing_article"). A te dolgod, hogy a JELENTÉS szerint vond össze őket,
ne a címke szövege szerint.
- nyelvtan/past_simple: 31 db, 14 diáknál
- nyelvtan/article_missing: 18 db, 11 diáknál

# KONKRÉT HIBÁK (minta)
- [nyelvtan/past_simple] "I go to the cinema yesterday" -> "I went to the cinema yesterday"

# UTASÍTÁSOK
1. "osszegzes": 2-3 bekezdés a tanárnak, magyarul. Mi ment jól az
   osztálynak, és mi az a 2-3 dolog, ami rendszerszinten hiányzik.
   Ne ismételd a számokat, azokat a tanár látja – ÉRTELMEZD őket.
2. "tipushibak": a JELENTÉS szerint összevont típushibák, a
   legfontosabbal kezdve, legfeljebb 6. A "cim" magyarul, közérthetően
   (pl. "A határozott articulus elhagyása"), a "peldak" pedig a fenti
   konkrét hibákból vett SZÓ SZERINTI idézetek.
   A "gyakorisag": "általános" ha a diákok többségét érinti, "gyakori" ha
   jelentős részét, "szórványos" ha csak néhányat.
3. "gyakorlatok": 3-5 konkrét, órán használható gyakorlat a legfontosabb
   hibákra. A "leiras" legyen annyira konkrét, hogy a tanár holnap be
   tudja vinni: mit csinálnak a diákok, milyen formában, mennyi ideig.
   Ne általánosság ("gyakoroljátok a múlt időt"), hanem eljárás.
4. "generalo_prompt": egy KÉSZ, önmagában is használható prompt, amit a
   tanár bemásolhat egy AI-ba, hogy gyakorlósort generáljon az osztály
   konkrét hibáira. Tartalmazza a nyelvet, a szintet, a célzott
   hibákat és a kért feladattípusokat. Az instrukciót magyarul írd, de a generált
   feladatok nyelve angol legyen.

Ha 3-nál kevesebb kiértékelt dolgozat van, az "osszegzes" ELSŐ mondatában
jelezd, hogy ez még nem osztályszintű kép.
```

**Kimeneti szerkezet:**

```text
{
  osszegzes: string
  tipushibak: [ {
    cim: string
    kategoria: "nyelvtan" | "szokincs" | "szerkezet" | "tartalom" | "helyesiras" | "irasjelek"
    gyakorisag: "általános" | "gyakori" | "szórványos"
    magyarazat: string
    peldak: [ string ]
  } ]
  gyakorlatok: [ { cim: string, cel: string, leiras: string, idotartam_perc: integer } ]
  generalo_prompt: string
}
```

---

## 9. Adatmodell (logikai)

| entitás | fontosabb tartalom | ki látja |
|---|---|---|
| **Felhasználó** (`felhasznalok`) | név, e-mail, szerep-tükör (`tanar` / `nincs`), tanári kérelem, bemutató-állapot, színtéma | csak saját maga |
| **Tanár** (`tanarok`) | csomag, előfizetés; havi és összes használat (`hasznalat/…`) | a szerver; a tanár a felületen az összesítést |
| **Feladat** (`feladatok`) | tanár, cím, határidő, aktív, feladatlap, **rubrika** (nyelv, típus, szint, szószám, szempontok, AI-kérés, leírás, `kimeneti_nyelv`, `skala`, `helyesiras_engedett`) | csak a tanár |
| ↳ **Elemzés** (`feladatok/{id}/elemzes`) | a 4.6 szerinti összesítés és AI-szöveg | csak a tanár |
| **Feladatlink** (`linkek/{a token SHA-256 lenyomata}`) | feladat, tanár, csoport, token, lejárat, lezárva, beadásszám, plafon | a tanár (a tokent is, hogy megossza); kliensről senki nem írja |
| ↳ **Becenév-foglalás** (`linkek/{id}/becenevek/{kulcs}`) | a beadás azonosítója | senki (szerver) |
| **Csoport** (`csoportok`) | tanár, név, aktív, létrehozva | a tanár; kliensről írható (név, archiválás), nem törölhető |
| ↳ **A csoport diákja** (`csoportok/{id}/diakok`) | név, becenév-kulcsok, utolsó beadás | a tanár olvassa; csak a szerver írja |
| ↳ **Becenév → diák** (`csoportok/{id}/becenevek/{kulcs}`) | a diák azonosítója | senki (szerver) |
| **Beadás** (`beadasok/{a diák tokenjének lenyomata}`) | feladat, tanár, link, csoport, csoport-diák, becenév, szöveg, jelzések, **státusz**, diáklink lejárata, értékelő modell, hibaüzenet | csak a tanár; a diák a diáklinken, szerveren át |
| ↳ **AI-értékelés** (`ertekeles/ai`) | szempontok, pontok, hibák, visszajelzés-javaslat, modell | **csak a tanár** |
| ↳ **Tanári visszajelzés** (`ertekeles/tanari`) | jegy, jegy típusa, szöveg, pontozás, jóváhagyás ideje | a tanár; a diák a diáklinken, mezőlistával |
| **Rubrika-sablon** (`rubrikak`) | név, a szempontok újrahasznosítható része | csak a tulajdonos tanár |
| **AI-használat** (`ai_hasznalat`) | azonosítók és számok (4.7), diákszöveg nélkül | senki kliensről; az admin az összesítést |

**Kulcs tervezési döntések:**

1. **A szerepkör a hitelesítési tokenből jön**, nem módosítható adatmezőből. Hiányzó jogosultság = nincs jog.
2. **A diák nem éri el a Firestore-t.** Minden diákoldali művelet callable (`linkAdatok`, `linkBeadas`,
   `diakVisszajelzes`); a token a jogosultság, és minden bemenet ellenőrzött, mielőtt bármit olvasna.
3. **A tokenek nincsenek tárolva, csak a lenyomatuk** (a link tokenje kivétel: azt a tanár visszaolvassa, hogy
   megossza). A beadás azonosítója a diák tokenjének lenyomata, így egy token más beadást nem nyithat meg.
4. **Az AI nyers értékelése külön dokumentumban van**, mert a szabályok dokumentum szintjén kapuznak, nem mező szinten.
5. **A státuszt csak a szerver írja**; a beadás kliensről nem hozható létre.
6. **Visszaélés ellen:** linkenkénti plafon (60), becenév-ütközés kizárása, szöveghossz-korlát (20 000 karakter), a
   tanár bármikor lezárhatja a linket. A beadás nem hív AI-t, így egy kiszivárgott link nem okoz AI-költséget. App Check
   (reCAPTCHA Enterprise) a három diákoldali függvényen: kulccsal és `APP_CHECK=igen` kapcsolóval (11.).
7. **Megőrzés (`takaritas`, naponta 3:30):** a lejárt linkek becenév-foglalásai a lejárat után 1–30 nappal; a **12
   hónapnál** régebbi beadások az értékelésekkel együtt; a 12 hónapnál régebben lejárt linkek; a 12 hónapja nem beadó
   csoport-diákok a becenév-hozzárendelésükkel. Futásonként legfeljebb 300-300 dokumentum.
8. **A feladat adataiban a kódszavak magyarok** (nyelv: `angol`…; típus: `esszé`…; gyakoriság: `általános`…); a
   megjelenítés fordít (13.2).

---

## 10. Amit a próbák és a hibák megtanítottak

A kézírás-átírás és a kifejtős dolgozat próbáinak eredményei a pilot leírásában maradtak. Ami a prodra is érvényes:

- **Ha egy mező értelmesen hiányozhat, ne legyen kötelező a strukturált kimenetben**, és a promptban se szerepeljen
  „nincs megadva”: a modell kitölti magának. (A kötelező CEFR-szint miatt minden magyar dolgozat kapott egy kitalált
  szintet.)
- **A pontot ne az AI számolja**, ha a szabály determinisztikus: az AI szempontonként javasol, a program a
  szempontokhoz szorít és összead.
- **Az értékelő promptot a modellhez kell hangolni.** Ugyanaz a prompt Claude-dal átlagosan 47%, Geminivel 66% lett
  ugyanazon a 11 dolgozaton; a különbség a pontozásból jött, nem az olvasásból (`folytatas.md` 0/e).
- **Az alacsonyabb gondolkodási szint olcsóbb lehet ugyanazzal a minőséggel** – de csak méréssel szabad csökkenteni,
  és az értékelésnél (ami a diákhoz megy) csak pontszám-összehasonlító mérés után.
- **Az átmeneti modellhiba normális** (túlterhelés): újrapróbálás kell; az értékelésnél szándékosan nincs modellváltás.
- **A mérést a futás egyértelmű pontjához kell kötni:** a dolgozatonkénti költség egy ideig túl magas volt, mert a
  futást egy olyan hívás számolta, ami nem minden futásban van (`folytatas.md`, Ismert hiányosságok).
- **Több helyen élő követelmény elcsúszhat a kód mellett:** a felület ígéretét (nyitóoldal, csomagok) teszttel kell a
  kódhoz kötni (`tests/landing.test.mjs`).
- **Ugyanaz a logika két helyen (böngésző + szerver) előbb-utóbb elcsúszik:** a jegyskála egy forrásból generálódik
  mindkét oldalra (`functions/skala.js` → `public/js/skala.js`), az írás közbeni jelzések alakját teszt veti össze.

---

## 11. Állapot, hiányok, félretett ötletek

### Állapot (2026-11-12)

- A prod-átalakítás 1–8e lépése kész (az App Check kikapcsolva) a `main`-en, **nincs deployolva**; a prod a régi (`v1.19.1`) kódon fut. Hátra:
  8f (a régi adatok törlése és a kiadás). Lásd `prod-atalakitas-terv.md`.
- Automatizált tesztek: az emulátor nélküli készlet és a Firebase-emulátort igénylő szabály-, függvény- és
  jogosultsági tesztek együtt ~700 teszt (`cd tests && npm test`, Java 21).
- Az új folyamatot (link → beadás → értékelés → jóváhagyás → diáklink, csoport, fejlődés) **tesztek és helyi,
  Firebase-helyettesítős előnézet** ellenőrizték; élő függvényekkel, valódi osztállyal még nem futott végig.

### Nincs meg (tudatosan)

| mi | miért |
|---|---|
| Kézírás, fotós beadás | a prod beírt dolgozatra épül (a pilotban megvan) |
| Kifejtős (tartalmi) dolgozat | a prod nyelvtanároknak szól (a pilotban megvan) |
| Diákfiók, osztálykód | a diák becenévvel, linken ír; a követés a tanár csoportjain belül |
| Dolgozat generálása tananyagból | félretéve; a Teacher's Arsenalban jöhet |
| Értesítés (e-mail/push) új beadásról | nincs |
| Offline írás | a beadás hálózatot igényel (a piszkozat viszont a böngészőben megmarad) |
| Feldolgozási régió megszabása (EU) | tervben; a modell EU-s elérhetőségét előbb ellenőrizni kell |
| GPA, a jegyskála a sablonban és a tanári profilban | az utoljára használt skálát csak a böngésző jegyzi meg |

### Nyitott

- **App Check** a diákoldali függvényeken: a kód kész (8e), kikapcsolva; a bekapcsolás lépései: `folytatas.md` 00.
- **Jogi oldal:** a Google korhatár-kikötése (`google-korhatar-level.md`), adatkezelési tájékoztató (a csoporton
  belüli, becenév szerinti követés egy álnevesített tanulási profil: jelezni kell), jogász.
- Az edtech hub bekötése (tanári belépés módja).

---

## 12. Mit érdemes átvenni

*(Vélemény, nem előírás.)*

1. **A link + becenév + diáklink modell:** fiók nélkül, kis adatkezelési kockázattal ad diákazonosságot egy
   feladatra, a csoporton belül pedig a fejlődéskövetéshez.
2. **A tanár indítja az AI-t, a diák csak jóváhagyottat lát.** Jogilag és pedagógiailag is erősebb felállás, és a
   költséget is a tanár kezében tartja.
3. **A munkamegosztás elve:** az AI értelmez, a program számol és ellenőriz; a tanár dönt.
4. **A promptok és a kimeneti sémák** (8. fejezet), különösen a szint kezelése („ne találj ki szintet”) és a kimenet
   nyelvének következetes kérése.
5. **Az írás közbeni jelzések:** tiltás ott, ahol egyértelmű (beillesztés), tájékoztató jelzés ott, ahol nem.
6. **A javító nézet mintája:** az AI javaslata előre kitöltve, minden pont és mondat átírható, élő jegyjavaslattal.

---

## 13. Többnyelvű felület és nemzetközi használat

A felület **magyarul és angolul** is használható (a tanári oldalak, a diákoldalak és a nyitóoldal is).

### 13.1 A nyelv kiválasztása

1. a felhasználó választása (fejléc, belépő oldal; böngészőnként megmarad),
2. a böngésző nyelve, ha támogatott,
3. angol.

A nyelvváltás újratölti az oldalt. A magyar a **forrásnyelv**: új szöveg először oda kerül.

### 13.2 Mi hol fordul

| réteg | hogyan |
|---|---|
| **Felület** | szótári kulcsok (`t('kulcs')`, `data-i18n`); két szótárfájl azonos kulcskészlettel |
| **Státuszok, hibák, dátum** | kulcsok; a dátum a nyelv formátumában |
| **Szerver hibái** | a hibák magyar üzenetet **és** `details.kod`-ot hordoznak; magyar felületen a szerver szövege, más nyelven a kódból fordít a kliens |
| **AI-kimenet** | a feladat visszajelzés-nyelve (4.2, 8. fejezet); az instrukciók magyarul maradnak |
| **A feladat adata** (nyelv, típus, szint) | magyar kódszavak maradnak, a megjelenítés fordít |
| **Bemutató példaadata** | nyelvfüggő |

### 13.3 Amit szándékosan nem fordít a program

- **A tanár és a diák saját szövege** (feladatcímek, csoportnevek, szempontcímek, becenevek, a dolgozat, a tanári
  visszajelzés).
- **A beadás hibaállapotának szövege** technikai.
- **A szint-skála** magyar (13.5); a jegyskála feladatonként állítható.

### 13.4 Új nyelv felvétele (ellenőrzőlista)

1. új szótárfájl **azonos kulcsokkal és {helyőrzőkkel}**;
2. a nyelv felvétele az `i18n.js` szótárlistájába és a nyelvválasztóba;
3. a `kimeneti_nyelv` értékei és a promptok kimenet-nyelvet kérő mondatai (`kimenet()`, `functions/skala.js`), a
   feladatűrlap választója;
4. a kódszavas adat megjelenítése (`nyelv.*`, `tipus.*`, `szint.*` kulcsok);
5. a bemutató példaadata;
6. a tesztek (`tests/i18n.test.mjs`, `tests/kimenet.test.mjs`) hiba nélkül futnak.

### 13.5 Mi hiányzik még a nemzetközi használathoz

- **Évfolyam-skála:** az anyanyelvi dolgozat „évfolyam” listája a magyar iskolarendszerhez kötött.
- **Célpiac:** konkrét ország még nincs; ettől függ az angol nyelvváltozat, a skálák és a jogi környezet.
- **Adatvédelem:** adatkezelési tájékoztató, adatfeldolgozói megállapodás, feldolgozási régió (EU), országspecifikus
  szabályok. A prod diákadata álnevesített (becenév, szöveg), de a GDPR szerint továbbra is személyes adat lehet.
- **Az angol AI-visszajelzés minősége** valódi diákmunkával még nincs ellenőrizve.
