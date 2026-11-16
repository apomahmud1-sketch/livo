import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CALL_RATES, COLORS, PLATFORM_COMMISSION_PERCENT, getCallRate } from '../config';
import { useApp } from '../store';

export default function HostDashboardScreen() {
  const { earnings, diamonds, callHistory } = useApp();
  const [online, setOnline] = useState(true);
  const [myTier, setMyTier] = useState('tier2');
  const rate = getCallRate(myTier);

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Host Dashboard</Text>
      <TouchableOpacity style={[styles.onlineBtn, online && styles.onlineOn]} onPress={() => setOnline(!online)}>
        <Text style={styles.onlineText}>{online ? '🟢 Online — accepting calls' : '⚪ Offline — tap to go online'}</Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <View style={styles.card}><Text style={styles.label}>💰 Total earnings</Text><Text style={styles.value}>{earnings.toLocaleString()} 💎</Text></View>
        <View style={styles.card}><Text style={styles.label}>💎 Diamonds</Text><Text style={styles.value}>{diamonds.toLocaleString()}</Text></View>
      </View>
      <Text style={styles.note}>Platform commission: {PLATFORM_COMMISSION_PERCENT}% (set by admin).</Text>

      <Text style={styles.section}>My call rate (admin sets the 5 tiers)</Text>
      {CALL_RATES.map((r) => (
        <TouchableOpacity key={r.id} style={[styles.tier, myTier === r.id && styles.tierOn]} onPress={() => setMyTier(r.id)}>
          <Text style={myTier === r.id ? styles.tierTextOn : styles.tierText}>{r.name} — {r.coinsPerMinute} coins/min</Text>
          {myTier === r.id && <Text style={styles.tierTextOn}>✓ Selected ({rate.coinsPerMinute}/min)</Text>}
        </TouchableOpacity>
      ))}

      <Text style={styles.section}>Recent calls</Text>
      {callHistory.length === 0 && <Text style={styles.note}>No calls yet in this session — demo history is on your Profile.</Text>}
      {callHistory.map((h) => (
        <View key={h.id} style={styles.histRow}>
          <Text>{h.name} · {h.duration}</Text>
          <Text>{h.cost} coins</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#fff', flex: 1 },
  card: { backgroundColor: COLORS.lavender, borderRadius: 14, flex: 1, margin: 4, padding: 14 },
  histRow: { borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  label: { fontSize: 13 },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 8 },
  onlineBtn: { backgroundColor: COLORS.lightGrey, borderRadius: 24, marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  onlineOn: { backgroundColor: '#dcfce7' },
  onlineText: { fontWeight: 'bold' },
  row: { flexDirection: 'row', marginTop: 12 },
  section: { fontSize: 17, fontWeight: 'bold', marginTop: 20 },
  tier: { borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, marginTop: 8, padding: 12 },
  tierOn: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  tierText: { color: COLORS.dark },
  tierTextOn: { color: '#fff', fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: 'bold' },
  value: { fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  wrap: { padding: 16, paddingTop: 48 },
});
