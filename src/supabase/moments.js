// Livo — real Moments feed over Supabase (worker 4, 2026-11-22).
//
// Table: public.moments (id, host_id text, host_name text, caption,
// video_url, likes int, is_active, created_at). host_id holds the
// author's profiles.id (uuid as text); the feed joins profiles in
// JS for the real username / avatar / country, falling back to the
// stored host_name for old rows (which were saved with host_id
// 'me'). Likes PERSIST via the increment_moment_likes RPC (one
// increment per newly-liked moment; the screen guards re-likes
// with a persisted liked-ids set). There is no comments table, so
// no comment count is shown anywhere. The feed also joins hosts
// (by profile_id) so the call button gets the author's real store
// host id and the Live pill reflects the author's real presence.
import { supabase } from './client';
import { withTimeout } from './timeout';
import { isHostOnlineNow } from './live';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map one moments row + its author profile to the feed shape the
// screen renders. `video_url` is the media (photo or video).
// `hostByProfileId` maps profiles.id -> the author's hosts row, so
// the card knows the real store host id (storeId, for the call
// button) and the author's real online state (Live pill).
function mapMoment(row, profileById, hostByProfileId) {
  const prof = (row.host_id && profileById.get(row.host_id)) || null;
  const name = (prof && prof.username) || row.host_name || 'Livo user';
  const hostRow = (row.host_id && hostByProfileId && hostByProfileId.get(row.host_id)) || null;
  return {
    id: row.id,
    host: {
      id: row.host_id || 'unknown',
      name,
      color: '#7c3aed',
      // Remote avatar when the profile has one; otherwise the card
      // renders the initial tile.
      photo: prof && prof.avatar_url ? { uri: prof.avatar_url } : null,
      country: (prof && prof.country) || null,
      // Real presence from the author's host heartbeat (false when
      // the author is not a host at all).
      online: hostRow ? isHostOnlineNow(hostRow.is_online, hostRow.last_seen) : false,
      // Real store host id (hosts.host_id) — the call button needs
      // this; null when the author is not a host.
      storeId: hostRow ? hostRow.host_id : null,
      rateTier: (hostRow && hostRow.rate_tier) || 'tier2',
    },
    caption: row.caption || '',
    // Real stored like count from the moments table (no likes table
    // exists, so this is the only real number there is).
    likes: typeof row.likes === 'number' ? row.likes : 0,
    isOwn: false,
    mediaUri: row.video_url || null,
    mediaType: null, // decided from the URL extension by the screen
    createdAt: row.created_at,
  };
}

// Persist one like: increments moments.likes for this moment via
// the increment_moment_likes RPC. Returns true when the increment
// landed, false otherwise (caller keeps the optimistic +1 and can
// retry on a later re-like). Never throws.
export async function likeMoment(momentId) {
  if (!supabase || !momentId) return false;
  try {
    const res = await withTimeout(
      supabase.rpc('increment_moment_likes', { p_id: momentId }),
    );
    if (!res) return false;
    return !res.error;
  } catch (e) {
    return false;
  }
}

// One page of the feed, newest first. `before` is an ISO timestamp
// cursor (pass null for the newest page). Returns [] on failure.
export async function fetchMoments({ limit = 10, before = null } = {}) {
  if (!supabase) return [];
  try {
    let q = supabase
      .from('moments')
      .select('id,host_id,host_name,caption,video_url,likes,is_active,created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    // Fail-fast: a stalled request resolves to null instead of
    // hanging the feed spinner forever (see timeout.js).
    const { data, error } = (await withTimeout(q)) || {};
    if (error || !Array.isArray(data) || data.length === 0) return [];

    // Join profiles for authors whose host_id is a real user id.
    const authorIds = [
      ...new Set(data.map((r) => r.host_id).filter((v) => v && UUID_RE.test(v))),
    ];
    let profileById = new Map();
    if (authorIds.length > 0) {
      const { data: profRows } =
        (await withTimeout(
          supabase
            .from('profiles')
            .select('id,username,country,avatar_url')
            .in('id', authorIds),
        )) || {};
      if (Array.isArray(profRows)) {
        profileById = new Map(profRows.filter((p) => p && p.id).map((p) => [p.id, p]));
      }
    }
    // Join hosts by profile_id (one guarded select) for the call
    // button (storeId) and the real Live pill (is_online/last_seen).
    let hostByProfileId = new Map();
    if (authorIds.length > 0) {
      const { data: hostRows } =
        (await withTimeout(
          supabase
            .from('hosts')
            .select('host_id,profile_id,rate_tier,is_online,last_seen')
            .in('profile_id', authorIds),
        )) || {};
      if (Array.isArray(hostRows)) {
        hostByProfileId = new Map(
          hostRows.filter((h) => h && h.profile_id).map((h) => [h.profile_id, h]),
        );
      }
    }
    return data.map((r) => mapMoment(r, profileById, hostByProfileId));
  } catch (e) {
    return [];
  }
}

// Upload one moment: storage bucket `moments` + a row in the
// moments table attributed to the real signed-in user
// (host_id = userId, host_name = username). Returns the inserted
// feed item, or null on failure (the caller keeps the local copy).
export async function uploadMoment({ userId, username, mediaUri, mediaType, caption }) {
  if (!supabase || !userId || !mediaUri) return null;
  try {
    const ext = mediaType === 'video' ? 'mp4' : 'jpg';
    const fileName = `moment-${userId}-${Date.now()}.${ext}`;
    const res = await fetch(mediaUri);
    const blob = await res.blob();
    const { error: upErr } = await supabase.storage.from('moments').upload(fileName, blob, {
      contentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      upsert: true,
    });
    if (upErr) return null;
    const { data: urlData } = supabase.storage.from('moments').getPublicUrl(fileName);
    const videoUrl = (urlData && urlData.publicUrl) || '';
    const { data, error: insErr } = await supabase
      .from('moments')
      .insert({
        host_id: userId,
        host_name: username || 'Livo user',
        caption: String(caption || '').trim(),
        video_url: videoUrl,
        likes: 0,
      })
      .select('id,host_id,host_name,caption,video_url,likes,is_active,created_at')
      .single();
    if (insErr || !data) return null;
    return mapMoment(data, new Map(), new Map());
  } catch (e) {
    return null;
  }
}
