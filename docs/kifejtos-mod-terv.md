# WritingReview – kifejtős kérdéseket tartalmazó dolgozat (terv)

Állapot: **mind a 4 fázis kész, 2026-09-29.** A tanár létrehozhat kifejtős
dolgozatot (feladatlap + tananyag → kulcs → mentés), a beadások javítása
lefut, a javító nézetben kérdésenként, elemenként ellenőrizhet és
felülírhat, a diák kérdésenkénti visszajelzést kap, és az osztályszintű
elemzés megmutatja, mely kulcselemeket hagyták ki a legtöbben.

Készült 2026-09-28-án „szakmai dolgozat mód” néven, egy valódi mintacsomag
(3 szkennelt oldal: kereskedelem, marketing, pénztörténet) és két
próbafuttatás alapján – lásd [A próbák eredménye](#a-próbák-eredménye).
2026-09-29-én **átkeretezve és leegyszerűsítve** – lásd
[Irányváltás](#irányváltás-2026-09-29).

Hol van a kód:
- `functions/kifejtos.js` – tiszta függvények, sémák, promptok (pontozás,
  idézet-ellenőrzés, kulcsellenőrzés, jegyjavaslat, kulcskészítés);
- `functions/index.js` – `feldolgozKifejtos()` és az elágazás a
  `feldolgozBeadas()`-ban; a `kulcsKeszites` callable (11. szakasz);
- `public/js/kifejtos.js` – a pontozó modul **generált** böngészős példánya
  (`node scripts/kifejtos-kliens.mjs`, a build is lefuttatja; drift-teszt
  ellenőrzi). Kézzel nem szerkesztendő;
- `public/js/kifejtos-urlap.js` – a feladat-űrlap kulcs része;
- `public/js/kifejtos-javitas.js` – a javító nézet kérdésenkénti része;
- `tests/kifejtos.test.mjs` – benne a minta regressziós esete (8/13 → 3-as).

## Cél

A rendszer eredetileg **fogalmazást** értékelt: egy írásfeladat, szempontos
rubrikával. A dolgozatok nagy része viszont **több rövid, kifejtős
kérdésből** áll – bármilyen tárgyból (történelem, irodalom, szakmai tárgyak):

- a dolgozat **tartalmat kér számon**, nem fogalmazást;
- a helyes válasz **a tanított tananyagtól függ**;
- a kérdések rövid válaszosak: felsorolás, magyarázat, táblázat, folyamat.

Ezt a digitális tesztelők (Redmenta, Formative) nem tudják javítani – azok
feleletválasztós, párosítós, rövid válaszos feladatokra épülnek. Az ilyen
dolgozatot könnyű megírni (öt kérdés egy tananyagból), de eddig csak kézzel
lehetett kijavítani. **Ezt a szegmenst fedi le ez a mód.**

A feladat fajtáját a tanár választja, két gombbal:

| fajta | a kódban | mire jó |
|---|---|---|
| ✍️ **Fogalmazás** | `iras` (a hiányzó `mod` is ez) | egy írásfeladat, szempontos rubrikával – a meglévő útvonal, **változatlan** |
| 📝 **Kifejtős kérdések** | `kifejtos` | több rövid kérdés, megoldókulcs szerint |

**Határ:** ahol a válasz véleményt, érvelést kér és nincs „kulcsgondolat”
(„Mit gondolsz…?”), ott a kulcselemes pontozás gyenge – az ilyen feladat a
Fogalmazás lapra való.

---

## Alapelvek

Ezek a meglévő alapelvek ([adatmodell.md](adatmodell.md)) folytatásai.

1. **Ami mellé kézikönyv kell, az bukó.** A tanár útja: feladatlap fel,
   tananyag fel, egy gomb, mentés. Minden más (a kulcs szerkesztése,
   beállítások) **összecsukva**, jó alapértékekkel. Ellenőrizni a
   **javításkor** lehet, nem a beállításkor.

2. **A megoldókulcs strukturált adat, nem szabadszöveg.** Kérdésenként
   elemek, pontértékkel. Az AI csak azt dönti el, hogy egy elem megvan-e –
   a pontot a kód adja.

3. **A tanár nem ír kulcsot, csak jóváhagy.** A tananyagból az AI
   kulcsvázlatot készít; ahol bizonytalan, jelöli.

4. **A pontozási szabály a tanáré.** Hogy a sorrend számít-e, mennyire
   szigorú a szakszóhasználat – ezt sem a tananyag, sem az AI nem tudja
   kikövetkeztetni. Beállítás, alapértékkel.

5. **Nincs pont idézet nélkül.** Az AI minden elfogadott elemhez szó szerinti
   idézetet ad a diák válaszából, és a **kód ellenőrzi**, hogy az idézet
   tényleg ott van. Ha nincs ott, az elem nem jár, és a tanár jelzést kap.

6. **A kulcs a határidő előtt soha nem kerül diák által olvasható helyre.** A
   `feladatok/{id}` dokumentumot a diák olvashatja, a kulcs viszont maga a
   megoldás – ezért külön, csak tanári alkollekcióba kerül. A diák **a saját
   visszajelzésében** látja, mi lett volna a helyes.

7. **Téves állításért nincs levonás.** 0 pont és jelzés, a többi elem
   pontjából nem von le.

---

## A tanár folyamata

```
1. Fajta: „Kifejtős kérdések”
2. Feladatlap feltöltése          – a dolgozat kérdései
3. Tananyag feltöltése            – nem kötelező; amiből tanultak
4. „Megoldókulcs készítése”       – EGY AI-hívás
   → „✅ Kész: 10 kérdés, 30 pont. ⚠ 2 elemnél az AI bizonytalan volt.”
   → [Megnézem, szerkesztem ▸]    – összecsukva: kérdéskártyák, beállítások
5. Mentés
```

Ha a feladatlapként feltöltött fájlon nincsenek kérdések (pl. a tanár a
tananyagot tette a feladatlap helyére), a kulcskészítő **nem gyárt
kérdéseket**, hanem szól. A próbán pont ez történt: a jegyzetből az AI
csendben 8 kérdést talált ki.

---

## Adatmodell

### `feladatok/{feladatId}` – bővítés

```js
rubrika: {
  mod: 'kifejtos',           // Hiányzó érték = 'iras' (fogalmazás)
  tantargy: 'történelem',    // szabad szöveg – a promptok személye; az AI tölti
  ponthatarok: { 2: 40, 3: 55, 4: 70, 5: 85 },   // % – jegyjavaslathoz
  helyes_valaszok_lathatok: true,                // a diák visszajelzéséhez
  kerdesek: [                // csak a NYILVÁNOS rész: sorszám, max pont
    { sorszam: '1', max_pont: 3 },
    ...
  ],
  feladat_leiras: '...'
  // kifejtős módban NINCS szempontok / min_szo / max_szo / szint
}
```

### `feladatok/{feladatId}/kulcs/aktualis` – csak tanár

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
          forras: 'tananyag',   // 'tananyag' | 'altalanos' | 'tanar' (kézzel felvett)
          ellenorizendo: false },
        ...
      ],
      agak: null,           // csak 'valasztos' típusnál
      beallitas: {
        sorrend: 'relativ',       // 'relativ' | 'pozicio' | 'nem_szamit'
        szakszo: 'lenyeg',        // 'lenyeg' | 'pontos'
        reszpont: 0.5,            // a 'reszben' elem ennyiszeres pontot ér
        kulcson_kivul: 'elfogad'  // nyílt felsorolásnál: 'elfogad' | 'tanar_dont'
      },
      megjegyzes: 'A tananyag ellentmond önmagának…'  // az AI jelzése
    }
  ],
  szoszedet: ['igényfelmérés', ...],   // az átíráshoz, a kód gyűjti
  tananyag: [{ path, nev }],           // a kulcshoz feltöltött fájlok
  tananyagbol: true,                   // volt-e tananyag a kulcs készítésekor
  model, generalva, modositva
}
```

**Miért alkollekció:** a Firestore szabályok nem szűrnek mező szinten. Ha a
kulcs a feladat dokumentumában lenne, minden diák letölthetné a
megoldásokat a határidő előtt. **A tananyag is ide kerül**, nem a feladathoz:
a tanár saját anyaga, a diáknak nincs dolga vele.

**Mentés:** a feladat és a kulcs **egy batch-ben**. Új feladatnál a kulcs
szabálya `getAfter()`-rel nézi a feladat tanárát – különben lenne egy
pillanat, amikor a diák már beadhat, de a javításhoz nincs kulcs.

### `beadasok/{beadasId}` – bővítés

```js
atirat: '1. Beszerzés, árutárolás...\n2. ...',   // összefűzött szöveg – a
                                                // mostani felület így is működik
atirat_valaszok: [{ kerdes: '3', valasz: '...', bizonytalan: ['...'] }],
atirat_tablazatok: [{ kerdes: '1', cellak: [{ sor, oszlop, ertek }] }]
```

### `beadasok/{beadasId}/ertekeles/ai` – kifejtős változat

```js
{
  mod: 'kifejtos',
  kerdesek: [
    {
      sorszam: '3', pont: 1, max: 5,
      elemek: [
        { id: 'e1', statusz: 'megvan', ai_statusz: 'megvan', idezet: 'igényfelmérés',
          pozicio: 1, pont: 1, idezet_ok: true }
      ],
      kulcson_kivul: [{ idezet, tartalmilag_helyes, megjegyzes, idezet_ok, elfogadva }],
      valasztott_ag: null,
      visszajelzes: '...'
    }
  ],
  // KOMPATIBILITÁS: a kérdésekből képzett szempontok, hogy a pontozási
  // táblázat és az osztályszintű elemzés változtatás nélkül működjön
  szempontok: [{ kulcs: 'k3', cim: '3. kérdés', pont: 1, max: 5, megjegyzes: '...' }],
  osszpontszam: 8, max_pontszam: 13, szazalek: 62,
  javasolt_jegy: 3,                  // a ponthatárokból – a kód számolja
  figyelmeztetesek: [{ kerdes, elem_id, tipus: 'idezet_nem_talalhato' }],
  hibak: [...],
  diak_szoveg: '...',
  model, atirat_model, generalva
}
```

Hibakategóriák (módonként külön enum): `hianyzo_elem`, `tartalmi_tevedes`,
`pontatlan_fogalom`, `sorrend`, `hianyos_kifejtes`. Helyesírásért **nincs**
hibabejegyzés és levonás.

### `beadasok/{beadasId}/ertekeles/tanari` – bővítés

A jóváhagyáskor (`visszajelzesJovahagyas`) a Function ide írja a
kérdésenkénti eredményt – ezt látja a diák. A kliens **csak a tanár
döntéseit** küldi (`kerdesek: [{ sorszam, elemek: [{id, statusz}],
kulcson_kivul: [{index, elfogadva}] }]`), pontot nem; a pontot a Function
számolja a kulcsból a `kifejtosTanariEredmeny()`-nyel – ugyanazzal, amivel
a javító nézet élőben mutatja.

```js
{
  jegy, szoveg, tanar_id, jovahagyva_at,
  mod: 'kifejtos',
  helyes_valaszok_lathatok: true,
  kerdesek: [{
    sorszam: '3', szoveg: 'Írd le…', pont: 1, max: 5,
    valasztott: null,               // választós kérdésnél az ág címe
    sorrend: 'pozicio',             // csak ha a sorrend számított
    elemek: [
      { id: 'e1', allitas: 'Igényfelmérés', statusz: 'megvan', idezet: 'igényfelmérés', pont: 1 },
      { id: 'e3', allitas: 'Szállító kiválasztása', statusz: 'megvan', idezet: '…', pont: 0,
        rossz_helyen: true },       // leírta, de a sorrend-szabály szerint nincs a helyén
      { id: 'e4', allitas: 'Megrendelés', statusz: 'hianyzik', idezet: null, pont: 0,
        tanar_modositotta: true }   // a tanár felülírta az AI döntését
    ],
    kulcson_kivul: [{ idezet: 'jó a reklámja', elfogadva: true }]
  }],
  szempontok: [...],                // kompatibilitás (javítási sor, elemzés)
  osszpontszam, max_pontszam, szazalek, javasolt_jegy
}
```

Ha a `helyes_valaszok_lathatok` ki van kapcsolva, az `allitas` **nem kerül
a dokumentumba** – a diák csak a saját szavait és a pontokat látja, a
hiányzó elemeket egyáltalán nem. Az idézet csak akkor megy ki, ha az
ellenőrzésen átment (hallucinált idézet a diákhoz sem jut el).

### Storage

```
tananyagok/{tanarUid}/{fajl}    – PDF/kép, max 10 MB, csak a tanár olvassa
```

---

## Kérdéstípusok és pontozás

Az AI **csak státuszt** ad elemenként: `megvan` / `reszben` / `hianyzik` /
`teves`, és a sorrendtípusnál a `pozicio`-t. **A pontot a kód számolja** –
tiszta függvény, unit-tesztelt.

| típus | példa | pontozás (kód) |
|---|---|---|
| `zart_felsorolas` | a 4P elemei | Σ elem pont (`reszben` × `reszpont`) |
| `nyilt_felsorolas` | „legalább 5 szempont” | talált elemek + elfogadott kulcson kívüli tételek (1–1 pont), `max_pont`-ig |
| `sorrend` | egy folyamat lépései | a `beallitas.sorrend` szerint, lásd lent |
| `tablazat` | kitöltendő táblázat | cellánként egy elem |
| `magyarazat` | „Miért…?” | kulcsgondolatok = elemek |
| `valasztos` | „Fejts ki egyet a három közül” | `agak[]`, csak a választott ág számít |

### Sorrend – három mód

A diák sorrendje a kulcs sorszámaival: **1, 5, 2, 3**.

| mód | szabály | eredmény |
|---|---|---|
| `relativ` (**alapérték**) | a legtöbbet érő, helyes sorrendű részsorozat elemei érnek pontot | 3 (1, 2, 3) |
| `pozicio` | csak a pontosan a helyén lévő elem ér pontot | 1 |
| `nem_szamit` | minden megtalált elem pontot ér | 4 |

A mintában a tanár `pozicio` szerint pontozott (1/5). Az alapérték mégis a
`relativ`: a beállítás összecsukva van, a legtöbb tanár nem nyitja le, és a
relatív a méltányos középút – aki felcserél két lépést, csak azokért veszít.
(Az ilyen kérdés egyébként ritka.)

### Idézet-ellenőrzés

Minden `megvan`/`reszben`/`teves` elemnél a kód megkeresi az `idezet`-et a
diák adott kérdésre adott válaszában. Kisbetű, írásjel és ékezet nélkül
hasonlít, toldaléktűrően. Ha nincs meg: az elem `hianyzik` lesz,
`idezet_ok: false`, és a tanár ⚠ jelzést lát. Olcsó, determinisztikus fék a
hallucináció ellen.

A megfogalmazást **nem** korlátozza: az idézet mindig a diák saját szövege.
Hogy a más szavakkal írt válasz elfogadható-e, azt a `szakszo` beállítás
dönti el (`lenyeg`: igen; `pontos`: a pontatlan szakkifejezés `reszben`).

---

## AI-lépések

| lépés | bemenet | kimenet | modell-kulcs | mikor |
|---|---|---|---|---|
| **kulcskészítés** | feladatlap + tananyag fájljai | kulcsvázlat | `rubrika` | egyszer, a feladat létrehozásakor |
| **átírás** | fotók + szószedet | kérdésenkénti válaszok | `atiras` | beadásonként |
| **értékelés** | válaszok + kulcs | elemstátuszok, idézetek | `ertekeles` | beadásonként |

A tartalék-modell szabályok a meglévők: az értékelésnek nincs tartaléka.

### Kulcskészítés

- **Egy hívás:** a feladatlap és a tananyag fájljai együtt, felcímkézve
  („=== FELADATLAP ===”, „=== TANANYAG ===”). Legfeljebb 5 tananyag-fájl,
  együtt 14 MB (a Gemini inline kérése ~20 MB, base64-gyel).
- **Először megkérdezi, feladatlap-e** (`nem_feladatlap`). Ha nem, a
  Function olvasható hibát ad – nem gyárt kérdéseket.
- Kérdésenként típust, elemeket, szinonimákat javasol, jelöli a `forras`-t
  és a bizonytalan elemeket; a `megjegyzes`-be írja, ami nem egyértelmű
  (pl. ha a tananyag ellentmond önmagának).
- A beállításokra (sorrend, szigor) **nem** javasol – ha javasolna, a tanár
  hajlamos lenne átnézés nélkül jóváhagyni.

### Átírás – kifejtős változat

A próbán a legjobbnak bizonyult változat (C): kérdésenkénti strukturált
kimenet; a máshol folytatódó válasz a saját kérdéséhez fűzve; táblázat
cellánként; áthúzott szöveg kihagyva, levágott szöveg `[...]`-val; a tanári
jelölések figyelmen kívül; **szószedet** a kulcsból, azzal a
figyelmeztetéssel, hogy ez nem megoldókulcs – a próbán a csali szakszavak
egyszer sem kerültek be.

### Értékelés – kifejtős változat

- Persona: „tapasztalt tanár, a tantárgy: X”.
- A `beallitas.szakszo` bekerül a promptba.
- **A tananyag nem kerül bele.** A kulcs abból készült, és a tanár
  jóváhagyta; a kulcson kívüli válaszokat az AI a saját tudása alapján ítéli
  meg, és azokat is a tanár hagyja jóvá. Így minden javítás olcsóbb és
  gyorsabb.
- A pont mezőt **nem** kéri – csak státuszt, idézetet, pozíciót.

---

## Felület

**`feladatok.html`**
- a fajta két nagy gombbal (*Fogalmazás* / *Kifejtős kérdések*); mentés után
  nem változtatható;
- kifejtős módban: feladatlap, alatta a tananyag feltöltése, egy gomb, egy
  összefoglaló sor;
- „Megnézem, szerkesztem” (összecsukva): kérdéskártyák oszlopfejléccel
  (*Amit le kell írnia* | *Így is elfogadható* | *Pont*), a hosszú elemnek
  növő mezővel; ⚠ a bizonytalan elemeken, „nem a tananyagból” jelzés (csak
  ha volt tananyag); kérdésenkénti beállítások; tantárgy, ponthatárok, „lássa
  a diák a helyes válaszokat”.

**`beadas.html`** (diák): fotózási tanács – a teljes lap legyen a képen, a
szélek is; a hátoldalt is le kell fotózni, ha oda folytatódik a válasz.

**`javitas.html`** – **itt történik az ellenőrzés**:
- kérdésenként a diák válasza, alatta a kulcs elemei ✓ / ½ / ✕ / téves
  gombokkal (az AI döntése előre bejelölve) és a diák szavaival (idézet);
- ⚠ ha az AI idézete nincs a válaszban; „AI: ✓” ha a tanár felülírta;
  „↕ nem a helyén” sorrendes kérdésnél, a szabály szövegével;
- a pont és a jegyjavaslat élőben számolódik (`kifejtosTanariEredmeny`);
  a jegy a javaslattal töltődik elő, amíg a tanár maga nem választ;
- kulcson kívüli tételek: elfogad / nem.

**`visszajelzes.html`** (diák): kérdésenként a pont, elemenként ✓ amit jól
írt, ½ amit részben, ✕ ami hiányzott vagy téves – **„Helyesen: …”** mellette,
és „Te: …” a saját szavaival; ↕ ha jó, de nem a helyén.

**`elemzes.html`** – kifejtős dolgozatnál:
- **Kérdésenként**: átlag, a legrosszabbul sikerült kérdéssel kezdve;
  lenyitva elemenként, hány diáknál hiányzott (és hányan írták tévesen,
  részben, rossz helyen);
- **Amit a legtöbben kihagytak**: a kulcselemek a leggyakrabban hiányzóval
  kezdve, legfeljebb 10 – de csak a diákok legalább negyedénél hiányzó
  (ennél ritkább egyéni hiba, nem az osztályé). A téves is hiánynak számít;
- **Közös hiányok és tévedések**, ismétlő gyakorlatok, generáló prompt – ezt
  az AI adja, egy kifejtős változatú prompttal (nem nyelvtani típushibák,
  hanem hiányzó tartalmak).

A számokat a **kód** számolja (`kifejtosAggregalas`). Diákonként az számít,
amit a diák kapott: ha a tanár már jóváhagyta, az ő (felülírt) döntései,
különben az AI-é. Az eredmény a `feladatok/{id}/elemzes/osszegzes`
dokumentumba kerül (`mod: 'kifejtos'`, `kerdesek`, `kihagyott`).

---

## Szabályok és biztonság

- `feladatok/{id}/kulcs/{doc}`: olvasás és írás csak a feladat tanárának; a
  diák soha. Új kulcs csak létező (vagy a batch-ben létrejövő) saját
  feladathoz, nem üres `kerdesek` listával.
- Storage `tananyagok/{tanarUid}/`: csak a tulajdonos ír és olvas.
- A `kulcsKeszites` csak a hívó saját feltöltéseit (`feladatlapok/{uid}/`,
  `tananyagok/{uid}/`) fogadja el.

---

## Megvalósítás – fázisok

1. **Mag** – ✅ 2026-09-29: pontozó tiszta függvények + unit-tesztek
   (regressziós eset: `pozicio` módban 8/13 → 3-as); kifejtős átírás és
   értékelés; szabályok.
2. **Kulcs és űrlap** – ✅ 2026-09-29: `kulcsKeszites`, az egyszerűsített
   `feladatok.html` űrlap, a generált böngészős pontozó modul.
3. **Javítás és visszajelzés** – ✅ 2026-09-29: kérdésenkénti javító nézet,
   felülírás, élő pont és jegyjavaslat; a helyes válaszok a diák
   visszajelzésében; fotózási tanács.
4. **Elemzés** – ✅ 2026-09-29: kérdésenkénti átlag, elemenkénti
   hiányarány, „amit a legtöbben kihagytak” lista, kifejtős elemzés-prompt.

A mintadokumentumok **nem kerülnek a repóba** (`tests/dolgozatok/` a
`.gitignore`-ban); a regressziós teszt csak az anonim átirat szövegét és a
tanár pontjait használja.

### Validálás élesítés előtt

- Teljes kör egy valódi dolgozattal (`tests/dolgozatok/`: biztosítás
  feladatlap + tanári segédlet két mintadiákkal).
- **Árnyékjavítás** az első osztálynál: a tanár maga javít, az AI a
  háttérben pontoz, a diák csak a tanárét látja. Utána kérdésenkénti
  eltérés-összesítés.

---

## Döntések

### Eredeti döntések (2026-09-28)

| kérdés | döntés |
|---|---|
| Lássa-e a diák a helyes választ? | **Igen**, a saját visszajelzésében, elemenként. Feladatonként kikapcsolható (újrafelhasznált dolgozatnál). |
| Levonás téves állításért? | **Nincs.** 0 pont és jelzés. |
| Milyen formátumú lehet a tananyag? | **PDF és kép.** DOCX/PPTX-et a tanár PDF-be menti. |
| Kell-e kulcssablon? | **Nem.** Minden dolgozat más, a kulcs a feladathoz tartozik. |

### Részletdöntések (2026-09-29)

| kérdés | döntés |
|---|---|
| Mennyit ér egy elfogadott kulcson kívüli tétel? | **1 pontot** (`KULCSON_KIVULI_TETEL_PONT`), a kérdés maximumáig. |
| Téves állítás, ha az idézete nincs a válaszban? | `hianyzik` lesz: a diák nem kaphat jelzést olyan tévedésért, amit le sem írt. |
| Hogyan tűri az idézet-ellenőrzés az eltérést? | Kisbetű, írásjel **és ékezet** nélkül hasonlít. Toldaléktűrő: a rövidebb szó legfeljebb 2 betűvel térhet el a közös elejüktől; 4 betű alatt (és a számoknál) pontos egyezés kell. A `...` kihagyást jelöl. |
| Relatív sorrendnél a leghosszabb részsorozat számít? | A **legtöbbet érő**: részpontos elemeknél ez eltérhet a leghosszabbtól. |
| Jegyjavaslat: kerekített százalékból? | **Nem**, a pontos arányból: 54,6% nem ér 3-ast 55%-os határnál. |
| Ki írhatja a kulcsot? | A feladat tanára kliensről is – ugyanazzal a `kulcsEllenorzes()`-sel validál, mint a szerver (generált modul), és a Function minden használat előtt újra ellenőrzi. |
| Változtatható-e a feladat fajtája mentés után? | **Nem**: a beadások javítása ahhoz igazodik. Kiadáskor is a forrás fajtája marad. |
| Honnan jön a ponthatárok alapértéke? | `ALAP_PONTHATAROK` (40/55/70/85), feladatonként átírható. |

### Irányváltás (2026-09-29)

A 2. fázis első változata után derült ki: a beállítás túl bonyolult volt
(tananyagtár, külön tananyag-feldolgozás, kulcskészítés, próbajavítás – három
AI-hívás és kérdésenként négy beállítás), és a „szakmai” név szűkebb, mint
amire a rendszer jó.

| kérdés | döntés |
|---|---|
| Név | **Kifejtős kérdések** (`kifejtos`) – bármilyen tárgyra. A másik fajta a **Fogalmazás**. |
| Ki választja a fajtát? | **A tanár**, két gombbal. Nem AI-döntés. |
| Tananyagtár, megosztás? | **Nincs.** A tananyag a feladathoz (a kulcshoz) tartozik. |
| Hány AI-hívás a létrehozáskor? | **Egy**: a feladatlap és a tananyag együtt megy a kulcskészítőhöz. |
| Kerül-e a tananyag a javításhoz? | **Nem.** A kulcs abból készült, és a tanár jóváhagyta. |
| Próbajavítás? | **Nincs.** Az ellenőrzés helye a javító nézet (3. fázis), ahol a tanár minden eredményt lát és felülírhat. |
| A sorrend alapértéke? | **`relativ`** – a beállítások összecsukva vannak, az alapérték dönt. |
| Ha a feladatlap helyére tananyag kerül? | A kulcskészítő **szól**, nem gyárt kérdéseket. |

---

## A próbák eredménye

**Átírás** (gemini-3.8-flash, 3 prompt × 2 oldal × 2 futás):

| | eredeti éles prompt | kérdésenkénti | kérdésenkénti + szószedet |
|---|---|---|---|
| kérdésenkénti bontás | ✗ | ✓ | ✓ |
| tanári jelölések kiszűrése | ✗ | részben | ✓ |
| csali szakszó az átiratban | – | – | 0 eset |

A nyomtatott nagybetűs lap minden változatban gyakorlatilag hibátlan volt
(táblázattal, átcsúszott válasszal együtt); a folyóírásos lapon a
szakszavak mindig helyesek voltak, csak toldalékhibák maradtak. A modell
saját olvashatósági értékelése megbízhatatlan (a folyóírásra egyszer „jó”-t
adott).

**Értékelés** (kulcs tananyag nélkül, csak a kérdésekből; 3 futás):

| kérdés | tanár | AI |
|---|---|---|
| 1. az áruforgalmi folyamat szakaszai | 3/3 | 3 · 3 · 3 |
| 2. beszerzési szempontok | 4/5 | 4 · 4 · 4 |
| 3. a beszerzés szakaszai | 1/5 | 4 · 4 · 4 |

A három futás azonos volt. Az eltérés oka a 3. kérdésnél: a tankönyvi
szakaszok (tananyag kell) és a pozíciós pontozás (tanári beállítás kell).

**Kulcskészítés, első élő próba** (2026-09-29): a tanár a tananyagot a
feladatlap helyére töltötte fel; az AI a jegyzetből 8 kérdést talált ki, és
„tananyag nélkül készült” jelzést adott. Innen jött a `nem_feladatlap`
ellenőrzés és a két feltöltés egyértelmű szétválasztása a felületen.
