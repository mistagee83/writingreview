# Stripe-fizetés – beállítás és üzemeltetés

*Készült: 2026-10-10. A kód kész és tesztelt, de **kikapcsolt állapotban** van: a fizetés csak a **prodon** él, és csak akkor, ha a
`functions/.env.prod`-ban a `FIZETES_AR_ALAP` ki van töltve. A kiindulás: `kornyezetek-terv.md` 5.1; a csomagok és a kvóta: `functions/kvota.js`.*

## Mit csinál a rendszer

- A tanár a főoldalon az **„Előfizetek”** gombbal a **Stripe fizetőoldalára** (Checkout) megy; a kártyaadat sosem érinti a szervert.
- Az előfizetés kezelése (lemondás, kártyacsere, számlák) a **Stripe saját portálján** (Customer Portal) van.
- A **webhook** (`stripeWebhook`) aláírás-ellenőrzéssel fogadja a Stripe eseményeit, és ebből **a szerver** állítja a tanár csomagját
  (`tanarok/{uid}.csomag`: aktív → `alap`; megszűnt/lemondott/nem fizetett → `ingyenes`). A kliens csomagot soha nem írhat.
- Az admin által kézzel adott csomagot (`csomag_forras: "admin"`, pl. `korlatlan`) a Stripe nem írja át.
- A havi kvótát a csomag adja (`alap` = 150 egység/hó, naptári hónap szerint).

## Beállítás – lépésről lépésre

Kezdd a **Stripe tesztmódjával**; élesíteni csak a lenti ellenőrző lista után szabad.

1. **Stripe-fiók** (a tulajdonosé): egyéni vállalkozóként, magyar fiók. A tesztmód kulcsai (Developers → API keys): `sk_test_...`.
2. **Termék és ár:** Product Catalog → új termék „WritingReview Alap”, **havi, ismétlődő ár**, EUR, **áfával együtt** (tax inclusive), a `kornyezetek-terv`
   szerinti ár (javasolt: 7 EUR/hó). Az ár azonosítója (`price_...`) kell.
3. **Customer Portal:** Settings → Billing → Customer portal → bekapcsolni: előfizetés lemondása (**az időszak végén**), fizetési mód frissítése,
   számlák megtekintése; cégnév és (ha már van) a felhasználási feltételek és az adatkezelési tájékoztató linkje.
4. **Titkok a Firebase-ben (a saját terminálodból):** a deploy előtt **mindkét projektben** léteznie kell mindkét titoknak, különben a deploy elhasal
   (a pilotban helyőrző érték is jó, ott a fizetés ki van kapcsolva):

   ```powershell
   firebase functions:secrets:set STRIPE_SECRET_KEY --project prod
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project prod
   firebase functions:secrets:set STRIPE_SECRET_KEY --project pilot
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project pilot
   ```

   (A parancs bekéri az értéket; ne írd be a kulcsot a chatbe vagy a repóba. A `STRIPE_WEBHOOK_SECRET` értéke a következő lépésben keletkezik: addig
   használj helyőrzőt, utána írd felül.)
5. **Deploy a prodra** (címkés kiadás). A kiadás után a `stripeWebhook` függvény címe: `firebase functions:list --project prod`.
6. **Webhook végpont a Stripe-ban:** Developers → Webhooks → új végpont a `stripeWebhook` címével, eseményei: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. A végpont **aláíró titka** (`whsec_...`) az
   `STRIPE_WEBHOOK_SECRET` értéke (írd felül a 4. lépés helyőrzőjét, majd a függvényeket újra kell deployolni, hogy az új értéket lássák).
7. **Az ár bekapcsolása:** a `functions/.env.prod`-ban `FIZETES_AR_ALAP=price_...` (és szükség esetén az ár szövege: `FIZETES_AR_SZOVEG`). Új kiadás után a
   tanári főoldalon megjelenik a **💳 Csomag** panel.

## Kipróbálás tesztmódban

- Fizetés: a Checkoutban a Stripe **teszt-kártyái** működnek (pl. `4242 4242 4242 4242`, bármilyen jövőbeli lejárat és CVC).
- A Stripe Dashboard → Webhooks → a végpont → „Send test webhook” vagy az eseménynapló mutatja, hogy a webhook 200-zal válaszolt-e.
- Ellenőrizd: a tanár csomagja `alap` lett (Felhasználók oldal / tanári főoldal), a kvóta-kártya 150 egységet mutat; lemondás után az időszak végéig marad.

## Élesítés előtti ellenőrző lista (NEM kihagyható)

- [ ] **Könyvelő:** az egyéni vállalkozó áfa-státusza (alanyi adómentes vagy áfás), az EU-s eladás szabályai (más tagállamba értékesített digitális szolgáltatás:
      OSS), és hogy az **áfával együtt** feltüntetett ár helyes-e. Ettől függ, hogy kell-e Stripe Tax (`automatic_tax`) és hogyan.
- [ ] **Számlázás:** a Stripe saját számlája/nyugtája **nem** helyettesíti a **NAV felé jelentett magyar számlát**. A számlázz.hu fiókodra a Számla Agent (API) szolgál
      az automatikus számlakiállításra; ennek bekötése külön lépés (a `invoice.paid`/`checkout.session.completed` eseményből), és a számlázz.hu agent-kulcsa
      is titok lesz. Amíg nincs bekötve, a számlát kézzel kell kiállítani minden befizetésről.
- [ ] **Jogi dokumentumok:** felhasználási feltételek, adatkezelési tájékoztató, lemondási és (fogyasztói) elállási szabályok, linkelve a Checkoutból és a portálról.
- [ ] **Google korhatár-kikötés és adatvédelem** (`kornyezetek-terv.md` 5.2; `adatvedelmi-kerdesek.md`): a nyilvános értékesítés előtt tisztázni.
- [ ] A Stripe-fiók **éles módra** kapcsolása (üzleti adatok, kifizetési számla), éles kulcsok és éles `price_...`/webhook titok beállítása, majd egy valódi, kis összegű
      próbafizetés visszatérítéssel.

## Üzemeltetés

- A webhook-eseményeket a `stripe_esemenyek` gyűjtemény naplózza (idempotencia: egy esemény egyszer hat); az ügyfél→tanár összerendelés a `stripe_ugyfelek`.
  Mindkettő csak a szervernek elérhető (szabály: kliens nem olvashatja).
- Hibás vagy elveszett webhookot a Stripe újrapróbál; a függvény 5xx-et ad feldolgozási hibánál.
- Egy tanár csomagját az admin továbbra is kézzel állíthatja; az ingyenesre állítás visszaadja a csomagot a Stripe-nak.
- Kódok: `functions/fizetes.js` (esemény → csomag, tiszta logika), `functions/index.js` (`stripeWebhook`, `fizetesIndit`, `fizetesKezeles`), `public/tanar.html` (panel).
  Tesztek: `tests/fizetes.test.mjs`, `tests/fizetes-adatbazis.test.mjs` (emulátor), `tests/rules.test.mjs`, `tests/callable-jogosultsag.test.mjs`.
