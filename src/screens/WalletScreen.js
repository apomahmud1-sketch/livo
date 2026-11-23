// Livo — My Diamonds (Wallet), v3
// Built from the user's screenshot (sent 2026-11-18, 11:48 SGT):
// purple background, live 💎 balance at the top, 6 Diamond packs in
// 2 columns, the 57,000 pack special (orange-pink border + 👍 badge),
// and the "Please agree to the User Agreement and Privacy Policy
// first!" line at the bottom. The Bill (receipt) icon opens Bill ·
// History inside this screen.
// Balances are REAL now (2026-11-22): coins/diamonds come from the
// signed-in user's profiles row (store.js); buys open the Google
// Play sheet (react-native-iap) and the credit lands from the
// purchase listener. Bill · History reads the real transactions
// rows. Until the products exist in Play Console the Buy buttons
// explain that instead of charging anything.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
import { getIapProducts, skuForCoinPack, skuForDiamondPack } from '../billing/iap';

// Diamond packs come ONLY from the store's live catalog
// (diamond_packs table via live.js) — no hardcoded list here.
// `old` is the struck-through base price: diamonds minus bonus
// (null when there is no bonus). The 57,000 pack keeps its
// special orange-pink border + 👍 badge, as in the screenshot.
// Display price: Play's localizedPrice when the Play product was
// found, else the catalog price — never a price that differs from
// what Play charges.
function playPrice(sku, catalogPrice) {
  const prod = getIapProducts().find((p) => p.id === sku);
  return (prod && (prod.localizedPrice || prod.price)) || catalogPrice;
}

function packGems(diamonds) {
  if (diamonds >= 100000) return '💎💎💎💎';
  if (diamonds >= 48000) return '💎💎💎';
  if (diamonds >= 13200) return '💎💎';
  return '💎';
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

export default function WalletScreen({ navigation }) {
  const {
    coins, diamonds, buyDiamondPack, buyCoinPack, coinPacks, diamondPacks,
    showToast, signedIn, iapStatus, transactions, refreshTransactions,
  } = useApp();
  const [agreed, setAgreed] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showBill, setShowBill] = useState(false);
  // Bill · History filter: All / Received / Sent. Received =
  // a positive coins or diamonds amount; Sent = a negative one.
  const [billFilter, setBillFilter] = useState('all');

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

  // Diamond pack ids, derived from the live catalog (never hardcoded).
  const DIAMOND_PACK_IDS = diamondPacks.map((p) => p.id);
  const selected = diamondPacks.find((p) => p.id === selectedId) || null;
  const selectedPrice = selected ? playPrice(skuForDiamondPack(selected.id), selected.price) : null;

  // Bill · History is the real transactions table, re-read whenever
  // the view opens.
  useEffect(() => {
    if (showBill && typeof refreshTransactions === 'function') {
      refreshTransactions();
    }
  }, [showBill]);

  const confirmBuy = async () => {
    if (!agreed) {
      showToast('Please agree to the User Agreement and Privacy Policy first!');
      return;
    }
    if (!selected) {
      showToast('Choose a Diamond pack first.');
      return;
    }
    if (typeof buyDiamondPack !== 'function') {
      showToast('Upload the new store.js first, then buy again.');
      return;
    }
    // Opens the Google Play sheet; the Diamonds land from the
    // purchase listener and the balance updates by itself.
    const opened = await buyDiamondPack(selected);
    if (opened) setSelectedId(null);
  };

  const goBack = () => {
    if (navigation && navigation.goBack) navigation.goBack();
  };

  if (showBill) {
    return (
      <View style={styles.bg}>
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
        <ScrollView contentContainerStyle={styles.wrap}>
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
      </View>
    );
  }

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
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

      <Text style={styles.balance}>💎 {diamonds.toLocaleString()}</Text>
      <Text style={styles.coinsBalance}>🪙 {coins.toLocaleString()} coins</Text>

      <View style={styles.grid}>
        {diamondPacks.length === 0 ? (
          <Text style={styles.empty}>Diamond packs are loading from the store — check your connection and try again.</Text>
        ) : (
          diamondPacks.map((p) => {
            const old = p.bonus ? p.diamonds - p.bonus : null;
            const special = p.id === 'd57000';
            const price = playPrice(skuForDiamondPack(p.id), p.price);
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.pack,
                  special && styles.packSpecial,
                  selectedId === p.id && styles.packSelected,
                ]}
                onPress={() => setSelectedId(p.id)}
              >
                {special ? (
                  <View style={styles.thumbBadge}>
                    <Text style={styles.thumbBadgeText}>👍</Text>
                  </View>
                ) : null}
                <Text style={styles.gems}>{packGems(p.diamonds)}</Text>
                <Text style={styles.packAmount}>{p.diamonds.toLocaleString()}</Text>
                {old ? <Text style={styles.oldPrice}>{old.toLocaleString()}</Text> : null}
                <View style={[styles.priceBar, special && styles.priceBarSpecial]}>
                  <Text style={[styles.price, special && styles.priceSpecial]}>{price}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)}>
        <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
          {agreed ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={styles.agreeText}>
          Please agree to the User Agreement and Privacy Policy first!
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.confirmBtn, (!agreed || !selected) && styles.confirmBtnOff]}
        onPress={confirmBuy}
      >
        <Text style={styles.confirmText}>
          {selected ? `Confirm · ${selected.diamonds.toLocaleString()} Diamonds ${selectedPrice}` : 'Confirm'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>🪙 Top up Coins</Text>
      {coinPacks.map((p) => (
        <View key={p.id} style={styles.coinRow}>
          <Text style={styles.coinText}>
            {((p.coins || 0) + (p.bonus || 0)).toLocaleString()} coins
            {p.bonus ? ` (+${p.bonus.toLocaleString()} bonus)` : ''}
          </Text>
          <Text style={styles.coinPrice}>{playPrice(skuForCoinPack(p.id), p.price)}</Text>
          <TouchableOpacity style={styles.coinBtn} onPress={() => buyCoinPack(p)}>
            <Text style={styles.coinBtnText}>Buy</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={styles.note}>
        {iapStatus === 'no-products'
          ? 'Purchases open in Google Play once the coin, diamond and VIP products are created in Play Console.'
          : iapStatus === 'ready'
            ? 'Secure purchase via Google Play.'
            : 'Real Google Play payment — billing is starting up.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  agreeRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 18 },
  agreeText: { color: '#fff', flex: 1, fontSize: 14 },
  back: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  balance: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 4, marginTop: 8 },
  bg: { backgroundColor: '#a855f7', flex: 1 },
  billIcon: { fontSize: 26 },
  billTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  checkbox: { alignItems: 'center', backgroundColor: 'transparent', borderColor: '#fff', borderRadius: 12, borderWidth: 2, height: 24, justifyContent: 'center', marginRight: 10, width: 24 },
  checkboxOn: { backgroundColor: '#fff' },
  checkMark: { color: COLORS.purple, fontSize: 16, fontWeight: 'bold' },
  coinBtn: { backgroundColor: COLORS.purpleDark, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  coinBtnText: { color: '#fff', fontWeight: 'bold' },
  coinPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  coinRow: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, padding: 12 },
  coinText: { color: '#fff', flex: 1, fontSize: 15, fontWeight: 'bold' },
  coinsBalance: { color: '#e9d5ff', fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  confirmBtn: { alignItems: 'center', backgroundColor: COLORS.purpleDark, borderRadius: 24, marginTop: 16, paddingVertical: 14 },
  confirmBtnOff: { opacity: 0.55 },
  confirmText: { color: '#fff', fontWeight: 'bold' },
  done: { color: COLORS.green, fontWeight: 'bold' },
  empty: { color: '#fff', fontSize: 14, marginTop: 20, textAlign: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterTab: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  filterTabOn: { backgroundColor: '#fff' },
  filterTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  filterTxtOn: { color: COLORS.purple },
  totals: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 4, marginTop: 6 },
  gems: { fontSize: 40, marginBottom: 8, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerSpacer: { flex: 1 },
  histRow: { backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 14 },
  histText: { color: COLORS.dark, flex: 1 },
  note: { color: '#e9d5ff', fontSize: 12, marginTop: 10, textAlign: 'center' },
  oldPrice: { color: COLORS.grey, fontSize: 15, textDecorationLine: 'line-through' },
  pack: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#fff', marginBottom: 14, overflow: 'hidden', paddingTop: 18, width: '48%' },
  packAmount: { color: COLORS.dark, fontSize: 20, fontWeight: 'bold' },
  packSelected: { borderColor: COLORS.purpleDark },
  packSpecial: { borderColor: '#fb923c' },
  price: { color: COLORS.purple, fontSize: 17, fontWeight: 'bold' },
  priceBar: { alignItems: 'center', backgroundColor: '#ede9fe', marginTop: 10, paddingVertical: 10, width: '100%' },
  priceBarSpecial: { backgroundColor: '#fb7185' },
  priceSpecial: { color: '#fff' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 20 },
  signinBanner: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, marginTop: 8, padding: 12 },
  signinText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  thumbBadge: { alignItems: 'center', backgroundColor: '#ec4899', borderRadius: 14, height: 28, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 36, zIndex: 1 },
  thumbBadgeText: { fontSize: 14 },
  wrap: { padding: 16, paddingTop: 48 },
});
