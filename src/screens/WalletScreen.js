// Livo — Wallet (redesigned 2026-11-26 from the user's reference
// image; coins-only since 2026-11-27): dark screen, gradient Coin
// balance card, 3-column Recharge grid (live coin packs), one big
// Recharge Now button, an Agent pill at the top-right of Recharge
// (scrolls to the Buy from Agent section). Diamonds do NOT live
// here any more — the Diamonds section and Buy Diamonds button were
// removed (user 2026-11-27); Diamonds live on the My Income screen
// for hosts. The diamond packs stay in the DB/panel and the
// buyDiamondPack billing code stays in the store — only this
// screen stopped showing them. Tapping an agent card opens the
// agent's detail inside the app (AgentDetail screen).
// Removed: the agree checkbox + Confirm in the middle and the
// static Play Console note — the buy flow itself toasts the Play
// Console state (see store buyWithIap). Balances and packs are the
// live catalog, never hardcoded. The Bill (receipt) icon opens
// Bill · History inside this screen.
import React, { useEffect, useRef, useState } from 'react';
import { findNodeHandle, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, THEME } from '../config';
import { useApp } from '../store';
import { getIapProducts, skuForCoinPack } from '../billing/iap';
import { listPublicAgents } from '../supabase/agent';

// Normalize an agent phone into a wa.me number (digits only):
// 8 digits starting with 8/9 = Singapore mobile, prefix 65;
// 11 digits starting with 0 = Bangladesh, strip the 0, prefix 880;
// anything else is used as-is. Exported for AgentDetailScreen.
export function agentWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 8 && (digits[0] === '8' || digits[0] === '9')) return `65${digits}`;
  if (digits.length === 11 && digits[0] === '0') return `880${digits.slice(1)}`;
  return digits;
}

// Display price: Play's localizedPrice when the Play product was
// found, else the catalog price — never a price that differs from
// what Play charges.
function playPrice(sku, catalogPrice) {
  const prod = getIapProducts().find((p) => p.id === sku);
  return (prod && (prod.localizedPrice || prod.price)) || catalogPrice;
}

function txText(t) {
  if (t.amountCoins) {
    return `${t.amountCoins > 0 ? '+' : ''}${t.amountCoins.toLocaleString()} coins · ${t.kind}`;
  }
  if (t.amountDiamonds) {
    return `${t.amountDiamonds > 0 ? '+' : ''}${t.amountDiamonds.toLocaleString()} 💎 · ${t.kind}`;
  }
  return String(t.kind || 'transaction');
}

// What the user actually receives for a coin pack: base + bonus.
function coinTotal(p) {
  return (p.coins || 0) + (p.bonus || 0);
}

export default function WalletScreen({ navigation }) {
  const {
    coins, diamonds, buyCoinPack, coinPacks,
    showToast, signedIn, transactions, refreshTransactions,
  } = useApp();
  const [selectedCoinId, setSelectedCoinId] = useState(null);
  const [showBill, setShowBill] = useState(false);
  // Bill · History filter: All / Received / Sent. Received =
  // a positive coins or diamonds amount; Sent = a negative one.
  const [billFilter, setBillFilter] = useState('all');
  // Approved coin agents (Wallet "Buy from Agent" section, below
  // the coin packs). null = still loading, [] = none or load failed
  // (agentsFailed tells those two apart).
  const [agents, setAgents] = useState(null);
  const [agentsFailed, setAgentsFailed] = useState(false);
  const scrollRef = useRef(null);
  const agentRef = useRef(null);

  useEffect(() => {
    let alive = true;
    listPublicAgents().then((rows) => {
      if (!alive) return;
      if (rows === null) {
        setAgents([]);
        setAgentsFailed(true);
      } else {
        setAgents(rows);
        setAgentsFailed(false);
      }
    });
    return () => { alive = false; };
  }, []);

  // Scroll the Agent pill target into view (the Buy from Agent
  // section sits below the packs).
  const scrollToAgents = () => {
    const node = agentRef.current;
    const scroller = scrollRef.current;
    if (!node || !scroller) return;
    try {
      node.measureLayout(findNodeHandle(scroller), (x, y) => {
        scroller.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }, () => {});
    } catch (e) { /* layout not ready — ignore */ }
  };

  const visibleTx = transactions.filter((h) => {
    if (billFilter === 'received') return (h.amountCoins || 0) > 0 || (h.amountDiamonds || 0) > 0;
    if (billFilter === 'sent') return (h.amountCoins || 0) < 0 || (h.amountDiamonds || 0) < 0;
    return true;
  });
  // Totals for the visible filter only (never the whole list when
  // a filter is on). Shown with a sign, e.g. +1,200 coins.
  const visibleTotals = visibleTx.reduce(
    (acc, h) => ({
      coins: acc.coins + (h.amountCoins || 0),
      diamonds: acc.diamonds + (h.amountDiamonds || 0),
    }),
    { coins: 0, diamonds: 0 },
  );
  const signed = (n) => `${n > 0 ? '+' : ''}${n.toLocaleString()}`;

  // Coin selection defaults to the first live pack (like the
  // reference image) — still null while the catalog loads.
  const selectedCoin = coinPacks.find((p) => p.id === selectedCoinId) || coinPacks[0] || null;

  // Bill · History is the real transactions table, re-read whenever
  // the view opens.
  useEffect(() => {
    if (showBill && typeof refreshTransactions === 'function') {
      refreshTransactions();
    }
  }, [showBill]);

  const rechargeNow = async () => {
    if (!selectedCoin) {
      showToast('Coin packs are still loading — try again in a moment.');
      return;
    }
    if (typeof buyCoinPack !== 'function') {
      showToast('Upload the new store.js first, then buy again.');
      return;
    }
    // Opens the Google Play sheet; the coins land from the purchase
    // listener and the balance updates by itself. When Play
    // products are not set up yet, buyCoinPack toasts that itself.
    await buyCoinPack(selectedCoin);
  };

  const goBack = () => {
    if (navigation && navigation.goBack) navigation.goBack();
  };

  if (showBill) {
    return (
      <LinearGradient colors={['#341064', '#1c0538', '#12021f']} style={styles.bg}>
        <View style={styles.billHead}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setShowBill(false)}>
              <Text style={styles.back}>←</Text>
            </TouchableOpacity>
            <Text style={styles.billTitle}>Bill · History</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.filterRow}>
            {['all', 'received', 'sent'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, billFilter === f && styles.filterTabOn]}
                onPress={() => setBillFilter(f)}
              >
                <Text style={[styles.filterTxt, billFilter === f && styles.filterTxtOn]}>
                  {f === 'all' ? 'All' : f === 'received' ? 'Received' : 'Sent'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.billWrap}>
          {!signedIn ? (
            <Text style={styles.empty}>Please sign in to see your transactions.</Text>
          ) : transactions.length === 0 ? (
            <Text style={styles.empty}>No transactions yet</Text>
          ) : visibleTx.length === 0 ? (
            <Text style={styles.empty}>
              {billFilter === 'received' ? 'No received transactions yet' : 'No sent transactions yet'}
            </Text>
          ) : (
            <View>
              <Text style={styles.totals}>
                Total: {signed(visibleTotals.coins)} coins · {signed(visibleTotals.diamonds)} 💎
              </Text>
              {visibleTx.map((h) => (
                <View key={h.id} style={styles.histRow}>
                  <Text style={styles.histText}>{txText(h)}</Text>
                  <Text style={styles.done}>{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : 'Done'}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#341064', '#1c0538', '#12021f']} style={styles.bg}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
          <TouchableOpacity onPress={() => setShowBill(true)}>
            <Text style={styles.billIcon}>🧾</Text>
          </TouchableOpacity>
        </View>

        {!signedIn ? (
          <View style={styles.signinBanner}>
            <Text style={styles.signinText}>Please sign in to see your real balance and buy packs.</Text>
          </View>
        ) : null}

        <LinearGradient
          colors={['#a855f7', '#ec4899', '#fb923c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Coin balance</Text>
          <View style={styles.balanceRow}>
            <View style={styles.goldCoin}>
              <Text style={styles.goldCoinText}>$</Text>
            </View>
            <Text style={styles.balanceValue}>{coins.toLocaleString()}</Text>
          </View>
        </LinearGradient>

        <View style={styles.rechargeHead}>
          <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>Recharge</Text>
          <TouchableOpacity style={styles.agentPill} onPress={scrollToAgents}>
            <Text style={styles.agentPillText}>🤝 Agent</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.coinGrid}>
          {coinPacks.length === 0 ? (
            <Text style={styles.empty}>Coin packs are loading from the store — check your connection and try again.</Text>
          ) : (
            coinPacks.map((p) => {
              const total = coinTotal(p);
              const isSelected = selectedCoin && selectedCoin.id === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.coinTile, isSelected && styles.coinTileSelected]}
                  onPress={() => setSelectedCoinId(p.id)}
                >
                  <View style={styles.tileCoin}>
                    <Text style={styles.tileCoinText}>$</Text>
                  </View>
                  <Text style={styles.tileAmount}>{total.toLocaleString()}</Text>
                  {p.bonus ? (
                    <Text style={styles.tileBonus}>+{p.bonus.toLocaleString()} bonus</Text>
                  ) : null}
                  <Text style={styles.tilePrice}>{playPrice(skuForCoinPack(p.id), p.price)}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity onPress={rechargeNow} activeOpacity={0.85}>
          <LinearGradient
            colors={['#a855f7', '#7b2ff7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.rechargeBtn}
          >
            <Text style={styles.rechargeBtnText}>Recharge Now</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View ref={agentRef} collapsable={false}>
          {agents !== null ? (
            <View>
              <Text style={styles.sectionTitle}>🤝 Buy Coins from an Agent</Text>
              <Text style={styles.agentNote}>
                Pay the agent by cash or bKash, then share your Livo ID — the agent will send the coins to your account.
              </Text>
              {agentsFailed ? (
                <Text style={styles.empty}>Could not load coin agents — check your connection and try again.</Text>
              ) : agents.length === 0 ? (
                <Text style={styles.empty}>No coin agents available yet.</Text>
              ) : (
                agents.map((a) => (
                  <TouchableOpacity
                    key={a.agentId || a.name}
                    style={styles.agentRow}
                    onPress={() => navigation.navigate('AgentDetail', { agent: a })}
                  >
                    <View style={styles.agentInfo}>
                      <Text style={styles.agentName}>{a.name}</Text>
                      <Text style={styles.agentMeta}>@{a.agentId}</Text>
                      <Text style={styles.agentRate}>{a.rate.toLocaleString()} coins per $1</Text>
                    </View>
                    <Text style={styles.agentChev}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : null}
        </View>

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  agentChev: { color: THEME.dim, fontSize: 26, fontWeight: 'bold' },
  agentInfo: { flex: 1 },
  agentMeta: { color: THEME.dim, fontSize: 13, marginTop: 2 },
  agentName: { color: THEME.text, fontSize: 16, fontWeight: 'bold' },
  agentNote: { color: THEME.dim, fontSize: 13, marginTop: 6 },
  agentPill: { backgroundColor: 'rgba(247,183,51,0.12)', borderColor: THEME.gold, borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7 },
  agentPillText: { color: THEME.gold, fontSize: 14, fontWeight: 'bold' },
  agentRate: { color: THEME.text, fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  agentRow: { alignItems: 'center', backgroundColor: THEME.panel2, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, padding: 12 },
  back: { color: THEME.text, fontSize: 28, fontWeight: 'bold' },
  balanceCard: { borderRadius: 24, marginTop: 12, padding: 20 },
  balanceLabel: { color: '#fff', fontSize: 15 },
  balanceRow: { alignItems: 'center', flexDirection: 'row', marginTop: 6 },
  balanceValue: { color: '#fff', fontSize: 44, fontWeight: 'bold' },
  bg: { flex: 1 },
  billHead: { paddingHorizontal: 16, paddingTop: 48 },
  billIcon: { fontSize: 26 },
  billTitle: { color: THEME.text, fontSize: 20, fontWeight: 'bold' },
  billWrap: { padding: 16, paddingBottom: 32, paddingTop: 8 },
  coinGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 },
  coinTile: { alignItems: 'center', backgroundColor: THEME.panel2, borderColor: THEME.panel2, borderRadius: 16, borderWidth: 2, marginBottom: 12, paddingVertical: 16, width: '31%' },
  coinTileSelected: { borderColor: THEME.gold },
  done: { color: COLORS.green, fontWeight: 'bold' },
  empty: { color: THEME.text, fontSize: 14, marginTop: 20, textAlign: 'center', width: '100%' },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterTab: { backgroundColor: THEME.panel2, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  filterTabOn: { backgroundColor: '#fff' },
  filterTxt: { color: THEME.text, fontSize: 14, fontWeight: 'bold' },
  filterTxtOn: { color: THEME.purple },
  goldCoin: { alignItems: 'center', backgroundColor: THEME.gold, borderRadius: 24, height: 48, justifyContent: 'center', marginRight: 12, width: 48 },
  goldCoinText: { color: '#3d2400', fontSize: 22, fontWeight: 'bold' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerSpacer: { flex: 1 },
  histRow: { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 14 },
  histText: { color: COLORS.dark, flex: 1 },
  rechargeBtn: { alignItems: 'center', borderRadius: 28, marginTop: 16, paddingVertical: 16 },
  rechargeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  rechargeHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  sectionTitle: { color: THEME.text, fontSize: 20, fontWeight: 'bold', marginTop: 20 },
  sectionTitleInline: { marginTop: 0 },
  signinBanner: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, marginTop: 8, padding: 12 },
  signinText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  tileAmount: { color: THEME.gold, fontSize: 20, fontWeight: 'bold', marginTop: 8 },
  tileBonus: { color: THEME.gold2, fontSize: 11, marginTop: 2 },
  tileCoin: { alignItems: 'center', backgroundColor: THEME.gold, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  tileCoinText: { color: '#3d2400', fontSize: 20, fontWeight: 'bold' },
  tilePrice: { color: THEME.dim, fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  totals: { color: THEME.text, fontSize: 14, fontWeight: 'bold', marginBottom: 4, marginTop: 6 },
  wrap: { padding: 16, paddingBottom: 32, paddingTop: 48 },
});
