# A prod átköltözése a `mrashub`-projektbe (hub 4d, 2026-11-17)

A Writing Review kereskedelmi változata (`main` ág) a régi `writerev2` projektből a közös `mrashub`
Firebase-projektbe költözik, ahol a Mr. Andrew's EdTech Hub és a többi app (Quiz of the Damned, Hubbaloo) is él.
A `pilot` ág és a `writingreview-41e59` projekt nem változik.

A hub oldalán a modell: `D:\dev\Edtechhub\docs\spec-v1.md` („Kreditek”, „Közös Auth és app-integráció”)
és `docs/payments.md`.

## Mi változott a kódban

| Régi (writerev2) | Új (mrashub) |
| --- | --- |
| Tanáronkénti kvóta (`functions/kvota.js`, `tanarok/{uid}.csomag`, `tanarok/{uid}/hasznalat`) | Hub-kredit: `users/{uid}.credits`, `creditLedger`, árlista `settings/credits.prices["writing-review/<akció>"]` (`functions/kredit.js`) |
| Ingyenes / Alap / Profi / Korlátlan csomag | Regisztrációs ajándékkredit (a hub `onUserCreated`), Hub pass (`entitlements.all`), kreditcsomag; korlátlan = `credits.unlimited` (hub admin) |
| Saját Stripe-fizetés (`fizetes.js`, `stripeWebhook`, `fizetesIndit`, `fizetesKezeles`) | A hub fizetési központja (`/account` oldal); a WR-ben nincs Stripe-kód és -titok |
| Saját számlázz.hu (`szamlazz.js`, `szamlazandoLista`, `szamlazando.html`) | A hub Admin → Invoices |
| Admin csomagválasztó (`csomagBeallitas`) | A hub Admin → Credits (kézi jóváírás, korlátlan kapcsoló); a WR admin csak az egyenleget mutatja |
| Csomag-zár: osztályelemzés és szín az Alaptól, fejlődéskövetés a Profitól | Mindhárom a **Hub pass** része (`entitlements["writing-review"]` vagy `.all` aktív) |
| `kvotaAllapot` callable | `kreditAllapot` (egyenleg, a műveletek ára, Hub pass, a hub fiókoldalának címe) |
| Functions-codebase `default` | `wr` (a deploy mindig `--only hosting,functions:wr`) |
| Saját `firestore.rules`, `storage.rules`, indexek telepítése | A hub repója telepíti (a WR fájljai csak az emulátoros tesztekhez; a `scripts/tiltott-deploy.mjs` megállítja a deployt) |

Az akciók: `beadas` → `writing-review/check`, `feladatlap` → `writing-review/rubric`, `elemzes` → `writing-review/analysis`.
Az árlistán nem szereplő művelet nem indítható (`kredit_ar_hianyzik`), ezért az árakat a hub **Admin → Credits** fülén
fel kell venni, mielőtt a tanárok használják.

A kreditszámítás a hub `shared/credits.js` és `shared/entitlements.js` másolata (`functions/hub/*.mjs`); ha a hubban
változnak: `node scripts/hub-masolat.mjs`, ellenőrzés: `node scripts/hub-masolat.mjs --ellenoriz`.

A szabályok: a WR `firestore.rules` / `storage.rules` blokkja a hub fájljaiba másolva (`$(database)` → `$(db)`).
Ha itt változik, a hub fájljában is ugyanúgy kell javítani, és onnan telepíteni.

**Ismert apróság:** a lejárt Hub pass utáni színvisszaállítás lusta (a tanári főoldal `kreditAllapot` hívásakor),
mert a Hub passt a hub webhookja állítja, ami a WR téma-mezőjét nem ismeri.

## Teendők a bekapcsoláshoz (sorrendben)

A titkokat és az IAM-et a tulajdonos állítja a saját termináljából; a többit a MI is elvégezheti kérésre.

1. **Hosting site** a mrashub-ban (kész, ha a `firebase hosting:sites:list --project mrashub` mutatja):
   `firebase hosting:sites:create mrashub-review --project mrashub`
2. **Auth** (Firebase-konzol, mrashub → Authentication):
   - Sign-in method: **Email/Password** bekapcsolva (a WR e-mailes regisztrációja és megerősítése), Google bekapcsolva.
   - Settings → Authorized domains: `mrashub-review.web.app`, `mrashub-review.firebaseapp.com`.
   - Templates: az e-mail-megerősítő levél feladója/neve.
3. **Gemini-kulcs** (titok, a tulajdonos terminálja):
   `Get-Clipboard | firebase functions:secrets:set GEMINI_API_KEY --data-file - --project mrashub`
4. **Hub** (a hub repójából): `firebase deploy --only firestore:rules,firestore:indexes,storage --project mrashub`,
   és Admin → Credits: `writing-review/check`, `writing-review/rubric`, `writing-review/analysis` ára.
5. **Első deploy** (innen, a `main` ágról): `node scripts/deploy.mjs prod --yes --only hosting,functions:wr`
6. **Első admin** (a functions/ mappából, a tulajdonos fiókjával, belépés után):
   `node scripts/szerep.mjs <e-mail> tanar admin --projekt mrashub`
   (a claim a mrashub minden appjában él; a QotD `admin()` szabálya is ezt nézi).
7. **Storage CORS** (a feladatlap-feltöltéshez/-letöltéshez a böngészőből):
   `gcloud storage buckets update gs://mrashub.firebasestorage.app --cors-file=cors.prod.json`
8. **CI (GitHub Actions)**: a `prod.yml` a `mrashub`-ba deployol, ehhez Workload Identity Federation kell a mrashub-ban
   (lásd lent), majd a GitHub repo változói: `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` az új értékekkel.
9. **Próba**: új tanári fiók → ajándékkredit látszik a főoldalon → feladat, link, beadás, javítás → kredit fogy,
   a hub `/account` History-jában a „Used · Writing Review” sor; Hub pass nélkül az elemzés zárt kártyát mutat.

### Workload Identity Federation a mrashub-ban (a tulajdonos terminálja)

Ugyanaz, mint a writerev2-n bevált beállítás: `docs/ci-cd.md` „Egyszeri beállítás” – a `PROJECT=writerev2`
helyett `PROJECT=mrashub`, a szerepkörök közé a `roles/cloudscheduler.admin` is (a `takaritas` ütemezett
függvényhez). Utána a GitHub `prod` environment változói (`WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`) az új,
mrashub-os értékekre. Ha a deploy a titoknál akad el, a futtató fióknak (`<projektszám>-compute@developer.gserviceaccount.com`)
`roles/secretmanager.secretAccessor` kell a `GEMINI_API_KEY`-en.

**Figyelem:** a szolgáltatásfiók szerepkörei a mrashub egészére szólnak (a hub és a többi app functionjeire is).
A CI csak a `wr` codebase-t és a hostingot telepíti (`--only hosting,functions:wr`), és csak a `prod`
environment jóváhagyásával fut; a kulcs nélküli WIF-et csak ez a repó (`attribute-condition`) használhatja.

## Saját aldomain (2026-11-20)

A prod címe `https://review.mrandrewshub.com` (Firebase Hosting egyéni domain a `mrashub-review` site-on; Cloudflare DNS: CNAME `review` → `mrashub-review.web.app`, **DNS only**, különben a Firebase nem tud tanúsítványt kiállítani). A `mrashub-review.web.app` is működik tovább. Az új cím a Firebase Auth Authorized domains, a `functions/.env.prod` `ENGEDELYEZETT_DOMAINEK` és a `cors.prod.json` listáján.

## A régi prod (writerev2)

Nem nyúlunk hozzá: rajta nincs felhasználó; a hub 5. fázisában állítjuk le (külön kérésre, mert visszafordíthatatlan).
A régi Stripe-tesztmódú termékek és a webhook a writerev2-höz tartoztak; az új központ saját árakat és webhookot kap
(hub `docs/payments.md`).
