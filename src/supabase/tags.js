// ─────────────────────────────────────────────────────────────────
// Livo — admin-set tags shown on a profile (Hapa Mother "User" set).
//
// The Mother Panel writes user_tags rows (tag + category
// 'official_staff' | 'skill_activity'); the app only READS the
// active ones and shows them as small chips under the name.
// No demo tags: no rows → no chips.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';
import { withTimeout } from './timeout';

// Active tags for one profile, newest first. [] on any failure.
export async function fetchUserTags(profileId) {
  if (!supabase || !profileId) return [];
  try {
    const res = await withTimeout(
      supabase
        .from('user_tags')
        .select('id,tag,category,sent_at')
        .eq('profile_id', profileId)
        .eq('active', true)
        .order('sent_at', { ascending: false }),
    );
    if (!res || res.error || !Array.isArray(res.data)) return [];
    return res.data
      .filter((r) => r && typeof r.tag === 'string' && r.tag)
      .map((r) => ({
        id: r.id,
        tag: r.tag,
        category: r.category || null,
        sentAt: r.sent_at || null,
      }));
  } catch (e) {
    return [];
  }
}
