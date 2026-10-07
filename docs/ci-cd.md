# CI/CD – tesztek és prod-kiadás

Két GitHub Actions folyamat van (`.github/workflows/`):

| fájl | mikor fut | mit csinál |
|---|---|---|
| `ci.yml` | PR-on, `main`-re érkezéskor, és a `prod.yml` hívja | build + a teljes tesztsor **emulátorral** (Node 24, Java 21) |
| `prod.yml` | `v*` címke (pl. `v1.0.0`) | tesztek, majd **prod-deploy kézi jóváhagyással** |

**A pilot szándékosan nincs bekötve:** a kollégák éles munkára használják, és nem bővül.
Ott marad a kézi deploy: `node scripts/deploy.mjs pilot --only ...`.

## Kiadás a prodra

```bash
git checkout main && git pull
git tag v1.0.1
git push origin v1.0.1
```

A címkére lefutnak a tesztek, utána a deploy-lépés **megáll jóváhagyásra** (GitHub → Actions →
a futás → „Review deployments”). Csak a `main`-en lévő commit mehet (a folyamat ellenőrzi).
Telepített részek: `hosting`, `functions`, `firestore:rules`, `firestore:indexes`, `storage`.

## Egyszeri beállítás (a tulajdonos végzi, a prod projekten: `writerev2`)

A hitelesítés **Workload Identity Federation**: nincs kulcsfájl a GitHubban. A parancsokat a saját
terminálodon futtasd (`gcloud auth login` a `hudenagymail@gmail.com` fiókkal).

```bash
PROJECT=writerev2
REPO=mistagee83/writingreview
NUM=$(gcloud projects describe $PROJECT --format="value(projectNumber)")

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project $PROJECT

gcloud iam service-accounts create github-deploy --project $PROJECT --display-name="GitHub deploy"
SA=github-deploy@$PROJECT.iam.gserviceaccount.com

gcloud iam workload-identity-pools create github --project $PROJECT --location=global

gcloud iam workload-identity-pools providers create-oidc github --project $PROJECT \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$REPO' && assertion.sub=='repo:$REPO:environment:prod'"

gcloud iam service-accounts add-iam-policy-binding $SA --project $PROJECT \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

Jogosultságok a szolgáltatásfióknak (egy parancs szerepkörönként):

```bash
for ROLE in roles/firebase.admin roles/cloudfunctions.admin roles/run.admin \
            roles/iam.serviceAccountUser roles/artifactregistry.writer \
            roles/cloudbuild.builds.editor roles/secretmanager.viewer \
            roles/serviceusage.serviceUsageConsumer roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=$ROLE --condition=None
done
```

> A függvény-deployhoz szükséges szerepkörök a Firebase/GCP változásaival módosulhatnak. Ha az első
> futás jogosultsági hibával áll meg, a hibaüzenet megnevezi a hiányzó szerepkört: add hozzá, és
> indítsd újra a futást.

### GitHub-oldal

1. Repo → **Settings → Environments → New environment**: `prod`.
2. A `prod` environmentben: **Required reviewers** → te magad. (Ez a kézi jóváhagyás.)
   Ajánlott: **Deployment branches and tags** → csak a `v*` címkék.
3. A `prod` environment **Variables** részébe (nem titok):
   - `WIF_PROVIDER` = a `gcloud iam workload-identity-pools providers describe github --project writerev2 --location=global --workload-identity-pool=github --format="value(name)"` kimenete
     (alakja: `projects/<szám>/locations/global/workloadIdentityPools/github/providers/github`)
   - `WIF_SERVICE_ACCOUNT` = `github-deploy@writerev2.iam.gserviceaccount.com`
4. Repo → **Settings → Branches**: a `main` védelménél érdemes kérni a **CI / teszt** ellenőrzés
   sikerét merge előtt (opcionális).

## Megjegyzések

- A tesztek **emulátoron** futnak, éles projekthez nem nyúlnak.
- A Gemini-kulcs a Firebase Secret Managerben van projektenként; a CI nem látja és nem érinti
  (a függvények telepítése a már meglévő secretre hivatkozik).
- A prod deploy első CI-futásánál figyeld a kimenetet: a régi `firebase-functions` csomag
  figyelmeztetése ártalmatlan.
- A `deploy.mjs prod` továbbra is megköveteli a `--yes`-t; a CI ezt szándékosan adja meg a
  jóváhagyás után.
