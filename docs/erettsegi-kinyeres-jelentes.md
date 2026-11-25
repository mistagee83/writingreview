# Érettségi írásfeladatok: a kinyerés jelentése

*Készült: 2026-11-25. A terv: [`erettsegi-feladattar-terv.md`](erettsegi-feladattar-terv.md) (4. fejezet: formátum,
5. fejezet: képes feladatok). Csak a `main` ágat érinti; deploy nem volt. A kinyerés commitja `98e6aa1`; a Codex-ellenőrzés
utáni javítások a 7. pontban.*

## Röviden

- **Mind a 91 feladatlap megvan** (2005–2026, közép és emelt): `functions/feladattar/erettsegi/<id>.json`, a Matura
  azonosítóival (pl. `2024-maj-kozep.json`), és a négy sablon: `sablonok.json`.
- **182 írásfeladat: 176 bekerült, 6 kimaradt** (képes feladat). A 176-ból 135 levél/e-mail, 36 véleményszöveg
  (comment, fórumválasz), 4 cikk, 1 beszámoló (report).
- **Az ellenőrző hibátlan** (`node scripts/feladattar-ellenorzes.mjs`), a teszt zöld (`node --test tests/feladattar.test.mjs`, 5/5).
- **Szúrópróba:** 13 lap (2005–2026, 7 közép, 6 emelt) a PDF oldalképével összevetve. A szöveg mindenhol egyezik, két
  apró tördelési eltérés van (lent).
- **Amit neked kell átnézned:** a négy sablon sávleírásait (`egyeb_utasitas`, lent a 4. pontban), és a kétes eseteket (5. pont).

## 1. Hogyan készült

- **Kinyerő:** `scripts/erettsegi/kinyer.mjs` (`pdftotext -raw` a szöveghez, `-layout` a bekezdéshatárokhoz). A kézi
  kiegészítések külön fájlban: `scripts/erettsegi/kezi.mjs` (kimaradó feladatok, összecsúszott szövegek, táblázatos
  hirdetések, a tár rövid angol címei). A kimeneti JSON-t kézzel nem szerkesztjük: minden futás újragenerálja.
- **Forráslista:** `scripts/erettsegi/forraslista.json`, a Matura `tartalom/*.json` `sourceFiles` mezőjéből
  (`node scripts/erettsegi/forraslista.mjs <Matura tartalom/>`). A forrásmappát csak olvastam.
- **Képfelmérés:** `scripts/erettsegi/oldalkepek.py` (PyMuPDF) minden írásfeladat oldalán felsorolja a beágyazott
  képeket → `oldalkepek.json`.
- **Újragenerálás:** `node scripts/erettsegi/kinyer.mjs` (a forrásmappa alapértéke a te gépeden lévő mappa; más gépen
  az `ERETTSEGI_FORRAS` környezeti változóval vagy első paraméterként adható meg).
- **Minden feladatot átolvastam** a kinyerés után (a 176 bekerült feladat teljes szövegét), és a hibákat a kinyerőben
  vagy a `kezi.mjs`-ben javítottam. 37 feladatnál van kézi bejegyzés (6 kimaradás, 31 javítás vagy megjegyzés).

### A formátum két apró bővítése

- **`zaro_utasitas`** (szöveg vagy `null`): néhány régi lapon az irányító szempontok **után** is áll utasítás, pl.
  „This is the title of your article: Lose weight – lose friends?” (cikk, beszámoló) vagy „Do not include any dates or
  postal addresses.”. Ez a mező nélkül elveszne. 7 feladatnál van kitöltve. A WR a leírásban az irányító szempontok
  után mutathatja.
- **Többsoros `kezdes`:** egy feladatnál (2015. május emelt, 2.) a kezdés két sor („Nick 17” + „As I see it…”), sortöréssel.

## 2. A kimaradt 6 feladat

| Feladat | Ok | Miért |
|---|---|---|
| 2024. május közép, 1. | `kep` | „Here’s a photo you took of your room” – a 2. irányító szempont a fotóra épül |
| 2015. október közép, A | `kep` | „He sent you a picture of the Museum…” |
| 2016. október közép, A | `kep` | „Here is a map of the area…” – a térkép csak képként van meg |
| 2018. október közép, 1. | `kep` | „sent you this photo and some interesting facts about Holy Island” |
| 2016. május közép, A | `kep_szoveg` | **új (a gépi felmérés nem látta):** a darab címe (*The Curious Incident of the Dog in the Night-Time*) csak a plakát képén áll; a feladat („ask two questions about the play”) nélküle nem érthető |
| 2009. május emelt, B | `kep` | **új, határeset:** „about the following inventions:” után két fotó (laptop, mobil) áll. A teendő megnevezi őket („computers and mobile phones”), így kép nélkül is megírható lenne. A szabály szerint kihagytam; ha bekerüljön, a `kezi.mjs`-ből egy sort kell törölni. |

**Az oldalképes ellenőrzés:** a 182 feladatoldalból 53-on van kép (összesen 61). Mindet megnéztem; 47 feladatnál a kép
csak illusztráció (pl. egy fotó a hirdetés mellett), a szöveg teljesen megvan a szövegrétegben. Képként tárolt
(nem kijelölhető) bemeneti szöveget a fenti egyen kívül nem találtam; körvonalazott (vektoros) szöveg egyik oldalon
sincs. A döntések a `kezi.mjs` `KEPDONTES` listájában vannak, és az ellenőrző nézi, hogy mindegyik képes oldalról van döntés.

## 3. Kétes vagy kézzel kiegészített pontok (a fájlok `megjegyzesek` mezőjében is)

Ezek bekerültek, de érdemes rájuk nézni:

- **2026. október közép, 2. feladat:** a PDF a „ti”, „ft”, „tt” betűkapcsolatokat hibásan tárolja (a gép „excep onal”,
  „a er”, „forgo en” szavakat lát). A hét érintett szót (exceptional, after, edition, time ×2, forgotten, pretty) az oldalkép alapján pótoltam.
- **Táblázatos hirdetések:** 2011. május közép, A (zenetanár) és 2022. október közép, 1. (nyelvcsere): a táblázat
  sorait „fejléc: érték” alakban rögzítettem (pl. „Age: 19”).
- **Emotikonok:** 2011. május közép, B (☺) és 2018. május emelt, 2. (☹) – a lapon szimbólumbetűvel állnak; 2022.
  május közép, 2.: 😊 (a pdftotext hibásan adta ki, javítva, a teszt rögzíti).
- **Képaláírások:** 2023. május közép, 1. (négy cambridge-i program a fotók fölött) és 2024. október emelt, 1. (három
  jótékonysági szervezet három hasábban): a szöveg teljes, a sorrend az oldalképről.
- **2009. október emelt, B:** a fő pontok „o”, az alpontok felsorolásjellel állnak; az alpontokat a 2. ponthoz fűztem.
- **2011. október emelt, B:** a lap nem nevez meg műfajt („Write your opinion about Andrew’s story”); a kezdés
  („Andrew, ….”) alapján `comment`.
- **2013. október emelt, B:** a lapon „a letter of 200-250 to Tina” áll (hiányzik a „words”); a szószám 200–250.
- **2012. május emelt, B:** a „Curfew” szó lábjegyzete („¹ Curfew: time when children must be home…”) a bemenet végére került.
- **2005. második május emelt, A:** a meghívó után álló „You are surprised … to find out:” mondat és az öt pont a
  teendő, a szószám („Write an e-mail of about 150 words.”) a záró utasítás.
- **A lap szövegét szó szerint vettem át**, a feladatlap saját hibáival együtt (pl. „Write and email”, „dying their
  hair”, „issues. and a psychologist”, „shifs”). Ezekhez nem nyúltam.

## 4. A négy sablon (`sablonok.json`) – kérlek, olvasd át

A szempontok neve és pontja a 2026. októberi útmutatóé: közép 1. 5/3/3 (11), közép 2. 6/2/4/5/5 (22), emelt 1.
4/2/3/3/3 (15), emelt 2. 4/5/3/3 (15). A szószám a 2026. októberi lapé (80–100, 100–120, 120–150, 200–250). A szint
B1 (közép) és B2 (emelt). Az `egyeb_utasitas` az útmutató sávleírásainak tömör összefoglalása szempontonként.

- **Pontlevonás nincs:** az útmutató szószám-levonását (pl. közép 1.: 150 szó fölött −1, 40 szó alatt 0 pont) nem
  vettem át. Helyette: „a szószámot a feladat teljesítésénél vedd figyelembe, de külön, gépies pontlevonás nincs”.
- **A „kiütő” szabály benne van:** ha a feladat teljesítése 0 pont, a többi szempont is 0.
- **Az ismétlődő igeidő-, létige-, kérdő/tagadó- és egyeztetési hibák szabálya** (nem adható maximum) csak a
  középszintű útmutatóban szerepel, ezért csak a két középszintű sablonba került. Az emelt szintű útmutatóban ilyen nincs.
- **A `tipus`** a sablonban `levél` (1. feladat) és `esszé` (2. feladat), a terv szerint; a tárból készült feladatnál
  a feladat saját típusa írja felül.

## 5. Amit a gép nem tud, és amit érdemes tudni

- **Tördelés:** a bemeneti szövegek bekezdéshatárait a gép a PDF elrendezéséből becsüli. A szúrópróbán két kozmetikai
  eltérést láttam: 2010. október emelt, A (a félkövér hirdetéscím az első bekezdés elején áll, nem külön címként) és
  2023. október emelt, 1. (két bekezdés egybeolvadt). A szöveg mindkettőben teljes. Hasonló apróság más
  hirdetéseknél is előfordulhat (cím vagy rövid sor a szomszéd bekezdésben).
- **A forrás** (URL) 121 feladatnál van kitöltve (a Codex-ellenőrzés előtt 109): a régi lapokon a feladatlap alján, 2021-től az útmutató „Az eredeti
  szövegek forrása” részéből. Ahol egyik helyen sincs, ott `null`.
- **A cím** (`cim`) a tár rövid angol címe; ezeket én írtam (≤ 80 karakter), átírhatók a `kezi.mjs` `CIMEK` listájában.
- **A szúrópróba mintája:** 2005. május emelt A · 2006. október közép A · 2008. október közép B · 2010. október emelt A ·
  2012. október közép B · 2013. május emelt A · 2014. május emelt B · 2017. május közép 1 · 2019. október emelt 2 ·
  2021. október közép 1 · 2023. október emelt 1 · 2025. május emelt 2 · 2026. május emelt 1. Ezen kívül 9 lap oldalképét
  néztem meg a kétes esetek miatt (táblázat, képaláírás, plakát).

## 6. Ellenőrzés (a terv 4. fejezete szerint)

| Pont | Hogyan | Állapot |
|---|---|---|
| 1. 91 fájl, minden írásfeladat a `feladatok` vagy a `kimaradt` listában, egyedi id | ellenőrző | rendben |
| 2. a sablon a szintnek és a sorszámnak megfelelő, létezik; összegek 11, 22, 15, 15 | ellenőrző | rendben |
| 3. szószám: min ≤ max, vagy mindkettő `null` és van szöveg | ellenőrző | rendben |
| 4. oldalkép: képes feladat és képként tárolt szöveg | `oldalkepek.py` + szemrevételezés, ellenőrző | rendben (53 képes oldal, mind eldöntve) |
| 5. emberi szúrópróba a PDF-fel szemben | 13 lap | rendben, 2 kozmetikai eltérés |
| 6. a sablonok sávleírásait a tulajdonos átolvassa | – | **rád vár** |

Az ellenőrző a formai pontokat is nézi (kötelező mezők, típusok, a gépi kinyerés maradványai: válaszsor, fejléc,
helyettesítő jel), és a teszt egy szándékosan elrontott másolaton azt is, hogy a hibát valóban jelzi.

## 7. Codex-ellenőrzés (2026-11-25)

Független ellenőrzés mind a 91 lapon és a négy sablonon (a jelentések az `ellenorzes/erettsegi/` mappában, nincsenek a
tárolóban). 68 eltérés: 1 szöveg, 5 szerkezet, 13 forrás, 43 apróság, 6 bizonytalan. A javítások a kinyerőben, a
`kezi.mjs`-ben és a `sablonok.mjs`-ben vannak; a JSON-t újrageneráltam. Az ellenőrző hibátlan, a teszt 8/8 (három új
regressziós teszt).

**Javítva:**

- **Sablonok:** a nullázás zárójeles magyarázata mind a négy sablonban pontosítva: csak a valódi 0 pont (félreértette a
  feladatot, vagy a 0 pontos leírás illik rá) nulláz; a részleges kidolgozás az 1 pontos sáv. Az `emelt-level`
  szókincsénél a „segédanyagból aránytalanul sok szót vesz át változtatás nélkül; saját szókincse többnyire a szint alatt
  marad” a 2 pontos sávba került (az útmutató 14. oldala szerint), az 1 pontosból kikerült.
- **Forrás (13):** hibás szabály okozta. Az útmutató forráslistájának olvasója megállt az oldalfejlécnél, a „Szövegek
  forrásai” és „A szöveg forrása és a kép forrása” alaknál, a szóközzel tört soroknál, és nem ismerte fel a „szövegek és
  képek forrása” címet. Az új olvasó (`utmutatoForrasokSzovegbol`) mind a 91 útmutatón lefutott: a 11 hiányzó és az 1
  csonka forrás megvan, a többi nem változott. A 2005. második májusi emelt lap két forrása (a régi „FORRÁSOK /
  Íráskészség” rész, csak ezen a lapon van ilyen) a `kezi.mjs`-ben. A 2024. májusi közép reddit-címe („…dyed_their
  hair”) és a 2025. májusi közép „r /comments” alakja a PDF-ben is szóközzel áll; szó szerint hagytam.
- **Szöveg:** 2007. október emelt, 1.: a két hirdetés sorrendje a lap szerint (Kew felül, a filmes séta alatta).
- **Szószám:** a tartomány „about”-tal is min/max (2015. május közép, 2.: 100–120). Más lapon nincs ilyen.
- **A bemenet fajtája:** a szabály új sorrendje: hirdetés → cikk → internetes fórum, oldal, csoport (`post`) → magazin
  olvasói levele vagy cikke → e-mail → levél. **Új fajta: `letter`** (a terv 4. fejezetében is): levél, amelyről a lap nem
  mondja meg, hogy e-mail, vagy magazinban közölt olvasói levél. Ide kerültek a „bizonytalan” esetek (2008. máj., 2009.
  máj., 2009. okt., 2015. máj. közép, 2.), és ugyanígy a hasonló, nem jelzett lapok is (pl. 2006. febr. közép, 2005. máj.
  emelt). Ahol a lap e-mailt említ, de a bemenet maga hirdetés vagy ismertető (José, Chris, Robert, Mark), ott a
  `kezi.mjs` `fajta` mezője dönt. A fajták most: 70 hirdetés, 56 post, 20 e-mail, 8 levél, 15 egyéb, 4 cikk, 1 notice;
  2 feladatnak nincs bemenete. A `tipus` egyik feladatnál sem változott.
- **Cím:** a fórumbejegyzés szerzői sora (pl. „Nick 17”, „Emily 16, Oklahoma”, „Laura D”, „JODY”) gépi szabállyal nem
  cím, hanem a bemenet első sora (12 feladat). A többi címhatár a `kezi.mjs`-ben: az első bekezdésbe olvadt vagy
  bekezdésként álló cím (9 feladat), „Kathy 18” után a valódi cím, a „Post subject:” sor, a Trinity College kurzuscíme
  (az intézmény neve az első bekezdés), a könyvespolc ára (külön sor).

**A tulajdonos döntött:** a `message`/`reply` műfajú feladatok (2005. máj. közép 1., 2020. okt. emelt 1., 2022. okt.
közép 1., 2023. máj. közép 1.) `tipus`-a `levél` marad (a Codex `egyéb`-et javasolt); a terv típusszabálya ehhez igazítva.

**Még nyitott, a tulajdonos dönt:**

- 2018. október közép, 2. („Imagine ME standing there?” egy fotó alatt): bennmaradhat-e. A Codex határesetnek tartja;
  minden irányító szempont kép nélkül is megválaszolható.

**Nem hiba:** 2026. május közép, 1.: a lapon nincs bemeneti szöveg (csak helyzetleírás), a `bemenet: null` helyes. Az
útmutató ad hozzá szöveg- és képforrást, de a formátumban a forrás a bemenet része, így ennek most nincs helye.
