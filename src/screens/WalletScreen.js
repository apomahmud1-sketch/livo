// Livo — My Diamonds (Wallet), v2
// Built from the user's screenshot (sent 2026-11-18, 11:48 SGT):
// purple background, live 💎 balance at the top, 6 Diamond packs in
// 2 columns, the 57,000 pack special (orange-pink border + 👍 badge),
// and the "Please agree to the User Agreement and Privacy Policy
// first!" line at the bottom. The Bill (receipt) icon opens Bill ·
// History inside this screen.
// This REPLACES src/screens/WalletScreen.js (upload as WalletScreen.js).
// The old screen's coin packs + withdraw form are gone on purpose:
// Wallet is now My Diamonds only — Withdraw lives in My Income →
// Earn beans, as in the approved preview design.
// Needs the matching store.js update (buyDiamonds) to add the bought
// Diamonds to the live balance; until then buying shows a toast
// asking for that file, and nothing breaks.
import React, { useState } from 'react';
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

export default function WalletScreen({ navigation }) {
  const { diamonds, buyDiamonds, showToast } = useApp();
  const [agreed, setAgreed] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [bill, setBill] = useState([]);

  const selected = DIAMOND_PACKS.find((p) => p.id === selectedId) || null;

  const confirmBuy = () => {
    if (!agreed) {
      showToast('Please agree to the User Agreement and Privacy Policy first!');
      return;
    }
    if (!selected) {
      showToast('Choose a Diamond pack first.');
      return;
    }
    if (typeof buyDiamonds !== 'function') {
      showToast('Upload the new store.js first, then buy again.');
      return;
    }
    buyDiamonds(selected);
    setBill((b) => [
      { id: String(Date.now()), text: `💎 ${selected.diamonds.toLocaleString()} Diamonds · ${selected.price}`, status: 'Done' },
      ...b,
    ]);
    setSelectedId(null);
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
          {bill.length === 0 ? (
            <Text style={styles.empty}>No transactions yet — buy a pack and it will show here as Done.</Text>
          ) : (
            bill.map((h) => (
              <View key={h.id} style={styles.histRow}>
                <Text style={styles.histText}>{h.text}</Text>
                <Text style={styles.done}>{h.status}</Text>
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

      <Text style={styles.balance}>💎 {diamonds.toLocaleString()}</Text>

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
      <Text style={styles.note}>Demo purchase for now — no real payment yet. Real Google Play payment comes before launch.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  agreeRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 18 },
  agreeText: { color: '#fff', flex: 1, fontSize: 14 },
  back: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  balance: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 16, marginTop: 8 },
  bg: { backgroundColor: '#a855f7', flex: 1 },
  billIcon: { fontSize: 26 },
  billTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  checkbox: { alignItems: 'center', backgroundColor: 'transparent', borderColor: '#fff', borderRadius: 12, borderWidth: 2, height: 24, justifyContent: 'center', marginRight: 10, width: 24 },
  checkboxOn: { backgroundColor: '#fff' },
  checkMark: { color: COLORS.purple, fontSize: 16, fontWeight: 'bold' },
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
  thumbBadge: { alignItems: 'center', backgroundColor: '#ec4899', borderRadius: 14, height: 28, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 36, zIndex: 1 },
  thumbBadgeText: { fontSize: 14 },
  wrap: { padding: 16, paddingTop: 48 },
});
