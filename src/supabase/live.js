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
import { HOSTS } from '../data';
import { CALL_RATES, COIN_PACKS, GIFTS, VIP_PACKS } from '../config';

// How long a live read may take before we give up and use demo data.
const LIVE_TIMEOUT_MS = 5000;

// Race a promise against a timeout that resolves to null.
// The timeout clears itself when the promise settles first.
function withTimeout(promise, ms = LIVE_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// One guarded select. Returns the rows array, or null on any failure
// (including RLS/permission errors and missing tables). A rejected
// query is swallowed to null so a lost race never surfaces as an
// unhandled rejection.
async function safeSelect(table, columns, buildQuery) {
  if (!supabase) return null;
  try {
    let query = supabase.from(table).select(columns);
    if (buildQuery) query = buildQuery(query);
    const res = await withTimeout(Promise.resolve(query).catch(() => null));
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

export async function fetchLiveCatalog() {
  const [rateRows, packRows, giftRows, vipRows] = await Promise.all([
    safeSelect('call_rates', 'id,name,coins_per_minute,is_active', (q) =>
      q.eq('is_active', true).order('coins_per_minute', { ascending: true })),
    safeSelect('coin_packs', 'id,coins,bonus,price_usd,is_active', (q) =>
      q.eq('is_active', true).order('coins', { ascending: true })),
    safeSelect('gifts', 'id,name,emoji,price_coins,is_active', (q) =>
      q.eq('is_active', true).order('price_coins', { ascending: true })),
    safeSelect('vip_packages', 'id,name,days,price_usd,is_active', (q) =>
      q.eq('is_active', true).order('price_usd', { ascending: true })),
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
          }))
      : null;

  // All four missing/unreadable → nothing live to use.
  if (!callRates && !coinPacks && !gifts && !vipPacks) return null;
  return { callRates, coinPacks, gifts, vipPacks };
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
  const rows = await safeSelect(
    'hosts',
    'host_id,profile_id,rate_tier,status,total_minutes,total_gifts,earnings_diamonds',
    (q) => q.order('created_at', { ascending: true })
  );
  if (!rows || rows.length === 0) return null;

  const listable = rows.filter((r) => r && r.host_id && isListableStatus(r.status));
  if (listable.length === 0) return null;

  // Profiles for these hosts (guarded; a failure just means no
  // display data — demo values fill in below).
  const profileIds = [...new Set(listable.map((r) => r.profile_id).filter(Boolean))];
  let profilesById = new Map();
  if (profileIds.length > 0) {
    const profRows = await safeSelect('profiles', 'id,username,country,language,gender,avatar_url', (q) =>
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
    return {
      id: String(row.host_id),
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
      // Demo hosts keep their simulated presence; new panel hosts
      // show online once approved (no presence system exists yet).
      online: demo ? !!demo.online : true,
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

// Demo fallbacks, re-exported so the store has one place to look.
export const DEMO_CALL_RATES = CALL_RATES;
export const DEMO_COIN_PACKS = COIN_PACKS;
export const DEMO_GIFTS = GIFTS;
export const DEMO_VIP_PACKS = VIP_PACKS;
export const DEMO_HOSTS = HOSTS;
