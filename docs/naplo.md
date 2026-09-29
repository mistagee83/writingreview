# WritingReview – állapot és következő lépés

*Utolsó frissítés: 2026-09-27*

Ez a fájl azért van, hogy egy hét kihagyás után (vagy egy új munkamenetben)
öt perc alatt vissza lehessen találni a fonalra. Az adatmodell részletei a
[adatmodell.md](adatmodell.md)-ben vannak, itt csak az állapot és a nyitott
kérdések.

---

## Hol állunk

**Az app él és működik.** Végigment egy teljes kör: belépés → osztály →
feladat feladatlappal → diák csatlakozás és beadás → AI javítás → tanári
jóváhagyás → osztályszintű elemzés.

| | |
|---|---|
| Élő cím | https://writingreview-41e59.web.app |
| Firebase projekt | `writingreview-41e59` (Firestore: `eur3`, functions: `europe-west1`) |
| GitHub | https://github.com/mistagee83/writingreview (privát) |
| Kód | ~10800 sor, 12 oldal, 12 Cloud Function, 296 teszt |
| Futtatókörnyezet | Node 24 (a 20-at 2026-10-30-án kikapcsolják) |
| Modell | `gemini-3.8-flash` mind a négy AI-lépésben |

### Elkészült modulok

1. **Belépés** – email/jelszó + Google, szerep szerinti átirányítás
2. **Osztályok** – létrehozás egyedi kóddal, névsor, diák eltávolítása
3. **Feladatok** – feladatlap → AI rubrika-javaslat → tanári jóváhagyás,
   szerkesztés, kiadás másik osztálynak, rubrika-sablonok
4. **Beadás** – többoldalas fotó, kliensoldali átméretezés, realtime státusz
5. **Javítási sor** – átirat, AI értékelés, tanári szerkesztés és elküldés
6. **Osztályszintű elemzés** – típushibák, javasolt gyakorlatok, feladatgeneráló prompt
7. **Szerepkezelés** (admin) – tanárok kinevezése webfelületről
8. **Beépített bemutató** – első belépéskor menü, utána a topbar
   villanykörtéjével. Négy szakasz (osztály, feladat, javítás, elemzés),
   22 lépés, reflektorfénnyel a valódi felületen. A javítás és az elemzés
   példaadatot mutat, mert új tanárnál még nincs beadás.

   **Mikor nyílik fel magától:** csak a `tanar.html`-en, csak tanári
   szerepnél. Minden új regisztráció diák, tehát a kollégának a bemutató
   először NEM jelenik meg – akkor jön elő, amikor az admin tanárrá tette
   és ő újratölti a lapot (a guard.js ilyenkor irányítja a tanári
   kezdőlapra). A szabály a `tura-logika.js`-ben van, tesztelve.

9. **Telepíthető alkalmazás (PWA)** – a belépő lapon telepítő sáv, a
   telefon főképernyőjéről böngészősáv nélkül indul. Manifest + service
   worker; az ikonokat `scripts/ikonok.mjs` generálja kódból.

   **Amit a service worker NEM csinál:** offline beadás és
   szinkronizálás. Az app hálózat nélkül nem tud működni (Auth,
   Firestore, Storage, Gemini), ezért csak a hashelt CSS/JS jön
   gyorsítótárból, a HTML mindig hálózatról – így egy új telepítés
   azonnal kimegy. Offline egy magyarázó lap jön a néma hiba helyett.

   **Visszavonás, ha kell:** a `/sw.js` `no-cache` fejléccel megy ki, és
   a böngésző minden oldalbetöltésnél újraellenőrzi. Egy hibás változat
   visszahívásához tegyél ki egy olyan `sw.js`-t, ami csak
   `self.registration.unregister()`-t hív.

10. **Fejléc-navigáció** – vissza gomb és a márkanév mint főoldal-link,
    minden lapon (`fejlec.js`). Telefonon az oldalsáv 700px alatt rejtve
    van, telepített appban pedig a böngésző vissza gombja sincs – ez
    éles hibaként derült ki, a telefonon nem volt semmi navigáció.

    **Nem `history.back()`**, hanem logikai szülő (`SZULO` térkép): a
    history mélylinkről vagy telepített appból indulva nem oda visz,
    ahova a tanár számít, legrosszabb esetben ki az appból. A hierarchia
    tesztelt: minden kapuzott lap vagy kezdőlap, vagy van szülője.

    Nyitott modálnál a gomb először a modált zárja (a lap saját bezáró
    gombját nyomja meg, hogy a takarítás is lefusson).

### Folyamatban: kifejtős kérdéseket tartalmazó dolgozat

Terv és állapot: [kifejtos-mod-terv.md](kifejtos-mod-terv.md). A feladat
fajtája: **Fogalmazás** (a régi útvonal, `iras`) vagy **Kifejtős kérdések**
(`kifejtos` – több rövid kérdés, megoldókulcs szerint, bármilyen tárgyból).
Az 1–3. fázis kész: pontozó mag; feladatlap + tananyag → egy gombbal
kulcs → mentés; kérdésenkénti javító nézet elemenkénti felülírással; a
diák kérdésenként látja, mit írt jól és mi lett volna a helyes. Hátra van
az elemenkénti hiányarány az osztályszintű elemzésben (4. fázis). A fogalmazás-útvonal érintetlen: a `rubrika.mod`
hiánya = `iras`.

A 2. fázis első változata (tananyagtár, próbajavítás, „szakmai” név) túl
bonyolult lett – 2026-09-29-én egyszerűsítve, a terv „Irányváltás” része
szerint. **Ami mellé kézikönyv kell, az bukó.**

**A `public/js/kifejtos.js` generált fájl** – a `functions/kifejtos.js`-ből
készül (`node scripts/kifejtos-kliens.mjs`). Ha a functions oldalon a
pontozáson változtatsz, generáld újra, különben a drift-teszt elbukik.

---

## Következő lépés: Gemini Enterprise Agent Platform (a régi „Vertex AI")

**Ez a holnapi téma.**

### Miről szól

Ugyanaz a Gemini modell kétféle úton érhető el:

- **most**: Gemini Developer API – `generativelanguage.googleapis.com`,
  API-kulccsal. Egyszerű, de nem szabható meg a feldolgozás régiója.
- **cél**: a Google Cloud vállalati útja – ugyanazok a modellek a saját GCP
  projektben, megadott régióban, szolgáltatásfiókos hitelesítéssel.

**Névváltás:** ezt hívták Vertex AI-nak. A régi dokumentációs URL ma már
átirányít, és a lap fejlécében **Gemini Enterprise Agent Platform** áll. A
„Vertex AI" név nem tűnt el mindenhonnan (release notes), szóval az
átnevezés félúton van – a neten mindkét név előfordul.

### Miért érdemes

Egyetlen ok: **kiskorúak kézírásmintái mennek ki egy AI-hoz.** A vállalati
úton megszabható, hogy az adat EU-n belül maradjon (az `eu` multi-régiós
végpont az EU tagállamaira szorítja a tárolást; egy konkrét régió, pl.
`europe-west4`, csak ott tárol és dolgoz fel).

Mellékhaszon: **eltűnik az API-kulcs.** Cloud Functionsben a hitelesítés a
function szolgáltatásfiókján automatikus – nincs mit rotálni vagy
kiszivárogtatni.

### ⚠️ Amit ELŐBB ellenőrizni kell

**Elérhető-e a `gemini-3.8-flash` EU-s régióból?** Az új modellek gyakran
előbb indulnak USA-ban. Ha nem elérhető, a döntés: régebbi modell EU-ban,
vagy marad a mostani út. **Ezzel kell kezdeni, mielőtt bármit átírunk.**

### Mit érint a kódban

Egyetlen függvényt – pont ezért van elkülönítve:

- `functions/index.js:152` → **`geminiKeres(modell, parts, schema)`**
- a 153. sorban van a `generativelanguage.googleapis.com` URL és az
  `?key=` paraméter

Két lehetséges út:

1. **Hivatalos SDK** (`@google/genai`): egy zászlóval vált a két út között,
   és Cloud Functionsben magától hitelesít.
   ```js
   new GoogleGenAI({ vertexai: true, project: 'writingreview-41e59', location: 'europe-west4' })
   ```
2. **Közvetlen REST**: átírni az URL-t `{location}-aiplatform.googleapis.com`-ra,
   és OAuth tokent kérni ADC-ből az `?key=` helyett.

Az SDK az egyszerűbb. A `geminiHivas` (újrapróbálkozás, tartalék modell) és
minden fölötte lévő logika **változatlan marad** – csak a legalsó kérés
cserélődik.

### Ellenőrzés a váltás után

A 221 teszt közül a Gemini-részt a `tests/gemini.test.mjs` fedi, kicserélt
`fetch`-csel. **Ha SDK-ra váltunk, ezek a tesztek átírandók**, mert nem
`fetch`-et stubolnak majd. Ez a váltás rejtett munkája.

---

## Maradék lista (egyik sem sürgős)

| # | mi | állapot |
|---|---|---|
| 1 | **Agent Platform / EU** | ↑ holnapi téma |
| 2 | **`storage.rules` tesztek** | átnézve, de **egy teszt sincs rá** – ez a legvalószínűbb rés |
| 3 | **`firebase-functions` SDK** | `^5.0.0`, elavult; a frissítés törő változásokkal jár, de most van hozzá 221 teszt |
| 4 | **Haladásjelző** | külön modul: több feladat időben, javul-e az osztály. Egyeztetve későbbre. |
| 5 | **Per-tanár Gemini-használat** | ha többen használják, hasznos lesz látni, ki mennyit fogyaszt |
| 6 | **CORS lista** | hardcode-olt a `functions/index.js`-ben, új domainhez kézi felvétel |
| 7 | **Osztálynév elavulása** | átnevezéskor a diák `osztalyaim` tükrében marad a régi név (dokumentálva) |
| 8 | **Új regisztráció láthatósága** | **nincs semmilyen értesítés** – se e-mail, se push. Az admin lista név szerint rendez, és a regisztráció dátumát meg sem jeleníti, pedig a backend visszaadja (`letrehozva`, `utolso_belepes`). Nem a regisztrációról érdemes értesíteni (a diákok is regisztrálnak), hanem a **tanári jog kéréséről**: ilyen jelzés ma nincs, a kollégának szólnia kell. |

---

## Amit NEM teszteltünk

- **Igazi osztály.** Eddig 1 beadás futott végig. A kézírás-felolvasás
  pontossága, a pontszámok észszerűsége és a típushiba-elemzés
  használhatósága csak 20-25 beadásnál fog kiderülni. **Ez a valódi
  következő lépés, nem funkció.**
- **Storage szabályok** élesben (lásd maradék lista 2.)
- **Más nyelv, mint az angol.** A nyelvkezelés megvan és tesztelt, de német
  dolgozat még nem futott át rajta. **Magyar dolgozat sem** – a
  szintkezelés (évfolyam CEFR helyett) tesztelt, de élesben nem járt.

---

## Gyakorlati tudnivalók

### Napi rutin

```bash
git add -A && git commit -m "mit változtattam" && git push
```

### Telepítés

```bash
firebase deploy
```

A `predeploy` hook magától lefuttatja a buildet (`scripts/build.mjs`), ami a
`public/`-ból `dist/`-et generál tartalom-hasholt CSS/JS fájlnevekkel.
**A `dist/`-et soha ne szerkeszd kézzel**, és ne is verziózd.

### Tesztek

```bash
cd tests && npm test
```

Firestore emulátort indít (Java kell hozzá). Ha „port taken" hibát ad, egy
korábbi emulátor még fut – a 8080-as porton lévő java folyamatot le kell
állítani.

### Szerep beállítása (bootstrap)

```bash
cd functions && node scripts/szerep.mjs <email> tanar admin
```

Az admin felület (`admin.html`) ugyanezt tudja weben – ez a szkript az
**első** admin kinevezéséhez kell, vagy ha kizárnád magad.

---

## Csapdák, amikbe már belefutottunk

Ezek mind valódi, órákba kerülő hibák voltak – érdemes nem újra felfedezni
őket.

**A Firestore `list` szabálynál a query-nek bizonyítania kell a
jogosultságot.** Nem elég, ha a találatok véletlenül megfelelnek. Ha a
szabály `resource.data.tanar_id == request.auth.uid`-ot vizsgál, a query-nek
**szűrnie kell** `tanar_id`-re, különben megtagadja. Ebbe az `elemzes.html`
futott bele.

**A `setCustomUserClaims` a TELJES claim-halmazt felülírja.** Minden írás
előtt össze kell fűzni a meglévőkkel (`claimOsszefuzes`), különben egy
szerep-állítás letörli az admin jelzőt. Van rá teszt.

**A szerepkör a token-claimből jön, nem a Firestore-mezőből.** A
`felhasznalok.szerep` csak tükör. Ha a kettő eltér, a `guard.js` kényszerítve
frissíti a tokent – ezért nem kell a kollégáknak ki- és belépnie
szerepváltás után, elég újratölteniük az oldalt.

**A OneDrive fogja a frissen írt fájlokat.** A `dist/` törlése ezért
véletlenszerűen `EPERM`-mel elhasalt; a `rmSync` `maxRetries` opciója
megoldja (már be van kapcsolva).

**Eventarc első telepítés.** Az első Firestore-trigger létrehozása elhasalhat,
mert a Pub/Sub és Eventarc szolgáltatás-identitások épp akkor jönnek létre, és
a trigger megelőzi az IAM-jogok terjedését. **Változtatás nélkül, másodszorra
kimegy.**

**A topbar 375px-en HARMADSZOR is túlfolyt.** A vissza gomb 38px-et
kért, és a Kilépés gombot kilökte a képből. Minden topbar-bővítésnél
ugyanez a történet: **mérj, ne nézz rá.** A helyet a Kilépés feliratának
elrejtése adta (ikon marad, az elérhető név megmarad). Most 14px a
tartalék, mérve, a villanykörtével együtt.

**A komment-alapú hamis pozitív harmadszor.** Egy forrás-ellenőrző teszt
a KOMMENTBEN lévő `history.back()` említésre hasalt el, egy másik pedig
egy kikommentezett sort érvényesnek fogadott el. Minden ilyen tesztnek
komment nélküli kódon kell futnia (`kodCsak`).

**Egy negatív kontroll a SAJÁT tesztemben talált hibát:** a „lánc rövid"
teszt `while` ciklusa körnél végtelenségig futott, és a tesztfájl
lefagyott megállás helyett. Minden bejárás legyen korlátos.

**Egy követelmény több helyen él, és a szöveg elmehet a kód mellett.**
A feladatlap-feltöltés „nem kötelező" volt a bemutatóban, miközben a
mentés kikényszerítette – és a kód három helyen feltételezte a fájlt
(a mentés ellenőrzése, a `getDownloadURL(storageRef(…, null))`
szerkesztésnél, és a Firestore-ba írt `undefined`). Ezért van egy teszt,
ami a SZÖVEGET köti a kódhoz (`tests/feladatlap-opcionalis.test.mjs`).
Ha a felületen új ígéret jelenik meg („nem kötelező", „automatikus"),
tegyél mellé ilyen tesztet.

**A PWA-ból minden CSENDBEN romlik el.** Ha egy ikon átnevezésre
kerül, a telepítés egyszerűen nem ajánlódik fel – hibaüzenet nincs. Ha a
`sw.js` a hashelt könyvtárba kerülne, a böngésző nem találná, és soha nem
frissülne. Ezért van rá 16 teszt (`tests/pwa.test.mjs`), ami a manifest
ikonjainak **tényleges PNG-méretét** is ellenőrzi, nem csak a feliratot.

**A build nem ismerte a dinamikus importot.** A `helyiImportok()` csak a
`from "./x.js"` alakot kereste, az `import("./x.js")`-t nem. Így nem tudta,
hogy a `guard.js` a `tura.js`-től függ, előbb hashelte, és a hivatkozás
hash nélkül maradt – a `dist`-ben 404. A build saját ellenőrzése fogta meg
(„Átíratlan hivatkozások maradtak"), nem éles hiba lett belőle. **Ez a
lépés a deploy előtt magától lefut, ne kapcsold ki.**

**A topbar 375px-en megint túlfolyt.** A bemutató villanykörtéje 43px-et
kért, és a Kilépés gomb 32px-et kicsúszott a képből (a topbar korábban
8px tartalékkal fért el). Mérve javítva: szűkebb szegély, kisebb rések,
kisebb márkanév 500px alatt – most 14px a tartalék. **Bármi új a
topbaron: 375px-en meg kell mérni, nem ránézni.**

**A strukturált kimenet KÖTELEZŐ mezője kényszer.** A rubrika-séma
kötelező `szint` mezője CEFR enum-mal arra kényszerítette a modellt, hogy
magyar (anyanyelvi) feladatlapra is találjon ki egy CEFR-szintet – az
értékelés pedig utána ahhoz mért, sőt külön utasítást kapott, hogy „ne
anyanyelvi szinthez" mérjen. Ez nem hibázott, csak rosszabbul pontozott.
Tanulság: ha egy mező **értelmesen hiányozhat**, ne legyen `required`, és
a promptban se szerepeljen „nincs megadva" – a modell kitölti magának.
Részletek: [adatmodell.md](adatmodell.md) → Szint.

**A Gemini „high demand" hibája átmeneti.** A rendszer magától újrapróbál
háromszor, és átírásnál/rubrikánál tartalék modellre vált. Az **értékelésnek
szándékosan nincs tartaléka**: ha az egyik diákot 3.8 Flash, a másikat 3.7
pontozná, sérülne az összehasonlíthatóság.

---

## Nem elfelejtendő beállítások

- A **Gemini API kulcs fizetős szintű** legyen. Az ingyenes szinten a Google
  felhasználhatja a beküldött tartalmat a termékei fejlesztéséhez – kiskorúak
  dolgozataival ez nem járható.
- A Firebase projekt **Blaze csomagon** van (a 2. generációs Cloud Functions
  ezt igényli).
