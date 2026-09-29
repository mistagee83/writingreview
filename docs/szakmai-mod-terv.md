# WritingReview – szakmai dolgozat mód (terv)

Állapot: **az 1. és a 2. fázis kész, 2026-09-29; nincs még telepítve.** A
tanár már létrehozhat szakmai feladatot (tananyag, kulcsvázlat, átnézés,
próbajavítás), és a beadások javítása lefut. A javító nézet és a diák
visszajelzése (3. fázis) még a régi, szempontos formában mutatja az
eredményt. Készült 2026-09-28-án, egy valódi
mintacsomag (3 szkennelt oldal: kereskedelem, marketing, pénztörténet) és
két próbafuttatás alapján – lásd [A próbák eredménye](#a-próbák-eredménye).

Hol van a kód:
- `functions/szakmai.js` – tiszta függvények, sémák, promptok (pontozás,
  idézet-ellenőrzés, kulcsellenőrzés, jegyjavaslat);
- `functions/index.js` – `feldolgozSzakmai()`, `tananyagKivonat()`, az
  elágazás a `feldolgozBeadas()`-ban;
- `functions/index.js` – a `tananyagFeldolgozas`, `kulcsKeszites`,
  `probaErtekeles` callable-ök (11. szakasz);
- `public/js/szakmai.js` – a pontozó modul **generált** böngészős példánya
  (`node scripts/szakmai-kliens.mjs`, a build is lefuttatja; drift-teszt
  ellenőrzi). Kézzel nem szerkesztendő;
- `public/js/szakmai-urlap.js` – a feladat-űrlap szakmai része;
- `tests/szakmai.test.mjs` – benne a minta regressziós esete (8/13 → 3-as).

## Cél

A rendszer eddig **íráskészséget** értékelt: nyelvi fogalmazást, szempontos
rubrikával. A szakmai tárgyaknál (első körben kereskedelem, logisztika) más
a feladat:

- a dolgozat **tényeket kér számon**, nem fogalmazást;
- a helyes válasz **a tanított tananyagtól függ**, nem az általános tudástól;
- a kérdések rövid válaszosak: felsorolás, folyamat szakaszai, táblázat,
  rövid magyarázat.

Az új mód neve a kódban `szakmai`. A meglévő nyelvi útvonal (`iras`)
**változatlan marad** – egyetlen mostani feladat sem viselkedhet másként.

---

## Alapelvek

Ezek a meglévő alapelvek ([adatmodell.md](adatmodell.md)) folytatásai.

1. **A megoldókulcs strukturált adat, nem szabadszöveg.** Kérdésenként
   elemek, pontértékkel. Az AI csak azt dönti el, hogy egy elem megvan-e –
   a pontot a kód adja.

2. **A tanár nem ír kulcsot, csak jóváhagy.** A tanároknak jellemzően nincs
   kész megoldókulcsuk. A tanár tananyagot tölt fel, abból az AI kulcsvázlatot
   készít, a tanár a **megjelölt** pontokat nézi át.

3. **A pontozási szabály a tanáré.** A próba megmutatta: hogy a sorrend
   számít-e, és mennyire szigorú a szakszóhasználat, azt sem a tananyag, sem
   az AI nem tudja kikövetkeztetni. Ezek néhány kattintásos beállítások.

4. **Nincs pont idézet nélkül.** Az AI minden elfogadott elemhez szó szerinti
   idézetet ad a diák válaszából, és a **kód ellenőrzi**, hogy az idézet
   tényleg ott van. Ha nincs ott, az elem nem jár, és a tanár jelzést kap.

5. **A kulcs a határidő előtt soha nem kerül diák által olvasható helyre.** A
   `feladatok/{id}` dokumentumot a diák olvashatja (a rubrika szándékosan
   nyilvános), a kulcs viszont maga a megoldás. Ezért külön, csak tanári
   alkollekcióba kerül. A diák **a saját visszajelzésében** látja, mi lett
   volna a helyes – lásd [A diák visszajelzése](#a-diák-visszajelzése).

6. **Téves állításért nincs levonás.** A téves állítás 0 pontot ér, és
   jelzés lesz belőle a tanárnak és a diáknak, de a többi elem pontjából nem
   von le.

---

## A tanár folyamata

```
1. Feladatlap feltöltése          (mint eddig)
2. Mód: „Szakmai dolgozat"
3. Tananyag kiválasztása          (tananyagtárból, vagy új feltöltése – nem kötelező)
4. „Kulcs készítése" gomb         → AI kulcsvázlat kérdésenként
5. Átnézés                        csak a ⚠ jelölt elemeket kell megnézni
6. Beállítások kérdésenként       sorrend, szigor, részpont
7. Próbajavítás (ajánlott)        beír egy mintaválaszt, megnézi a pontozást
8. Mentés                         a diákok látják a feladatot
```

A tananyag **nem kötelező**, de a felület jelzi, mit kockáztat a tanár
nélküle: az általános szakmai tudásra épülő kérdésekhez (4P, beszerzési
szempontok) a tananyag nélküli kulcs is hibátlan volt, a tankönyvfüggő
kérdésnél (a beszerzés szakaszai) viszont az AI a saját változatát kérte
volna számon.

---

## Adatmodell

### `feladatok/{feladatId}` – bővítés

```js
rubrika: {
  mod: 'szakmai',            // ÚJ. Hiányzó érték = 'iras' (a mostani feladatok)
  tantargy: 'kereskedelem',  // ÚJ, szabad szöveg – a promptok szakterülete
  ponthatarok: { 2: 40, 3: 55, 4: 70, 5: 85 },   // ÚJ, % – jegyjavaslathoz
  kerdesek: [                // ÚJ, csak a NYILVÁNOS rész: sorszám, max pont
    { sorszam: '1', max_pont: 3 },
    ...
  ]
  // szakmai módban NINCS szempontok / min_szo / max_szo / szint
}
tananyag_ids: ['...']        // ÚJ, a felhasznált tananyagok
```

A `ponthatarok` feladatonként állítható, de a tanári profilban megadott
alapértelmezésből töltődik elő. (A minta: 8/13 = 62% → 3-as – ez a fenti
alapértékekkel is 3.)

### `feladatok/{feladatId}/kulcs/aktualis` – ÚJ, csak tanár

```js
{
  kerdesek: [
    {
      sorszam: '3',
      szoveg: 'Írd le a beszerzés folyamatának szakaszait!',
      tipus: 'sorrend',     // lásd: Kérdéstípusok
      max_pont: 5,
      elemek: [
        { id: 'e1', allitas: 'Igényfelmérés', pont: 1,
          elfogadhato: ['szükséglet megállapítása'],
          forras: 'tananyag',   // 'tananyag' | 'altalanos'
          ellenorizendo: false },
        ...
      ],
      agak: null,           // csak 'valasztos' típusnál, lásd lent
      beallitas: {
        sorrend: 'pozicio',       // 'nem_szamit' | 'relativ' | 'pozicio'
        szakszo: 'pontos',        // 'lenyeg' | 'pontos'
        reszpont: 0.5,            // a 'reszben' elem ennyiszeres pontot ér
        kulcson_kivul: 'elfogad'  // nyílt felsorolásnál: 'elfogad' | 'tanar_dont'
      },
      megjegyzes: 'Tankönyvenként eltérhet a szakaszok száma.'  // az AI jelzése
    }
  ],
  szoszedet: ['igényfelmérés', 'beszerzési piackutatás', ...],  // az átíráshoz, a kód gyűjti
  model, generalva, modositva
}
```

**Miért alkollekció:** a Firestore szabályok nem szűrnek mező szinten. Ha a
kulcs a feladat dokumentumában lenne, minden diák letölthetné a
megoldásokat a határidő előtt.

`forras: 'altalanos'` = az elem nem a feltöltött tananyagból jön, hanem az
AI általános tudásából. Ezeket a felület kiemeli, mert pontosan itt tér el
legkönnyebben a tanár elvárása.

### `tananyagok/{tananyagId}` – ÚJ

A tanár tananyagtára, hogy ne kelljen minden dolgozatnál újra feltölteni.

| mező | típus | megjegyzés |
|---|---|---|
| `tanar_id` | string (uid) | a tulajdonos |
| `megosztva` | string[] (uid) | kollégák, akik használhatják – lásd lent |
| `cim` | string | pl. „Beszerzés – 10. évf. jegyzet" |
| `tantargy` | string | |
| `fajlok` | `{path, mime, nev}[]` | 1–5 fájl, PDF vagy kép |
| `kivonat` | string | a tananyag szövege, **egyszer** kinyerve (lásd lent) |
| `kivonat_tokenek` | int | becsült méret – figyelmeztetéshez |
| `letrehozva` | timestamp | |

- **olvasás:** a tulajdonos és a `megosztva` listában szereplő tanárok.
- **írás:** csak a tulajdonos; a `kivonat`-ot és a `megosztva`-t csak
  Function írja (a kliens a `cim`-et szerkesztheti).
- **Megosztás munkaközösségen belül:** a tulajdonos e-mail-címmel oszt meg
  egy tananyagot egy kollégával (`tananyagMegosztas` callable). A Function
  ellenőrzi, hogy a cím tanári fiókhoz tartozik-e, és felveszi az uid-ot a
  listára. Külön „munkaközösség" entitás nem kell hozzá – ha később lesz
  iskola-fogalom, a lista abból is tölthető. A megosztott tananyagot a
  kolléga csak használja, nem szerkeszti és nem osztja tovább.
- **Storage:** a fájlokat a kolléga nem tölti le, mert minden lépés a
  `kivonat`-ot használja – így a Storage-szabálynak nem kell a megosztást
  ismernie.
- **Miért kivonat:** a PDF-et nem küldjük be minden beadásnál újra. A
  feltöltéskor egy Gemini-hívás szöveggé alakítja (címsorokkal, listákkal),
  utána minden lépés ezt a szöveget használja – olcsóbb, gyorsabb, és a
  tanár meg is nézheti, mit „látott" az AI.
- **Formátum: csak PDF és kép.** DOCX/PPTX-et a tanár PDF-be menti – ez
  egy kattintás, a szerveroldali konverzió viszont külön függőség lenne.

### `beadasok/{beadasId}` – bővítés

```js
atirat: '1. Beszerzés, árutárolás...\n2. ...',   // MARAD: összefűzött szöveg,
                                                // a mostani felület így is működik
atirat_valaszok: [                               // ÚJ, szakmai módban
  { kerdes: '3', valasz: 'igényfelmérés, Számlák kiegyenlítése, ...',
    bizonytalan: ['kiegyenlítése'] }
],
atirat_tablazatok: [                             // ÚJ, ha van táblázatos kérdés
  { kerdes: '1', cellak: [{ sor, oszlop, ertek }] }
]
```

### `beadasok/{beadasId}/ertekeles/ai` – szakmai változat

```js
{
  mod: 'szakmai',
  kerdesek: [
    {
      sorszam: '3', pont: 1, max: 5,
      elemek: [
        { id: 'e1', statusz: 'megvan', idezet: 'igényfelmérés',
          pozicio: 1, pont: 1, idezet_ok: true }
      ],
      kulcson_kivul: [{ idezet, szakmailag_helyes, megjegyzes, elfogadva }],
      valasztott_ag: null,
      visszajelzes: '...'
    }
  ],
  // KOMPATIBILITÁS: a kérdésekből képzett szempontok, hogy az osztályszintű
  // elemzés (elemzesAggregalas) változtatás nélkül működjön
  szempontok: [{ kulcs: 'k3', pont: 1, max: 5, megjegyzes: '...' }],
  osszpontszam: 8, max_pontszam: 13, szazalek: 62,
  javasolt_jegy: 3,                  // ÚJ, a ponthatárokból – a kód számolja
  hibak: [...],                      // szakmai kategóriákkal, lásd lent
  diak_szoveg: '...',
  model, atirat_model, generalva
}
```

### `beadasok/{beadasId}/ertekeles/tanari` – bővítés

A jóváhagyáskor (`visszajelzesJovahagyas`) a Function ide másolja a
kérdésenkénti eredményt **a kulcs szövegével együtt** – ezt látja a diák:

```js
{
  jegy, szoveg, tanar_id, jovahagyva_at,   // mint eddig
  kerdesek: [                              // ÚJ, szakmai módban
    {
      sorszam: '3', pont: 1, max: 5,
      elemek: [
        { allitas: 'Igényfelmérés', statusz: 'megvan', idezet: 'igényfelmérés' },
        { allitas: 'Beszerzési piackutatás', statusz: 'reszben', idezet: 'Piackutatás' },
        { allitas: 'Megrendelés', statusz: 'hianyzik' }
      ]
    }
  ]
}
```

A másolat a **tanár által felülírt** státuszokat tartalmazza, nem az AI
eredetijét. A kulcs többi része (szinonimák, beállítások, `forras`,
`megjegyzes`) nem kerül át.

Szakmai hibakategóriák (a `HIBA_KATEGORIAK` mellé, módonként külön enum):
`hianyzo_elem`, `szakmai_tevedes`, `pontatlan_fogalom`, `sorrend`,
`hianyos_kifejtes`. Helyesírásért **nincs** hibabejegyzés és levonás.

### Storage

```
tananyagok/{tanarUid}/{fajl}    – ÚJ. PDF/kép, max 10 MB, csak a tulajdonos olvassa
```

---

## Kérdéstípusok és pontozás

Az AI **csak státuszt** ad elemenként: `megvan` / `reszben` / `hianyzik` /
`teves`, és a sorrendtípusnál a `pozicio`-t (hányadikként írta a diák). **A
pontot a kód számolja** – tiszta függvény, unit-tesztelhető.

| típus | példa a mintából | pontozás (kód) |
|---|---|---|
| `zart_felsorolas` | a 4P elemei | Σ elem pont (`reszben` × `reszpont`) |
| `nyilt_felsorolas` | „legalább 5 szempont" | talált elemek + elfogadott `kulcson_kivul` tételek, `max_pont`-ig |
| `sorrend` | a beszerzés szakaszai | a `beallitas.sorrend` szerint, lásd lent |
| `tablazat` | pénzkorszakok × jellemzők | cellánként egy elem (`id: 'sor|oszlop'`) |
| `magyarazat` | „Miért jelent meg a váltó?" | kulcsgondolatok = elemek |
| `valasztos` | „Fejts ki egy P-t" | `agak[]`, az AI megmondja, melyiket választotta, csak az az ág számít |

Kétnyelvű kérdés („angolul és magyarul is"): egy elem, `reszben` ha csak az
egyik nyelv szerepel – a `reszpont` beállítás dönti el, mennyit ér.

### Sorrend – három mód

A mintában a diák sorrendje (a kulcs sorszámaival): **1, 5, 2, 3**.

| mód | szabály | a minta eredménye |
|---|---|---|
| `nem_szamit` | minden megtalált elem pontot ér | 4 |
| `relativ` | a leghosszabb, helyes sorrendű részsorozat elemei érnek pontot | 3 (1, 2, 3) |
| `pozicio` | csak a pontosan a helyén lévő elem ér pontot | **1** (csak az 1.) |

A tanár a mintában `pozicio` szerint pontozott (1/5). Az AI a saját kulcsával
4 pontot adott, mert nem tudta, hogy a sorrend ennyire szigorúan számít –
**ezért beállítás, nem AI-döntés.**

### Idézet-ellenőrzés

Minden `megvan`/`reszben` elemnél a kód normalizálva (kisbetű, szóközök,
írásjelek) megkeresi az `idezet`-et a diák adott kérdésre adott válaszában.
Ha nincs meg: az elem `hianyzik` lesz, `idezet_ok: false`, és a tanár a
javító nézetben ⚠ jelzést lát. Ez olcsó, determinisztikus fék a
hallucináció ellen.

---

## AI-lépések

| lépés | bemenet | kimenet | modell-kulcs |
|---|---|---|---|
| **tananyag feldolgozás** (új) | tananyag fájlok | `kivonat` | `rubrika` |
| **kulcs készítés** (új) | feladatlap + kivonat | kulcsvázlat | `rubrika` |
| **átírás** (szakmai változat) | fotók + szószedet | kérdésenkénti válaszok | `atiras` |
| **értékelés** (szakmai változat) | válaszok + kulcs + kivonat | elemstátuszok, idézetek | `ertekeles` |

A tartalék-modell szabályok a meglévők: az értékelésnek nincs tartaléka.

### Kulcs készítés

- Kérdésenként típust, elemeket, szinonimákat javasol, és jelöli a `forras`-t.
- A `megjegyzes` mezőbe írja, ami tankönyvenként eltérhet – a próbában ez
  pontosan a problémás kérdésnél jelzett.
- A beállításokra (sorrend, szigor) **nem** javasol – ezeket a felület
  alapértékkel tölti, és a tanár választ. (Ha a modell javasolna, a tanár
  hajlamos lenne jóváhagyni átnézés nélkül.)

### Átírás – szakmai változat

A próbán a legjobbnak bizonyult változat (C):

- kérdésenkénti strukturált kimenet, a nyomtatott kérdésszöveg nélkül;
- a máshol folytatódó válasz a saját kérdéséhez fűzve;
- táblázat cellánként;
- áthúzott szöveg kihagyva, levágott szöveg `[...]`-val jelölve;
- a tanári jelölések (pontszám, pipa, margójegyzet) figyelmen kívül hagyva;
- **szószedet** a kulcsból, azzal a figyelmeztetéssel, hogy ez nem
  megoldókulcs – a próbán a csali szakszavak egyszer sem kerültek be.

A szószedet mellékhatása, hogy egy-egy szót a szószedet alakjára igazíthat
(„alakulás" → „alakulása"). A pontozásnál ez nem számít, a szó szerinti
idézet-ellenőrzésnél viszont igen – ezért a normalizálás toldaléktűrő
(szótő-egyezés), nem pontos stringegyezés.

### Értékelés – szakmai változat

- Persona: „tapasztalt ${tantargy} szakmai tanár", nem nyelvtanár.
- A `beallitas.szakszo` bekerül a promptba: `pontos` esetén a pontatlan
  szakkifejezés `reszben` (a mintában: „piackutatás" a „beszerzési
  piackutatás" helyett).
- A tananyag-kivonat is bekerül: ebből ítéli meg a `teves` állításokat és a
  kulcson kívüli tételek helyességét.
- A pont mezőt **nem** kéri – csak státuszt, idézetet, pozíciót.

### Próbajavítás (új callable: `probaErtekeles`)

Az űrlapon a tanár begépel egy mintaválaszt; a Function az értékelő lépést
futtatja rajta a **még el nem mentett** kulccsal, és semmit nem ír az
adatbázisba. Így a tanár élesítés előtt látja, hogyan pontoz a kulcs.

---

## Felület

**`feladatok.html`**
- módválasztó a tetején: *Íráskészség* / *Szakmai dolgozat* – a szakmai mód
  elrejti a nyelv/szint/szószám/szempont mezőket;
- tananyag: választás a tárból vagy új feltöltése, a kivonat megtekinthető;
- kérdéskártyák: típus, max pont, elemlista (szerkeszthető, törölhető,
  bővíthető), beállítások; a `forras: 'altalanos'` és `ellenorizendo`
  elemek ⚠ jelöléssel, a kártya tetején a `megjegyzes`;
- ponthatárok; próbajavítás panel.

**`beadas.html`** (diák): fotózási tanács – a teljes lap legyen a képen, a
szélek is. A próbán a lap szélén levágott szöveg jelölés nélkül elveszett.

**`javitas.html`**
- kérdésenként: a diák válasza (átirat), alatta az elemek ✓ / ½ / ✗
  jelöléssel és a kiemelt idézettel;
- a tanár kattintással felülírhat egy elemstátuszt – a pont a kliensen
  újraszámolódik ugyanazzal a függvénnyel (közös modul, mint a `szint` listák,
  drift-teszttel);
- kulcson kívüli tételek: elfogad / elutasít;
- a jegy legördülő a `javasolt_jegy`-gyel előtöltve.

### A diák visszajelzése

**`visszajelzes.html`** (diák): a tanár szöveges visszajelzése alatt
kérdésenként a pont, és elemenként:

- ✓ amit jól írt (a saját szavaival);
- ½ amit részben – mellette a helyes kifejezés;
- ✗ ami hiányzott vagy téves – **mi lett volna a helyes.**

Így a visszajelzés egyben javítókulcs is, a diák ebből tud tanulni.

**Mellékhatás, amivel számolni kell:** ha a tanár jövőre ugyanazt a
dolgozatot íratja, az idei diákok visszajelzéséből a megoldás kiszivároghat.
Ezért a feladat űrlapján van egy kapcsoló – *„A diák lássa a helyes
válaszokat"* –, alapból **bekapcsolva**. Ha ki van kapcsolva, a
`kerdesek[].elemek[].allitas` nem másolódik át, a diák csak a pontokat látja.

**`elemzes.html`**: az első körben a `szempontok` kompatibilitási mezőn át
kérdésenkénti átlagot mutat. Későbbre: **elemenkénti hiányarány** („az
osztály 70%-a kihagyta a megrendelést") – ez szakmai tárgynál a
legértékesebb visszajelzés a tanárnak.

---

## Szabályok és biztonság

- `feladatok/{id}/kulcs/{doc}`: olvasás és írás csak a feladat tanárának. A
  diák közvetlenül soha nem éri el; a helyes válaszokat csak a saját,
  jóváhagyott `ertekeles/tanari` dokumentumában látja, amit a meglévő
  szabály az `elkuldve` státuszhoz köt.
- `tananyagok/{id}`: olvasás a tulajdonosnak és a `megosztva` listának;
  `kivonat` és `megosztva` csak Function-ből.
- Storage `tananyagok/{tanarUid}/`: csak a tulajdonos ír és olvas.
- A `rules.test.mjs` bővül: diák nem olvashat kulcsot; más tanár csak a
  vele megosztott tananyagot olvashatja, és azt sem írhatja.
- A tananyag szövege minden értékelésnél bekerül a promptba. 20 oldalas
  jegyzet ≈ 15 000 token, Flash mellett beadásonként filléres tétel. 60 000
  token fölött a felület figyelmeztet.

---

## Megvalósítás – fázisok

1. **Mag (functions)** – ✅ kész, 2026-09-29
   - `rubrika.mod`, a mód szerinti elágazás a `feldolgozBeadas`-ban;
   - pontozó tiszta függvények (`kerdesPontozas`, `sorrendPontozas`,
     `idezetEllenorzes`, `jegyJavaslat`) + unit-tesztek. **Regressziós eset a
     mintából:** `pozicio` módban a 3. kérdés 1 pont, összesen 8/13 → 3-as;
   - szakmai átírás és értékelés prompt + séma;
   - szabályok + szabálytesztek.
2. **Tananyag és kulcs** – ✅ kész, 2026-09-29: `tananyagFeldolgozas`, `kulcsKeszites`,
   `probaErtekeles` callable-ök; tananyagtár; a `feladatok.html` szakmai
   űrlapja.
3. **Javítás és visszajelzés**: kérdésenkénti javító nézet, felülírás,
   jegyjavaslat; a helyes válaszok a diák visszajelzésében; diák fotózási
   tanács.
4. **Tananyag-megosztás**: `tananyagMegosztas`, a tárban a „megosztva
   velem" lista.
5. **Elemzés**: elemenkénti hiányarány az osztályszintű elemzésben.

A mintadokumentumok **nem kerülnek a repóba** (diáknév, kézírás); a
regressziós teszt csak az anonim átirat szövegét és a tanár pontjait
használja.

### Validálás élesítés előtt

- **Próbajavítás** minden új kulcsnál (a felület ajánlja).
- **Árnyékjavítás** az első osztálynál: a tanár maga javít, az AI a
  háttérben pontoz, a diák csak a tanárét látja. Utána kérdésenkénti
  eltérés-összesítés.

---

## Döntések (2026-09-28)

| kérdés | döntés |
|---|---|
| Lássa-e a diák a helyes választ? | **Igen**, a saját visszajelzésében, elemenként. Feladatonként kikapcsolható (újrafelhasznált dolgozatnál). |
| Levonás téves állításért? | **Nincs.** 0 pont és jelzés. |
| Megosztható-e a tananyagtár? | **Igen**, e-mail-címmel, kollégánként (4. fázis). |
| Milyen formátumú lehet a tananyag? | **PDF és kép.** DOCX/PPTX-et a tanár PDF-be menti. |
| Kell-e kulcssablon? | **Nem.** Minden dolgozat más, a kulcs a feladathoz tartozik. |

### Az 1. fázisban hozott részletdöntések (2026-09-29)

| kérdés | döntés |
|---|---|
| Mi az alapértelmezett beállítás? | `sorrend: nem_szamit`, `szakszo: lenyeg`, `reszpont: 0.5`, `kulcson_kivul: elfogad` – a felület ezt tölti elő, a tanár választ. |
| Mennyit ér egy elfogadott kulcson kívüli tétel? | **1 pontot** (`KULCSON_KIVULI_TETEL_PONT`), a kérdés maximumáig. |
| Mi történik a téves állítással, ha az idézete nincs a válaszban? | `hianyzik` lesz: a diák nem kaphat jelzést olyan tévedésért, amit le sem írt. |
| Hogyan tűri az idézet-ellenőrzés az eltérést? | Kisbetű, írásjel **és ékezet** nélkül hasonlít (az OCR félreolvashat egy ékezetet). Toldaléktűrő: a rövidebb szó legfeljebb 2 betűvel térhet el a közös elejüktől. 4 betű alatt, és így a számoknál is, pontos egyezés kell. A `...` kihagyást jelöl. |
| Relatív sorrendnél a leghosszabb részsorozat számít? | A **legtöbbet érő**: részpontos elemeknél ez eltérhet a leghosszabbtól. |
| Jegyjavaslat: kerekített százalékból? | **Nem**, a pontos arányból: 54,6% nem ér 3-ast 55%-os határnál. |
| Ki hozza létre a tananyag-dokumentumot? | **Csak Function** (a kivonattal együtt, 2. fázis). A kliens csak a címet írhatja át. |
| Ki írhatja a kulcsot? | A feladat tanára kliensről is – a Function minden használat előtt `kulcsEllenorzes()`-sel ellenőrzi. |

### A 2. fázisban hozott részletdöntések (2026-09-29)

| kérdés | döntés |
|---|---|
| Hogyan kerül a kulcs mentésre? | A feladattal **egy batch-ben**, kliensről. Új feladatnál a szabály `getAfter()`-rel nézi a feladat tanárát – különben lenne egy pillanat, amikor a diák már beadhat, de nincs kulcs. |
| Honnan tudja a kliens, hogy a kulcs érvényes? | Ugyanazzal a `kulcsEllenorzes()`-sel validál, mint a szerver: a `public/js/szakmai.js` a `functions/szakmai.js`-ből **generált** példány. Két kézzel írt változat elcsúszna. |
| Mikor kér kulcsvázlatot az űrlap? | **Csak gombnyomásra**, a tananyag kiválasztása után – a feladatlap feltöltése szakmai módban nem indít AI-t, mert a kulcs a tananyagtól függ. |
| Mekkora lehet egy tananyag? | Legfeljebb 5 fájl, együtt **14 MB** (a Gemini inline kérése ~20 MB, base64-gyel). Nagyobb anyagot több tananyagra kell bontani. |
| Ki használhatja a tananyagot a promptban? | Csak a tulajdonos és akivel megosztotta: a Function ezt **kódban** ellenőrzi (`tananyagOlvashato`), mert az admin SDK a szabályokat megkerüli. E nélkül egy idegen tananyag-azonosító a feladatba írva kiszivárogtatná a kivonatot. |
| A tanár által kézzel felvett elem forrása? | `tanar` – így nem kap „általános tudás” jelzést. |
| Változtatható-e a feladat fajtája mentés után? | **Nem**: a beadások javítása ahhoz igazodik. Kiadáskor is a forrás fajtája marad. |
| Honnan jön a ponthatárok alapértéke? | Egyelőre a `ALAP_PONTHATAROK` (40/55/70/85). A tanári profilban tárolt saját alapérték **még nincs** – a profil szabálya most csak a nevet engedi írni. |

---

## A próbák eredménye

**Átírás** (gemini-3.8-flash, 3 prompt × 2 oldal × 2 futás):

| | mostani éles prompt | kérdésenkénti | kérdésenkénti + szószedet |
|---|---|---|---|
| kérdésenkénti bontás | ✗ | ✓ | ✓ |
| tanári jelölések kiszűrése | ✗ | részben | ✓ |
| csali szakszó az átiratban | – | – | 0 eset |

A nyomtatott nagybetűs lap minden változatban gyakorlatilag hibátlan volt
(táblázattal, átcsúszott válasszal együtt); a folyóírásos lapon a
szakszavak mindig helyesek voltak, csak toldalékhibák maradtak. A modell
saját olvashatósági értékelése megbízhatatlan (a folyóírásra egyszer „jó"-t
adott).

**Értékelés** (kulcs tananyag nélkül, csak a kérdésekből; 3 futás):

| kérdés | tanár | AI |
|---|---|---|
| 1. az áruforgalmi folyamat szakaszai | 3/3 | 3 · 3 · 3 |
| 2. beszerzési szempontok | 4/5 | 4 · 4 · 4 |
| 3. a beszerzés szakaszai | 1/5 | 4 · 4 · 4 |

A három futás azonos volt. Az eltérés oka a 3. kérdésnél: a tankönyvi
szakaszok (tananyag kell) és a pozíciós pontozás (tanári beállítás kell).
