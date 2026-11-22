import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALL_RATES, COIN_PACKS, COIN_TO_DIAMOND_RATE, GIFTS, PLATFORM_COMMISSION_PERCENT, VIP_PACKS, VOICE_RATE_DIVISOR, getVoiceCallRate } from './config';
import { fetchLiveCatalog, fetchLiveHosts } from './supabase/live';
import { supabase } from './supabase/client';
import {
  adjustWallet,
  clearWalletCache,
  creditHostEarnings,
  fetchRecentTransactions,
  getSignedInUser,
  loadWallet,
  readWalletCache,
  setVip,
} from './supabase/wallet';
import {
  buySku,
  diamondsForDiamondPack,
  initIap,
  isSkuAvailable,
  parseSku,
  recoverUnfinishedPurchases,
  getIapProducts,
  setPurchaseErrorHandler,
  setPurchaseHandler,
  skuForCoinPack,
  skuForDiamondPack,
  skuForVipPack,
} from './billing/iap';
import { HOSTS } from './data';

// Money is REAL now (2026-11-22): coins/diamonds live in the
// signed-in user's profiles row and every earn/spend writes a
// transactions row (see src/supabase/wallet.js). The 2,450 demo
// balance is gone — with no session the balance is 0 and money
// actions ask the user to sign in instead of faking data.
// Every store money function keeps its old synchronous signature
// (screens call them without await): the local balance updates
// immediately (optimistic) and the Supabase write follows; if the
// write fails the local balance rolls back and the server is
// re-read. Real purchases go through Google Play (react-native-iap)
// and are credited from the purchase listener, never from the tap.
const AppCtx = createContext(null);

// AsyncStorage key for Lucky Spin + Daily Reward state.
const LIVO_REWARDS_KEY = 'livo-rewards-v1';

// Diamond pack ids sold in WalletScreen (must match its list) —
// needed here so IAP can fetch their Play products at startup.
const DIAMOND_PACK_IDS = ['d4000', 'd13200', 'd48000', 'd150000', 'd520000', 'd57000'];

export function AppProvider({ children }) {
  const [coins, setCoins] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [earnings, setEarnings] = useState(0);
  const [following, setFollowing] = useState(['2']);
  const [toast, setToast] = useState('');
  const [callHistory, setCallHistory] = useState([]);
  // [Wallet] 'loading' | 'signed-in' | 'signed-out' | 'error'.
  // signedIn is false until loadWallet() confirms a session.
  const [walletStatus, setWalletStatus] = useState('loading');
  const [signedIn, setSignedIn] = useState(false);
  const [vipUntil, setVipUntil] = useState(null);
  const [transactions, setTransactions] = useState([]);
  // [IAP] 'loading' | 'ready' | 'no-products' | 'error'.
  // 'no-products' means Play Console has no Livo products yet.
  const [iapStatus, setIapStatus] = useState('loading');
  const iapRecoveredRef = useRef(false);
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

  // ── Wallet: load / refresh ─────────────────────────────────────
  const applyWallet = (w) => {
    setCoins(w.coins || 0);
    setDiamonds(w.diamonds || 0);
    setVipLevel(w.vipLevel || null);
    setVipUntil(w.vipUntil || null);
  };

  const clearWalletState = () => {
    setSignedIn(false);
    setCoins(0);
    setDiamonds(0);
    setVipLevel(null);
    setVipUntil(null);
    setTransactions([]);
    setWalletStatus('signed-out');
  };

  // Reads the profiles row for the signed-in user (creates it with
  // zero balances for a brand-new user). No session → signed-out,
  // zero balances, nothing faked.
  const loadWalletIntoStore = async () => {
    const res = await loadWallet();
    if (res.error === 'not-signed-in') {
      clearWalletState();
      return;
    }
    if (res.error) {
      setWalletStatus('error');
      return;
    }
    setSignedIn(true);
    applyWallet(res);
    setWalletStatus('signed-in');
  };

  const refreshWallet = () => loadWalletIntoStore();

  const refreshTransactions = async () => {
    const rows = await fetchRecentTransactions(20);
    setTransactions(rows);
  };

  // [Wallet] Load balances on start: the offline cache first (only
  // when it belongs to the signed-in user), then the profiles row.
  // Sign-in / sign-out anywhere reloads or clears the wallet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getSignedInUser();
      if (cancelled) return;
      if (user) {
        const cached = await readWalletCache();
        if (!cancelled && cached && cached.userId === user.id) {
          setCoins(cached.coins);
          setDiamonds(cached.diamonds);
          if (cached.vipLevel) {
            setVipLevel(cached.vipLevel);
            setVipUntil(cached.vipUntil);
          }
        }
      }
      if (cancelled) return;
      await loadWalletIntoStore();
    })();
    let sub = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') loadWalletIntoStore();
        else if (event === 'SIGNED_OUT') {
          clearWalletState();
          clearWalletCache();
        }
      });
      sub = data && data.subscription;
    }
    return () => {
      cancelled = true;
      if (sub) sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Wallet: settle an optimistic update ────────────────────────
  // `promise` is the wallet.js write. On success the server values
  // win (they are the source of truth); on failure the local
  // balances roll back to the pre-call values and the server is
  // re-read. syncDiamonds=false for calls/gifts: the caller's
  // server diamonds never include the host's share (that lands in
  // the host's own profile via creditHostEarnings).
  const settlePersist = (prevCoins, prevDiamonds, promise, syncDiamonds = true) => {
    if (!promise || typeof promise.then !== 'function') return;
    promise.then((res) => {
      if (!res) return;
      if (res.error) {
        setCoins(prevCoins);
        setDiamonds(prevDiamonds);
        showToast("Couldn't save — check your connection and try again.");
        loadWalletIntoStore();
      } else {
        setCoins(res.coins);
        if (syncDiamonds) setDiamonds(res.diamonds);
        if (res.txError) {
          showToast('Saved, but the receipt could not be written — contact support if the balance looks wrong.');
        }
      }
    });
  };

  // ── IAP: purchase handler (registered once, always current) ────
  // The Play purchase sheet resolves on purchaseUpdatedListener;
  // this credits the wallet and returns true ONLY when the credit
  // landed — iap.js then finishes the transaction as consumable.
  // A false return leaves the purchase unfinished so it is
  // recovered on the next start.
  const iapHandlerRef = useRef(null);
  iapHandlerRef.current = async (purchase) => {
    const parsed = parseSku(purchase.productId);
    if (!parsed) return false;
    if (parsed.type === 'coins') {
      const pack = coinPacks.find((p) => p.id === parsed.id);
      if (!pack) return false;
      const total = pack.coins + (pack.bonus || 0);
      const res = await adjustWallet({ coinsDelta: total, kind: 'purchase_coins', reference: purchase.productId });
      if (res.error) {
        showToast('Payment went through but the coins could not be added — contact support.');
        return false;
      }
      setCoins(res.coins);
      setDiamonds(res.diamonds);
      showToast(`+${total.toLocaleString()} coins — purchase complete`);
      refreshTransactions();
      return true;
    }
    if (parsed.type === 'vip') {
      const pack = vipPacks.find((p) => p.id === parsed.id);
      if (!pack) return false;
      const res = await setVip({ vipLevel: pack.id, days: pack.days, reference: purchase.productId });
      if (res.error) {
        showToast('Payment went through but Premium could not be activated — contact support.');
        return false;
      }
      setVipLevel(res.vipLevel);
      setVipUntil(res.vipUntil);
      showToast(`${pack.name} activated — enjoy Premium!`);
      refreshTransactions();
      return true;
    }
    if (parsed.type === 'diamonds') {
      const amount = diamondsForDiamondPack(parsed.id);
      if (!amount) return false;
      const res = await adjustWallet({ diamondsDelta: amount, kind: 'purchase_diamonds', reference: purchase.productId });
      if (res.error) {
        showToast('Payment went through but the Diamonds could not be added — contact support.');
        return false;
      }
      setCoins(res.coins);
      setDiamonds(res.diamonds);
      showToast(`+${amount.toLocaleString()} Diamonds — purchase complete`);
      refreshTransactions();
      return true;
    }
    return false;
  };
  useEffect(() => {
    setPurchaseHandler({
      onPurchase: (purchase) => iapHandlerRef.current(purchase),
    });
    setPurchaseErrorHandler(() => {
      showToast('Purchase failed — please try again.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [IAP] Connect + fetch the Play products for the current catalog
  // (re-runs when the live catalog arrives). 'no-products' is the
  // normal state until the products are created in Play Console.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const skus = [
        ...coinPacks.map((p) => skuForCoinPack(p.id)),
        ...vipPacks.map((p) => skuForVipPack(p.id)),
        ...DIAMOND_PACK_IDS.map((id) => skuForDiamondPack(id)),
      ];
      const res = await initIap(skus);
      if (cancelled) return;
      if (!res.ok) {
        setIapStatus('error');
        return;
      }
      setIapStatus(getIapProducts().length > 0 ? 'ready' : 'no-products');
      if (!iapRecoveredRef.current) {
        iapRecoveredRef.current = true;
        recoverUnfinishedPurchases();
      }
    })();
    return () => { cancelled = true; };
  }, [coinPacks, vipPacks]);

  // Opens the Play sheet for one SKU. Returns true when the sheet
  // opened (the credit arrives later via the purchase listener),
  // false when it could not — the reason is toasted here.
  const buyWithIap = async (sku) => {
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    if (iapStatus === 'loading') {
      showToast('Billing is still starting — try again in a moment.');
      return false;
    }
    if (iapStatus === 'no-products' || iapStatus === 'error') {
      showToast('Purchases are not set up in Play Console yet — coming soon.');
      return false;
    }
    if (!isSkuAvailable(sku)) {
      showToast('This pack is not set up in Play Console yet.');
      return false;
    }
    const res = await buySku(sku);
    if (res.cancelled) return false; // user backed out — silent
    if (!res.ok) {
      showToast('Could not open Google Play — please try again.');
      return false;
    }
    return true;
  };

  // Charge a finished 1-to-1 call. `minutes` is billed minutes,
  // `ratePerMinute` comes from the host's call-rate tier (admin-set).
  // Returns the cost in coins, or false when the balance is too low
  // or there is no session. The caller's coins are deducted from
  // their profiles row (+ transactions row); the host's share is
  // credited to the HOST's own profile, never to the caller.
  const chargeCall = (host, minutes, ratePerMinute) => {
    const cost = minutes * ratePerMinute;
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    if (coins < cost) {
      showToast('Not enough coins — please recharge first.');
      return false;
    }
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setCoins((c) => c - cost);
    setCallHistory((h) => [
      { id: String(Date.now()), name: host.name, duration: `${minutes} min`, cost, time: 'Just now' },
      ...h,
    ]);
    settlePersist(prevCoins, prevDiamonds, adjustWallet({
      coinsDelta: -cost,
      kind: 'call_charge',
      reference: host ? host.name : null,
    }), false);
    const hostShare = Math.round(cost * (100 - PLATFORM_COMMISSION_PERCENT) / 100);
    if (host && host.id) {
      creditHostEarnings(host.id, hostShare * COIN_TO_DIAMOND_RATE, 'call_earnings', host.name);
    }
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

  // Send a gift in a live room. Deducts the caller's real coin
  // balance (+ transactions row). `host` is optional: when the
  // calling screen passes the host, the host's share is credited to
  // the host's own profile. (VideoCallScreen does not pass it yet,
  // so gift earnings reach the host once that screen does.)
  const sendGift = (gift, host) => {
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    if (coins < gift.price) {
      showToast('Not enough coins — please recharge first.');
      return false;
    }
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setCoins((c) => c - gift.price);
    setGiftsSent((n) => n + 1); // [Vero] counts toward the daily gift task
    showToast(`Sent ${gift.emoji} ${gift.name} (-${gift.price} coins)`);
    settlePersist(prevCoins, prevDiamonds, adjustWallet({
      coinsDelta: -gift.price,
      kind: 'gift_sent',
      reference: gift.id || gift.name,
    }), false);
    if (host && host.id) {
      creditHostEarnings(host.id, gift.price * COIN_TO_DIAMOND_RATE, 'gift_received', gift.id || gift.name);
    }
    return true;
  };

  // Credit coins to the signed-in user and persist them. This is the
  // credit step AFTER a real payment (buyCoinPack) and the path
  // ProfileScreen's task claims use — it never opens Play itself.
  // `meta` may carry { kind, reference } for the transactions row.
  const recharge = (pack, meta) => {
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    const total = (pack.coins || 0) + (pack.bonus || 0);
    if (!total || total <= 0) return false;
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setCoins((c) => c + total);
    showToast(`Recharged ${total.toLocaleString()} coins`);
    settlePersist(prevCoins, prevDiamonds, adjustWallet({
      coinsDelta: total,
      kind: (meta && meta.kind) || 'recharge',
      reference: (meta && meta.reference) || pack.id || null,
    }));
    return true;
  };

  // Buy a coin pack with real money: opens the Google Play sheet.
  // The coins land via the purchase listener, not here.
  const buyCoinPack = (pack) => buyWithIap(skuForCoinPack(pack.id));

  // Credit/debit Diamonds on the signed-in user's profiles row.
  // Positive = a credit (after a real payment via buyDiamondPack);
  // negative = a spend (ProfileScreen Exchange passes
  // { diamonds: -amount }). Never opens Play itself. Returns false
  // when the balance is too low or there is no session.
  const buyDiamonds = (pack, meta) => {
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    const amount = pack.diamonds || 0;
    if (!amount) return false;
    if (amount < 0 && diamonds < -amount) {
      showToast('Not enough Diamonds.');
      return false;
    }
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setDiamonds((d) => d + amount);
    if (amount > 0) showToast(`+${amount.toLocaleString()} Diamonds`);
    settlePersist(prevCoins, prevDiamonds, adjustWallet({
      diamondsDelta: amount,
      kind: amount < 0 ? ((meta && meta.kind) || 'diamond_spend') : 'purchase_diamonds',
      reference: (meta && meta.reference) || pack.id || null,
    }));
    return true;
  };

  // Buy a Diamond pack with real money: opens the Google Play
  // sheet. The Diamonds land via the purchase listener, not here.
  const buyDiamondPack = (pack) => buyWithIap(skuForDiamondPack(pack.id));

  // [F1] Lucky Spin + Daily Reward — real balance API.
  // Adds reward coins to the profiles row (+ transactions row) and
  // shows a toast. `source` is shown in the toast, e.g. 'Lucky
  // Spin' or 'Daily Reward'. Returns false with no session.
  const addRewardCoins = (amount, source) => {
    if (!amount || amount <= 0) return false;
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    const kind =
      source === 'Lucky Spin' ? 'reward_spin'
      : source === 'Daily Reward' ? 'reward_checkin'
      : source === 'Daily Task' ? 'reward_task'
      : 'reward';
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setCoins((c) => c + amount);
    showToast(`+${amount.toLocaleString()} coins — ${source}`);
    settlePersist(prevCoins, prevDiamonds, adjustWallet({
      coinsDelta: amount,
      kind,
      reference: source || null,
    }));
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

  // [Vero] Premium (VIP) purchase with real money: opens the Google
  // Play sheet for the VIP pack. vip_until + vip_level on the
  // profiles row are set from the purchase listener, not here.
  const buyVip = (pack) => buyWithIap(skuForVipPack(pack.id));
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
    // [Wallet] signedIn/walletStatus/vipUntil/transactions/
    // refreshWallet/refreshTransactions expose the real wallet;
    // buyCoinPack/buyDiamondPack/buyVip open the Play sheet.
    () => ({ coins, diamonds, earnings, following, toggleFollow, sendGift, recharge, buyDiamonds, buyCoinPack, buyDiamondPack, chargeCall, chargeVoiceCall, callHistory, toast, showToast, hosts, setHostOnline, setHostRate, userCountry /* [F3] */, addRewardCoins, recordSpin, recordCheckin, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, claimTask, vipLevel, vipUntil, buyVip /* [Vero] */, callRates, coinPacks, gifts, vipPacks, getLiveCallRate, getLiveVoiceCallRate, liveSource /* [Live] */, signedIn, walletStatus, iapStatus, transactions, refreshWallet, refreshTransactions /* [Wallet] */ }),
    [coins, diamonds, earnings, following, callHistory, toast, hosts, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, vipLevel, vipUntil, callRates, coinPacks, gifts, vipPacks, liveSource, signedIn, walletStatus, iapStatus, transactions]
    // [/F1]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
