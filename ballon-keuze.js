// ═══════════════════════════════════════════════════════
// TEKSTBALLON — welke regel staat op de site (v158)
// ═══════════════════════════════════════════════════════
// De keuzeregel, woordelijk gelijk aan CLAUDE.md hier en in de websiterepo
// (supplychainmeneer), want de site moet precies kiezen wat het CRM laat zien:
//
//   Van alle regels met actief = true waarvan de periode vandaag loopt, wint
//   die met de laatste begindatum. Is dat gelijk, dan wint de laatst
//   gewijzigde. Loopt er vandaag geen enkele regel, dan is er geen ballon.
//   Een gat tussen twee perioden is een echt gat: dan verschijnt er niets.
//
// Uitwerking (zie CLAUDE.md): vanaf/tot zijn "YYYY-MM-DD" of '' en beide
// inclusief; '' = open aan die kant. Een lege vanaf telt als vroegste
// begindatum. "Laatst gewijzigd" = bijgewerkt (ISO-tijd). Een regel zonder
// tekst of met een ongeldige datum loopt nooit. Alles puur, zonder Firestore,
// zodat het los te testen is.

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_EINDE = '9999-12-31';

function grensOk(w) {
  return w === undefined || w === null || w === '' || (typeof w === 'string' && DATUM.test(w));
}

// Kan deze regel ooit op de site komen? (actief, tekst, geldige data)
export function doetMee(b) {
  return !!b && b.actief === true
    && typeof b.tekst === 'string' && b.tekst.trim() !== ''
    && grensOk(b.vanaf) && grensOk(b.tot);
}

export function looptOp(b, dag) {
  return doetMee(b) && (!b.vanaf || b.vanaf <= dag) && (!b.tot || b.tot >= dag);
}

// Sorteervolgorde van de keuzeregel: negatief = a wint van b.
export function vergelijk(a, b) {
  const va = a.vanaf || '', vb = b.vanaf || '';
  if (va !== vb) return va > vb ? -1 : 1;
  const ba = String(a.bijgewerkt || ''), bb = String(b.bijgewerkt || '');
  if (ba !== bb) return ba > bb ? -1 : 1;
  return String(a.id || '') < String(b.id || '') ? -1 : 1;
}

// De regel die op `dag` op de site hoort, of null.
export function kiesBallon(regels, dag) {
  return regels.filter(b => looptOp(b, dag)).sort(vergelijk)[0] || null;
}

export function loptAltijd(b) {
  return !b.vanaf && !b.tot;
}

export function volgendeDag(iso) { return verschuif(iso, 1); }
export function vorigeDag(iso) { return verschuif(iso, -1); }
function verschuif(iso, n) {
  const [j, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, d + n)).toISOString().slice(0, 10);
}

// Gaten vanaf `dag`: perioden waarin geen enkele regel loopt, gevolgd door
// een regel die weer begint. { van, tot, regelId } met regelId = de regel die
// na het gat begint. `eindeId`/`einde` = de laatste dag waarop nog iets loopt
// als daarna niets meer komt (anders null).
export function gaten(regels, dag) {
  const perioden = regels
    .filter(b => doetMee(b) && (!b.tot || b.tot >= dag))
    .map(b => ({ b, van: b.vanaf && b.vanaf > dag ? b.vanaf : dag, tot: b.tot || OPEN_EINDE }))
    .sort((x, y) => (x.van < y.van ? -1 : x.van > y.van ? 1 : vergelijk(x.b, y.b)));
  const lijst = [];
  let eindTot = null;
  for (const p of perioden) {
    if (eindTot === null) {
      if (p.van > dag) lijst.push({ van: dag, tot: vorigeDag(p.van), regelId: p.b.id });
      eindTot = p.tot;
    } else if (eindTot !== OPEN_EINDE && p.van > volgendeDag(eindTot)) {
      lijst.push({ van: volgendeDag(eindTot), tot: vorigeDag(p.van), regelId: p.b.id });
      eindTot = p.tot;
    } else if (p.tot > eindTot) {
      eindTot = p.tot;
    }
  }
  let eindeId = null;
  if (eindTot !== null && eindTot !== OPEN_EINDE) {
    const laatste = perioden.filter(p => p.tot === eindTot).map(p => p.b).sort(vergelijk)[0];
    eindeId = laatste ? laatste.id : null;
  }
  return { lijst, einde: eindeId ? eindTot : null, eindeId };
}

// Paren regels die elkaar (vandaag of later) overlappen, met de winnaar.
// Een regel zonder data overlapt alles; die heeft een eigen melding en doet
// hier niet mee.
export function overlappen(regels, dag) {
  const mee = regels.filter(b => doetMee(b) && !loptAltijd(b) && (!b.tot || b.tot >= dag));
  const paren = [];
  for (let i = 0; i < mee.length; i++) {
    for (let j = i + 1; j < mee.length; j++) {
      const a = mee[i], b = mee[j];
      const van = [a.vanaf || '', b.vanaf || '', dag].sort().pop();
      const tot = [a.tot || OPEN_EINDE, b.tot || OPEN_EINDE].sort()[0];
      if (van > tot) continue;
      const winnaar = vergelijk(a, b) < 0 ? a : b;
      const reden = (a.vanaf || '') !== (b.vanaf || '') ? 'begint later' : 'is later gewijzigd';
      paren.push({ a, b, van, tot: tot === OPEN_EINDE ? null : tot, winnaar, reden });
    }
  }
  return paren;
}
