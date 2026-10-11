# Számlázz.hu – automatikus számla a Stripe-befizetésekről

*Készült: 2026-10-11. A kód kész és tesztelt, de **kikapcsolt állapotban** van: csak a **prodon** él, és csak ha a `functions/.env.prod`-ban
`SZAMLAZZ=igen` van, a fizetés él (`FIZETES_AR_ALAP`), és a titok be van állítva.*

## Mit csinál

- A Stripe `invoice.paid` eseményére (sikeres befizetés: az első és a havi megújuló is) a szerver számlát állít ki a számlázz.hu **Számla Agent** API-n (`functions/szamlazz.js`, `szamlaKiallitas` az `index.js`-ben).
- **Alanyi adómentes (AAM):** nincs áfa, a nettó = a bruttó, az áfakulcs `AAM`, a megjegyzés is jelzi.
- **Tesztmód:** a Stripe tesztmódú befizetéséről (`livemode=false`) **nem készül számla, és a számlázz.hu-t nem hívja** (az éles fiókban a tesztelés díjköteles, és leállíthatja az automatikus számlázást; a számlázz.hu szerint tesztelni külön teszt fiókban kell). Éles befizetésből valódi számla készül, amit a számlázz.hu e-mailben elküld a vevőnek.
- **Díj:** a Számla Agent a #free csomaggal is használható, de külön fizetős: 1–50 bizonylat/hó 2690 Ft + áfa/hó, utólag.
- Magyar vevő (a Stripe-ban megadott számlázási cím országa HU) magyar, a többi angol nyelvű számlát kap. Pénznem: a Stripe-é (EUR); árfolyam: MNB.
- **Idempotens:** a `szamlak/{stripe-számla-azonosító}` dokumentum (csak a szerver éri el) foglalja a kiállítást: a Stripe többszöri kézbesítése nem ad dupla számlát. Állapotok: `folyamatban`, `kesz` (számlaszámmal), `hiba`, `bizonytalan`.
- **Hiba:** a számlázz.hu elutasítása (pl. rossz kulcs) esetén a webhook 500-at ad, így a Stripe újrapróbálja (legfeljebb 5 kísérlet, utána `feladva`, a naplóban "kézi ellenőrzés kell"). **Hálózati hiba/időtúllépés** esetén az állapot `bizonytalan`: a számla lehet, hogy elkészült, ezért nem próbáljuk újra; a számlázz.hu fiókban kell megnézni (a `szamlaKulsoAzon` és a rendelésszám a Stripe számlaazonosító, `in_...`).
- 0 összegű befizetésről nem készül számla.

## Kézi számlázás (amíg nincs bekötve az Agent) – **ez az első lépés**

- Ha a fizetés él (prod), de `SZAMLAZZ=igen` nincs beállítva, a Stripe `invoice.paid` eseménye **számlázandóként** kerül a `szamlak/{in_...}` gyűjteménybe (név, e-mail, cím, összeg, pénznem, dátum; `szamlaRogzites` az `index.js`-ben). Egy befizetés egyszer kerül be.
- **Admin oldal: 🧾 Számlázandók** (`public/szamlazando.html`; callable-ök: `szamlazandoLista`, `szamlaJeloles`, csak admin). Szűrő: számlázandó / kiállított / mind. A tulajdonos a számlázz.hu-ban kiállítja a számlát (az e-mail küldést bepipálva, a számlázz.hu elküldi a vevőnek), majd az oldalon beírja a számlaszámot, és „Kiállítva”-ra állítja (visszavonható). Segédek: „Adatok másolása” (név, e-mail, cím) és „CSV letöltése” (a megjelenített sorok, tesztbefizetés nélkül; pontosvesszős, Excel-barát).
- A Stripe **tesztmódú** befizetései is bekerülnek, „TESZT” jelöléssel, számlaszám-mező nélkül: így a folyamat kipróbálható valódi számla nélkül.
- **Bekapcsolás:** a Stripe webhook végpontjához **add hozzá az `invoice.paid` eseményt** (tesztmódban és élesben is), majd **kiadás** (hosting + functions). A pilotra nem hat (ott nincs fizetés).
- **Személyes adat:** a `szamlak` a klienstől tiltott (szabály: nincs rá engedély), csak az admin callable adja ki. Megőrzési idő: a számlázási adat jogszabályi megőrzés alá esik (könyvelővel egyeztetni); ez a jogász kérdéslistájába is tartozik.

## Beállítás (az Agent bekötéséhez)

1. **Agent-kulcs:** számlázz.hu → Beállítások → Számla Agent → kulcs létrehozása/másolása. (Titok: ne kerüljön a chatbe vagy a repóba.)
2. **A kulcs a Firebase-be** (saját terminálból):
   ```powershell
   Get-Clipboard | firebase functions:secrets:set SZAMLAZZ_AGENT_KULCS --data-file - --project prod
   ```
   A futtató szolgáltatásfióknak hozzáférés kell: `gcloud secrets add-iam-policy-binding SZAMLAZZ_AGENT_KULCS --project writerev2 --member serviceAccount:<projektszám>-compute@developer.gserviceaccount.com --role roles/secretmanager.secretAccessor`
3. **Stripe webhook:** a meglévő végponthoz **add hozzá az `invoice.paid` eseményt** (Developers → Webhooks).
4. **`functions/.env.prod`:** `SZAMLAZZ=igen`; opcionálisan `SZAMLAZZ_BANK` és `SZAMLAZZ_BANKSZAMLA` (a számlán a bankszámla; üresen a számlázz.hu fiókbeli adat).
5. **Kiadás** (címke), majd a függvények újradeployolása a titokkal.
6. **Kipróbálás:** tesztmódban nem készül semmi. Az első kipróbálás az éles módra váltás után egy kis összegű valódi befizetés (utána a számla sztornózandó, a pénz visszatérítendő), vagy külön számlázz.hu teszt fiókkal. Ellenőrizd az EUR-os árfolyam kezelését (`arfolyam` 0.0 + `MNB`: a számlázz.hu automatikusan tölti-e ki; ha elutasítja, az MNB-árfolyamot nekünk kell megadni).
7. **Éles módra váltáskor** (lásd `stripe.md`) az első valódi befizetés valódi számlát készít: az első kis összegű próbafizetés után nézd meg a számlát és a vevőnek menő levelet.

## Ismert hiányosságok / nyitott

- **Az árfolyam kezelése nincs kipróbálva éles számlázz.hu-val** (nincs próbakörnyezet): lásd 6. lépés.
- **Céges vevő (adószámmal)** nincs: a Checkout nem kér adószámot, minden számla a megadott névre és címre szól. Ha kell, `tax_id_collection` + az `adoszam` mező.
- **Visszatérítés / sztornó:** a Stripe-visszatérítésből nem készül sztornószámla; kézzel a számlázz.hu-ban.
- A külföldi vevőre alkalmazott áfa-megítélés (AAM minden vevőre) a könyvelő jóváhagyását igényli.
- Kódok: `functions/szamlazz.js`, `functions/kornyezet.js` (`szamlazz`), `functions/index.js` (`szamlaKiallitas`, `stripeWebhookKezeles`). Teszt: `tests/szamlazz.test.mjs`.
