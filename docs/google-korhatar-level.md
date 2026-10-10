# Levélvázlat a Google-nek – a korhatár-kikötés tisztázása

*Készült: 2026-10-09. Háttér: `kornyezetek-terv.md` 5.2 és `folytatas.md` 5/b. A levelet a tulajdonos küldi; a Google válaszát
(e-mail vagy támogatási jegy) időbélyeggel el kell menteni, és ide, a docs alá be kell hivatkozni.*

## Teendők a küldés előtt

- A `[szögletes zárójeles]` részeket töltsd ki (név, szerep, elérhetőség, cégnév).
- Ne írj bele diákadatot vagy valós nevet, és ne állítsd, hogy a Google már jóváhagyta.
- A Google Cloud fiókod csapatán vagy a Cloud-konzol kapcsolatfelvételi/támogatási csatornáján keresztül küldd (nem találtunk külön
  „jogi kérdés” csatornát). Egy ügyfélszolgálati válasz **nem** jogi állásfoglalás: kérj írásos megerősítést, szükség esetén jogász nézze át.
- Ellenőrizd, melyik feltételverzió érvényes rád (a Service Specific Terms és a Gemini API feltételei időnként módosulnak).

## A hivatkozott pontok (elsődleges forrás, ellenőrizve 2026-10-09)

- Gemini API Additional Terms, „Age Requirements”: <https://ai.google.dev/gemini-api/terms>
  – „You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other
  service … that is directed towards or is likely to be accessed by individuals under the age of 18.”
- Google Cloud Service Specific Terms, generatív AI, „Age Restrictions”: <https://cloud.google.com/terms/service-terms>
  – „Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website, Customer Application, or other
  online service that is directed towards or is likely to be accessed by individuals under the age of 18.”

## A levél (angolul)

**Subject:** Question about the age restriction in the Gemini API / Google Cloud generative AI terms for a teacher-operated education tool

Hello,

We operate a web application for secondary-school language teachers: [company / product name], hosted on Firebase (Firebase project
`writerev2`, https://writing-review.web.app). We call Gemini via the Gemini API, using an API key from Google Cloud project
`gen-lang-client-0529329642` on a paid plan, to transcribe and assess handwritten student work.

How it works: a teacher creates a class and an assignment. Students (typically 14–18) join the class and upload a photo of their
handwritten work. The system transcribes it and drafts feedback and a score using Gemini, and **the teacher reviews and approves it**
before the student sees anything. Students never write prompts or chat with the model; they only see teacher-approved feedback.

We noticed that the Gemini API Additional Terms ("Age Requirements") and the Google Cloud Service Specific Terms ("Age Restrictions" for
Generative AI Services) do not allow using the services in an application that is "directed towards or is likely to be accessed by
individuals under the age of 18".

Could you please clarify in writing:

1. Does this restriction apply to an application like ours, where the users who operate it are adult teachers, but students under 18
   upload photos of their work and receive teacher-approved feedback?
2. If it does apply, is there an approved way to offer such a tool (an education-specific arrangement, a contractual exception, or a
   different Google product or terms)?
3. Is the answer the same for the Gemini API and for Gemini on Google Cloud, and does it change if we use the EU data residency
   endpoints?

Thank you,
[Name, role, contact]
[Company, country]

## Megjegyzések

- A pilot külön Firebase-projekt (`writingreview-41e59`); az ottani Gemini-kulcs projektjét a jegyzetek nem rögzítik. Ha a válasz a pilotra
  is kell, add meg azt is.
- A 3. kérdés a lehetséges Vertex-/Cloud-migrációra vonatkozik (EU-s feldolgozás). Ha a Google a Cloud-oldalon más választ ad, mint a Gemini
  API-nál, az a migráció döntéséhez kell.
- A válasz mentési helye: ide, a fájl aljára, dátummal (`## Válasz (ÉÉÉÉ-HH-NN)`).
