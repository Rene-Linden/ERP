// ═══════════════════════════════════════
// ACCORDEREN VIA EEN LINK — zonder inloggen (oktober 2026)
// ═══════════════════════════════════════
// Een klant accordeert zijn urenspecificatie via accordeer.html?t=<token>.
// specs blijft alleen voor de eigenaar. Bij het versturen maakt het CRM een
// apart document accorderingen/<token> met alleen wat de klant moet zien
// (klant, periode, urenregels, totaal). De Firestore-regel
// (supplychainmeneer/crm-regels/firestore.rules) laat zonder inloggen toe:
//   - dat ene document lezen als je het token kent (niet opsommen);
//   - één keer status 'open' → 'akkoord' of 'afgekeurd' (met opmerking),
//     met beantwoord_op = de tijd van de server (serverTimestamp);
//   - zolang geldig_tot niet voorbij is (null = geen einde).
// Verder niets. Het CRM zet het antwoord daarna over naar specs
// (verwerkAntwoorden) en rekent de urenstaat-snapshot zelf uit, uit specs:
// niet uit iets wat de klant meestuurt.
//
// Velden van accorderingen/<token>: spec_id, klant, maand (0-11), jaar,
// regels [{date, start, end, brk}], totaal_mins, status ('open' | 'akkoord' |
// 'afgekeurd' | 'gesloten'), beantwoord_op (timestamp|null), opmerking
// (string|null), geldig_tot (timestamp|null), verwerkt (boolean),
// aangemaakt (timestamp).

import{doc,getDoc,setDoc,updateDoc,deleteDoc,collection,query,where,getDocs,serverTimestamp,Timestamp}from'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Hoe lang een link werkt, in dagen na versturen. null = geen einde.
// Keuze van René (zie CLAUDE.md, "Accorderen via een link").
export const LINK_GELDIG_DAGEN = 60;

const LINK_BASIS = 'https://rene-linden.github.io/ERP/accordeer.html';

// 32 willekeurige bytes uit de cryptografische generator van de browser,
// als base64url: 43 tekens. Niet af te leiden uit klant, periode of
// document-id.
export function maakToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function accordeerLinks(token) {
  const t = encodeURIComponent(token);
  return { akkoord: `${LINK_BASIS}?t=${t}`, afkeuren: `${LINK_BASIS}?t=${t}&actie=afkeuren` };
}

// Nieuwe accordering bij een net opgeslagen spec. Geeft het token.
export async function maakAccordering(db, specId, spec) {
  const token = maakToken();
  const regels = (spec.regels || []).map(r => ({ date: r.date, start: r.start || '', end: r.end || '', brk: parseInt(r.brk) || 0 }));
  const geldigTot = LINK_GELDIG_DAGEN == null ? null
    : Timestamp.fromMillis(Date.now() + LINK_GELDIG_DAGEN * 86400000);
  await setDoc(doc(db, 'accorderingen', token), {
    spec_id: specId,
    klant: spec.klant || '',
    maand: spec.maand,
    jaar: spec.jaar,
    regels,
    totaal_mins: spec.totaal_mins || 0,
    status: 'open',
    beantwoord_op: null,
    opmerking: null,
    geldig_tot: geldigTot,
    verwerkt: false,
    aangemaakt: serverTimestamp()
  });
  return token;
}

// Link dichtzetten (handmatig akkoord, spec verwijderd): daarna kan de klant
// er niets meer mee. Bestaat het document niet (meer), dan is er niets te doen.
export async function sluitAccordering(db, token) {
  if (!token) return;
  try { await updateDoc(doc(db, 'accorderingen', token), { status: 'gesloten', verwerkt: true }); }
  catch (e) { if (e.code !== 'not-found') throw e; }
}

export async function verwijderAccordering(db, token) {
  if (token) await deleteDoc(doc(db, 'accorderingen', token));
}

function tMins(t) { if (!t) return 0; const [h, m] = String(t).split(':').map(Number); return h * 60 + m; }

// Urenstaat-snapshot: alle dagen van de maand, netto minuten en km per dag.
// Dezelfde berekening als het handmatig akkoord in admin.html.
export function bouwSnapshot(spec, akkoordIso, methode, notitie) {
  const perDag = {};
  (spec.regels || []).forEach(r => {
    if (!perDag[r.date]) perDag[r.date] = { mins: 0, km: 0 };
    perDag[r.date].mins += Math.max(0, (tMins(r.end) - tMins(r.start)) - (parseInt(r.brk) || 0));
    perDag[r.date].km += (parseInt(r.km) || 0);
  });
  const dagen = new Date(spec.jaar, spec.maand + 1, 0).getDate();
  const regels = [];
  for (let d = 1; d <= dagen; d++) {
    const iso = `${spec.jaar}-${String(spec.maand + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    regels.push({ date: iso, mins: perDag[iso] ? perDag[iso].mins : 0, km: perDag[iso] ? perDag[iso].km : 0 });
  }
  const snap = {
    regels,
    totaal_mins: regels.reduce((s, r) => s + r.mins, 0),
    totaal_km: regels.reduce((s, r) => s + r.km, 0),
    akkoord_email: spec.email || '',
    akkoord_datum: akkoordIso
  };
  if (methode) snap.akkoord_methode = methode;
  if (notitie !== undefined) snap.akkoord_notitie = notitie;
  return snap;
}

// Antwoorden van klanten overzetten naar specs. Roep aan vóór een pagina
// specs leest. Geeft het aantal verwerkte antwoorden.
export async function verwerkAntwoorden(db) {
  const snap = await getDocs(query(collection(db, 'accorderingen'), where('verwerkt', '==', false)));
  let n = 0;
  for (const a of snap.docs) {
    const d = a.data();
    if (d.status !== 'akkoord' && d.status !== 'afgekeurd') continue;
    const specRef = doc(db, 'specs', d.spec_id);
    const specSnap = await getDoc(specRef);
    if (specSnap.exists()) {
      const spec = specSnap.data();
      const iso = d.beantwoord_op && d.beantwoord_op.toDate ? d.beantwoord_op.toDate().toISOString() : new Date().toISOString();
      if (d.status === 'akkoord' && !spec.akkoord) {
        await updateDoc(specRef, {
          akkoord: true,
          akkoord_datum: iso,
          akkoord_methode: 'link',
          akkoord_ip: 'link',
          urenstaat_snapshot: bouwSnapshot(spec, iso, 'link')
        });
      } else if (d.status === 'afgekeurd') {
        await updateDoc(specRef, { afgekeurd: true, afgekeurd_datum: iso, afgekeurd_opmerking: d.opmerking || '' });
      }
    }
    await updateDoc(a.ref, { verwerkt: true });
    n++;
  }
  return n;
}
