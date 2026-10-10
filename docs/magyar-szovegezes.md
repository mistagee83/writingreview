# Magyar szövegezés – hang, szójegyzék, ellenőrzés

*A cél: a magyar szövegek úgy szóljanak, ahogy egy kolléga mesélné el egy tanárnak – ne tükörfordításnak és ne gépi szövegnek hangozzanak.
Ezt kövesse minden új magyar szöveg és a meglévők átnézése. Az angol szótár külön stílus: `public/js/i18n-en.js` fejléce.*

## Hang

- **Tegező, közvetlen, konkrét.** A tanárhoz szólunk („te”), nem a „felhasználóhoz”. Rövid mondatok, egy gondolat mondatonként.
- **Igével, nem főnévvel.** „Lefényképezik a füzetoldalt”, nem „a füzetoldal lefényképezése megtörténik”. Kerüld a „…ása/…ése” láncokat és a „fogyaszt egységet” típusú szerkezetet („egységbe kerül”, „elhasznál”).
- **Nem hivatalos, nem reklámszagú.** Nincs „forradalmi”, „innovatív”, „átfogó megoldás”, „egyedülálló lehetőség”. Ha állítunk valamit, mondjuk ki, mit jelent a tanár számára.
- **Az üzenet:** a jó tanár még jobb lehet (lásd a `landing-uzenet-pozicionalas` memóriát és a `folytatas.md` 5/h): nem időmegtakarítás, hanem személyes, adatokra épülő visszajelzés és célzott fejlesztés.

## Kerülendő (gépi vagy tükörfordítás-szagú)

| Helyette | Ne így |
|---|---|
| személyes visszajelzés | személyre szabott visszajelzés (az angol *personalised* tükre) |
| fejlődéskövetés (egy szó) | fejlődés-követés |
| „aggódnod” (hosszú ó–ú: *aggódnod*) | elírások, ragozási hibák: mindig olvasd vissza |
| „Az AI csak javasol, az utolsó szó a tiéd.” | „Az AI javaslatot ad, nem ítélkezik.” |
| átiratot készít | „átírja” (kétértelmű: átír = másít vagy leír?) |
| kiadsz egy feladatot, a diákok beadják | „feladat létrehozása és megosztása” |
| értékelési szempontok | rubrika (idegen szó; a felületen a „rubrika” a szakkifejezés, a nyitóoldalon kerüljük) |
| Mi történik, ha elfogy a keret? | „A keret kimerülése esetén…” |

## Szójegyzék (egységes használat)

| Fogalom | Szó |
|---|---|
| dolgozat, amit a diák ír | **dolgozat** (nem „beadvány”, nem „munka” – kivétel: a felület „beadás” gombja) |
| az AI értékelése | **értékel / javít** (az AI értékeli, a tanár átnézi és jóváhagyja) |
| a tanár döntése | **jóváhagy** |
| a kézírásból készült szöveg | **átirat** |
| pontozási szempontok | **értékelési szempontok** (a felületen: rubrika) |
| a csomag keretének mértékegysége | **egység** |
| osztályszintű elemzés | **osztályelemzés** |
| gyakorlóanyag generáló szöveg | **prompt** |
| az ingyenes keret | **kipróbálási keret** |

## Ellenőrzési sorrend

1. **Nyitóoldal (`landing.*`)** – a legláthatóbb; *első kör kész* (2026-10-10).
2. **Belépő és regisztráció (`index.*`, `auth.*`)** – az első találkozás a termékkel.
3. **Tanári főoldal, osztályok, feladatok, javítási sor (`tanar.*`, `osztalyok.*`, `fel.*`, `jav.*`)**.
4. **Diák oldalak (`diak.*`, `beadas.*`, `vj.*`)** – a diákok életkora miatt itt a legfontosabb az egyszerű, barátságos hang.
5. **A bemutató (`tura.*`), a megoldókulcs-szerkesztő (`kf.*`, `kj.*`), a hibaüzenetek (`szerver.*`).**
6. A jogi szövegek (`docs/jogi/`) stílusát a jogász felülvizsgálata után igazítjuk (ott a pontosság előbbre való).

## Második olvasó (ChatGPT vagy más modell)

**Jó:** ha *megjelölteti* a természetellenes mondatokat, és egy-egy alternatívát ad. **Rossz:** ha az egész szöveget átíratod, vagy „humanizáló” eszközt használsz – az utóbbiak az „AI-detektorok” kijátszására
készülnek, ezért gyakran nyelvtani hibát és fura szórendet visznek a szövegbe. A javaslatot **te döntöd el**, és az elfogadottat a szótárba mi vezetjük át (a kulcsok és a `{helyőrzők}` nem változhatnak).

Kérés a második olvasónak (másold be a szöveggel együtt):

> Magyar tanároknak szóló webalkalmazás szövegeit nézed át. Hangnem: tegező, közvetlen, konkrét, kolléga-a-kollégának; nincs reklámszagú vagy hivatalos fordulat. Nézd át az alábbi szövegeket, és
> **csak azokat jelöld meg**, amelyek tükörfordításnak, gépi szövegnek vagy mesterkéltnek hangzanak, vagy nyelvtani/helyesírási hibát tartalmaznak. Mindegyiknél írd le, mi a baj (egy mondatban), és adj egy
> természetesebb változatot. Ami jó, azt ne írd át. A `{valami}` jelölések helyőrzők, azokat ne módosítsd. Tartsd meg ezt a szójegyzéket: [illeszd be a fenti táblázatot].

**Végül egy anyanyelvi emberi olvasó** (egy tanár kolléga) hangosan olvassa el a nyitóoldalt és a GYIK-et: ahol megbotlik, ott gond van.
