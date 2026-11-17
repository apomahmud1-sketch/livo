// Livo HomeScreen — v2 "single live" (2026-11-17, updated 14:48 SGT
// to match the preview the user corrected that afternoon)
// ONE-FILE CHANGE ONLY: replace src/screens/HomeScreen.js in GitHub
// (apomahmud1-sketch/livo) with this file, then rebuild in Expo.
// Nothing else changes: same imports, same HOSTS data, same
// navigation — tapping a live card still opens 'VideoCall' with
// that host, and the coin pill still opens 'WalletTab'.
// What changed vs v1:
//  • No more call-list look: the 📞 after the name, the
//    "Online now — video call" line and the green Online badge are gone.
//  • Each host is now a LIVE tile like M Live's Popular page:
//    red LIVE badge top-left + viewer count top-right, name / Lv /
//    flag / language overlaid at the bottom of the photo,
//    equal-size 2-column cards, light golden background.
//  • 14:48 correction (user's screenshot mark-up): the bottom strip
//    under the photo is GONE — no name, no status line, no
//    "📹 Live · 🪙 120/min" strip on the card. The host name sits
//    ON the photo, bottom-left, directly above the chips.
//    The call rate is NOT lost: VideoCallScreen already shows it
//    ("Rate: … coins / min") and bills per minute from getCallRate,
//    so the rate is seen inside the live room, as the preview does.
//  • Offline hosts show a grey "Offline" badge (top-left, where
//    LIVE sits) and no LIVE badge, instead of looking like an
//    available call.
//  • Tabs are now Popular (default) / Online / New, like the
//    M Live Popular page. "New" just shows the newest demo hosts
//    first; there is no new backend field.
//  • Viewer counts are DEMO numbers in the VIEWERS map below
//    (same idea as the demo hosts in src/data.js). Replace them
//    with real live-viewer counts from Supabase later; the
//    layout does not depend on the exact numbers.
import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { HOSTS } from '../data';
import { useApp } from '../store';

// Demo live-viewer counts, by host id (see header note).
const VIEWERS = { 1: 1284, 2: 862, 3: 540, 4: 2310, 5: 0, 6: 1975 };

const formatViewers = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

const TABS = ['Popular', 'Online', 'New'];

export default function HomeScreen({ navigation }) {
  const [tab, setTab] = useState('Popular');
  const { coins } = useApp();

  const hosts =
    tab === 'Online'
      ? HOSTS.filter((h) => h.online)
      : tab === 'New'
        ? [...HOSTS].reverse()
        : HOSTS;

  const renderHost = ({ item }) => {
    const viewers = VIEWERS[item.id] || 0;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('VideoCall', { host: item })}
      >
        <LinearGradient colors={[item.color, '#7c3aed']} style={styles.photo}>
          <Text style={styles.avatar}>{item.name[0]}</Text>
          {item.online ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>● LIVE</Text>
            </View>
          ) : (
            <View style={[styles.liveBadge, styles.offlineBadge]}>
              <Text style={styles.liveText}>Offline</Text>
            </View>
          )}
          {item.online && (
            <View style={styles.viewers}>
              <Text style={styles.viewersText}>👁 {formatViewers(viewers)}</Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={styles.bottomShade}
          >
            <Text style={styles.name}>{item.name}</Text>
            <View style={styles.chips}>
              <Text style={[styles.chip, styles.lv]}>Lv{item.level}</Text>
              <Text style={styles.chip}>{item.flag} {item.country}</Text>
              <Text style={styles.chip}>{item.lang}</Text>
            </View>
          </LinearGradient>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#fffbeb', '#fef3c7', '#fff7ed']} style={styles.bg}>
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
        ListEmptyComponent={<Text style={styles.empty}>No hosts live right now.</Text>}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: { color: '#fff', fontSize: 64, fontWeight: 'bold' },
  bg: { flex: 1, paddingTop: 48 },
  bottomShade: { bottom: 0, justifyContent: 'flex-end', left: 0, padding: 8, position: 'absolute', right: 0 },
  card: { borderRadius: 14, marginBottom: 14, overflow: 'hidden', width: '48%' },
  chip: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 10, fontSize: 11, marginRight: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chips: { flexDirection: 'row', marginTop: 4 },
  coinPill: { backgroundColor: '#fff', borderRadius: 20, elevation: 2, paddingHorizontal: 14, paddingVertical: 8 },
  coinText: { fontWeight: 'bold' },
  empty: { color: COLORS.grey, marginTop: 40, textAlign: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  list: { padding: 12 },
  liveBadge: { backgroundColor: '#ef4444', borderRadius: 10, left: 8, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 8 },
  liveText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  logo: { color: COLORS.purple, fontSize: 28, fontWeight: 'bold' },
  lv: { backgroundColor: '#fde68a' },
  name: { color: '#fff', fontSize: 16, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  offlineBadge: { backgroundColor: 'rgba(0,0,0,0.55)' },
  photo: { alignItems: 'center', height: 190, justifyContent: 'center', overflow: 'hidden' },
  row: { justifyContent: 'space-between' },
  tab: { color: COLORS.grey, fontSize: 15, marginRight: 16, paddingBottom: 6 },
  tabActive: { borderBottomColor: COLORS.pink, borderBottomWidth: 2, color: COLORS.dark, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', marginTop: 14, paddingHorizontal: 16 },
  viewers: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8, top: 8 },
  viewersText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
});
