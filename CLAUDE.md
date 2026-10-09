# Ordinatio ERP / CRM

Statische pagina's met Firebase (project `dagstaat-ordinatio`). Het beheer
staat in `admin.html`; de versie staat rechtsboven (`v158-…`) en gaat bij
elke wijziging één omhoog. De Firestore-regels staan niet in deze repo, maar
in `supplychainmeneer/crm-regels/` (lees daar `LEESMIJ.md` vóór elke
wijziging: `firebase deploy --only firestore:rules` vervangt de héle
ruleset). Daar staan sinds 5 oktober 2026 ook de **Storage-regels**
(`crm-regels/storage.rules`, de volledige ruleset van de bucket
`dagstaat-ordinatio.firebasestorage.app`); `firebase deploy --only storage`
vervangt die ook in zijn geheel. Kort: de CRM-mappen (`contracten/`,
`contracten-los/`, `urenstaten-oud/`, `crm-documenten/`, `crm-opdrachten/`,
`crm-offertes/`, `campagne-bijlagen/`) alleen voor de eigenaar; openbaar
leesbaar alleen `blog-afbeeldingen/`, `ketenbrieven/` en
`nieuwsbrief-images/`. Een opgeslagen download-link (met token) werkt buiten
de regels om; zo opent het CRM bestanden en zo werkt de CV-link in
campagnemails. Een nieuwe map in Storage heeft een eigen `match` nodig, anders
wordt alles geweigerd.

## Accorderen via een link (v162, oktober 2026)

Een klant accordeert zijn urenspecificatie zonder in te loggen via
`accordeer.html?t=<token>` (en `&actie=afkeuren` voor "niet akkoord"). Tot
16 september stond in de link het document-id van `specs` en kon iedereen
`specs` lezen; daarna eiste de pagina inloggen en kon geen klant er meer in.

Opzet (`accorderen.js`):

- `verstuur.html` maakt bij het versturen naast `specs/<id>` een document
  `accorderingen/<token>`. Het token: 32 willekeurige bytes
  (`crypto.getRandomValues`), 43 tekens, niet af te leiden uit klant,
  periode of document-id. Het staat ook in `specs.accordering_token`.
- In `accorderingen` staat alleen wat de klant moet zien: klant, maand, jaar,
  urenregels (datum, start, eind, pauze), totaal. Geen e-mailadres, notitie
  of km. `specs` blijft alleen voor de eigenaar.
- De Firestore-regel (`supplychainmeneer/crm-regels/firestore.rules`): met
  het token mag je dat ene document lezen en één keer `status` van `open`
  naar `akkoord` of `afgekeurd` (met opmerking) zetten, met `beantwoord_op`
  = de tijd van de server. Verder niets: geen ander veld, geen tweede keer,
  niet na `geldig_tot`. Test: `crm-regels/test-accorderen.mjs`.
- `geldig_tot`: `LINK_GELDIG_DAGEN` dagen na versturen (`null` = geen einde).
- Het CRM zet het antwoord over naar `specs` (`verwerkAntwoorden()`) zodra
  een pagina `specs` leest: Accordering en Urenstaten in `admin.html`,
  `verstuur.html`, `factuur.html`, `hub.html`. Akkoord: `akkoord_methode:
  'link'`, `akkoord_datum` = het moment van de server, en de
  urenstaat-snapshot rekent het CRM zelf uit uit `specs` (vroeger stuurde de
  browser van de klant hem mee). Tot René het CRM opent, staat het akkoord
  dus alleen in `accorderingen`, met het juiste tijdstip.
- Handmatig akkoord sluit de link (`status: 'gesloten'`); een specificatie
  verwijderen in `verstuur.html` verwijdert ook de link. Afgekeurd is ook
  definitief voor die link: na correctie opnieuw versturen (nieuwe link).
- De link werkt 60 dagen (`LINK_GELDIG_DAGEN`, bovenin `accorderen.js`):
  elk akkoord kwam tot nu toe binnen 6 dagen, en na twee maanden is de
  specificatie gefactureerd. Een doorgestuurde mail geeft de ontvanger
  dezelfde mogelijkheden; bewust geaccepteerd (René, 5 oktober 2026):
  doorsturen binnen het bedrijf van de klant is de normale route naar wie
  tekent.
- Oude links met `?id=` werken niet meer; de pagina zegt dan "ongeldig of
  verlopen". Op 5 oktober 2026 stond er geen enkele specificatie open: alle
  vijf waren geaccordeerd en gefactureerd.

### Nog te doen: René loopt het pad één keer zelf na

Uitgerold op 5 oktober 2026. In productie getest zonder inloggen (met
testdocumenten, daarna verwijderd): lezen en accorderen met het eigen token,
ook via de echte pagina; geweigerd zonder token, met een verzonnen of verlopen
token, met een eigen tijd, met een extra veld, en een tweede keer. Niet te
testen zonder inloggen, dus voor René:

1. **CRM rechtsboven `v162-accorderen`.** Anders Ctrl+F5.
2. **Een document openen** op een klantkaart. Moet gewoon openen. Fout
   `storage/unauthorized` of een lege pagina: Storage-regels; terugzetten kan
   (zie `supplychainmeneer/crm-regels/LEESMIJ.md`).
3. **Een document uploaden** op een klantkaart. Melding "Geen rechten voor
   Firebase Storage": eerst opnieuw inloggen; blijft het, dan de regels.
4. **Een nieuwsafbeelding uploaden** op een bericht dat als concept staat.
   Zelfde betekenis bij een fout.
5. **Eén echte specificatie naar jezelf** (Verstuur, eigen e-mailadres): de
   melding "Verstuurd naar …" en de mail komt binnen met de knoppen. Komt er
   een foutmelding vóór het versturen, dan is de link niet aangemaakt en is
   er ook geen mail weg.
6. **De link openen in een venster waar je niet bent ingelogd** (privévenster).
   Je ziet de specificatie, geen inlogscherm. "Ongeldig of verlopen": de link
   klopt niet met wat er in `accorderingen` staat. Een inlogscherm: de
   browser heeft de oude pagina; Ctrl+F5.
7. **Akkoord geven.** "Akkoord ontvangen" met datum en tijd. Link opnieuw
   openen: "Al geaccordeerd op <datum> om <tijd>".
8. **Terugzien in het CRM** (Accordering, of de geschiedenis in Verstuur):
   de specificatie staat op akkoord met **het tijdstip van stap 7**, niet het
   moment waarop je het CRM opende. Staat hij nog op "Wacht": F12 → Console,
   regel "Antwoorden van klanten niet verwerkt".
9. **Opruimen:** de testspecificatie verwijderen in de geschiedenis van
   Verstuur (de link gaat mee), zodat hij niet bij de facturen komt.

**Als het misgaat staat er niets vast.** Handmatig accorderen in het CRM
(Accordering → "Handmatig akkoord") werkt zoals altijd, met een notitie, en
sluit de link. Let op: die knop wordt pas actief **3 werkdagen** na het
versturen; tot dan kan de specificatie ook als PDF of in een gewone mail
akkoord krijgen. Terugzetten van de regels: `LEESMIJ.md` in `crm-regels/`.

### De urenstaat-snapshot rekent het CRM uit, niet de klant — niet terugdraaien

Bij een akkoord legt `specs.urenstaat_snapshot` vast welke uren er
geaccordeerd zijn: per dag de netto minuten en km, en de totalen. Dat is wat
René factureert en wat hij laat zien als er discussie komt. Tot oktober 2026
rekende `accordeer.html` die snapshot uit **in de browser van de klant** en
schreef hem zo weg: het bewijs van het akkoord kwam van de partij die er
belang bij heeft, en kon met een aangepast verzoek elke inhoud krijgen.

Nu schrijft de klant alleen `status` en (via de server) het tijdstip. Het CRM
rekent de snapshot zelf uit uit `specs.regels` (`bouwSnapshot()` in
`accorderen.js`, dezelfde berekening als het handmatig akkoord), op het
moment dat het het antwoord overzet. De Firestore-regel laat de klant geen
ander veld schrijven. Zet de berekening dus **nooit** terug naar
`accordeer.html`, ook niet "om het simpeler te maken": dan wordt het bewijs
weer door de klant aangeleverd.

## Nieuwsberichten (CRM → Nieuwsberichten)

Collectie `site_nieuws`. `tekst` is platte tekst van **maximaal 1000 tekens**
(`maxlength` en controle in `saveNieuwsbericht`; de Firestore-regels
controleren geen lengte), met een teller. Richtlijn: twee tot drie alinea's.
Nieuws is kort en gedateerd; een langer, inhoudelijk verhaal hoort in de
blog. Houd dat onderscheid vast.

**Witregel = nieuwe alinea.** Een lege regel in het tekstvak wordt op de site
een eigen `<p>`; één losse Enter niet (die wordt een spatie). Het overzicht in
het CRM splitst met `nieuwsAlineas()`, gelijk aan `alineas()` in
`supplychainmeneer/src/lib/inhoud.mjs`; wijzig ze samen. Geen HTML: opmaak
zoals `<b>` komt op de site als tekst. Op de homepage ziet een bezoeker
de eerste 5 regels in een kaart (gemeten 130–180 tekens, afhankelijk van de
schermbreedte) met "Lees verder" naar de eigen pagina van het bericht
(`/nieuws/<slug>/`); het overzicht `/nieuws/` kapt op dezelfde manier af.

### Adres van een nieuwsbericht (sinds v161)

Elk bericht heeft een eigen pagina op `supplychainmeneer.nl/nieuws/<slug>/`.
Veld `slug` in `site_nieuws`. Vóór het eerste opslaan is het adres een
invulveld: het voorstel volgt de titel (`nieuwsSlugVan()`) tot René het zelf
aanpast, bijvoorbeeld inkort (kort is beter om te plakken en te mailen:
`nieuwe-website`, niet de hele titel). Wat hij typt wordt bij het verlaten
van het veld netjes gemaakt (kleine letters, streepjes). Bij het **eerste
opslaan** ligt het vast en verandert daarna nooit meer, ook niet als de
titel verandert, zodat gedeelde links blijven werken; het venster zegt dat.
Dubbel (ook met een concept): bij het voorstel `-2`, `-3`, …
(`uniekeNieuwsSlug()`, na het opnieuw laden van de lijst); een zelf getypt
adres dat al bestaat wordt geweigerd met een melding. Een bericht zonder
slug krijgt er een bij de eerstvolgende keer opslaan. Niet zelf aanpassen in
de Firestore-console: een gewijzigde slug breekt de links die al rondgaan.

### Afbeelding bij een nieuwsbericht (sinds v160)

Optioneel. Twee velden in `site_nieuws`, allebei `null` als er geen beeld is:

| Veld | Betekenis |
|---|---|
| `afbeelding` | Download-adres (`getDownloadURL`) van het bestand in Storage |
| `afbeelding_alt` | Wat er op het beeld staat. Verplicht zodra er een afbeelding is |

Toevoegen: in het venster van het bericht "Afbeelding kiezen" (JPG, PNG of
WebP, **tot 20 MB**). De browser verkleint de foto meteen (`nbVerklein()`:
lange zijde hooguit 2000 px, JPEG, EXIF-stand rechtgezet, transparantie wit;
een telefoonfoto wordt ~400 kB) en toont een voorvertoning in 4:3. Uploaden
gebeurt pas bij Opslaan, naar `blog-afbeeldingen/nieuws-<tijd>-<titel>.jpg`
(die map heeft al een Storage-regel: lezen openbaar, schrijven ingelogd; een
eigen map zou een wijziging van de Storage-regels vragen). Annuleren laat
dus niets achter in Storage. Weghalen: "Afbeelding weghalen" en Opslaan.
Bij vervangen, weghalen of het bericht verwijderen ruimt het CRM het oude
bestand op, maar alleen bestanden met `nieuws-` in de naam (`nbAfbPad()`),
nooit een blogcover.

Alt-tekst: één regel uitleg staat in het scherm (beschrijf wat er te zien is;
staat er tekst in het beeld, typ die over). Leeg of een nietszeggend woord
(`NB_ALT_NIETSZEGGEND`: "afbeelding", "foto", …) weigert het opslaan.

Op de site: in de lijsten (homepage, `/nieuws/`) altijd **4:3, bijgesneden
vanuit het midden**; op de eigen pagina van het bericht heel, niet bijgesneden. De site haalt het
beeld bij de build op en maakt er zelf AVIF/WebP van; de bezoeker krijgt het
origineel uit Storage nooit te zien. Lukt dat niet (weg, onleesbaar, groter
dan 5 MB), dan verschijnt het bericht zonder beeld. Details:
`supplychainmeneer/CLAUDE.md`, "Afbeelding bij een nieuwsbericht".

**Nog te doen: de eerste upload nalopen.** Uploaden is niet van begin tot
eind getest (daarvoor moet je ingelogd zijn); verkleinen, voorvertoning en de
controle op de alt-tekst wel. René test het op een bericht dat als
**concept** staat:

1. Rechtsboven staat `v160-nieuws-afbeelding`. Staat er nog v159: de browser
   heeft de oude pagina; Ctrl+F5.
2. Afbeelding kiezen, alt invullen, Opslaan. Verwacht: "Afbeelding
   uploaden…", dan "Bericht opgeslagen ✓", en in de lijst een klein beeld
   rechts bij het bericht.
3. Gaat het mis, dan staat de reden in de rode balk in het venster. Met
   `storage/unauthorized` erin: niet (meer) ingelogd, of de Storage-regel
   voor `blog-afbeeldingen/` is veranderd (`supplychainmeneer/crm-regels/storage.rules`).
   Anders: F12 → Console, de regel die begint met "Nieuwsbericht opslaan
   mislukt". Het bericht is dan niet opgeslagen; een half geüpload beeld
   ruimt het CRM zelf op.
4. Controleren in de Firebase-console (Storage, `blog-afbeeldingen/`): er
   staat één bestand `nieuws-<tijd>-<titel>.jpg` van een paar honderd kB.
5. Weghalen en opslaan: het bestand verdwijnt uit Storage. Blijft het staan,
   dan staat er in de console "Oude nieuwsafbeelding niet verwijderd"; het
   bericht is wel goed opgeslagen, het bestand kan met de hand weg.
6. Op de site (pas na publiceren en de eerstvolgende build, of de handknop
   in GitHub Actions): geen beeld bij het bericht? Dan staat in de log van
   die run een regel `nieuwsbericht <document-id>: <reden>; verschijnt
   zonder afbeelding`.

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

## Dicteren met de Spreek-knop (v163)

De 🎤 Spreek-knop in "Gesprek toevoegen" gebruikt de spraakherkenning van de
browser (`dictaat.js`). Tot v162 plakte elk resultaat zijn tekst achter het
veld; Chrome op Android stuurt dezelfde tekst vaker (ook als definitief, en
als herhaling met verlenging), dus kreeg René "heeft geen antwoord gehad
heeft geen antwoord gehad …".

Nu wordt de gedicteerde tekst bij **elk** resultaat opnieuw opgebouwd en
vervangen: basis (wat er bij het starten stond, met opmaak, onaangeroerd) +
alle definitieve resultaten + het tussentijdse. Dat staat in één `<span
data-dictaat>` achteraan; bij stoppen blijft alleen de definitieve tekst over
en wordt de span gewone tekst. Een stuk dat het einde van wat er al staat
herhaalt (geheel of met verlenging) vervangt dat einde (`dictaatTekst()`).
Tijdens een compositie van het toetsenbord wordt het veld niet aangeraakt.
`continuous` blijft aan (geen pauzes tussen zinnen); stopt de browser zelf,
dan start hij meteen opnieuw. **Nooit terug naar aanplakken.** Opslaan of
sluiten tijdens het dictaat breekt het af; de definitieve tekst blijft.

Bewuste grens: een losse herhaling van alleen de laatste woorden ("… waarom
niet" gevolgd door "waarom niet") komt er wel twee keer in; die zou niet te
onderscheiden zijn van iemand die echt iets herhaalt.

**Modal boven het toetsenbord.** `volgToetsenbord(overlay, editor)` (bij
`cursorInBeeld`) is de ene oplossing voor modals met een schrijfveld op de
telefoon: blog-editor en beide gespreksvensters. Chrome op Android verkleint
`vh`/`dvh` niet als het toetsenbord opengaat; de functie zet de hoogte van
`visualViewport` op de overlay (klasse `modal-vv`), zodat kop en knoppenrij
(met het vinkje "Tekst nog nakijken") in beeld blijven en alleen het midden
scrolt. Een nieuwe modal met schrijfveld: deze functie gebruiken, niet een
tweede variant schrijven. Opbouw van de modal: kop, midden met
`overflow-y:auto;flex:1;min-height:0`, knoppenrij, in een flex-kolom.

## Eigen .js-modules en de cache (v163)

Een los .js-bestand kan uit de cache komen terwijl de topbar al de nieuwe
versie toont; dan lijkt een fix niet te werken. De regel:

- **Een module die door één pagina wordt geïmporteerd** krijgt
  `?v=<versie>` in het importpad, en dat nummer gaat omhoog (naar de versie
  van dat moment) bij elke wijziging aan dat bestand. Daar kan geen
  verschil in nummer ontstaan. Nu: `dictaat.js` en `ballon-keuze.js`
  (allebei alleen in `admin.html`, nu `?v=163`).
- **Een module die door meerdere pagina's wordt geïmporteerd** krijgt
  **géén** versie. Eén pagina met een ander nummer laadt hetzelfde bestand
  als een aparte module; bij `erp-auth.js` zou dat de inlogstatus dubbel
  geven. Na een wijziging daar: op elke pagina die hem gebruikt een harde
  ververssing (Ctrl+F5). Nu: `accorderen.js` (`admin.html`,
  `verstuur.html`, `factuur.html`, `hub.html`) en `erp-auth.js` (bijna
  alle pagina's).

Gaat een module van één naar meerdere pagina's, dan haal je de versie weg.
