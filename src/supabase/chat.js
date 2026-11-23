// Livo — real direct messages over Supabase (worker 4, 2026-11-22).
//
// Table: public.messages (id, sender_id, recipient_id, body,
// created_at). sender_id / recipient_id are profiles.id, which
// equals the Supabase auth user id. RLS lets an authenticated user
// read/insert only messages where they are the sender or the
// recipient; anon gets nothing.
//
// Every function here returns null / [] on failure instead of
// throwing, so a screen can fall back to its "sign in" prompt.
// There is no fake data anywhere in this module.
import { supabase } from './client';
import { withTimeout } from './timeout';

// Signed-in user id, or null when there is no session.
export async function getCurrentUserId() {
  try {
    if (!supabase) return null;
    // Fail-fast: a stalled auth check must not hang the Messages
    // spinner forever (see timeout.js).
    const res = await withTimeout(supabase.auth.getUser());
    const data = res && res.data;
    return (data && data.user && data.user.id) || null;
  } catch (e) {
    return null;
  }
}

// Resolve a chat profile (as passed in route.params.profile) to the
// other person's profiles.id (uuid) — the messages.recipient_id.
// Prefers an explicit profileId; otherwise looks the store host up
// in the hosts table (host_id -> profile_id).
export async function resolveRecipientProfileId(profile) {
  if (!profile || !supabase) return null;
  if (profile.profileId) return profile.profileId;
  if (!profile.storeId) return null;
  try {
    const { data, error } = await supabase
      .from('hosts')
      .select('profile_id')
      .eq('host_id', String(profile.storeId))
      .maybeSingle();
    if (error || !data || !data.profile_id) return null;
    return data.profile_id;
  } catch (e) {
    return null;
  }
}

// One page of a 1-to-1 conversation, oldest first.
// `before` is an ISO timestamp cursor: only messages created before
// it are returned (pass null for the newest page).
export async function fetchConversation({ meId, otherId, limit = 30, before = null }) {
  if (!supabase || !meId || !otherId) return [];
  try {
    let q = supabase
      .from('messages')
      .select('id,sender_id,recipient_id,body,created_at')
      .or(
        `and(sender_id.eq.${meId},recipient_id.eq.${otherId}),` +
          `and(sender_id.eq.${otherId},recipient_id.eq.${meId})`,
      )
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data, error } = (await withTimeout(q)) || {};
    if (error || !Array.isArray(data)) return [];
    return data.reverse().map((r) => ({
      id: r.id,
      me: r.sender_id === meId,
      text: r.body || '',
      created_at: r.created_at,
    }));
  } catch (e) {
    return [];
  }
}

// Insert one message. Returns the inserted row ({ id, me, text,
// created_at }) or null on failure.
export async function sendMessage({ senderId, recipientId, body }) {
  if (!supabase || !senderId || !recipientId) return null;
  const text = String(body || '').trim();
  if (!text) return null;
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: senderId, recipient_id: recipientId, body: text })
      .select('id,sender_id,recipient_id,body,created_at')
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      me: data.sender_id === senderId,
      text: data.body || '',
      created_at: data.created_at,
    };
  } catch (e) {
    return null;
  }
}

// Realtime: call onMessage for every new message in this
// conversation (either direction). Returns an unsubscribe function.
export function subscribeToConversation({ meId, otherId, onMessage }) {
  if (!supabase || !meId || !otherId || typeof onMessage !== 'function') {
    return () => {};
  }
  const channel = supabase
    .channel(`chat-${meId}-${otherId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const r = payload && payload.new;
        if (!r) return;
        const inConversation =
          (r.sender_id === meId && r.recipient_id === otherId) ||
          (r.sender_id === otherId && r.recipient_id === meId);
        if (!inConversation) return;
        onMessage({
          id: r.id,
          me: r.sender_id === meId,
          text: r.body || '',
          created_at: r.created_at,
        });
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Conversation list for MessagesScreen: the latest message per
// counterpart, newest first. Also resolves each counterpart's
// profile (username / country / language / avatar). No read
// receipts exist, so there is no unread count — `unread` is 0.
export async function fetchConversations(meId) {
  if (!supabase || !meId) return [];
  try {
    const { data, error } = (await withTimeout(
      supabase
        .from('messages')
        .select('id,sender_id,recipient_id,body,created_at')
        .or(`sender_id.eq.${meId},recipient_id.eq.${meId}`)
        .order('created_at', { ascending: false })
        .limit(200),
    )) || {};
    if (error || !Array.isArray(data) || data.length === 0) return [];

    // Latest message per counterpart (rows are newest first, so the
    // first row seen for a counterpart is its latest).
    const latestByOther = new Map();
    data.forEach((r) => {
      const other = r.sender_id === meId ? r.recipient_id : r.sender_id;
      if (!other || latestByOther.has(other)) return;
      latestByOther.set(other, r);
    });
    const otherIds = [...latestByOther.keys()];

    let profilesById = new Map();
    const { data: profRows } =
      (await withTimeout(
        supabase
          .from('profiles')
          .select('id,username,country,language,gender,avatar_url')
          .in('id', otherIds),
      )) || {};
    if (Array.isArray(profRows)) {
      profilesById = new Map(profRows.filter((p) => p && p.id).map((p) => [p.id, p]));
    }

    return otherIds.map((otherId) => {
      const last = latestByOther.get(otherId);
      const prof = profilesById.get(otherId) || {};
      return {
        counterpartId: otherId,
        name: prof.username || 'Livo user',
        country: prof.country || '',
        lang: prof.language || 'English',
        gender: prof.gender || '',
        avatarUrl: prof.avatar_url || null,
        lastBody: last.body || '',
        lastAt: last.created_at,
        unread: 0,
      };
    });
  } catch (e) {
    return [];
  }
}
