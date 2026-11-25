# Érettségi írásfeladatok a Writing Review-ban (terv)

*Készült: 2026-11-25, jóváhagyva 2026-11-25. Állapot: terv, kód nem változott. Csak a `main` (prod) ágra vonatkozik; a
pilotra nem kerül. A kinyerés (a feladatlapokból) egy külön munkamenet feladata, a 4. fejezet formátumában, és az
eredmény ebbe a tárolóba kerül.*

## 0. Röviden

A kétszintű angol érettségi (2005–2026, közép és emelt) **91 feladatlapjának írásfeladatai** (kb. 182, ebből 4 képes
feladat kimarad) egy közös **Érettségi feladattárba** kerülnek a WR-ben. A tanár a tárból **egy kattintással saját
feladatot** készít, és onnantól minden a megszokott úton megy (link, beadás, értékelés, jóváhagyás). Az értékelés
**négy érettségi sablonnal** megy, ugyanúgy, ahogy a WR mostani sablonjai működnek: szintenként egy a levélhez (1.
feladat) és egy a fogalmazáshoz (2. feladat), a **legfrissebb** (2026. októberi) útmutató szempontjaival és
pontjaival. A tár **a Hub pass része**. A Matura íráskészség-helye a WR nyitóoldalának egy angol nyelvű, a Maturának
szóló szakaszára mutat.

### Döntések (a tulajdonos, 2026-11-25)

| Kérdés | Döntés |
|---|---|
| A tár formája | Tár + másolás: a tanár saját, szerkeszthető feladatot kap belőle. |
| Fizetés | A tár **Hub passszal** érhető el. Az értékelés a szokásos módon kreditet használ. |
| Pontozás | **Úgy, ahogy a WR most működik:** rubrika-sablonok, szempont + pont. Négy sablon: közép és emelt szinten egy a levélhez, egy a fogalmazáshoz. A legfrissebb útmutató az alap. **Pontlevonás nincs** (szószám-szabály sem); a régi évek eltérő pontozása nem számít. Új rubrikamező és új pontszámító szabály nem kell. |
| Mit lát a diák | Mindent, amit a WR most is mutat (a feladatot, a szempontokat a pontjaikkal, a jóváhagyott visszajelzést). |
| Jegyskála | Ahogy most: a tanár választja a feladat-űrlapon. |
| Képes feladatok | **Nem kerülnek be.** |
| Matura-hivatkozás | A WR nyitóoldalán egy Maturának szóló, angol nyelvű alszakasz; oda vezet a link. |
| A kinyerés helye | Ez a tároló (a WR fejlesztői tárolója): innen megy a fejlesztés is. |
| Jogi kérdés | Nyitott, nem döntünk (7. fejezet). |

---

## 1. Kiindulás

- **A WR prod ma:** a feladatot mindig a tanár hozza létre (`feladatok/{id}`, `rubrika` mezővel). A diák **nem**
  osztálykóddal csatlakozik (az a pilot), hanem a tanár 24 órás feladatlinkjén, becenévvel ír (`iras.html?k=…`). Az
  MI-t mindig a tanár indítja, a diák csak jóváhagyott visszajelzést lát.
- **A rubrika** (`adatmodell.md`): `nyelv`, `tipus`, `szint`, `min_szo`, `max_szo`, `szempontok[]` (`kulcs`, `cim`,
  `suly`), `egyeb_utasitas`, `kimeneti_nyelv`, `skala`, `helyesiras_engedett`, `feladat_leiras`.
- **A rubrika-sablon** (`rubrikak/{id}`, tanáronként): a rubrika újrahasznosítható része (nyelv, típus, szint,
  szószám, szempontok, AI-kérés), a feladat leírása nélkül. Az érettségi sablonok ugyanezt az alakot használják.
- **A Matura** (külön termék, Supabase) a 91 lap olvasás-, nyelvhelyesség- és hallásfeladatait már digitalizálta
  (`tartalom/<év>-<időszak>-<szint>.json`). Az írás szándékosan nincs benne. Az azonosítókat innen vesszük át, hogy a
  két app ugyanarra a feladatsorra ugyanazzal a névvel hivatkozzon.

---

## 2. Az Érettségi feladattár (1. kérdés)

### A mérlegelt lehetőségek

| Lehetőség | Előny | Hátrány | Döntés |
|---|---|---|---|
| **A) Tár + másolás** | A tanár szerkesztheti; a link, a beadás, az értékelés, a sablon, a csoport változatlanul működik; a feladat elkészítése nem hív MI-t | A tár javítása a már elkészült másolatokat nem frissíti | **Ezt választottuk** |
| B) Csak rubrika-sablonok | Majdnem kódváltozás nélkül megy | A feladat szövegét a tanár hozza: a 91 lap tartalma nem kerül be | elvetve (a sablonok viszont az A része) |
| C) Élő hivatkozás a tárra | A javítás mindenkinél frissül | A tanár nem írhatja át; bonyolultabb szabályok és értékelés | elvetve |

### Hol él a tartalom

A kinyerés eredménye **ebben a tárolóban**, JSON-fájlokban (`functions/feladattar/erettsegi/`), a függvényekkel
együtt települ, és **csak tanári hívható függvényen**, Hub pass-ellenőrzéssel érhető el.

- Indok: verziózott és újragenerálható (mint a Matura `tartalom/`-ja); nem kell új Firestore-kollekció, tehát a hub
  repójában sincs szabálymódosítás; és a tartalom nem nyilvános (egy statikus JSON-t a böngészőből bárki
  letölthetne, a fizetős zár pedig csak a szerveren megbízható).
- Egy ellenőrző szkript (`scripts/feladattar-ellenorzes.mjs`) a 4. fejezet szabályait nézi, és a teszt is futtatja.

### A folyamat

1. **Tanár: 📚 Érettségi feladattár** (új menüpont, új oldal: `feladattar.html`). Hub pass nélkül az oldal egy rövid
   bemutatót mutat a Hub pass linkjével (mint az osztályszintű elemzés zárolt állapota). Hub passszal: szűrők (szint,
   év, időszak, 1./2. feladat, műfaj) és keresés a címben és a helyzetben.
2. **Előnézet:** a diáknak szóló feladat (helyzet, bemeneti szöveg, teendő, irányító szempontok, szószám) és a
   sablon szempontjai a pontjaikkal.
3. **„➕ Feladat készítése”:** egy új hívható függvény (javaslat: `feladattarbolFeladat`) ellenőrzi a jogosultságot és
   a Hub passt, majd **a szerver** hozza létre a tanár feladatát: a feladat adatai (cím, leírás, típus, szószám) +
   a feladathoz tartozó érettségi sablon. Utána a megszokott feladat-űrlap nyílik, szerkeszthetően (a jegyskálát és a
   visszajelzés nyelvét itt választja a tanár, ahogy most).
4. A rubrikában egy **eredetjelző** marad: `rubrika.tar = { id: "2024-maj-kozep-W1", verzio: 1 }` (a `rubrika` map új
   almezője a Firestore-szabályon nem igényel módosítást). Ez kell a „már elkészítetted ezt a feladatot” jelzéshez.
5. **A négy érettségi sablon** a feladat-űrlap sablonlistájában is megjelenik („Érettségi – közép, levél” stb.),
   Hub passszal, csak olvashatóan; a tanár a módosított változatot a mostani módon saját sablonként mentheti. Így
   saját, nem a tárból vett feladatot is értékeltethet érettségi szempontok szerint.
6. A „Másolat készítése” és a sablonmentés úgy működik, mint eddig. Az értékelés kreditet használ, mint eddig.

**Fizetős zár:** a `functions/kredit.js` `HUB_PASS_FUNKCIOK` listája bővül egy `erettsegi_tar` funkcióval (mint az
osztályszintű elemzés), és a zár a szerveren van: a tár listája, előnézete, a feladat elkészítése és az érettségi
sablonok is csak Hub passszal jönnek vissza.

---

## 3. A négy érettségi sablon (2. kérdés)

**Az alap: a legfrissebb útmutató, 2026. október** (`k_angol_26okt_ut.pdf`, `e_angol_26okt_ut.pdf`). A szempontok és a
pontok 2024 óta ugyanezek. A régebbi lapok feladatai is ezekkel a sablonokkal kerülnek a tárba (a régi években eltérő
pontozást nem követjük).

| Sablon | Mikor | Szempontok (kulcs: hivatalos név, pont) | Össz. |
|---|---|---|---|
| `kozep-level` | középszint, 1. feladat | `feladat`: A feladat teljesítése és a szöveg hosszúsága 5 · `szokincs`: Szókincs, kifejezésmód 3 · `nyelvhelyesseg`: Nyelvhelyesség, helyesírás 3 | 11 |
| `kozep-fogalmazas` | középszint, 2. feladat | `feladat`: A feladat teljesítése, a megadott szempontok követése 6 · `hangnem`: Hangnem, az olvasóban keltett benyomás 2 · `szovegalkotas`: Szövegalkotás 4 · `szokincs` 5 · `nyelvhelyesseg` 5 | 22 |
| `emelt-level` | emelt szint, 1. feladat | `feladat` 4 · `hangnem` 2 · `szovegalkotas` 3 · `szokincs` 3 · `nyelvhelyesseg` 3 | 15 |
| `emelt-fogalmazas` | emelt szint, 2. feladat | `feladat` 4 · `szovegalkotas` 5 · `szokincs` 3 · `nyelvhelyesseg` 3 | 15 |

A „levél” és a „fogalmazás” a feladat **sorszámát** jelenti (az 1. a rövidebb levél/e-mail, a 2. a hosszabb
szöveg), nem a műfajt: középszinten a 2. feladat is gyakran e-mail. A feladat saját műfaja a `tipus`-ba és a
leírásba kerül.

**A sablon mezői** (a mostani rubrika-sablon alakja):

| Mező | Érték |
|---|---|
| `nyelv` | `angol` |
| `szint` | `B1` (közép) · `B2` (emelt) – az útmutató sávleírásai is így szólnak |
| `tipus` | a sablonban `levél` / `esszé`; a tárból készült feladatnál a feladat saját típusa felülírja |
| `min_szo`, `max_szo` | a sablonban a 2026. októberi lap értékei; a tárból készült feladatnál a feladat saját szószáma |
| `szempontok[]` | a fenti táblázat: `kulcs`, `cim` (a hivatalos magyar név), `suly` (= a hivatalos pont) |
| `egyeb_utasitas` | az MI-nek szóló kérés: ez középszintű/emelt szintű érettségi feladat, a pontot az útmutató sávleírásai szerint add; szempontonként a sávok röviden, az útmutató szövegéből (pl. „feladat, 5 pont: valamennyi irányító szempontot megfelelően kidolgozta; 4–3 pont: …”); a nyelvhelyességnél az a kikötés, hogy ismétlődő igeidő-, létige-, kérdő/tagadó- és egyeztetési hibánál nem adható maximum; és a hivatalos kiütő szabály mint értékelési utasítás (ha a feladat teljesítése 0 pont, a többi szempont is 0). |

A szószám a feladat-űrlapon és a diák szószámlálóján látszik, és az MI a feladatteljesítésnél figyelembe veszi, ahogy
most; pontlevonás nincs. Az egységes `kulcs` kell az osztályszintű elemzéshez és a csoportos fejlődéskövetéshez.

**Kódváltozás a pontozáshoz nem kell:** a sablonok a mostani rubrika-alakban vannak, az értékelő prompt és a
pontszámítás változatlan.

---

## 4. Adatformátum a kinyeréshez (3. kérdés)

### Fájlok

- **Feladatsoronként egy JSON-fájl**, a Matura azonosítójával: `<év>-<időszak>-<szint>.json`
  (pl. `2024-maj-kozep.json`, `2005-maj2-emelt.json` az `e_angolV30` lapra), összesen 91, a
  `functions/feladattar/erettsegi/` mappában.
- **A négy sablon** egy külön fájlban: `functions/feladattar/erettsegi/sablonok.json` (3. fejezet), a 2026. októberi
  útmutatóból.
- **A forráslista** a Matura `tartalom/*.json` fájljainak `sourceFiles` mezője (a feladatlap és az útmutató útja).
  Figyelem: a 2005. októberi–novemberi középszintű lap a „2005. Hagyományos október-novemberi…” mappában van;
  mappanév alapján szűrve kimaradna (91 lap, nem 90). A forrásmappát csak olvasni szabad.
- A kulcsnevek magyarok, a WR rubrikájához igazodva. A diáknak szóló szövegek **angolul, a feladatlap szerint, szó
  szerint** (a papírra utaló részek nélkül, mint a Maturában). Hogy a felület mit mutat ebből, az a jogi kérdés (7.)
  után dőlhet el; a kinyerés a teljes szöveget rögzíti.
- A tartalmat kézzel nem szerkesztjük: a kinyerő és a kézi kiegészítései (mint a Matura `kezi.js`-e) mindig
  újragenerálják. A kinyerő szkriptek helye: `scripts/erettsegi/`.

### Feladatsor (a fájl gyökere)

| Mező | Típus | Tartalom |
|---|---|---|
| `formatum_verzio` | szám | `1` |
| `id` | szöveg | `2024-maj-kozep` (= a Matura `id`-ja) |
| `ev`, `idoszak`, `szint` | szám / szöveg | `2024`; `maj` \| `okt` \| `nov` \| `febr` \| `maj2`; `kozep` \| `emelt` |
| `vizsga_datum` | szöveg | `2024-05-09` |
| `kod` | szöveg | a lap kódja, pl. `K2412` |
| `forras_fajlok` | objektum | `{ feladatlap, utmutato }`, a forrásmappához viszonyított út |
| `feladatok[]` | lista | a bekerülő írásfeladatok (jellemzően 2) |
| `kimaradt[]` | lista | `{ sorszam, ok, megjegyzes }` – a kimaradó feladatok; `ok`: `kep` (a feladat képre épül vagy képre utal), `kep_szoveg` (a bemeneti szöveg csak képként van a lapon), `egyeb` |
| `megjegyzesek[]` | lista | ellenőrizendő pontok a gépi kinyerésből |

### Feladat (`feladatok[]`)

| Mező | Típus | Tartalom |
|---|---|---|
| `id` | szöveg | `<feladatsor>-W<sorszám>`, pl. `2024-maj-kozep-W2` |
| `sorszam` | szám | 1 vagy 2 |
| `sablon` | szöveg | `kozep-level` \| `kozep-fogalmazas` \| `emelt-level` \| `emelt-fogalmazas` (a szint és a sorszám adja) |
| `eredeti_jeloles` | szöveg | ahogy a lapon áll: `Task 1`, `Task A` |
| `cim` | szöveg | rövid angol cím a tárhoz és a WR feladatcímhez (≤ 80 karakter), pl. `Email to Pavel about his girlfriend's blue hair` |
| `mufaj` | szöveg | az eredeti műfaj: `email`, `letter`, `blog post`, `comment`, `forum post`, `article`, `essay`, … |
| `tipus` | szöveg | a WR típusa: `levél` (email, letter), `vélemény` (comment, forum post, véleményt kérő blogbejegyzés), `esszé` (article, essay), egyébként `egyéb` |
| `szoszam` | objektum | `{ min, max, szoveg }`: `100, 120, "100-120 words"`. Ha a lap csak „about N words”-t ad, `min` és `max` `null`, a `szoveg` megmarad (a leírásban látszik). |
| `helyzet` | szöveg | a bevezető szöveg angolul, szó szerint |
| `bemenet` | objektum \| `null` | a szöveg, amire a diák reagál: `{ fajta, cim, bekezdesek[], forras }`; `fajta`: `email` \| `advertisement` \| `post` \| `article` \| `notice` \| `other`; a `forras` a lapon vagy az útmutató „Források” részében megadott forrás (URL, kiadvány) |
| `teendo` | szöveg | a „Write an email of … words to … in which you” mondat |
| `iranyito_szempontok[]` | lista | a felsorolt pontok szó szerint, felsorolásjel nélkül |
| `zaro_utasitas` | szöveg \| `null` | az irányító szempontok **utáni** utasítás, ha van (pl. „This is the title of your article: …”); a kinyeréskor került be (2026-11-25), 7 régi feladatnál |
| `kezdes` | szöveg \| `null` | a „Begin like this:” utáni sor, pl. `Hi,` (ritkán két sor, sortöréssel) |
| `oldalak` | objektum | `{ feladatlap: [3] }` az ellenőrzéshez |
| `megjegyzesek[]` | lista | ellenőrizendő pontok |

A WR ebből építi a feladat **leírását** (`feladat_leiras`): helyzet, bemeneti szöveg, teendő, irányító szempontok,
kezdés – a kivetítés és a diák linkje ezt mutatja.

### Példa (2024. május, középszint; a bemeneti szöveg rövidítve)

```json
{
  "formatum_verzio": 1,
  "id": "2024-maj-kozep",
  "ev": 2024, "idoszak": "maj", "szint": "kozep",
  "vizsga_datum": "2024-05-09", "kod": "K2412",
  "forras_fajlok": {
    "feladatlap": "2024 - Középszintű május/k_angol_24maj_fl.pdf",
    "utmutato": "2024 - Középszintű május/k_angol_24maj_ut.pdf"
  },
  "feladatok": [
    {
      "id": "2024-maj-kozep-W2",
      "sorszam": 2,
      "sablon": "kozep-fogalmazas",
      "eredeti_jeloles": "Task 2",
      "cim": "Email to Pavel about his girlfriend's blue hair",
      "mufaj": "email",
      "tipus": "levél",
      "szoszam": { "min": 100, "max": 120, "szoveg": "100-120 words" },
      "helyzet": "You received the following email from your 18-year-old Polish friend, Pavel:",
      "bemenet": {
        "fajta": "email",
        "cim": null,
        "bekezdesek": [
          "You know how opinionated my mum is; …",
          "You know my girlfriend Dorota. …",
          "I think you'll understand why I was completely shocked … she had dyed her hair blue!!! …",
          "What do you think? Is there anything I could do to prevent a catastrophe?"
        ],
        "forras": null
      },
      "teendo": "Write an email of 100-120 words to Pavel in which you tell him what you think",
      "iranyito_szempontok": [
        "of teenagers dying their hair,",
        "of his mother's opinion,",
        "of Dorota's explanation,",
        "he could do in this situation."
      ],
      "kezdes": "Hi,",
      "oldalak": { "feladatlap": [3] },
      "megjegyzesek": []
    }
  ],
  "kimaradt": [
    { "sorszam": 1, "ok": "kep", "megjegyzes": "„Here's a photo you took of your room” – a 2. irányító szempont a képre épül." }
  ],
  "megjegyzesek": []
}
```

### A sablonfájl (`sablonok.json`)

```json
{
  "formatum_verzio": 1,
  "forras": "2026 - Középszintű október/k_angol_26okt_ut.pdf; 2026 - Emeltszintű október/e_angol_26okt_ut.pdf",
  "sablonok": [
    {
      "id": "kozep-level",
      "nev": "Érettségi – középszint, levél (1. feladat)",
      "rubrika": {
        "nyelv": "angol", "tipus": "levél", "szint": "B1", "min_szo": 80, "max_szo": 100,
        "szempontok": [
          { "kulcs": "feladat", "cim": "A feladat teljesítése és a szöveg hosszúsága", "suly": 5 },
          { "kulcs": "szokincs", "cim": "Szókincs, kifejezésmód", "suly": 3 },
          { "kulcs": "nyelvhelyesseg", "cim": "Nyelvhelyesség, helyesírás", "suly": 3 }
        ],
        "egyeb_utasitas": "Ez középszintű angol érettségi írásfeladat (1. feladat, 11 pont). A pontot a hivatalos útmutató sávleírásai szerint add: …"
      }
    }
  ]
}
```

(A `min_szo`/`max_szo` a 2026. októberi lap értéke; a példában a 2024. májusi szerepel, a kinyerő a valódit írja.)

### Ellenőrzés (a kinyerő munkamenet feladata, a WR-ellenőrző is nézi)

1. 91 fájl; a lapon talált összes írásfeladat vagy a `feladatok`-ban, vagy a `kimaradt`-ban van (jellemzően 2); az
   `id`-k egyediek.
2. A `sablon` a szintnek és a sorszámnak megfelelő, és létezik a `sablonok.json`-ban; a sablonok szempontjainak
   összege 11, 22, 15, 15.
3. `szoszam`: vagy `min` ≤ `max`, vagy mindkettő `null` és van `szoveg`.
4. Minden feladatnál meg kell nézni az **oldalképet**: a bemeneti szöveg (hirdetés, poszt) szövegként van-e a PDF-ben,
   vagy csak képként (akkor `kimaradt`, `kep_szoveg`), és utal-e a feladat képre (akkor `kimaradt`, `kep`).
5. Emberi szúrópróba a PDF-fel szemben (a szöveg sorrendje, a felsorolások, a forrás).
6. A sablonok sávleírásait (`egyeb_utasitas`) a tulajdonos átolvassa.

---

## 5. Képre épülő feladatok (4. kérdés)

**Döntés: nem kerülnek be.** A gépi felmérés (2026-11-25, a 91 lap írásrészének szövegrétegéből, kulcsszavakra:
photo, picture, image, map, cartoon, poster…) szerint a kb. 182 feladatból **4 utal képre**; ezek a `kimaradt`
listába kerülnek:

| Feladat | Mire utal |
|---|---|
| 2024. május közép, 1. | „Here's a photo you took of your room” – a 2. irányító szempont a képre épül |
| 2015. október közép, A | „He sent you a picture of the Museum…” |
| 2016. október közép, A | „Here is a map of the area where the cinema is” |
| 2018. október közép, 1. | „sent you this photo and some interesting facts about Holy Island” |

A hirdetések (kb. 70 találat) a PDF-ben szövegként vannak, ezek bekerülnek. Amit a gépi felmérés nem lát: ha egy
hirdetés vagy poszt **csak képként** van a lapon, a kulcsszó nem talál rá – ezt a kinyerés lapról lapra, az
oldalképen nézi meg (4. fejezet, ellenőrzés 4.), és az ilyen feladat is kimarad.

---

## 6. Hivatkozás a Matura felől (5. kérdés)

**Döntés:** a Matura íráskészség-helyéről a link a **WR nyitóoldalának egy Maturának szóló alszakaszára** vezet. A
szakasz angol (a prod angolul nyit; a szótárkulcsok szabálya szerint magyar változat is készül).

- **Cím:** `https://review.mrandrewshub.com/#matura` (egy horgony a nyitóoldalon). A `#sso=` kezelését nem szabad
  zavarnia – a megvalósításkor teszttel kell rögzíteni.
- **Tartalom:** mi a tár (a 2005–2026-os érettségik írásfeladatai, közép és emelt, a hivatalos szempontok
  szerint); hogyan megy (a tanár kiválasztja, linket indít, a diákok becenévvel írnak, a tanár indítja az
  értékelést és jóváhagy); hogy a tár a Hub pass része; gomb: fiók létrehozása (a hub regisztrációja `return`-nel,
  mint most), illetve belépés után a feladattár. Egy mondat a diákoknak: „Students: ask your teacher to set you an
  exam writing task.”
- **Belépési út:** a Matura diákja névtelen, és a WR-ben sincs diákfiók vagy osztálykód: a diák **csak a tanára
  feladatlinkjén** írhat. Ezért a link nem diákbelépésre visz, hanem tájékoztatásra (és a tanárt a regisztrációhoz).
  Tanár nélküli diákgyakorlás nincs: ellentmondana annak, hogy az MI-t a tanár indítja, és a diák csak jóváhagyott
  visszajelzést lát (`prod-atalakitas-terv.md` 9., `google-korhatar-level.md`).
- **Adatvédelem:** a link **semmilyen azonosítót nem visz át** (becenév, eszközazonosító, kiosztáskód, Matura-fiók),
  sem a címben, sem paraméterben. Követőparaméter (`utm_…`) sincs. A két app fiókrendszere külön marad (Matura SPEC
  11/18.).
- **Később, nem most:** a Matura tanári oldalán egy feladatsorhoz kötött mélylink
  (`feladattar.html?vizsga=2024-maj-kozep`), ami belépés után a tárat arra a feladatsorra szűrve nyitja.
- **A Matura oldalán** (a Matura tárolójában, külön munkamenet): az íráskészség helyén rövid szöveg és a link; a
  Matura SPEC „Későbbi irány” bekezdését ehhez kell igazítani.

---

## 7. Jogi kérdés: mit kell tisztázni (6. kérdés)

Nem döntünk; ezeket kell a jogásszal vagy az Oktatási Hivatallal tisztázni, **mielőtt a tár élesben megnyílik** (a
Matura SPEC 11. „Tisztázandó” 1. pontjával együtt, hiszen ugyanaz a forrás):

1. **A feladatlapok szövegének újraközlése:** a feladatsorok az Oktatási Hivatal oldalán nyilvánosak, de a nyilvános
   elérhetőség nem jelent szabad felhasználást. Közölhető-e a feladatlap szövege (helyzet, utasítás, irányító
   szempontok) szó szerint egy **fizetős**, belépéshez kötött szolgáltatásban, és milyen forrásmegjelöléssel
   („Forrás: Oktatási Hivatal, 2024. május, középszint”)?
2. **Harmadik fél szövegei a feladatokban:** a bemeneti szövegek egy része valódi forrásból átvett vagy átdolgozott
   hirdetés, cikk, poszt (az útmutató „Források” része URL-lel sorolja őket). Ezekre az Oktatási Hivatal engedélye
   sem feltétlenül terjed ki. Közölhetők-e, vagy csak összefoglalva (ahogy a WR mostani feladatlap-elemzése teszi),
   vagy saját szöveggel?
3. **Az útmutató szempontjai és sávleírásai** a sablonokban (az MI-kérésben és a tanár felületén): szó szerinti
   átvétel-e, szabad-e, vagy saját megfogalmazás kell?
4. **Az MI-feldolgozás:** a feladat szövege a Gemini promptjába kerül (a fizetős API nem tanít rajta). Jelent-e ez
   külön felhasználást a szerzői jog szerint?
5. **Kereskedelmi felhasználás:** a tár a Hub pass része; a válasz ettől eltérhet egy ingyenes, oktatási
   felhasználástól.
6. **A név:** szabad-e „érettségi feladattár”-ként hirdetni (a nyitóoldal Matura-szakaszán is), és kell-e kijelenteni,
   hogy nem az Oktatási Hivatal szolgáltatása?

A válaszig a kinyerés a teljes szöveget rögzítheti a tárolóban, de a tár élesben **nem nyílik meg**. A válasz
döntheti el azt is, hogy a diák a bemeneti szöveget szó szerint vagy összefoglalva látja.

---

## 8. Lépések (egyszerre egy; mindegyik után tesztek és `node scripts/build.mjs`; deploy csak kérésre)

1. **Kinyerés** (külön munkamenet, ebben a tárolóban): a 4. fejezet formátumában a 91 feladatsor-fájl és a
   `sablonok.json`, a kinyerő szkriptekkel (`scripts/erettsegi/`), ellenőrzővel, oldalképes ellenőrzéssel és emberi
   szúrópróbával; a kimaradt és a kétes esetek listája a tulajdonosnak.
2. **Tár a kódban:** a fájlok helye, az ellenőrző szkript, teszt (minden fájl átmegy).
3. **Tár-felület és függvények:** `feladattar.html`, a lista-, előnézet- és létrehozó függvény, az érettségi sablonok
   a sablonlistában, Hub pass-zár (`erettsegi_tar`), szótárkulcsok (hu + en); tesztek (jogosultság, zár, a tárból
   készült feladat a teljes úton, emulátorral).
4. **Nyitóoldal Matura-szakasza** (`#matura`), teszt a `#sso` mellett; a `landing.test.mjs` ígéretkötése.
5. **Matura oldali link** (a Matura tárolójában, külön munkamenet).
6. **Kiadás** a jogi válasz után (`node scripts/deploy.mjs prod --yes --only hosting,functions:wr`; a hub repójában
   nincs szabályteendő, ha a 2. fejezet szerint épül).

A pilot ágat nem érinti; minden új funkció csak a `main`-re kerül.
