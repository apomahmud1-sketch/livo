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
import { getSessionUser } from './auth';
import { withTimeout } from './timeout';

// Signed-in user id, or null when there is no session.
// Identity from the local session (see getSessionUser in auth.js):
// the network getUser() call can fail on a phone right after login.
export async function getCurrentUserId() {
  const user = await getSessionUser();
  return (user && user.id) || null;
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
// profile (username / country / language / age / avatar) and the
// REAL unread count (messages to me with read_at still NULL).
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
          .select('id,username,country,language,gender,age,avatar_url')
          .in('id', otherIds),
      )) || {};
    if (Array.isArray(profRows)) {
      profilesById = new Map(profRows.filter((p) => p && p.id).map((p) => [p.id, p]));
    }

    // Real unread counts: messages to me from each counterpart
    // with read_at still NULL. Guarded separately so a missing
    // read_at column never breaks the conversation list.
    const unreadByOther = new Map();
    try {
      const { data: unreadRows } =
        (await withTimeout(
          supabase
            .from('messages')
            .select('sender_id')
            .eq('recipient_id', meId)
            .is('read_at', null)
            .limit(500),
        )) || {};
      if (Array.isArray(unreadRows)) {
        unreadRows.forEach((r) => {
          if (!r || !r.sender_id) return;
          unreadByOther.set(r.sender_id, (unreadByOther.get(r.sender_id) || 0) + 1);
        });
      }
    } catch (e) {
      // Unread stays 0 — the list still renders.
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
        age: typeof prof.age === 'number' ? prof.age : null,
        avatarUrl: prof.avatar_url || null,
        lastBody: last.body || '',
        lastAt: last.created_at,
        unread: unreadByOther.get(otherId) || 0,
      };
    });
  } catch (e) {
    return [];
  }
}

// Mark one conversation read: stamp read_at on every unread
// message from the other person to me. Never throws — returns
// false when the write did not land (e.g. no network).
export async function markConversationRead(meId, otherId) {
  if (!supabase || !meId || !otherId) return false;
  try {
    const res = await withTimeout(
      supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_id', meId)
        .eq('sender_id', otherId)
        .is('read_at', null),
    );
    if (!res) return false;
    return !res.error;
  } catch (e) {
    return false;
  }
}

// Call history for MessagesScreen: real `calls` rows where I am
// the caller or the host, newest first (max 50). The other party's
// name is resolved via hosts -> profiles (outgoing) or profiles
// directly (incoming). Only columns that exist on `calls` are
// referenced (no callee_id / call_type / ended_at).
export async function fetchCallHistory(meId) {
  if (!supabase || !meId) return [];
  try {
    // My host rows (I may be a host too): calls where I am the host
    // store my hosts.id uuid in host_id.
    let myHostIds = [];
    try {
      const { data: hostRows } =
        (await withTimeout(
          supabase.from('hosts').select('id').eq('profile_id', meId),
        )) || {};
      if (Array.isArray(hostRows)) {
        myHostIds = hostRows.map((r) => r.id).filter(Boolean);
      }
    } catch (e) {
      // Outgoing-only history below.
    }

    let q = supabase
      .from('calls')
      .select('id,caller_id,host_id,duration_seconds,cost_coins,status,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (myHostIds.length > 0) {
      q = q.or(`caller_id.eq.${meId},host_id.in.(${myHostIds.join(',')})`);
    } else {
      q = q.eq('caller_id', meId);
    }
    const { data, error } = (await withTimeout(q)) || {};
    if (error || !Array.isArray(data) || data.length === 0) return [];

    // Resolve the other party's name for each row.
    const outgoingHostUuids = [
      ...new Set(
        data.filter((r) => r.caller_id === meId && r.host_id).map((r) => r.host_id),
      ),
    ];
    const incomingCallerIds = [
      ...new Set(
        data.filter((r) => r.caller_id !== meId && r.caller_id).map((r) => r.caller_id),
      ),
    ];
    let hostByUuid = new Map();
    if (outgoingHostUuids.length > 0) {
      const { data: hostRows } =
        (await withTimeout(
          supabase
            .from('hosts')
            .select('id,host_id,profile_id')
            .in('id', outgoingHostUuids),
        )) || {};
      if (Array.isArray(hostRows)) {
        hostByUuid = new Map(
          hostRows.filter((h) => h && h.id).map((h) => [h.id, h]),
        );
      }
    }
    const profileIds = [
      ...new Set([
        ...[...hostByUuid.values()].map((h) => h.profile_id).filter(Boolean),
        ...incomingCallerIds,
      ]),
    ];
    let profilesById = new Map();
    if (profileIds.length > 0) {
      const { data: profRows } =
        (await withTimeout(
          supabase.from('profiles').select('id,username').in('id', profileIds),
        )) || {};
      if (Array.isArray(profRows)) {
        profilesById = new Map(
          profRows.filter((p) => p && p.id).map((p) => [p.id, p]),
        );
      }
    }

    return data.map((r) => {
      const outgoing = r.caller_id === meId;
      let otherName = 'Livo user';
      if (outgoing) {
        const hostRow = hostByUuid.get(r.host_id);
        const prof = hostRow && profilesById.get(hostRow.profile_id);
        otherName = (prof && prof.username) || (hostRow && hostRow.host_id) || 'Livo user';
      } else {
        const prof = profilesById.get(r.caller_id);
        otherName = (prof && prof.username) || 'Livo user';
      }
      return {
        id: r.id,
        otherName,
        direction: outgoing ? 'outgoing' : 'incoming',
        durationSeconds: typeof r.duration_seconds === 'number' ? r.duration_seconds : 0,
        costCoins: typeof r.cost_coins === 'number' ? r.cost_coins : 0,
        status: r.status || '',
        createdAt: r.created_at,
      };
    });
  } catch (e) {
    return [];
  }
}
