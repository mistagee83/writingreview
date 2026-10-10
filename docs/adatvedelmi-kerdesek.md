# Adatvédelmi kérdések az adatvédelmi jogásznak

*Készült: 2026-10-10. A levél ugyanezt tartalmazza (Gmail-piszkozat); ez a repóbeli, szerkeszthető változat. Háttér: `kornyezetek-terv.md` 5.2,
`folytatas.md` 5/b, `google-korhatar-level.md`. A válaszokat és a jogász ajánlásait ide, a fájl aljára kell rögzíteni, dátummal.*

## 1. A szolgáltatás röviden

A WritingReview nyelvtanároknak szóló webalkalmazás. A tanár osztályt és feladatot hoz létre; a diákok az osztálykóddal csatlakoznak, és
fényképet töltenek fel a kézzel írt dolgozatukról. A rendszer egy MI-modellel (Google Gemini) átírja a kézírást, és javaslatot tesz a
pontszámra és a visszajelzésre; **a tanár átnézi és jóváhagyja**, a diák csak a tanár által jóváhagyott visszajelzést látja. A diák nem ír
a modellnek, nincs csevegés. Jellemzően középiskolások (14–18 év), de általános iskolások is lehetnek. Két magyar/angol nyelvű telepítés
van: egy „pilot” (kollégák, saját használat) és egy kereskedelmi „prod” (külső tanárok, nemzetközi piac, tanári önregisztrációval).

## 2. Milyen adatot kezelünk, és hol

- **Diák:** megjelenítendő név, e-mail-cím, osztálytagság; a kézzel írt dolgozatról feltöltött fotó(k); a fotóból készült szöveges átirat; az
  MI nyers értékelése; a tanár által jóváhagyott visszajelzés, pontszám és jegy.
- **Tanár:** név, e-mail-cím, csomag és AI-használat (számláló); később fizetési adatok (Stripe-on át, kártyaadat nálunk nem lesz).
- **Műszaki:** bejelentkezés (Firebase Authentication), függvény-naplók, AI-használat mérése (tokenszám, műveletnév; a dolgozat tartalma nincs benne),
  a Firestore napi mentése (14 napig megőrizve) és pont-időbeli visszaállítás.
- **Helyek:** Firestore `eur3` (EU több régió), fájltárhely (fotók) Varsó (`europe-central2`), szerverfüggvények Belgium (`europe-west1`).
- **MI-feldolgozás:** a Google **Gemini API** fizetős szintje (API-kulccsal). A Google feltételei szerint a fizetős szint nem használja az adatot
  termékfejlesztésre, de az adat „átmenetileg bármely országban tárolódhat vagy gyorsítótárba kerülhet”, EU-s feldolgozási garancia nincs.
  EU-s garancia csak a Google Cloud-oldali platform EU-végpontján lenne.
- **Külső erőforrások:** a betűtípusok (Syne, DM Sans) 2026-10-10-től saját tárhelyről jönnek (korábban a Google Fonts szerveréről, ilyenkor a
  látogató IP-címe a Google-hez került; a javítás a `main`-en van, a **deploy után** él). A Firebase SDK-t a lapok még a Google CDN-jéről
  (`www.gstatic.com`) töltik be, ez szintén kiadja az IP-címet. Nincs analitika, nincs reklám- vagy követő süti. A böngészőben localStorage/IndexedDB tárolja a bejelentkezést és a nyelvet.
- **Törlés és megőrzés:** tudomásom szerint jelenleg nincs automatikus megőrzési idő, és nincs önkiszolgáló fiók- vagy adattörlési funkció
  (csak az osztályból való eltávolítás). Ezeket a jogi tanács alapján kell megépíteni.
- **Jelenlegi állapot:** a pilotban a kollégák és a saját diákjaim valódi dolgozatai is átmentek (összesen néhány tucat javítás). A prodon külső
  tanárok önregisztrálhatnak, de **éles kiskorú használat nem indult el**, és csak ennek tisztázása után fog.

## 3. Kérdések

**A. Szerepek és felelősség**
1. Ki az adatkezelő és ki az adatfeldolgozó a diákok adatainál: az iskola, a tanár (magánszemélyként), én mint üzemeltető, vagy közös adatkezelők?
   Mi változik, ha egyéni tanár használja (iskola tudta nélkül), és mi, ha az iskola köt szerződést? Kell-e adatfeldolgozói megállapodás (DPA), kivel?
2. A magyar köznevelési szabályozás miatt: használhat-e egy tanár külső szolgáltatást diákok dolgozataival és jegyeivel az iskola engedélye nélkül?
   Kell-e az iskola (igazgató) hozzájárulása vagy szerződése, és hogyan érdemes ezt a szolgáltatás oldaláról kezelni?

**B. Jogalap és kiskorúak**
3. Mi a megfelelő jogalap a diákok adataira (az iskola közfeladata, jogos érdek, hozzájárulás)? Kell-e szülői hozzájárulás, mi a korhatár
   Magyarországon és más tagállamokban, és mit érdemes ebből a regisztrációba építeni?
4. Milyen tartalmú és formájú tájékoztatás kell a kiskorú diákoknak (életkorhoz igazított nyelv) és a tanároknak? Kinek a feladata (nekem vagy az iskolának)?
5. Kell-e adatvédelmi hatásvizsgálat (DPIA), mert kiskorúak adatait dolgozzuk fel MI-vel? Ki készítse, és mit kell tartalmaznia?

**C. MI-feldolgozás és adattovábbítás**
6. A Gemini API fizetős szintjén az adat „bármely országban átmenetileg tárolható”. Megfelel ez a GDPR harmadik országba történő továbbításra
   vonatkozó rendelkezéseinek (Google mint alfeldolgozó, szerződéses záradékok), vagy EU-ban kell maradnia a feldolgozásnak? A Google Cloud
   adatfeldolgozási melléklete (DPA) a Gemini API-ra is vonatkozik-e?
7. Automatizált döntéshozatal (GDPR 22. cikk): az MI javasol pontszámot és jegyet, a tanár jóváhagyja. Elég-e ez az „érdemi emberi beavatkozás”?
   Mit kell az MI használatáról közölni a diákkal és a szülővel?
8. Az EU MI-rendelet (III. melléklet) magas kockázatúnak minősítheti a tanulási eredmények értékelésére szánt MI-t. Ránk vonatkozik-e, és ha igen,
   mi a teendő és a határidő?
9. Háttér: a Google szerződési feltételei tiltják, hogy a generatív AI-t olyan alkalmazásban használjuk, ami „valószínűleg elérhető 18 év alattiak
   számára”. Ezt külön tisztázom a Google-lel; ha a jogász szerint ez az adatvédelmi állásponttól is függ, kérem jelezze.

**D. A gyakorlati adatkezelés**
10. Mennyi ideig tarthatom meg a fotót, az átiratot és az értékelést (javaslat: tanév vége + X)? Hogyan érvényesíthetők az érintetti jogok
    (hozzáférés, helyesbítés, törlés), és ki a kapcsolattartó (az iskola vagy én)?
11. A naplókra és a mentésekre (14 nap) hogyan terjed ki a törlési kérelem?
12. A Google Fonts külső betöltése elegendő ok-e arra, hogy helyi fájlokra cseréljem (a látogató IP-címe kikerül)? Kell-e süti-/tárolási
    tájékoztató vagy hozzájárulás-bekérő a localStorage/IndexedDB miatt?
13. Mi a teendő adatvédelmi incidens esetén (72 óra), és milyen nyilvántartás kell (GDPR 30. cikk) egyszemélyes üzemeltetőként? Kell-e adatvédelmi
    tisztviselő, és be kell-e jelentkeznem a NAIH-nál?

**E. Dokumentumok és nemzetközi értékesítés**
14. Mi kell a startnál: adatkezelési tájékoztató (diák/tanár), felhasználási feltételek, adatfeldolgozói megállapodás az iskoláknak/tanároknak,
    alfeldolgozók listája? Magyarul és angolul is. Van-e ehhez bevált sablon, amit át tud nézni?
15. Más tagállamok tanárai is használhatják: mire kell figyelnem (a gyermekek hozzájárulási korhatára tagállamonként más)?

**F. A jelenlegi pilot**
16. A pilotban már valódi diákmunkák mentek át. Mit kell most tennem (pótló tájékoztatás, törlés, dokumentáció)?

## 4. Mit kérek

Először egy rövid (1–2 órás) konzultációt, a fenti kérdésekre prioritási sorrendben (különösen az A, B és C pontokra), utána a tájékoztató és a
szerződéses sablonok átnézését. Kérek becslést az időre és a költségre. Szívesen küldök részletesebb műszaki leírást vagy egy bemutatót.

## Válasz és ajánlások

*(ide kerül, dátummal)*
