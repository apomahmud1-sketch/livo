import React, { createContext, useContext, useMemo, useState } from 'react';
import { COIN_TO_DIAMOND_RATE, PLATFORM_COMMISSION_PERCENT } from './config';

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

  const toggleFollow = (hostId) => {
    setFollowing((f) => (f.includes(hostId) ? f.filter((x) => x !== hostId) : [...f, hostId]));
  };

  const value = useMemo(
    () => ({ coins, diamonds, earnings, following, toggleFollow, sendGift, recharge, buyDiamonds, chargeCall, callHistory, toast, showToast }),
    [coins, diamonds, earnings, following, callHistory, toast]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
