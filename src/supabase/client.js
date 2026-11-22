// ─────────────────────────────────────────────────────────────────
// Livo — Supabase client (connected to the real project).
//
// Project: livo (Seoul) — https://wpqtynqtbmcwsoscnyih.supabase.co
// The URL + anon key below are the project's public (publishable)
// credentials: they are safe to ship inside the app, because the
// tables are protected by Row Level Security (see supabase/schema.sql).
// The secret/service_role key must NEVER be put in this file.
// You can still override these with .env:
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
//
// Auth sessions PERSIST across restarts: the client stores the
// session in AsyncStorage (auth.storage below), so a signed-in user
// stays signed in — and the PKCE code verifier used by Google
// sign-in survives the browser round-trip too.
// ─────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://wpqtynqtbmcwsoscnyih.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwcXR5bnF0Ym1jd3Nvc2NueWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MjEwNDAsImV4cCI6MjExMDQ5NzA0MH0.vSyqlzP-YHpsHBATJy9onbdAEMW-clKzNyLXW28DG9E';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY
);

// Connected: screens can call supabase now (RLS policies decide
// what the anon key may read/write — see the policies step).
// auth.storage = AsyncStorage so the session (and the PKCE verifier
// for Google sign-in) survives app restarts.
export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

if (!isSupabaseConfigured && typeof __DEV__ !== 'undefined' && __DEV__) {
  // eslint-disable-next-line no-console
  console.log('[Livo] Supabase not configured — using demo data.');
}
