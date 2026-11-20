// ─────────────────────────────────────────────────────────────────
// Livo — ADMIN-CONFIGURABLE VALUES (the "mother panel" rule)
// ─────────────────────────────────────────────────────────────────
// EVERYTHING in this file is a DEFAULT only. The admin panel can
// change every value below at any time — call rates, coin packs,
// gift prices, commission, minimum withdrawal — and the app must
// read the admin values (from the backend / Supabase) instead of
// these defaults once the backend is connected. Nothing in the
// app is hard-coded forever: if the admin changes a price in the
// panel, the app shows the new price.
// ─────────────────────────────────────────────────────────────────
import Constants from 'expo-constants';

export const AGORA_APP_ID =
  (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.AGORA_APP_ID) ||
  process.env.EXPO_PUBLIC_AGORA_APP_ID ||
  '';

export const AGORA_APP_ID_IS_PLACEHOLDER = !AGORA_APP_ID;

// ── 5 call-rate tiers (coins per minute) ─────────────────────────
// Admin can rename tiers, change any price, add or remove tiers
// from the admin panel at any time. Demo prices below.
export const CALL_RATES = [
  { id: 'tier1', name: 'Tier 1', coinsPerMinute: 60, label: '60 coins/min' },
  { id: 'tier2', name: 'Tier 2', coinsPerMinute: 120, label: '120 coins/min' },
  { id: 'tier3', name: 'Tier 3', coinsPerMinute: 300, label: '300 coins/min' },
  { id: 'tier4', name: 'Tier 4', coinsPerMinute: 600, label: '600 coins/min' },
  { id: 'tier5', name: 'Tier 5', coinsPerMinute: 1200, label: '1200 coins/min' },
];

export const getCallRate = (tierId) =>
  CALL_RATES.find((r) => r.id === tierId) || CALL_RATES[1];

// [F2] Voice-call rates — audio-only calls cost HALF the video tier.
// Derived from CALL_RATES above (admin-set in the panel), never a
// fixed number: if the admin changes a video tier price, the voice
// rate follows automatically. With the demo tiers this gives
// 30/60/150/300/600 coins/min for video 60/120/300/600/1200.
// Math.floor: if the admin ever sets an odd video rate, the voice
// rate rounds down to a whole coin amount instead of a fraction.
export const VOICE_RATE_DIVISOR = 2;

export const getVoiceCallRate = (tierId) => {
  const video = getCallRate(tierId);
  const coinsPerMinute = Math.floor(video.coinsPerMinute / VOICE_RATE_DIVISOR);
  return {
    id: video.id,
    name: `${video.name} (Voice)`,
    coinsPerMinute,
    label: `${coinsPerMinute} coins/min (voice)`,
  };
};
// [/F2]

// 1 gift coin = 1 diamond for the host (admin can change this rate).
export const COIN_TO_DIAMOND_RATE = 1;

// Platform commission on host earnings, in percent (admin can change).
export const PLATFORM_COMMISSION_PERCENT = 30;

// Minimum withdrawal, in diamonds (admin can change).
export const MIN_WITHDRAW_DIAMONDS = 10000;

// [Vero] App theme copied from Vero Live: light green + white.
// `purple` is the main accent everywhere (logo, buttons, active
// tab), so changing it here re-themes the whole app at once.
// Pink stays for the LIVE badge / gift accents, like Vero's.
export const COLORS = {
  purple: '#16a34a',
  purpleDark: '#14532d',
  pink: '#ec4899',
  pinkLight: '#f472b6',
  teal: '#0b3d3a',
  gold: '#d4af37',
  white: '#ffffff',
  dark: '#111827',
  grey: '#6b7280',
  lightGrey: '#e5e7eb',
  lavender: '#f0fdf4',
  mint: '#dcfce7',
  green: '#22c55e',
};

export const GIFTS = [
  { id: 'rose', name: 'Rose', emoji: '🌹', price: 10 },
  { id: 'heart', name: 'Heart', emoji: '❤️', price: 20 },
  { id: 'teddy', name: 'Teddy', emoji: '🧸', price: 99 },
  { id: 'crown', name: 'Crown', emoji: '👑', price: 499 },
  { id: 'ring', name: 'Diamond Ring', emoji: '💍', price: 999 },
  { id: 'car', name: 'Sports Car', emoji: '🏎️', price: 2999 },
  { id: 'rocket', name: 'Rocket', emoji: '🚀', price: 4999 },
  { id: 'castle', name: 'Castle', emoji: '🏰', price: 9999 },
];

// ── Demo coin recharge packs (admin can add / edit / delete) ──────
export const COIN_PACKS = [
  { id: 'pack100', coins: 100, price: '$0.99', bonus: 0 },
  { id: 'pack500', coins: 500, price: '$4.99', bonus: 0 },
  { id: 'pack1000', coins: 1000, price: '$9.99', bonus: 100 },
  { id: 'pack5000', coins: 5000, price: '$49.99', bonus: 500 },
  { id: 'pack10000', coins: 10000, price: '$99.99', bonus: 1500 },
];

export const VIP_PACKS = [
  { id: 'vip1', name: 'VIP 1', days: 30, price: '$4.99', coins: 0 },
  { id: 'vip2', name: 'VIP 2', days: 30, price: '$9.99', coins: 0 },
  { id: 'vip3', name: 'VIP 3', days: 30, price: '$19.99', coins: 0 },
];

export const WITHDRAW_METHODS = ['bKash', 'Nagad', 'Bank', 'USDT'];
