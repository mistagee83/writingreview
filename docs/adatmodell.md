# WritingReview – adatmodell

Ez a dokumentum a Firestore/Storage szerkezetét és a hozzá tartozó
jogosultságokat rögzíti. A `firestore.rules` és a `storage.rules` ezt
valósítja meg – ha itt változik valami, ott is változnia kell.

## Alapelvek

1. **A szerepkör token-claim, nem Firestore-mező.** A `felhasznalok` doc
   `szerep` mezője csak megjelenítési tükör; a jogosultság a
   `request.auth.token.szerep`-ből jön, amit a felhasználó nem tud átírni.
   Hiányzó claim = diák (a legkisebb jogosultság).

   Az **admin külön claim** a szerep MELLETT, nem helyette – az admin
   jellemzően maga is tanár:

   ```js
   { szerep: 'tanar', admin: true }
   ```

   Figyelem: a `setCustomUserClaims` a TELJES claim-halmazt felülírja,
   ezért minden írás előtt össze kell fűzni a meglévőkkel
   (`claimOsszefuzes`) – különben egy szerep-állítás letörölné az admin
   jelzőt. Erre külön tesztek vannak, mert a hiba csak később derülne ki.

2. **A rubrika strukturált, nem szabadszöveges prompt.** A tanár egy
   űrlapot hagy jóvá; a Gemini-prompt ebből épül fel egy fix sablonnal a
   szerveren. Így minden diák ugyanazzal a mércével mérődik, és a
   feladat-dokumentumban nincs többé titkos blob.

3. **A pontszám szabadon választható.** Az értékelés a rubrika
   szempontjainak összegéből számol `max_pontszam`-ot és százalékot,
   tehát egy 20, 50 vagy 100 pontos dolgozat egyaránt működik. Az AI
   javaslata 100-as skálán jön, de a tanár átskálázhatja.

4. **Az AI nyers válasza külön dokumentumban van.** A Firestore szabályok
   *nem tudnak mező szintjén szűrni*: ha a diák olvashatja a beadás
   dokumentumát, minden mezőjét megkapja. Ezért a nyers értékelés és a
   tanár által jóváhagyott visszajelzés külön alkollekcióba kerül.

5. **Státuszt csak a szerver ír.** A `feltoltve → folyamatban → javitva →
   elkuldve` átmeneteket Cloud Function végzi (admin SDK, kihagyja a
   szabályokat). A kliens `update`-je tiltott, így a státusz nem hamisítható.

6. **Osztálykód egyszer, nem feladatonként.** A diák egyszer csatlakozik
   egy osztályhoz, onnantól a feladatok maguktól megjelennek. A csatlakozás
   Cloud Function-on megy, nem kliens-query-vel – így a diákoknak nem kell
   olvasási jog az `osztalyok` kollekcióra, és a kódpróbálgatás
   limitálható.

---

## Kollekciók

### `felhasznalok/{uid}`

| mező | típus | megjegyzés |
|---|---|---|
| `nev` | string | megjelenítendő név |
| `email` | string | |
| `szerep` | `'tanar' \| 'diak'` | **tükör** – a valódi jogosultság a token-claim |
| `letrehozva` | timestamp | |
| `tura_kesz` | bool | a beépített bemutató ne nyíljon fel magától |
| `tura_latott` | array | mely bemutató-szakaszokat látta már (max 20) |

- **olvasás:** csak saját. A tanár *nem* innen tudja meg a diákok nevét –
  az a `tagok` dokumentumokban denormalizáltan szerepel.
- **írás:** saját, de a `szerep` és `email` nem módosítható. Létrehozáskor
  a `szerep` kötelezően `'diak'`.

A `tura_*` mezők azért a profilban vannak és nem csak localStorage-ban,
hogy a bemutató **másik gépen se** nyíljon fel újra. A szabály típusban
kötött (`bool`, illetve legfeljebb 20 elemű lista), hogy a mező ne
legyen szabad tárhely a felhasználó számára. A localStorage a tartalék:
ha az írás nem megy (offline), a bemutató attól még működik.

### `felhasznalok/{uid}/osztalyaim/{osztalyId}`

Tükör: `{ nev, kod, tanar_id, csatlakozott }`. A diák innen listázza az
osztályait – a `tagok` alkollekciót collection-group query (és index)
nélkül nem tudná végigkeresni.

- **olvasás:** csak saját. **írás:** csak Cloud Function.
- *Ismert elavulás:* ha a tanár átnevezi az osztályt, az itteni `nev`
  másolat állva marad. Egy `onDocumentUpdated` trigger javítaná; amíg
  nincs, a diák a régi nevet látja.

### `osztalyok/{osztalyId}`

| mező | típus | megjegyzés |
|---|---|---|
| `nev` | string | pl. „9.B angol" |
| `kod` | string | pl. `9BK-4M2T`, egyedi (lásd `kodok`) |
| `tanar_id` | string (uid) | |
| `aktiv` | bool | inaktív osztályhoz nem lehet csatlakozni |
| `diak_szam` | number | számláló, Function írja |
| `letrehozva` | timestamp | |

- **olvasás:** a tulajdonos tanár; illetve az a diák, akinek van
  `tagok` bejegyzése. Listázni csak a tanár tud (`tanar_id` szűrővel).
- **létrehozás:** csak Cloud Function (`osztalyLetrehozas`) – az
  osztálykód egyediségét a `kodok` nyilvántartóval tranzakciósan kell
  biztosítani, kód nélküli osztály pedig használhatatlan.
- **módosítás:** a tulajdonos tanár, de csak a `nev` és `aktiv` mezőt.

### `osztalyok/{osztalyId}/tagok/{uid}`

| mező | típus | megjegyzés |
|---|---|---|
| `nev` | string | **denormalizált** – hogy a tanár ne olvassa a `felhasznalok`-at |
| `email` | string | |
| `csatlakozott` | timestamp | |

- **olvasás:** a tulajdonos tanár (teljes névsor) + a diák a sajátját.
- **írás:** csak Cloud Function (a csatlakozás tranzakciós).

### `kodok/{kod}`

Egyediség-nyilvántartó. A doc ID maga a kód, tartalma `{ osztaly_id }`.
A csatlakozás és a kódgenerálás ezen keresztül tranzakciós, így nincs
ütközés.

- **olvasás/írás:** kliensről **soha**. Csak Cloud Function.

### `feladatok/{feladatId}`

| mező | típus | megjegyzés |
|---|---|---|
| `osztaly_id` | string | |
| `tanar_id` | string (uid) | denormalizált, hogy a szabály ne kérjen lookupot |
| `cim` | string | |
| `hatarido` | timestamp \| null | |
| `aktiv` | bool | |
| `rubrika` | map | lásd alább |
| `feladatlap` | map | `{ path, url }` – **opcionális**: ha a tanár nem töltött fel képet/PDF-et, a mező nem létezik (nem `null`, nem üres map) |
| `letrehozva` | timestamp | |

**`rubrika`** – ez váltja a régi `javito_prompt` szabadszöveget:

```js
rubrika: {
  nyelv: 'angol',            // a dolgozat nyelve, lásd lentebb
  tipus: 'esszé',            // esszé | levél | leírás | elbeszélés | vélemény
  szint: 'B1',               // nyelvfüggő skála, null is lehet – lásd lentebb
  min_szo: 120,
  max_szo: 180,
  szempontok: [              // a pontszám szabadon választható (20/50/100…)
    { kulcs: 'tartalom',  cim: 'Tartalom és feladatteljesítés', suly: 30 },
    { kulcs: 'szerkezet', cim: 'Szerkezet és kohézió',          suly: 20 },
    { kulcs: 'szokincs',  cim: 'Szókincs',                      suly: 25 },
    { kulcs: 'nyelvtan',  cim: 'Nyelvhelyesség',                suly: 25 }
  ],
  egyeb_utasitas: '',        // a tanár szabadszöveges kiegészítése
  kimeneti_nyelv: 'hu',      // a visszajelzés nyelve: 'hu' | 'en' (régi feladatnál nincs: hu)
  skala: { tipus: 'fokozat', fokozatok: [ { cimke: 1, min: 0 }, { cimke: 2, min: 40 } /* … */ ] }
                             // a jegyskála; régi feladatnál nincs: a ponthatarok-ból magyar 1–5.
                             // Részletek: mukodesi-leiras.md 7.8
}
```

- **olvasás:** a tulajdonos tanár + az osztály diákjai. A rubrika
  szándékosan látható a diáknak – tudja, mi alapján értékelik.
- **írás:** a tulajdonos tanár, saját osztályára.

#### Nyelv

A `nyelv` mező határozza meg, milyen nyelven értékel az AI. Támogatott:
`angol`, `német`, `francia`, `spanyol`, `olasz`, `orosz`, `latin`,
`magyar`. Hiányzó vagy ismeretlen érték esetén **angol** (a mező
bevezetése előtti feladatok így változatlanul működnek).

Mindhárom prompt ebből épül:

| lépés | hogyan használja |
|---|---|
| átírás | „A dolgozat nyelve: német" + az ékezetek pontos visszaadása |
| értékelés | „Te egy tapasztalt **némettanár** vagy" |
| rubrika | a nyelv támpont, és az AI visszajelzi, ha mást látott |

A hibacímkék (`tipus`) a nyelv fogalmaival készülnek: angolnál
`past_simple`, németnél `dativ_falsch`. A diáknak szóló visszajelzés
**minden nyelvnél magyarul** készül.

A bővítés egyetlen megkötése: a prompt `${nyelv}tanár` alakban fűzi
össze a szót, tehát csak olyan nyelvnév adható a `NYELVEK` listához,
ami ezzel helyes magyar szót ad.

#### Szint – a mérce, amihez az AI értékel

A `szint` **jelentése nyelvfüggő**, és ez nem formalitás: ez a mérce,
amihez az AI a pontokat adja.

| nyelv | skála | értékek |
|---|---|---|
| idegen nyelv | CEFR | `A1` `A2` `B1` `B2` `C1` |
| `magyar` (anyanyelv) | évfolyam | `5-6. évfolyam` … `11-12. évfolyam`, `érettségi (közép)`, `érettségi (emelt)` |
| bármelyik | nincs mérce | `null` – az űrlapon „nem releváns" |

Anyanyelvi dolgozatnál a CEFR-nek nincs értelme: a diák nem B1-en beszél
magyarul, hanem anyanyelvi szinten. Ott az évfolyam az, ami megmondja,
mit lehet elvárni.

**A `null` valódi döntés, nem hiányzó adat.** Ilyenkor a prompt
egyáltalán nem ír szintet, és külön megtiltja az AI-nak, hogy kitaláljon
egyet – mert ha a promptban akár „nincs megadva" szerepel, a modell
kitölti magának, és ahhoz mér.

Két helyen dől el, hogy nem csúszik el:

- **`rubrikaSchema(nyelv)`** (functions) – a séma enumja a nyelv
  skálájából épül, és a `szint` **nem kötelező** mező. Korábban kötelező
  CEFR enum volt, tehát a strukturált kimenet arra kényszerítette a
  modellt, hogy magyar feladatlapra is találjon ki egy CEFR-szintet.
- **`szintSzures(nyelv, szint)`** – a feladatlap-elemzés válaszát a
  *visszaadott* nyelv skáláján ellenőrzi. Ha az AI más nyelvet látott,
  mint amit a tanár jelölt, a szint rossz skálán maradt volna.

A kliens (`feladatok.html`) a nyelvválasztáshoz építi újra a listát és a
címkét. A két lista **duplikált**, ezért van rá drift-teszt
(`tests/szint.test.mjs`): ha elcsúsznak, a tanár olyan értéket
választana, amit a szerver csendben eldob.

### `feladatok/{feladatId}/elemzes/osszegzes`

Egy feladat osztályszintű elemzése. **Csak a tanár látja** – a feladat
maga látható a diákoknak, az elemzés viszont más diákok hibáit és az
osztály teljesítményét tartalmazza. Ezért alkollekció: a szabályok
dokumentum szintjén kapuznak.

Munkamegosztás a `feladatElemzes` functionben:

| mit | ki csinálja | miért |
|---|---|---|
| szempontátlagok, hibagyakoriság | **kód** (`elemzesAggregalas`) | az aritmetika determinisztikus kell legyen |
| típushibák összevonása | **Gemini** | a címkék elcsúszhatnak, string-egyezésre nem lehet építeni |
| gyakorlatjavaslatok, generáló prompt | **Gemini** | |

```js
{
  beadas_db: 24, ertekelt_db: 22, atlag_szazalek: 68,
  szempontok: [{ kulcs, atlag_pont, max_pont, szazalek }],  // legrosszabb elöl
  kategoriak: [{ kategoria, db, erintett_diak }],
  cimkek:     [{ tipus, kategoria, db, erintett_diak }],
  olvashatosag: { jo, kozepes, gyenge },
  osszegzes: '...',                     // 2-3 bekezdés a tanárnak
  tipushibak: [{ cim, kategoria, gyakorisag, magyarazat, peldak }],
  gyakorlatok: [{ cim, cel, leiras, idotartam_perc }],
  generalo_prompt: '...',               // kész prompt feladatgeneráláshoz
  model, generalva
}
```

**Miért nem a pontos címke-egyezésre épül:** a javító AI adja a `tipus`
címkéket, és ugyanabból a hibafajtából lehet `article_missing` és
`missing_article` is. Ha a számolás ezekre épülne, 30 diáknál
szétaprózódna, és semmi nem tűnne „tipikusnak". A kód ezért csak
gyakoriságot számol, az összevonást a prompt kifejezetten a **jelentés**
alapján kéri.

Az eredmény mentve, nem generálódik újra minden megnyitásnál – új
beadások után a tanár kézzel futtatja újra.

*Későbbre:* több feladatot átfogó **haladásjelző** (javul-e az osztály
időben). Külön modul, más query, más megjelenítés.

### Kifejtős dolgozat: `feladatok/{feladatId}/kulcs/aktualis`

A kifejtős mód (`rubrika.mod: 'kifejtos'`) megoldókulcsa – a teljes leírás a
[kifejtos-mod-terv.md](kifejtos-mod-terv.md)-ben. Röviden:

- **Csak a feladat tanára** olvassa és írja: a feladatot a diák olvashatja,
  a kulcs viszont maga a megoldás.
- A kulcshoz feltöltött **tananyag** (a fájlok útvonala) is itt van, nem a
  feladatban. Tananyagtár nincs.
- A feladat és a kulcsa **egy batch-ben** mentődik; a kulcs szabálya ezért
  `getAfter()`-rel nézi a feladat tanárát.

### `rubrikak/{sablonId}`

A tanár elmentett értékelési sablonjai, hogy ne kelljen minden
feladatnál újra összeállítani a rubrikát.

| mező | típus | megjegyzés |
|---|---|---|
| `nev` | string | pl. „Esszé B1 – 50 pont" |
| `tanar_id` | string (uid) | |
| `rubrika` | map | a rubrika újrahasznosítható része |
| `letrehozva` / `frissitve` | timestamp | |

A sablon **nem tartalmazza a `feladat_leiras`-t** – az mindig az adott
feladatlaphoz tartozik, nem újrahasznosítható.

- **olvasás/írás:** csak a tulajdonos tanár.
- Ez az egyetlen tanári kollekció, ami **kliensről írható**: nincs
  denormalizálás, nincs diák-hozzáférés, nincs egyediségi megkötés –
  tehát nem kell hozzá Cloud Function.

### `beadasok/{beadasId}`

| mező | típus | megjegyzés |
|---|---|---|
| `feladat_id` | string | |
| `osztaly_id` | string | |
| `diak_id` | string (uid) | |
| `diak_nev` | string | denormalizált |
| `tanar_id` | string (uid) | denormalizált, a szabály ezt hasonlítja |
| `kep_paths` | string[] | 1–10 Storage útvonal |
| `statusz` | string | `feltoltve \| folyamatban \| javitva \| elkuldve \| hiba` |
| `atirat` | string \| null | **amit az AI kiolvasott a képekből** |
| `atirat_olvashatosag` | `jo\|kozepes\|gyenge` | az AI értékelése a kézírásról |
| `atirat_model` | string | melyik modell olvasta fel (összehasonlításhoz) |
| `hiba` | string \| null | hibaüzenet, ha a feldolgozás elhasalt |
| `letrehozva` | timestamp | |
| `frissitve` | timestamp | |

Az `atirat` külön mező, mert e nélkül nem lehet megállapítani, hogy „a diák
hibázott" vagy „az AI félreolvasta a kézírást". A tanár látja és javíthatja.

- **olvasás:** a beadó diák + az osztály tanára.
- **létrehozás:** a diák a sajátját, `statusz: 'feltoltve'`-vel, csak olyan
  osztályba, aminek tagja.
- **módosítás/törlés:** kliensről tiltott. Mindent Function ír.

### `beadasok/{beadasId}/ertekeles/ai`

Az AI strukturált kimenete. **Csak a tanár látja, soha a diák.**

```js
{
  // tömb, nem map: a rubrika szempontjai feladatonként mások lehetnek
  szempontok: [
    { kulcs: 'nyelvtan', pont: 18, max: 25, megjegyzes: '...' }
  ],
  osszpontszam: 77,           // a Function számolja, nem a modell
  max_pontszam: 100,
  szazalek: 77,
  hibak: [
    { kategoria: 'nyelvtan',  // enum, lásd lentebb
      tipus: 'past_simple',   // gépi címke a statisztikához
      idezet: 'I go to the cinema yesterday',
      javaslat: 'I went to the cinema yesterday',
      magyarazat: 'Múlt idejű időhatározó mellett past simple kell.' }
  ],
  erossegek: ['...'],         // a tanárnak
  fejlesztendo: ['...'],
  diak_szoveg: '...',         // javaslat a diáknak szóló visszajelzéshez
  szoszam: 143,
  model: 'gemini-3.8-flash',        // az ÉRTÉKELÉST végző modell
  atirat_model: 'gemini-3.8-flash', // az ÁTÍRÁST végző modell
  generalva: timestamp
}
```

A `hibak[].kategoria` zárt értékkészlet: `nyelvtan`, `szokincs`,
`szerkezet`, `tartalom`, `helyesiras`, `irasjelek`. A `tipus` szabad
címke, de a prompt kéri, hogy ugyanarra a hibafajtára mindig ugyanaz
legyen – **ebből készül az osztályszintű típushiba-statisztika**, amit
prózából nem lehetett volna aggregálni.

Az `osszpontszam`-ot és a `max_pontszam`-ot a Function számolja a
`szempontok` tömbből, nem a modell aritmetikájára bízva.

### `beadasok/{beadasId}/ertekeles/tanari`

Amit a tanár jóváhagyott, és amit a diák megkap.

```js
{
  jegy: 4,                      // a feladat skáláján: 1–5 (szám), 'A'–'F' (szöveg) vagy 0–100 (százalék)
  jegy_tipus: 'fokozat',        // 'fokozat' | 'szazalek' (százaléknál a megjelenítés %-jelet tesz mellé)
  szoveg: '...',
  szempontok: [                 // a pontozási táblázat, amit a diák lát
    { kulcs: 'nyelvtan', cim: 'Nyelvhelyesség', pont: 8, max: 10, megjegyzes: '...' }
  ],
  osszpontszam: 17, max_pontszam: 20, szazalek: 85,
  tanar_id, jovahagyva_at
}
```

A pontozás azért kerül ide, mert az `ertekeles/ai`-t a diák nem
olvashatja. A jóváhagyáskor a `pontTablazat` állítja elő: a váz
(szempontok, maximumok) az AI-értékelésből jön, a tanár csak a pontot
és a megjegyzést írhatja át, az összeget a Function számolja. A 2026.
szeptember 29. előtti jóváhagyásokban nincs `szempontok` – ott a diák
oldala a rubrika maximumait mutatja, ahogy korábban.

- **olvasás:** a tanár mindig; a diák **csak akkor**, ha a szülő beadás
  státusza `elkuldve`.
- **írás:** csak Function (a jóváhagyás egyszerre írja ezt és a státuszt).

---

## Storage

```
feladatlapok/{tanarUid}/{fajl}          – feladatlap kép/PDF
beadasok/{diakUid}/{beadasId}/{fajl}    – dolgozatfotók
tananyagok/{tanarUid}/{fajl}            – a kulcshoz feltöltött tananyag (kifejtős mód), csak a tulajdonos
```

- A feladatlapot a diák a dokumentumban tárolt tokenes letöltési URL-lel
  éri el, nem közvetlen Storage-olvasással.
- A dolgozatfotókat a tanár olvashatja: a Storage-szabály
  `firestore.get()`-tel ellenőrzi a beadás `tanar_id`-jét.
- Feltöltés: max 10 MB, csak `image/*` vagy `application/pdf`.
  Felülírás és törlés kliensről tiltott.

---

## Indexek

A `firestore.indexes.json` a következő query-ket szolgálja ki:

| kollekció | szűrő + rendezés | hol |
|---|---|---|
| `osztalyok` | `tanar_id` + `letrehozva` desc | tanári osztálylista |
| `feladatok` | `tanar_id` + `letrehozva` desc | tanári feladatlista |
| `feladatok` | `osztaly_id` + `aktiv` + `hatarido` asc | diák feladatlistája |
| `beadasok` | `diak_id` + `letrehozva` desc | diák beadásai |
| `beadasok` | `tanar_id` + `statusz` + `letrehozva` desc | javítási sor |
| `beadasok` | `feladat_id` + `letrehozva` desc | egy feladat beadásai |

---

## Megjelenítendő név

A név három helyen szerepel, mert a tanárnak nem kell a diákok
profilját olvasnia:

| hely | ki látja |
|---|---|
| `felhasznalok/{uid}.nev` | a diák maga |
| `osztalyok/{oid}/tagok/{uid}.nev` | a tanár a névsorban |
| `beadasok/*.diak_nev` | a tanár a javítási sorban |

Ezért a névmódosítás **Cloud Function** (`nevModositas`), nem kliensoldali
írás: a szabályok szerint a kliens csak az elsőt írhatja, a másik kettőt
nem. Ha csak a profil íródna át, a diák azt hinné, megjavította a nevét,
a tanár viszont továbbra is a régit látná.

A Function mindhárom helyet frissíti, 400-as darabokra bontott batch-ekben
(a Firestore korlát 500 írás).

## Modellválasztás

A három AI-lépés külön modellt használhat; a `functions/index.js`
`MODELLEK` konstansa állítja őket. Alapból mind `gemini-3.8-flash`.

| lépés | mit csinál | tét |
|---|---|---|
| `atiras` | kézírás felolvasása fotóról | **magas** – félreolvasás rosszul értékelt dolgozatot ad |
| `ertekeles` | az átirat pontozása a rubrika szerint | közepes – a tanár ellenőrzi |
| `rubrika` | feladatlap → rubrika javaslat | alacsony – a tanár űrlapon javítja |

Egy dolgozat két hívást jelent, nagyságrendileg 5 Ft (3.8 Flash) vagy
3 Ft (3.5 Flash-Lite). 300 beadás/év mellett a különbség évi néhány száz
forint, ezért alapból mindenhol a pontosabb modell fut. Ha spórolni
akarsz, a `rubrika` lépéssel kezdd – ott a legkisebb a kockázat.

### Átmeneti hibák és tartalék

A Gemini időnként `high demand` hibát ad (túlterhelt modell). Ilyenkor a
`geminiHivas` exponenciálisan növő várakozással **háromszor újrapróbál**,
majd – ha a lépéshez van tartalék modell – azzal folytatja.

| lépés | tartalék |
|---|---|
| `atiras` | 3.7 Flash → 3.5 Flash-Lite |
| `rubrika` | 3.7 Flash → 3.5 Flash-Lite |
| `ertekeles` | **nincs** |

Az értékelésnek szándékosan nincs tartaléka: ha az egyik diákot 3.8 Flash,
a másikat 3.7 Flash pontozná, sérülne az összehasonlíthatóság. Inkább
maradjon `hiba` státuszban, és a tanár futtassa újra később.

Az `atirat_model` és az `ertekeles/ai.model` mezők azt rögzítik, melyik
modell **végül** válaszolt – nem a beállított főt, hanem a tényleges
válaszadót, különben hamis lenne a nyomonkövetés.

**Az API kulcs fizetős szintű legyen:** az ingyenes szinten a Google
felhasználhatja a beküldött tartalmat a termékei fejlesztéséhez, és itt
kiskorúak kézírásáról van szó.

## Szerepkezelés

Az **admin.html** felületen az admin kinevezhet tanárokat és adminokat.
A mögötte lévő két callable admin claim-hez kötött:

| function | mit tesz |
|---|---|
| `felhasznalokListaja` | az összes felhasználó (Auth + Firestore-tükör) |
| `szerepBeallitas` | claim + tükör módosítása |

A `felhasznalok` kollekciót a szabályok **senkinek** nem engedik listázni;
az admin felület admin SDK-val, Function-ön keresztül olvassa.

Két beépített védelem:

- **Kizárás-védelem:** senki nem veheti el a SAJÁT admin jogát. Máskülönben
  admin nélkül maradhatna a rendszer, és csak szkripttel lehetne
  visszaállítani.
- A lista jelzi, ha valakinek a **tokenje elavult** (a claim és a tükör
  eltér): „⏳ belépés kell". A `guard.js` ilyenkor magától frissíti a
  tokent a következő oldalbetöltésnél.

## Az első admin (bootstrap)

Az admin felület maga is admin jogot kér, tehát az ELSŐ admint szkripttel
kell kinevezni:

```
node scripts/szerep.mjs tanar@iskola.hu tanar admin
```

A szkript szerepet és admin jogot is állít (`admin` / `nem-admin`
harmadik paraméter), és a meglévő claim-eket összefűzi.

A felhasználónak ezután újra be kell lépnie (vagy `getIdToken(true)`),
hogy az új claim bekerüljön a tokenjébe.
