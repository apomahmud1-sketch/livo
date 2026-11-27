// ─────────────────────────────────────────────────────────────────
// Livo — live Supabase reads with demo fallback.
//
// Every function here NEVER throws and NEVER hangs. Any failure —
// network error, 401 permission denied (the anon SELECT grants
// only arrive when the admin pastes supabase-setup.sql), table
// missing, empty result, slow response — returns null, and the
// store keeps the local demo data (data.js / config.js). The app
// works exactly as before until the setup SQL is pasted; after
// that these reads start returning live rows automatically, with
// no APK update needed for content changes.
// ─────────────────────────────────────────────────────────────────
import { supabase } from './client';
import { withTimeout } from './timeout';
import { HOSTS } from '../data';
import { CALL_RATES, COIN_PACKS, GIFTS, VIP_PACKS } from '../config';

// Live reads use the shared timeout guard (src/supabase/timeout.js,
// 8s): a stalled query resolves to null and the store keeps demo
// data instead of spinning forever.
const LIVE_TIMEOUT_MS = 8000;

// One guarded select. Returns the rows array, or null on any failure
// (including RLS/permission errors and missing tables). A rejected
// query is swallowed to null so a lost race never surfaces as an
// unhandled rejection.
async function safeSelect(table, columns, buildQuery) {
  if (!supabase) return null;
  try {
    let query = supabase.from(table).select(columns);
    if (buildQuery) query = buildQuery(query);
    const res = await withTimeout(Promise.resolve(query).catch(() => null), LIVE_TIMEOUT_MS);
    if (!res || res.error || !Array.isArray(res.data)) return null;
    return res.data;
  } catch (e) {
    return null;
  }
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ── Catalog tables (call_rates / coin_packs / gifts / vip_packages) ──
// Each returns the mapped array in the app's own shape, or null when
// the table is unreadable or has no usable rows (demo stays).

// VIP packages also carry panel-controlled price_coins,
// badge_color and privileges when those columns exist (added by
// the panel workstream). An older DB without them still loads —
// the select retries with the old column list, exactly like the
// hosts presence retry below.
async function fetchVipRows() {
  const rows = await safeSelect('vip_packages', 'id,name,days,price_usd,price_coins,badge_color,privileges,is_active', (q) =>
    q.eq('is_active', true).order('price_usd', { ascending: true }));
  if (rows) return rows;
  return safeSelect('vip_packages', 'id,name,days,price_usd,is_active', (q) =>
    q.eq('is_active', true).order('price_usd', { ascending: true }));
}

function normalizePrivileges(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (typeof v === 'string' && v.trim()) {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return normalizePrivileges(parsed);
      } catch (e) { /* not JSON — fall through to comma split */ }
    }
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

export async function fetchLiveCatalog() {
  const [rateRows, packRows, giftRows, vipRows, diamondRows] = await Promise.all([
    safeSelect('call_rates', 'id,name,coins_per_minute,is_active', (q) =>
      q.eq('is_active', true).order('coins_per_minute', { ascending: true })),
    safeSelect('coin_packs', 'id,coins,bonus,price_usd,is_active', (q) =>
      q.eq('is_active', true).order('coins', { ascending: true })),
    safeSelect('gifts', 'id,name,emoji,price_coins,is_active,animation_url', (q) =>
      q.eq('is_active', true).order('price_coins', { ascending: true })),
    fetchVipRows(),
    safeSelect('diamond_packs', 'id,diamonds,bonus,price_usd,is_active', (q) =>
      q.eq('is_active', true).order('diamonds', { ascending: true })),
  ]);

  const callRates =
    rateRows && rateRows.length > 0
      ? rateRows
          .filter((r) => r && typeof r.id === 'string' && r.id && isFiniteNumber(r.coins_per_minute) && r.coins_per_minute > 0)
          .map((r) => ({
            id: r.id,
            name: r.name || r.id,
            coinsPerMinute: r.coins_per_minute,
            label: `${r.coins_per_minute} coins/min`,
          }))
      : null;

  const coinPacks =
    packRows && packRows.length > 0
      ? packRows
          .filter((p) => p && typeof p.id === 'string' && p.id && isFiniteNumber(p.coins) && p.coins > 0)
          .map((p) => ({
            id: p.id,
            coins: p.coins,
            bonus: isFiniteNumber(p.bonus) ? p.bonus : 0,
            price: `$${Number(p.price_usd || 0).toFixed(2)}`,
          }))
      : null;

  const gifts =
    giftRows && giftRows.length > 0
      ? giftRows
          .filter((g) => g && typeof g.id === 'string' && g.id && isFiniteNumber(g.price_coins) && g.price_coins > 0)
          .map((g) => ({
            id: g.id,
            name: g.name || g.id,
            emoji: g.emoji || '🎁',
            price: g.price_coins,
            // Uploaded animation (Mother Panel → gift-animations
            // bucket). Null for gifts without one — those behave
            // exactly as before. A missing column on an old DB
            // just yields null, never a failed catalog load.
            animationUrl: typeof g.animation_url === 'string' && g.animation_url ? g.animation_url : null,
          }))
      : null;

  const vipPacks =
    vipRows && vipRows.length > 0
      ? vipRows
          .filter((v) => v && typeof v.id === 'string' && v.id)
          .map((v) => ({
            id: v.id,
            name: v.name || v.id,
            days: isFiniteNumber(v.days) ? v.days : 30,
            price: `$${Number(v.price_usd || 0).toFixed(2)}`,
            coins: 0,
            // Panel-controlled VIP fields (0 / null / [] when the
            // panel has not set them yet — never a crash).
            priceCoins: isFiniteNumber(v.price_coins) ? v.price_coins : 0,
            badgeColor: typeof v.badge_color === 'string' && v.badge_color.trim() ? v.badge_color.trim() : null,
            privileges: normalizePrivileges(v.privileges),
          }))
      : null;

  const diamondPacks =
    diamondRows && diamondRows.length > 0
      ? diamondRows
          .filter((p) => p && typeof p.id === 'string' && p.id && isFiniteNumber(p.diamonds) && p.diamonds > 0)
          .map((p) => ({
            id: p.id,
            diamonds: p.diamonds,
            bonus: isFiniteNumber(p.bonus) ? p.bonus : 0,
            price: `$${Number(p.price_usd || 0).toFixed(2)}`,
            priceUsd: Number(p.price_usd || 0),
          }))
      : null;

  // All five missing/unreadable → nothing live to use.
  if (!callRates && !coinPacks && !gifts && !vipPacks && !diamondPacks) return null;
  return { callRates, coinPacks, gifts, vipPacks, diamondPacks };
}

// ── Hosts ────────────────────────────────────────────────────────────
// The hosts table holds approval + rate tier; display data lives in
// profiles (username, country, language, gender, avatar_url). We
// join them in JS (two guarded selects) instead of relying on
// PostgREST embed syntax. Rows are merged onto the demo hosts by
// host_id so photos / colours / levels / online presence survive;
// genuinely new panel hosts get sensible synthesized values.
// Returns the mapped host array, or null when nothing usable exists
// (demo HOSTS stay).

const FLAG_FOR_COUNTRY = {
  BGD: '🇧🇩',
  IND: '🇮🇳',
  PAK: '🇵🇰',
  SGP: '🇸🇬',
  PHL: '🇵🇭',
  BRA: '🇧🇷',
  KOR: '🇰🇷',
};

const DEMO_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#fbbf24', '#34d399', '#fb7185'];

// Statuses the panel uses for a host that may appear on Home.
function isListableStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'approved' || s === 'active' || s === 'live' || s === 'online';
}

export async function fetchLiveHosts() {
  // Presence columns first (migration host-presence.sql); if the
  // select fails (columns not added yet on this project), retry
  // with the old column list and demo presence instead of losing
  // the whole live host list.
  let rows = await safeSelect(
    'hosts',
    'host_id,profile_id,rate_tier,status,total_minutes,total_gifts,earnings_diamonds,is_online,last_seen,live_started_at,live_chat_disabled,verification_status',
    (q) => q.order('created_at', { ascending: true })
  );
  let withPresence = true;
  if (!rows) {
    withPresence = false;
    rows = await safeSelect(
      'hosts',
      'host_id,profile_id,rate_tier,status,total_minutes,total_gifts,earnings_diamonds',
      (q) => q.order('created_at', { ascending: true })
    );
  }
  if (!rows || rows.length === 0) return null;

  const listable = rows.filter((r) => r && r.host_id && isListableStatus(r.status));
  if (listable.length === 0) return null;

  // Profiles for these hosts (guarded; a failure just means no
  // display data — demo values fill in below).
  const profileIds = [...new Set(listable.map((r) => r.profile_id).filter(Boolean))];
  let profilesById = new Map();
  if (profileIds.length > 0) {
    const profRows = await safeSelect('profiles', 'id,user_id,username,country,language,gender,avatar_url,vip_level', (q) =>
      q.in('id', profileIds)
    );
    if (profRows) {
      profilesById = new Map(profRows.filter((p) => p && p.id).map((p) => [p.id, p]));
    }
  }

  const demoById = new Map(HOSTS.map((h) => [String(h.id), h]));
  const mapped = listable.map((row, i) => {
    const demo = demoById.get(String(row.host_id));
    const prof = profilesById.get(row.profile_id) || {};
    const country = String(prof.country || (demo && demo.country) || 'BGD').toUpperCase();
    // Real presence (heartbeat): online only when the host's app
    // says is_online AND its last_seen is fresh — a killed app
    // stops heartbeating, so a stale flag ages out on its own.
    // Without the presence columns, demo presence is kept.
    const online = withPresence
      ? isHostOnlineNow(row.is_online, row.last_seen)
      : demo
        ? !!demo.online
        : true;
    return {
      id: String(row.host_id),
      userId: prof.user_id || null,
      profileId: row.profile_id || null, // [New UI] profiles.id — lets Matching exclude yourself
      name: prof.username || (demo && demo.name) || `Host ${row.host_id}`,
      country,
      flag: FLAG_FOR_COUNTRY[country] || '🌍',
      lang: prof.language || (demo && demo.lang) || 'English',
      level: (demo && demo.level) || 1,
      rateTier: row.rate_tier || (demo && demo.rateTier) || 'tier2',
      color: (demo && demo.color) || DEMO_COLORS[i % DEMO_COLORS.length],
      // Demo photos are require() numbers; remote avatars are {uri}.
      // Screens already render null photos as initials.
      photo: (demo && demo.photo) || (prof.avatar_url ? { uri: prof.avatar_url } : null),
      // Real presence from the host heartbeat (see isHostOnlineNow).
      online,
      // Viewer counts are NOT live yet: no screen joins a room
      // presence channel (see src/supabase/presence.js), and
      // HomeScreen still reads its local VIEWERS map. null means
      // "unknown", never a made-up number.
      viewerCount: null,
      lastSeen: row.last_seen || null,
      // Live-room rebuild (2026-11-28): real live start (for the
      // LIVE timer viewers see), host chat on/off, video-verified
      // badge and VIP level (vip1/vip2/vip3 → 1/2/3). Null/false
      // when unknown — never invented.
      liveStartedAt: row.live_started_at || null,
      chatDisabled: row.live_chat_disabled === true,
      verified: String(row.verification_status || '').toLowerCase() === 'verified',
      vipLevel: (() => {
        const m = /^vip(\d+)$/.exec(String(prof.vip_level || '').toLowerCase());
        return m ? Number(m[1]) : null;
      })(),
      status:
        (demo && demo.status) ||
        'Online now — video call 💬',
      gender: prof.gender || (demo && demo.gender) || 'female',
      // No live GPS: nearby.js guards non-number lat/lng already.
      lat: (demo && demo.lat) || null,
      lng: (demo && demo.lng) || null,
    };
  });

  return mapped.length > 0 ? mapped : null;
}

// ── Frames ─────────────────────────────────────────────────────
// Active frames from the panel (id, name, kind, color,
// min_vip_level, file_name). Empty array when unreadable —
// screens render no frame instead of a fake one.
export async function fetchFrames() {
  const rows = await safeSelect('frames', 'id,name,kind,color,min_vip_level,file_name', (q) =>
    q.eq('is_active', true).order('min_vip_level', { ascending: true }));
  if (!rows) return [];
  return rows
    .filter((f) => f && typeof f.id === 'string' && f.id)
    .map((f) => ({
      id: f.id,
      name: f.name || f.id,
      kind: f.kind || null,
      color: f.color || null,
      minVipLevel: typeof f.min_vip_level === 'number' ? f.min_vip_level : 0,
      fileName: f.file_name || null,
    }));
}

// ── Spin prizes / level thresholds / rewards settings ──────────
// Live values for the Lucky Spin wheel, the level ladder and the
// Daily Reward settings. Each returns null when its table/key is
// missing or unreadable — the store keeps the hardcoded fallbacks
// (rewardsConfig.js / levelData.js) instead, so the app never
// shows an empty wheel or a broken level.
export async function fetchSpinPrizes() {
  const rows = await safeSelect('spin_prizes', 'id,label,coins,weight,color,sort_order', (q) =>
    q.eq('is_active', true).order('sort_order', { ascending: true }));
  if (!rows || rows.length === 0) return null;
  const mapped = rows
    .filter((p) => p && typeof p.id === 'string' && p.id && isFiniteNumber(p.coins) && p.coins >= 0 && isFiniteNumber(p.weight) && p.weight > 0)
    .map((p) => ({
      id: p.id,
      label: typeof p.label === 'string' && p.label ? p.label : String(p.coins),
      coins: p.coins,
      weight: p.weight,
      color: typeof p.color === 'string' && p.color ? p.color : '#fde68a',
    }));
  return mapped.length > 0 ? mapped : null;
}

export async function fetchLevelThresholds() {
  const rows = await safeSelect('level_thresholds', 'level,points', (q) =>
    q.order('level', { ascending: true }));
  if (!rows || rows.length === 0) return null;
  const mapped = rows
    .filter((r) => r && Number.isInteger(r.level) && r.level >= 0 && isFiniteNumber(Number(r.points)) && Number(r.points) >= 0)
    .map((r) => ({ level: r.level, threshold: Number(r.points) }));
  return mapped.length > 0 ? mapped : null;
}

// Rewards settings from the app_config `rewards` key
// ({ free_spins_per_day, checkin_rewards[7] }). Returns the raw
// value object, or null when the key/table is missing — the store
// validates the fields and falls back to the hardcoded values.
export async function fetchRewardsSettings() {
  const rows = await safeSelect('app_config', 'value', (q) =>
    q.eq('key', 'rewards').limit(1));
  if (!rows || rows.length === 0) return null;
  const v = rows[0] && rows[0].value;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

// ── Presence ─────────────────────────────────────────────────────
// A host is really online only when their app flagged is_online
// AND heartbeated recently. The window (2 min) is generous over
// the 30s heartbeat so one slow tick never drops a live host.
const ONLINE_FRESH_MS = 120 * 1000;

export function isHostOnlineNow(isOnline, lastSeen) {
  if (!isOnline) return false;
  if (!lastSeen) return false;
  const seen = new Date(lastSeen).getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen <= ONLINE_FRESH_MS;
}

// Demo fallbacks, re-exported so the store has one place to look.
export const DEMO_CALL_RATES = CALL_RATES;
export const DEMO_COIN_PACKS = COIN_PACKS;
export const DEMO_GIFTS = GIFTS;
export const DEMO_VIP_PACKS = VIP_PACKS;
export const DEMO_HOSTS = HOSTS;
