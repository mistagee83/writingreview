# Következő munkamenet – átadó leirat

> ## FRISS ÁLLAPOT (2026-10-10 este) – ezt olvasd el ELŐSZÖR
>
> **Kész és kiadva (prod, `v1.12.0`-ig):** fejlődéskövetés (Profi), osztályelemzés az Alapból, színválasztás (lenyíló a felső sávban, teljes háttér + tapéta), új nyitóoldal
> (`index.html`; a belépés `belepes.html`), angol szövegek javítva. Részletek: `docs/folytatas.md` 5/f, 5/g, 5/h, 5/i.
>
> **Kész, de MÉG NINCS kiadva (helyi commitok a `v1.12.0` után):** a hero „akár 20 dolgozat” sora, a nyitóoldal magyar szövegeinek újraírása, a belépés/regisztráció magyar
> szövegei (ChatGPT átnézte, én javítottam), „rubrika” → „értékelési szempontok” a magyar felületen, a magyar szövegezési útmutató. **A tulajdonos nem akar kis dolgokat pusholni: csak egyben, kérésre**
> (`git tag v1.13.0 && git push origin main v1.13.0`; a jóváhagyás a GitHubon az övé). A pilotra semmi nem megy.
>
> **Soron következő:** a magyar szövegek átnézése az útmutató sorrendjében (`docs/magyar-szovegek.md`): tanári főoldal, osztályok, feladatok, javítási sor → diák oldalak (egyszerű, barátságos hang) → bemutató,
> kulcsszerkesztő, hibaüzenetek. Munkamód: én írom át a szótárat (kulcsok és `{helyőrzők}` változatlanok), a tulajdonos ChatGPT-vel második olvasatot kér (csak megjelölés, nem átírás), végül egy tanár kolléga
> hangosan olvassa. Ügyelj a névelőre és a ragozásra (egy szócsere után a névelő is változhat), és minden szócserénél futtasd a teszteket.
>
> **Nyitott, nem műszaki (lásd a 4. pontot is):** jogász (18 kérdés, a 18. a fejlődéskövetésről még nem jutott el hozzá; `docs/jogi/` piszkozatok, közzététel előtt jogi átnézés kell), a Google korhatár-kikötése
> (blokkoló kiskorú diákoknál), a számlázz.hu bekötése, az „elfogadom” jelölőnégyzet, Stripe éles módra váltása. Az emulátoros teszteket (rules, claim, functions, storage, *adatbazis*) a tulajdonos futtatja.
>
> **Üzenet és hang:** `docs/folytatas.md` 5/h és a `landing-uzenet-pozicionalas` memória (a jó tanár még jobb lehet; nem időmegtakarítás; angolul „grading”, „Grading queue”).


*Ezt olvasd el először egy új beszélgetés elején (a `CLAUDE.md` és a `docs/folytatas.md` mellett). Itt van, hol tart a projekt, mi a következő három feladat részletesen, és hogyan dolgozik a tulajdonos.*

## 1. Hogyan dolgozz a tulajdonossal (fontos)

- **Magyarul, rövid, egyszerű mondatokkal.** A tulajdonos nem fejlesztő; sok technikai szöveg túlterheli. Ha lépéseket kér, **egyetlen lépést adj egyszerre**, pontos paranccsal vagy kattintási úttal, és várd meg a választ. Ne sorolj fel sok dolgot egyszerre.
- **Commitot, pusht, címkét és deployt csak kérésre.** A prod kiadása címkével megy (`git tag vX.Y.Z && git push origin vX.Y.Z`), amit a tulajdonos a GitHubon (Actions → Review deployments) hagy jóvá. Én (a MI) a prod-beavatkozásokat (IAM, titkok, éles kulcsok) nem végzem, azok az ő saját termináljából mennek.
- **Titkot (API-kulcsot) soha ne kérj a chatbe.** A titkokat a tulajdonos állítja a terminálból: `Get-Clipboard | firebase functions:secrets:set NEV --data-file - --project prod`.
- **PowerShell:** az `AI projects` mappa nevében szóköz van, mindig idézőjel kell: `cd "D:\OneDrive\AI projects\34_WR"`.
- **Emulátoros tesztek** (a MI környezetében nem indul el, a tulajdonos futtatja): `cd "D:\OneDrive\AI projects\34_WR\tests"`, majd `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jre-21.0.11.10-hotspot"`, `$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"`, `npm test` (most 681 teszt, mind zöld).
- A gyors tesztek emulátor nélkül: `for f in tests/*.test.mjs` (a `rules`, `claim`, `functions.test`, `storage` és az `*adatbazis*` kivételével), `node scripts/build.mjs`.
- Nagyobb szerkesztéseknél a Bash heredoc idézőjel-gondot okozhat: a szkriptet a Write eszközzel fájlba írd, és úgy futtasd.

## 2. Hol tart a projekt

- **Két telepítés, egy kódbázis:** pilot (`writingreview-41e59`, a tulajdonos és kollégák használják, kvóta és fizetés **ki van kapcsolva**) és prod (`writerev2`, https://writing-review.web.app, kereskedelmi).
- **A prodon élő:** tanári önregisztráció, AI-kvóta (ingyenes 20 egység egyszeri, alap 150/hó, **profi 500/hó**, `korlatlan` csak az admin adja), beírt dolgozat mód és jelzések, **Stripe-előfizetés TESZTMÓDBAN** (Checkout, Customer Portal, webhook; csomagváltás a portálon; kiadva a `v1.7.2`-ig).
- **Még nincs kiadva:** a `eeb006f` commit (a két csomag-gomb egyforma stílusú); a `main` egy committal előzi meg az `origin/main`-t. A `v1.7.2` a megerősítő lépést tartalmazza (csomag kiválasztása → összegzés → „Tovább a fizetéshez”). Kell egy újabb címke (pl. `v1.7.3`), ha ezt ki akarjuk adni.
- **Stripe teszt:** `alap` 7 EUR/hó (`FIZETES_AR_ALAP`), `profi` 19 EUR/hó (`FIZETES_AR_PROFI`), az árazonosítók a `functions/.env.prod`-ban. A webhook végpont a Stripe tesztmódjában, a titkok (teszt) beállítva a prodon. Részletek, éles módra váltás és ellenőrző lista: **`docs/stripe.md`**.
- A Stripe-plugin (hivatalos) a tulajdonos claude.ai fiókján telepítve lehet (böngészőn át); a MI-munkamenet pluginokat induláskor tölt be, ezért új munkamenetben látszania kell.

## 3. A következő három feladat (ezt építjük)

### A) „Fejlődés az idő mentén” – a Profi csomag extra funkciója

> **Állapot (a következő munkamenetben, 2026-10-10): a diákonkénti rész KÉSZ** (kód, nincs commitolva/deployolva), részletek: `docs/folytatas.md` 5/f. Ugyanitt: az **osztályszintű elemzés az Alap csomagba került**
> (ezt a tulajdonos kérte). **Hátra az A) második fele** (osztályszinten, több feladaton át), a B) és a C).

**Mit kér a tulajdonos:** a Profi csomag része legyen egy fejlődés-követő nézet, és ezt a csomag leírásánál is ki kell írni („a Profi csomag része”).

**Mit jelent:**
- **Diákonként:** a pontszázalék és a hibatípusok alakulása feladatról feladatra egy idővonalon (grafikon): hogyan javul a diák, mely hibák ismétlődnek.
- **Osztályszinten:** a tipikus hibák alakulása feladatról feladatra (a feladatonkénti típushiba-statisztika már megvan: `feladatElemzes`, `elemzes.html`; ez az összekötés több feladaton át).
- **Adat:** `beadasok/{id}/ertekeles/ai` és `/tanari` (pontok, `hibak[]` a `tipus` címkével), `feladatok/*/elemzes`. A tanár ezeket már olvashatja (szabályok).
- **Csomag-zár:** a nézet csak `profi` és `korlatlan` csomagnál nyíljon meg (a kvótás környezetben, azaz a prodon); a pilotban (nincs kvóta) legyen elérhető mindenkinek. A zárat szerveren (callable, ami ellenőrzi a csomagot) és a felületen is kezelni kell; alapnál/ingyenesnél legyen egy barátságos „Profi csomaggal elérhető” kártya, előfizetés-gombbal.
- **Megjelenítés a csomagoknál:** a tanári főoldal csomag-paneljén (és a későbbi landing oldalon) a Profi mellett szerepeljen: „Fejlődés-követés”.
- **Grafikonokhoz** használd a `dataviz` skillt (egységes, hozzáférhető színek, sötét/világos mód).
- **Jogi megjegyzés:** hosszabb ideig, több feladaton át követett diák-adat: a megőrzési idő és az adatvédelmi jogász válasza (`docs/adatvedelmi-kerdesek.md`) érinti; tervezéskor említsd.

### B) Színválasztás a tanári felületen – az Alap csomagtól  *(KÉSZ: lásd `docs/folytatas.md` 5/g)*

**Mit kér a tulajdonos:** egy szín-/témaválasztó a főoldalon, ami **az ingyenes csomagban NEM elérhető**, az **Alap** és a **Profi** (és a `korlatlan`) csomagban igen. Cél: az előfizetés két dolgot adjon (keret + egy kényelmi/kozmetikai plusz). „Nem emiatt veszik meg, de van hatása.”

**Útmutató a megvalósításhoz:**
- A felület színei CSS-változók (`public/css/app.css`: `--accent`, `--accent-light` a tanári (narancs) és a diák (`body.theme-diak`, kék) témához). Néhány előre elkészített, **jó kontrasztú** paletta legyen (ne szabad színválasztó: a hozzáférhetőség miatt), világos és sötét módban is.
- Tárolás: a tanár választása a profiljában; a `tanarok/*` kliensről tiltott, ezért callable vagy a `felhasznalok/{uid}` mezője (a szabályokat ellenőrizd). A téma gyors betöltéséhez `localStorage`-ben is tartsd (villanás nélkül).
- Csomag-zár ugyanúgy, mint az A) pontnál (szerveroldali ellenőrzés + barátságos „Alap csomagtól” üzenet az ingyenes tanárnak).
- Opcionális ötlet: a tanár neve/iskolája megjelenik a diákoknak szóló visszajelzésen.
- Kétnyelvű szövegek (`public/js/i18n-hu.js` és `i18n-en.js`), szótári kulcsokkal.

### C) Landing (nyitó) oldal újratervezése  *(KÉSZ: lásd `docs/folytatas.md` 5/h)*

**Mit kér a tulajdonos:** a mostani nyitó oldal „nem valami szép”. Új, értékesítő jellegű landing oldal kell.

**Állapot:** a https://writing-review.web.app főoldala jelenleg a **belépő/regisztrációs oldal** (`public/index.html`). Kétnyelvű (magyar/angol), nemzetközi piacra, elsősorban nyelvtanároknak.

**Mit tartalmazzon (javaslat, a tulajdonossal egyeztetve):**
- Érték egy mondatban (kézzel írt vagy beírt dolgozat → MI-javítás → a tanár jóváhagyja), hogyan működik (3 lépés), képernyőképek, a csomagok és árak (ingyenes 20 egység egyszeri, alap 7 EUR/hó 150 egység, profi 19 EUR/hó 500 egység + fejlődés-követés + színválasztás az alaptól), GYIK, regisztráció/belépés gomb, jogi hivatkozások (felhasználási feltételek, adatkezelési tájékoztató: **még nincsenek**, lásd lent).
- Az árakat egy helyen kezeld (ne legyenek kétféleképpen beégetve): a Stripe-beállítással egyezzenek (`functions/.env.prod`).
- **Fontos:** a landing nem ígérhet olyat, ami jogilag nyitott (kiskorúak, EU-s feldolgozás, lásd lent), és ne állítson a Google szolgáltatás-feltételeivel ellentétes dolgot.
- Tervezéshez használd a tervezési skilleket (artifact-design / a megfelelő frontend-design út), a kétnyelvűség tesztje (`tests/i18n.test.mjs`) védi a szótárakat.

## 4. Nyitott, nem műszaki és nagyobb kérdések (ne felejtsd el a tulajdonossal)

- **Stripe éles módra váltása:** lásd `docs/stripe.md` (éles termék/ár, portál, webhook, `sk_live`/éles `whsec` titkok a prodra, éles árazonosítók a `.env.prod`-ba, kiadás, kis összegű próbafizetés visszatérítéssel). Technikailag ~fél-egy óra.
- **Számlázás:** a Stripe számlája nem NAV-s számla. A tulajdonos **egyéni vállalkozó**, van számlázz.hu fiókja. A számlázz.hu **Számla Agent** (API) bekötése automatizálhatja a számlakiállítást a befizetésekből (a számlázz.hu agent-kulcsa is titok lesz). Még nincs megépítve.
- **Áfa / Stripe Tax:** a könyvelővel kell tisztázni (alanyi adómentesség vagy áfás, EU-s eladás/OSS).
- **Google korhatár-kikötés (BLOKKOLÓ az éles diák-használatnál):** a Gemini API és a Google Cloud feltételei tiltják az olyan alkalmazást, ami „valószínűleg 18 év alattiak által elérhető”. A tulajdonos a Google-nél marad, és utánajár (levélvázlat: `docs/google-korhatar-level.md`). Részletek: `docs/kornyezetek-terv.md` 5.2, `docs/folytatas.md` 5/b.
- **Adatvédelmi jogász:** a kérdéslista kész (`docs/adatvedelmi-kerdesek.md`, 18 kérdés; a 18. a fejlődés-követésről szól, **a már továbbított változatba még be kell írni**); a tulajdonos felesége továbbítja egy jogásznak. Nincs még fiók-/adattörlési funkció és megőrzési idő; ezek a jogász válasza után épülnek.
- **Jogi dokumentumok:** felhasználási feltételek, adatkezelési tájékoztató, lemondás/elállás: még nincsenek; a landing oldalnak és a Stripe-nak is kellenek.
- **Az emulátoros teszt** a MI-nél nem fut; mindig a tulajdonos futtatja a változtatások után.
- **Egyéb tervezett ötletek:** tanári tömeges feltöltés (a tanár fotózza egyben a csoport dolgozatait; a korhatár-kérdést is segíti), fel nem használt egységek átvitele a következő hónapra, erősebb AI-modell a Profinak (költség!), közös csomag munkaközösségnek, PDF/CSV export (CSV: e-naplóba másolható eredmények).
- **Üzemeltetés:** egyéni domain, hibariasztás, a GitHub `prod` környezeten „Required reviewers”, a Firebase SDK helyi kiszolgálása (most a `gstatic.com`-ról töltődik, IP-cím kiadása).

## 5. Hasznos hivatkozások a repóban

- `docs/folytatas.md` (állapot, 0/c, 5/b–5/e), `docs/stripe.md`, `docs/kornyezetek-terv.md`, `docs/adatmodell.md`, `docs/mukodesi-leiras.md`, `docs/ci-cd.md`.
- Kód: `functions/index.js` (a Cloud Functions), `functions/kvota.js` (csomagok), `functions/fizetes.js` (Stripe-esemény → csomag), `functions/kornyezet.js` (környezeti kapcsolók), `public/tanar.html` (tanári főoldal, csomag-panel), `public/index.html` (belépő oldal), `public/css/app.css`.

## 6. Az első üzenet az új beszélgetésben (javaslat a tulajdonosnak)

> Olvasd el a `docs/kovetkezo-munkamenet.md`-t, és beszéljük meg az A) feladatot (fejlődés az idő mentén), utána a B) színválasztást, végül a C) landing oldalt. Egyetlen lépést adj egyszerre.
