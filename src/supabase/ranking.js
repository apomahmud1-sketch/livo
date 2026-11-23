// ─────────────────────────────────────────────────────────────────
// Livo — real ranking data (Supabase hosts + calls + profiles).
//
// Every function here NEVER throws and NEVER invents numbers:
//   - 'all': hosts ordered by earnings_diamonds DESC (all-time).
//   - 'daily' / 'weekly' / 'monthly': calls.host_earnings_diamonds
//     summed per host (calls.host_id is the hosts.id uuid) with
//     created_at >= the window start; hosts with no calls in the
//     window simply do not appear.
// Display name/photo come from profiles via hosts.profile_id.
// Empty array = no earnings yet — screens show an honest empty
// state, never a made-up list.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';
import { withTimeout } from './timeout';

const RANK_LIMIT = 50;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function windowStart(window) {
  const now = Date.now();
  if (window === 'daily') return startOfToday();
  if (window === 'weekly') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (window === 'monthly') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

function toInt(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// Resolve display data for a set of host rows. Returns a Map keyed
// by hosts.id: { name, avatarUrl }.
async function resolveProfiles(hostRows) {
  const byId = new Map();
  const profileIds = [...new Set((hostRows || []).map((h) => h.profile_id).filter(Boolean))];
  if (profileIds.length === 0 || !supabase) return byId;
  try {
    const res = await withTimeout(
      supabase.from('profiles').select('id,username,avatar_url').in('id', profileIds),
    );
    if (res && !res.error && Array.isArray(res.data)) {
      for (const p of res.data) {
        if (p && p.id) byId.set(p.id, { name: p.username || null, avatarUrl: p.avatar_url || null });
      }
    }
  } catch (e) { /* display data is best-effort */ }
  return byId;
}

function buildRows(hostRows, scoresByHostId, profilesById) {
  const hostById = new Map((hostRows || []).filter((h) => h && h.id).map((h) => [h.id, h]));
  const rows = [];
  for (const [hostUuid, score] of scoresByHostId.entries()) {
    const host = hostById.get(hostUuid);
    if (!host) continue;
    const prof = profilesById.get(host.profile_id) || {};
    rows.push({
      hostId: hostUuid,
      hostCode: host.host_id || null,
      name: prof.name || `Host ${host.host_id || ''}`.trim(),
      avatarUrl: prof.avatarUrl || null,
      score,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, RANK_LIMIT).map((r, i) => ({ ...r, rank: i + 1 }));
}

// Fetch one ranking window. window: 'all' | 'daily' | 'weekly' |
// 'monthly'. Returns [{ hostId, hostCode, name, avatarUrl, score,
// rank }] sorted by score DESC, or [] when there is nothing.
export async function fetchRanking(window = 'daily') {
  if (!supabase) return [];
  try {
    if (window === 'all') {
      const res = await withTimeout(
        supabase
          .from('hosts')
          .select('id,host_id,profile_id,earnings_diamonds')
          .order('earnings_diamonds', { ascending: false })
          .limit(RANK_LIMIT),
      );
      if (!res || res.error || !Array.isArray(res.data)) return [];
      const hostRows = res.data.filter((h) => toInt(h.earnings_diamonds) > 0);
      if (hostRows.length === 0) return [];
      const profilesById = await resolveProfiles(hostRows);
      const scores = new Map(hostRows.map((h) => [h.id, toInt(h.earnings_diamonds)]));
      return buildRows(hostRows, scores, profilesById);
    }

    const start = windowStart(window);
    if (!start) return [];
    const res = await withTimeout(
      supabase
        .from('calls')
        .select('host_id,host_earnings_diamonds')
        .gte('created_at', start)
        .limit(1000),
    );
    if (!res || res.error || !Array.isArray(res.data)) return [];
    const scores = new Map();
    for (const c of res.data) {
      if (!c || !c.host_id) continue;
      const v = toInt(c.host_earnings_diamonds);
      if (v <= 0) continue;
      scores.set(c.host_id, (scores.get(c.host_id) || 0) + v);
    }
    if (scores.size === 0) return [];
    const hostRes = await withTimeout(
      supabase.from('hosts').select('id,host_id,profile_id').in('id', [...scores.keys()]),
    );
    if (!hostRes || hostRes.error || !Array.isArray(hostRes.data)) return [];
    const profilesById = await resolveProfiles(hostRes.data);
    return buildRows(hostRes.data, scores, profilesById);
  } catch (e) {
    return [];
  }
}
