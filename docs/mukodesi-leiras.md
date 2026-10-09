# WritingReview – működési leírás

*Átadó dokumentum a Teacher's Arsenal fejlesztője számára. Állapot: 2026-10-01.*

Ez a dokumentum azt írja le, **mit tud a program és hogyan működik**: milyen
felületek vannak, mi történik egy-egy gombnyomásra, hogyan dolgozik az AI, és
milyen szabályok szerint számolja a pontokat. Technikai (stack-) leírás
szándékosan nincs benne; ahol egy technikai döntés a működést vagy a
tanulságokat érinti, ott röviden szerepel.

A 8. fejezetben **az összes AI-prompt szó szerint** megtalálható, a kimeneti
szerkezetekkel együtt. A 13. fejezet a **kétnyelvű (magyar/angol) felületet** és
a nemzetközi használat előkészítését írja le; ahol a többnyelvűség egy fejezet
tartalmát érinti, ott ez külön jelezve van.

## Tartalom

1. [Mi ez, és mire jó](#1-mi-ez-és-mire-jó)
2. [Fogalmak](#2-fogalmak)
3. [Belépés, szerepek, navigáció](#3-belépés-szerepek-navigáció)
4. [A tanári felület](#4-a-tanári-felület)
5. [A diák felülete](#5-a-diák-felülete)
6. [Az AI-folyamat: mi történik egy beadással](#6-az-ai-folyamat-mi-történik-egy-beadással)
7. [A kifejtős dolgozat részletesen](#7-a-kifejtős-dolgozat-részletesen)
8. [Az AI-promptok és kimeneti szerkezetek](#8-az-ai-promptok-és-kimeneti-szerkezetek)
9. [Adatmodell (logikai)](#9-adatmodell-logikai)
10. [Amit a próbák és a hibák megtanítottak](#10-amit-a-próbák-és-a-hibák-megtanítottak)
11. [Állapot, hiányok, félretett ötletek](#11-állapot-hiányok-félretett-ötletek)
12. [Mit érdemes átvenni](#12-mit-érdemes-átvenni)
13. [Többnyelvű felület és nemzetközi használat](#13-többnyelvű-felület-és-nemzetközi-használat)

---

## 1. Mi ez, és mire jó

A WritingReview **kézzel írt dolgozatok AI-val támogatott javítására** készült.
A diák lefényképezi a papírra írt dolgozatát, az AI kiolvassa a kézírást,
kiértékeli, a **tanár átnézi, szükség esetén módosítja, és jóváhagyja** – a diák
csak ezután látja az eredményt.

Két dolgozattípust kezel, a tanár választja ki feladatonként:

| | ✍️ **Fogalmazás** | 📝 **Kifejtős kérdések** |
|---|---|---|
| Mi ez | egy írásfeladat (esszé, levél, leírás…) | több rövid, kifejtős kérdés egy lapon (bármilyen tárgy) |
| Mit mér | nyelvi teljesítményt: tartalom, szerkezet, szókincs, nyelvtan | tartalmi tudást: megvan-e a válaszban a kulcs egy-egy eleme |
| Értékelés alapja | **rubrika**: súlyozott szempontok | **megoldókulcs**: kérdésenként elemek, pontértékkel |
| Ki adja a pontot | az AI szempontonként, a tanár módosíthatja | **a program** a kulcs és a tanári beállítások szerint; az AI csak azt mondja meg, hogy egy elem megvan-e |
| Az AI kimenete | pontszám + hibalista + visszajelzés | elemenkénti státusz + szó szerinti idézet a diák válaszából |
| Nyelv | angol, német, francia, spanyol, olasz, orosz, latin, magyar | a tanár tárgya (szabad szöveg) |
| Visszajelzés nyelve | magyar vagy angol (feladatonként állítható, lásd 4.3 és 13) | magyar vagy angol (ugyanígy) |

A **kifejtős kérdések** típus célja az a szegmens, amit a Redmenta-féle
digitális tesztelők nem fednek le: azok automatikusan javítható feladattípusokra
épülnek (feleletválasztós, párosítós, rövid válasz), a kifejtős dolgozatot
viszont eddig csak kézzel lehetett javítani. Egy ilyen dolgozatot könnyű
megírni, javítani viszont időigényes – ezt támogatja a program.

### Alapelvek

1. **Az AI javasol, a tanár dönt.** A diák semmit nem lát, amíg a tanár el nem
   küldi. Az AI nyers értékelése soha nem jut el a diákhoz.
2. **A számokat a program számolja, nem az AI.** Összpontszám, százalék,
   átlagok, hiányarányok, jegyjavaslat mind kódból jönnek. Kifejtős
   dolgozatnál az AI-nak **nincs is pont mezője** a kimenetében.
3. **Nincs pont idézet nélkül.** Az AI minden elfogadott elemhez szó szerinti
   idézetet ad a diák válaszából, és a program ellenőrzi, hogy az tényleg ott
   van-e. Ha nincs, az elem nem jár, a tanár jelzést kap.
4. **A pontozás szabályai a tanáréi.** Számít-e a sorrend, mennyire szigorú a
   szakszóhasználat – ezt sem az AI, sem a tananyag nem tudja eldönteni. Alapértékek
   vannak, a tanár átállíthatja.
5. **A megoldókulcs a határidő előtt sosem kerül a diák elé.**
6. **Ami mellé kézikönyv kell, az bukó.** A tanári út a lehető legrövidebb:
   feladatlap fel, tananyag fel, egy gomb, mentés. Minden részlet összecsukva
   van, jó alapértékekkel.

### Egy dolgozat útja (áttekintés)

```
TANÁR                                   RENDSZER                               DIÁK
─────                                   ────────                               ────
osztályt hoz létre  ───────────────►  osztálykódot ad (pl. 9BK-4M2T)
feladatot ad ki (feladatlap, rubrika    a feladat megjelenik az osztály   ◄──  kóddal csatlakozik az osztályhoz
   vagy megoldókulcs)                    minden diákjánál                       (egyszer)
                                                                           ◄──  lefényképezi a dolgozatot,
                                                                                feltölti (max. 10 oldal)
                                        ① AI átírja a kézírást szöveggé
                                        ② AI értékeli (rubrika / kulcs szerint)
                                        ③ a program kiszámolja a pontot
                                           státusz: „Ellenőrzésre vár"
átnézi: átirat, pontok, hibák,
   elemenkénti döntések – szükség
   szerint módosít, jegyet ad
„Elküldés a diáknak"  ─────────────►  a diák megkapja                  ────►  látja: jegy, pontok, visszajelzés,
                                                                               (kifejtősnél) mi lett volna a helyes
osztályszintű elemzést kér  ────────►  mit nem értett az osztály,
                                        javasolt gyakorlatok, kész prompt
```

Egy dolgozat kijavítása két AI-hívás (átírás + értékelés), nagyságrendileg
**5 Ft**. A diáknak a feldolgozás alatt nem kell nyitva tartania a böngészőt.

---

## 2. Fogalmak

| fogalom | jelentése |
|---|---|
| **Osztály** | a tanár csoportja (pl. „9.B angol"). Egyedi **osztálykódja** van. |
| **Osztálykód** | `XXX-XXXX` alakú (pl. `9BK-4M2T`), az összetéveszthető karakterek (I, O, 0, 1) nélkül. A diák egyszer írja be, onnantól tag. |
| **Feladat** | egy kiadott dolgozat egy osztálynak: cím, opcionális határidő, feladatlap, rubrika vagy kulcs. |
| **Feladatlap** | a kinyomtatott/megírandó feladat képe vagy PDF-je (JPG, PNG, PDF; max. 10 MB). Fogalmazásnál nem kötelező; kifejtősnél ebből olvassa ki az AI a kérdéseket. |
| **Rubrika** | *(fogalmazás)* az értékelési szempontok listája pontértékekkel. A diák látja. |
| **Megoldókulcs** | *(kifejtős)* kérdésenként a pontot érő elemek, szinonimákkal és beállításokkal. **Csak a tanár látja.** |
| **Tananyag** | *(kifejtős, nem kötelező)* amiből a diákok tanultak (PDF vagy kép). Ebből készül a kulcs; a diákok javításánál már nem használja a rendszer. |
| **Beadás** | egy diák dolgozata egy feladatra: 1–10 fotó. A felület feladatonként egy beadást enged diákonként. |
| **Átirat** | amit az AI a fotókból szöveggé olvasott. A tanár látja és összevetheti a fotóval – ebből derül ki, hogy a diák hibázott-e, vagy az AI olvasott félre. |
| **AI-értékelés** | az AI javaslata. Csak a tanár látja. |
| **Tanári visszajelzés** | amit a tanár jóváhagyott (pontok, jegy, szöveg). Ezt látja a diák. |

### A beadás státuszai

| státusz | jelentés | ki állítja át |
|---|---|---|
| `feltoltve` | a diák beadta, a feldolgozás még nem indult | a diák beadása |
| `folyamatban` | az AI dolgozik | a rendszer |
| `javitva` | az AI kész, **a tanár ellenőrzésére vár** | a rendszer |
| `elkuldve` | a tanár jóváhagyta, a diák látja | a tanár jóváhagyása |
| `hiba` | a feldolgozás elhasalt (a hibaüzenet olvasható) | a rendszer |

A diák nem tudja átállítani a saját beadása státuszát; csak a szerver írja.

---

## 3. Belépés, szerepek, navigáció

### Belépő oldal

Két fül: **Belépés** és **Regisztráció**.

- **E-mail + jelszó** vagy **Google-fiók**. Regisztrációnál kötelező a teljes
  név (a Google-nál a fiók neve jön), a jelszó legalább 6 karakter.
- **Mindenki diákként regisztrál** – kivéve a kereskedelmi (prod) telepítésben, ahol a
  regisztrációs fülön **„Diák vagyok / Tanár vagyok”** választó van (alapérték: diák; a
  pilotban nincs). Lásd lent: *Szerepek*. Sikeres belépés után a szerep szerint
  irányít át: diák → *Feladataim*, tanár → *Főoldal*.
- A hibák érthető üzenetek a felület nyelvén (hibás jelszó, már regisztrált
  e-mail, túl sok próbálkozás, hálózati hiba, blokkolt felugró ablak…).
- **Nyelvválasztó:** a jobb felső sarokban (belépés után a fejlécben) magyar és
  angol között lehet váltani; a választás a böngészőben megmarad. Alapértelmezés:
  a böngésző nyelve, ha támogatott (magyar böngésző → magyar), különben angol.
- **Telepíthető alkalmazás (PWA):** a belépő oldalon egy sáv felkínálja a
  főképernyőre telepítést (Androidon egy gombbal, iPhone-on a lépések
  leírásával). Telepített appból nem jelenik meg. Hálózat nélkül egy magyarázó
  oldal jön; a program nem működik offline (beadás, javítás hálózatot igényel).

### Szerepek

| szerep | mit tehet |
|---|---|
| **diák** | csatlakozik osztályhoz, feladatot lát, dolgozatot ad be, a saját elküldött visszajelzését olvassa |
| **tanár** | osztályt és feladatot hoz létre, a saját diákjai beadásait látja, javít, elemzést kér |
| **admin** | tanár mellett szerepeket oszt (külön jelző, nem külön szerep) |

**Tanárrá az admin nevezi ki** a *Szerepkezelés* oldalon (lásd 4.6) – a pilotban ez az
egyetlen út. Az első admint egy parancssoros szkripttel kell kinevezni. A
szerepváltás a felhasználó következő oldalbetöltésekor lép érvénybe; ha mégsem,
ki- és belépés után biztosan.

**Önkiszolgáló tanári regisztráció (csak prod).** A „Tanár vagyok” választással
regisztráló felhasználó profilja `tanari_kerelem: true` jelzést kap (ezt a szabályok
csak létrehozáskor engedik írni), majd a következők történnek:

1. E-mail+jelszó esetén megerősítő levelet kap (a felület nyelvén); a lap addig a
   „Erősítsd meg az e-mail-címed” nézetet mutatja (újraküldés, kilépés lehetséges).
   Google-fióknál az e-mail eleve megerősített.
2. A megerősítés után a kliens a `tanariRegisztracio` függvényt hívja. A **szerver**
   ellenőrzi: a környezetben be van-e kapcsolva, az Auth-rekordban megerősített-e az
   e-mail, van-e `tanari_kerelem` a profilban, és hogy a fiók nem lett-e már diákként
   használva (osztály tagja). Csak ezután állítja a `szerep: 'tanar'` claimet (az
   admin jelzőt megőrizve) és a Firestore-tükröt.
3. A kliens új tokent kér, és a tanári főoldalra lép.

Megszakadt regisztráció után (bezárt lap) a belépés ugyanebbe a nézetbe visz vissza.
A meglévő diákfiókok nem léptethetők elő önállóan (nincs `tanari_kerelem`); nekik
az admin marad, vagy új e-mail-címmel új, tanári fiók. A kvótát és a próbacsomagot
ez a lépés még nem érinti (lásd `kornyezetek-terv.md` 5.1).

Minden védett oldal belépéskor ellenőrzi a szerepet: rossz szereppel a saját
kezdőlapra irányít; ha a fiók tanárként szerepel, de a jogosultság még nincs
beállítva, magyarázó üzenetet ad néma átirányítás helyett.

### Navigáció

- **Tanári oldalsáv:** Főoldal · Osztályok · Feladatok · Javítási sor; adminnak
  még: Szerepkezelés. (A menüpontok és a vissza gomb felirata a felület nyelvén
  jelenik meg.)
- **Fejléc:** a márkanév a főoldalra visz; van „vissza" gomb, ami a **logikai
  szülőre** lép (nem a böngésző előzményeire – telepített appban, mélylinkről
  indulva az nem oda vinne, ahova a felhasználó számít). Nyitott ablaknál a
  vissza gomb előbb az ablakot zárja.
- **Beépített bemutató (villanykörte a fejlécben):** a tanár első belépésekor
  menü nyílik, utána a villanykörtével hívható. Négy szakasz (osztály, feladat,
  javítás, elemzés), 22 lépés, reflektorfénnyel a valódi felületen, a felület
  nyelvén (a példaadat – osztály, diákok, javítás, elemzés – is nyelvfüggő). A javítás és
  az elemzés példaadattal mutatkozik, mert új tanárnál még nincs beadás. Csak
  tanároknak jelenik meg magától.

---

## 4. A tanári felület

### 4.1 Főoldal

Négy számláló, mindegyik a megfelelő oldalra visz:

| számláló | tartalom |
|---|---|
| Ellenőrzésre vár | a `javitva` státuszú beadások száma → Javítási sor |
| Aktív feladatok | a nem lezárt feladatok → Feladatok |
| Osztályok | → Osztályok |
| Összes diák | az osztályok létszámának összege → Osztályok |

Alatta négy modulkártya rövid leírással: Osztályok, Feladatkezelés, Javítási sor,
Osztályszintű elemzés (ez a feladatlistából érhető el, a 📊 gombbal).

### 4.2 Osztályok

**Új osztály:** név beírása (max. 100 karakter) → *Létrehozás*. A rendszer
generál egy egyedi osztálykódot, és kiírja: „Létrehozva! Osztálykód: … – ezt add
meg a diákoknak."

**Az osztályok listája** (élő frissítéssel): név, kód, létszám, létrehozás
dátuma, „Aktív / Zárt" jelző. Gombok:

| gomb | mit csinál |
|---|---|
| 📋 **Kód** | a kódot a vágólapra másolja („✅ Másolva!" visszajelzéssel) |
| 👥 **Névsor** | lenyitja a tagok táblázatát (név, e-mail, csatlakozás ideje); újra megnyomva összecsukja. Egyszerre egy névsor lehet nyitva. |
| ✕ *(a névsorban)* | **diák eltávolítása** az osztályból. Megerősítést kér, és elmondja: a diák korábbi beadásai és visszajelzései **megmaradnak**, csak új feladatot nem lát, beadni nem tud; a kóddal bármikor újra csatlakozhat. |
| ⏸ **Zárás** / ▶ **Nyitás** | a zárt osztályhoz nem lehet új diákként csatlakozni („Ez az osztály már nem fogad új diákokat") |
| 🗑 | törlés megerősítéssel; a feladatok és beadások megmaradnak. A felület figyelmeztet: szüneteltetéshez a Zárás való. |

Ha a diák a kódját újra beírja, aki már tag, azt kapja: „Már tagja vagy az
osztálynak."

### 4.3 Feladatok

A lap tetején az **➕ Új feladat** gomb nyitja az űrlapot (ismét megnyomva
bezárja). Ha a tanárnak még nincs osztálya, figyelmeztetés jelenik meg a
létrehozás linkjével.

#### Az űrlap közös részei

| mező | leírás |
|---|---|
| Osztály | melyik osztálynak szól. Meglévő feladatnál **nem módosítható** (a beadások ahhoz tartoznak); másik osztálynak a *Kiadás* funkció való. |
| Határidő | nem kötelező, dátum. **Tájékoztató jellegű**: a rendszer a lejárt határidő után sem tiltja a beadást, csak jelzi a diáknak („lejárt"). A beadás akkor szűnik meg, ha a tanár *lezárja* a feladatot. |
| Cím | max. 200 karakter |
| A feladat fajtája | két nagy gomb: **✍️ Fogalmazás** / **📝 Kifejtős kérdések**. A tanár választ; nincs AI-felismerés. Mentés után **nem változtatható**. |
| Feladatlap | kép vagy PDF (JPG, PNG, PDF, max. 10 MB). A képeket a böngésző feltöltés előtt kisebbre méretezi. |
| A visszajelzés nyelve | **magyar** vagy **angol**. Ezen a nyelven készül a diáknak szóló AI-visszajelzés, a hibamagyarázatok, a szempontcímek (rubrika-javaslatnál) és a tanári osztályelemzés. Alapértéke a tanár felületi nyelve; **feladatonként** mentődik (`rubrika.kimeneti_nyelv`), nem része a rubrika-sablonnak. Régebbi feladatnál nincs ilyen mező: az **magyar**. |
| Jegyskála | **Magyar 1–5**, **A–F**, **Százalék** vagy **Egyéni…**; mindkét feladattípusnál. Fokozatonként megadható, hány %-tól jár (a legalsó 0%; egyénin a jegyek szabadon nevezhetők, legfeljebb 8 karakter, 2–15 fokozat). A javító nézet erre a skálára kínálja a jegyeket, kifejtős dolgozatnál erre javasol is. Feladatonként mentődik (`rubrika.skala`, lásd 7.8); az utoljára használt skála a következő új feladat alapértéke (böngészőnként). Régi feladatnál nincs ilyen mező: a korábbi ponthatárokból magyar 1–5 lesz. |
| A feladat leírása | szabad szöveg; a diák látja, és az AI is használja |

#### Fogalmazás – az űrlap és a rubrika

1. **Feladatlap feltöltése (nem kötelező).** Feltöltéskor a rendszer AI-val
   *rubrika-javaslatot* készít belőle (8.1 prompt): kitölti a **címet** (ha még
   üres), a **nyelvet**, a **típust**, a **szintet**, a **szószám-határokat**, a
   **szempontokat pontokkal** és a **feladat leírását**. A rubrika fölött
   „✨ AI által kitöltve" jelzés látszik, a feltöltés alatt pörgő „Gemini elemzi a
   feladatlapot…" jelzéssel. Ha az AI más nyelvet lát a lapon, mint amit a tanár
   jelölt, átállítja és szól. Feladatlap nélkül a rubrikát kézzel kell
   megadni (alap: tartalom 30, szerkezet 20, szókincs 25, nyelvtan 25).
2. **A rubrika mezői:**
   - *Nyelv* (8 nyelv) és *típus* (esszé, levél, leírás, elbeszélés, vélemény, egyéb);
   - *Szint* – **a skála a nyelvtől függ**: idegen nyelvnél CEFR (A1–C1),
     magyarnál évfolyam (5-6. évf. … érettségi emelt). „Nem releváns" is
     választható: ilyenkor a prompt egyáltalán nem említ szintet, és megtiltja az
     AI-nak, hogy kitaláljon egyet (lásd 8.3);
   - *Minimum/maximum szószám*;
   - *Szempontok*: kulcs (rövid azonosító), megjelenő cím, pontszám. A pontszám
     **szabadon választható** (20, 50, 100…); az összeg élőben látszik. Az AI
     javaslata 100 pontos, a tanár átírhatja;
   - *Külön kérés az AI-nak* (nem kötelező): szabad szöveg, bekerül az
     értékelő promptba (pl. „A múlt idő használatára figyelj külön.").
3. **Rubrika-sablonok:** a rubrika újrahasznosítható része (nyelv, típus, szint,
   szószám, szempontok, AI-kérés – a feladat leírása **nem**) elmenthető
   névvel („💾 Mentés sablonként"; azonos névnél felülírás-megerősítés), a
   legördülőből betölthető, a 🗑 törli. A sablonok tanáronként külön vannak.
4. **Mentés ellenőrzései:** osztály kiválasztva; cím megadva; legalább egy
   szempont; a pontok összege > 0; a minimum szószám nem nagyobb a maximumnál.

A diák a rubrikát (szempontok, pontok, leírás) **látja** – tudja, mi alapján
értékelik.

#### Kifejtős kérdések – az űrlap

Részletesen a [7. fejezetben](#7-a-kifejtős-dolgozat-részletesen). Röviden a
tanár útja:

```
① Feladatlap feltöltése         – a dolgozat kérdései (kép/PDF)
② Tananyag feltöltése           – nem kötelező; legfeljebb 5 fájl
③ [✨ Megoldókulcs készítése]   – egy AI-hívás; kb. fél perc
④ „✅ Kész a megoldókulcs: 10 kérdés, 30 pont. ⚠ 2 elemnél az AI bizonytalan volt."
   [Megnézem, szerkesztem ▸]    – összecsukva: kérdéskártyák, beállítások
⑤ Mentés
```

#### A feladatok listája

Minden feladat egy kártya: cím, osztály, meta-sor (fogalmazásnál *nyelv · típus
· szint*; kifejtősnél *📝 tantárgy · N kérdés*), határidő, „Aktív / Zárt" jelző.
Élő frissítés. Gombok:

| gomb | mit csinál |
|---|---|
| 👁 **Megtekintés, kivetítés** | **Vetítés-nézet** órai kivetítésre: a cím, a szószám-elvárás, a határidő, a feladat leírása és a feladatlap – a szerkesztő és a **rubrika pontjai nélkül**, a tanári AI-kérés sem kerül a táblára. A feladatlap kép esetén közvetlenül, PDF-nél beágyazva látszik (a PDF-néző eszköztára rejtve). Ha van leírás, a feladatlap alapból csukva van, egy „📄 Feladatlap mutatása" gomb nyitja. `F` = teljes képernyő, `Esc` = bezárás. |
| 📊 **Osztályszintű elemzés** | az elemzés oldalra visz (4.5) |
| ✏️ **Szerkesztés** | ugyanaz az űrlap, előtöltve. Az osztály és a fajta zárolva. Mentés után a **korábbi értékeléseket nem írja át**; ha az új rubrikával/kulccsal akarod őket, a Javítási sorban újra kell futtatni. |
| 📤 **Kiadás másik osztálynak** | ugyanaz az űrlap, minden adat átvéve (feladatlap, rubrika/kulcs), **új dokumentumként** mentődik. Másik osztályt kell választani, a határidő törlődik (újat kell adni). |
| ⏸ **Zárás** / ▶ **Nyitás** | lezárt feladatra a diák nem adhat be; a már beadottak láthatók maradnak |
| 🗑 | törlés megerősítéssel; a beadások megmaradnak |

### 4.4 Javítási sor

A tanár ide érkezik a beadások ellenőrzésére.

**Szűrők:** 📝 Ellenőrzésre vár *(alapértelmezett)* · ⚙️ Feldolgozás alatt · 📧
Elküldve · ⚠️ Hibás · Mind.

**A lista kártyái** (élő frissítéssel, a státusz magától változik): a diák neve,
a feladat címe, dátum, státusz-jelző; elküldött beadásnál a pontszám és százalék
(`📊 17/20 pont · 85%`) és a jegy; „✍️ nehezen olvasható" jelző, ha az AI szerint
gyenge volt a kézírás; hibás beadásnál a hibaüzenet. Gombok:

| gomb | mit csinál |
|---|---|
| **Megnyitás** | megnyitja a részletes ablakot (lent) |
| 🔄 **Újra** | *(hibás vagy ellenőrzésre váró beadásnál)* újra lefuttatja a teljes feldolgozást (átírás + értékelés), és felülírja az előzőt. Ha a rubrika/kulcs változott, vagy elhasalt az AI, ezt kell használni. Feldolgozás alatt lévőre nem indítható. |

#### A részletes ablak

Fentről lefelé:

1. **📷 Beadott fotók** – kattintásra nagyban megnyílnak.
2. **✍️ Amit az AI kiolvasott** – az átirat szövege, az olvashatóság-jelző
   (`jo` / `kozepes` / `gyenge`) és az AI megjegyzése. Figyelmeztet: ha ez nem
   egyezik a fotóval, az AI félreolvasott – ne a diákot hibáztasd.
3. **Az értékelés**
   - *Fogalmazás:* 🤖 **AI értékelés** – a szempontok táblázata (pont / max,
     megjegyzés), az összpontszám és százalék; **talált hibák** (kategória ·
     címke, a diák szó szerinti idézete → javaslat, magyarázat); erősségek;
     fejlesztendő.
   - *Kifejtős:* 📝 **Kérdésenként** – lásd 7.9.
4. **📧 Visszajelzés a diáknak** – ezt (és csak ezt) látja majd a diák:
   - *Fogalmazás:* **pontozási táblázat**, szempontonként szerkeszthető pont
     (0 és a szempont maximuma között) és megjegyzés, élő összeggel. A
     szempontok vázát és a maximumokat a tanár nem írhatja át, az összeget a
     szerver számolja.
   - **Jegy** (a feladat skáláján; vagy nincs jegy). Fokozatos skálánál legördülő, százaléknál
     számmező (0–100). Kifejtősnél a rendszer javaslatot ír mellé, és addig előtölti, amíg a tanár
     maga nem választ.
   - **Szöveges visszajelzés** – előre kitöltve az AI javaslatával (a feladat
     visszajelzés-nyelvén – 4.3 –, barátságos, konstruktív, az erősségekkel kezdve, pontszám és jegy nélkül);
     már elküldött beadásnál a korábbi szöveg. Szerkeszthető.
   - **📧 Elküldés a diáknak** (elküldött beadásnál „🔄 Módosítás elküldése" –
     az elküldés után is javítható).

**Mi történik az „Elküldésre"?** A szerver ellenőrzi a jogosultságot (csak a
saját diákod beadását küldheted), hogy a szöveg nem üres és a jegy szerepel a feladat
skáláján, majd egyszerre **kiírja a tanári visszajelzést és átállítja a státuszt
`elkuldve`-re**. Ettől kezdve a diák látja. Kifejtős dolgozatnál a szerver a
tanár által **felülírt elemstátuszokból újraszámolja a pontot a kulcsból** – a
böngésző pontot nem küldhet.

### 4.5 Osztályszintű elemzés

A feladatlistában a 📊 gombbal nyílik (`elemzes` oldal, az adott feladatra).

**Első megnyitás:** „Ehhez a feladathoz még nincs elemzés" + **✨ Elemzés
készítése** gomb (csak akkor, ha van kiértékelt beadás; 3-nál kevesebbnél
figyelmeztet, hogy a kép még nem osztályszintű).

**Az elemzés tartalma** (mentve van, nem generálódik újra minden megnyitáskor;
új beadások után a **🔄 Elemzés újrafuttatása** gombbal frissíthető):

| blokk | tartalom | ki számolja |
|---|---|---|
| Kártyák | osztályátlag, kiértékelt dolgozatok száma, nehezen olvasható beadások száma | **program** |
| *Fogalmazás:* Szempontonként | szempontonkénti átlagpont és százalék, sávval, a legrosszabbal kezdve | **program** |
| *Kifejtős:* Kérdésenként | kérdésenkénti átlag, a legrosszabbul sikerült elöl; lenyitva elemenként, hányan hagyták ki / írták tévesen / részben / rossz helyen | **program** |
| *Kifejtős:* Amit a legtöbben kihagytak | a kulcs elemei a leggyakrabban hiányzóval kezdve, legfeljebb 10; csak az, ami a diákok **legalább negyedénél** hiányzott (az egyéni hiba nem osztályszintű) | **program** |
| 🧭 Összegzés | 2–3 bekezdés a tanárnak: mi ment jól, mi hiányzik rendszerszinten | **AI** |
| 🔁 Típushibák / Közös hiányok és tévedések | jelentés szerint összevont hibák gyakoriság-jelzéssel (általános / gyakori / szórványos), kategóriával és diákidézetekkel | **AI** |
| 🎯 Javasolt gyakorlatok | 3–5 konkrét órai gyakorlat: cím, cél, leírás, időtartam | **AI** |
| ✨ Feladatgeneráló prompt | egy **kész prompt**, amit a tanár bemásolhat bármelyik AI-ba, hogy ismétlő feladatsort generáljon az osztály konkrét hibáira; 📋 Másolás gombbal | **AI** |

**Munkamegosztás oka:** az aritmetikát nem bízzuk a modellre; az AI a
csoportosításban és a javaslatokban jó. A hibacímkék elcsúszhatnak
(`article_missing` / `missing_article`), ezért a program csak gyakoriságot
számol, az összevonást az AI végzi a **jelentés** alapján.

Kifejtősnél diákonként az számít, amit a diák **ténylegesen kapott**: ha a tanár
már jóváhagyta, az ő (felülírt) döntései, különben az AI-é.

### 4.6 Szerepkezelés (admin)

Három számláló (tanárok, diákok, adminok), keresőmező (név vagy e-mail), szűrő
(mindenki / csak tanárok / csak diákok / csak adminok), lista. Soronként:

| gomb | hatás |
|---|---|
| ↑ **Tanárrá** / ↓ **Diákká** | megerősítés után szerepet vált. Tanári jog elvételekor a létrehozott osztályok és feladatok megmaradnak, de a felhasználó nem fér hozzájuk. |
| 🔑 **Admin fel / le** | admin jog adása/elvétele |

Védelmek: **a saját admin jogodat nem veheted el** (különben admin nélkül
maradhatna a rendszer); a listában „⏳ belépés kell" jelzi, ha valakinek a
jogosultsága még a régi (elavult token). A felhasználók listáját csak ez a
felület éri el.

### 4.7 AI-használat és költség (admin)

*Admin menü → 📈 AI-használat. Mindkét telepítésen (pilot és prod) működik; csak mér, semmit nem korlátoz.*

**Mit mér.** Minden Gemini-hívásról egy rekord készül az `ai_hasznalat` gyűjteménybe: melyik tanár,
melyik művelet, melyik modell, és hány token ment (bemenet, kimenet, gondolkodás), a kép- és
bájtszám, az újrapróbálkozások száma, és hogy tartalék modell dolgozott-e. A rekord **nem tartalmaz
diákmunkát vagy szöveget**, csak azonosítókat és számokat. A mérés hibája sosem akadályozza a
javítást. A rekordokat kliens nem éri el, az admin csak az összesítést látja.

**Hány hívás van?** Beadásonként **2** (átírás a fotóról + értékelés a szövegből), egy javítási futás ennyi.
Egy-egy hívás: a leveles feladat létrehozásakor a feladatlap-feltöltésnél (rubrika-javaslat), a kifejtősnél
a „Kulcs készítése” gombra (megoldókulcs), és az osztályelemzéskor.

**Az oldal.** Hónap szerint: hívásszám, becsült költség (USD), költség egy dolgozatra (leveles, kifejtős,
összesen), műveletek, modellek, tanárok és a legdrágább feladatok szerinti bontás. A költséget a
`functions/ai-hasznalat.js` **ár-táblája** adja a tokenekből (USD / 1 M token; ismeretlen modellnél üres,
és az oldal jelzi). A **számoló** a mért átlagból dolgozik, és két dolgot ad: (1) a **beírt csomagár eredményét** (AI-költség, fizetési díj,
nettó bevétel, árrés, nullpont), és (2) egy **ajánlott csomagárat a célárréshez**, csomagméretenként (10–500 dolgozat).
Modell: a vevő a bruttó (áfás) árat fizeti; nettó bevétel = bruttó / (1 + áfa); a fizetési díj a teljes összegből
megy (díj% + fix); árrés = nettó − díj − AI-költség. Az ajánlott ár = (fix + AI-költség) / ((1 − célárrés)/(1 + áfa) − díj%),
felfelé kerekítve 0,5 €-ra. A Stripe magyarországi alapdíjai előre beállítva (standard EGT-s kártya 1,5% + 85 Ft,
prémium EGT-s 2,8%, brit 2,5%, nem EGT-s 3,15%, előfizetés-kezelés +0,7%, valutaváltás +2%; forrás: stripe.com/en-hu/pricing,
2026-10), de mind átírható; az áfa alapértéke 27%. Az árfolyamok és az ár-szorzó is átírhatók (a 3.8 Flash ára a kód kommentje
szerint 2027-01-01-től duplázódik). A képletek a `public/js/arszamolo.js`-ben vannak, tesztelve (`tests/arszamolo.test.mjs`).
**Nincs benne:** az ingyenes csomagok költsége, a nem kihasznált keret (az javít rajta), hosting, könyvelés, működési költség;
az EU-s áfa a vevő országa szerint változhat – könyvelővel egyeztetni kell.

---

## 5. A diák felülete

### 5.1 Feladataim

1. **Saját név:** „A tanárod ezen a néven látja a dolgozataidat" + *Módosítás*.
   A név mentése frissíti az osztálynévsort és a korábbi beadásokat is, hogy a
   tanár ne a régi nevet lássa.
2. **🔑 Csatlakozás osztályhoz:** az osztálykódot (`9BK-4M2T`) elég egyszer
   beírni. A kód formátumát a program ellenőrzi; hibás/ismeretlen kódnál, zárt
   osztálynál érthető üzenetet kap. A csatlakozott osztályok címkékként látszanak.
3. **📝 Beadható feladatok:** a csatlakozott osztályok **aktív** feladatai,
   határidő szerint rendezve (a határidő nélküliek a végén). Soronként: cím,
   osztály, típus/szint (fogalmazás) vagy 📝 tantárgy (kifejtős), szószám,
   határidő („lejárt" jelzéssel), „✅ Beadva" jelző; gomb: *Beadás* vagy
   *Megnyitás*.
4. **📂 Beadásaim:** élő lista, státusz-jelzőkkel („⏳ Beadva", „⚙️ Feldolgozás
   alatt", „👀 Tanári ellenőrzés alatt", „✅ Visszajelzés kész", „⚠️ Hiba – szólj a
   tanárnak"). A kész beadásra kattintva a visszajelzés nyílik.

### 5.2 Beadás

A feladat oldalán:

- **📐 Mi alapján értékelnek:** a feladat leírása; fogalmazásnál a szempontok és
  pontjaik táblázata; kifejtősnél a kérdések sorszáma és pontja (a kérdések
  szövege a feladatlapon van); 📄 link a feladatlaphoz.
- **Ha már van beadása:** a státusz-panel (lent).
- **Ha a feladat lezárt, és még nem adott be:** „Ez a feladat már zárt, nem lehet
  rá beadni."
- **Egyébként a feltöltés:** fotózási tanács (a **teljes lap** legyen a képen, a
  széleivel együtt – a levágott szöveg elvész; a **hátoldalt** is le kell
  fotózni, ha oda folytatódik a válasz; árnyék és vaku-csillanás nélkül). Fájlválasztó
  (telefonon a hátsó kamera), előnézeti képek törlési lehetőséggel, **legfeljebb
  10 oldal**. A képeket a program feltöltés előtt lekicsinyíti (hosszabbik oldal
  legfeljebb 1500 px, JPEG); 10 MB fölötti fájlt elutasít.
- **📤 Beadás:** a képek egyesével töltődnek fel („2/3 oldal…"), majd létrejön a
  beadás. **A beadás után a dolgozat nem cserélhető ki.** A feldolgozás a
  háttérben fut; a diáknak nem kell maradnia.

**A státusz-panel** élőben frissül, és mindegyik állapotot elmagyarázza („Az AI
épp olvassa a dolgozatodat. Ez néhány percet vehet igénybe – nem kell itt
maradnod." / „Az AI végzett, most a tanárod ellenőrzi." …). Ha az AI már
kiolvasta, a *„Mit olvasott ki az AI a kézírásodból?"* lenyitható rész mutatja az
átiratot azzal, hogy eltérésnél szóljon a tanárnak.

### 5.3 Visszajelzés

Amíg a tanár nem küldte el, egy magyarázó állapotoldal látszik (a diák semmit
nem olvashat előre – ezt az adatbázis szabályai is kikényszerítik). Elküldés után:

1. **Jegy** (ha adott).
2. **💬 A tanárod visszajelzése** – a szöveg és az elküldés dátuma.
3. **📊 Pontozás**
   - *Fogalmazás:* szempontonként pont, maximum és a tanár megjegyzése; összesen,
     százalék, jegy.
   - *Kifejtős:* **kérdésenként** a pont, elemenként: ✓ amit jól írt (a diák
     saját szavaival „Te: …"), ½ amit részben (mellette „Helyesen: …"), ✕ ami
     hiányzott vagy téves (mellette „Helyesen: …"), ↕ ami jó, de sorrendnél nem a
     helyén van. A visszajelzés így egyben **javítókulcs**. Ha a tanár kikapcsolta
     a helyes válaszok megjelenítését, a helyes megoldás **egyáltalán nem kerül a
     diák dokumentumába**; ilyenkor csak a pontokat és a saját szavait látja.
4. **✍️ A dolgozatod, ahogy az AI kiolvasta** (átirat).

---

## 6. Az AI-folyamat: mi történik egy beadással

A beadás létrejötte **automatikusan elindítja** a feldolgozást (a diáknak nem kell
várnia). Két AI-hívás, közte mentés:

```
feltoltve ─► folyamatban ─► [1. hívás: átírás] ─► az átirat mentve ─► [2. hívás: értékelés]
                                                                          │
                                       a program pontoz, ellenőriz ◄──────┘
                                                │
                                             javitva  ──(tanár jóváhagyja)──►  elkuldve
        bármelyik lépésben hiba ─► hiba (olvasható üzenettel; a tanár „Újra"-t nyomhat)
```

**Az átirat külön lépés és külön mentés,** hogy a tanár lássa, mit olvasott ki az
AI. E nélkül nem lehet eldönteni, hogy a diák hibázott vagy az AI olvasott félre.
Az értékelés a **szövegből** dolgozik (nem a képekből), így egy módosított
rubrika után fillérekért újrafuttatható.

### Fogalmazás

1. **Átírás** (8.2): a fotók sorrendben → a dolgozat szó szerinti szövege, a hibák
   javítása nélkül. Kimenet: átirat, olvashatóság (jó/közepes/gyenge), megjegyzés.
2. **Értékelés** (8.3): az átirat + a rubrika → szempontonkénti pont és megjegyzés,
   hibalista (kategória, gépi címke, idézet, javaslat, magyarázat), erősségek,
   fejlesztendő, a diáknak szóló visszajelzés-javaslat, szószám. A **program
   számolja** az összpontszámot, a maximumot és a százalékot.

### Kifejtős

1. **Előfeltétel:** a feladathoz tartozik megoldókulcs; enélkül a beadás hibára
   fut („A feladathoz még nincs megoldókulcs").
2. **Átírás** (8.6): kérdésenkénti szerkezetben. A kulcs kifejezéseiből
   **szószedetet** kap olvasási segítségnek, azzal a kifejezett figyelmeztetéssel,
   hogy ez nem megoldókulcs. Kimenet: válaszok kérdésenként (a máshol folytatódó
   válasz a saját kérdéséhez fűzve), táblázatok cellánként, bizonytalan szavak.
3. **Értékelés** (8.7): a válaszok + a kulcs → **elemenként státusz**
   (`megvan` / `reszben` / `hianyzik` / `teves`), szó szerinti idézet, sorrendnél
   pozíció, választós kérdésnél a választott ág, kulcson kívüli tételek, tartalmi
   hibák, kérdésenkénti megjegyzés, a diáknak szóló visszajelzés-javaslat.
   **Pontot az AI nem ad.**
4. **Program:** idézet-ellenőrzés → pontozás → jegyjavaslat (lásd 7.6–7.8).

### Hibakezelés és modellek

- **Átmeneti hiba** (túlterhelt modell, „high demand"): a program
  **háromszor újrapróbál**, növekvő várakozással; ha a lépéshez van tartalék
  modell, azzal folytatja. Tartalék az átírásnál és a rubrika-javaslatnál van
  (két régebbi/olcsóbb modell), az **értékelésnek szándékosan nincs**: ha az
  egyik diákot az egyik, a másikat egy másik modell pontozná, sérülne az
  összehasonlíthatóság. Inkább `hiba` státuszba kerül, és a tanár újrafuttatja.
- **Véglegesnek tűnő hiba** (hibás kérés, jogosultság): nincs ismétlés.
- Minden feldolgozás rögzíti, **melyik modell válaszolt ténylegesen** (átírás és
  értékelés külön), nem a beállított főmodellt.
- **Modellek:** jelenleg minden lépés ugyanazt a gyors, általános modellt
  használja (Gemini Flash-osztály); lépésenként külön állítható. Az átírás a
  legkényesebb lépés (a félreolvasott kézírás rosszul értékelt dolgozatot ad).
- **Kimenet:** minden hívás **strukturált JSON**-t kér (válasz-séma megadásával),
  alacsony hőmérséklettel (0,2). Szövegparse-olás sehol nincs.
- **Költség:** egy dolgozat (2 fotó, ~250 szó, két hívás) nagyságrendileg
  **5 Ft**.
- **Adatvédelem:** kiskorúak kézírásmintái mennek az AI-hoz, ezért **fizetős
  szintű API-kulcs kell** (az ingyenes szinten a szolgáltató felhasználhatja a
  tartalmat). A feldolgozási régió megszabása (EU) tervbe van véve.
- **Nyelv:** az AI-nak szóló *instrukciók* magyarul vannak (a modell ezt
  jól kezeli); a **kimenet nyelvét** a feladat `kimeneti_nyelv` mezője adja
  (magyar vagy angol, 4.3), a dolgozat nyelvétől függetlenül. Régebbi feladatnál
  magyar. A promptoknak csak a kimenet nyelvét kérő mondatai változnak (8. fejezet
  bevezetője).

---

## 7. A kifejtős dolgozat részletesen

### 7.1 Mikor való

Ha a dolgozat **több rövid kérdésből** áll, és a válaszok **kulcsgondolatokra
bonthatók** (felsorolás, definíció, folyamat, táblázat, rövid magyarázat).
Bármilyen tárgyra – szakmai, történelem, irodalom. **Nem való** véleményt,
érvelést kérő feladatra („Mit gondolsz Ady szerelemfelfogásáról?"): ott nincs
kulcsgondolat, az a Fogalmazás rubrikás értékelésébe tartozik.

### 7.2 A tanár útja az űrlapon

1. **Feladatlap:** feltöltés (a kérdések képe/PDF-je). Ez nem indít AI-t.
2. **Tananyag** *(nem kötelező)*: kattintás vagy behúzás, **legfeljebb 5 fájl**,
   PDF vagy kép, fájlonként 10 MB; a feladatlappal együtt legfeljebb 14 MB. A fájlok listája
   törlési lehetőséggel látszik. Word/PowerPoint fájlt előbb PDF-be kell menteni.
3. **✨ Megoldókulcs készítése:** egyetlen AI-hívás, a feladatlap és a tananyag
   együtt (8.5). Feltöltés nélkül hibaüzenet magyarázza, mi hiányzik.
   - Az AI **először azt dönti el, feladatlap-e a feltöltött fájl.** Ha nincsenek
     rajta a diáknak szóló kérdések (pl. a tanár a tananyagot töltötte a
     feladatlap helyére), a rendszer **nem gyárt kérdéseket**, hanem megmondja:
     „A feltöltött feladatlapon nem találtam kérdéseket – tananyagnak vagy
     jegyzetnek tűnik…".
   - Kitölti a feladat **címét** (ha üres), a **leírását** (ha üres) és a
     **tantárgyat** (ha üres).
   - Ha egy kérdéshez nem tudott kulcsot adni, kiírja, melyikhez kell kézzel
     pótolni.
4. **Összefoglaló sor:** „✅ Kész a megoldókulcs: N kérdés, M pont." + jelzések:
   *tananyag nélkül készült* (az AI a saját tudásából dolgozott); *⚠ N elemnél az
   AI bizonytalan volt*; *a feladatlap vagy a tananyag azóta változott – ha az új
   alapján kell, készítsd újra*.
5. **Megnézem, szerkesztem** *(összecsukva)*:
   - **Kérdéskártyák:** sorszám, típus, max. pont, a kérdés szövege; alatta a
     kulcs elemei. Elemenként: *Amit le kell írnia* | *Így is elfogadható*
     (`;`-vel elválasztott változatok, nem kötelező) | *Pont*; ↑ feljebb, ✕ törlés,
     ＋ Elem. A mezők a tartalmukhoz nőnek. Jelzések: **⚠ „nézd meg – kész ✓"** a
     bizonytalan elemen (kattintással jóváhagyható), **„nem a tananyagból"**
     (csak akkor, ha volt tananyag: az AI a saját tudásából vette), a kérdés
     tetején az AI megjegyzése (pl. „a tananyag ellentmond önmagának").
     Figyelmeztet, ha az elemek pontjai nem érik el a kérdés maximumát.
     Típusváltáskor a szerkezet átalakul (pl. választós ↔ ágak nélküli).
   - **＋ Kérdés** és **„vagy összeállítom kézzel"** (AI nélküli kulcsépítés).
   - **Kérdésenkénti beállítások** (alapérték előre kitöltve): *Rossz sorrend*
     (csak sorrendes kérdésnél), *Szakszóhasználat*, *A részben jó válasz*,
     *Kulcson kívüli tétel* (csak nyílt felsorolásnál) – lásd 7.5.
   - **Tantárgy** (a ponthatárok helyét a közös **jegyskála** vette át, lásd 4.3 és 7.8),
     **„A diák a visszajelzésében lássa a helyes válaszokat"** kapcsoló (alapból
     be; kapcsold ki, ha a dolgozatot jövőre is íratni fogod, különben a megoldás
     kiszivároghat).
6. **Mentés:** a kulcsot a böngésző **ugyanazzal a függvénnyel ellenőrzi, mint a
   szerver** (ismétlődő sorszám/elemazonosító, érvénytelen pont, ismeretlen típus
   vagy beállítás, üres kérdés…), hibánál megnyitja a részleteket és megnevezi a
   hibát. A feladat és a kulcs **egyetlen lépésben** mentődik – nem létezhet
   olyan pillanat, amikor a diák már beadhat, de a javításhoz még nincs kulcs.
   Az újrakészítés (↻) megerősítést kér, mert felülírja a mostani kulcsot a
   módosításokkal együtt.

**Amit a diák lát a feladatból:** a leírást, a kérdések sorszámát és pontját, a
feladatlap linkjét. A **kulcsot és a tananyagot soha**.

### 7.3 A megoldókulcs szerkezete

```
kulcs
 ├─ kerdesek[]
 │    ├─ sorszam            "1", "2a"…  (egyedi)
 │    ├─ szoveg             a kérdés szövege
 │    ├─ tipus              lásd 7.4
 │    ├─ max_pont
 │    ├─ elemek[]           a pontot érő tartalmak
 │    │    ├─ id            a rendszer adja (e1, e2…), nem az AI
 │    │    ├─ allitas       röviden, ahogy egy jó diákválaszban szerepelne
 │    │    ├─ pont          (alap: 1)
 │    │    ├─ elfogadhato[] szinonimák, más elfogadható megfogalmazások
 │    │    ├─ forras        "tananyag" | "altalanos" | "tanar" (kézzel felvett)
 │    │    └─ ellenorizendo az AI bizonytalan volt-e
 │    ├─ agak[]             csak „választós" kérdésnél: { id, cim, elemek[] }
 │    ├─ beallitas          lásd 7.5
 │    └─ megjegyzes         az AI jelzése a tanárnak
 ├─ szoszedet[]             az elemekből és szinonimákból a program gyűjti (az átíráshoz)
 └─ tananyag[], tananyagbol, model, generalva, modositva
```

### 7.4 Kérdéstípusok és pontozásuk

| típus | példa | pontozás (program) |
|---|---|---|
| `zart_felsorolas` | „Sorold fel a három feltételt!" | az elemek pontjainak összege |
| `nyilt_felsorolas` | „Írj legalább 4 kockázatot!" | a talált elemek + az elfogadott, kulcson kívüli helyes tételek (**1–1 pont**), a kérdés maximumáig. A kulcsban minden elfogadható tétel szerepel, a max. pont a kért darabszám. |
| `sorrend` | „Írd le a kárrendezés lépéseit!" | a **sorrend-beállítás** szerint (7.6) |
| `tablazat` | kitöltendő táblázat | cellánként egy elem (az elem szövege: „sor – oszlop: helyes érték") |
| `magyarazat` | „Miért nem biztosítható…?" | a kulcsgondolatok az elemek |
| `valasztos` | „Fejts ki egyet a három közül" | ágak szerint; az AI megmondja, melyik ágat választotta a diák, **csak az az ág számít** |

Kétnyelvű kérdésnél („angolul és magyarul is") egy elem van; `reszben` státuszt kap,
ha csak az egyik nyelven szerepel.

### 7.5 A tanár beállításai (kérdésenként, összecsukva)

| beállítás | értékek | alap | hatás |
|---|---|---|---|
| **Rossz sorrend** *(csak sorrendes kérdésnél)* | `relativ` / `pozicio` / `nem_szamit` | **`relativ`** | lásd 7.6 |
| **Szakszóhasználat** | `lenyeg` / `pontos` | `lenyeg` | `lenyeg`: a tartalmilag azonos, más szavakkal írt válasz is „megvan". `pontos`: ha a diák nem a pontos szakkifejezést írja (csak egy részét, köznyelvi megfelelőt), az elem „részben". |
| **A részben jó válasz** | 0 / ½ / 1 | ½ | a „részben" elem a pont ennyiszeresét éri |
| **Kulcson kívüli tétel** *(csak nyílt felsorolásnál)* | `elfogad` / `tanar_dont` | `elfogad` | a helyes, de a kulcsban nem szereplő tételt automatikusan elfogadja / a tanár dönt róla a javításkor |

**Miért fontos az alapérték:** a beállítások összecsukva vannak, a legtöbb tanár
nem nyitja le őket. A sorrendnél a `relativ` a méltányos középút.

### 7.6 A pontozás (a program számolja)

**Az AI csak státuszt ad elemenként:**

| státusz | pont | jelentés |
|---|---|---|
| `megvan` | az elem pontja | a diák leírta (a szakszó-beállítás szerint) |
| `reszben` | az elem pontja × részpont | részben, pontatlanul |
| `hianyzik` | 0 | nem írta le |
| `teves` | 0 | az elemhez tartozó állítása tartalmilag téves. **Levonás nincs**: 0 pont és jelzés, a többi elem pontjából nem vesz el. |

A kérdés pontja az elemek összege (+ kulcson kívüli tételek), **legfeljebb a
kérdés maximuma**.

**Sorrendes kérdés – három mód.** Példa: a helyes sorrend 1, 2, 3, 4, 5; a diák
ezt írta: **1, 5, 2, 3** (a 4-est kihagyta).

| mód | szabály | a példa eredménye |
|---|---|---|
| `nem_szamit` | minden megtalált elem pontot ér | 4 |
| `relativ` *(alap)* | a **legtöbbet érő, helyes sorrendű részsorozat** elemei érnek pontot | 3 (az 1, 2, 3) |
| `pozicio` | csak az ér pontot, ami **pontosan a saját helyén** áll | 1 (csak az 1-es) |

Pozíció nélküli elem (az AI nem adta meg, hányadikként írta a diák) relatív és
pozíciós módban nem jár. A **leírt, de a szabály szerint 0 pontot érő** lépést a
felület „↕ nem a helyén" jelzéssel látja el – különben a diák egy ✓ mellett 0
pontot látna.

A valós mintadolgozaton a tanár `pozicio` szerint pontozott (1/5 pont); az AI a
saját kulcsával 4 pontot adott, mert nem tudhatta, hogy a sorrend ennyire
szigorúan számít. **Ezért beállítás, és nem AI-döntés.**

### 7.7 Az idézet-ellenőrzés

Minden `megvan` / `reszben` / `teves` elemnél az AI szó szerinti **idézetet** ad a
diák válaszából. A program megkeresi, hogy az idézet tényleg szerepel-e **abban a
kérdésben**, amelyikhez az elem tartozik:

- kisbetű, írásjel és **ékezet** nélkül hasonlít (az átírás egy-egy ékezetet
  félreolvashat – az ellenőrzés a hallucinációt fogja meg, nem az OCR-t);
- **toldaléktűrő**: a rövidebb szó legfeljebb 2 betűvel térhet el a közös
  elejüktől (a szószedet egy-egy szót a saját alakjára igazíthat: „alakulás" →
  „alakulása"); 4 betű alatt és számoknál **pontos egyezés** kell („1848" ≠
  „1849");
- a `...` kihagyást jelöl: a részeknek **sorrendben** kell megvolniuk;
- ha az idézet **nincs meg**: az elem `hianyzik` lesz, a tanár **⚠ jelzést** kap
  („az AI idézete nincs a válaszban"), és látja, mit gondolt az AI eredetileg.
  A **téves** állítás is idézethez kötött: a diák nem kaphat jelzést olyan
  tévedésért, amit le sem írt.
- A kulcson kívüli tételek is idézethez kötöttek.

A megfogalmazást az ellenőrzés **nem korlátozza**; hogy a más szavakkal írt
válasz elfogadható-e, azt a *Szakszóhasználat* beállítás és az AI ítélete dönti el.

### 7.8 A jegyjavaslat

A pontos arányból számol (nem a kerekített százalékból: 54,6% nem ér 3-ast egy
55%-os határnál), a feladat **jegyskálája** szerint. A tanár szabadon átírhatja a jegyet.

**A skála** a feladat rubrikájában él (`rubrika.skala`):

```js
{ sablon?: 'hu15'|'af'|'szazalek',            // csak a felületnek: melyik sablonból indult
  tipus: 'fokozat',
  fokozatok: [ { cimke: 1, min: 0 }, { cimke: 2, min: 40 }, ... ] }   // min: % – "legalább ennyi kell"
// vagy
{ tipus: 'szazalek' }                         // a jegy a kerekített százalék (0–100)
```

- A fokozatok a `min` szerint szigorúan növekvők, az első `min` 0 (ez jár, ha semmi más nem ér).
  A `cimke` szám (1–5) vagy rövid szöveg (A–F, legfeljebb 8 karakter), egyedi (az 1 és az `"1"` ugyanaz).
  2–15 fokozat lehet. Sablonok: `hu15` (1/2/3/4/5: 0/40/55/70/85%), `af` (F/D/C/B/A: 0/60/70/80/90%), `szazalek`.
- **Régi feladat** (nincs `skala`): a `rubrika.ponthatarok`-ból (2-es ≥ 40%, 3-as ≥ 55%, 4-es ≥ 70%,
  5-ös ≥ 85%, alatta 1-es – alapértékek) magyar 1–5 skála épül; ez a szerveren és a böngészőben is
  ugyanúgy történik (`skalaFeloldas`, `functions/kifejtos.js`). Hibás skála helyett szintén az alap.
- Az **elküldéskor** a szerver a jegyet a feladat skáláján értelmezi (`jegyNormalizalas`): a skálán
  nem szereplő jegyet elutasít, és a **skála saját alakját** tárolja (az 1–5-ös jegy továbbra is szám,
  az A–F-é szöveg, a százaléké egész szám). A tanári visszajelzés a `jegy_tipus` mezőben jegyzi,
  hogy százalékos skálán áll-e (ekkor a jegy mellé %-jel kerül a megjelenítésben).
- A skála **fogalmazásnál** csak a jegy-választót adja (az AI ott nem javasol jegyet).

### 7.9 A javító nézet kifejtős dolgozatnál

Kérdésenként egy kártya:

- a kérdés szövege és a **kérdés pontja élőben** (`3 / 5`);
- a **diák válasza** (az átirat a kérdéshez rendelve; ha nincs, „a diák nem
  válaszolt");
- a kulcs elemei, mindegyik mellett a diák **saját szavai** (idézet) és négy
  gomb: **✓** megvan · **½** részben · **✕** hiányzik · **téves** (0 pont, a diák
  jelzést kap). **Az AI döntése előre be van jelölve**; a tanár egy kattintással
  felülírja, a pont és a jegyjavaslat azonnal újraszámolódik. Ha visszaállítja az
  AI döntésére, az már nem számít felülírásnak. A felülírt elemen „AI: ✓" jelzi az
  eredetit;
- jelzések: **⚠ az AI idézete nincs a válaszban**, **↕ nem a helyén**;
- választós kérdésnél a választott ág neve;
- sorrendes kérdésnél a sorrend-szabály szövege („szigorú – csak a pontosan a
  helyén lévő lépés ér pontot…");
- kulcson kívüli tételek: **elfogad / nem** (a „tanár dönt" beállításnál ⚠ „döntsd
  el");
- az AI rövid megjegyzése a kérdéshez.

A tanár döntései közül **csak a státuszok mennek a szerverre**; a pontot a szerver
a kulcsból újraszámolja ugyanazzal a függvénnyel, amit a böngésző az élő
megjelenítéshez használ (egyetlen forrásból generált kód – a kettő nem csúszhat el).

### 7.10 Egy végigszámolt példa

Valós mintadolgozat (3 kérdés), `pozicio` sorrend-beállítással, a tanár pontjait
reprodukálva:

| # | kérdés (típus) | mit írt a diák | AI-státuszok | pont |
|---|---|---|---|---|
| 1 | az áruforgalmi folyamat szakaszai *(zárt felsorolás, 3 pont)* | Beszerzés, árutárolás, Értékesítés | mind `megvan` | **3 / 3** |
| 2 | legalább 5 beszerzési szempont *(nyílt felsorolás, 5 pont)* | ár, minőség, határidő, megbízhatóság, „jó a reklámja" | 4 `megvan`, 2 `hianyzik`; a „reklám" kulcson kívüli, **nem helyes** | **4 / 5** |
| 3 | a beszerzés szakaszai *(sorrend, 5 pont, `pozicio`)* | igényfelmérés, számlák kiegyenlítése, piackutatás, szállító kiválasztása | 1. `megvan` (1. helyen); a „piackutatás" `reszben` (pontatlan szakszó); a „megrendelés" `hianyzik`; a többi rossz helyen | **1 / 5** |
| | | | **összesen** | **8 / 13 = 62% → 3-as** |

Ugyanez a 3. kérdés `relativ` móddal 2,5, `nem_szamit` móddal 3,5 pont.

---

## 8. Az AI-promptok és kimeneti szerkezetek

Az alábbi szövegek **a kódból kirenderelt, élesben használt promptok** példaadatokkal
behelyettesítve. Ahol egy prompt változik a beállításoktól, a változatok külön
szerepelnek. A hívások képekkel/fájlokkal együtt mennek (a fájlok a szöveg után,
sorrendben); minden hívás strukturált JSON-választ kér, a séma a prompt alatt.

Változók jelölése: a behelyettesített példaadatok (pl. *My hometown*, *B1*,
*szállítmányozás*) helyén a valós feladat adatai állnak.

**A kimenet nyelve.** Az alábbi promptok az **alapértelmezett (magyar)
visszajelzés-nyelvű** változatot mutatják. Ha a feladat `kimeneti_nyelv` mezője
`en`, a prompt *instrukciói* ugyanezek maradnak (magyarul), csak a kimenet nyelvét
kérő részek cserélődnek:

| a szövegben | angol kimenetnél |
|---|---|
| `magyarul` / `MAGYARUL` | `angolul` / `ANGOLUL` |
| `magyar nyelvű indoklás` | `angol nyelvű indoklás` |
| `magyar címekkel` (rubrika-javaslat) | `angol címekkel` |
| `aki magyar diákokat értékel` (8.3) | `aki diákokat értékel` |
| `Egy magyar osztály … ` (8.4) | `Egy osztály …` |

Ismeretlen vagy hiányzó érték mindig a **magyar** változatot adja. A kód helye:
`kimenet()` a `functions/kifejtos.js`-ben; a promptokat a
`tests/kimenet.test.mjs` védi (angol kérésnél sehol sem maradhat „MAGYARUL").
A kulcskészítő (8.5) és az átírók (8.2, 8.6) nem érintettek: a kulcs a
feladatlap nyelvén készül, az átirat pedig a diák saját szövege.

**Ismert apróság:** a nyelvnevet a prompt egyszerű behelyettesítéssel fűzi be,
toldalékolás nélkül, ezért néhol nyelvtanilag suta a szöveg („A angol nyelv…",
„a tanár angol-t jelölt meg"). A modellnek ez nem okoz gondot, a működés
szempontjából lényegtelen; ha a Teacher's Arsenal más nyelvkezelést használ,
érdemes rendbe tenni.

### 8.1 Fogalmazás – feladatlap → rubrika-javaslat

**Mikor:** a tanár fogalmazás-feladathoz feltölt egy feladatlapot. **Bemenet:**
a prompt + a feladatlap (kép/PDF). **Változó:** a nyelv (a tanár választása; az AI
felülírhatja).

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
- A "feladat_leiras" mezőbe foglald össze magyarul, mi a diák konkrét
  feladata a feladatlap szerint.

Ha valamit nem lehet kiolvasni a feladatlapból, adj józan
alapértelmezést – KIVÉVE a szintet: azt inkább hagyd üresen.
Egy kitalált szint rosszabb, mint a semmi, mert az értékelés ahhoz mér.
```

**Anyanyelvi (magyar) változatban** a szint kérdése így szól – a CEFR itt
értelmetlen, ezért évfolyamot kér:

```text
- Melyik ÉVFOLYAMNAK szól a feladatlap? Ezt írd a "szint" mezőbe.
  CEFR-szintet NE adj meg: a dolgozat anyanyelvi, ott nincs értelme.
```

**Kimeneti szerkezet:**

```text
{
  cim_javaslat: string
  tipus: "esszé" | "levél" | "leírás" | "elbeszélés" | "vélemény" | "egyéb"
  nyelv: "angol" | "német" | "francia" | "spanyol" | "olasz" | "orosz" | "latin" | "magyar"
  szint?: "A1" | "A2" | "B1" | "B2" | "C1"
  min_szo?: integer
  max_szo?: integer
  szempontok: [ {
    kulcs: string
    cim: string
    suly: integer
  } ]
  feladat_leiras: string
}
```

A `szint` **szándékosan nem kötelező**: kötelező enum mellett a modell kénytelen
volt szintet kitalálni még ott is, ahol a feladatlapból semmi nem utalt rá. A
séma enum-ja a nyelv skálájából épül, és a program a visszaadott szintet a
*visszaadott* nyelv skáláján még egyszer ellenőrzi.

### 8.2 Fogalmazás – kézírás → átirat

**Mikor:** minden fogalmazás-beadás első lépése. **Bemenet:** a prompt + a diák
fotói sorrendben. **Változó:** a dolgozat nyelve.

```text
Te egy pontos átíró vagy. A képeken egy diák kézzel írt dolgozata
látható. A dolgozat nyelve: angol.

Írd át SZÓ SZERINT, amit látsz. Fontos szabályok:
- A angol nyelv ékezeteit és különleges karaktereit pontosan add vissza.
- NE javítsd a hibákat – a nyelvtani, helyesírási és írásjel-hibákat is
  pontosan úgy add vissza, ahogy a diák írta. Az értékelést más végzi.
- Ha egy szó olvashatatlan, jelöld így: [?]
- Ha egy szó bizonytalan, írd le a legjobb tippet, utána [?]
- A bekezdéseket és sortöréseket tartsd meg.
- Ha több kép van, azok egy dolgozat egymást követő oldalai.

Az olvashatosag mezőben értékeld, mennyire volt olvasható a kézírás.
```

**Kimeneti szerkezet:**

```
{
  atirat: string
  olvashatosag: "jo" | "kozepes" | "gyenge"
  megjegyzes?: string
}
```

### 8.3 Fogalmazás – értékelés

**Mikor:** az átírás után. **Bemenet:** kizárólag ez a szöveges prompt (az átirat
és a rubrika behelyettesítve, fotó nincs). **Változók:** cím, nyelv, típus,
szint, szószám-elvárás, a feladat leírása, a tanár külön kérése, a szempontok
(kulcs, cím, max. pont), az átirat. A prompt **fix sablon**: csak a rubrika adatai
változnak, így minden diák ugyanazzal a mércével mérődik.

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

# A DIÁK DOLGOZATA (kézírásból átírva)
"""
<a diák kézírásból átírt szövege>
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
   Az átiratban [?] jelöli az olvashatatlan részeket – ezeket NE
   számold hibának.
3. A "diak_szoveg" a diáknak szóló visszajelzés MAGYARUL: barátságos,
   konstruktív hangnem, 3-5 bekezdés. Kezdd azzal, ami sikerült.
   Ne sorold fel az összes hibát – emeld ki a 2-3 legfontosabbat.
   Ne írj bele pontszámot és jegyet: azt a tanár állapítja meg.
4. Az "erossegek" és "fejlesztendo" rövid, tömör felsorolások a tanárnak.
```

**A „mérce" bekezdés négy változata** (az 1. utasítás vége; a többi szöveg
változatlan). A szint kezelése kritikus: **ha nincs megadva szint, a promptban
semmilyen szint nem szerepelhet**, különben az AI kitalál egyet, és ahhoz mér.

*Idegen nyelv, van szint:*

```text
1. Minden szemponthoz adj pontszámot. A "max" mező pontosan a fent
   megadott maximum legyen, a "pont" pedig 0 és a maximum között.
   A B1 szinthez mérj, ne anyanyelvi szinthez.
```

*Anyanyelvi dolgozat (magyar), van évfolyam:*

```text
1. Minden szemponthoz adj pontszámot. A "max" mező pontosan a fent
   megadott maximum legyen, a "pont" pedig 0 és a maximum között.
   Ez ANYANYELVI dolgozat, a mérce: 9-10. évfolyam. Ehhez mérj,
   ne CEFR-szinthez – a diáknak ez az anyanyelve.
```

*Idegen nyelv, nincs szint:*

```text
1. Minden szemponthoz adj pontszámot. A "max" mező pontosan a fent
   megadott maximum legyen, a "pont" pedig 0 és a maximum között.
   A tanár nem adott meg célszintet: a feladatból és a
   szempontokból ítéld meg, mit lehet elvárni. CEFR-szintet ne találj ki.
```

*Anyanyelvi dolgozat, nincs évfolyam:*

```text
1. Minden szemponthoz adj pontszámot. A "max" mező pontosan a fent
   megadott maximum legyen, a "pont" pedig 0 és a maximum között.
   Ez ANYANYELVI dolgozat, és a tanár nem adott meg évfolyamot: a
   feladatból és a szempontokból ítéld meg, mit lehet elvárni. Szintet
   ne találj ki, és ne CEFR-skálán gondolkodj.
```

A persona is a nyelvtől függ: „tapasztalt **angol**tanár", „**német**tanár",
„**francia**tanár", „**magyar**tanár" – a nyelvek listáját ezért csak olyan
névvel szabad bővíteni, ami a `-tanár` szóval helyes magyar összetételt ad.

**Kimeneti szerkezet:**

```
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
  diak_szoveg: string      // a diáknak szóló visszajelzés-javaslat, magyarul
  szoszam?: integer
}
```

A program az **összpontszámot, a maximumot és a százalékot** maga számolja a
`szempontok`-ból.

### 8.4 Fogalmazás – osztályszintű elemzés

**Mikor:** a tanár a 📊 gombbal elemzést kér. **Bemenet:** a program által
kiszámolt összesítés (szempontátlagok, hibacímkék gyakorisága, konkrét hibák
mintája – legfeljebb 200) + a feladat adatai.

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

```
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

### 8.5 Kifejtős – megoldókulcs készítése

**Mikor:** a tanár a *Megoldókulcs készítése* gombot nyomja. **Bemenet:** egyetlen
hívásban: a prompt szövege, majd a `=== FELADATLAP ===` felirat és a feladatlap
fájlja, majd (ha van) a `=== TANANYAG ===` felirat és a tananyag fájljai.
**Változók:** a tantárgy (a tanár beírta, vagy üres), van-e tananyag.

```text
Te egy tapasztalt tanár vagy, a tantárgy: történelem. A "=== FELADATLAP ===" után egy dolgozat
nyomtatott feladatlapja következik. Állítsd össze belőle a MEGOLDÓKULCS
vázlatát, amit a tanár átnéz és jóváhagy.

# ELŐSZÖR: FELADATLAP-E?
Ha a feladatlapként csatolt fájlon NINCSENEK a diáknak szóló kérdések
vagy feladatok (pl. tankönyvoldal, jegyzet, prezentáció), a
"nem_feladatlap" legyen true, a "kerdesek" tömb pedig üres. Ilyenkor NE
találj ki kérdéseket. Egyébként a "nem_feladatlap" false.

# A TANANYAG
A "=== TANANYAG ===" után csatolt fájlokból tanultak a diákok. A kulcs
ELSŐSORBAN ehhez igazodjon: ha a tananyag egy fogalmat, felsorolást vagy
folyamatot adott formában tanít (hány eleme van, mi a sorrendje, mi a
pontos kifejezés), a kulcs pontosan azt kérje, a tananyag szóhasználatával.
Az ilyen elemnél a "forras" legyen "tananyag"; ami nincs benne a
tananyagban, annál "altalanos".

# KÉRDÉSENKÉNT
- "sorszam": a kérdés sorszáma, ahogy a lapon áll (pl. "1", "2a").
- "szoveg": a kérdés szövege, szó szerint.
- "tipus":
  - "zart_felsorolas": adott elemeket kell felsorolni;
  - "nyilt_felsorolas": "legalább N" tételt kell írni egy bővebb körből –
    adj MINDEN elfogadható elemet, a "max_pont" pedig a kért darabszám;
  - "sorrend": egy folyamat lépései – az elemeket a HELYES SORRENDBEN add;
  - "tablazat": kitöltendő táblázat – cellánként egy elem, az "allitas"
    alakja: "sor – oszlop: helyes érték";
  - "magyarazat": rövid kifejtés – az elemek a pontot érő kulcsgondolatok;
  - "valasztos": a diák választ (pl. "Fejts ki egyet a három közül") – az
    "agak" tömbbe lehetőségenként külön elemlistát adj.
- "max_pont": ha a lapon szerepel a pontszám, AZT add meg. Ha nem, az
  elemek pontjainak összege (nyílt felsorolásnál a kért darabszám).
- Elemenként:
  - "allitas": röviden, ahogy egy jó diákválaszban szerepelne;
  - "pont": általában 1 – ha a lap pontszáma mást indokol, oszd el;
  - "elfogadhato": a szinonimák, más elfogadható megfogalmazások;
  - "ellenorizendo": true, ha nem vagy biztos benne, vagy ha a tananyag
    nem egyértelmű ebben.
- "megjegyzes": ha a kérdésnél valami nem egyértelmű, vagy a tanárnak
  döntenie kell (pl. a tananyag ellentmond önmagának), írd le egy
  mondatban. Különben hagyd üresen.

A pontozás szabályairól (számít-e a sorrend, mennyire szigorú a
szakszóhasználat) NE írj – azokat a tanár állítja be.

A "feladat_leiras" 1-2 mondatban mondja el a diáknak, miről szól a
dolgozat. A "cim_javaslat" rövid cím, a "tantargy" a tantárgy neve.
```

**Tananyag nélkül** a `# A TANANYAG` blokk helyett ez áll:

```text
Tananyag NINCS csatolva: a kulcsot a saját tudásodból állítod össze,
ezért minden elemnél a "forras" legyen "altalanos".
```

A kód az AI válaszát tisztítja: az azonosítókat (`e1`, `e2`…) **a program adja**,
az üres elemet és a használhatatlan kérdést kihagyja (és jelzi), a hiányzó pontot
1-re állítja, tananyag nélkül minden elem forrását `altalanos`-ra kényszeríti, a
beállításokat az alapértékekkel tölti. Ha az AI szerint nem feladatlap, a
függvény hibát ad.

**Kimeneti szerkezet:**

```text
{
  nem_feladatlap: boolean
  cim_javaslat: string
  tantargy?: string
  feladat_leiras: string
  kerdesek: [ {
    sorszam: string
    szoveg: string
    tipus: "zart_felsorolas" | "nyilt_felsorolas" | "sorrend" | "tablazat" | "magyarazat" | "valasztos"
    max_pont: number
    elemek?: [ {
      allitas: string
      pont: number
      elfogadhato?: [ string ]
      forras: "tananyag" | "altalanos"
      ellenorizendo: boolean
    } ]
    agak?: [ {
      cim: string
      elemek: [ {
        allitas: string
        pont: number
        elfogadhato?: [ string ]
        forras: "tananyag" | "altalanos"
        ellenorizendo: boolean
      } ]
    } ]
    megjegyzes?: string
  } ]
}
```

A séma **szándékosan nem tartalmaz beállítást** (sorrend, szigor): ha a modell
javasolna, a tanár hajlamos lenne átnézés nélkül jóváhagyni – a beállítás a
tanáré.

### 8.6 Kifejtős – kézírás → válaszok kérdésenként

**Mikor:** minden kifejtős beadás első lépése. **Bemenet:** a prompt + a fotók.
**Változók:** a kulcs kérdései (sorszám + szöveg; táblázatos kérdésnél jelölés) és
a szószedet (a kulcs elemeiből és szinonimáiból a program gyűjti, legfeljebb 300
kifejezés).

```text
Te egy pontos átíró vagy. A képeken egy diák kézzel írt
dolgozata látható (egy nyomtatott feladatlap, a diák válaszaival).

# A KÉRDÉSEK
- 1. Mi a biztosítási (tiszta) kockázat?
- 2. Írd le sorrendben a kárrendezés lépéseit!

# FELADAT
Írd át a diák válaszait KÉRDÉSENKÉNT, SZÓ SZERINT.
- A "kerdes" mező a kérdés sorszáma legyen, pontosan a fenti alakban.
- A nyomtatott kérdésszöveget NE írd a válaszba – csak azt, amit a diák írt.
- Ha egy válasz máshol folytatódik (lap alján, hátoldalon, nyíllal
  jelölve), fűzd a saját kérdéséhez.
- TÁBLÁZATOS kérdésnél a "tablazatok" tömbbe írd, cellánként: a sor és
  az oszlop a nyomtatott fejléc szövege, az "ertek" a diák beírása.
- Az áthúzott szöveget hagyd ki.
- Ha a szöveg a kép szélén le van vágva, a hiányzó részt jelöld így: [...]
- A TANÁRI JELÖLÉSEKET hagyd figyelmen kívül: pontszámok, pipák, aláhúzások,
  margójegyzetek, piros vagy más színű javítások. Csak a diák írását írd át.
- NE javítsd a hibákat: a helyesírási és nyelvtani hibákat is add vissza.
- Olvashatatlan szó: [?]. Bizonytalan szó: a legjobb tipp, utána [?], és
  vedd fel a "bizonytalan" tömbbe is.
- Ha egy kérdésre nincs válasz, hagyd ki.

# SZÓSZEDET – CSAK OLVASÁSI SEGÍTSÉG
Ezek a kifejezések előfordulhatnak a dolgozatban. Ha egy nehezen olvasható
szó ezek egyikének látszik, így írd. FIGYELEM: ez NEM megoldókulcs. Soha
ne írj be olyan szót, ami nincs a lapon, és ne egészítsd ki a diák
válaszát – attól, hogy egy szó a listán van, a diák nem feltétlenül írta le.
- Olyan káresemény, amelynek bekövetkezése egyértelmű
- biztosan bekövetkezik
- Egyértelműen kárt okoz
- A kár bejelentése

Az olvashatosag mezőben értékeld, mennyire volt olvasható a kézírás.
```

**Kimeneti szerkezet:**

```text
{
  valaszok: [ {
    kerdes: string
    valasz: string
    bizonytalan?: [ string ]
  } ]
  tablazatok?: [ {
    kerdes: string
    cellak: [ {
      sor: string
      oszlop: string
      ertek: string
    } ]
  } ]
  olvashatosag: "jo" | "kozepes" | "gyenge"
  megjegyzes?: string
}
```

A `bizonytalan` szavak és a `[?]` / `[...]` jelölések a tanár átirat-nézetében
látszanak. A szószedet a próbán bevált: a csali szakszavak egyszer sem kerültek
be az átiratba. Mellékhatása, hogy egy-egy szót a szószedet alakjára igazíthat
(ezért toldaléktűrő az idézet-ellenőrzés).

### 8.7 Kifejtős – értékelés

**Mikor:** az átírás után. **Bemenet:** csak ez a szöveges prompt (a kulcs és a
diák válaszai behelyettesítve). **Változók:** cím, tantárgy (a persona:
„Te egy tapasztalt tanár vagy, a tantárgy: X." – vagy tantárgy nélkül „Te egy
tapasztalt tanár vagy."), a kulcs kérdésenként, a diák válaszai kérdésenként.
**A tananyag szándékosan nincs benne**: a kulcs abból készült és jóváhagyott, a
kulcson kívüli válaszokat az AI a saját tudása alapján ítéli meg, és azokat is a
tanár hagyja jóvá – így minden javítás olcsóbb és gyorsabb.

```text
Te egy tapasztalt tanár vagy, a tantárgy: szállítmányozás. Egy diák dolgozatát javítod,
a tanár által jóváhagyott megoldókulcs alapján.

# A FELADAT
Cím: Biztosítás – témazáró

# A MEGOLDÓKULCS
## 1. kérdés: Mi a biztosítási (tiszta) kockázat?
Típus: magyarazat
Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is "megvan".
Elemek:
    - [e1] Olyan káresemény, amelynek bekövetkezése egyértelmű (elfogadható még: biztosan bekövetkezik)
    - [e2] Egyértelműen kárt okoz

## 2. kérdés: Írd le sorrendben a kárrendezés lépéseit!
Típus: sorrend
Szakszóhasználat: PONTOS – ha a diák nem a pontos szakkifejezést írja (pl. csak egy részét, vagy köznyelvi megfelelőt), az elem "reszben".
Elemek:
    - [e1] A kár bejelentése
    - [e2] Dokumentáció benyújtása
    - [e3] A biztosító feldolgozza
    - [e4] Kifizetés
SORREND: minden megtalált elemnél add meg a "pozicio" mezőben, hányadikként írta a diák (1-től számozva, a diák összes felsorolt tételét számolva).

# A DIÁK VÁLASZAI (kézírásból átírva)
## 1. kérdés
"""
<a diák válasza az 1. kérdésre>
"""

## 2. kérdés
"""
<a diák válasza a 2. kérdésre>
"""

# UTASÍTÁSOK
1. Minden kérdésnél MINDEN kulcselemhez adj státuszt:
   - "megvan": a diák leírta (a szakszó-szabály szerint);
   - "reszben": részben, pontatlanul, vagy kétnyelvű kérdésnél csak az egyik nyelven;
   - "hianyzik": nem írta le;
   - "teves": az elemhez tartozó állítása tartalmilag téves.
2. A "megvan", "reszben" és "teves" elemeknél az "idezet" a diák
   válaszának SZÓ SZERINTI részlete legyen, abból a kérdésből, amelyikhez
   az elem tartozik. Ne javítsd, ne fogalmazd át – a rendszer visszakeresi,
   és ha nem találja, az elem nem ér pontot.
3. PONTOT NE ADJ: csak státuszt, idézetet és (sorrendnél) pozíciót. A
   pontozást a rendszer végzi a tanár szabályai szerint.
4. A helyesírási hibák NEM számítanak: "megvan" az elem, ha a tartalom
   felismerhető. Az átiratban [?] jelöli az olvashatatlan részt, [...] a
   levágott részt – ezekért ne büntess.
5. A "hibak" tömbbe a tartalmi hibákat vedd fel (tévedés, pontatlan
   fogalom, hiányzó elem, rossz sorrend, hiányos kifejtés). Helyesírást ne.
6. Kérdésenként a "visszajelzes" 1-2 mondat a tanárnak, magyarul.
7. A "diak_szoveg" a diáknak szóló visszajelzés MAGYARUL: barátságos,
   konstruktív, 2-4 bekezdés. Kezdd azzal, ami jól sikerült, és emeld ki a
   2-3 legfontosabb hiányt. Ne írj bele pontszámot és jegyet.
```

**A kulcs leírása kérdéstípusonként.** A `# A MEGOLDÓKULCS` blokk minden kérdése
ugyanazt a keretet kapja (cím, típus, a szakszó-szabály szövege, az elemek
azonosítóval és szinonimával), és a típustól függően kiegészítést. Mind a hat
típus, a beállításoktól függő szöveggel:

```text
# A MEGOLDÓKULCS
## 1. kérdés: Sorold fel a három feltételt!
Típus: zart_felsorolas
Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is "megvan".
Elemek:
    - [e1] véletlenszerű
    - [e2] előre nem látható
    - [e3] nem akaratlagos

## 2. kérdés: Írj legalább 4 biztosítható kockázatot!
Típus: nyilt_felsorolas
Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is "megvan".
Elemek:
    - [e1] fizikai sérülés
    - [e2] elveszés
    - [e3] lopás
    - [e4] sztrájk
    - [e5] zavargás
NYÍLT FELSOROLÁS: ami a diák válaszában tartalmilag helyes, de egyik elemnek sem felel meg, azt a "kulcson_kivul" tömbbe vedd fel.

## 3. kérdés: Hasonlítsd össze a relatív és az abszolút kockázatot!
Típus: tablazat
Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is "megvan".
Elemek:
    - [e1] Relatív – bekövetkezése: nem biztos
    - [e2] Abszolút – bekövetkezése: biztos
TÁBLÁZAT: az elemek a cellák. Az idézet a diák adott cellába írt szövege legyen.

## 4. kérdés: Írd le a kárrendezés lépéseit!
Típus: sorrend
Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is "megvan".
Elemek:
    - [e1] bejelentés
    - [e2] kifizetés
SORREND: minden megtalált elemnél add meg a "pozicio" mezőben, hányadikként írta a diák (1-től számozva, a diák összes felsorolt tételét számolva).

## 5. kérdés: Miért nem biztosítható a tömeges kár?
Típus: magyarazat
Szakszóhasználat: PONTOS – ha a diák nem a pontos szakkifejezést írja (pl. csak egy részét, vagy köznyelvi megfelelőt), az elem "reszben".
Elemek:
    - [e1] sok áru egyszerre károsodik

## 6. kérdés: Válassz egy fedezeti formát, és jellemezd!
Típus: valasztos
Szakszóhasználat: LÉNYEG – a tartalmilag azonos, más szavakkal írt válasz is "megvan".
A diák EGY ágat választ – a "valasztott_ag" mezőbe annak az azonosítóját írd,
és csak annak az elemeit értékeld.
  Ág [A] A (All Risks):
    - [a1] teljes körű fedezet
    - [a2] kizárás: szándékos károkozás
  Ág [C] C (minimális):
    - [c1] csak teljes veszteség
    - [c2] kizárás: lopás
```

**Kimeneti szerkezet:**

```text
{
  kerdesek: [ {
    sorszam: string
    valasztott_ag?: string
    elemek: [ {
      id: string
      statusz: "megvan" | "reszben" | "hianyzik" | "teves"
      idezet?: string
      pozicio?: integer
    } ]
    kulcson_kivul?: [ {
      idezet: string
      tartalmilag_helyes: boolean
      megjegyzes: string
    } ]
    visszajelzes: string
  } ]
  hibak: [ {
    kategoria: "hianyzo_elem" | "tartalmi_tevedes" | "pontatlan_fogalom" | "sorrend" | "hianyos_kifejtes"
    kerdes: string
    idezet: string
    javaslat: string
    magyarazat: string
  } ]
  diak_szoveg: string
}
```

**Nincs `pont` mező** a sémában: ha lenne, a modell kitöltené, és kísértés
lenne használni. A programnak ezután az AI állapotaiból, az idézet-ellenőrzés
után, a tanár beállításai szerint kell pontoznia (7.6–7.8).

### 8.8 Kifejtős – osztályszintű elemzés

**Mikor:** a tanár a 📊 gombbal elemzést kér egy kifejtős feladatra. **Bemenet:**
a program számolta kérdésenkénti és elemenkénti statisztika + az AI által jelölt
tartalmi hibák mintája (legfeljebb 150).

```text
Te egy tapasztalt tanár vagy, a tantárgy: szállítmányozás. Egy osztály kifejtős dolgozatának összesített
eredményét kapod, és a tanárnak kell segítened: mit érdemes órán újra venni.

# A FELADAT
Cím: Biztosítás – témazáró
Tantárgy: szállítmányozás

# OSZTÁLYSZINTŰ SZÁMOK
Kiértékelt dolgozat: 22
Osztályátlag: 68%

Kérdésenként (a legrosszabb elöl):
- 6. kérdés (Mit jelent az alulbiztosítás?): 1.2/3 pont átlagosan, 40%

# AMIT A LEGTÖBBEN KIHAGYTAK VAGY ELRONTOTTAK
Ezt a rendszer számolta a megoldókulcs elemeiből – pontos, ne kérdőjelezd meg.
- 6. kérdés – "30 000 euró": 12 diáknál hiányzik, 6 diáknál téves (22 diákból)

# TARTALMI HIBÁK (minta, a javító AI jelölte)
- [tartalmi_tevedes] 6. kérdés: "A biztosító 50 000 eurót fizet." → "30 000 euró"

# UTASÍTÁSOK
1. "osszegzes": 2-3 bekezdés a tanárnak, magyarul. Mi ült jól, és mely
   fogalmak, tananyagrészek hiányoznak rendszerszinten? Keress mintát: egy
   egész témakör hiányzik, vagy csak a szakszóhasználat pontatlan, vagy
   egy tipikus tévhit terjed? Ne ismételd a számokat – ÉRTELMEZD őket.
2. "tipushibak": a közös tartalmi hiányok és tévedések, a JELENTÉS szerint
   összevonva, a legfontosabbal kezdve, legfeljebb 6. A "cim" magyarul,
   közérthetően (pl. "A beszerzés szakaszainak sorrendje"). A "peldak" a
   fenti hibákból vett SZÓ SZERINTI diákidézetek – ha egy hiányhoz nincs
   idézet, a hiányzó elemet nevezd meg.
   A "gyakorisag": "általános" ha a diákok többségét érinti, "gyakori" ha
   jelentős részét, "szórványos" ha csak néhányat.
3. "gyakorlatok": 3-5 konkrét, órán használható ismétlő tevékenység a
   legnagyobb hiányokra. A "leiras" legyen annyira konkrét, hogy a tanár
   holnap be tudja vinni: mit csinálnak a diákok, milyen formában, mennyi ideig.
4. "generalo_prompt": egy KÉSZ, önmagában is használható prompt, amit a
   tanár bemásolhat egy AI-ba, hogy ismétlő feladatsort generáljon pontosan
   ezekre a hiányokra. Tartalmazza a tantárgyat, a hiányzó fogalmakat és
   tévhiteket, és kérjen rövid kifejtős kérdéseket megoldókulccsal.

Ha 3-nál kevesebb kiértékelt dolgozat van, az "osszegzes" ELSŐ mondatában
jelezd, hogy ez még nem osztályszintű kép.
```

**Kimeneti szerkezet:**

```text
{
  osszegzes: string
  tipushibak: [ {
    cim: string
    kategoria: "hianyzo_elem" | "tartalmi_tevedes" | "pontatlan_fogalom" | "sorrend" | "hianyos_kifejtes"
    gyakorisag: "általános" | "gyakori" | "szórványos"
    magyarazat: string
    peldak: [ string ]
  } ]
  gyakorlatok: [ {
    cim: string
    cel: string
    leiras: string
    idotartam_perc: integer
  } ]
  generalo_prompt: string
}
```

---

## 9. Adatmodell (logikai)

Csak a működés megértéséhez szükséges; a tárolási technológia lényegtelen.

| entitás | fontosabb tartalom | ki látja |
|---|---|---|
| **Felhasználó** | név, e-mail, szerep (tanár/diák/admin), bemutató-állapot | csak saját maga |
| **Osztály** | név, kód, tanár, aktív/zárt, létszám; tagok (név, e-mail, csatlakozás) | a tanár; a diák a sajátját |
| **Feladat** | osztály, tanár, cím, határidő, aktív, feladatlap (fájl + link), **rubrika** | a tanár és az osztály diákjai |
| ↳ rubrika *(fogalmazás)* | nyelv, típus, szint, szószám, szempontok [{kulcs, cím, súly}], AI-kérés, leírás, **kimeneti_nyelv** (`hu`/`en`), **skala** | a diák is |
| ↳ rubrika *(kifejtős)* | mod=`kifejtos`, tantárgy, „helyes válaszok láthatók", kérdések [{sorszám, max pont}], leírás, **kimeneti_nyelv**, **skala** | a diák is |
| **Megoldókulcs** *(kifejtős)* | lásd 7.3; a feltöltött tananyag fájljai | **csak a feladat tanára** |
| **Elemzés** | a 4.5 szerinti összesítés és AI-szöveg | csak a tanár |
| **Rubrika-sablon** | név, a rubrika újrahasznosítható része | csak a tulajdonos tanár |
| **Beadás** | feladat, diák (név másolva), tanár, fotók, **státusz**, átirat, olvashatóság, átíró modell, hibaüzenet; kifejtősnél: válaszok kérdésenként, táblázatcellák | a diák és a tanár |
| **AI-értékelés** | szempontok/kérdések, pontok, hibák, visszajelzés-javaslat, modell, `javasolt_jegy`, figyelmeztetések | **csak a tanár** |
| **Tanári visszajelzés** | jegy, `jegy_tipus`, szöveg, pontozás (fogalmazás: szempontok; kifejtős: kérdések elemenként), jóváhagyás ideje | a tanár; a diák **csak ha a beadás `elkuldve`** |

**Kulcs tervezési döntések:**

1. **A szerepkör a hitelesítési tokenből jön**, nem egy módosítható adatmezőből.
   Hiányzó jogosultság = diák (a legkisebb jog).
2. **Az AI nyers értékelése és a kulcs külön tárolóban van**, mert a hozzáférési
   szabályok dokumentum szintjén kapuznak, mező szinten nem: ha a diák olvashatja
   a beadás dokumentumát, minden mezőjét megkapja.
3. **A státuszt csak a szerver írja.** A diák nem hamisíthatja a beadása státuszát.
4. **A név három helyen szerepel** (profil, osztálynévsor, beadás), hogy a tanárnak
   ne kelljen a diákok profilját olvasnia; a névmódosítás ezért szerveroldali
   művelet, ami mindhárom helyet frissíti.
5. **Az osztálykód-egyediség és a csatlakozás tranzakciós** szerveroldali művelet;
   a kódok kliensről nem olvashatók, nem próbálgathatók végig.
6. **A feladat és a kulcsa együtt mentődik**, atomikusan.
7. **A dolgozatfotókat** a beadó diák és az osztály tanára olvashatja; a beadott
   fotó nem cserélhető és nem törölhető kliensről.
8. **A feladat adataiban a kódszavak magyarok maradtak** (a nyelv: `angol`,
   `német`…; a típus: `esszé`, `levél`…; a szint: `5-6. évfolyam`…; az AI
   gyakoriság-jelzői: `általános`, `gyakori`, `szórványos`). Az adat ezért nem
   változott a kétnyelvűséggel; **a megjelenítés fordít** (13.2). A kód-lista
   két helyen él (a kliensben és a szerveren), ha bővíted, mindkettőt át kell írni.

---

## 10. Amit a próbák és a hibák megtanítottak

### A kézírás-átírás próbája

Valódi mintacsomag (3 szkennelt oldal: kereskedelem, marketing, pénztörténet), 3
prompt-változat × 2 oldal × 2 futás:

| | eredeti prompt | kérdésenkénti | kérdésenkénti + szószedet |
|---|---|---|---|
| kérdésenkénti bontás | ✗ | ✓ | ✓ |
| tanári jelölések kiszűrése | ✗ | részben | ✓ |
| csali szakszó az átiratban | – | – | 0 eset |

- A **nyomtatott nagybetűs** lap minden változatban gyakorlatilag hibátlan volt
  (táblázattal és átcsúszott válasszal együtt); a **folyóírásos** lapon a
  szakszavak helyesek voltak, csak toldalékhibák maradtak.
- **A modell saját olvashatósági értékelése megbízhatatlan** (a folyóírásra egyszer
  „jó"-t adott) – erre nem érdemes építeni.
- A lap szélén **levágott szöveg jelölés nélkül elveszett**: ezért van a diák
  fotózási tanácsa, és ezért kér a prompt `[...]` jelölést a levágott részre.

### Az értékelés próbája (kulcs tananyag nélkül, csak a kérdésekből; 3 futás)

| kérdés | tanár | AI |
|---|---|---|
| az áruforgalmi folyamat szakaszai | 3/3 | 3 · 3 · 3 |
| beszerzési szempontok | 4/5 | 4 · 4 · 4 |
| a beszerzés szakaszai | 1/5 | 4 · 4 · 4 |

A három futás azonos volt (**az értékelés stabil**). Az eltérés oka a harmadik
kérdésnél: (a) a tankönyvi szakaszok **a tananyagtól** függtek, (b) a tanár
**pozíció szerint** pontozott, amit az AI nem tudhatott. Innen jött a két
alapelv: a kulcsot a tananyagból kell készíteni, a sorrend szigorúsága pedig
tanári beállítás.

### Az első élő kulcskészítési próba

A tanár a tananyagot a feladatlap helyére töltötte fel. Az AI a jegyzetből
**8 kérdést talált ki**, és „tananyag nélkül készült" jelzést adott – logikai
bukfenc a felületen. Innen jött a `nem_feladatlap` ellenőrzés, a két feltöltés
egyértelmű szétválasztása és az egyszerűsítés (a tananyagtár, a próbajavítás és a
külön tananyag-feldolgozás kikerült: három AI-hívás helyett egy).

### Tervezési tanulságok, amik máshol is érvényesek

- **Ha egy mező értelmesen hiányozhat, ne legyen kötelező a strukturált
  kimenetben**, és a promptban se szerepeljen „nincs megadva": a modell kitölti
  magának. (A kötelező CEFR-szint miatt minden magyar dolgozat kapott egy kitalált
  szintet.)
- **A pontot ne az AI adja**, ha a szabály a tanáré vagy determinisztikus. Az AI
  státuszt és idézetet ad; a program pontoz és ellenőriz.
- **Az AI-idézetet ellenőrizni kell** a forrásszövegben: olcsó és
  determinisztikus fék a hallucináció ellen.
- **Az alapérték dönt**, ha a beállítás összecsukva van.
- **Az átmeneti modellhiba normális** (túlterhelés): újrapróbálás kell; az
  értékelésnél szándékosan nincs modellváltás az egységes mérce miatt.
- **Több helyen élő követelmény elcsúszhat a kód mellett:** az ígéretet a
  felületen (pl. „nem kötelező") teszttel kell a kódhoz kötni.
- **Ugyanaz a logika két helyen (böngésző + szerver) előbb-utóbb elcsúszik:** a
  kifejtős pontozó modul egyetlen forrásból generálódik mindkét oldalra, drift-teszttel.

---

## 11. Állapot, hiányok, félretett ötletek

### Állapot

- Élesben fut, mobilról is használható (telepíthető alkalmazásként).
- Automatizált tesztek: az emulátor nélkül futtatható készlet (pontozás,
  idézet-ellenőrzés, újrapróbálás, promptok, felületi ígéretek, kétnyelvűségi és
  jegyskála-tesztek) és a **Firebase-emulátort** igénylő jogosultsági-, függvény- és
  szabálytesztek együtt **341** tesztet adnak; a jegyskála-munka után mind lefutott (Java 21,
  `cd tests && npm test`). A `visszajelzesJovahagyas` függvény jegy-ellenőrzését
  végponttól végpontig nem teszteli semmi (a logikát a `jegyNormalizalas` tesztjei fedik).
- **Igazi osztállyal még nem próbáltuk.** A fogalmazás útvonalon egyetlen beadás
  futott végig élesben; a kifejtős dolgozat élesben még nem járt valódi
  diákmunkával. A kézírás-felolvasás pontossága, a pontszámok észszerűsége és az
  elemzés használhatósága 20–25 beadásnál fog kiderülni.
- Nyelvek: a nyelvkezelés (8 nyelv, CEFR- és évfolyam-alapú szint) automatizált
  tesztekkel lefedett, de **élesben csak angol dolgozat futott végig**; a német és
  a **magyar** (évfolyam-alapú szint) még nem.
- **Kétnyelvű felület (magyar/angol)**: elkészült, a teljes felületre kiterjed
  (13. fejezet). Böngészőben a belépő oldal és néhány statikus rész látszik; a
  lapok dinamikus részeit Node-ban, kitalált adatokkal futtattuk. **Valódi
  belépéssel, éles Gemini-hívással és az angol AI-visszajelzés minőségével még
  nincs próbálva.**

### Nincs meg (tudatosan)

| mi | miért |
|---|---|
| **Dolgozat generálása tananyagból** (kérdések + kulcs, „nincs dolgozatom") | **félretéve.** A program kézzel írt, kinyomtatott dolgozatra épül, digitális kitöltés és nyomtatás nincs benne. A Teacher's Arsenalban jöhet. |
| Digitális kitöltés a programon belül | a rendszer a kézírásra épül |
| Nyomtatható feladatlap, A/B csoport | lásd fent |
| Tananyagtár, kollégák közti megosztás | kivéve az egyszerűsítéskor: a tananyag a feladat kulcsához tartozik |
| Próbajavítás a létrehozáskor | az ellenőrzés helye a javító nézet |
| Tanári profilban tárolt jegyskála-alapérték | egyelőre feladatonként állítható; az utoljára használt skálát a böngésző jegyzi meg (nem a fiókhoz kötött) |
| Word/PowerPoint tananyag | a tanár PDF-be menti |
| Több feladatot átfogó haladásjelző (javul-e az osztály) | későbbre |
| Értesítés (e-mail/push) tanári jog kéréséről vagy új beadásról | nincs; a kollégának szólnia kell |
| Offline beadás | a rendszer hálózatot igényel |
| Feldolgozási régió megszabása (EU) | tervben; a modell EU-s elérhetőségét előbb ellenőrizni kell |
| Per-tanár AI-használat mérése | ha többen használják, hasznos lesz |
| **GPA** (pl. 4.0) és a rubrika-sablonok jegyskálája | az állítható skála kész (4.3, 7.8: magyar 1–5, A–F, százalék, egyéni fokozatok); a GPA más számítás, a mentett rubrika-sablon (`rubrikak`) pedig még nem hordozza a skálát |
| Más országok **évfolyam-skálája** | a „5-6. évfolyam … érettségi" a magyar iskolarendszer; a célpiac eldöntésekor kell |
| Harmadik, negyedik felületi nyelv | a váz kész (13.4), de a fordítás és a promptok ellenőrzése munka |
| Fizetés, előfizetés, használati limit | a program jelenleg nem tartalmaz ilyet |

### Ismert apróságok

- Az osztály átnevezésekor a diák felületén a régi név marad a csatlakozott
  osztályok címkéjén.
- A határidő tájékoztató jellegű (nincs automatikus zárás).

---

## 12. Mit érdemes átvenni

*(Vélemény, nem előírás.)*

1. **A kifejtős pontozó logika** – tiszta függvények, külső függés nélkül:
   kérdéstípusok, sorrend-módok, részpont, kulcson kívüli tételek, idézet-ellenőrzés
   (toldaléktűrő, ékezet nélküli), kulcs-ellenőrzés, jegyjavaslat, a tanári
   felülírás újraszámolása. Ezt könnyű más környezetbe portolni, és a tesztek
   dokumentálják a szándékot (a mintadolgozat regressziós esete: 8/13 → 3-as).
2. **A promptok és a kimeneti sémák** (8. fejezet). Különösen: az átíró prompt
   szószedettel, az értékelő prompt „csak státusz + idézet, pont nélkül" elve, a
   „feladatlap-e?" védőháló a kulcskészítőben.
3. **A munkamegosztás elve:** az AI értelmez, a program számol és ellenőriz; a
   tanár dönt, és a diák csak a jóváhagyottat látja.
4. **A javító nézet mintája:** az AI döntése előre bejelölve, egy kattintással
   felülírható, élő pont- és jegyjavaslattal, és hiányzó idézetnél jelzéssel. Itt
   nyeri vissza a tanár az időt: nem újrajavít, hanem ellenőriz.
5. **A tanár útjának rövidsége:** feladatlap, tananyag, egy gomb, mentés; minden
   más összecsukva, jó alapértékkel.
6. **A rossz feltöltés megfogása** (tananyag a feladatlap helyén): az AI-nak előbb
   arra kell választ adnia, hogy egyáltalán megfelelő-e a bemenet.

---

## 13. Többnyelvű felület és nemzetközi használat

A program felülete **magyarul és angolul** is használható. Ez a fejezet azt írja
le, hogyan épül fel, mit fordít és mit nem, és mi hiányzik még ahhoz, hogy
külföldön is értelmesen lehessen használni.

### 13.1 A nyelv kiválasztása

1. a felhasználó választása (a fejlécben, a belépő oldalon a jobb felső sarokban;
   böngészőnként megmarad),
2. a böngésző nyelve, ha támogatott (magyar böngésző → magyar),
3. angol.

A nyelvváltás újratölti az oldalt, így minden szöveg egységesen frissül. A magyar
a **forrásnyelv**: új szöveg először oda kerül, és az angol is arra esik vissza,
ha egy kulcs hiányzik (a hiányt a tesztek előbb elkapják).

### 13.2 Mi hol fordul

| réteg | hogyan |
|---|---|
| **Felület** (minden lap, oldalsáv, vissza gomb, bemutató) | szótári kulcsok (`t('kulcs')`, `data-i18n` attribútumok); két szótárfájl, azonos kulcskészlettel |
| **Státuszok, hibák, dátum** | kulcsok; a dátum a nyelv formátumában (`hu-HU` / `en-GB`) |
| **Szerver hibái** | a Cloud Functions hibái magyar üzenetet **és** `details.kod`-ot hordoznak; magyar felületen a szerver pontos üzenete jelenik meg, más nyelven a kódból fordít a kliens (mintegy 40 kód). Ismeretlen kódnál általános hibaszöveg |
| **A megoldókulcs hibái** | a kulcs-ellenőrzés (a szerverrel közös kód) kódot és paramétereket ad; a kliens fordítja |
| **AI-kimenet** | a feladat *visszajelzés-nyelve* (4.3, 8. fejezet); az instrukciók magyarul maradnak |
| **A feladat adata** (nyelv, típus, szint) | magyar kódszavak maradnak, a megjelenítés fordít |
| **Bemutató példaadata** | nyelvfüggő (osztály, diákok, javító felület, elemzés, generáló prompt) |

### 13.3 Amit szándékosan nem fordít a program

- **A tanár és a diák saját szövege** (feladatcímek, osztálynevek, szempontcímek,
  átirat, tanári visszajelzés) úgy jelenik meg, ahogy íródott.
- **Az AI hibakategóriái** (`nyelvtan`, `szokincs`…) a javító nézetben még nyers
  kóddal látszanak; az osztályelemzés oldalon fordítottak.
- **A beadás hibaállapotának szövege** (`beadas.hiba`) technikai, magyar/angol
  keverék.
- **A „Névtelen" alapnév**: ha valaki név nélkül lép be, a profil neve magyar
  szóval, `Névtelen`-ként mentődik, és a diák oldala ezzel az értékkel hasonlít.
  Nemzetközi használat előtt semleges értékre kell cserélni (a szerver ellenőrzésével
  együtt).
- **A szint-skála** magyar (lásd 13.5); a jegyskála feladatonként állítható (4.3).

### 13.4 Új nyelv felvétele (ellenőrzőlista)

1. új szótárfájl a meglévők mintájára, **azonos kulcsokkal és {helyőrzőkkel}**;
2. a nyelv felvétele a szótárak listájába (`i18n.js`) és a nyelvválasztóba;
3. a `kimeneti_nyelv` értékei és a promptok kimenet-nyelvet kérő mondatai
   (`KIMENETI_NYELVEK`, `functions/kifejtos.js`), a feladatűrlap választója;
4. a kódszavas adat megjelenítése (`nyelv.*`, `tipus.*`, `szint.*` kulcsok);
5. a bemutató példaadata és lépései;
6. a tesztek (kulcskészlet, helyőrzők, hibakódok, promptok) hiba nélkül futnak.

A `tests/i18n.test.mjs` és a `tests/kimenet.test.mjs` azt védi, hogy ne maradjon
fordítatlan kulcs, elgépelt helyőrző, szintaxishiba az átalakított lapokban,
vagy olyan prompt, ami rossz nyelven kér kimenetet.

### 13.5 Mi hiányzik még a nemzetközi használathoz

*(Ezek üzleti és termékdöntések, nem a fordítás részei.)*

- **Jegyskála.** Feladatonként állítható (magyar 1–5, A–F, százalék, egyéni fokozatok; lásd 4.3
  és 7.8). Hiányzik: a GPA, a skála a mentett rubrika-sablonban, és a tanári profilban tárolt
  (fiókhoz kötött) alapérték – ma az utoljára használt skálát csak a böngésző jegyzi meg.
- **Évfolyam-skála.** Az anyanyelvi (magyar) dolgozat „évfolyam" listája a magyar
  iskolarendszerhez kötött. Más országnál más lista kell.
- **Célpiac.** Konkrét ország még nincs kiválasztva; ettől függ az angol
  nyelvváltozat, a skálák és a jogi környezet. A szándék elsősorban nyelvtanárok.
- **Adatvédelem.** Kiskorúak kézírásmintái és személyes adatai mennek AI-hoz:
  adatkezelési tájékoztató, adatfeldolgozói megállapodás, feldolgozási régió
  (EU – lásd 11.), országspecifikus szabályok (pl. GDPR, USA-ban FERPA/COPPA).
- **Fizetés és használati limit.** Előfizetés, csomagok, tanáronkénti AI-kvóta.
- **Két környezet.** A javasolt felállás: egy kódbázis, **két telepítés** – a
  mostani projekt marad teszt/pilot, új, különálló projekt a nemzetközi éles
  verziónak (külön adatbázis, felhasználók, számlázás).
- **Az angol AI-visszajelzés minősége** valódi diákmunkával még nincs ellenőrizve;
  a kézírás-felismerés pontossága más nyelven és írásmódnál eltérhet.
- **Telepítés:** a szerverkód (kódolt hibák, kimeneti nyelv) változott, ezért a
  következő élesítésnél a `functions` is kimegy. Adatmigráció nem kell: a régi
  feladatok magyar kimenettel dolgoznak tovább.
