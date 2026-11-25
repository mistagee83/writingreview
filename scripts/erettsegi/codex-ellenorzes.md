# Feladat: az érettségi írásfeladatok kinyerésének független ellenőrzése

A Writing Review tárolójában (`D:\dev\writing-review`) a kétszintű angol érettségi 91 feladatlapjának **írásfeladatai**
(IV. rész, íráskészség) gépileg kinyert JSON-fájlokban vannak. A te dolgod **független ellenőrzés**: egyezik-e a JSON a
feladatlappal (PDF), és jók-e a négy értékelési sablon pontjai. A JSON-okat egy másik eszköz állította elő; a mérce
mindig a PDF.

## Szigorú szabályok

- **Semmit ne módosíts** a tárolóban és a forrásmappában. Ne javíts hibát, csak jelentsd.
- Egyedül az aktuális munkamappába írhatsz (ez a `D:\dev\writing-review\ellenorzes\erettsegi` mappa); a segédfájlokat
  (oldalképek, kinyert szöveg) a `_munka` almappába tedd.
- Ne tölts le semmit, és ne telepíts programot.
- Ne a kinyerő kódból (`scripts/erettsegi/kinyer.mjs`, `kezi.mjs`) következtess arra, mi a helyes. A `kezi.mjs`-t csak
  arra használd, hogy tudd, hol volt kézi beavatkozás (ott nagyobb a hiba esélye).
- Ha valamit nem tudsz eldönteni, ne találgass: jelöld `bizonytalan`-nak, és írd le, mit láttál.

## Mi hol van

| Hely | Tartalom |
|---|---|
| `D:\dev\writing-review\functions\feladattar\erettsegi\<id>.json` | egy feladatlap írásfeladatai (pl. `2024-maj-kozep.json`) |
| `…\erettsegi\sablonok.json` | a négy értékelési sablon |
| `D:\dev\writing-review\docs\erettsegi-feladattar-terv.md` | a formátum (4. fejezet) és a döntések (0. és 3. fejezet) – olvasd el előbb |
| `D:\dev\writing-review\docs\erettsegi-kinyeres-jelentes.md` | a kinyerő saját jelentése (a kétes esetek listája) |
| `D:\Dokumentumok\Tanári segédanyagok\e-books\Érettségi 2005-2026\<forras_fajlok.feladatlap>` | a feladatlap PDF-je |
| `…\<forras_fajlok.utmutato>` | a javítási-értékelési útmutató PDF-je (forrásmegjelölés, értékelési szempontok) |

A JSON `forras_fajlok` mezője a forrásmappához viszonyított út.

Eszközök:
- szöveg: `pdftotext -enc UTF-8 -layout <pdf> -` és `-raw` (két hasábos, táblázatos részeknél mindkettőt nézd meg);
- oldalkép: `py -c "import pymupdf,sys; d=pymupdf.open(sys.argv[1]); d[int(sys.argv[2])-1].get_pixmap(dpi=110).save(sys.argv[3])" <pdf> <oldal> _munka\<név>.png`,
  majd nézd meg a képet. A kétes helyeken (hasábok, táblázatok, képek, képaláírások, félkövér címek) az oldalkép dönt.

## Mit ellenőrizz feladatonként

1. **Teljesség:** a feladatlap IV. részének minden feladata („Task 1/2” vagy „Task A/B”) vagy a `feladatok`, vagy a
   `kimaradt` listában van, a helyes `sorszam`-mal és `eredeti_jeloles`-sel.
2. **`helyzet`:** szó szerint egyezik-e a feladatlap bevezetőjével.
3. **`bemenet`:** a szöveg, amire a diák reagál (e-mail, hirdetés, poszt, cikk): minden bekezdés megvan-e, szó szerint;
   nincs-e hiányzó vagy fölös szó, mondat; nem csúszott-e bele idegen szöveg (oldalszám, fejléc, „Azonosító jel”,
   pontozótábla, válaszsor); jó-e a sorrend; a `cim` a szöveg címe-e; a `fajta` illik-e. A **`forras`**: egyezik-e a
   lapon vagy az útmutató „források” részében megadott forrással, **teljes-e** (nem csonka URL), és ahhoz a
   feladathoz tartozik-e.
4. **`teendo`, `iranyito_szempontok`, `kezdes`, `zaro_utasitas`:** szó szerint, minden pont megvan, a sorrend jó, az
   alpontok a helyükön.
5. **`szoszam`:** egyezik-e a lapon kért terjedelemmel (`min`, `max`, `szoveg`).
6. **`mufaj`, `tipus`:** illik-e a laphoz (`tipus`: `levél` e-mailnél és levélnél, `vélemény` commentnél, fórumválasznál,
   `esszé` cikknél, esszénél, egyébként `egyéb`). A `cim` a tár saját rövid angol címe (nem a lapról való): csak azt
   nézd, hogy a feladatra illik-e és nem félrevezető.
7. **`sablon`:** közép 1. → `kozep-level`, közép 2. → `kozep-fogalmazas`, emelt 1. → `emelt-level`, emelt 2. →
   `emelt-fogalmazas`.
8. **`kimaradt`:** a döntés szerint a **képes feladatok kimaradnak** (ha a feladat egy képre épül vagy utal, vagy a
   bemeneti szöveg csak képként van a lapon). Nézd meg: a kimaradt feladat tényleg ilyen-e; és **a bekerült feladatok
   közül nincs-e olyan**, amelynek a bemeneti szövege (vagy egy lényeges része) csak képen áll, vagy amely egy képre
   utal („Here's a photo…”, „look at the picture”). Ehhez a képet tartalmazó feladatoldalakat oldalképen nézd meg.
9. **`megjegyzesek`:** mindegyiknél döntsd el, hogy a leírt kétség valós-e, és mi a helyes.

## A sablonok (`sablonok.json`) – csak az első adagban

Vesd össze a 2026. októberi útmutatókkal (`2026 - Középszintű október\k_angol_26okt_ut.pdf`,
`2026 - Emeltszintű október\e_angol_26okt_ut.pdf`, az „Íráskészség” rész):
- a szempontok neve és pontja (`cim`, `suly`), az összeg (közép 1. 11, közép 2. 22, emelt 1. 15, emelt 2. 15);
- a szint (`B1` közép, `B2` emelt) és a szószám (a 2026. októberi lap feladatainak terjedelme);
- az `egyeb_utasitas`: hűen foglalja-e össze az útmutató sávleírásait szempontonként (nincs-e benne tartalmi tévedés,
  hiányzó sáv, rossz pontérték). **Szándékos, nem hiba:** a szószám miatti pontlevonás hiánya (a tulajdonos döntése), és
  a „ha a feladat teljesítése 0 pont, a többi is 0” szabály megléte.
Jelentés: `sablonok.md`.

## Ami nem hiba (ne jelentsd)

- sortörés, elválasztás, szóközök; a tipográfiai jelek (idézőjel, aposztróf, gondolatjel, három pont) változatai;
- a felsorolásjelek hiánya az irányító szempontoknál;
- a papírra utaló részek hiánya (válaszvonalak, pontozótábla, „Azonosító jel”, oldalszám);
- az illusztrációk hiánya (szándékosan nem vesszük át őket), ha a feladat kép nélkül is teljes;
- a lap saját elírásai: ha a feladatlapon is úgy áll, az helyes (szó szerint vesszük át, javítás nélkül);
- a bekezdéshatár apró eltérése, ha a szöveg teljes és a sorrend jó (ezt `apróság`-ként jelezheted, de nem kötelező).

## A jelentés formája

Laponként egy fájl a munkamappában: `<lap azonosítója>.md`. Minden lap végén írd ki a fájlt, és vezesd az `allapot.md`-ben,
mely lapok készültek el – így megszakítás után onnan folytatható. Már elkészült lapot ne ellenőrizz újra.

```markdown
# 2011-maj-kozep

Ellenőrzött feladatok: W1, W2 (kimaradt: –)
Hibátlan: W2

## Eltérések

| Feladat | Mező | Súly | JSON-ban | PDF-ben | Megjegyzés |
|---|---|---|---|---|---|
| W1 | bemenet.bekezdesek[2] | szöveg | „… we offer lessons …” | „… we also offer lessons …” | kimaradt szó |
| W1 | bemenet.forras | forrás | „https://example.com/jo” | „https://example.com/jobs/music” | csonka URL |
```

A **Súly** oszlop értékei:
- `szöveg` – a diák által látott szöveg eltér (hiányzó, fölös, felcserélt rész, idegen szöveg);
- `szerkezet` – hiányzó vagy fölös feladat, irányító szempont, bekezdés; rossz sorszám, sablon, szószám;
- `kép` – a kimaradás vagy a bekerülés a képes szabály szerint vitatható;
- `forrás` – a forrásmegjelölés hiányos, csonka vagy rossz;
- `apróság` – nem érinti a feladat érthetőségét;
- `bizonytalan` – nem tudtad eldönteni; írd le, miért.

Mindig idézd pontosan mindkét változatot, hogy a hiba keresés nélkül javítható legyen.

Ha az adag kész, egészítsd ki az `osszesites.md`-t (ha nincs, hozd létre): laponként az eltérések száma súly szerint,
külön listában minden `szöveg`, `szerkezet` és `kép` súlyú eltérés, és azok a hibafajták, amelyek több lapon is
előfordulnak (valószínűleg a kinyerő egy-egy szabályának hibái).

## Fontos

- Ne állítsd, hogy egy feladat hibátlan, ha nem vetetted össze teljesen. Ha csak részben ellenőrizted, írd oda.
- A teljesség fontosabb a gyorsaságnál: inkább kevesebb lap legyen kész rendesen, mint mind felületesen.
- A válaszod végén röviden írd le, mely lapokat végezted el, és hány eltérést találtál súly szerint.
