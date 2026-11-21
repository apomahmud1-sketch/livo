import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALL_RATES, COIN_PACKS, COIN_TO_DIAMOND_RATE, GIFTS, PLATFORM_COMMISSION_PERCENT, VIP_PACKS, VOICE_RATE_DIVISOR, getVoiceCallRate } from './config';
import { fetchLiveCatalog, fetchLiveHosts } from './supabase/live';
import { HOSTS } from './data';

// Simple in-app state (demo). Supabase + the admin panel replace this
// later; every screen uses this context, so the swap is in one place.
const AppCtx = createContext(null);

// AsyncStorage key for Lucky Spin + Daily Reward state.
const LIVO_REWARDS_KEY = 'livo-rewards-v1';

export function AppProvider({ children }) {
  const [coins, setCoins] = useState(2450);
  const [diamonds, setDiamonds] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [following, setFollowing] = useState(['2']);
  const [toast, setToast] = useState('');
  const [callHistory, setCallHistory] = useState([]);
  // [F1] Lucky Spin + Daily Reward state, saved on the device with
  // AsyncStorage (key LIVO_REWARDS_KEY). lastSpinDate /
  // lastCheckinDate are 'YYYY-MM-DD' keys. The load runs once on
  // start; saves only run after the load finishes, so saved values
  // are never overwritten by the initial defaults.
  const [spinsUsedToday, setSpinsUsedToday] = useState(0);
  const [lastSpinDate, setLastSpinDate] = useState(null);
  const [lastCheckinDate, setLastCheckinDate] = useState(null);
  const [checkinStreak, setCheckinStreak] = useState(0);
  const [rewardsLoaded, setRewardsLoaded] = useState(false);
  // [Vero] Daily Tasks + Premium state (saved with the rewards key).
  const [giftsSent, setGiftsSent] = useState(0);
  const [claimedTasks, setClaimedTasks] = useState({});
  const [vipLevel, setVipLevel] = useState(null);
  // [F1] Load saved spin / check-in state once, on start.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LIVO_REWARDS_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (typeof saved.spinsUsedToday === 'number') setSpinsUsedToday(saved.spinsUsedToday);
          if (typeof saved.lastSpinDate === 'string') setLastSpinDate(saved.lastSpinDate);
          if (typeof saved.lastCheckinDate === 'string') setLastCheckinDate(saved.lastCheckinDate);
          if (typeof saved.checkinStreak === 'number') setCheckinStreak(saved.checkinStreak);
          if (typeof saved.giftsSent === 'number') setGiftsSent(saved.giftsSent);
          if (saved.claimedTasks && typeof saved.claimedTasks === 'object') setClaimedTasks(saved.claimedTasks);
          if (typeof saved.vipLevel === 'string' || saved.vipLevel === null) setVipLevel(saved.vipLevel);
        }
      } catch (e) { /* storage unavailable — keep in-memory defaults */ }
      setRewardsLoaded(true);
    })();
  }, []);
  // [F1] Save spin / check-in state whenever it changes (only
  // after the load above finished).
  useEffect(() => {
    if (!rewardsLoaded) return;
    AsyncStorage.setItem(LIVO_REWARDS_KEY, JSON.stringify({
      spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak,
      giftsSent, claimedTasks, vipLevel,
    })).catch(() => { /* storage unavailable — in-memory still works */ });
  }, [rewardsLoaded, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, vipLevel]);
  // [/F1]
  // Live host list (starts from the demo HOSTS in data.js). The Host
  // Dashboard changes a host's online state and call-rate tier here,
  // so Home re-renders with the change. Supabase replaces this later.
  const [hosts, setHosts] = useState(HOSTS);
  // [Live] Catalog values from Supabase (null = not loaded / failed
  // → the config.js demo defaults below are used instead). Each
  // table is applied independently, so a missing gifts table never
  // blocks the call rates. liveSource is 'supabase' once ANY live
  // data was applied, otherwise 'demo'.
  const [liveCallRates, setLiveCallRates] = useState(null);
  const [liveCoinPacks, setLiveCoinPacks] = useState(null);
  const [liveGifts, setLiveGifts] = useState(null);
  const [liveVipPacks, setLiveVipPacks] = useState(null);
  const [liveSource, setLiveSource] = useState('demo');
  // [Live] Load live data once, on start. fetchLive* never throws
  // and never hangs (5s timeout each, demo fallback inside), so a
  // dead network or an unpasted setup SQL can never block startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hostsLive, catalog] = await Promise.all([
          fetchLiveHosts(),
          fetchLiveCatalog(),
        ]);
        if (cancelled) return;
        let usedLive = false;
        if (hostsLive && hostsLive.length > 0) {
          setHosts(hostsLive);
          usedLive = true;
        }
        if (catalog) {
          if (catalog.callRates) { setLiveCallRates(catalog.callRates); usedLive = true; }
          if (catalog.coinPacks) { setLiveCoinPacks(catalog.coinPacks); usedLive = true; }
          if (catalog.gifts) { setLiveGifts(catalog.gifts); usedLive = true; }
          if (catalog.vipPacks) { setLiveVipPacks(catalog.vipPacks); usedLive = true; }
        }
        if (usedLive) setLiveSource('supabase');
      } catch (e) { /* never break startup — demo data stays */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // [Live] Resolved catalog: live rows when loaded, config demo
  // defaults otherwise. Screens read these, never config.js directly.
  const callRates = liveCallRates || CALL_RATES;
  const coinPacks = liveCoinPacks || COIN_PACKS;
  const gifts = liveGifts || GIFTS;
  const vipPacks = liveVipPacks || VIP_PACKS;
  // [Live] Rate lookups against the resolved (live or demo) tiers.
  // Same shapes as config.js getCallRate / getVoiceCallRate.
  const getLiveCallRate = (tierId) =>
    callRates.find((r) => r.id === tierId) || callRates[1] || CALL_RATES[1];
  const getLiveVoiceCallRate = (tierId) => {
    const video = getLiveCallRate(tierId);
    const coinsPerMinute = Math.floor(video.coinsPerMinute / VOICE_RATE_DIVISOR);
    return {
      id: video.id,
      name: `${video.name} (Voice)`,
      coinsPerMinute,
      label: `${coinsPerMinute} coins/min (voice)`,
    };
  };
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
    setGiftsSent((n) => n + 1); // [Vero] counts toward the daily gift task
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

  // [Vero] Daily Tasks — claim a finished task's coin reward once
  // per day. claimedTasks is { 'YYYY-MM-DD': ['task-checkin', ...] }.
  const claimTask = (taskId, dateKeyStr, reward) => {
    const claimedToday = claimedTasks[dateKeyStr] || [];
    if (claimedToday.includes(taskId)) return false;
    setClaimedTasks((prev) => ({ ...prev, [dateKeyStr]: [...(prev[dateKeyStr] || []), taskId] }));
    addRewardCoins(reward, 'Daily Task');
    return true;
  };

  // [Vero] Premium (VIP) purchase — demo, no real payment yet (same
  // pattern as buyDiamonds). Sets the active VIP level, saved on device.
  const buyVip = (pack) => {
    setVipLevel(pack.id);
    showToast(`${pack.name} activated (demo — no real payment yet)`);
    return true;
  };
  // [/Vero]

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
    // [Live] callRates/coinPacks/gifts/vipPacks are the resolved live
    // (Supabase) or demo (config.js) catalog; getLiveCallRate /
    // getLiveVoiceCallRate look tiers up in them; liveSource tells
    // screens where the data came from ('demo' | 'supabase').
    () => ({ coins, diamonds, earnings, following, toggleFollow, sendGift, recharge, buyDiamonds, chargeCall, chargeVoiceCall, callHistory, toast, showToast, hosts, setHostOnline, setHostRate, userCountry /* [F3] */, addRewardCoins, recordSpin, recordCheckin, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, claimTask, vipLevel, buyVip /* [Vero] */, callRates, coinPacks, gifts, vipPacks, getLiveCallRate, getLiveVoiceCallRate, liveSource /* [Live] */ }),
    [coins, diamonds, earnings, following, callHistory, toast, hosts, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, vipLevel, callRates, coinPacks, gifts, vipPacks, liveSource]
    // [/F1]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
