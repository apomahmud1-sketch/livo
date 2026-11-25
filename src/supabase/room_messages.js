// Livo — real public live-room chat over Supabase (2026-11-25).
//
// Table: public.room_messages (id, host_id, sender_id, sender_name,
// body, created_at). host_id is the hosts.host_id text. RLS lets
// anyone read a room's messages; only the signed-in sender can
// insert their own. No fake / scripted messages anywhere in this
// module — an empty room shows an honest empty state.
import { supabase } from './client';
import { withTimeout } from './timeout';

function mapRow(r) {
  return {
    id: r.id,
    senderId: r.sender_id,
    senderName: r.sender_name || 'Guest',
    text: r.body || '',
    created_at: r.created_at,
  };
}

// Latest messages for one room, oldest first (default last 50).
export async function fetchRoomMessages(hostId, limit = 50) {
  if (!supabase || !hostId) return [];
  try {
    const { data, error } = (await withTimeout(
      supabase
        .from('room_messages')
        .select('id,sender_id,sender_name,body,created_at')
        .eq('host_id', String(hostId))
        .order('created_at', { ascending: false })
        .limit(limit),
    )) || {};
    if (error || !Array.isArray(data)) return [];
    return data.reverse().map(mapRow);
  } catch (e) {
    return [];
  }
}

// Insert one room message. Returns the inserted row or null.
export async function sendRoomMessage({ hostId, senderId, senderName, body }) {
  if (!supabase || !hostId || !senderId) return null;
  const text = String(body || '').trim();
  if (!text) return null;
  try {
    const { data, error } = await supabase
      .from('room_messages')
      .insert({
        host_id: String(hostId),
        sender_id: senderId,
        sender_name: (senderName || 'Guest').slice(0, 40),
        body: text.slice(0, 200),
      })
      .select('id,sender_id,sender_name,body,created_at')
      .single();
    if (error || !data) return null;
    return mapRow(data);
  } catch (e) {
    return null;
  }
}

// Realtime: call onMessage for every new message in this room.
// Returns an unsubscribe function.
export function subscribeRoomMessages(hostId, onMessage) {
  if (!supabase || !hostId || typeof onMessage !== 'function') {
    return () => {};
  }
  const roomId = String(hostId);
  const channel = supabase
    .channel(`room-chat-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_messages' },
      (payload) => {
        const r = payload && payload.new;
        if (!r || String(r.host_id) !== roomId) return;
        onMessage(mapRow(r));
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
