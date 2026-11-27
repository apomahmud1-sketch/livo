// ─────────────────────────────────────────────────────────────────
// Livo — host-side Supabase reads/writes (real data, no demo).
//
// The signed-in user comes from the local session via
// getSessionUser() (src/supabase/auth.js); user.id equals
// profiles.id. Every function here NEVER throws: any failure
// (no session, RLS denied, network error) returns null / false /
// { ok: false } and the screen shows a login prompt or an error
// toast instead of fake numbers.
//
// Host approval: a host row created here always starts with
// status 'pending' — only the Mother Panel / an admin can approve
// it (status 'approved'). A pending host earns nothing on Home
// because fetchLiveHosts only lists approved hosts.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';
import { getSessionUser } from './auth';
import { withTimeout } from './timeout';

// Kinds in the transactions table that count as host earnings
// (gifts received, call earnings, tips). Anything else — coin
// recharges, purchases, VIP buys — is the viewer's money, not the
// host's income, and is never counted here.
const EARNING_KIND = /gift|earn|call|tip/i;

// How often the host app refreshes its heartbeat while online.
const HEARTBEAT_MS = 30 * 1000;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function toInt(v) {
  return isFiniteNumber(v) ? v : 0;
}

// ── Session ──────────────────────────────────────────────────────

export async function getCurrentUser() {
  // Identity from the local session (see getSessionUser in auth.js):
  // the network getUser() call can fail on a phone right after login.
  return getSessionUser();
}

// ── Profile + host row ───────────────────────────────────────────

export async function getMyProfile(userId) {
  if (!supabase || !userId) return null;
  try {
    const res = await withTimeout(
      supabase
        .from('profiles')
        .select('id,username,avatar_url,coins,diamonds')
        .eq('id', userId)
        .maybeSingle(),
    );
    if (!res || res.error || !res.data) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}

// The auth user has no profiles row yet (e.g. the admin login was
// created in Auth only) — create the minimal row the hosts table's
// foreign key needs. Returns the profile row or null.
export async function ensureProfileRow(user) {
  if (!supabase || !user || !user.id) return null;
  const existing = await getMyProfile(user.id);
  if (existing) return existing;
  const username =
    (user.email && String(user.email).split('@')[0]) || 'host';
  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        user_id: `auth-${String(user.id).replace(/-/g, '').slice(0, 12)}`,
        username,
      })
      .select('id,username,avatar_url,coins,diamonds')
      .single();
    if (error || !data) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function getMyHostRow(userId) {
  if (!supabase || !userId) return null;
  try {
    const res = await withTimeout(
      supabase
        .from('hosts')
        .select('id,host_id,profile_id,status,rate_tier,is_online,last_seen,verification_video_url,verification_status')
        .eq('profile_id', userId)
        .maybeSingle(),
    );
    if (!res || res.error || !res.data) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}

// Create the signed-in user's host row on demand. Status is always
// 'pending' — approval is a Mother Panel / admin step, never
// something the app grants itself.
export async function ensureHostRow(user) {
  if (!supabase || !user || !user.id) return null;
  const existing = await getMyHostRow(user.id);
  if (existing) return existing;
  // The hosts.profile_id foreign key needs a profiles row first.
  const profile = await ensureProfileRow(user);
  if (!profile) return null;
  const hostId = `u-${String(user.id).replace(/-/g, '').slice(0, 12)}`;
  try {
    const { data, error } = await supabase
      .from('hosts')
      .insert({
        profile_id: user.id,
        host_id: hostId,
        status: 'pending',
        rate_tier: 'tier2',
        is_online: false,
      })
      .select('id,host_id,profile_id,status,rate_tier,is_online,last_seen,verification_video_url,verification_status')
      .single();
    if (error || !data) {
      // A race (row created between the check and the insert) —
      // read it back instead of failing.
      return await getMyHostRow(user.id);
    }
    return data;
  } catch (e) {
    return await getMyHostRow(user.id);
  }
}

// ── Host controls (persisted) ────────────────────────────────────

// Identity verification: the app only ever records + uploads a
// verification video and marks it 'pending' for Mother Panel
// review. 'verified' / 'rejected' are set ONLY by the owner — a DB
// trigger (hosts_verification_status_guard) blocks the app from
// writing them, so this helper never writes those values. Returns
// true when the row was updated.
export async function updateHostVerification(hostRowId, { verificationVideoUrl }) {
  if (!supabase || !hostRowId || !verificationVideoUrl) return false;
  try {
    const { error } = await supabase
      .from('hosts')
      .update({ verification_video_url: verificationVideoUrl, verification_status: 'pending' })
      .eq('id', hostRowId);
    return !error;
  } catch (e) {
    return false;
  }
}

// ── Surprise live checks (host verification) ─────────────────────
// The Mother Panel can request a surprise live check for a host
// (a live_checks row, status 'requested', with a deadline). The
// host sees a banner on the Host Dashboard and must go live
// before the deadline. The app only ever moves a check to 'live'
// (the host went live) or 'expired' (the deadline passed) —
// 'passed' / 'failed' are set ONLY by the owner from the
// verification console, and the live_checks RLS blocks the app
// from writing them. These helpers never throw: any failure
// returns null / false and the dashboard simply shows no banner.

export async function fetchRequestedLiveCheck(hostId) {
  if (!supabase || !hostId) return null;
  try {
    const res = await withTimeout(
      supabase
        .from('live_checks')
        .select('id,host_id,report_id,status,requested_at,deadline_at,decided_at,note,created_at')
        .eq('host_id', hostId)
        .eq('status', 'requested')
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    if (!res || res.error || !res.data) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}

export async function markLiveCheckLive(checkId) {
  if (!supabase || !checkId) return false;
  try {
    const { error } = await supabase
      .from('live_checks')
      .update({ status: 'live' })
      .eq('id', checkId);
    return !error;
  } catch (e) {
    return false;
  }
}

export async function markLiveCheckExpired(checkId) {
  if (!supabase || !checkId) return false;
  try {
    const { error } = await supabase
      .from('live_checks')
      .update({ status: 'expired' })
      .eq('id', checkId);
    return !error;
  } catch (e) {
    return false;
  }
}

// Online state lives in is_online + last_seen — never in status,
// because status is the approval state ('pending' / 'approved').
// last_seen is stamped on every change so Home can tell a stale
// online flag (app killed, network lost) from a live host.
export async function setHostOnline(hostRowId, online) {
  if (!supabase || !hostRowId) return false;
  try {
    const { error } = await supabase
      .from('hosts')
      .update({ is_online: online, last_seen: new Date().toISOString() })
      .eq('id', hostRowId);
    return !error;
  } catch (e) {
    return false;
  }
}

export async function setHostRateTier(hostRowId, tierId) {
  if (!supabase || !hostRowId || !tierId) return false;
  try {
    const { error } = await supabase
      .from('hosts')
      .update({ rate_tier: tierId })
      .eq('id', hostRowId);
    return !error;
  } catch (e) {
    return false;
  }
}

// ── Heartbeat ────────────────────────────────────────────────────
// While the host is online, refresh last_seen every 30s so Home
// keeps showing them live. If the app is killed, the heartbeat
// stops, last_seen goes stale and Home drops them (see live.js).
// Stop always clears the flag on the server too.

let heartbeatTimer = null;
let heartbeatHostRowId = null;

async function heartbeatTick() {
  if (!supabase || !heartbeatHostRowId) return;
  try {
    await supabase
      .from('hosts')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', heartbeatHostRowId)
      .eq('is_online', true);
  } catch (e) {
    // A missed beat is harmless — the next tick retries.
  }
}

export function startHostHeartbeat(hostRowId) {
  if (!hostRowId) return;
  stopHostHeartbeat();
  heartbeatHostRowId = hostRowId;
  heartbeatTick();
  heartbeatTimer = setInterval(heartbeatTick, HEARTBEAT_MS);
}

export async function stopHostHeartbeat(markOffline = false) {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  // Only flip the server flag when the host deliberately went
  // offline. Merely leaving the dashboard (e.g. Go Live) must NOT
  // mark them offline — the heartbeat keeps running, and if the
  // app is killed the flag ages out via last_seen instead.
  if (markOffline && heartbeatHostRowId) {
    const rowId = heartbeatHostRowId;
    heartbeatHostRowId = null;
    try {
      if (supabase) {
        await supabase
          .from('hosts')
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq('id', rowId);
      }
    } catch (e) {
      // Best effort — a stale flag ages out via last_seen anyway.
    }
  } else {
    heartbeatHostRowId = null;
  }
}

// ── Real earnings ────────────────────────────────────────────────
// Canonical source for call counts / minutes / coins: calls rows
// where this host is host_id and status is 'completed' OR 'ended'
// (signalling writes finished calls as 'ended'; the table default
// is 'completed' — filtering on 'completed' alone returns 0 for
// every real call).
// Diamonds come from ONE source only: transactions rows for this
// host's profile whose kind is a host earning (gift / call earning
// / tip). The calls rows' host_earnings_diamonds is NOT summed —
// it is the same earning creditHostEarnings already wrote as a
// 'call_earnings' transaction, so adding both counted every call
// earning twice. Calls rows are used only for counts, minutes and
// the coins the callers paid.

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function fetchHostEarnings(hostRowId, profileId) {
  const empty = {
    todayCoins: 0,
    todayDiamonds: 0,
    todayCalls: 0,
    todayMinutes: 0,
    totalCoins: 0,
    totalDiamonds: 0,
    totalCalls: 0,
    totalMinutes: 0,
    week: [],
  };
  if (!supabase || !hostRowId) return empty;

  // Last-7-days skeleton (oldest → today), filled from real rows.
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    week.push({ key: dayKey(d), day: DAY_ABBR[d.getDay()], coins: 0, diamonds: 0 });
  }
  const weekByKey = new Map(week.map((w) => [w.key, w]));
  const todayKey = dayKey(new Date());

  let callRows = [];
  try {
    const res = await withTimeout(
      supabase
        .from('calls')
        .select('cost_coins,duration_seconds,status,created_at')
        .eq('host_id', hostRowId)
        .in('status', ['completed', 'ended'])
        .order('created_at', { ascending: false })
        .limit(1000),
    );
    if (res && !res.error && Array.isArray(res.data)) callRows = res.data;
  } catch (e) {
    callRows = [];
  }

  let todayCoins = 0;
  let todayCalls = 0;
  let todaySeconds = 0;
  let totalCoins = 0;
  let totalSeconds = 0;
  for (const c of callRows) {
    const coins = toInt(c.cost_coins);
    const seconds = toInt(c.duration_seconds);
    totalCoins += coins;
    totalSeconds += seconds;
    const created = c.created_at ? new Date(c.created_at) : null;
    if (created && !Number.isNaN(created.getTime())) {
      const key = dayKey(created);
      const slot = weekByKey.get(key);
      if (slot) {
        slot.coins += coins;
      }
      if (key === todayKey) {
        todayCoins += coins;
        todayCalls += 1;
        todaySeconds += seconds;
      }
    }
  }

  // Gift / earning transactions for this host's profile.
  // This is the ONLY source of diamonds (see the header comment
  // above): the calls rows' host_earnings_diamonds is the same
  // earning and must never be added on top of these.
  let txDiamondsToday = 0;
  let txDiamondsTotal = 0;
  let txCoinsTotal = 0;
  if (profileId) {
    try {
      const res = await withTimeout(
        supabase
          .from('transactions')
          .select('kind,amount_coins,amount_diamonds,created_at')
          .eq('profile_id', profileId)
          .order('created_at', { ascending: false })
          .limit(500),
      );
      if (res && !res.error && Array.isArray(res.data)) {
        for (const t of res.data) {
          if (!t || !EARNING_KIND.test(String(t.kind || ''))) continue;
          const diamonds = toInt(t.amount_diamonds);
          const coins = toInt(t.amount_coins);
          txDiamondsTotal += diamonds;
          txCoinsTotal += coins;
          const created = t.created_at ? new Date(t.created_at) : null;
          if (created && !Number.isNaN(created.getTime())) {
            const key = dayKey(created);
            const slot = weekByKey.get(key);
            if (slot) slot.diamonds += diamonds;
            if (key === todayKey) txDiamondsToday += diamonds;
          }
        }
      }
    } catch (e) {
      // Transactions unreadable — call earnings above still stand.
    }
  }

  return {
    todayCoins,
    todayDiamonds: txDiamondsToday,
    todayCalls,
    todayMinutes: Math.round(todaySeconds / 60),
    totalCoins: totalCoins + txCoinsTotal,
    totalDiamonds: txDiamondsTotal,
    totalCalls: callRows.length,
    totalMinutes: Math.round(totalSeconds / 60),
    week,
  };
}

// ── Real withdraw ────────────────────────────────────────────────
// Inserts a Pending withdrawal row. The Mother Panel / admin pays
// it out and flips the status — the app never marks its own
// withdrawal as paid.

export async function requestWithdrawal(hostRowId, { amountDiamonds, method, account }) {
  if (!supabase || !hostRowId) return { ok: false, error: 'no-host' };
  const amount = Math.floor(Number(amountDiamonds) || 0);
  if (amount <= 0) return { ok: false, error: 'bad-amount' };
  if (!method || !account || !String(account).trim()) {
    return { ok: false, error: 'missing-details' };
  }
  try {
    const { data, error } = await supabase
      .from('withdrawals')
      .insert({
        host_id: hostRowId,
        amount_diamonds: amount,
        method: String(method),
        account: String(account).trim(),
        status: 'Pending',
      })
      .select('id,amount_diamonds,method,account,status,created_at')
      .single();
    if (error || !data) return { ok: false, error: 'insert-failed' };
    return { ok: true, row: data };
  } catch (e) {
    return { ok: false, error: 'insert-failed' };
  }
}

export async function fetchMyWithdrawals(hostRowId) {
  if (!supabase || !hostRowId) return [];
  try {
    const res = await withTimeout(
      supabase
        .from('withdrawals')
        .select('id,amount_diamonds,method,account,status,created_at')
        .eq('host_id', hostRowId)
        .order('created_at', { ascending: false })
        .limit(20),
    );
    if (!res || res.error || !Array.isArray(res.data)) return [];
    return res.data;
  } catch (e) {
    return [];
  }
}

// Diamonds already spoken for: every withdrawal that is not
// rejected/cancelled (Pending + paid-out ones alike).
export async function fetchWithdrawnDiamonds(hostRowId) {
  if (!supabase || !hostRowId) return 0;
  try {
    const res = await withTimeout(
      supabase
        .from('withdrawals')
        .select('amount_diamonds,status')
        .eq('host_id', hostRowId),
    );
    if (!res || res.error || !Array.isArray(res.data)) return 0;
    let total = 0;
    for (const w of res.data) {
      const s = String(w.status || '').toLowerCase();
      if (s === 'rejected' || s === 'cancelled') continue;
      total += toInt(w.amount_diamonds);
    }
    return total;
  } catch (e) {
    return 0;
  }
}
