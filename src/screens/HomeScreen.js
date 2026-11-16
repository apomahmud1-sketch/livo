import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, getCallRate } from '../config';
import { HOSTS } from '../data';
import { useApp } from '../store';

const TABS = ['For You', 'Online', 'Popular', 'New'];

export default function HomeScreen({ navigation }) {
  const [tab, setTab] = useState('For You');
  const { coins } = useApp();

  const hosts = tab === 'Online' ? HOSTS.filter((h) => h.online) : HOSTS;

  const renderHost = ({ item }) => {
    const rate = getCallRate(item.rateTier);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('VideoCall', { host: item })}
      >
        <LinearGradient colors={[item.color, '#7c3aed']} style={styles.photo}>
          <Text style={styles.avatar}>{item.name[0]}</Text>
          <View style={[styles.onlineBadge, !item.online && styles.offlineBadge]}>
            <Text style={styles.onlineText}>{item.online ? '● Online' : '○ Offline'}</Text>
          </View>
          <View style={styles.chips}>
            <Text style={styles.chip}>{item.flag} {item.country}</Text>
            <Text style={styles.chip}>{item.lang}</Text>
            <Text style={[styles.chip, styles.lv]}>Lv{item.level}</Text>
          </View>
        </LinearGradient>
        <Text style={styles.name}>{item.name} 📞</Text>
        <Text style={styles.status} numberOfLines={1}>{item.status}</Text>
        <Text style={styles.rate}>🪙 {rate.coinsPerMinute} / min · {rate.name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#fdf4ff', '#f5f3ff', '#fce7f3']} style={styles.bg}>
      <View style={styles.header}>
        <Text style={styles.logo}>Livo</Text>
        <TouchableOpacity style={styles.coinPill} onPress={() => navigation.navigate('WalletTab')}>
          <Text style={styles.coinText}>🪙 {coins.toLocaleString()}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}>
            <Text style={[styles.tab, tab === t && styles.tabActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={hosts}
        keyExtractor={(h) => h.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={renderHost}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No hosts online right now.</Text>}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: { color: '#fff', fontSize: 64, fontWeight: 'bold' },
  bg: { flex: 1, paddingTop: 48 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 14, padding: 8, width: '48%' },
  chip: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 10, fontSize: 11, marginRight: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chips: { bottom: 8, flexDirection: 'row', left: 8, position: 'absolute' },
  coinPill: { backgroundColor: '#fff', borderRadius: 20, elevation: 2, paddingHorizontal: 14, paddingVertical: 8 },
  coinText: { fontWeight: 'bold' },
  empty: { color: COLORS.grey, marginTop: 40, textAlign: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  list: { padding: 12 },
  logo: { color: COLORS.purple, fontSize: 28, fontWeight: 'bold' },
  lv: { backgroundColor: '#fde68a' },
  name: { fontSize: 16, fontWeight: 'bold', marginTop: 6 },
  offlineBadge: { backgroundColor: 'rgba(0,0,0,0.5)' },
  onlineBadge: { backgroundColor: 'rgba(34,197,94,0.9)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8, top: 8 },
  onlineText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  photo: { alignItems: 'center', borderRadius: 10, height: 150, justifyContent: 'center' },
  rate: { color: COLORS.purple, fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  row: { justifyContent: 'space-between' },
  status: { color: COLORS.grey, fontSize: 12, marginTop: 2 },
  tab: { color: COLORS.grey, fontSize: 15, marginRight: 16, paddingBottom: 6 },
  tabActive: { borderBottomColor: COLORS.pink, borderBottomWidth: 2, color: COLORS.dark, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', marginTop: 14, paddingHorizontal: 16 },
});
