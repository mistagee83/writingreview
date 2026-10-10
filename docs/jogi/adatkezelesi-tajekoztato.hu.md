# Adatkezelési tájékoztató – WritingReview

> **PISZKOZAT – jogi felülvizsgálat nélkül nem tehető közzé.** Jelölések és munkahipotézisek: [`README.md`](README.md).
> A szöveg a **2026. október 10-i tényleges működést** írja le; ahol a működés még nincs megépítve vagy jogi döntésre vár, ott jelölés áll.

*Hatályos: [KITÖLTENDŐ: dátum]. Utolsó módosítás: [KITÖLTENDŐ].*

## 1. Ki kezeli az adatait?

Az **adatkezelő** (a tanári fiókok adataira) és – a 3. pontban leírt szerepmegosztás szerint – a diákok adatainak **adatfeldolgozója**:

- Név: **[KITÖLTENDŐ: az egyéni vállalkozó neve]**, egyéni vállalkozó
- Székhely: **[KITÖLTENDŐ]**
- Adószám / nyilvántartási szám: **[KITÖLTENDŐ]**
- E-mail (adatvédelmi és törlési kérések): **[KITÖLTENDŐ]**

Adatvédelmi tisztviselőt nem neveztünk ki. **[JOGÁSZ: kötelező-e?]**

## 2. Mi ez a szolgáltatás, és mire használjuk az adatokat?

A WritingReview nyelvtanároknak (és kifejtős dolgozatokhoz bármely tantárgy tanárának) szóló webalkalmazás. A tanár osztályt és feladatot hoz létre; a diákok az
osztálykóddal csatlakoznak, és a kézzel írt dolgozatukról fényképet töltenek fel, vagy a dolgozatot az oldalon beírják. A rendszer egy mesterséges intelligencia
(MI) modellel átírja a kézírást, és **javaslatot tesz** a pontszámra és a visszajelzésre. **A tanár átnézi, szükség esetén módosítja és jóváhagyja** – a diák csak a tanár által
jóváhagyott visszajelzést látja. A diák nem ír az MI-nek, nincs csevegés.

## 3. Ki melyik adatot kezeli, és milyen szerepben?

**[JOGÁSZ: a szerepek eldöntendők; a lenti a munkahipotézis.]**

| Adat | Kinek az adata | Az Üzemeltető szerepe |
|---|---|---|
| A tanári fiók adatai (név, e-mail, csomag, használat, fizetési állapot) | a tanár | **adatkezelő** |
| A diákok adatai (név, e-mail, osztálytagság, dolgozatok, értékelések) | a diák | **adatfeldolgozó** – a tanár (vagy az iskola) az adatkezelő, és az ő utasítására kezeljük |

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
| A tanár által létrehozott osztályok, feladatok, feladatlapok, tananyagok, megoldókulcsok | a szolgáltatás nyújtása | szerződés teljesítése | a törlésig; **[NINCS MEGÉPÍTVE]** |

### 4.2. Diákok (a tanár utasítására)

| Adat | Cél | Jogalap | Megőrzés |
|---|---|---|---|
| Név, e-mail-cím, bejelentkezési azonosító, osztálytagság (mikor csatlakozott) | a diák azonosítása, osztályba sorolása | **[JOGÁSZ: a tanár/iskola jogalapja: közfeladat, jogos érdek vagy hozzájárulás; 16 év alatt a szülő hozzájárulása?]** | a fiók/osztály fennállásáig; **[NINCS MEGÉPÍTVE: törlés és megőrzési idő]** |
| A kézzel írt dolgozatról feltöltött fénykép(ek); a beírt dolgozat szövege | a dolgozat átírása és értékelése | **[JOGÁSZ]** | **[JOGÁSZ: megőrzési idő]**; jelenleg nincs automatikus törlés |
| A fényképből készült szöveges átirat; az MI nyers értékelése (pontszám, hibák jelölése, javaslat) – ezt csak a tanár látja | az értékelés elkészítése, a tanár támogatása | **[JOGÁSZ]** | mint fent |
| A tanár által jóváhagyott visszajelzés, pontszám, jegy – ezt a diák is látja | a diák tájékoztatása | **[JOGÁSZ]** | mint fent |
| A beadások időpontja és állapota | a folyamat kezelése | **[JOGÁSZ]** | mint fent |
| *Beírt dolgozatnál:* tájékoztató jelzések a tanárnak (az ablak elhagyásának száma és időtartama, a beillesztések darabszáma, karakterszáma és helye a szövegben; a beillesztett szöveg maga nem tárolódik). A diák **előre látja**, hogy ezt jelezzük; nem MI-detektor, nem bizonyíték. **[ELLENŐRIZNI: a funkció a prodon éles-e]** | a tanár tájékoztatása az írás körülményeiről | **[JOGÁSZ: kiskorúak viselkedésének megfigyelése – külön jogi kérdés, 17. kérdés az `adatvedelmi-kerdesek.md`-ben]** | a beadással együtt |

**A dolgozatban szereplő, a diák által leírt személyes adat** (például a lapra írt név, cím, családi történet) a fényképpel vagy a szöveggel együtt eljuthat az MI-hez
és a tanárhoz; erre a feladat kiírásakor érdemes felhívni a diákok figyelmét. Különleges adatot (egészség, vallás stb.) a szolgáltatásnak nem kell és nem szabad tartalmaznia.

### 4.3. Műszaki adatok

| Adat | Cél | Jogalap | Megőrzés |
|---|---|---|---|
| Bejelentkezési munkamenet (Firebase Authentication; a böngésző helyi tárolójában) | a bejelentkezés fenntartása | szerződés teljesítése / a szolgáltatás működéséhez szükséges | a kijelentkezésig |
| Függvény-naplók (hibák, műveletek, felhasználó-azonosító) | működés, hibakeresés, biztonság | jogos érdek (6. cikk (1) f)) | **[ELLENŐRIZNI: a naplók megőrzési ideje a Google Cloudban (alapértelmezés szerinti)]** |
| Az AI-használat mérése: ki (tanár-azonosító), melyik művelet, melyik modell, hány token. **A dolgozat tartalma nincs benne.** | költségkövetés, a keret érvényesítése | jogos érdek / szerződés teljesítése | **[JOGÁSZ]** |
| Adatbázis-mentés: naponta készül, **14 napig** őrizzük; ezen felül pont-időbeli visszaállítás | adatvesztés elleni védelem | jogos érdek | 14 nap (a törölt adat ennyi ideig még a mentésben szerepelhet) |
| A böngésző IP-címe a Google (Firebase Hosting, Google CDN) kiszolgálóin | a weboldal kiszolgálása | jogos érdek | a Google szabályai szerint |

## 5. Mesterséges intelligencia

- A dolgozat **képe (vagy beírt szövege)** és a feladat **szempontjai** (az értékelési szempontok, a megoldókulcs, a feladatleírás) a **Google Gemini API**-nak (fizetős szint) kerülnek elküldésre az átíráshoz és
  az értékeléshez. Ugyancsak az MI-hez kerül a **tanár által feltöltött feladatlap és tananyag**, amikor a tanár értékelési szempontokat vagy megoldókulcsot kér. **A diák neve és e-mail-címe nem kerül az MI-hez.**
  (Ha a diák a lapra leírja a nevét, az a képpel együtt eljut az MI-hez.)
- **Automatizált döntéshozatal nincs:** az MI csak javaslatot tesz, a pontszámról és a jegyről a **tanár dönt**, és a diák csak a jóváhagyott eredményt látja.
- Az MI hibázhat (a kézírás-felismerés is), ezért van a tanári jóváhagyás. Az átiratot a tanár a fotó mellett látja, így észreveheti a félreolvasást.
- A Google a feltételei szerint a fizetős szint adatait **nem használja** termékfejlesztésre/modell-tanításra, de az adat **átmenetileg bármely országban tárolódhat vagy gyorsítótárba kerülhet**
  (lásd 7. pont). **[ELLENŐRIZNI: az aktuális Google-feltételek közzététel napján; a hivatkozás: <https://ai.google.dev/gemini-api/terms>]**
- Az Üzemeltető a feltöltött tartalmat **nem használja MI-modell tanítására**, és nem ad át harmadik félnek marketing célra.
- **[JOGÁSZ – BLOKKOLÓ: a Gemini API és a Google Cloud feltételei tiltják az olyan alkalmazást, ami „valószínűleg 18 év alattiak által elérhető”. Amíg ez tisztázatlan, kiskorú diákok éles használata nem indulhat; a tájékoztatót ennek eredménye szerint kell véglegesíteni (lásd `kornyezetek-terv.md` 5.2).]**

## 6. Kik kapják meg az adatokat (adatfeldolgozók és címzettek)?

| Szolgáltató | Mire használjuk | Hol |
|---|---|---|
| **Google Cloud / Firebase** (Google Ireland Limited / Google LLC) | tárhely és adatbázis (Firestore), fájltárhely (a fotók), szerverfüggvények, bejelentkezés, weboldal-kiszolgálás | adatbázis: **EU (eur3, több EU-régió)**; fotók: **Varsó (europe-central2)**; függvények: **Belgium (europe-west1)** |
| **Google Gemini API** | a dolgozat átírása és az értékelési javaslat | **nem garantáltan az EU-ban** (lásd 7. pont) |
| **Stripe** (Stripe Payments Europe, Ltd., Írország) | az előfizetés fizetése és kezelése (kártyaadat, számlák, ügyfélportál) | a Stripe tájékoztatója szerint |
| *[NINCS MEGÉPÍTVE: a számlázó szolgáltatás – számlázz.hu –, ha bekötjük]* | számla kiállítása | **[KITÖLTENDŐ]** |

Az adatokhoz az Üzemeltető fér hozzá, szükség szerinti körben (hibakeresés, ügyfélkérés). **A tanár a saját osztályai diákjainak adatait látja, a diák csak a sajátját;** ezt az adatbázis
hozzáférési szabályai szerver oldalon kényszerítik. Más tanár vagy diák nem látja.

## 7. Adattovábbítás az EU-n kívülre

Az **MI-feldolgozás nem garantáltan az EU-ban történik**: a Google a feltételei szerint az adatot átmenetileg bármely országban tárolhatja vagy gyorsítótárazhatja. A Google által alkalmazott
garanciák (általános szerződési feltételek / adatvédelmi keretrendszer) **[ELLENŐRIZNI és JOGÁSZ: melyik jogcím alapján, és mit kell erről mondani]**. Az EU-s feldolgozás garantálása a Google Cloud oldali
platformon (regionális végponttal) lehetséges; ennek bevezetése **[KITÖLTENDŐ: döntés]**. A tárhely és az adatbázis az EU-ban van.

## 8. Meddig őrizzük az adatokat, és hogyan törölhető?

**[NINCS MEGÉPÍTVE]** Jelenleg **nincs automatikus megőrzési idő és nincs önkiszolgáló fiók- vagy adattörlés** (csak a diák eltávolítása az osztályból; a diák korábbi beadásai ilyenkor
megmaradnak, hogy a tanár és a diák továbbra is lássa őket). A törlést **kérésre kézzel végezzük el**: **[KITÖLTENDŐ/VÁLLALÁS: határidő, pl. 30 nap]**. A jogász válasza után
megépítjük az automatikus megőrzést és az önkiszolgáló törlést, és ezt a tájékoztatót módosítjuk. A törölt adat a 14 napos mentésben még legfeljebb 14 napig szerepelhet.

## 9. Sütik és a böngésző tárolója

Nincs analitika, nincs reklám- vagy követő süti és nincs harmadik fél követőkódja. A böngésző helyi tárolóját **kizárólag a működéshez** használjuk (ehhez nem kér hozzájárulást a törvény; ezért nincs hozzájárulási sáv):
a bejelentkezés (Firebase), a választott nyelv, a választott színtéma, a beépített bemutató állapota, a beírt dolgozat írás közbeni jelzéseinek ideiglenes állapota.

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
jóváhagyná vagy kizárná.]** A szolgáltatás a tanárokat célozza; a diákok a tanárjuk meghívására (osztálykóddal) csatlakoznak.

## 13. A tájékoztató módosítása

A tájékoztatót módosíthatjuk; a lényeges módosításról a bejelentkezett felhasználókat **[KITÖLTENDŐ: hogyan]** értesítjük. A mindenkori hatályos változat a weboldalon érhető el.
