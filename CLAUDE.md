# Ordinatio ERP / CRM

Statische pagina's met Firebase (project `dagstaat-ordinatio`). Het beheer
staat in `admin.html`; de versie staat rechtsboven (`v158-…`) en gaat bij
elke wijziging één omhoog. De Firestore-regels staan niet in deze repo, maar
in `supplychainmeneer/crm-regels/` (lees daar `LEESMIJ.md` vóór elke
wijziging: `firebase deploy --only firestore:rules` vervangt de héle
ruleset).

## Tekstballon (CRM → Tekstballon)

De tekst bij de mascotte op supplychainmeneer.nl. Collectie `site_ballon`,
**één document per regel** met een eigen document-id (Firestore-id). Velden,
niet hernoemen en geen nieuwe verzinnen — de site leest ze precies zo:

| Veld | Type | Betekenis |
|---|---|---|
| `tekst` | string | De ballontekst. Richtlijn ±120 tekens, maximaal 200 |
| `link` | string | `''`, een intern pad `/…`, `#…` of `http(s)://…` |
| `linktekst` | string | `''` of de tekst van de link (alleen met een link) |
| `actief` | boolean | Doet de regel mee |
| `vanaf` | string | `"YYYY-MM-DD"` of `''` (geen begingrens), inclusief |
| `tot` | string | `"YYYY-MM-DD"` of `''` (geen eindgrens), inclusief |
| `bijgewerkt` | string | ISO-tijd van de laatste keer opslaan |

Tot v157 was er één document `site_ballon/huidig`. `renderBallon()` zet dat
om naar een gewone regel (kopie met eigen id, teruglezen, pas dan `huidig`
verwijderen).

### De keuzeregel

Woordelijk gelijk aan `CLAUDE.md` in de websiterepo (`supplychainmeneer`),
want de site moet precies hetzelfde kiezen als het CRM laat zien:

> Van alle regels met actief = true waarvan de periode vandaag loopt, wint
> die met de laatste begindatum. Is dat gelijk, dan wint de laatst
> gewijzigde. Loopt er vandaag geen enkele regel, dan is er geen ballon. Een
> gat tussen twee perioden is een echt gat: dan verschijnt er niets.

Uitwerking (`ballon-keuze.js`, los te testen zonder Firestore):

- "Vandaag" is de Nederlandse datum (`Europe/Amsterdam`). Een regel loopt als
  `vanaf` leeg of ≤ vandaag is, én `tot` leeg of ≥ vandaag.
- Een regel met een lege `tekst` of een `vanaf`/`tot` die geen
  `YYYY-MM-DD` is, loopt nooit.
- Een lege `vanaf` telt als de vroegste begindatum: elke regel mét
  begindatum wint daarvan.
- "Laatst gewijzigd" is `bijgewerkt`, als tekst vergeleken. Ook gelijk: het
  laagste document-id wint (alleen om altijd hetzelfde te kiezen).
- Geen terugvaltekst: loopt er niets, dan is er geen ballon.
- Een regel zonder `vanaf` én zonder `tot` loopt altijd en vult elk gat. Het
  scherm meldt dat bij zo'n regel.

Het scherm sorteert: wat nu loopt (de winnaar eerst), dan wat nog komt (op
begindatum), dan wat uit staat, dan wat verlopen is. Het meldt gaten,
overlappen (met de winnaar) en "Er staat nu geen ballon op de site."

De site kiest bij de build (elke 2 uur), niet in de browser, zodat teksten
die nog moeten komen niet in de HTML staan. Een periode die om middernacht
ingaat, verschijnt dus bij de eerstvolgende build. Wel openbaar: een regel
met `actief == true` is via Firestore op te vragen, ook vóór zijn
begindatum. Niets vertrouwelijks in een ballontekst.
