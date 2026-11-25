// Livo — Send Gift bottom sheet (new UI 2026-11-25, preview §3.6).
// Shown over the Video Call and Live Room screens. The GIFTS are
// the REAL catalog from the store (live Supabase rows when loaded,
// config.js defaults otherwise) — names and prices are the admin's,
// never the preview's mock prices. Sending charges real coins via
// store.sendGift (host share credited when a host is passed).
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Gift, X } from 'lucide-react-native';
import { THEME, formatGiftPrice } from '../config';
import { useApp } from '../store';

// Small gold coin icon (gold circle with a dark "C"), like the preview.
export function CoinIcon({ size = 14, fontSize = 9 }) {
  return (
    <View style={[styles.coinIcon, { height: size, width: size, borderRadius: size / 2 }]}>
      <Text style={[styles.coinLetter, { fontSize }]}>C</Text>
    </View>
  );
}

export default function GiftSheet({ visible, host, onClose, onSent }) {
  const { gifts, coins, sendGift } = useApp();
  const navigation = useNavigation();
  const [selectedId, setSelectedId] = useState(null);
  const list = gifts || [];

  // Default selection resets to the first gift each time the sheet opens.
  useEffect(() => {
    if (visible) setSelectedId(null);
  }, [visible]);

  const selected = list.find((g) => g.id === selectedId) || list[0] || null;

  const send = () => {
    if (!selected) return;
    if (!sendGift(selected, host)) return; // not enough coins — toast already shown
    if (onSent) onSent(selected);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.veil}>
        <TouchableOpacity style={styles.veilTap} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Gift size={21} color="#e879f9" strokeWidth={2.2} />
            <Text style={styles.title}>Send Gift</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <X size={18} color={THEME.text} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {list.length === 0 ? (
            <Text style={styles.empty}>No gifts available right now.</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
              {list.map((g) => {
                const isSel = selected && g.id === selected.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.tile, isSel && styles.tileSel]}
                    onPress={() => setSelectedId(g.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.emoji}>{g.emoji}</Text>
                    <Text style={styles.giftName} numberOfLines={1}>{g.name}</Text>
                    <View style={styles.priceRow}>
                      <CoinIcon size={14} fontSize={9} />
                      <Text style={styles.price}>{formatGiftPrice(g.price)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <View style={styles.balance}>
              <CoinIcon size={19} fontSize={11} />
              <Text style={styles.balanceText}>{Number(coins || 0).toLocaleString()}</Text>
              <TouchableOpacity
                style={styles.topUpBtn}
                onPress={() => {
                  onClose();
                  navigation.navigate('WalletTab');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.topUpTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={send} disabled={!selected} activeOpacity={0.85}>
              <LinearGradient
                colors={['#8b3dff', '#d946ef']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.sendBtn, !selected && styles.sendBtnDisabled]}
              >
                <Text style={styles.sendTxt}>Send 💕</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(6,0,14,0.55)' },
  veilTap: { flex: 1 },
  sheet: {
    backgroundColor: THEME.sheet,
    borderTopColor: 'rgba(255,255,255,0.14)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    maxHeight: '72%',
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: { alignItems: 'center', flexDirection: 'row', marginBottom: 14 },
  title: { color: THEME.text, flex: 1, fontSize: 17.5, fontWeight: '900', marginLeft: 8 },
  closeBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  empty: { color: THEME.dim, fontSize: 14, paddingVertical: 24, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingBottom: 6 },
  tile: {
    alignItems: 'center',
    backgroundColor: THEME.panel2,
    borderColor: 'transparent',
    borderRadius: 15,
    borderWidth: 2,
    minHeight: 92,
    paddingBottom: 9,
    paddingHorizontal: 4,
    paddingTop: 11,
    width: '31%',
  },
  tileSel: { backgroundColor: '#3a1666', borderColor: THEME.gold },
  emoji: { fontSize: 31 },
  giftName: { color: THEME.text, fontSize: 13, fontWeight: '700', marginTop: 4 },
  priceRow: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 3 },
  price: { color: THEME.gold2, fontSize: 12, fontWeight: '900' },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  balance: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  balanceText: { color: THEME.text, fontSize: 15.5, fontWeight: '900' },
  topUpBtn: { alignItems: 'center', backgroundColor: THEME.violet, borderRadius: 13, height: 26, justifyContent: 'center', width: 26 },
  topUpTxt: { color: '#fff', fontSize: 16, fontWeight: '900', lineHeight: 18 },
  sendBtn: { borderRadius: 13, minHeight: 48, paddingHorizontal: 26, paddingVertical: 12 },
  sendBtnDisabled: { opacity: 0.5 },
  sendTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  coinIcon: { alignItems: 'center', backgroundColor: THEME.gold, justifyContent: 'center' },
  coinLetter: { color: '#8a5200', fontWeight: '900' },
});
