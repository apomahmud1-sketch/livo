import React, { createContext, useContext, useMemo, useState } from 'react';
import { COIN_TO_DIAMOND_RATE, PLATFORM_COMMISSION_PERCENT, getVoiceCallRate } from './config';
import { HOSTS } from './data';

// Simple in-app state (demo). Supabase + the admin panel replace this
// later; every screen uses this context, so the swap is in one place.
const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [coins, setCoins] = useState(2450);
  const [diamonds, setDiamonds] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [following, setFollowing] = useState(['2']);
  const [toast, setToast] = useState('');
  const [callHistory, setCallHistory] = useState([]);
  // [F1] Lucky Spin + Daily Reward state (in-memory only — see note
  // below). lastSpinDate / lastCheckinDate are 'YYYY-MM-DD' keys.
  // NOTE: there is no AsyncStorage in this project and the Supabase
  // profiles table has no last_spin_at / last_checkin_at columns
  // (and no logged-in user identity in this store yet), so these
  // reset when the app restarts. Persisting them needs either the
  // @react-native-async-storage/async-storage dep or new profile
  // columns + auth — a later step, not faked here.
  const [spinsUsedToday, setSpinsUsedToday] = useState(0);
  const [lastSpinDate, setLastSpinDate] = useState(null);
  const [lastCheckinDate, setLastCheckinDate] = useState(null);
  const [checkinStreak, setCheckinStreak] = useState(0);
  // [/F1]
  // Live host list (starts from the demo HOSTS in data.js). The Host
  // Dashboard changes a host's online state and call-rate tier here,
  // so Home re-renders with the change. Supabase replaces this later.
  const [hosts, setHosts] = useState(HOSTS);
  // [F3] The user's home country, used by the Nearby tab for
  // country-based proximity (same-country hosts first). Grounded in
  // ProfileScreen.js Location 'SGP-Singapore' for Mr.lee. This is a
  // context value for now — it should come from the real profile /
  // backend later. [/F3]
  const userCountry = 'SGP';

  const setHostOnline = (hostId, online) => {
    setHosts((hs) => hs.map((h) => (h.id === hostId ? { ...h, online } : h)));
  };

  const setHostRate = (hostId, tierId) => {
    setHosts((hs) => hs.map((h) => (h.id === hostId ? { ...h, rateTier: tierId } : h)));
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // Charge a finished 1-to-1 call. `minutes` is billed minutes,
  // `ratePerMinute` comes from the host's call-rate tier (admin-set).
  // Returns the cost in coins, or false when the balance is too low.
  const chargeCall = (host, minutes, ratePerMinute) => {
    const cost = minutes * ratePerMinute;
    if (coins < cost) {
      showToast('Not enough coins — please recharge first.');
      return false;
    }
    setCoins((c) => c - cost);
    const hostShare = Math.round(cost * (100 - PLATFORM_COMMISSION_PERCENT) / 100);
    setDiamonds((d) => d + hostShare * COIN_TO_DIAMOND_RATE);
    setEarnings((e) => e + hostShare * COIN_TO_DIAMOND_RATE);
    setCallHistory((h) => [
      { id: String(Date.now()), name: host.name, duration: `${minutes} min`, cost, time: 'Just now' },
      ...h,
    ]);
    return cost;
  };

  // [F2] Charge a finished audio-only (voice) call. The voice rate
  // is derived from the host's video tier (half price — see
  // getVoiceCallRate in config.js), never a fixed number. Billing
  // itself is identical to a video call: same chargeCall, same
  // per-started-minute rule, same host share / commission.
  const chargeVoiceCall = (host, minutes) => {
    const voiceRate = getVoiceCallRate(host ? host.rateTier : 'tier2');
    return chargeCall(host, minutes, voiceRate.coinsPerMinute);
  };
  // [/F2]

  const sendGift = (gift) => {
    if (coins < gift.price) {
      showToast('Not enough coins — please recharge first.');
      return false;
    }
    setCoins((c) => c - gift.price);
    setDiamonds((d) => d + gift.price * COIN_TO_DIAMOND_RATE);
    setEarnings((e) => e + gift.price * COIN_TO_DIAMOND_RATE);
    showToast(`Sent ${gift.emoji} ${gift.name} (-${gift.price} coins)`);
    return true;
  };

  const recharge = (pack) => {
    setCoins((c) => c + pack.coins + (pack.bonus || 0));
    showToast(`Recharged ${pack.coins + (pack.bonus || 0)} coins (demo — no real payment yet)`);
  };

  // NEW (2026-11-18): buy a Diamond pack from My Diamonds (Wallet).
  // Adds the pack's diamonds to the live balance and shows a toast.
  // Real Google Play payment replaces this demo step before launch.
  const buyDiamonds = (pack) => {
    setDiamonds((d) => d + pack.diamonds);
    showToast(`+${pack.diamonds.toLocaleString()} Diamonds (demo — no real payment yet)`);
    return true;
  };

  // [F1] Lucky Spin + Daily Reward — real balance API.
  // Adds reward coins to the live coin balance (same setCoins the
  // rest of the store uses) and shows a toast. `source` is shown
  // in the toast, e.g. 'Lucky Spin' or 'Daily Reward'.
  const addRewardCoins = (amount, source) => {
    if (!amount || amount <= 0) return false;
    setCoins((c) => c + amount);
    showToast(`+${amount.toLocaleString()} coins — ${source}`);
    return true;
  };

  // Record that a spin was used today (dateKey 'YYYY-MM-DD').
  const recordSpin = (dateKeyStr) => {
    if (dateKeyStr !== lastSpinDate) {
      setLastSpinDate(dateKeyStr);
      setSpinsUsedToday(1);
    } else {
      setSpinsUsedToday((n) => n + 1);
    }
  };

  // Record a daily check-in. `streak` is the new streak length
  // (the screen works it out from yesterday's date); the date is
  // stored so the screen can tell "already claimed today".
  const recordCheckin = (dateKeyStr, streak) => {
    setLastCheckinDate(dateKeyStr);
    setCheckinStreak(streak);
  };
  // [/F1]

  const toggleFollow = (hostId) => {
    setFollowing((f) => (f.includes(hostId) ? f.filter((x) => x !== hostId) : [...f, hostId]));
  };

  const value = useMemo(
    // [F1] Reward state + actions exposed to RewardsScreen.
    () => ({ coins, diamonds, earnings, following, toggleFollow, sendGift, recharge, buyDiamonds, chargeCall, chargeVoiceCall, callHistory, toast, showToast, hosts, setHostOnline, setHostRate, userCountry /* [F3] */, addRewardCoins, recordSpin, recordCheckin, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak }),
    [coins, diamonds, earnings, following, callHistory, toast, hosts, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak]
    // [/F1]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
