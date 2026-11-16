// Demo data only. Replace with Supabase data later — the screens read
// everything from here, so swapping the backend is one file change.
// Hosts are 1-to-1 video call hosts; each host has a call-rate tier
// (see CALL_RATES in src/config.js — admin can change the tiers).
export const HOSTS = [
  { id: '1', name: 'Ruma', country: 'BGD', flag: '🇧🇩', lang: 'Bengali', level: 6, rateTier: 'tier2', color: '#f472b6', online: true, status: 'Online now — video call 💬' },
  { id: '2', name: 'Nusrat', country: 'IND', flag: '🇮🇳', lang: 'English', level: 5, rateTier: 'tier3', color: '#a78bfa', online: true, status: 'Online now — chatting 🎤' },
  { id: '3', name: 'Arif', country: 'BGD', flag: '🇧🇩', lang: 'Bengali', level: 4, rateTier: 'tier1', color: '#60a5fa', online: true, status: 'Online now — say hi 👋' },
  { id: '4', name: 'Sadia', country: 'PAK', flag: '🇵🇰', lang: 'English', level: 7, rateTier: 'tier4', color: '#fbbf24', online: true, status: 'Online now — video call 💛' },
  { id: '5', name: 'Rakib', country: 'BGD', flag: '🇧🇩', lang: 'Bengali', level: 3, rateTier: 'tier1', color: '#34d399', online: false, status: 'Offline — back soon' },
  { id: '6', name: 'Priya', country: 'IND', flag: '🇮🇳', lang: 'English', level: 5, rateTier: 'tier5', color: '#fb7185', online: true, status: 'Online now — premium call 👑' },
];

export const MESSAGES = [
  { id: 'm1', name: 'Ruma', text: 'Thanks for the Crown! 👑', time: '10:24', color: '#f472b6' },
  { id: 'm2', name: 'Nusrat', text: 'Call me tonight?', time: '09:51', color: '#a78bfa' },
  { id: 'm3', name: 'Arif', text: 'Great call today, thank you!', time: 'Yesterday', color: '#60a5fa' },
  { id: 'm4', name: 'Sadia', text: 'You are my top caller this week 💛', time: 'Yesterday', color: '#fbbf24' },
];

export const RANKING = [
  { id: 'r1', name: 'Sadia', score: 154000, color: '#fbbf24' },
  { id: 'r2', name: 'Ruma', score: 128500, color: '#f472b6' },
  { id: 'r3', name: 'Nusrat', score: 98700, color: '#a78bfa' },
  { id: 'r4', name: 'Priya', score: 76400, color: '#fb7185' },
  { id: 'r5', name: 'Arif', score: 52100, color: '#60a5fa' },
];

export const CALL_HISTORY_SEED = [
  { id: 'h1', name: 'Ruma', duration: '04:32', cost: 540, time: 'Today 10:24' },
  { id: 'h2', name: 'Nusrat', duration: '02:10', cost: 650, time: 'Yesterday' },
];
