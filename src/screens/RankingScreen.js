import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { fetchRanking } from '../supabase/ranking';

const TABS = ['Daily', 'Weekly', 'Monthly', 'All Time'];

const TAB_TO_WINDOW = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
  'All Time': 'all',
};

const AVATAR_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#fbbf24', '#34d399', '#fb7185'];

export default function RankingScreen() {
  const [tab, setTab] = useState('Daily');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRanking(TAB_TO_WINDOW[tab] || 'daily').then((data) => {
      if (cancelled) return;
      setRows(Array.isArray(data) ? data : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tab]);

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
      {loading ? (
        <Text style={styles.empty}>লোড হচ্ছে…</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          {tab === 'All Time'
            ? 'এখনো কোনো হোস্টের আয় হয়নি — প্রথম কল বা গিফট হলেই এখানে র‍্যাংকিং দেখা যাবে।'
            : `এই ${tab === 'Daily' ? 'দিনে' : tab === 'Weekly' ? 'সপ্তাহে' : 'মাসে'} এখনো কোনো হোস্টের আয় হয়নি।`}
        </Text>
      ) : (
        <ScrollView>
          {rows.map((r, i) => (
            <View key={r.hostId} style={styles.row}>
              <Text style={styles.rank}>{r.rank}</Text>
              {r.avatarUrl ? (
                <Image source={{ uri: r.avatarUrl }} style={styles.avatarPhoto} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
                  <Text style={styles.avatarText}>{String(r.name || 'H').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.score}>{r.score.toLocaleString()} 💎</Text>
            </View>
          ))}
        </ScrollView>
      )}
      <Text style={styles.note}>Ranking updates from call + gift earnings. Admin sets ranking rewards.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', marginLeft: 12, width: 40 },
  avatarPhoto: { borderRadius: 20, height: 40, marginLeft: 12, width: 40 },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  bg: { backgroundColor: '#fff', flex: 1, padding: 16, paddingTop: 48 },
  empty: { color: COLORS.grey, fontSize: 14, lineHeight: 20, marginTop: 24, textAlign: 'center' },
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
