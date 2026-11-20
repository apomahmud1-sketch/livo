// Livo VIPScreen — Vero-style Premium.
// Shows the VIP level ladder (Baron → Legend, prices in coins,
// from vip-config.json), the 10 privilege effects, and the 3
// dollar packs to buy. Buying is demo for now (no real payment
// yet — same pattern as Wallet); the active level lives in the
// store (buyVip) and is saved on the device.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, VIP_PACKS } from '../config';
import { useApp } from '../store';
import VipFrame from '../components/VipFrame'; // [Vero] animated VIP avatar frame

const VIP_LEVELS = [
  { level: 1, name: 'Baron', price: 60000, color: '#C0C0C0', perks: 2 },
  { level: 2, name: 'Earl', price: 120000, color: '#4FC3F7', perks: 3 },
  { level: 3, name: 'Marquis', price: 300000, color: '#BA68C8', perks: 4 },
  { level: 4, name: 'Duke', price: 600000, color: '#FFB300', perks: 5 },
  { level: 5, name: 'King', price: 1200000, color: '#FFD700', perks: 6 },
  { level: 6, name: 'Emperor', price: 2400000, color: '#FF6D00', perks: 7 },
  { level: 7, name: 'Legend', price: 5000000, color: '#00E676', perks: 10 },
];

const PRIVILEGES = [
  'VIP Title', 'Avatar Frame', 'Distinguished Card', 'Entrance Show',
  'Chat Bubble', 'Gift Tassel', 'Rare Vehicle', 'Privileged Gifts',
  'Room Priority Display', 'Birthday Gift',
];

export default function VIPScreen() {
  const { vipLevel, buyVip } = useApp();
  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>👑 Premium</Text>
      <Text style={styles.sub}>VIP titles, frames, gifts and effects — 30 days.</Text>

      <Text style={styles.sectionTitle}>Privilege Effects</Text>
      <View style={styles.perkGrid}>
        {PRIVILEGES.map((p) => (
          <View key={p} style={styles.perkChip}>
            <Text style={styles.perkText}>{p}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Your VIP Frame</Text>
      <View style={styles.framePreview}>
        <VipFrame frame="gold" size={110}>
          <View style={styles.frameAvatar}>
            <Text style={styles.frameAvatarText}>M</Text>
          </View>
        </VipFrame>
        <Text style={styles.frameNote}>Gold VIP frame — shows on your profile when Premium is active. The purple Dynamic frame is in the Frame Designer.</Text>
      </View>

      <Text style={styles.sectionTitle}>VIP Levels</Text>
      {VIP_LEVELS.map((lv) => (
        <View key={lv.level} style={styles.levelRow}>
          <View style={[styles.levelDot, { backgroundColor: lv.color }]} />
          <View style={styles.levelInfo}>
            <Text style={styles.levelName}>VIP {lv.level} · {lv.name}</Text>
            <Text style={styles.levelSub}>{lv.perks} privileges</Text>
          </View>
          <Text style={styles.levelPrice}>{lv.price.toLocaleString()} coins</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Buy Premium</Text>
      {VIP_PACKS.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.name}>{p.name} · {p.days} days</Text>
          <Text style={styles.price}>{p.price}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => buyVip(p)}>
            <Text style={styles.btnText}>{vipLevel === p.id ? '✓ Active' : 'Buy Premium'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      <Text style={styles.note}>VIP packages and prices are set by the admin panel. Purchase is demo — no real payment yet.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#fff', flex: 1 },
  btn: { alignItems: 'center', backgroundColor: COLORS.purple, borderRadius: 20, marginTop: 10, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: COLORS.lavender, borderRadius: 14, marginTop: 12, padding: 16 },
  levelDot: { borderRadius: 8, height: 16, width: 16 },
  levelInfo: { flex: 1, marginLeft: 10 },
  levelName: { fontSize: 16, fontWeight: 'bold' },
  levelPrice: { fontSize: 13, fontWeight: 'bold' },
  levelRow: { alignItems: 'center', backgroundColor: COLORS.lavender, borderRadius: 12, flexDirection: 'row', marginTop: 8, padding: 12 },
  levelSub: { color: COLORS.grey, fontSize: 12, marginTop: 2 },
  name: { fontSize: 18, fontWeight: 'bold' },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 16 },
  perkChip: { backgroundColor: COLORS.lavender, borderRadius: 14, marginBottom: 8, marginRight: 8, paddingHorizontal: 12, paddingVertical: 6 },
  perkGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  perkText: { fontSize: 13, fontWeight: 'bold' },
  // [Vero] VIP frame preview.
  framePreview: { alignItems: 'center', backgroundColor: COLORS.lavender, borderRadius: 14, marginTop: 8, padding: 16 },
  frameAvatar: { alignItems: 'center', backgroundColor: COLORS.purple, borderRadius: 44, height: 88, justifyContent: 'center', width: 88 },
  frameAvatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  frameNote: { color: COLORS.grey, fontSize: 12, marginTop: 12, textAlign: 'center' },
  // [/Vero]
  price: { fontSize: 16, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20 },
  sub: { color: COLORS.grey, marginTop: 6 },
  title: { fontSize: 24, fontWeight: 'bold' },
  wrap: { padding: 16, paddingTop: 48 },
});
