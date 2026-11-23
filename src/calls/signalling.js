// ─────────────────────────────────────────────────────────────────
// Livo — call signalling over Supabase Realtime (postgres_changes
// on the public.calls table). No push / FCM exists, so this only
// works while the callee's app is OPEN (see the LIMITATION note at
// the bottom). An offline callee gets no invite.
//
// SCHEMA (supabase/schema.sql — the calls table has ONLY these
// columns): id, caller_id, host_id (uuid → hosts.id), channel,
// duration_seconds, billed_minutes, rate_per_minute, cost_coins,
// host_earnings_diamonds, status, created_at. There is NO
// callee_id, NO call_type and NO ended_at column — never select,
// insert or update them (PostgREST rejects the whole statement).
// Routing an invite to the right callee therefore filters on
// host_id (the callee IS the host), and voice-vs-video is derived
// from rate_per_minute (voice = half the host's video tier rate).
//
// Flow:
//   Caller: placeCall() inserts a calls row (status 'ringing') and
//     subscribes to UPDATEs on that row via subscribeToCallUpdates().
//   Callee: useIncomingCallListener() (wired once, at the app root)
//     subscribes to INSERTs where host_id = my hosts row, fetches
//     the caller's profile, and navigates to 'VideoCall' with
//     { host, callId, callType, isCallee: true, caller }.
//     The existing incoming-call screen in VideoCallScreen then
//     shows the REAL caller (photo + name, Accept / Decline only).
//   Accept: acceptCall() sets status 'accepted'; both sides join
//     the same Agora channel `livo-call-<hostId>` (see LiveVideo.js,
//     which fetches a fresh token per call from the token server).
//   Decline / end: declineCall() / endCallRecord() update the row;
//     the other side sees it through its subscription. A caller
//     who backs out (or waits out the ring timeout) while the row
//     is still 'ringing' marks it 'missed' via markCallMissed().
//
// Identity: the signed-in user is (await supabase.auth.getUser())
// .data.user and user.id equals profiles.id. A "host" on screen is
// the live-mapped object from src/supabase/live.js: host.id is the
// hosts.host_id TEXT (not the hosts.id uuid), so resolveHostRow()
// looks the hosts row up by host_id to get hosts.id + profile_id.
// Demo hosts (id '1'..'6', no DB row) have no callee to signal to:
// placeCall() returns null and the call proceeds local-only, exactly
// as before — signalling is best-effort, never a crash.
// ─────────────────────────────────────────────────────────────────
import { supabase } from '../supabase/client';
import { getVoiceCallRate } from '../config';

// ── Channel ──────────────────────────────────────────────────────
// One Agora channel per host, shared by video and voice calls.
export function buildChannelName(hostId) {
  return `livo-call-${hostId}`;
}

// ── Identity ─────────────────────────────────────────────────────
export async function getCurrentUserId() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return (data && data.user && data.user.id) || null;
  } catch (e) {
    return null;
  }
}

// ── Host resolution ──────────────────────────────────────────────
// Live hosts carry host.id = hosts.host_id (text). Look the row up
// so the calls row can store the real hosts.id uuid (host_id FK).
// Returns { hostUuid, profileId } or null when the host has no DB
// row (demo host) or the lookup fails.
export async function resolveHostRow(host) {
  if (!supabase || !host || host.id == null) return null;
  const hostIdText = String(host.id);
  try {
    // Live host: host_id text column.
    let { data, error } = await supabase
      .from('hosts')
      .select('id,profile_id')
      .eq('host_id', hostIdText)
      .maybeSingle();
    if (!error && data) {
      return { hostUuid: data.id, profileId: data.profile_id || null };
    }
    // Fallback: host.id already is the hosts.id uuid.
    const byId = await supabase
      .from('hosts')
      .select('id,profile_id')
      .eq('id', hostIdText)
      .maybeSingle();
    if (!byId.error && byId.data) {
      return { hostUuid: byId.data.id, profileId: byId.data.profile_id || null };
    }
  } catch (e) {
    // Lookup failure → local-only call (see placeCall).
  }
  return null;
}

// ── Profiles ─────────────────────────────────────────────────────
// Display data for the incoming-call screen: real photo + name.
export async function fetchCallerProfile(profileId) {
  if (!supabase || !profileId) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,avatar_url,country')
      .eq('id', profileId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      name: data.username || 'Livo caller',
      photo: data.avatar_url ? { uri: data.avatar_url } : null,
      country: data.country || null,
    };
  } catch (e) {
    return null;
  }
}

// ── Place a call (caller side) ───────────────────────────────────
// Inserts the ringing row. ratePerMinute is REQUIRED by the calls
// table (NOT NULL) — pass the live tier rate (video) or the
// half-price voice rate. callType is accepted for the caller's
// convenience but NOT stored: the calls table has no call_type
// column — the callee derives voice-vs-video from rate_per_minute
// (see useIncomingCallListener). Returns the inserted row, or null
// when there is no signed-in user, no DB host row (demo host), or
// the insert fails — the caller then proceeds local-only, as before.
export async function placeCall({ host, callType = 'video', ratePerMinute }) {
  if (!supabase) return null;
  const callerId = await getCurrentUserId();
  if (!callerId) return null;
  const resolved = await resolveHostRow(host);
  if (!resolved) return null;
  const perMinute = Number(ratePerMinute);
  if (!Number.isFinite(perMinute) || perMinute <= 0) return null;
  try {
    const { data, error } = await supabase
      .from('calls')
      .insert({
        caller_id: callerId,
        host_id: resolved.hostUuid,
        channel: buildChannelName(host.id),
        rate_per_minute: perMinute,
        status: 'ringing',
      })
      .select('id,caller_id,host_id,channel,status')
      .single();
    if (error || !data) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ── Accept / decline / end ───────────────────────────────────────
export async function acceptCall(callId) {
  if (!supabase || !callId) return false;
  try {
    const { error } = await supabase
      .from('calls')
      .update({ status: 'accepted' })
      .eq('id', callId);
    return !error;
  } catch (e) {
    return false;
  }
}

export async function declineCall(callId) {
  if (!supabase || !callId) return false;
  try {
    const { error } = await supabase
      .from('calls')
      .update({ status: 'declined' })
      .eq('id', callId);
    return !error;
  } catch (e) {
    return false;
  }
}

// The caller backed out (or the ring timed out) while the call was
// still ringing — the callee never answered. Only flips rows that
// are still 'ringing', so an answered call can never be rewritten
// as missed. Returns false when there is no ringing row (already
// answered / declined / ended).
export async function markCallMissed(callId) {
  if (!supabase || !callId) return false;
  try {
    const { error } = await supabase
      .from('calls')
      .update({ status: 'missed' })
      .eq('id', callId)
      .eq('status', 'ringing');
    return !error;
  } catch (e) {
    return false;
  }
}

// Final billing record for a finished call. costCoins is the amount
// already charged in the app (store.chargeCall / chargeVoiceCall);
// hostEarningsDiamonds is the host's share after commission.
// Also adds the billed minutes to the host row's lifetime
// total_minutes (best-effort — a failure there never blocks the
// call flow or this return). Returns false when there is no call
// row to update (local-only call) — the in-app charge still stands,
// nothing is lost.
export async function endCallRecord(callId, { durationSeconds = 0, billedMinutes = 0, costCoins = 0, hostEarningsDiamonds = 0 } = {}) {
  if (!supabase || !callId) return false;
  let ok = false;
  try {
    // Never overwrite a finished billing record: if the row is
    // already 'ended' with a real cost (the other side recorded
    // first — e.g. the caller ended and the callee's screen is
    // now closing), leave it alone. A cost-0 'ended' row (the
    // host closed it first) is still overwritten below by the
    // caller's real billing. Read failure → proceed (old behaviour).
    try {
      const { data: existing } = await supabase
        .from('calls')
        .select('status,cost_coins')
        .eq('id', callId)
        .maybeSingle();
      if (existing && existing.status === 'ended' && (existing.cost_coins || 0) > 0) {
        return true;
      }
    } catch (e) {
      // Best effort — fall through to the update.
    }
    const { error } = await supabase
      .from('calls')
      .update({
        status: 'ended',
        duration_seconds: Math.max(0, Math.floor(durationSeconds)),
        billed_minutes: Math.max(0, Math.floor(billedMinutes)),
        cost_coins: Math.max(0, Math.floor(costCoins)),
        host_earnings_diamonds: Math.max(0, Math.floor(hostEarningsDiamonds)),
      })
      .eq('id', callId);
    ok = !error;
  } catch (e) {
    return false;
  }
  if (ok) {
    // Best-effort host lifetime total: add the billed minutes
    // (falling back to whole minutes of the duration when the
    // caller did not pass billed minutes). Never throws, never
    // blocks the call flow.
    try {
      const minutes =
        Math.max(0, Math.floor(billedMinutes)) ||
        Math.floor(Math.max(0, durationSeconds) / 60);
      if (minutes > 0) {
        const { data: call } = await supabase
          .from('calls')
          .select('host_id')
          .eq('id', callId)
          .maybeSingle();
        if (call && call.host_id) {
          const { data: hostRow } = await supabase
            .from('hosts')
            .select('total_minutes')
            .eq('id', call.host_id)
            .maybeSingle();
          if (hostRow) {
            await supabase
              .from('hosts')
              .update({ total_minutes: (hostRow.total_minutes || 0) + minutes })
              .eq('id', call.host_id);
          }
        }
      }
    } catch (e) {
      // Best effort only — the calls row above already stands.
    }
  }
  return ok;
}

export async function fetchCall(callId) {
  if (!supabase || !callId) return null;
  try {
    const { data, error } = await supabase
      .from('calls')
      .select('id,caller_id,host_id,channel,status,rate_per_minute')
      .eq('id', callId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ── Subscriptions ────────────────────────────────────────────────
// Caller side: watch one call row for the callee's answer.
// onUpdate receives the new row ({ status, ... }). Returns an
// unsubscribe function. Safe to call with a null callId (no-op).
export function subscribeToCallUpdates(callId, onUpdate) {
  if (!supabase || !callId || typeof onUpdate !== 'function') {
    return () => {};
  }
  const channel = supabase
    .channel(`livo-call-${callId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
      (payload) => {
        if (payload && payload.new) onUpdate(payload.new);
      },
    )
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (e) {
      // Already removed — ignore.
    }
  };
}

// Callee side: listen for new invites addressed to me.
// onInvite receives { call, caller, host } where host is a minimal
// VideoCallScreen host object (id = hosts.host_id text, so the
// Agora channel matches the caller's `livo-call-<hostId>`).
// Wire ONCE at the app root (App.js), inside the navigation
// container, e.g.:
//   const navigationRef = ...; // the app's existing ref
//   useIncomingCallListener(navigationRef);
// It does nothing when nobody is signed in.
//
// Routing: the calls table has no callee_id column, so the
// subscription filters on host_id = MY hosts row (the callee IS
// the host). Voice-vs-video is derived from rate_per_minute:
// a voice invite bills at half the host's video tier rate
// (getVoiceCallRate). A user with no hosts row receives no calls.
export function useIncomingCallListener(navigationRef) {
  // A hook-shaped helper without React imports: the caller (App.js)
  // calls this inside a useEffect and keeps the returned cleanup.
  // Kept hook-free here so screens can also call it directly.
  let unsubscribe = () => {};
  let stopped = false;
  (async () => {
    const myId = await getCurrentUserId();
    if (stopped || !myId || !supabase) return;
    // My hosts row: invites to me are rows whose host_id is this id.
    let myHostUuid = null;
    try {
      const { data } = await supabase
        .from('hosts')
        .select('id')
        .eq('profile_id', myId)
        .maybeSingle();
      if (data) myHostUuid = data.id;
    } catch (e) {
      // No host row readable — cannot route invites to me.
    }
    if (stopped || !myHostUuid) return;
    const channel = supabase
      .channel(`livo-incoming-${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls', filter: `host_id=eq.${myHostUuid}` },
        async (payload) => {
          const call = payload && payload.new;
          if (!call || call.status !== 'ringing') return;
          if (call.caller_id === myId) return; // my own outgoing call
          const caller = await fetchCallerProfile(call.caller_id);
          // The host object for VideoCallScreen: resolve the hosts
          // row so the channel name and rate tier match the caller.
          let host = null;
          let rateTier = 'tier2';
          try {
            const { data } = await supabase
              .from('hosts')
              .select('id,host_id,profile_id,rate_tier')
              .eq('id', call.host_id)
              .maybeSingle();
            if (data) {
              rateTier = data.rate_tier || 'tier2';
              host = {
                id: String(data.host_id),
                name: (caller && caller.name) || 'Host',
                rateTier,
                photo: (caller && caller.photo) || null,
                color: '#a78bfa',
                online: true,
                gender: 'female',
              };
            }
          } catch (e) {
            // Host lookup failed — still show the incoming screen
            // with the caller as the host object.
          }
          if (!host) {
            host = {
              id: String(call.channel || '').replace(/^livo-call-/, '') || 'unknown',
              name: (caller && caller.name) || 'Livo caller',
              rateTier,
              photo: (caller && caller.photo) || null,
              color: '#a78bfa',
              online: true,
              gender: 'female',
            };
          }
          // No call_type column exists: a voice invite bills at
          // half the host's video tier rate.
          const isVoice =
            Number(call.rate_per_minute) === getVoiceCallRate(rateTier).coinsPerMinute;
          const nav = navigationRef && navigationRef.current;
          if (nav && nav.navigate) {
            nav.navigate('VideoCall', {
              host,
              callId: call.id,
              callType: isVoice ? 'voice' : 'video',
              audioOnly: isVoice,
              isCallee: true,
              caller,
            });
          }
        },
      )
      .subscribe();
    unsubscribe = () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // Already removed — ignore.
      }
    };
  })();
  return () => {
    stopped = true;
    unsubscribe();
  };
}

// ── LIMITATION ───────────────────────────────────────────────────
// Realtime signalling only works while the app is OPEN: Supabase
// Realtime is a live websocket, and there is no push / FCM
// infrastructure in this project. An offline callee receives no
// invite, no missed-call notification, and the caller just waits.
// Do NOT build push here — that needs FCM credentials, a server
// sender, and a user decision (see the worker report).
