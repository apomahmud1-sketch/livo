// Livo HomeScreen — rebuilt 2026-11-21 to match the v0 preview
// (https://livo-puce.vercel.app) exactly: Stream / Follow header
// with green underline + gold coin pill + bare trophy/search icons,
// region chips, orange "Earn Up to 30% Commission" banner,
// "Live now" header, 2-column portrait live cards (Live pill with
// green bars, name + flag + chevron on the photo, name + viewers +
// location below, NO phone button), mint background #f0fdf4.
// Hosts are HIS data from src/data.js (Ruma, Nusrat, Arif, Sadia,
// Rakib offline, Priya) — v0's placeholder hosts are NOT used.
// Icons are lucide-react-native (the same icon set v0 uses).
// Behaviour kept: Stream = all hosts, Follow = followed hosts
// (store.following, default ['2']); region chips filter by country;
// Search filters by name/ID; trophy -> Ranking; banner -> HostDashboard;
// card tap -> VideoCall with that host.
import React, { useRef, useState } from 'react';
import { FlatList, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChartColumn, ChevronDown, ChevronRight, Coins, Eye, Globe, Search, Trophy } from 'lucide-react-native';
import { COLORS } from '../config';
import { useApp } from '../store';

// Demo live-viewer counts, by host id. Replace with real live-viewer
// counts from Supabase later; the layout does not depend on them.
const VIEWERS = { 1: 1284, 2: 862, 3: 540, 4: 2310, 5: 0, 6: 1975 };

const COUNTRY_NAMES = { BGD: 'Bangladesh', IND: 'India', PAK: 'Pakistan' };
// Flag images from flagcdn (w40), shown 13x9 on the photo.
const FLAG_URL = {
  BGD: 'https://flagcdn.com/w40/bd.png',
  IND: 'https://flagcdn.com/w40/in.png',
  PAK: 'https://flagcdn.com/w40/pk.png',
};

const formatViewers = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);
const formatTotal = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);

// Portrait live card, like the v0 preview: photo with a dark
// "Live" pill (3 green bars), host name + flag + chevron circle on
// the photo, name + eye viewers + location below. Tapping the card
// opens the live room. NO phone/call button on cards.
const HostCard = React.memo(function HostCard({ host, viewers, navigation }) {
  const flagUri = FLAG_URL[host.country];
  return (
    <TouchableOpacity
      style={[styles.card, !host.online && styles.cardOffline]}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('VideoCall', { host })}
    >
      <View style={styles.photo}>
        {host.photo ? (
          <Image source={host.photo} style={styles.photoImg} resizeMode="cover" />
        ) : (
          <Text style={styles.avatar}>{host.name[0]}</Text>
        )}
        {host.online ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveBars}>
              <View style={[styles.liveBar, { height: 5 }]} />
              <View style={[styles.liveBar, { height: 9 }]} />
              <View style={[styles.liveBar, { height: 7 }]} />
            </View>
            <Text style={styles.liveText}>Live</Text>
          </View>
        ) : null}
        <View style={styles.nameRow}>
          <View style={styles.nameLeft}>
            <Text style={styles.name} numberOfLines={1}>{host.name}</Text>
            {flagUri ? <Image source={{ uri: flagUri }} style={styles.flag} /> : null}
          </View>
          <View style={styles.chevronCircle}>
            <ChevronRight size={15} color="#fff" strokeWidth={2.5} />
          </View>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterName} numberOfLines={1}>{host.name}</Text>
        <View style={styles.viewers}>
          <Eye size={13} color="#818b84" strokeWidth={2} />
          <Text style={styles.viewersText}>{formatViewers(viewers)}</Text>
        </View>
      </View>
      <Text style={styles.location}>{COUNTRY_NAMES[host.country] || host.country}</Text>
    </TouchableOpacity>
  );
});

export default function HomeScreen({ navigation }) {
  const [feed, setFeed] = useState('stream'); // stream | follow
  const [region, setRegion] = useState(null); // null = All, else 'BGD' / 'IND' / 'PAK'
  const { coins, hosts: allHosts, following } = useApp();

  // [Search] Search bar — by host name or user ID.
  const regionScrollRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const closeSearch = () => { setSearchText(''); setSearchOpen(false); };
  const searching = searchText.trim().length > 0;

  // Region chips, derived from the real host list.
  const regionOptions = React.useMemo(() => {
    const seen = {};
    allHosts.forEach((h) => { if (!seen[h.country]) seen[h.country] = true; });
    return [{ code: null, label: 'All' }].concat(
      Object.keys(seen).map((c) => ({ code: c, label: COUNTRY_NAMES[c] || c }))
    );
  }, [allHosts]);

  // Total viewers of ONLINE hosts, for the "Live now" pill.
  const totalLiveViewers = React.useMemo(() => {
    const total = allHosts.reduce((s, h) => s + (h.online ? (VIEWERS[h.id] || 0) : 0), 0);
    return formatTotal(total);
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

  // Commission banner + "Live now" header scroll with the list
  // (hidden while searching, like the v0 phone screen).
  const listHeader = searching ? null : (
    <View>
      <TouchableOpacity style={styles.commissionBanner} onPress={() => navigation.navigate('HostDashboard')} activeOpacity={0.9}>
        <LinearGradient
          colors={['#ff9b3f', '#ff743a', '#f7543d']}
          locations={[0, 0.52, 1]}
          start={{ x: 0.04, y: 0.31 }}
          end={{ x: 0.96, y: 0.69 }}
          style={styles.commissionInner}
        >
          <View style={styles.commissionText}>
            <Text style={styles.commissionEyebrow}>CREATOR REWARDS</Text>
            <Text style={styles.commissionTitle}>{'Earn Up to\n30% Commission'}</Text>
            <View style={styles.commissionBtn}>
              <Text style={styles.commissionBtnText}>Get Started</Text>
              <ChevronRight size={13} color="#d85d2e" strokeWidth={2.5} />
            </View>
          </View>
          <View style={styles.commissionArt}>
            <View style={[styles.chartBox, { transform: [{ rotate: '-7deg' }] }]}>
              <ChartColumn size={37} color="#fff0b2" strokeWidth={2} />
            </View>
            <View style={styles.coinBackWrap}>
              <Coins size={33} color="#f3c044" strokeWidth={2} />
            </View>
            <View style={styles.coinFrontWrap}>
              <Coins size={39} color="#f3c044" strokeWidth={2} />
            </View>
            <LinearGradient
              colors={['#ffe58c', '#efaa27']}
              style={[styles.commissionBadge, { transform: [{ rotate: '9deg' }] }]}
            >
              <Text style={styles.commissionBadgeText}>30%</Text>
            </LinearGradient>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.liveNowRow}>
        <View style={styles.liveNowLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.liveNowText}>Live now</Text>
          <View style={styles.totalPill}>
            <Text style={styles.totalPillText}>{totalLiveViewers}</Text>
          </View>
        </View>
        <Text style={styles.seeAll}>See all ›</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.bg}>
      <View style={styles.header}>
        <View style={styles.feedTabs}>
          <TouchableOpacity style={styles.tab} onPress={() => setFeed('stream')} activeOpacity={0.8}>
            <Text style={[styles.feedTab, feed === 'stream' && styles.feedTabActive]}>Stream</Text>
            {feed === 'stream' ? <View style={styles.tabUnderline} /> : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => setFeed('follow')} activeOpacity={0.8}>
            <Text style={[styles.feedTab, feed === 'follow' && styles.feedTabActive]}>Follow</Text>
            {feed === 'follow' ? <View style={styles.tabUnderline} /> : null}
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('WalletTab')} activeOpacity={0.8}>
            <LinearGradient colors={['#fff8de', '#ffefb8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.coinPill}>
              <Coins size={13} color="#c89312" strokeWidth={2.2} />
              <Text style={styles.coinText}>{coins.toLocaleString()}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => navigation.navigate('Ranking')} activeOpacity={0.8}>
            <Trophy size={21} color="#111713" strokeWidth={2.2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => setSearchOpen(true)} activeOpacity={0.8}>
            <Search size={22} color="#111713" strokeWidth={2.2} />
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

      {/* Region chips — horizontal scroll, like the v0 preview. */}
      <ScrollView ref={regionScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionList}>
        {regionOptions.map((r) => (
          <TouchableOpacity
            key={r.code || 'all'}
            style={[styles.regionChip, region === r.code && styles.regionChipActive]}
            onPress={() => setRegion(r.code)}
            activeOpacity={0.8}
          >
            <Globe size={12} color={region === r.code ? '#23a34e' : '#59615b'} strokeWidth={2} />
            <Text style={[styles.regionChipText, region === r.code && styles.regionChipTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.regionMore} onPress={() => regionScrollRef.current?.scrollToEnd({ animated: true })} activeOpacity={0.8}>
          <ChevronDown size={15} color="#59615b" strokeWidth={2} />
        </TouchableOpacity>
      </ScrollView>

      <FlatList
        data={hosts}
        keyExtractor={(h) => h.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={renderHost}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
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

    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { color: '#fff', fontSize: 56, fontWeight: '700' },
  bg: { backgroundColor: '#f0fdf4', flex: 1, paddingTop: 40 },
  card: { flex: 1, marginBottom: 17 },
  cardOffline: { opacity: 0.6 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 1, paddingTop: 7 },
  cardFooterName: { color: '#273029', flex: 1, fontSize: 11, fontWeight: '700', marginRight: 6 },
  viewers: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  viewersText: { color: '#818b84', fontSize: 9, fontWeight: '500' },
  location: { color: '#a0aaa2', fontSize: 9, paddingHorizontal: 1, paddingTop: 2 },
  empty: { color: COLORS.grey, marginTop: 40, textAlign: 'center' },
  list: { paddingBottom: 24, paddingHorizontal: 16 },
  row: { gap: 12 },
  // Header: 53px, Stream / Follow tabs + coin pill, trophy, search.
  header: { alignItems: 'center', flexDirection: 'row', height: 53, justifyContent: 'space-between', paddingLeft: 21, paddingRight: 19 },
  feedTabs: { alignItems: 'center', flexDirection: 'row', gap: 18 },
  tab: { height: 53, justifyContent: 'center', position: 'relative' },
  feedTab: { color: '#959b97', fontSize: 18, fontWeight: '600' },
  feedTabActive: { color: '#111713', fontWeight: '800' },
  tabUnderline: { backgroundColor: '#72d679', borderRadius: 2, bottom: 5, height: 3, left: 2, position: 'absolute', right: 2 },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  coinPill: { alignItems: 'center', borderColor: '#f2d47d', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, height: 27, minWidth: 49, paddingLeft: 5, paddingRight: 8 },
  coinText: { color: '#3d3320', fontSize: 12, fontWeight: '700' },
  headerIcon: { alignItems: 'center', justifyContent: 'center' },
  searchBar: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, elevation: 2, flexDirection: 'row', marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  searchClose: { color: COLORS.grey, fontSize: 18, fontWeight: '700', marginLeft: 8 },
  // Region chips.
  regionList: { alignItems: 'center', paddingBottom: 13, paddingHorizontal: 9, paddingTop: 8 },
  regionChip: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.74)', borderColor: '#e9eeea', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 4, height: 31, marginRight: 8, paddingHorizontal: 7 },
  regionChipActive: { backgroundColor: '#dcfce7', borderColor: '#dcfce7' },
  regionChipText: { color: '#59615b', fontSize: 10, fontWeight: '600' },
  regionChipTextActive: { color: '#16803b' },
  regionMore: { alignItems: 'center', justifyContent: 'center', padding: 6 },
  // Commission banner.
  commissionBanner: { borderRadius: 19, elevation: 4, marginBottom: 20, marginTop: 1, shadowColor: '#ec6330', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.17, shadowRadius: 18 },
  commissionInner: { borderRadius: 19, flexDirection: 'row', height: 140, overflow: 'hidden' },
  commissionText: { flex: 1, justifyContent: 'center', paddingLeft: 17, paddingRight: 150 },
  commissionEyebrow: { color: '#fff2d8', fontSize: 8, fontWeight: '800', letterSpacing: 1.1, marginBottom: 6 },
  commissionTitle: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: -0.58, lineHeight: 21.5 },
  commissionBtn: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#fff8e8', borderRadius: 999, flexDirection: 'row', height: 25, marginTop: 11, paddingHorizontal: 10 },
  commissionBtnText: { color: '#d85d2e', fontSize: 10, fontWeight: '700' },
  commissionArt: { bottom: 0, position: 'absolute', right: 0, top: 0, width: 150 },
  chartBox: { alignItems: 'center', backgroundColor: '#ffedb31f', borderColor: 'rgba(255,243,204,0.34)', borderRadius: 14, borderWidth: 1, height: 55, justifyContent: 'center', position: 'absolute', right: 52, top: 42, width: 62 },
  coinBackWrap: { bottom: 34, left: 16, position: 'absolute' },
  coinFrontWrap: { bottom: 12, left: 2, position: 'absolute' },
  commissionBadge: { alignItems: 'center', borderColor: 'rgba(255,251,230,0.84)', borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', position: 'absolute', right: 14, top: 19, width: 44 },
  commissionBadgeText: { color: '#a95819', fontSize: 12, fontWeight: '800' },
  // "Live now" section header.
  liveNowRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  liveNowLeft: { alignItems: 'center', flexDirection: 'row' },
  liveDot: { backgroundColor: '#31bc63', borderRadius: 4, elevation: 2, height: 7, marginRight: 6, shadowColor: '#31bc63', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4, width: 7 },
  liveNowText: { color: '#1a211c', fontSize: 15, fontWeight: '800', marginRight: 6 },
  totalPill: { backgroundColor: '#e4f7e8', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3 },
  totalPillText: { color: '#3d9152', fontSize: 9, fontWeight: '700' },
  seeAll: { color: '#7b857e', fontSize: 10, fontWeight: '600' },
  // Host card photo + overlays.
  photo: { alignItems: 'center', backgroundColor: '#dfe9df', borderRadius: 15, height: 215, justifyContent: 'center', overflow: 'hidden' },
  photoImg: { height: '100%', position: 'absolute', width: '100%' },
  liveBadge: { alignItems: 'center', backgroundColor: 'rgba(22,28,24,0.76)', borderColor: 'rgba(255,255,255,0.10)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', height: 21, left: 8, paddingHorizontal: 8, position: 'absolute', top: 9 },
  liveBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 1, marginRight: 4 },
  liveBar: { backgroundColor: '#62e17d', borderRadius: 1, width: 2 },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  nameRow: { alignItems: 'center', bottom: 10, flexDirection: 'row', justifyContent: 'space-between', left: 10, position: 'absolute', right: 8 },
  nameLeft: { alignItems: 'center', flex: 1, flexDirection: 'row', marginRight: 6 },
  name: { color: '#fff', flexShrink: 1, fontSize: 12, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  flag: { borderColor: 'rgba(255,255,255,0.75)', borderRadius: 2, borderWidth: 0.5, height: 9, marginLeft: 4, width: 13 },
  chevronCircle: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.56)', borderRadius: 11, borderWidth: 1, flexShrink: 0, height: 21, justifyContent: 'center', width: 21 },
});
