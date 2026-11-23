// ─────────────────────────────────────────────────────────────────
// Livo — wallet persistence (Supabase profiles + transactions).
//
// This is the ONLY place that reads/writes money in Supabase:
//   profiles.coins / profiles.diamonds / profiles.vip_level /
//   profiles.vip_until hold the balances; every earn/spend also
//   writes one row in transactions (kind, amount_coins,
//   amount_diamonds, reference).
//
// Contract (shared with the rest of the app):
//   - the signed-in user comes from supabase.auth.getUser() and
//     user.id equals profiles.id. No session → every function
//     reports 'not-signed-in' and nothing is faked.
//   - balances are read-then-written through one in-module queue,
//     so two quick taps can never compute from the same stale row.
//   - AsyncStorage holds only an offline cache of the last known
//     balances (key LIVO_WALLET_CACHE_KEY); the profiles row is
//     the source of truth and overwrites the cache on every load.
// ─────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './client';
import { withTimeout } from './timeout';

const LIVO_WALLET_CACHE_KEY = 'livo-wallet-cache-v1';

// Serialises all balance writes for this client (see header).
let writeQueue = Promise.resolve();
function enqueue(fn) {
  const run = writeQueue.then(fn, fn);
  // Keep the queue alive even if one write fails.
  writeQueue = run.catch(() => {});
  return run;
}

export async function getSignedInUser() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return (data && data.user) || null;
  } catch (e) {
    return null;
  }
}

// ── Offline cache (display only) ─────────────────────────────────
export async function readWalletCache() {
  try {
    const raw = await AsyncStorage.getItem(LIVO_WALLET_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.userId !== 'string') return null;
    return {
      userId: saved.userId,
      coins: typeof saved.coins === 'number' ? saved.coins : 0,
      diamonds: typeof saved.diamonds === 'number' ? saved.diamonds : 0,
      vipLevel: typeof saved.vipLevel === 'string' ? saved.vipLevel : null,
      vipUntil: typeof saved.vipUntil === 'string' ? saved.vipUntil : null,
    };
  } catch (e) {
    return null;
  }
}

export async function writeWalletCache(userId, wallet) {
  if (!userId || !wallet) return;
  try {
    await AsyncStorage.setItem(
      LIVO_WALLET_CACHE_KEY,
      JSON.stringify({
        userId,
        coins: wallet.coins || 0,
        diamonds: wallet.diamonds || 0,
        vipLevel: wallet.vipLevel || null,
        vipUntil: wallet.vipUntil || null,
      }),
    );
  } catch (e) { /* cache is best-effort only */ }
}

export async function clearWalletCache() {
  try {
    await AsyncStorage.removeItem(LIVO_WALLET_CACHE_KEY);
  } catch (e) { /* ignore */ }
}

// ── Load ─────────────────────────────────────────────────────────
// Returns { coins, diamonds, vipLevel, vipUntil } for the signed-in
// user, or { error: 'not-signed-in' | 'profile-not-found' |
// 'load-failed' }. A missing profiles row is created with zero
// balances (a signed-in user with no row yet is a new user, not an
// error). An expired vip_until reports vipLevel null.
export async function loadWallet() {
  const user = await getSignedInUser();
  if (!user) return { error: 'not-signed-in' };
  if (!supabase) return { error: 'load-failed' };
  try {
    const res = await withTimeout(
      supabase
        .from('profiles')
        .select('coins,diamonds,vip_level,vip_until,country')
        .eq('id', user.id)
        .maybeSingle(),
    );
    const data = res && res.data;
    const error = res ? res.error : new Error('load-timed-out');
    if (error) return { error: 'load-failed' };
    if (!data) {
      const { error: insErr } = await supabase.from('profiles').insert({
        id: user.id,
        user_id: user.id,
        coins: 0,
        diamonds: 0,
      });
      if (insErr) return { error: 'profile-not-found' };
      const fresh = { coins: 0, diamonds: 0, vipLevel: null, vipUntil: null };
      await writeWalletCache(user.id, fresh);
      return fresh;
    }
    const vipActive =
      data.vip_until && data.vip_level
        ? new Date(data.vip_until).getTime() > Date.now()
        : false;
    const wallet = {
      coins: typeof data.coins === 'number' ? data.coins : 0,
      diamonds: typeof data.diamonds === 'number' ? data.diamonds : 0,
      vipLevel: vipActive ? data.vip_level : null,
      vipUntil: vipActive ? data.vip_until : null,
      country: typeof data.country === 'string' && data.country ? data.country : null,
    };
    await writeWalletCache(user.id, wallet);
    return wallet;
  } catch (e) {
    return { error: 'load-failed' };
  }
}

// ── Adjust balances ─────────────────────────────────────────────
// Applies coinsDelta / diamondsDelta to the signed-in user's
// profiles row and writes one transactions row. FIRST tries the
// atomic adjust_wallet() Postgres function (balance check +
// profiles update + transactions insert in one step); ONLY when
// the rpc itself errors (e.g. the function does not exist yet)
// does it fall back to the read-then-write path below. A rpc
// timeout returns 'update-failed' WITHOUT falling back — the
// server may still have applied it, and a second write would
// double-credit. Returns the new { coins, diamonds } on success,
// or { error, ... }:
//   'not-signed-in' | 'insufficient-balance' | 'update-failed'.
// A failed transaction-row insert does NOT fail the adjustment
// (the user already paid / earned) — it is reported as
// txError: true so the caller can warn, not roll back.
export function adjustWallet({ coinsDelta = 0, diamondsDelta = 0, kind, reference }) {
  return enqueue(async () => {
    const user = await getSignedInUser();
    if (!user) return { error: 'not-signed-in' };
    if (!supabase) return { error: 'update-failed' };
    // (1) Atomic path: adjust_wallet(p_coins, p_diamonds, p_kind,
    // p_reference) returns table(coins int, diamonds int).
    const rpcRes = await withTimeout(
      supabase.rpc('adjust_wallet', {
        p_coins: coinsDelta,
        p_diamonds: diamondsDelta,
        p_kind: kind || 'adjust',
        p_reference: reference || null,
      }),
    );
    if (rpcRes === null) return { error: 'update-failed' };
    if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
      const row = rpcRes.data[0];
      const result = {
        coins: typeof row.coins === 'number' ? row.coins : 0,
        diamonds: typeof row.diamonds === 'number' ? row.diamonds : 0,
      };
      await writeWalletCache(user.id, result);
      return result;
    }
    if (rpcRes.error && /insufficient/i.test(String(rpcRes.error.message || ''))) {
      return { error: 'insufficient-balance' };
    }
    // (2) Fallback: the rpc errored (function missing / not
    // deployed yet) — read-then-write as before.
    const readRes = await withTimeout(
      supabase
        .from('profiles')
        .select('coins,diamonds')
        .eq('id', user.id)
        .single(),
    );
    const row = readRes && readRes.data;
    const error = readRes ? readRes.error : new Error('read-timed-out');
    if (error || !row) return { error: 'update-failed' };
    const coins = (row.coins || 0) + coinsDelta;
    const diamonds = (row.diamonds || 0) + diamondsDelta;
    if (coins < 0 || diamonds < 0) return { error: 'insufficient-balance' };
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ coins, diamonds })
      .eq('id', user.id);
    if (upErr) return { error: 'update-failed' };
    const { error: txErr } = await supabase.from('transactions').insert({
      profile_id: user.id,
      kind: kind || 'adjust',
      amount_coins: coinsDelta,
      amount_diamonds: diamondsDelta,
      reference: reference || null,
    });
    const result = { coins, diamonds };
    if (txErr) result.txError = true;
    await writeWalletCache(user.id, result);
    return result;
  });
}

// ── VIP ──────────────────────────────────────────────────────────
// Sets vip_level + vip_until on the signed-in user's profiles row
// (extends from the current vip_until when it is still in the
// future, otherwise from now) and writes a transactions row.
// Returns { vipLevel, vipUntil } or { error }.
export function setVip({ vipLevel, days, kind = 'vip_purchase', reference }) {
  return enqueue(async () => {
    const user = await getSignedInUser();
    if (!user) return { error: 'not-signed-in' };
    if (!supabase) return { error: 'update-failed' };
    const { data: row } = await supabase
      .from('profiles')
      .select('vip_until')
      .eq('id', user.id)
      .maybeSingle();
    const currentUntil = row && row.vip_until ? new Date(row.vip_until).getTime() : 0;
    const base = currentUntil > Date.now() ? currentUntil : Date.now();
    const until = new Date(base + (days || 30) * 24 * 60 * 60 * 1000).toISOString();
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ vip_level: vipLevel, vip_until: until })
      .eq('id', user.id);
    if (upErr) return { error: 'update-failed' };
    await supabase.from('transactions').insert({
      profile_id: user.id,
      kind,
      amount_coins: 0,
      amount_diamonds: 0,
      reference: reference || vipLevel,
    });
    return { vipLevel, vipUntil: until };
  });
}

// ── Host earnings (best-effort) ──────────────────────────────────
// Credits diamonds to a host's own profile (looked up through the
// hosts table by host_id) and bumps hosts.earnings_diamonds, plus a
// transactions row for the host. Returns { ok: true } on success
// or { ok: false, error } on failure. On failure AFTER the host
// was found, a transactions row kind='host_credit_failed' is
// written for the host's profile so the shortfall is visible to
// the panel instead of vanishing. Never throws and never blocks
// the caller — if the host cannot be found, the caller's side of
// the payment has already been recorded by adjustWallet.
export async function creditHostEarnings(hostId, diamonds, kind = 'call_earnings', reference) {
  if (!hostId || !diamonds || diamonds <= 0 || !supabase) {
    return { ok: false, error: 'invalid' };
  }
  try {
    const hostRes = await withTimeout(
      supabase
        .from('hosts')
        .select('profile_id,earnings_diamonds')
        .eq('host_id', String(hostId))
        .maybeSingle(),
    );
    const host = hostRes && hostRes.data;
    if (!host || !host.profile_id) return { ok: false, error: 'host-not-found' };
    const recordFailure = async (err) => {
      try {
        await supabase.from('transactions').insert({
          profile_id: host.profile_id,
          kind: 'host_credit_failed',
          amount_coins: 0,
          amount_diamonds: diamonds,
          reference: reference || null,
        });
      } catch (e) { /* the failure row itself is best-effort */ }
      return { ok: false, error: err };
    };
    const profRes = await withTimeout(
      supabase
        .from('profiles')
        .select('diamonds')
        .eq('id', host.profile_id)
        .single(),
    );
    const prof = profRes && profRes.data;
    if (!profRes || profRes.error || !prof) return recordFailure('profile-not-found');
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ diamonds: (prof.diamonds || 0) + diamonds })
      .eq('id', host.profile_id);
    if (upErr) return recordFailure('profile-update-failed');
    const { error: hostErr } = await supabase
      .from('hosts')
      .update({ earnings_diamonds: (host.earnings_diamonds || 0) + diamonds })
      .eq('host_id', String(hostId));
    if (hostErr) return recordFailure('host-update-failed');
    const { error: txErr } = await supabase.from('transactions').insert({
      profile_id: host.profile_id,
      kind,
      amount_coins: 0,
      amount_diamonds: diamonds,
      reference: reference || null,
    });
    if (txErr) return recordFailure('receipt-failed');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'failed' };
  }
}

// ── History ──────────────────────────────────────────────────────
// Recent transactions rows for the signed-in user (newest first),
// mapped to the shape the Bill · History view renders. Empty array
// when not signed in or on any failure.
export async function fetchRecentTransactions(limit = 20) {
  const user = await getSignedInUser();
  if (!user || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,kind,amount_coins,amount_diamonds,reference,created_at')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountCoins: r.amount_coins || 0,
      amountDiamonds: r.amount_diamonds || 0,
      reference: r.reference,
      createdAt: r.created_at,
    }));
  } catch (e) {
    return [];
  }
}
