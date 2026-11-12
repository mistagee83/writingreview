# Adatkezelési tájékoztató – WritingReview

> **PISZKOZAT – jogi felülvizsgálat nélkül nem tehető közzé.** Jelölések és munkahipotézisek: [`README.md`](README.md).
> A szöveg a **prod 2026. november 12-i működését** írja le (feladatlink, becenév, diákfiók és kézírás nélkül; `docs/prod-atalakitas-terv.md`); ahol a működés még nincs megépítve vagy jogi döntésre vár, ott jelölés áll.
> A korábbi (diákfiókos, kézírásos) változatra írt szöveg a git-történetben és a `pilot` ágon érhető el.

*Hatályos: [KITÖLTENDŐ: dátum]. Utolsó módosítás: [KITÖLTENDŐ].*

## 1. Ki kezeli az adatait?

Az **adatkezelő** (a tanári fiókok adataira) és – a 3. pontban leírt szerepmegosztás szerint – a diákok adatainak **adatfeldolgozója**:

- Név: **[KITÖLTENDŐ: az egyéni vállalkozó neve]**, egyéni vállalkozó
- Székhely: **[KITÖLTENDŐ]**
- Adószám / nyilvántartási szám: **[KITÖLTENDŐ]**
- E-mail (adatvédelmi és törlési kérések): **[KITÖLTENDŐ]**

Adatvédelmi tisztviselőt nem neveztünk ki. **[JOGÁSZ: kötelező-e?]**

## 2. Mi ez a szolgáltatás, és mire használjuk az adatokat?

A WritingReview nyelvtanároknak szóló webalkalmazás. A tanár feladatot hoz létre, és **24 óráig élő linket** indít hozzá. A diák ezen a linken, **fiók és
regisztráció nélkül, egy általa választott becenévvel** írja meg és adja be a dolgozatot; nevet, e-mail-címet, jelszót nem adunk meg tőle. Beadáskor a diák
kap egy saját linket, amelyen később a visszajelzést látja. **A tanár indítja** az értékelést: ekkor egy mesterséges intelligencia (MI) modell **javaslatot tesz**
a pontszámra és a visszajelzésre. **A tanár átnézi, szükség esetén módosítja és jóváhagyja** – a diák csak a tanár által jóváhagyott visszajelzést látja. A diák
nem ír az MI-nek, a diák beadása nem indít MI-t, nincs csevegés.

## 3. Ki melyik adatot kezeli, és milyen szerepben?

**[JOGÁSZ: a szerepek eldöntendők; a lenti a munkahipotézis.]**

| Adat | Kinek az adata | Az Üzemeltető szerepe |
|---|---|---|
| A tanári fiók adatai (név, e-mail, csomag, használat, fizetési állapot) | a tanár | **adatkezelő** |
| A diákok adatai (becenév, dolgozat, írás közbeni jelzések, értékelések; csoportnál a becenév szerinti összekapcsolás) | a diák | **adatfeldolgozó** – a tanár (vagy az iskola) az adatkezelő, és az ő utasítására kezeljük |

A tanár, aki a diákjait a szolgáltatásba hívja, **maga felel azért**, hogy a diákok adatainak kezelésére jogalapja van, és hogy a diákokat (kiskorúaknál a szülőket) a
szükséges módon tájékoztatta. **[JOGÁSZ: kell-e külön adatfeldolgozói megállapodás a tanárokkal/iskolákkal; ennek sablonja még nincs.]**

## 4. Milyen adatokat kezelünk, miért, milyen jogalapon, és meddig?

### 4.1. Tanárok

| Adat | Cél | Jogalap | Megőrzés |
|---|---|---|---|
| Név, e-mail-cím, jelszó (Firebase Authentication; a jelszót titkosítva tároljuk), a bejelentkezés módja (e-mail vagy Google-fiók) | a fiók létrehozása és használata, azonosítás | szerződés teljesítése (GDPR 6. cikk (1) b)) | a fiók fennállásáig; **[NINCS MEGÉPÍTVE: automatikus törlés; kérésre kézzel töröljük]** |
| A tanári regisztráció jelzése, az e-mail megerősítésének ténye | a tanári jog jogosult megadása, visszaélés elleni védelem | jogos érdek (6. cikk (1) f)) – visszaélés megelőzése **[JOGÁSZ]** | a fiók fennállásáig |
| Csomag, az AI-egységek használata (számláló), a választott színtéma | a csomag keretének érvényesítése, a szolgáltatás nyújtása | szerződés teljesítése | a fiók fennállásáig |
| Fizetés: a Stripe-ügyfélazonosító, az előfizetés azonosítója, állapota és időszak-vége. **Kártyaadatot nem kezelünk és nem látunk, azt a Stripe kezeli.** | előfizetés kezelése, a csomag beállítása | szerződés teljesítése | a fiók fennállásáig |
| Számlázási adatok (számla kiállítása) | a számviteli és adójogi kötelezettség teljesítése | jogi kötelezettség (6. cikk (1) c)) | a számviteli törvény szerint: **[JOGÁSZ/KÖNYVELŐ: 8 év]** |
| A tanár által létrehozott feladatok, feladatlapok, értékelési szempontok, feladatlinkek, csoportok (pl. „9.B angol”) | a szolgáltatás nyújtása | szerződés teljesítése | a feladat és a csoport a tanár törléséig **[NINCS MEGÉPÍTVE: fióktörléskor]**; a feladatlink a lejárata után 12 hónappal automatikusan törlődik |

### 4.2. Diákok (a tanár utasítására)

| Adat | Cél | Jogalap | Megőrzés |
|---|---|---|---|
A diáktól **nem kérünk nevet, e-mail-címet, jelszót, és nincs diákfiók**. A diák a tanártól kapott linken, egy általa választott becenévvel ír.

| Adat | Cél | Jogalap | Megőrzés |
|---|---|---|---|
| **Becenév** (linkenként egyedi; a diák választja) | a beadás megjelölése a tanárnak, a becenév-ütközés kizárása | **[JOGÁSZ: a tanár/iskola jogalapja: közfeladat, jogos érdek vagy hozzájárulás; 16 év alatt a szülő hozzájárulása?]** | a beadással együtt (lásd lent) |
| A beírt **dolgozat szövege**; a beadás időpontja és állapota | a dolgozat értékelése | **[JOGÁSZ]** | a beadástól **12 hónapig**, utána automatikusan törlődik |
| Az MI nyers értékelése (pontszám, hibák jelölése, javaslat) – ezt csak a tanár látja | az értékelés elkészítése, a tanár támogatása | **[JOGÁSZ]** | mint fent |
| A tanár által jóváhagyott visszajelzés, pontszám, jegy – a diák a saját linkjén látja | a diák tájékoztatása | **[JOGÁSZ]** | mint fent; a diák linkje a beadástól 14 napig (jóváhagyás után legalább 7 napig) él |
| **Írás közbeni jelzések** a tanárnak: az ablak elhagyásának száma, időtartama és időpontja; a **tiltott** beillesztési kísérletek száma és időpontja; a hirtelen nagy szövegbetoldás jelzése; az írási idő. A diák **előre látja**, hogy ezt jelezzük; nem MI-detektor, nem bizonyíték. | a tanár tájékoztatása az írás körülményeiről | **[JOGÁSZ: kiskorúak viselkedésének megfigyelése – külön jogi kérdés, 17. kérdés az `adatvedelmi-kerdesek.md`-ben]** | a beadással együtt |
| A diák saját linkjének **lenyomata** (a link maga nincs tárolva) | a visszajelzés megnyitása csak a link birtokosának | **[JOGÁSZ]** | a beadással együtt |
| **Csoportos linknél:** a becenév szerinti összekapcsolás a tanár csoportján belül (az azonos becenévvel beadott dolgozatok egy „diákhoz” tartoznak; a tanár összevonhatja és szétválaszthatja), és ebből a tanárnak a diák **fejlődése** feladatról feladatra (pontok, ismétlődő hibák) | a tanár lássa egy diák fejlődését fiók nélkül | **[JOGÁSZ: ez egy álnevesített tanulási profil több beadáson át – külön kérdés]** | a csoport diákja a 12 hónapja nem beadó diáknál automatikusan törlődik |

**A dolgozatban szereplő, a diák által leírt személyes adat** (például valódi név, cím, családi történet) a szöveggel együtt eljuthat az MI-hez és a tanárhoz.
A diákoldal ezért kéri, hogy a becenév ne a valódi neve legyen, és hogy a szövegbe se írjon valódi személyes adatot (`iras.becenev_tipp`, `iras.figyelmeztetes`).
Különleges adatot (egészség, vallás stb.) a szolgáltatásnak nem kell és nem szabad tartalmaznia.

### 4.3. Műszaki adatok

| Adat | Cél | Jogalap | Megőrzés |
|---|---|---|---|
| Bejelentkezési munkamenet (Firebase Authentication; a böngésző helyi tárolójában) | a bejelentkezés fenntartása | szerződés teljesítése / a szolgáltatás működéséhez szükséges | a kijelentkezésig |
| Függvény-naplók (hibák, műveletek, felhasználó-azonosító) | működés, hibakeresés, biztonság | jogos érdek (6. cikk (1) f)) | **[ELLENŐRIZNI: a naplók megőrzési ideje a Google Cloudban (alapértelmezés szerinti)]** |
| Az AI-használat mérése: ki (tanár-azonosító), melyik művelet, melyik modell, hány token. **A dolgozat tartalma nincs benne.** | költségkövetés, a keret érvényesítése | jogos érdek / szerződés teljesítése | **[JOGÁSZ]** |
| Adatbázis-mentés: naponta készül, **14 napig** őrizzük; ezen felül pont-időbeli visszaállítás | adatvesztés elleni védelem | jogos érdek | 14 nap (a törölt adat ennyi ideig még a mentésben szerepelhet) |
| A böngésző IP-címe a Google (Firebase Hosting, Google CDN) kiszolgálóin | a weboldal kiszolgálása | jogos érdek | a Google szabályai szerint |

## 5. Mesterséges intelligencia

- A dolgozat **beírt szövege** és a feladat adatai (az értékelési szempontok, a feladatleírás) a **Google Gemini API**-nak (fizetős szint) kerülnek elküldésre az
  értékeléshez – **csak akkor, amikor a tanár elindítja az értékelést**; a diák beadása nem küld semmit az MI-nek. Az osztályszintű elemzéshez a már elkészült
  értékelések összesítése (pontok, hibák idézetei) kerül az MI-hez. Ugyancsak az MI-hez kerül a **tanár által feltöltött feladatlap**, amikor a tanár értékelési
  szempontokat kér. **A becenév nem kerül az MI-hez.** (Ha a diák a szövegbe a valódi nevét írja, az a szöveggel együtt eljut az MI-hez.)
- **Automatizált döntéshozatal nincs:** az MI csak javaslatot tesz, a pontszámról és a jegyről a **tanár dönt**, és a diák csak a jóváhagyott eredményt látja.
- Az MI hibázhat, ezért van a tanári jóváhagyás.
- A Google a feltételei szerint a fizetős szint adatait **nem használja** termékfejlesztésre/modell-tanításra, de az adat **átmenetileg bármely országban tárolódhat vagy gyorsítótárba kerülhet**
  (lásd 7. pont). **[ELLENŐRIZNI: az aktuális Google-feltételek közzététel napján; a hivatkozás: <https://ai.google.dev/gemini-api/terms>]**
- Az Üzemeltető a feltöltött tartalmat **nem használja MI-modell tanítására**, és nem ad át harmadik félnek marketing célra.
- **[JOGÁSZ – BLOKKOLÓ: a Gemini API és a Google Cloud feltételei tiltják az olyan alkalmazást, ami „valószínűleg 18 év alattiak által elérhető”. Amíg ez tisztázatlan, kiskorú diákok éles használata nem indulhat; a tájékoztatót ennek eredménye szerint kell véglegesíteni (lásd `kornyezetek-terv.md` 5.2).]**

## 6. Kik kapják meg az adatokat (adatfeldolgozók és címzettek)?

| Szolgáltató | Mire használjuk | Hol |
|---|---|---|
| **Google Cloud / Firebase** (Google Ireland Limited / Google LLC) | tárhely és adatbázis (Firestore), fájltárhely (a tanár feladatlapjai), szerverfüggvények, a tanárok bejelentkezése, weboldal-kiszolgálás | adatbázis: **EU (eur3, több EU-régió)**; fájlok: **Varsó (europe-central2)**; függvények: **Belgium (europe-west1)** |
| **Google Gemini API** | az értékelési javaslat, az osztályelemzés, a feladatlapból a szempontjavaslat | **nem garantáltan az EU-ban** (lásd 7. pont) |
| **Google reCAPTCHA (Firebase App Check)** **[A KÓD KÉSZ, KIKAPCSOLVA: csak kulcs megadása után töltődik be a diákoldalon]** | a diákoldali beadás védelme automatizált visszaélés ellen; a diák böngészőjéről műszaki jellemzők jutnak a Google-hoz | **[ELLENŐRIZNI és JOGÁSZ: a reCAPTCHA adatkezelése, tájékoztatási kötelezettség, süti-/hozzájárulás-kérdés a diákoldalon]** |
| **Stripe** (Stripe Payments Europe, Ltd., Írország) | az előfizetés fizetése és kezelése (kártyaadat, számlák, ügyfélportál) | a Stripe tájékoztatója szerint |
| *[NINCS MEGÉPÍTVE: a számlázó szolgáltatás – számlázz.hu –, ha bekötjük]* | számla kiállítása | **[KITÖLTENDŐ]** |

Az adatokhoz az Üzemeltető fér hozzá, szükség szerinti körben (hibakeresés, ügyfélkérés). **A tanár csak a saját feladatai beadásait látja; a diák csak a saját
jóváhagyott visszajelzését, a saját linkjén.** A diák az adatbázishoz közvetlenül nem fér hozzá (minden diákoldali művelet szerveren, a link alapján fut); ezt
az adatbázis hozzáférési szabályai szerver oldalon kényszerítik. Más tanár vagy diák nem látja.

## 7. Adattovábbítás az EU-n kívülre

Az **MI-feldolgozás nem garantáltan az EU-ban történik**: a Google a feltételei szerint az adatot átmenetileg bármely országban tárolhatja vagy gyorsítótárazhatja. A Google által alkalmazott
garanciák (általános szerződési feltételek / adatvédelmi keretrendszer) **[ELLENŐRIZNI és JOGÁSZ: melyik jogcím alapján, és mit kell erről mondani]**. Az EU-s feldolgozás garantálása a Google Cloud oldali
platformon (regionális végponttal) lehetséges; ennek bevezetése **[KITÖLTENDŐ: döntés]**. A tárhely és az adatbázis az EU-ban van.

## 8. Meddig őrizzük az adatokat, és hogyan törölhető?

**Automatikus törlés (naponta fut):**

- a **beadás** (a dolgozat, a jelzések, az MI-értékelés és a tanári visszajelzés) a beadástól **12 hónap** után;
- a **feladatlink** a lejárata után 12 hónappal; a link becenév-foglalásai már a lejárat után 1 nappal;
- a **csoport diákja** (a becenév szerinti összekapcsolás), ha 12 hónapja nem adott be.

A 12 hónap a tulajdonos döntése (2026-11-12), **[JOGÁSZ: megfelelő-e]**. A diák saját linkje a beadástól 14 napig él (jóváhagyás után legalább 7 napig); utána
a diák már nem éri el a visszajelzést, a tanár igen.

**[NINCS MEGÉPÍTVE]** Önkiszolgáló fióktörlés a tanárnak; egy beadás kézi törlése a tanárnak. A fiók és az egyes adatok törlését **kérésre kézzel végezzük el**:
**[KITÖLTENDŐ/VÁLLALÁS: határidő, pl. 30 nap]**. A diák a becenevéről azonosítható beadására vonatkozó kérését a tanárához intézheti (lásd 11. pont).
A törölt adat a 14 napos mentésben még legfeljebb 14 napig szerepelhet. Az osztályszintű elemzés (összesítés, idézetekkel) a feladattal együtt marad, a
beadások törlése nem érinti **[JOGÁSZ: kell-e törölni vagy anonimizálni]**.

## 9. Sütik és a böngésző tárolója

Nincs analitika, nincs reklám- vagy követő süti és nincs harmadik fél követőkódja. A böngésző helyi tárolóját **kizárólag a működéshez** használjuk (ehhez nem kér hozzájárulást a törvény; ezért nincs hozzájárulási sáv):
a tanár bejelentkezése (Firebase), a választott nyelv, a választott színtéma, a beépített bemutató állapota, az utoljára választott csoport és jegyskála; a diák
oldalán a **piszkozat** (hogy egy véletlen frissítés ne vigye el a szöveget) és a **nyugta a saját linkjével**. A diák böngészőjében tárolt adat nem kerül
hozzánk, amíg a diák be nem adja a dolgozatot.

A **betűtípusokat** saját tárhelyünkről szolgáljuk ki **[ELLENŐRIZNI: a prodon éles-e a változás; korábban a Google Fonts szerveréről jöttek]**. A weboldal működéséhez szükséges **Firebase-programkönyvtárat a Google tartalomkézbesítő hálózatáról
(`www.gstatic.com`) töltjük be**, ezért a böngésző IP-címe ennek kiszolgálójához is eljut. **[JOGÁSZ: elegendő-e ez a tájékoztatás, vagy helyi kiszolgálás kell.]**

## 10. Adatbiztonság

Az adatok titkosított (HTTPS) kapcsolaton mennek; az adatbázis és a fájltárhely hozzáférési szabályai szerver oldalon kényszerítik, hogy mindenki csak a saját adatát lássa; a tanári jogot csak a
szerver adhatja meg (nem a felhasználó); az MI-hívások és a fizetés a szerveren futnak, a titkos kulcsok nem kerülnek a böngészőbe. Az adatbázisról napi mentés készül. **[JOGÁSZ: kell-e részletesebb leírás, adatvédelmi hatásvizsgálat (kiskorúak, MI)?]**

## 11. Az Ön jogai

Kérheti a rá vonatkozó személyes adatok **hozzáférését, helyesbítését, törlését, kezelésének korlátozását**, az adathordozhatóságot, és **tiltakozhat** a jogos érdeken alapuló adatkezelés ellen;
ahol az adatkezelés hozzájáruláson alapul, a hozzájárulást bármikor visszavonhatja. A kéréseket az 1. pontban megadott e-mail-címen fogadjuk, és **egy hónapon belül** válaszolunk.
**A diákok adataival kapcsolatos kéréseket kérjük elsősorban a diák tanárának/iskolájának címezni** (ő az adatkezelő); mi segítünk a teljesítésben.

**Panasz:** a Nemzeti Adatvédelmi és Információszabadság Hatóságnál (NAIH; 1055 Budapest, Falk Miksa utca 9–11.; <https://naih.hu>) **[ELLENŐRIZNI: a hatóság aktuális elérhetősége]**,
vagy bírósághoz fordulhat. **[JOGÁSZ: más országból regisztráló felhasználók illetékes felügyeleti hatósága]**

## 12. Gyermekek és kiskorúak

**[JOGÁSZ – BLOKKOLÓ: ez a fejezet a jogi válaszok (a tanár/iskola szerepe, a hozzájárulás életkori határa, a Google feltételei) után írható meg. Addig nem szabad olyat állítani, ami a kiskorúak használatát előre
jóváhagyná vagy kizárná.]** A szolgáltatás a tanárokat célozza; a diákok a tanáruktól kapott linken, fiók nélkül, becenévvel írnak. A generatív MI-t a tanár
indítja, a diák MI-ből származó szöveget csak a tanár jóváhagyása után lát (`docs/prod-atalakitas-terv.md` 9.; a Google-nak szóló levelet ezzel kell frissíteni).

## 13. A tájékoztató módosítása

A tájékoztatót módosíthatjuk; a lényeges módosításról a bejelentkezett felhasználókat **[KITÖLTENDŐ: hogyan]** értesítjük. A mindenkori hatályos változat a weboldalon érhető el.
