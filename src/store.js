import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALL_RATES, COIN_PACKS, COIN_TO_DIAMOND_RATE, GIFTS, PLATFORM_COMMISSION_PERCENT, VIP_PACKS, VOICE_RATE_DIVISOR, getVoiceCallRate } from './config';
import { fetchLiveCatalog, fetchLiveHosts, fetchFrames } from './supabase/live';
import { supabase } from './supabase/client';
import { withTimeout } from './supabase/timeout';
import { updateMyProfile } from './supabase/auth';
import { LV_ROWS } from './screens/profile/levelData';
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

// Diamond pack ids sold in WalletScreen — fallback for IAP init
// before the live catalog arrives. These are the ids seeded in the
// diamond_packs table; once the catalog loads, the live ids win.
const DIAMOND_PACK_IDS = ['d4000', 'd13200', 'd48000', 'd150000', 'd520000', 'd57000'];

// Level thresholds from the LV_ROWS ladder (strings with commas).
const LV_THRESHOLDS = LV_ROWS.map(([level, label]) => ({
  level,
  threshold: Number(String(label).replace(/,/g, '')) || 0,
}));

// Transaction kinds that count toward the level points: top-up
// (purchase_*) vs consumption (call_charge, gift_sent). Points =
// the larger of the two totals (see LEVEL_RULE_MALE).
const LEVEL_TOPUP_KINDS = ['purchase_coins', 'purchase_diamonds', 'purchase_vip'];
const LEVEL_SPEND_KINDS = ['call_charge', 'gift_sent'];

export function AppProvider({ children }) {
  const [coins, setCoins] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [following, setFollowing] = useState([]);
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
  const [liveDiamondPacks, setLiveDiamondPacks] = useState(null);
  const [liveSource, setLiveSource] = useState('demo');
  // Frames from the frames table (panel) — [] until loaded.
  const [frames, setFrames] = useState([]);
  // The user's home country, from their profiles.country ('SGP'
  // only when the profile has none set yet).
  const [userCountry, setUserCountry] = useState('SGP');
  // Unread messages: messages where I am the recipient and
  // read_at is still null.
  const [unreadTotal, setUnreadTotal] = useState(0);
  // Level points from real transactions (see levelInfo below).
  const [levelPoints, setLevelPoints] = useState(0);
  // [Live] Load live data once, on start. fetchLive* never throws
  // and never hangs (5s timeout each, demo fallback inside), so a
  // dead network or an unpasted setup SQL can never block startup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hostsLive, catalog, framesLive] = await Promise.all([
          fetchLiveHosts(),
          fetchLiveCatalog(),
          fetchFrames(),
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
          if (catalog.diamondPacks) { setLiveDiamondPacks(catalog.diamondPacks); usedLive = true; }
        }
        if (framesLive && framesLive.length > 0) setFrames(framesLive);
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
  // Diamond packs come ONLY from the live catalog (no demo list):
  // [] until the catalog loads, so WalletScreen shows an honest
  // empty state instead of invented packs.
  const diamondPacks = liveDiamondPacks || [];
  // Play SKUs to fetch: live ids once loaded, the seeded ids
  // before that (same ids — the catalog load only confirms them).
  const diamondPackIds = useMemo(
    () => (liveDiamondPacks && liveDiamondPacks.length > 0
      ? liveDiamondPacks.map((p) => p.id)
      : DIAMOND_PACK_IDS),
    [liveDiamondPacks],
  );
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
  // [F3] The user's home country — set from profiles.country when
  // the wallet loads (see applyWallet); 'SGP' only until then.
  // Nearby sorts same-country hosts first (see utils/nearby.js).

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
    if (typeof w.country === 'string' && w.country) {
      setUserCountry(w.country.toUpperCase());
    }
  };

  const clearWalletState = () => {
    setSignedIn(false);
    setCoins(0);
    setDiamonds(0);
    setVipLevel(null);
    setVipUntil(null);
    setTransactions([]);
    setFollowing([]);
    setUnreadTotal(0);
    setLevelPoints(0);
    setWalletStatus('signed-out');
  };

  // Unread message count: messages addressed to me with read_at
  // still null. withTimeout-guarded; a failure keeps the old count.
  const refreshUnreadTotal = async () => {
    const user = await getSignedInUser();
    if (!user || !supabase) return;
    try {
      const res = await withTimeout(
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', user.id)
          .is('read_at', null),
      );
      if (res && typeof res.count === 'number') setUnreadTotal(res.count);
    } catch (e) { /* keep the previous count */ }
  };

  // Level points from the user's real transactions rows: the
  // larger of total top-up (purchase kinds) and total consumption
  // (call_charge + gift_sent). No transactions → 0 points (Lv0).
  const refreshLevelInfo = async () => {
    const user = await getSignedInUser();
    if (!user || !supabase) return;
    try {
      const res = await withTimeout(
        supabase
          .from('transactions')
          .select('kind,amount_coins,amount_diamonds')
          .eq('profile_id', user.id)
          .limit(1000),
      );
      if (!res || res.error || !Array.isArray(res.data)) return;
      let topUp = 0;
      let spend = 0;
      for (const r of res.data) {
        const kind = String(r.kind || '');
        const coins = Math.abs(typeof r.amount_coins === 'number' ? r.amount_coins : 0);
        const diamonds = Math.abs(typeof r.amount_diamonds === 'number' ? r.amount_diamonds : 0);
        if (LEVEL_TOPUP_KINDS.includes(kind)) topUp += coins + diamonds;
        else if (LEVEL_SPEND_KINDS.includes(kind)) spend += coins + diamonds;
      }
      setLevelPoints(Math.max(topUp, spend));
    } catch (e) { /* keep the previous points */ }
  };

  // Level from real points on the LV_ROWS ladder. Lv0 rule: a
  // balance of 2,000 diamonds or less is always Lv0, whatever the
  // history says. No transactions → Lv0 with 0 points.
  const levelInfo = useMemo(() => {
    const points = levelPoints || 0;
    let level = 0;
    if (diamonds > 2000) {
      for (const row of LV_THRESHOLDS) {
        if (points >= row.threshold) level = row.level;
      }
    }
    const current = LV_THRESHOLDS[level] || { threshold: 0 };
    const next = LV_THRESHOLDS[level + 1];
    const progress = !next
      ? 100
      : Math.max(0, Math.min(100, Math.round(((points - current.threshold) / (next.threshold - current.threshold)) * 100)));
    return { level, points, progress };
  }, [levelPoints, diamonds]);

  // Follows from the follows table (follower_id = me). [] when not
  // signed in or on any failure — never a hardcoded list.
  const loadFollows = async () => {
    const user = await getSignedInUser();
    if (!user || !supabase) {
      setFollowing([]);
      return;
    }
    try {
      const res = await withTimeout(
        supabase.from('follows').select('host_id').eq('follower_id', user.id),
      );
      if (res && !res.error && Array.isArray(res.data)) {
        setFollowing(res.data.map((r) => String(r.host_id)).filter(Boolean));
      }
    } catch (e) { /* keep the current list */ }
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
    loadFollows();
    refreshUnreadTotal();
    refreshLevelInfo();
  };

  const refreshWallet = () => loadWalletIntoStore();

  const refreshTransactions = async () => {
    const rows = await fetchRecentTransactions(20);
    setTransactions(rows);
    refreshLevelInfo();
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
  // Persist an optimistic balance change and settle it against the
  // server result. Returns a promise resolving to true when the
  // server write landed (or when there was nothing to persist),
  // false when it failed (local balance rolled back). Callers that
  // bill (chargeCall) await this before writing the calls row, so
  // the row never claims a cost that was never deducted.
  const settlePersist = (prevCoins, prevDiamonds, promise, syncDiamonds = true) => {
    if (!promise || typeof promise.then !== 'function') return Promise.resolve(false);
    return promise.then((res) => {
      if (!res) return false;
      if (res.error) {
        setCoins(prevCoins);
        setDiamonds(prevDiamonds);
        showToast("Couldn't save — check your connection and try again.");
        loadWalletIntoStore();
        return false;
      }
      setCoins(res.coins);
      if (syncDiamonds) setDiamonds(res.diamonds);
      if (res.txError) {
        showToast('Saved, but the receipt could not be written — contact support if the balance looks wrong.');
      }
      return true;
    }).catch(() => {
      setCoins(prevCoins);
      setDiamonds(prevDiamonds);
      showToast("Couldn't save — check your connection and try again.");
      return false;
    });
  };

  // ── IAP: purchase handler (registered once, always current) ────
  // The Play purchase sheet resolves on purchaseUpdatedListener;
  // this credits the wallet and returns true ONLY when the credit
  // landed — iap.js then finishes the transaction as consumable.
  // A false return leaves the purchase unfinished so it is
  // recovered on the next start.
  // Has this Play purchase already been credited? The purchase
  // token is stored as the transactions reference, so a replay
  // after the app was killed before finishTransaction is skipped
  // instead of crediting twice. withTimeout-guarded; on any
  // failure we assume "not credited" so a real purchase is never
  // silently dropped (the in-memory set in iap.js is the second
  // guard for the same session).
  const hasCreditedPurchase = async (token) => {
    if (!token || !supabase) return false;
    try {
      const res = await withTimeout(
        supabase
          .from('transactions')
          .select('id')
          .eq('reference', token)
          .limit(1),
      );
      return !!(res && !res.error && Array.isArray(res.data) && res.data.length > 0);
    } catch (e) {
      return false;
    }
  };

  const iapHandlerRef = useRef(null);
  iapHandlerRef.current = async (purchase) => {
    const parsed = parseSku(purchase.productId);
    if (!parsed) return false;
    // The purchase token is the idempotency key AND the
    // transactions reference (see billing/iap.js).
    const purchaseToken = purchase.purchaseToken || purchase.transactionId || null;
    if (purchaseToken && (await hasCreditedPurchase(purchaseToken))) {
      return true; // already credited — finish it, don't pay twice
    }
    const reference = purchaseToken || purchase.productId;
    if (parsed.type === 'coins') {
      const pack = coinPacks.find((p) => p.id === parsed.id);
      if (!pack) return false;
      const total = pack.coins + (pack.bonus || 0);
      const res = await adjustWallet({ coinsDelta: total, kind: 'purchase_coins', reference });
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
      const res = await setVip({ vipLevel: pack.id, days: pack.days, reference });
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
      const res = await adjustWallet({ diamondsDelta: amount, kind: 'purchase_diamonds', reference });
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
        ...diamondPackIds.map((id) => skuForDiamondPack(id)),
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
  }, [coinPacks, vipPacks, diamondPackIds]);

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
  // Charge a finished call. Async: resolves to { cost } once the
  // wallet write has SETTLED on the server, or false when refused
  // (not signed in / insufficient coins) or the write failed.
  // Callers must await this before writing the calls row, so the
  // row never claims a cost that was never deducted.
  const chargeCall = (host, minutes, ratePerMinute) => {
    const cost = minutes * ratePerMinute;
    if (!signedIn) {
      showToast('Please sign in first.');
      return Promise.resolve(false);
    }
    if (coins < cost) {
      showToast('Not enough coins — please recharge first.');
      return Promise.resolve(false);
    }
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setCoins((c) => c - cost);
    setCallHistory((h) => [
      { id: String(Date.now()), name: host.name, duration: `${minutes} min`, cost, time: 'Just now' },
      ...h,
    ]);
    const settled = settlePersist(prevCoins, prevDiamonds, adjustWallet({
      coinsDelta: -cost,
      kind: 'call_charge',
      reference: host ? host.name : null,
    }), false);
    const hostShare = Math.round(cost * (100 - PLATFORM_COMMISSION_PERCENT) / 100);
    if (host && host.id) {
      creditHostEarnings(host.id, hostShare * COIN_TO_DIAMOND_RATE, 'call_earnings', host.name);
    }
    return settled.then((ok) => (ok ? { cost } : false));
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
      // Best-effort: bump the host row's total_gifts. Never blocks
      // the gift and never throws — a failure just leaves the
      // counter one behind until the next gift.
      (async () => {
        try {
          const res = await withTimeout(
            supabase.from('hosts').select('total_gifts').eq('host_id', String(host.id)).maybeSingle(),
          );
          const current = res && res.data ? (res.data.total_gifts || 0) : 0;
          await supabase
            .from('hosts')
            .update({ total_gifts: current + 1 })
            .eq('host_id', String(host.id));
        } catch (e) { /* best-effort only */ }
      })();
    }
    return true;
  };

  // Buy a coin pack with real money: opens the Google Play sheet.
  // The coins land via the purchase listener, not here.
  const buyCoinPack = (pack) => buyWithIap(skuForCoinPack(pack.id));

  // Spend Diamonds from the signed-in user's profiles row
  // (negative-only). Positive credits NEVER happen here: Diamonds
  // only arrive through a real Play purchase, credited by the
  // purchase listener. ProfileScreen Exchange passes a positive
  // amount to spend. Returns false when the balance is too low or
  // there is no session.
  const spendDiamonds = (amount, meta) => {
    if (!signedIn) {
      showToast('Please sign in first.');
      return false;
    }
    const spend = Math.floor(Number(amount) || 0);
    if (!spend || spend <= 0) return false;
    if (diamonds < spend) {
      showToast('Not enough Diamonds.');
      return false;
    }
    const prevCoins = coins;
    const prevDiamonds = diamonds;
    setDiamonds((d) => d - spend);
    settlePersist(prevCoins, prevDiamonds, adjustWallet({
      diamondsDelta: -spend,
      kind: (meta && meta.kind) || 'diamond_spend',
      reference: (meta && meta.reference) || null,
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

  // [F1] Lucky Spin + Daily Reward — server-gated (reward_claims).
  // One claim per account per day: the insert below is the gate —
  // the UNIQUE(profile_id, kind, claim_date) constraint rejects a
  // second claim the same day even from another device or after a
  // reinstall. Local dates/streaks are display cache only.
  // `todayKey` is the local calendar date (YYYY-MM-DD); the
  // claim_date column stores it as a plain date, so no timezone
  // shift applies.
  const todayKey = () => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  };

  // Start of the local day as an ISO instant, for "today" queries
  // over timestamptz columns (transactions / calls created_at).
  const todayStartIso = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  // Insert a reward_claims gate row. Returns 'ok', 'claimed'
  // (unique-violation = already claimed today) or 'error'.
  const insertClaim = async (userId, kind, amount) => {
    if (!supabase) return 'error';
    try {
      const res = await withTimeout(
        supabase.from('reward_claims').insert({
          profile_id: userId,
          kind,
          claim_date: todayKey(),
          amount_coins: amount || 0,
        }),
      );
      if (!res) return 'error';
      if (res.error) {
        if (String(res.error.code) === '23505') return 'claimed';
        return 'error';
      }
      return 'ok';
    } catch (e) {
      return 'error';
    }
  };

  // Record that a spin was used today. Returns { ok, alreadyClaimed }.
  // The prize itself is credited separately by the screen via
  // addRewardCoins after the wheel stops.
  const recordSpin = async () => {
    const user = await getSignedInUser();
    if (!user || !supabase) return { ok: false, alreadyClaimed: false };
    const result = await insertClaim(user.id, 'spin', 0);
    if (result === 'claimed') return { ok: false, alreadyClaimed: true };
    if (result === 'error') return { ok: false, alreadyClaimed: false };
    setLastSpinDate(todayKey());
    setSpinsUsedToday((n) => n + 1);
    return { ok: true, alreadyClaimed: false };
  };

  // What kind of task is this, from its seeded title?
  const taskKind = (task) => {
    const t = String((task && task.title) || '').toLowerCase();
    if (t.includes('check-in') || t.includes('checkin')) return 'checkin';
    if (t.includes('spin')) return 'spin';
    if (t.includes('gift')) return 'gift';
    if (t.includes('call')) return 'call';
    if (t.includes('follow')) return 'follow';
    return 'other';
  };

  // Has the signed-in user finished this task today, checked
  // against the server (never local / memory state)?
  const isTaskDone = async (userId, task) => {
    if (!supabase) return false;
    const kind = taskKind(task);
    const since = todayStartIso();
    try {
      if (kind === 'checkin' || kind === 'spin') {
        const res = await withTimeout(
          supabase.from('reward_claims').select('id').eq('profile_id', userId).eq('kind', kind).eq('claim_date', todayKey()).limit(1),
        );
        return !!(res && Array.isArray(res.data) && res.data.length > 0);
      }
      if (kind === 'gift') {
        const res = await withTimeout(
          supabase.from('transactions').select('id').eq('profile_id', userId).eq('kind', 'gift_sent').gte('created_at', since).limit(1),
        );
        return !!(res && Array.isArray(res.data) && res.data.length > 0);
      }
      if (kind === 'call') {
        const res = await withTimeout(
          supabase.from('calls').select('id').eq('caller_id', userId).gte('created_at', since).limit(1),
        );
        return !!(res && Array.isArray(res.data) && res.data.length > 0);
      }
      if (kind === 'follow') {
        const target = (task && task.target_count) || 2;
        const res = await withTimeout(
          supabase.from('follows').select('host_id').eq('follower_id', userId),
        );
        return !!(res && Array.isArray(res.data) && res.data.length >= target);
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // [Vero] Daily Tasks — claim a finished task's coin reward once
  // per day per account. Server-gated: the reward_claims row
  // (kind 'task:<id>') is the claim record; completion is verified
  // against the server (transactions / calls / follows /
  // reward_claims), never local state. Returns true when credited.
  const claimTask = async (task) => {
    if (!task || !task.id) return false;
    const user = await getSignedInUser();
    if (!user || !supabase) return false;
    const reward = Number(task.reward_coins) || 0;
    if (reward <= 0) return false;
    const key = todayKey();
    try {
      const existing = await withTimeout(
        supabase.from('reward_claims').select('id').eq('profile_id', user.id).eq('kind', `task:${task.id}`).eq('claim_date', key).limit(1),
      );
      if (existing && Array.isArray(existing.data) && existing.data.length > 0) return false;
    } catch (e) { /* fall through to the completion check */ }
    if (!(await isTaskDone(user.id, task))) return false;
    const result = await insertClaim(user.id, `task:${task.id}`, reward);
    if (result !== 'ok') return false;
    setClaimedTasks((prev) => ({ ...prev, [key]: [...(prev[key] || []), String(task.id)] }));
    addRewardCoins(reward, 'Daily Task');
    return true;
  };

  // [Vero] Premium (VIP) purchase with real money: opens the Google
  // Play sheet for the VIP pack. vip_until + vip_level on the
  // profiles row are set from the purchase listener, not here.
  const buyVip = (pack) => buyWithIap(skuForVipPack(pack.id));
  // [/Vero]

  // Record a daily check-in. Server-gated to once per day per
  // account (reward_claims kind 'checkin'). Returns
  // { ok, alreadyClaimed }. The streak is display cache only.
  const recordCheckin = async () => {
    const user = await getSignedInUser();
    if (!user || !supabase) return { ok: false, alreadyClaimed: false };
    const result = await insertClaim(user.id, 'checkin', 0);
    if (result === 'claimed') return { ok: false, alreadyClaimed: true };
    if (result === 'error') return { ok: false, alreadyClaimed: false };
    const key = todayKey();
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    setCheckinStreak((s) => (lastCheckinDate === yKey ? s + 1 : 1));
    setLastCheckinDate(key);
    return { ok: true, alreadyClaimed: false };
  };
  // [/F1]

  // Follow / unfollow a host, persisted to the follows table
  // (follower_id = me, host_id = the host's text id). Optimistic
  // local update; on a DB failure the list rolls back and the user
  // is told. Callers (Home, ChatDetail) don't await it.
  const toggleFollow = async (hostId) => {
    if (!hostId) return;
    const id = String(hostId);
    const isFollowing = following.includes(id);
    setFollowing((f) => (isFollowing ? f.filter((x) => x !== id) : [...f, id]));
    const user = await getSignedInUser();
    if (!user || !supabase) return; // local-only without a session
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('host_id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, host_id: id });
        if (error) throw error;
      }
    } catch (e) {
      setFollowing((f) => (isFollowing ? [...f, id] : f.filter((x) => x !== id)));
      showToast("Couldn't save the follow — check your connection and try again.");
    }
  };

  const value = useMemo(
    // [F1] Reward state + actions exposed to RewardsScreen.
    // [Live] callRates/coinPacks/gifts/vipPacks/diamondPacks are the
    // resolved live (Supabase) or demo (config.js) catalog (diamond
    // packs are live-only); getLiveCallRate / getLiveVoiceCallRate
    // look tiers up in them; liveSource tells screens where the
    // data came from ('demo' | 'supabase').
    // [Wallet] signedIn/walletStatus/vipUntil/transactions/
    // refreshWallet/refreshTransactions expose the real wallet;
    // buyCoinPack/buyDiamondPack/buyVip open the Play sheet.
    // spendDiamonds is negative-only; updateMyProfile patches the
    // signed-in user's profiles row (auth.js); frames are the
    // active panel frames; unreadTotal counts unread messages;
    // levelInfo is { level, points, progress } from real
    // transactions on the LV_ROWS ladder.
    () => ({ coins, diamonds, following, toggleFollow, sendGift, spendDiamonds, buyCoinPack, buyDiamondPack, chargeCall, chargeVoiceCall, callHistory, toast, showToast, hosts, setHostOnline, setHostRate, userCountry /* [F3] */, addRewardCoins, recordSpin, recordCheckin, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, claimTask, vipLevel, vipUntil, buyVip /* [Vero] */, callRates, coinPacks, gifts, vipPacks, diamondPacks, frames, getLiveCallRate, getLiveVoiceCallRate, liveSource /* [Live] */, signedIn, walletStatus, iapStatus, transactions, refreshWallet, refreshTransactions /* [Wallet] */, unreadTotal, refreshUnreadTotal, levelInfo, updateMyProfile }),
    [coins, diamonds, following, callHistory, toast, hosts, spinsUsedToday, lastSpinDate, lastCheckinDate, checkinStreak, giftsSent, claimedTasks, vipLevel, vipUntil, callRates, coinPacks, gifts, vipPacks, diamondPacks, frames, liveSource, signedIn, walletStatus, iapStatus, transactions, userCountry, unreadTotal, levelInfo]
    // [/F1]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
