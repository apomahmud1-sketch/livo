// Livo VIPScreen — Vero-style Premium.
// The 10 privilege effects and the coin ladder are gone: only the
// privileges actually enforced in code are shown as active (the gold
// VIP frame on the avatar in ProfileScreen, and the vehicle entrance
// effect in VideoCallScreen — both gated on store.vipLevel). The
// rest are labelled "Coming soon", not presented as live benefits.
// The old VIP_LEVELS coin ladder (60,000–5,000,000 coins) is removed:
// those tiers were unbuyable and had no panel values.
// Buying is REAL now (2026-11-22): buyVip opens the Google Play
// sheet and the purchase listener sets vip_until + vip_level on the
// signed-in user's profiles row. Until the VIP products exist in
// Play Console the Buy buttons explain that instead of charging
// anything.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
import VipFrame from '../components/VipFrame'; // [Vero] animated VIP avatar frame

// Privileges actually enforced in code (gated on store.vipLevel):
//  • Avatar Frame — gold VipFrame on the avatar (ProfileScreen).
//  • Rare Vehicle — vehicle entrance effect (VideoCallScreen).
const ACTIVE_PRIVILEGES = ['Avatar Frame', 'Rare Vehicle'];

// Shown honestly as not yet live — not presented as active benefits.
const COMING_SOON_PRIVILEGES = [
  'VIP Title', 'Distinguished Card', 'Entrance Show',
  'Chat Bubble', 'Gift Tassel', 'Privileged Gifts',
  'Room Priority Display', 'Birthday Gift',
];

export default function VIPScreen() {
  const { vipLevel, vipUntil, buyVip, vipPacks, signedIn, iapStatus } = useApp();
  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>👑 Premium</Text>
      <Text style={styles.sub}>VIP titles, frames, gifts and effects — 30 days.</Text>

      {!signedIn ? (
        <Text style={styles.signinNote}>Please sign in to buy Premium — your VIP stays on your account.</Text>
      ) : null}

      <Text style={styles.sectionTitle}>Privilege Effects</Text>
      <View style={styles.perkGrid}>
        {ACTIVE_PRIVILEGES.map((p) => (
          <View key={p} style={styles.perkChip}>
            <Text style={styles.perkText}>{p}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Coming soon</Text>
      <View style={styles.perkGrid}>
        {COMING_SOON_PRIVILEGES.map((p) => (
          <View key={p} style={[styles.perkChip, styles.perkChipSoon]}>
            <Text style={[styles.perkText, styles.perkTextSoon]}>{p}</Text>
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
        <Text style={styles.frameNote}>Gold VIP frame — shows on your profile when Premium is active.</Text>
      </View>

      <Text style={styles.sectionTitle}>Buy Premium</Text>
      {/* [Live] Buy packs come from the store (live Supabase rows
          when the setup SQL is pasted, config.js demo packs otherwise). */}
      {vipPacks.map((p) => {
        const active = vipLevel === p.id;
        return (
          <View key={p.id} style={styles.card}>
            <Text style={styles.name}>{p.name} · {p.days} days</Text>
            <Text style={styles.price}>{p.price}</Text>
            {active && vipUntil ? (
              <Text style={styles.activeUntil}>Active until {new Date(vipUntil).toLocaleDateString()}</Text>
            ) : null}
            <TouchableOpacity style={styles.btn} onPress={() => buyVip(p)}>
              <Text style={styles.btnText}>{active ? '✓ Active' : 'Buy Premium'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <Text style={styles.note}>
        {iapStatus === 'no-products'
          ? 'Premium purchases open in Google Play once the VIP products are created in Play Console.'
          : iapStatus === 'ready'
            ? 'Secure purchase via Google Play — Premium activates on your account for 30 days.'
            : 'VIP packages and prices are set by the admin panel.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#052e16', flex: 1 }, // [Preview] dark green + gold, like the livo-preview
  btn: { alignItems: 'center', backgroundColor: '#f59e0b', borderRadius: 20, marginTop: 10, paddingVertical: 10 },
  btnText: { color: '#052e16', fontWeight: 'bold' },
  card: { backgroundColor: '#14532d', borderRadius: 14, marginTop: 12, padding: 16 },
  levelDot: { borderRadius: 8, height: 16, width: 16 },
  levelInfo: { flex: 1, marginLeft: 10 },
  levelName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  levelPrice: { color: '#fbbf24', fontSize: 13, fontWeight: 'bold' },
  levelRow: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 12, flexDirection: 'row', marginTop: 8, padding: 12 },
  levelSub: { color: '#a7f3d0', fontSize: 12, marginTop: 2 },
  name: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  note: { color: '#a7f3d0', fontSize: 12, marginTop: 16 },
  perkChip: { backgroundColor: '#14532d', borderRadius: 14, marginBottom: 8, marginRight: 8, paddingHorizontal: 12, paddingVertical: 6 },
  perkChipSoon: { backgroundColor: 'transparent', borderColor: '#14532d', borderWidth: 1 },
  perkTextSoon: { color: '#a7f3d0', fontWeight: 'normal' },
  perkGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  perkText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  // [Vero] VIP frame preview.
  activeUntil: { color: '#a7f3d0', fontSize: 12, marginTop: 4 },
  signinNote: { color: '#fbbf24', fontSize: 13, marginTop: 12 },
  framePreview: { alignItems: 'center', backgroundColor: '#14532d', borderRadius: 14, marginTop: 8, padding: 16 },
  frameAvatar: { alignItems: 'center', backgroundColor: COLORS.purple, borderRadius: 44, height: 88, justifyContent: 'center', width: 88 },
  frameAvatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  frameNote: { color: '#a7f3d0', fontSize: 12, marginTop: 12, textAlign: 'center' },
  // [/Vero]
  price: { color: '#fbbf24', fontSize: 16, marginTop: 4 },
  sectionTitle: { color: '#fbbf24', fontSize: 18, fontWeight: 'bold', marginTop: 20 },
  sub: { color: '#a7f3d0', marginTop: 6 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  wrap: { padding: 16, paddingTop: 48 },
});
