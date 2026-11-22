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

// Exact packs from the screenshot. `old` is the struck-through price
// shown above the real price (null = no old price on that card).
// Admin can change every value from the mother panel later.
const DIAMOND_PACKS = [
  { id: 'd4000', diamonds: 4000, old: null, price: '$1.48', gems: '💎💎', special: false },
  { id: 'd13200', diamonds: 13200, old: 12000, price: '$3.99', gems: '💎', special: false },
  { id: 'd48000', diamonds: 48000, old: 40000, price: '$13.99', gems: '💎💎', special: false },
  { id: 'd150000', diamonds: 150000, old: 120000, price: '$41.99', gems: '💎💎💎', special: false },
  { id: 'd520000', diamonds: 520000, old: 400000, price: '$139.99', gems: '💎💎💎💎', special: false },
  { id: 'd57000', diamonds: 57000, old: 40000, price: '$13.99', gems: '💎💎💎', special: true },
];

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
    coins, diamonds, buyDiamondPack, buyCoinPack, coinPacks,
    showToast, signedIn, iapStatus, transactions, refreshTransactions,
  } = useApp();
  const [agreed, setAgreed] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showBill, setShowBill] = useState(false);

  const selected = DIAMOND_PACKS.find((p) => p.id === selectedId) || null;

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
        <ScrollView contentContainerStyle={styles.wrap}>
          {!signedIn ? (
            <Text style={styles.empty}>Please sign in to see your transactions.</Text>
          ) : transactions.length === 0 ? (
            <Text style={styles.empty}>No transactions yet — buy a pack and it will show here as Done.</Text>
          ) : (
            transactions.map((h) => (
              <View key={h.id} style={styles.histRow}>
                <Text style={styles.histText}>{txText(h)}</Text>
                <Text style={styles.done}>{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : 'Done'}</Text>
              </View>
            ))
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
        {DIAMOND_PACKS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.pack,
              p.special && styles.packSpecial,
              selectedId === p.id && styles.packSelected,
            ]}
            onPress={() => setSelectedId(p.id)}
          >
            {p.special ? (
              <View style={styles.thumbBadge}>
                <Text style={styles.thumbBadgeText}>👍</Text>
              </View>
            ) : null}
            <Text style={styles.gems}>{p.gems}</Text>
            <Text style={styles.packAmount}>{p.diamonds.toLocaleString()}</Text>
            {p.old ? <Text style={styles.oldPrice}>{p.old.toLocaleString()}</Text> : null}
            <View style={[styles.priceBar, p.special && styles.priceBarSpecial]}>
              <Text style={[styles.price, p.special && styles.priceSpecial]}>{p.price}</Text>
            </View>
          </TouchableOpacity>
        ))}
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
          {selected ? `Confirm · ${selected.diamonds.toLocaleString()} Diamonds ${selected.price}` : 'Confirm'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>🪙 Top up Coins</Text>
      {coinPacks.map((p) => (
        <View key={p.id} style={styles.coinRow}>
          <Text style={styles.coinText}>
            {((p.coins || 0) + (p.bonus || 0)).toLocaleString()} coins
            {p.bonus ? ` (+${p.bonus.toLocaleString()} bonus)` : ''}
          </Text>
          <Text style={styles.coinPrice}>{p.price}</Text>
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
