// ─────────────────────────────────────────────────────────────────
// Livo — real Google (Gmail) sign-in via Supabase Auth.
//
// NATIVE ONLY (2026-11-25) — the user wants sign-in to stay 100%
// inside the app: NO browser opens during login, ever. The old
// browser fallback (Supabase signInWithOAuth + expo-web-browser)
// was REMOVED 2026-11-25.
//
//   @react-native-google-signin/google-signin shows the native
//   Android account picker ("to continue to Livo") and returns
//   an ID token; supabase.auth.signInWithIdToken({ provider:
//   'google', token }) turns it into a Supabase session. Needs
//   (a) an APK built WITH the native module and (b) the real Web
//   client ID in app.json extra.googleOAuth.webClientId, from the
//   Google Cloud project that owns the Supabase Google provider
//   — with an Android OAuth client for com.livo.app + the signing
//   SHA-1 in that project, or Google answers DEVELOPER_ERROR and
//   the login screen shows "Google sign-in isn't set up for this
//   app yet." There is NO browser fallback any more: until the
//   Android OAuth client exists, login cannot succeed — the
//   Google Cloud console step is the only fix.
//
// The native module is LAZY-required inside signInWithGoogleNative
// (never a top-level import): the library calls
// TurboModuleRegistry.getEnforcing('RNGoogleSignin') at import
// time, which throws on APKs built before the module was added —
// an OTA carrying this file to an older APK returns the "isn't
// set up yet" error instead of crashing the app.
//
// CONSOLE SETUP (done 2026-11-23):
//   • Google Cloud Console → OAuth client (Android + iOS + Web) →
//     Client ID + Client Secret into Supabase Dashboard →
//     Authentication → Providers → Google.
// NATIVE SETUP (still to do, 2026-11-25):
//   • Same Google Cloud project → Credentials → Create OAuth
//     client ID → Android → package com.livo.app + SHA-1 of the
//     signing key (debug 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:
//     A6:F3:8C:AB:F6:25; release keystore SHA-1 separately).
//   • Copy the WEB client ID into app.json
//     extra.googleOAuth.webClientId (the same Web client already
//     configured in the Supabase Google provider).
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';
import { withTimeout } from './timeout';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_WEB_CLIENT_ID_IS_CONFIGURED } from '../config';

// Login is NATIVE-ONLY (2026-11-25): no browser opens during
// sign-in, ever. The two user-facing error strings:
//   • "Google sign-in isn't set up for this app yet." — native
//     module missing / no Web client ID / DEVELOPER_ERROR.
//   • "Google sign-in failed. Please try again." — any other
//     native failure. (Cancellation stays silent — LoginScreen
//     hides the "Google sign-in was cancelled." message.)
const NOT_SET_UP_MESSAGE = "Google sign-in isn't set up for this app yet.";
const FAILED_MESSAGE = 'Google sign-in failed. Please try again.';

// Lazy-load the native Google Sign-In library. NEVER a top-level
// import: the library's spec calls getEnforcing('RNGoogleSignin')
// at import time, which throws on APKs built before the module was
// added. Caught here so those APKs show the setup error instead
// of crashing.
function loadGoogleSignin() {
  try {
    // eslint-disable-next-line global-require
    return require('@react-native-google-signin/google-signin');
  } catch (e) {
    return null;
  }
}

// Native Google sign-in (Hapa-style) — the ONLY sign-in path.
// Always returns { data, error }; never null, never a browser.
// Cancellation returns the "cancelled" error, which LoginScreen
// hides silently. DEVELOPER_ERROR / missing module / missing
// client ID return the "isn't set up yet" error; every other
// failure returns the generic "try again" error (the real cause
// is logged to console for diagnosis).
async function signInWithGoogleNative() {
  const lib = loadGoogleSignin();
  if (!lib || !GOOGLE_WEB_CLIENT_ID_IS_CONFIGURED) {
    return { data: null, error: new Error(NOT_SET_UP_MESSAGE) };
  }
  const { GoogleSignin, statusCodes } = lib;
  try {
    await GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, offlineAccess: false });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!res || res.type === 'cancelled') {
      return { data: null, error: new Error('Google sign-in was cancelled.') };
    }
    let idToken = res.data && res.data.idToken;
    if (!idToken) {
      const tokens = await GoogleSignin.getTokens();
      idToken = tokens && tokens.idToken;
    }
    if (!idToken) {
      // eslint-disable-next-line no-console
      console.log('[Livo] native Google sign-in returned no ID token.');
      return { data: null, error: new Error(FAILED_MESSAGE) };
    }
    const sessionResult = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (sessionResult.error) {
      // eslint-disable-next-line no-console
      console.log('[Livo] signInWithIdToken failed:', sessionResult.error.message);
      return { data: null, error: new Error(FAILED_MESSAGE) };
    }

    // First sign-in: make sure the user has a profiles row.
    // Best-effort — a profiles write failure must not break the login.
    try {
      if (sessionResult.data && sessionResult.data.user) {
        await ensureProfile(sessionResult.data.user);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[Livo] ensureProfile after sign-in failed:', e && e.message);
    }
    return { data: sessionResult.data, error: null };
  } catch (e) {
    if (e && e.code === statusCodes.SIGN_IN_CANCELLED) {
      return { data: null, error: new Error('Google sign-in was cancelled.') };
    }
    if (e && e.code === statusCodes.DEVELOPER_ERROR) {
      // The app is not registered in Google Cloud yet (missing
      // Android OAuth client for this package + SHA-1). No browser
      // fallback any more — the login screen shows the setup error.
      // eslint-disable-next-line no-console
      console.log('[Livo] native Google sign-in not registered (DEVELOPER_ERROR).');
      return { data: null, error: new Error(NOT_SET_UP_MESSAGE) };
    }
    // Any other native failure (incl. PLAY_SERVICES_NOT_AVAILABLE):
    // no browser fallback — show the generic error.
    // eslint-disable-next-line no-console
    console.log('[Livo] native Google sign-in failed:', e && e.message);
    return { data: null, error: new Error(FAILED_MESSAGE) };
  }
}

// Open Google sign-in and return { data: sessionData, error }.
// NATIVE-ONLY: the native account picker, inside the app — no
// browser opens at any point. On success the App.js auth gate
// switches from Login to Main.
export async function signInWithGoogle() {
  if (!supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  return signInWithGoogleNative();
}

export async function getSession() {
  if (!supabase) return { session: null, error: new Error('Supabase is not configured.') };
  const { data, error } = await supabase.auth.getSession();
  return { session: data ? data.session : null, error };
}

// The profiles columns the app reads for the signed-in user.
// frame_id / frame_expires_at drive the avatar frame display;
// is_banned / deleted_at drive the access gate in checkAccess.
// birthday is set once at first-time signup (18+ enforced there)
// and read back by the profile screens.
const PROFILE_COLUMNS =
  'id, user_id, username, country, language, gender, age, birthday, bio, avatar_url, coins, diamonds, frame_id, frame_expires_at, is_banned, deleted_at';

// ── Ban / delete access gate (Hapa Mother "User" set) ────────────
// After a session resolves, the app checks whether this account
// may use Livo at all:
//   (a) profiles.is_banned, (b) profiles.deleted_at NOT NULL,
//   (c) an active bans row for the user's email OR this device id.
// Returns { status: 'ok' | 'banned' | 'deleted' | 'unknown' }.
// 'unknown' means the check itself failed (no network / timeout) —
// the app lets the user in rather than locking them out over a
// transient failure. Never throws.
export async function checkAccess(user, deviceId) {
  if (!supabase || !user) return { status: 'unknown' };
  try {
    const res = await withTimeout(
      supabase
        .from('profiles')
        .select('id,is_banned,deleted_at')
        .eq('id', user.id)
        .maybeSingle(),
    );
    if (!res) return { status: 'unknown' };
    if (res.error) {
      // eslint-disable-next-line no-console
      console.log('[Livo] checkAccess profile lookup failed:', res.error.message);
      return { status: 'unknown' };
    }
    const row = res.data;
    if (!row) return { status: 'unknown' };
    if (row.is_banned) return { status: 'banned' };
    if (row.deleted_at) return { status: 'deleted' };
    // Active bans by email or by this device id (two small queries
    // instead of one .or() — simpler and robust to special chars).
    const checks = [];
    if (user.email) {
      checks.push(
        supabase
          .from('bans')
          .select('id')
          .eq('ban_type', 'email')
          .eq('value', user.email)
          .eq('active', true)
          .maybeSingle(),
      );
    }
    if (deviceId) {
      checks.push(
        supabase
          .from('bans')
          .select('id')
          .eq('ban_type', 'device')
          .eq('value', deviceId)
          .eq('active', true)
          .maybeSingle(),
      );
    }
    if (checks.length > 0) {
      const results = await Promise.all(
        checks.map((p) => withTimeout(p).catch(() => null)),
      );
      for (const r of results) {
        if (r && !r.error && r.data) return { status: 'banned' };
      }
    }
    return { status: 'ok' };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[Livo] checkAccess failed:', e && e.message);
    return { status: 'unknown' };
  }
}

// ── Avatar frames ────────────────────────────────────────────────
// The frames table has NO duration column, so the app stamps the
// expiry when a frame is equipped: the VIP period (vip_until) when
// the equip comes with one, otherwise now + 30 days. This is the
// documented default — no other frame durations are invented.
// Called by updateMyProfile whenever a patch sets frame_id.
async function frameExpiryFor(patch) {
  try {
    let vipUntil = patch.vip_until || null;
    if (!vipUntil) {
      const user = await getSessionUser();
      if (user) {
        const res = await withTimeout(
          supabase.from('profiles').select('vip_until').eq('id', user.id).maybeSingle(),
        );
        if (res && !res.error && res.data) vipUntil = res.data.vip_until || null;
      }
    }
    const untilMs = vipUntil ? new Date(vipUntil).getTime() : 0;
    if (untilMs > Date.now()) return new Date(untilMs).toISOString();
  } catch (e) { /* fall through to the 30-day default */ }
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

// Equip an avatar frame by id (writes profiles.frame_id +
// frame_expires_at). Returns the updated profile row or null.
export async function equipFrame(frameId) {
  if (!frameId) return null;
  return updateMyProfile({ frame_id: frameId });
}
// getUser() is a NETWORK call (it validates the token against the
// Auth server). On a phone that call can fail or stall even when a
// perfectly valid session sits in local storage — and every screen
// that decided "signed in" from getUser() then showed the signed-out
// state right after a successful Google login (Me showed "Not set",
// Wallet asked to sign in, Edit Profile refused to save), while the
// App.js gate (getSession, local) correctly showed Main.
// So: identity comes from getSession() (local, no network).
// getUser() is only a fallback when there is NO local session at
// all, and it is timeout-guarded so a stall can never hang the app.
export async function getSessionUser() {
  if (!supabase) return null;
  try {
    // getSession() itself can stall on a phone when the stored token
    // needs a network refresh — race it, so no screen can spin
    // forever waiting for identity (the Messages list did that).
    const res = await withTimeout(supabase.auth.getSession());
    const data = res && res.data;
    if (data && data.session && data.session.user) return data.session.user;
  } catch (e) { /* fall through to the network fallback */ }
  try {
    const res = await withTimeout(supabase.auth.getUser());
    if (res && res.data && res.data.user) return res.data.user;
  } catch (e) { /* no user */ }
  return null;
}

export function onAuthStateChange(callback) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe() {} } } };
  }
  return supabase.auth.onAuthStateChange(callback);
}

export async function signOut() {
  if (!supabase) return;
  // Timeout-raced: the startup gate awaits this on the banned /
  // deleted path, and a stalled network sign-out must not hang the
  // app on the loading screen (2026-11-24).
  await withTimeout(supabase.auth.signOut());
}

// The public Livo user id: the Google account's "sub" (stable across
// logins), falling back to the Gmail address, then the auth user id.
export function googleSubOrEmail(user) {
  const googleIdentity = (user.identities || []).find((i) => i.provider === 'google');
  return (googleIdentity && googleIdentity.id) || user.email || user.id;
}

// Create the profiles row on FIRST sign-in only (select-then-insert,
// so a later login never overwrites a username the user edited).
// Defaults: country Singapore, language English (the user's home
// base); gender is left null — never guessed.
// Returns { profile, error }. A missing RLS policy (or no network)
// returns an error here but never throws.
// Short numeric Livo ID for a new user (e.g. 63227007): 8 digits,
// checked against the profiles table so two users never share one.
// The DB also has a UNIQUE constraint on profiles.user_id
// (profiles_user_id_key) as a backstop. Exported: the wallet
// fallback profile creation must use the same generator — never
// the raw auth UUID as a display ID.
export async function generateShortUserId() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = String(Math.floor(10000000 + Math.random() * 90000000));
    try {
      const res = await withTimeout(
        supabase.from('profiles').select('id').eq('user_id', candidate).maybeSingle(),
      );
      if (res && !res.data && !res.error) return candidate;
      if (!res) return candidate;
    } catch (e) { return candidate; }
  }
  // Extremely unlikely fallback: last 8 digits of the timestamp.
  return String(Date.now()).slice(-8);
}

export async function ensureProfile(user) {
  if (!supabase || !user) {
    return { profile: null, error: new Error('No user to create a profile for.') };
  }
  try {
    // Timeout-guarded: a stalled select must fail fast, never hang
    // the sign-in (the missing profiles row on 2026-11-23 came from
    // this step never completing on the phone).
    const selectRes = await withTimeout(
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', user.id)
        .maybeSingle(),
    );
    // A timed-out select returns null — that is NOT "no row". Do
    // not attempt the insert: the row may already exist, and
    // inserting would hit a unique-violation on the primary key.
    if (!selectRes) return { profile: null, error: new Error('Profile lookup timed out') };
    const { data: existing, error: selectError } = selectRes;
    if (selectError) return { profile: null, error: selectError };
    if (existing) return { profile: existing, error: null };

    const meta = user.user_metadata || {};
    const username =
      meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Livo user');
    const row = {
      id: user.id,
      user_id: await generateShortUserId(),
      username,
      country: 'Singapore',
      language: 'English',
      gender: null,
      coins: 0,
      diamonds: 0,
    };
    // Insert with a fresh 8-digit ID; on the (near-impossible)
    // unique-violation race, regenerate and retry instead of
    // failing signup or ever sharing a number between two users.
    let inserted = null;
    let insertError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = (await withTimeout(
        supabase
          .from('profiles')
          .insert({ ...row, user_id: attempt === 0 ? row.user_id : await generateShortUserId() })
          .select(PROFILE_COLUMNS)
          .single(),
      )) || {};
      if (!res.error) {
        inserted = res.data;
        insertError = null;
        break;
      }
      insertError = res.error;
      if (res.error.code !== '23505') break;
    }
    if (insertError) return { profile: null, error: insertError };
    return { profile: inserted, error: null };
  } catch (e) {
    return { profile: null, error: e };
  }
}

// Read the signed-in user's own profiles row (null when none yet).
// Timeout-guarded: a stalled request returns a visible timeout
// error instead of hanging forever (the Me screen on 2026-11-23
// showed "Profile: missing | Error: none" because this select
// stalled and the promise never resolved).
export async function fetchMyProfile(userId) {
  if (!supabase || !userId) return { profile: null, error: new Error('No user id.') };
  try {
    const res = await withTimeout(
      supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle(),
    );
    if (!res) return { profile: null, error: new Error('Profile request timed out') };
    const { data, error } = res;
    if (error) return { profile: null, error };
    return { profile: data || null, error: null };
  } catch (e) {
    return { profile: null, error: e };
  }
}

// Update the signed-in user's own profiles row (username, bio,
// country, language, second_language, tags, frame_id, ...).
// When the patch equips a frame (frame_id) without an explicit
// frame_expires_at, the expiry is stamped here (VIP period, else
// now + 30 days — see frameExpiryFor above).
// withTimeout-guarded; never throws — returns the updated row on
// success, null on any failure (no session, timeout, RLS error).
export async function updateMyProfile(patch) {
  if (!supabase || !patch || typeof patch !== 'object') return null;
  try {
    // Identity from the local session (see getSessionUser): the
    // network getUser() call can fail on a phone right after login.
    const user = await getSessionUser();
    if (!user) return null;
    const write = { ...patch };
    // The 8-digit Livo ID is never changeable from the app — only
    // the owner can change it from the Mother Panel. Strip it here
    // so no future edit path can ever rewrite it by accident.
    delete write.user_id;
    delete write.id;
    if (write.frame_id && !write.frame_expires_at) {
      write.frame_expires_at = await frameExpiryFor(write);
    }
    const res = await withTimeout(
      supabase
        .from('profiles')
        .update(write)
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .maybeSingle(),
    );
    if (!res || res.error || !res.data) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}
