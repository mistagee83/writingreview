# Magyar felületi szövegek

A magyar szöveg úgy szóljon, ahogy egy kolléga mesélné el egy tanárnak.
Ez minden új szövegre és a meglévők átnézésére is vonatkozik.
Az angol külön stílust követ: `public/js/i18n-en.js` fejléce az irányadó.

## Hang

- Tegező, közvetlen, konkrét. A tanárhoz szólj, ne a „felhasználóhoz”.
  Rövid mondatok, egy gondolat mondatonként.
- Igével fogalmazz: „Lefényképezik a füzetoldalt”. Kerüld a „…ása/…ése”
  láncokat. „Egységbe kerül”, „elhasznál”, ne „fogyaszt egységet”.
- Ne legyen hivatalos vagy reklámszagú. Nincs „forradalmi”, „innovatív”,
  „átfogó megoldás”, „egyedülálló lehetőség”. Mondd ki, mit jelent az állítás
  a tanár számára.
- Az üzenet: a jó tanár még jobb lehet. A hangsúly a személyes, adatokra épülő
  visszajelzésen és a célzott fejlesztésen van, nem az időmegtakarításon.
  Háttér: `landing-uzenet-pozicionalas` memória és `docs/folytatas.md` 5/h.

## Szójegyzék és fordulatok

| Fogalom | Használd |
| --- | --- |
| Amit a diák ír | dolgozat (ne „beadvány”, ne „munka”; a felület „beadás” gombja kivétel) |
| Az AI tevékenysége | értékel / javít; a tanár átnézi és jóváhagyja |
| A tanár döntése | jóváhagy |
| A kézírásból készült szöveg | leirat; „leiratot készít”, ne a kétértelmű „átírja” |
| Pontozási szempontok | **értékelési szempontok** (a „rubrika” szó a magyar felületen nem szerepel; angolul *rubric* marad) |
| A csomag keretének mértékegysége | egység |
| Osztályszintű elemzés | osztályelemzés |
| Gyakorlóanyagot generáló szöveg | prompt |
| Ingyenes keret | kipróbálási keret |
| Visszajelzés | személyes visszajelzés, ne „személyre szabott visszajelzés” |
| Fejlődés követése | fejlődéskövetés, egy szóban |

- „Az AI csak javasol, az utolsó szó a tiéd.” Ne: „Az AI javaslatot ad, nem ítélkezik.”
- „Kiadsz egy feladatot, a diákok beadják.” Ne: „feladat létrehozása és megosztása”.
- „Mi történik, ha elfogy a keret?” Ne: „A keret kimerülése esetén…”.
- Mindig olvasd vissza: helyesírás és ragozás is számít, például „aggódnod”.

## Átnézési sorrend

1. Nyitóoldal (`landing.*`): kész, 2026-10-10.
2. Belépés és regisztráció (`index.*`, `auth.*`; az oldal jelenleg `belepes.html`): kész (ChatGPT átnézte, javítva).
2/b. Tanári főoldal, osztályok, feladatok, javítási sor (`tanar.*`, `osztalyok.*`, `fel.*`, `jav.*`): kész, 2026-10-10 (a ragozott `{nev}`-es mondatok átfogalmazva: "…az osztályból: {nev}?", nem "{nev}-t").
3. Tanári főoldal, osztályok, feladatok, javítási sor (`tanar.*`, `osztalyok.*`, `fel.*`, `jav.*`).
4. Diákoldalak (`diak.*`, `beadas.*`, `vj.*`, diákstátuszok): kész, 2026-10-10.
   Egyszerűbb állapot- és hibaüzenetek, közvetlen fotózási és beadási útmutató;
   a HTML-tartalékok is frissítve. A kulcsok és helyőrzők változatlanok.
4/b. Kész, 2026-10-10: a szerver hibaüzenetei (`szerver.*`; **a magyar felületen a szerver magyar szövege jelenik meg, ezért a `functions/index.js` `HIBA_SZOVEG`-ét és a szótárt együtt kell módosítani, és a változás functions-deployt igényel**), az osztályelemzés oldal (`elz.*`), a fejlődéskövetés (`diakok.*`).
5. Bemutató (`tura.*`), megoldókulcs-szerkesztő (`kf.*`, `kj.*`) és admin oldalak
   (`admin.*`, `aih.*`): kész, 2026-10-10. Közvetlenebb útmutatók, egyértelműbb
   jogosultsági és pontozási szövegek; az árszorzó az AI-költséget módosítja,
   az a/an példáknál a kiejtés számít. A `szerver.*` hibaüzenetek még hátravannak.
6. Jogi szövegek (`docs/jogi/`): a jogász felülvizsgálata után; a pontosság előbbre való.

## Második olvasó

Csak a természetellenes vagy hibás mondatokat jelölje meg, egy mondatos indokkal
és egy alternatívával. Ami jó, maradjon. Ne írassa át az egész szöveget, és ne
használj „humanizáló” eszközt. A javaslatról az átnéző dönt; az elfogadott változat
a szótárba kerül. A kulcsok és a `{helyőrzők}` nem változhatnak.

Másolható kérés a szöveggel és a fenti szójegyzékkel együtt:

> Magyar tanároknak szóló webalkalmazás szövegeit nézed át. Hangnem: tegező,
> közvetlen, konkrét, kolléga-a-kollégának; nincs reklámszagú vagy hivatalos
> fordulat. Nézd át az alábbi szövegeket, és csak azokat jelöld meg, amelyek
> tükörfordításnak, gépi szövegnek vagy mesterkéltnek hangzanak, vagy
> nyelvtani/helyesírási hibát tartalmaznak. Mindegyiknél írd le, mi a baj
> (egy mondatban), és adj egy természetesebb változatot. Ami jó, azt ne írd át.
> A `{valami}` jelölések helyőrzők, azokat ne módosítsd. Tartsd meg a mellékelt
> szójegyzéket.
