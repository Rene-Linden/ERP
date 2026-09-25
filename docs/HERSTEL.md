# Herstel: Firestore en Storage terugzetten

Voor als er data weg of kapot is. Niet uitgeprobeerd; opgeschreven op
25 september 2026 uit de documentatie van Google en de instellingen zoals ze
die dag stonden. Lees eerst het hele stuk, dan pas uitvoeren.

Project: `dagstaat-ordinatio`. Database: `(default)`, locatie `eur3`.
Storage-bucket: `dagstaat-ordinatio.firebasestorage.app` (EUR4).
Nodig: `gcloud` en `firebase` (CLI), ingelogd als renevanderlinden@gmail.com.

## Wat er is

| Wat | Waar | Hoe lang terug |
|---|---|---|
| Geplande Firestore-back-up | dagelijks, door Google, tijdstip wisselt per dag | 14 dagen |
| Delete protection | op `(default)`: de database kan niet in één keer weg | — |
| JSON-export (Instellingen → Alles exporteren) | een bestand op je eigen schijf | zo oud als het bestand |
| Soft delete in Storage | verwijderde of overschreven bestanden | 7 dagen |

Niet gedekt: bestanden in Storage ouder dan 7 dagen verwijderd, en het hele
project. Rules zitten niet in een back-up; die staan in de website-repo in
`crm-regels/firestore.rules`.

## 1. Eerst: stoppen en kijken

- Niets meer opslaan in het CRM tot duidelijk is wat er mis is. Elke opslag
  na het ongeluk gaat bij een volledige terugzet verloren.
- Welke back-ups zijn er?

      gcloud firestore backups list --project dagstaat-ordinatio --format="table(name,snapshotTime,state)"

  Kies de laatste met `snapshotTime` vóór het ongeluk. `name` eindigt op
  `.../backups/<BACKUP_ID>`.

## 2. Firestore-back-up terugzetten

Een back-up gaat altijd naar een **nieuwe** database; een bestaande database
kan niet overschreven worden. Het CRM, de websites en SCM VAR lezen allemaal
`(default)`. Er zijn daarom twee routes. Route A is de gewone.

### Route A — naast de echte database zetten en terugkopiëren (aanbevolen)

`(default)` blijft staan, geen enkele pagina hoeft aangepast. Geschikt voor:
een collectie of een aantal documenten kwijt of verknoeid.

1. Terugzetten naar een hulpdatabase:

       gcloud firestore databases restore --project dagstaat-ordinatio \
         --source-backup=projects/dagstaat-ordinatio/locations/eur3/backups/<BACKUP_ID> \
         --destination-database=herstel

   Wacht tot `gcloud firestore databases describe --database=herstel --project dagstaat-ordinatio`
   geen lopende operatie meer toont. De hulpdatabase heeft geen rules en is
   dus van buiten dicht; dat is hier goed.

2. Bekijken: Firebase-console → Firestore → databasekeuze bovenaan →
   `herstel`. Controleer of de verloren data er staat.

3. Terugkopiëren via een export (vraagt een tijdelijke bucket):

       gcloud storage buckets create gs://dagstaat-ordinatio-herstel --project dagstaat-ordinatio --location=EU
       gcloud firestore export gs://dagstaat-ordinatio-herstel/herstel \
         --database=herstel --collection-ids=<collectie>[,<collectie>] --project dagstaat-ordinatio
       gcloud firestore import gs://dagstaat-ordinatio-herstel/herstel/<map uit de exportuitvoer> \
         --database="(default)" --collection-ids=<collectie> --project dagstaat-ordinatio

   Import **overschrijft** documenten met hetzelfde id en voegt ontbrekende
   toe. Documenten die na de back-up nieuw zijn gemaakt blijven staan; ze
   worden niet verwijderd. Laat `--collection-ids` nooit weg tenzij je echt
   alles wilt terugzetten.

4. Opruimen:

       gcloud firestore databases delete --database=herstel --project dagstaat-ordinatio
       gcloud storage rm -r gs://dagstaat-ordinatio-herstel

### Route B — `(default)` vervangen (alleen als de hele database weg of onbruikbaar is)

Alles na het moment van de back-up gaat verloren.

1. Maak eerst een JSON-export (Instellingen → Alles exporteren), als het CRM
   nog opent.
2. Delete protection uit, database verwijderen:

       gcloud firestore databases update --database="(default)" --no-delete-protection --project dagstaat-ordinatio
       gcloud firestore databases delete --database="(default)" --project dagstaat-ordinatio

3. Minstens 5 minuten wachten (zo lang is een verwijderd id niet
   bruikbaar), dan:

       gcloud firestore databases restore --project dagstaat-ordinatio \
         --source-backup=projects/dagstaat-ordinatio/locations/eur3/backups/<BACKUP_ID> \
         --destination-database="(default)"

   De documentatie van Google sluit terugzetten naar `(default)` niet uit,
   maar zegt het ook niet met zoveel woorden. Lukt het niet, gebruik dan
   route A en kopieer alle collecties terug (stap 3 zonder
   `--collection-ids`), in een nieuwe lege `(default)` die je aanmaakt met
   `gcloud firestore databases create --database="(default)" --location=eur3`.

4. **Rules opnieuw uitrollen** — zonder rules is de database dicht voor het
   CRM en de websites. In de website-repo (`supplychainmeneer`), map
   `crm-regels/`, lees eerst `LEESMIJ.md`, dan:

       firebase deploy --only firestore:rules,firestore:indexes --project dagstaat-ordinatio

   (Indexen zitten ook in de back-up; het uitrollen kan geen kwaad.)

5. Delete protection weer aan en de back-upplanning controleren (die hoort
   bij de database en kan met de oude database verdwenen zijn):

       gcloud firestore databases update --database="(default)" --delete-protection --project dagstaat-ordinatio
       firebase firestore:backups:schedules:list --database "(default)" --project dagstaat-ordinatio
       firebase firestore:backups:schedules:create --database "(default)" --recurrence DAILY --retention 14d --project dagstaat-ordinatio

### Route C — het CRM naar de herstelde database laten wijzen: niet doen

Kan in theorie (`getFirestore(app, 'herstel')`), maar dan moeten admin.html,
scm.html, start.html, erp-auth.js, de andere pagina's, beide websites,
SCM VAR en de rules allemaal mee. Te veel plekken om in een noodsituatie goed
te doen.

## 3. De JSON-export terugzetten

**Daar is geen importroute voor.** De export uit Instellingen is bedoeld om
te **lezen**: een losse relatie, factuur of aanvraag opzoeken en met de hand
terugzetten, of als laatste redmiddel als alle back-ups weg zijn. Er is geen
knop of script dat het bestand in Firestore terugschrijft.

Het bestand is wel zo gemaakt dat een importscript later kan: per collectie
per document-id de velden, en datums als `{"__type":"timestamp", …}`. Wie
zo'n script schrijft, moet die `__type`-velden terugzetten naar echte
Firestore-typen, anders worden het gewone objecten.

## 4. Storage terugzetten

Download-links in Firestore (`pdf_url`, `url`, `html_url`, …) zien er zo uit:

    https://firebasestorage.googleapis.com/v0/b/dagstaat-ordinatio.firebasestorage.app/o/<pad>?alt=media&token=<token>

Zo'n link blijft alleen werken als **bucket, pad én token** gelijk zijn. Het
token staat in de metadata van het bestand (`firebaseStorageDownloadTokens`).

- **Verwijderd of overschreven, minder dan 7 dagen geleden** (soft delete):

      gcloud storage ls --soft-deleted -a "gs://dagstaat-ordinatio.firebasestorage.app/<map>/**"
      gcloud storage restore "gs://dagstaat-ordinatio.firebasestorage.app/<pad>#<generation>"

  Het bestand komt terug met dezelfde metadata: de link blijft werken.

- **Uit een kopie in een andere bucket**: `gcloud storage cp` of `rsync` van
  bucket naar bucket neemt de metadata mee; terugkopiëren naar hetzelfde pad
  houdt de link heel.

- **Uit een kopie op de eigen schijf**: een download bewaart het token
  niet. Na terug-uploaden werkt de oude link niet, tenzij je het token per
  bestand terugzet uit de bewaarde metadatalijst:

      gcloud storage objects update "gs://dagstaat-ordinatio.firebasestorage.app/<pad>" \
        --custom-metadata=firebaseStorageDownloadTokens=<token uit de lijst>

  Zonder die lijst: bestanden terugzetten én in het CRM de koppeling
  opnieuw maken (document opnieuw uploaden bij de relatie/opdracht).

## 5. Wat kost een herstel

Bij de huidige omvang (Firestore ± 2 MB, Storage ± 50 MB) vrijwel niets:

- Terugzetten van een Firestore-back-up: per GiB van de back-up; bij 2 MB
  een fractie van een cent.
- Export en import (route A, stap 3): één lees- en één schrijfactie per
  document, plus een paar MB in de tijdelijke bucket voor een paar minuten.
- De hulpdatabase `herstel`: opslag per GiB per maand zolang hij bestaat.
  Na afloop verwijderen.
- Storage terugzetten uit soft delete of een andere bucket: bewerkingen per
  bestand; bij ~60 bestanden verwaarloosbaar.

De kosten zijn geen reden om te twijfelen; de tijd en het risico van een
verkeerde stap wel. Daarom eerst route A.
