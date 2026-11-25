// ─────────────────────────────────────────────────────────────────
// Livo — Realtime presence for live rooms (viewer counts).
//
// One channel per live room: `live-room:<host_id>`. A viewer joins
// the channel when they enter the room and leaves when they exit;
// the host's own app also joins while live. The presence state of
// the channel IS the viewer count — no stored counter, no polling.
//
// Wiring status (2026-11-22): the helpers below are ready, but NO
// screen joins a room channel yet, and HomeScreen still reads its
// local VIEWERS map, so live.js reports viewerCount: null for now.
// Next step (separate pass): VideoCallScreen calls
// joinLiveRoom(host.id, viewer) on entry + leaveLiveRoom on exit,
// and HomeScreen/store read host.viewerCount from live.js.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';

function roomChannelName(hostId) {
  return `live-room:${String(hostId)}`;
}

// Count the tracked presences in a channel's state object.
export function countPresenceState(state) {
  if (!state || typeof state !== 'object') return 0;
  let total = 0;
  for (const key of Object.keys(state)) {
    const entries = state[key];
    if (Array.isArray(entries)) total += entries.length;
  }
  return total;
}

// A viewer (or the host) enters a live room. Returns the channel,
// or null when Realtime is unavailable. Call leaveLiveRoom with
// the returned channel when the room is left.
export function joinLiveRoom(hostId, viewer) {
  if (!supabase || !hostId) return null;
  try {
    const channel = supabase.channel(roomChannelName(hostId));
    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      try {
        await channel.track({
          user_id: (viewer && viewer.id) || `anon-${Date.now()}`,
          name: (viewer && viewer.name) || 'Guest',
          joined_at: new Date().toISOString(),
        });
      } catch (e) {
        // Tracking failed — the channel still counts as joined.
      }
    });
    return channel;
  } catch (e) {
    return null;
  }
}

export async function leaveLiveRoom(channel) {
  if (!channel) return;
  try {
    await channel.untrack();
  } catch (e) {
    // Already gone — unsubscribe anyway.
  }
  try {
    await supabase.removeChannel(channel);
  } catch (e) {
    // Channel already removed.
  }
}

// Watch a room's viewer LIST (presence entries with names) without
// joining as a viewer. onViewers(entries) fires on every presence
// change with the current entries [{ userId, name, joinedAt }].
// Returns an unsubscribe function, or null when Realtime is
// unavailable. Used by the Live Room's top-viewers row — real
// viewers only, never invented names.
export function subscribeRoomPresence(hostId, onViewers) {
  if (!supabase || !hostId || typeof onViewers !== 'function') return null;
  try {
    const channel = supabase.channel(roomChannelName(hostId));
    const report = () => {
      try {
        const state = channel.presenceState();
        const entries = [];
        if (state && typeof state === 'object') {
          for (const key of Object.keys(state)) {
            const list = state[key];
            if (Array.isArray(list)) {
              list.forEach((e) => {
                entries.push({
                  userId: (e && e.user_id) || key,
                  name: (e && e.name) || 'Guest',
                  joinedAt: (e && e.joined_at) || null,
                });
              });
            }
          }
        }
        onViewers(entries);
      } catch (e) {
        // Never break the caller on a presence error.
      }
    };
    channel
      .on('presence', { event: 'sync' }, report)
      .on('presence', { event: 'join' }, report)
      .on('presence', { event: 'leave' }, report)
      .subscribe();
    return async () => {
      try {
        await supabase.removeChannel(channel);
      } catch (e) {
        // Channel already removed.
      }
    };
  } catch (e) {
    return null;
  }
}

// Watch a room's viewer count without joining as a viewer.
// onViewers(count) fires on every presence change. Returns an
// unsubscribe function, or null when Realtime is unavailable.
export function subscribeRoomViewers(hostId, onViewers) {
  if (!supabase || !hostId || typeof onViewers !== 'function') return null;
  try {
    const channel = supabase.channel(roomChannelName(hostId));
    const report = () => {
      try {
        onViewers(countPresenceState(channel.presenceState()));
      } catch (e) {
        // Never break the caller on a presence error.
      }
    };
    channel
      .on('presence', { event: 'sync' }, report)
      .on('presence', { event: 'join' }, report)
      .on('presence', { event: 'leave' }, report)
      .subscribe();
    return async () => {
      try {
        await supabase.removeChannel(channel);
      } catch (e) {
        // Channel already removed.
      }
    };
  } catch (e) {
    return null;
  }
}
