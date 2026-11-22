// Livo — real Moments feed over Supabase (worker 4, 2026-11-22).
//
// Table: public.moments (id, host_id text, host_name text, caption,
// video_url, likes int, is_active, created_at). host_id holds the
// author's profiles.id (uuid as text); the feed joins profiles in
// JS for the real username / avatar / country, falling back to the
// stored host_name for old rows (which were saved with host_id
// 'me'). There is NO likes table: the number shown is the real
// stored moments.likes column (0 for new posts), and the heart
// toggle is local-only — it is not persisted anywhere.
import { supabase } from './client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map one moments row + its author profile to the feed shape the
// screen renders. `video_url` is the media (photo or video).
function mapMoment(row, profileById) {
  const prof = (row.host_id && profileById.get(row.host_id)) || null;
  const name = (prof && prof.username) || row.host_name || 'Livo user';
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
      online: false,
    },
    caption: row.caption || '',
    // Real stored like count from the moments table (no likes table
    // exists, so this is the only real number there is).
    likes: typeof row.likes === 'number' ? row.likes : 0,
    comments: 0,
    isOwn: false,
    mediaUri: row.video_url || null,
    mediaType: null, // decided from the URL extension by the screen
    createdAt: row.created_at,
  };
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
    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) return [];

    // Join profiles for authors whose host_id is a real user id.
    const authorIds = [
      ...new Set(data.map((r) => r.host_id).filter((v) => v && UUID_RE.test(v))),
    ];
    let profileById = new Map();
    if (authorIds.length > 0) {
      const { data: profRows } = await supabase
        .from('profiles')
        .select('id,username,country,avatar_url')
        .in('id', authorIds);
      if (Array.isArray(profRows)) {
        profileById = new Map(profRows.filter((p) => p && p.id).map((p) => [p.id, p]));
      }
    }
    return data.map((r) => mapMoment(r, profileById));
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
    return mapMoment(data, new Map());
  } catch (e) {
    return null;
  }
}
