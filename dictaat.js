// ═══════════════════════════════════════════════════════
// DICTEREN met de Spreek-knop (v163)
// ═══════════════════════════════════════════════════════
// Tot v162 plakte elk resultaat van de spraakherkenning zijn tekst achter
// het veld. Chrome op Android stuurt hetzelfde stuk tekst echter vaker dan
// één keer, ook als definitief resultaat, en vaak als herhaling met
// verlenging ("heeft geen antwoord gehad", "heeft geen antwoord gehad op de
// vraag"). Aanplakken gaf dan "heeft geen antwoord gehad heeft geen antwoord
// gehad …".
//
// Nu wordt de gedicteerde tekst bij elk resultaat opnieuw opgebouwd en
// vervangen, nooit aangeplakt:
//
//   veld = basis + alle definitieve resultaten tot nu toe + het tussentijdse
//
// De basis (wat er bij het starten in het veld stond, met opmaak) blijft
// onaangeroerd; de gedicteerde tekst staat in één eigen <span> achteraan,
// en alleen die wordt telkens vervangen. Bij het stoppen blijft alleen de
// definitieve tekst staan en wordt de span gewone tekst.
//
// Continuous blijft aan: geen pauzes tussen zinnen. Stopt de browser zelf
// (dat doet Chrome na een stilte), dan start het dictaat meteen opnieuw; de
// definitieve tekst van die sessie gaat mee als vastgelegd.

const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Begint `s` met `kop`, op een woordgrens?
function begintMet(s, kop) {
  return s === kop || s.startsWith(kop + ' ');
}

// Voeg één nieuw stuk toe aan de lijst. Herhaalt het nieuwe stuk het einde
// van wat er al staat (één of meer stukken achteraan) en gaat het daarna
// verder, dan vervangt het die stukken. Een stuk dat precies gelijk is aan
// het vorige vervangt dat dus ook: dezelfde zin twee keer komt er één keer in.
function voegToe(lijst, stuk) {
  const s = norm(stuk);
  if (!s) return;
  for (let k = 0; k < lijst.length; k++) {
    if (begintMet(norm(stuk), norm(lijst.slice(k).join(' ')))) {
      lijst.splice(k, lijst.length - k, stuk.trim());
      return;
    }
  }
  lijst.push(stuk.trim());
}

// De tekst van het dictaat uit de definitieve stukken (in volgorde van
// binnenkomst) en het tussentijdse resultaat (mag leeg zijn).
export function dictaatTekst(definitief, tussen = '') {
  const lijst = [];
  for (const d of definitief) voegToe(lijst, d);
  const t = norm(tussen);
  if (t) {
    // Herhaalt het tussentijdse resultaat alleen een deel van wat al
    // definitief is, dan voegt het niets toe.
    const staart = k => norm(lijst.slice(k).join(' '));
    const alHerhaling = lijst.some((_, k) => begintMet(staart(k), t));
    if (!alHerhaling) voegToe(lijst, tussen);
  }
  return lijst.join(' ');
}

// Start een dictaat in een contenteditable-veld.
//   doel   het veld
//   SR     SpeechRecognition (of webkitSpeechRecognition)
//   opties.opFout(code)  een fout waardoor het dictaat stopt
//   opties.opEinde()     het dictaat is afgerond (knop terugzetten)
//   opties.opTekst()     het veld is bijgewerkt (bijv. cursor in beeld)
export function startDictaat(doel, SR, opties = {}) {
  const rec = new SR();
  rec.lang = 'nl-NL';
  rec.continuous = true;
  rec.interimResults = true;

  // Wat er al stond, krijgt een spatie achter zich als dat nodig is
  const bestaand = doel.textContent || '';
  const scheiding = bestaand && !/\s$/.test(bestaand) ? ' ' : '';
  const span = document.createElement('span');
  span.setAttribute('data-dictaat', '');
  doel.appendChild(span);

  let vastgelegd = [];   // definitieve stukken uit eerdere sessies
  let sessie = [];       // per index uit event.results: { tekst, definitief }
  let actief = true;     // nog aan het luisteren (of herstartend)
  let klaar = false;
  let compositie = false;
  let reserve = null;

  const definitief = () => vastgelegd.concat(sessie.filter(r => r && r.definitief).map(r => r.tekst));
  const tussen = () => sessie.filter(r => r && !r.definitief).map(r => r.tekst).join(' ');

  function zet(tekst) {
    if (!span.isConnected) doel.appendChild(span);   // weggehaald tijdens het dictaat
    const nieuw = tekst ? scheiding + tekst : '';
    if (span.textContent !== nieuw) span.textContent = nieuw;
  }

  // Raak het veld niet aan zolang het toetsenbord nog een woord aan het
  // samenstellen is; na compositionend volgt de laatste stand alsnog.
  function toon() {
    if (klaar || compositie) return;
    zet(dictaatTekst(definitief(), tussen()));
    if (opties.opTekst) opties.opTekst();
  }
  const compStart = () => { compositie = true; };
  const compEind = () => { compositie = false; toon(); };
  doel.addEventListener('compositionstart', compStart);
  doel.addEventListener('compositionend', compEind);

  rec.onresult = (event) => {
    // Resultaten onder resultIndex zijn sinds het vorige event niet
    // veranderd; vanaf resultIndex vervangen we wat we hadden.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      sessie[i] = { tekst: r[0].transcript, definitief: r.isFinal };
    }
    sessie.length = event.results.length;
    toon();
  };

  rec.onerror = (e) => {
    // Stilte of een herstart: gewoon doorgaan (onend start opnieuw)
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    actief = false;
    if (opties.opFout) opties.opFout(e.error);
  };

  rec.onend = () => {
    // De definitieve tekst van deze sessie vastleggen; een tussentijds
    // resultaat dat nooit definitief werd, vervalt.
    vastgelegd = definitief();
    sessie = [];
    if (actief && !klaar) {
      try { rec.start(); toon(); return; } catch (e) { actief = false; }
    }
    afronden();
  };

  function afronden() {
    if (klaar) return;
    clearTimeout(reserve);
    compositie = false;
    zet(dictaatTekst(definitief()));
    klaar = true;
    rec.onresult = rec.onerror = rec.onend = null;
    doel.removeEventListener('compositionstart', compStart);
    doel.removeEventListener('compositionend', compEind);
    // De span wordt gewone tekst; lege span weg
    if (span.isConnected) {
      if (span.textContent) span.replaceWith(document.createTextNode(span.textContent));
      else span.remove();
      doel.normalize();
    }
    if (opties.opEinde) opties.opEinde();
  }

  rec.start();

  return {
    get actief() { return !klaar; },
    // Netjes stoppen: de browser stuurt nog het laatste definitieve
    // resultaat, daarna onend. Komt die niet, dan na 2 seconden zelf.
    stop() {
      if (klaar) return;
      actief = false;
      try { rec.stop(); } catch (e) { afronden(); return; }
      reserve = setTimeout(afronden, 2000);
    },
    // Meteen stoppen (sluiten of opslaan van het venster): wat definitief
    // is blijft staan, de rest vervalt.
    afbreken() {
      if (klaar) return;
      actief = false;
      try { rec.abort(); } catch (e) {}
      afronden();
    },
  };
}
