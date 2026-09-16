// Gedeelde authenticatie voor het ERP (start.html, admin.html, scm.html).
//
// Firebase Authentication (Identity Platform) met e-mail + wachtwoord en een
// verplichte tweede factor via een authenticator-app (TOTP). De sessie staat
// in IndexedDB per origin, dus één keer inloggen op start.html geldt voor
// alle pagina's op rene-linden.github.io.
//
// Alleen start.html toont het inlogformulier. De andere pagina's roepen
// requireAuth() aan: geen sessie, of nog geen tweede factor ingericht, dan
// terug naar start.html; anders krijgen ze de gebruiker en gaan ze verder.

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  multiFactor, TotpMultiFactorGenerator, getMultiFactorResolver,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

export const FB = {
  apiKey: "AIzaSyBW4shtJ-2UlPMg1tHs3GUrNhfg6ocKxjY",
  authDomain: "dagstaat-ordinatio.firebaseapp.com",
  projectId: "dagstaat-ordinatio",
  storageBucket: "dagstaat-ordinatio.firebasestorage.app",
  messagingSenderId: "841107130686",
  appId: "1:841107130686:web:f91211f83a8e031746846f",
};

export const fbApp = getApps().length ? getApp() : initializeApp(FB);
export const auth = getAuth(fbApp);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const NAAM_TWEEDE_FACTOR = 'Authenticator-app';

/** Heeft deze gebruiker de tweede factor (TOTP) ingericht? */
export function heeftTweedeFactor(user) {
  return multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

/**
 * Voor admin.html en scm.html: wacht op de sessie. Zonder sessie of zonder
 * tweede factor → naar start.html, met de huidige pagina als terugadres.
 */
export function requireAuth(onReady) {
  onAuthStateChanged(auth, (user) => {
    if (!user || !heeftTweedeFactor(user)) {
      const hier = location.pathname.split('/').pop() + location.search + location.hash;
      location.replace('start.html?naar=' + encodeURIComponent(hier));
      return;
    }
    onReady(user);
  });
}

export async function logout() {
  await signOut(auth);
  try { sessionStorage.clear(); } catch (e) { /* niets */ }
  location.href = 'start.html';
}

/**
 * Stap 1 van inloggen. Levert:
 *  - { status: 'ok', user }          wachtwoord goed, nog geen tweede factor ingericht
 *  - { status: 'mfa', resolver }     wachtwoord goed, code uit de app nodig
 * Gooit bij een fout wachtwoord.
 */
export async function inloggen(email, wachtwoord) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, wachtwoord);
    return { status: 'ok', user: cred.user };
  } catch (e) {
    if (e.code === 'auth/multi-factor-auth-required') {
      return { status: 'mfa', resolver: getMultiFactorResolver(auth, e) };
    }
    throw e;
  }
}

/** Stap 2: de code uit de authenticator-app. */
export async function bevestigCode(resolver, code) {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error('Geen authenticator-app gekoppeld aan dit account');
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s+/g, ''));
  const cred = await resolver.resolveSignIn(assertion);
  return cred.user;
}

/** Inschrijven: geheim aanmaken; levert het geheim en de otpauth-URL voor de QR-code. */
export async function startInschrijving(user) {
  const sessie = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(sessie);
  return {
    secret,
    uri: secret.generateQrCodeUrl(user.email, 'Ordinatio ERP'),
    sleutel: secret.secretKey,
  };
}

/** Inschrijven afronden met de eerste code uit de app. */
export async function rondInschrijvingAf(user, secret, code) {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s+/g, ''));
  await multiFactor(user).enroll(assertion, NAAM_TWEEDE_FACTOR);
}

export function wachtwoordVergeten(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Leesbare tekst bij Firebase-foutcodes. */
export function foutTekst(e) {
  switch (e && e.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mailadres of wachtwoord onjuist';
    case 'auth/invalid-email': return 'Ongeldig e-mailadres';
    case 'auth/too-many-requests': return 'Te veel pogingen; probeer het later opnieuw';
    case 'auth/invalid-verification-code': return 'Code onjuist of verlopen';
    case 'auth/totp-challenge-timeout': return 'Te lang gewacht; log opnieuw in';
    case 'auth/requires-recent-login': return 'Log opnieuw in om dit te doen';
    case 'auth/unverified-email': return 'E-mailadres is nog niet geverifieerd';
    case 'auth/network-request-failed': return 'Geen verbinding';
    default: return (e && e.message) || 'Er ging iets mis';
  }
}
