// ─────────────────────────────────────────────────────────────────
// Livo — LUCKY SPIN + DAILY REWARD config  [F1]
// ─────────────────────────────────────────────────────────────────
// ADMIN-CONFIGURABLE DEFAULTS (the "mother panel" rule):
// every value below is a default only. The admin panel can change
// the prizes, the weights, the free spins per day and the check-in
// rewards at any time, and the app must read the admin values
// (from the backend / Supabase) instead of these defaults once
// the backend is connected. Nothing here is hard-coded forever.
// ─────────────────────────────────────────────────────────────────

// ── Lucky Spin ───────────────────────────────────────────────────
// How many free spins a user gets each day (resets at midnight,
// local time). Extra spins beyond this are not sold yet — the
// admin panel can add a paid-spin price later.
export const FREE_SPINS_PER_DAY = 1;

// Spin-wheel prizes. `weight` = relative chance (higher = more
// likely). The wheel has one segment per prize, so keep the list
// at 8 entries unless the wheel layout is updated too.
// `coins` is what is added to the user's coin balance on a win.
export const SPIN_PRIZES = [
  { id: 'spin_10',   label: '10',    coins: 10,   weight: 30, color: '#fde68a' },
  { id: 'spin_25',   label: '25',    coins: 25,   weight: 25, color: '#fbcfe8' },
  { id: 'spin_50',   label: '50',    coins: 50,   weight: 18, color: '#c7d2fe' },
  { id: 'spin_100',  label: '100',   coins: 100,  weight: 12, color: '#a7f3d0' },
  { id: 'spin_200',  label: '200',   coins: 200,  weight: 8,  color: '#fca5a5' },
  { id: 'spin_500',  label: '500',   coins: 500,  weight: 4,  color: '#fcd34d' },
  { id: 'spin_1000', label: '1,000', coins: 1000, weight: 2,  color: '#d8b4fe' },
  { id: 'spin_5000', label: '5,000', coins: 5000, weight: 1,  color: '#f9a8d4' },
];

// Pick one prize by weight. Returns the prize object.
export const pickSpinPrize = () => {
  const total = SPIN_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of SPIN_PRIZES) {
    roll -= prize.weight;
    if (roll <= 0) return prize;
  }
  return SPIN_PRIZES[0];
};

// ── Daily check-in reward ────────────────────────────────────────
// 7-day cycle: day 1..7 of the streak, then it wraps back to day 1.
// Streak breaks (resets to day 1) if a day is missed. The admin
// panel can change any day's amount at any time.
export const CHECKIN_REWARDS = [10, 15, 20, 30, 40, 60, 100];
export const CHECKIN_CYCLE_DAYS = 7;

// ── Date helpers (local calendar day, YYYY-MM-DD) ────────────────
export const dateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const todayKey = () => dateKey(new Date());

export const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
};
