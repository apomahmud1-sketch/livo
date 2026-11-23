// ─────────────────────────────────────────────────────────────────
// Livo — real Google (Gmail) sign-in via Supabase Auth.
//
// Flow (Expo bare workflow, SDK 52):
//   1. signInWithOAuth({ provider: 'google', skipBrowserRedirect: true })
//      returns the Google consent URL (no browser redirect yet).
//   2. expo-web-browser opens that URL; after the user picks their
//      Gmail account, Google redirects back into the app via the
//      "livo://" scheme (see app.json "scheme").
//   3. The returned URL carries a PKCE `code` (or, for the implicit
//      flow, #access_token / #refresh_token); we exchange it for a
//      Supabase session, which is persisted in AsyncStorage by the
//      client (see client.js) and survives app restarts.
//
// expo-auth-session and expo-web-browser ARE installed and
// Google sign-in works (verified on device 2026-11-23) — the old
// "PENDING INSTALL" note below was stale and is removed.
//
// CONSOLE SETUP (done 2026-11-23):
//   • Google Cloud Console → OAuth client (Android + iOS + Web) →
//     Client ID + Client Secret into Supabase Dashboard →
//     Authentication → Providers → Google.
//   • Supabase Dashboard → Authentication → URL Configuration →
//     Redirect URLs: add  livo://**
// ─────────────────────────────────────────────────────────────────
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './client';
import { withTimeout } from './timeout';

WebBrowser.maybeCompleteAuthSession();

// Must match app.json "scheme": "livo".
const REDIRECT_SCHEME = 'livo';

export function getRedirectUrl() {
  return AuthSession.makeRedirectUri({ scheme: REDIRECT_SCHEME });
}

// Parse the URL the browser hands back to the app after Google.
// PKCE flow → ?code=… ; implicit flow → #access_token=…&refresh_token=…
function parseAuthResult(url) {
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (code) return { code };
    const hash = new URLSearchParams((parsed.hash || '').replace(/^#/, ''));
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
    return { error: new Error('Google sign-in finished but no code or tokens came back.') };
  } catch (e) {
    return { error: e };
  }
}

// Open Google sign-in and return { data: sessionData, error }.
// On success the App.js auth gate switches from Login to Main.
export async function signInWithGoogle() {
  if (!supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  const redirectTo = getRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { data: null, error };
  if (!data || !data.url) {
    return { data: null, error: new Error('Google sign-in did not return a URL.') };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    return {
      data: null,
      error: new Error(
        result.type === 'cancel'
          ? 'Google sign-in was cancelled.'
          : 'Google sign-in did not complete.'
      ),
    };
  }

  const parsed = parseAuthResult(result.url);
  if (parsed.error) return { data: null, error: parsed.error };

  let sessionResult;
  if (parsed.code) {
    sessionResult = await supabase.auth.exchangeCodeForSession(parsed.code);
  } else {
    sessionResult = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
  }
  if (sessionResult.error) return { data: null, error: sessionResult.error };

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
}

export async function getSession() {
  if (!supabase) return { session: null, error: new Error('Supabase is not configured.') };
  const { data, error } = await supabase.auth.getSession();
  return { session: data ? data.session : null, error };
}

// ── The signed-in user: LOCAL session is the source of truth ─────
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
    const { data } = await supabase.auth.getSession();
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
  await supabase.auth.signOut();
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
export async function ensureProfile(user) {
  if (!supabase || !user) {
    return { profile: null, error: new Error('No user to create a profile for.') };
  }
  try {
    const { data: existing, error: selectError } = await supabase
      .from('profiles')
      .select('id, user_id, username, country, language, gender, age, bio, avatar_url, coins, diamonds')
      .eq('id', user.id)
      .maybeSingle();
    if (selectError) return { profile: null, error: selectError };
    if (existing) return { profile: existing, error: null };

    const meta = user.user_metadata || {};
    const username =
      meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Livo user');
    const row = {
      id: user.id,
      user_id: googleSubOrEmail(user),
      username,
      country: 'Singapore',
      language: 'English',
      gender: null,
      coins: 0,
      diamonds: 0,
    };
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert(row)
      .select('id, user_id, username, country, language, gender, age, bio, avatar_url, coins, diamonds')
      .single();
    if (insertError) return { profile: null, error: insertError };
    return { profile: inserted, error: null };
  } catch (e) {
    return { profile: null, error: e };
  }
}

// Read the signed-in user's own profiles row (null when none yet).
export async function fetchMyProfile(userId) {
  if (!supabase || !userId) return { profile: null, error: new Error('No user id.') };
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, user_id, username, country, language, gender, age, bio, avatar_url, coins, diamonds')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { profile: null, error };
    return { profile: data || null, error: null };
  } catch (e) {
    return { profile: null, error: e };
  }
}

// Update the signed-in user's own profiles row (username, bio,
// country, language, second_language, tags, frame_id, ...).
// withTimeout-guarded; never throws — returns the updated row on
// success, null on any failure (no session, timeout, RLS error).
export async function updateMyProfile(patch) {
  if (!supabase || !patch || typeof patch !== 'object') return null;
  try {
    // Identity from the local session (see getSessionUser): the
    // network getUser() call can fail on a phone right after login.
    const user = await getSessionUser();
    if (!user) return null;
    const res = await withTimeout(
      supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('id, user_id, username, country, language, gender, age, bio, avatar_url, coins, diamonds')
        .maybeSingle(),
    );
    if (!res || res.error || !res.data) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}
