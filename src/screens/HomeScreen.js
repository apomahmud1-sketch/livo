// Livo HomeScreen — 2026-11-21 redesign, exactly like the user's
// reference screenshot: Stream / Follow header, wallet + Rank +
// Search icons, region chips, "Earn Up to 30% Commission" banner,
// portrait live cards (name + flag on photo, name + viewers below).
// Livo HomeScreen — v2 "single live" (2026-11-17, updated 14:48 SGT
// to match the preview the user corrected that afternoon)
// ONE-FILE CHANGE ONLY: replace src/screens/HomeScreen.js in GitHub
// (apomahmud1-sketch/livo) with this file, then rebuild in Expo.
// Nothing else changes: same imports, same HOSTS data, same
// navigation — tapping a live card still opens 'VideoCall' with
// that host. (2026-11-21: dice + coin pill removed from the header;
// Task 📋 + Search 🔍 icons at the top right instead, and the
// Country / Gender / Language filter chips are gone.)
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
// [F3] F3 — Nearby + filters (2026-11-19):
//  • New "Nearby" tab next to Popular / Online / New, plus a filter
//    bar (Country / Gender / Language). Filter options are derived
//    from the real host list; tapping an active chip clears that
//    filter; "✕ Clear filters" clears them all. Filters apply on
//    top of the tab on the SAME real allHosts list from the store —
//    there is no second list.
//  • Location permission is requested ONCE, the first time Nearby
//    is opened. Country-based proximity is the LIVE path today
//    (same-country hosts first, then the rest). Real-distance mode
//    is wired for when expo-location is ever installed later — it
//    must not activate or crash without the package (see
//    src/utils/nearby.js loadLocationModule). No location is ever
//    read without permission.
//  • A 📍 distance chip shows on cards only when location is
//    granted. The Nearby status line is honest about what happened:
//    permission off / not available on this build / no SGP hosts yet.
//  • Host coordinates are DEMO city coordinates, not live host GPS;
//    userCountry 'SGP' is a context value (store.js) that should
//    come from the real profile/backend later. [/F3]
import React, { useState } from 'react';
import { FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { useApp } from '../store';

// Demo live-viewer counts, by host id (see header note).
const VIEWERS = { 1: 1284, 2: 862, 3: 540, 4: 2310, 5: 0, 6: 1975 };

const formatViewers = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

// Portrait live card, like the reference: photo with a dark
// "❚❚ Live" pill, the host name + flag on the photo, and a white
// footer with the name + viewer count. Tapping the card opens the
// live room; the pink 📞 button starts an audio-only (voice) call.
const HostCard = React.memo(function HostCard({ host, viewers, navigation }) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('VideoCall', { host })}
    >
      <LinearGradient colors={[host.color, '#7c3aed']} style={styles.photo}>
        {host.photo ? (
          <Image source={host.photo} style={styles.photoImg} />
        ) : (
          <Text style={styles.avatar}>{host.name[0]}</Text>
        )}
        {host.online ? (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>❚❚ Live</Text>
          </View>
        ) : (
          <View style={[styles.liveBadge, styles.offlineBadge]}>
            <Text style={styles.liveText}>Offline</Text>
          </View>
        )}
        {host.online && (
          <TouchableOpacity
            style={styles.voiceBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('VideoCall', { host, audioOnly: true })}
          >
            <Text style={styles.voiceBtnText}>📞</Text>
          </TouchableOpacity>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.bottomShade}>
          <Text style={styles.name}>{host.name} {host.flag}</Text>
        </LinearGradient>
      </LinearGradient>
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterName}>{host.name}</Text>
        <Text style={styles.cardFooterViewers}>👁 {formatViewers(viewers)}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function HomeScreen({ navigation }) {
  const [feed, setFeed] = useState('stream'); // stream | follow
  const [region, setRegion] = useState(null); // null = All, else 'BGD' / 'IND' / 'PAK'
  const { coins, hosts: allHosts, following } = useApp();

  // [Search] Search bar — by host name or user ID.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const closeSearch = () => { setSearchText(''); setSearchOpen(false); };

  // Region chips, derived from the real host list (flag per country).
  const regionOptions = React.useMemo(() => {
    const seen = {};
    allHosts.forEach((h) => { if (!seen[h.country]) seen[h.country] = h.flag || ''; });
    const names = { BGD: 'Bangladesh', IND: 'India', PAK: 'Pakistan' };
    return [{ code: null, label: 'All', flag: '' }].concat(
      Object.keys(seen).map((c) => ({ code: c, label: names[c] || c, flag: seen[c] }))
    );
  }, [allHosts]);

  // Stream = all hosts (region filter on top, online first);
  // Follow = only the hosts the user follows (store.following holds
  // host ids). Searching filters by name or user ID instead.
  const hosts = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (q) {
      return allHosts.filter((h) =>
        h.name.toLowerCase().includes(q) || String(h.id).includes(q)
      );
    }
    let list = feed === 'follow'
      ? allHosts.filter((h) => following.includes(String(h.id)))
      : allHosts;
    if (region) list = list.filter((h) => h.country === region);
    return [...list].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
  }, [feed, region, allHosts, following, searchText]);

  const renderHost = React.useCallback(({ item }) => (
    <HostCard host={item} viewers={VIEWERS[item.id] || 0} navigation={navigation} />
  ), [navigation]);

  return (
    <LinearGradient colors={['#f0fdf4', '#ffffff']} style={styles.bg}>
      <View style={styles.header}>
        <View style={styles.feedTabs}>
          <TouchableOpacity onPress={() => setFeed('stream')} activeOpacity={0.8}>
            <Text style={[styles.feedTab, feed === 'stream' && styles.feedTabActive]}>Stream</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFeed('follow')} activeOpacity={0.8}>
            <Text style={[styles.feedTab, feed === 'follow' && styles.feedTabActive]}>Follow</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.coinPill} onPress={() => navigation.navigate('WalletTab')} activeOpacity={0.8}>
            <Text style={styles.coinText}>🪙 {coins.toLocaleString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Ranking')} activeOpacity={0.8}>
            <Text style={styles.iconBtnText}>🏆</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setSearchOpen(true)} activeOpacity={0.8}>
            <Text style={styles.iconBtnText}>🔍</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* [Search] Search bar — by host name or user ID. */}
      {searchOpen && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or user ID…"
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
            returnKeyType="search"
          />
          <TouchableOpacity onPress={closeSearch} activeOpacity={0.8}>
            <Text style={styles.searchClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Region chips — horizontal scroll, like the reference. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionList}>
        {regionOptions.map((r) => (
          <TouchableOpacity
            key={r.code || 'all'}
            style={[styles.regionChip, region === r.code && styles.regionChipActive]}
            onPress={() => setRegion(r.code)}
            activeOpacity={0.8}
          >
            <Text style={[styles.regionChipText, region === r.code && styles.regionChipTextActive]}>
              {r.flag ? `${r.flag} ` : ''}{r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Commission banner — become a host, earn up to 30%. */}
      <TouchableOpacity style={styles.commissionBanner} onPress={() => navigation.navigate('HostDashboard')} activeOpacity={0.85}>
        <LinearGradient colors={['#f97316', '#f59e0b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.commissionInner}>
          <View style={styles.commissionText}>
            <Text style={styles.commissionTitle}>Earn Up to 30% Commission</Text>
            <Text style={styles.commissionBtn}>Get Started  ›</Text>
          </View>
          <Text style={styles.commissionEmoji}>💰</Text>
        </LinearGradient>
      </TouchableOpacity>

      <FlatList
        data={hosts}
        keyExtractor={(h) => h.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={renderHost}
        contentContainerStyle={styles.list}
        removeClippedSubviews maxToRenderPerBatch={8} windowSize={8} initialNumToRender={8} updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          searchText.trim() ? (
            <Text style={styles.empty}>No host found for “{searchText.trim()}”.</Text>
          ) : feed === 'follow' ? (
            <Text style={styles.empty}>You're not following anyone yet.</Text>
          ) : (
            <Text style={styles.empty}>No hosts live right now.</Text>
          )
        }
      />

    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: { color: '#fff', fontSize: 56, fontWeight: 'bold' },
  bg: { flex: 1, paddingTop: 40 },
  bottomShade: { bottom: 0, justifyContent: 'flex-end', left: 0, padding: 8, position: 'absolute', right: 0 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', width: '48%' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
  cardFooterName: { fontSize: 14, fontWeight: 'bold' },
  cardFooterViewers: { color: COLORS.grey, fontSize: 12 },
  empty: { color: COLORS.grey, marginTop: 40, textAlign: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  list: { padding: 12 },
  liveBadge: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, left: 8, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 8 },
  liveText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 15, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  offlineBadge: { backgroundColor: 'rgba(0,0,0,0.55)' },
  photo: { alignItems: 'center', height: 220, justifyContent: 'center', overflow: 'hidden' },
  photoImg: { height: '100%', position: 'absolute', width: '100%' },
  row: { justifyContent: 'space-between' },
  // Header: Stream / Follow tabs + wallet, Rank and Search buttons.
  headerRight: { alignItems: 'center', flexDirection: 'row' },
  feedTabs: { alignItems: 'flex-end', flexDirection: 'row' },
  feedTab: { color: COLORS.grey, fontSize: 20, fontWeight: 'bold', marginRight: 14 },
  feedTabActive: { color: COLORS.dark, fontSize: 26 },
  coinPill: { backgroundColor: '#fef3c7', borderRadius: 18, elevation: 2, paddingHorizontal: 12, paddingVertical: 7 },
  coinText: { fontSize: 13, fontWeight: 'bold' },
  iconBtn: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, elevation: 2, height: 36, justifyContent: 'center', marginLeft: 8, width: 36 },
  iconBtnText: { fontSize: 18 },
  searchBar: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, elevation: 2, flexDirection: 'row', marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  searchClose: { color: COLORS.grey, fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  // Region chips + commission banner.
  regionList: { marginTop: 12, paddingHorizontal: 16 },
  regionChip: { backgroundColor: '#fff', borderColor: '#e5e7eb', borderRadius: 18, borderWidth: 1, marginRight: 8, paddingHorizontal: 14, paddingVertical: 7 },
  regionChipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  regionChipText: { color: COLORS.dark, fontSize: 13, fontWeight: 'bold' },
  regionChipTextActive: { color: '#fff' },
  commissionBanner: { borderRadius: 14, marginHorizontal: 16, marginTop: 12, overflow: 'hidden' },
  commissionInner: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  commissionText: { flex: 1 },
  commissionTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  commissionBtn: { alignSelf: 'flex-start', borderColor: '#fff', borderRadius: 16, borderWidth: 1.5, color: '#fff', fontSize: 13, fontWeight: 'bold', marginTop: 8, paddingHorizontal: 14, paddingVertical: 5 },
  commissionEmoji: { fontSize: 32, marginLeft: 10 },
  // [F2] Voice-call button on host cards (top-right, under the
  // viewers pill; online hosts only).
  voiceBtn: { alignItems: 'center', backgroundColor: 'rgba(236,72,153,0.95)', borderRadius: 20, height: 40, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 40 },
  voiceBtnText: { fontSize: 18 },
  // [/F2]
});
