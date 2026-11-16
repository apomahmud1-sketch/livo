import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { CALL_HISTORY_SEED } from '../data';
import { useApp } from '../store';

export default function ProfileScreen({ navigation }) {
  const { coins, diamonds, earnings, callHistory } = useApp();
  const history = [...callHistory, ...CALL_HISTORY_SEED];

  const menu = [
    { label: 'My Wallet', onPress: () => navigation.navigate('WalletTab') },
    { label: 'Host Dashboard', onPress: () => navigation.navigate('HostDashboard') },
    { label: 'VIP Membership', onPress: () => navigation.navigate('VIP') },
    { label: 'Ranking', onPress: () => navigation.navigate('RankingTab') },
    { label: 'My chat price', onPress: () => navigation.navigate('HostDashboard') },
    { label: 'Settings', onPress: () => navigation.navigate('WalletTab') },
  ];

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>L</Text></View>
        <Text style={styles.name}>Livo User</Text>
        <Text style={styles.id}>ID: 100001 · 🇧🇩 Bangladesh · English</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.stat}><Text style={styles.statValue}>{coins.toLocaleString()}</Text><Text>🪙 Coins</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{diamonds.toLocaleString()}</Text><Text>💎 Diamonds</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{earnings.toLocaleString()}</Text><Text>💰 Earnings</Text></View>
      </View>
      {menu.map((m) => (
        <TouchableOpacity key={m.label} style={styles.menuRow} onPress={m.onPress}>
          <Text style={styles.menuText}>{m.label}</Text>
          <Text>›</Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.section}>Call history</Text>
      {history.map((h) => (
        <View key={h.id} style={styles.histRow}>
          <Text>{h.name} · {h.duration}</Text>
          <Text>-{h.cost} coins · {h.time}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: COLORS.purple, borderRadius: 40, height: 80, justifyContent: 'center', width: 80 },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  bg: { backgroundColor: '#fff', flex: 1 },
  header: { alignItems: 'center' },
  histRow: { borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  id: { color: COLORS.grey, marginTop: 4 },
  menuRow: { borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  menuText: { fontSize: 16 },
  name: { fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 16 },
  section: { fontSize: 17, fontWeight: 'bold', marginTop: 16 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold' },
  wrap: { padding: 16, paddingTop: 48 },
});
