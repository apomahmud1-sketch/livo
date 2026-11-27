// Livo — live-room multi-guest (co-anchor) requests over Supabase (2026-11-27).
//
// Table: public.live_guest_requests (id, host_id, guest_id, guest_name,
// guest_display_id, status, created_at, decided_at).
//   status: pending / approved / declined / ended.
// A viewer taps "Request to join" in a live room; the host sees the
// request in the Multi-guest Management panel and Agrees (approved) or
// Declines. An approved guest switches to broadcaster in the same Agora
// channel (see agoraUidForUser in ../agora/LiveVideo.js — the host
// matches the joined remote uid to the approved guest with the same
// deterministic hash). The guest ends the co-guest state (or the host
// removes them) by setting the row to 'ended'. RLS (see
// ~/workspace/livo-build/live-guest-requests-setup.sql) lets a guest
// only ever set their OWN row to 'ended' — they can never approve
// themselves — and lets the host decide only their own room's rows.
// No fake / demo requests anywhere — an empty room shows an honest
// empty state.
import { supabase } from './client';
import { withTimeout } from './timeout';

function mapRow(r) {
  return {
    id: r.id,
    hostId: r.host_id,
    guestId: r.guest_id,
    guestName: r.guest_name || 'Guest',
    guestDisplayId: r.guest_display_id || null,
    status: r.status || 'pending',
    createdAt: r.created_at,
    decidedAt: r.decided_at || null,
  };
}

// A viewer asks to join a host's live as a co-guest. Returns the
// inserted row or null (never throws — the button shows the failure).
export async function requestGuestJoin({ hostId, guestId, guestName, guestDisplayId }) {
  if (!supabase || !hostId || !guestId) return null;
  try {
    const { data, error } = await supabase
      .from('live_guest_requests')
      .insert({
        host_id: String(hostId),
        guest_id: guestId,
        guest_name: (guestName || 'Guest').slice(0, 40),
        guest_display_id: guestDisplayId ? String(guestDisplayId).slice(0, 20) : null,
        status: 'pending',
      })
      .select('id,host_id,guest_id,guest_name,guest_display_id,status,created_at,decided_at')
      .single();
    if (error || !data) return null;
    return mapRow(data);
  } catch (e) {
    return null;
  }
}

// The host's open requests for one room (pending + approved, newest
// first). Empty = no requests — never invented.
export async function fetchGuestRequests(hostId) {
  if (!supabase || !hostId) return [];
  try {
    const { data, error } = (await withTimeout(
      supabase
        .from('live_guest_requests')
        .select('id,host_id,guest_id,guest_name,guest_display_id,status,created_at,decided_at')
        .eq('host_id', String(hostId))
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(20),
    )) || {};
    if (error || !Array.isArray(data)) return [];
    return data.map(mapRow);
  } catch (e) {
    return [];
  }
}

// Host decides a request: 'approved' or 'declined'. Returns the
// updated row or null. The RLS policy only lets the room's host
// decide — a guest calling this on someone else's room gets null.
export async function decideGuestRequest(id, status) {
  if (!supabase || !id || (status !== 'approved' && status !== 'declined')) return null;
  try {
    const { data, error } = await supabase
      .from('live_guest_requests')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
      .select('id,host_id,guest_id,guest_name,guest_display_id,status,created_at,decided_at')
      .single();
    if (error || !data) return null;
    return mapRow(data);
  } catch (e) {
    return null;
  }
}

// End a co-guest session (guest leaves, or the host removes them).
// The guest may only set their OWN row to 'ended'; the host may end
// any row in their own room. Returns true when a row was updated.
export async function endGuestRequest(id) {
  if (!supabase || !id) return false;
  try {
    const { data, error } = await supabase
      .from('live_guest_requests')
      .update({ status: 'ended', decided_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .single();
    return !error && !!data;
  } catch (e) {
    return false;
  }
}

// Realtime: call onChange for every insert/update on this room's
// guest requests (the host's Multi-guest panel). Returns an
// unsubscribe function.
export function subscribeGuestRequests(hostId, onChange) {
  if (!supabase || !hostId || typeof onChange !== 'function') {
    return () => {};
  }
  const roomId = String(hostId);
  const channel = supabase
    .channel(`guest-requests-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'live_guest_requests' },
      (payload) => {
        const r = payload && (payload.new || payload.old);
        if (!r || String(r.host_id) !== roomId) return;
        onChange(mapRow(payload.new || r), payload.eventType || 'UPDATE');
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Realtime: the guest watches their OWN request row (approved /
// declined / ended by the host). Returns an unsubscribe function.
export function subscribeMyGuestRequest(requestId, onChange) {
  if (!supabase || !requestId || typeof onChange !== 'function') {
    return () => {};
  }
  const id = String(requestId);
  const channel = supabase
    .channel(`guest-request-${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'live_guest_requests' },
      (payload) => {
        const r = payload && payload.new;
        if (!r || String(r.id) !== id) return;
        onChange(mapRow(r));
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
