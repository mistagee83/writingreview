# Jogi dokumentumok – piszkozatok (2026-10-10)

> **Ezek PISZKOZATOK, nem publikálhatók jogi felülvizsgálat nélkül.** A készítőjük (MI) nem jogász. A cél: a szolgáltatás **valós működését**
> pontosan leírni, és minden nyitott jogi döntést jól láthatóan megjelölni, hogy a jogász tudja, mit kell eldöntenie, és a tulajdonos tudja, mit kell
> kitöltenie. **A nyitóoldalra (public/index.html) addig nem kerül jogi hivatkozás, amíg a jogász jóvá nem hagyta ezeket.**

| Fájl | Mi ez |
|---|---|
| [`felhasznalasi-feltetelek.hu.md`](felhasznalasi-feltetelek.hu.md) | Általános szerződési feltételek / felhasználási feltételek (magyar) |
| [`adatkezelesi-tajekoztato.hu.md`](adatkezelesi-tajekoztato.hu.md) | Adatkezelési tájékoztató (magyar) |

Angol változat **szándékosan még nincs**: előbb a magyar szöveg jogi átnézése kell, különben a hibákat kétszer javítjuk. Az oldal alapnyelve prodon angol, tehát az
angol változat a közzététel előtt pótlandó.

## Jelölések a szövegekben

- **`[KITÖLTENDŐ: …]`** – a tulajdonosnak kell megadnia egy tényt (név, cím, adószám, e-mail, …), amit én nem ismerek.
- **`[JOGÁSZ: …]`** – jogi döntés vagy értelmezés kell; a szövegben szereplő mondat csak munkahipotézis.
- **`[ELLENŐRIZNI: …]`** – ténykérdés a kódban/üzemeltetésben/szolgáltatónál, amit közzététel előtt ellenőrizni kell.
- **`[NINCS MEGÉPÍTVE: …]`** – a szöveg olyasmit ígérne, ami a kódban még nincs meg; addig nem szabad vállalni, vagy meg kell építeni.

## Munkahipotézisek, amikre a szöveg épül (a jogász írja felül, ha eltér)

1. **Szerepek:** a **tanár** (magánszemélyként vagy iskolája nevében) a diákok adatainak **kezelője**, az Üzemeltető **adatfeldolgozó**; a **tanári fiók** adatainak
   (név, e-mail, csomag, fizetés) az Üzemeltető a kezelője. A jogász döntse el, hogy ez áll-e (közös adatkezelés? az iskola a kezelő?). Az 1. kérdés az
   `adatvedelmi-kerdesek.md`-ben.
2. **Diákok életkora:** a termék jellemzően 14–18 éves diákoknak szól, de általános iskolások is lehetnek. A szöveg **nem állít korhatárt**; a korhatár a
   Google feltételei miatt blokkoló kérdés (lásd alább).
3. **MI-feldolgozás:** a Google Gemini API fizetős szintje; EU-s feldolgozási garancia **nincs**, az adat átmenetileg bármely országban tárolódhat vagy gyorsítótárba
   kerülhet. A szöveg ezt nyíltan kimondja.
4. **Nincs automatikus törlés és nincs önkiszolgáló fiók- vagy adattörlés.** A szöveg csak azt ígéri, amit az Üzemeltető kézzel vállalni tud (kérésre történő törlés),
   és ezt `[NINCS MEGÉPÍTVE]`-vel jelöli.

## A három legfontosabb nyitott pont (ezek nélkül éles kiskorú-használat nem indulhat)

1. **Google korhatár-kikötés (blokkoló).** A Gemini API és a Google Cloud generatív AI feltételei tiltják az olyan alkalmazást, ami „likely to be accessed by
   individuals under 18”. A WritingReview diákjai kiskorúak. Részletek, forráslinkek, lehetséges megoldások: `docs/kornyezetek-terv.md` 5.2,
   `docs/google-korhatar-level.md`. **A felhasználási feltételekben ezért nincs olyan mondat, hogy az MI-t kiskorúak is használhatják; ezt a döntés után kell megfogalmazni.**
2. **Adatkezelői szerepek és jogalap a diákok adataira** (tanár/iskola vs. Üzemeltető; 16 év alatti hozzájárulás, iskolai közfeladat vagy jogos érdek).
3. **Megőrzési idő és törlés.** Jelenleg nincs; a jogász válasza után kell megépíteni (és a tájékoztatót pontosítani).

A teljes kérdéslista (18 kérdés): [`../adatvedelmi-kerdesek.md`](../adatvedelmi-kerdesek.md).

## Mit kell kitölteni, mielőtt a jogász megkapja (tulajdonos)

- Az üzemeltető adatai: név, székhely, adószám/nyilvántartási szám, elérhetőség (e-mail), egyéni vállalkozói igazolvány száma.
- Az áfa-státusz és a számlázás módja (alanyi adómentes vagy áfás; számlázz.hu bekötése még nincs).
- Az ügyfélszolgálati e-mail-cím, amin a törlési és egyéb kéréseket fogadja.
- Hogy a betűtípusok helyi kiszolgálása (Google Fonts megszüntetése) a prodon már éles-e (a tájékoztató 9. pontja).

## Mi történik a jóváhagyás után

1. A jogász válaszai és javításai bekerülnek a szövegekbe (és a válaszok az `adatvedelmi-kerdesek.md` aljára, dátummal).
2. Az angol változat elkészül (a magyar a mérvadó, vagy fordítva: a jogász döntse el).
3. Két új oldal (pl. `public/feltetelek.html`, `public/adatkezeles.html`, kétnyelvű, a nyitóoldal stílusában) és a lábléc linkjei (TODO az `index.html`-ben);
   a regisztrációnál „elfogadom” jelölőnégyzet (naplózott időponttal), és a Stripe-fiókban a feltételek linkje. **A jelölőnégyzet és a naplózás még nincs megépítve.**
4. A nyitóoldal tesztjének (`tests/landing.test.mjs`) tiltott-kifejezés listáját a jogász által jóváhagyott állításokhoz kell igazítani.
