import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { RANKING } from '../data';

const TABS = ['Daily', 'Weekly', 'Monthly'];

export default function RankingScreen() {
  const [tab, setTab] = useState('Daily');
  return (
    <View style={styles.bg}>
      <Text style={styles.title}>Ranking</Text>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}>
            <Text style={[styles.tab, tab === t && styles.tabActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {RANKING.map((r, i) => (
        <View key={r.id} style={styles.row}>
          <Text style={styles.rank}>{i + 1}</Text>
          <View style={[styles.avatar, { backgroundColor: r.color }]}><Text style={styles.avatarText}>{r.name[0]}</Text></View>
          <Text style={styles.name}>{r.name}</Text>
          <Text style={styles.score}>{r.score.toLocaleString()} 💎</Text>
        </View>
      ))}
      <Text style={styles.note}>Ranking updates from call + gift earnings. Admin sets ranking rewards.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', marginLeft: 12, width: 40 },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  bg: { backgroundColor: '#fff', flex: 1, padding: 16, paddingTop: 48 },
  name: { flex: 1, fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 16 },
  rank: { fontSize: 18, fontWeight: 'bold', width: 24 },
  row: { alignItems: 'center', borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 12 },
  score: { fontWeight: 'bold' },
  tab: { color: COLORS.grey, fontSize: 15, marginRight: 16, paddingBottom: 6 },
  tabActive: { borderBottomColor: COLORS.pink, borderBottomWidth: 2, color: COLORS.dark, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', marginVertical: 12 },
  title: { fontSize: 24, fontWeight: 'bold' },
});
