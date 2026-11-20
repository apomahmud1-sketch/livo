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
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { useApp } from '../store';
// [F3] Nearby helpers: guarded expo-location loader, haversine
// distance, formatting, and the nearest / same-country sort. [/F3]
import { distanceToHostKm, formatDistance, loadLocationModule, sortNearbyHosts } from '../utils/nearby';
// [F6] AI Smart Match — card modal + host picker (real store hosts only).
import SmartMatchCard from '../components/SmartMatchCard';
import { getUserPreferences, pickSmartMatch } from '../utils/smartMatch';
// [/F6]

// Demo live-viewer counts, by host id (see header note).
const VIEWERS = { 1: 1284, 2: 862, 3: 540, 4: 2310, 5: 0, 6: 1975 };

const formatViewers = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

const TABS = ['Popular', 'Online', 'New', 'Nearby']; // [F3] 'Nearby' added [/F3]

// [F3] Gender chip labels (host.gender is 'female' / 'male'). [/F3]
const GENDER_LABELS = { female: 'Female', male: 'Male' };

// Host card, memoized: it only re-renders when its own host, viewer
// count, distance or navigation changes — scrolling and tab switches
// no longer redraw every visible card.
const HostCard = React.memo(function HostCard({ host, viewers, distanceLabel, navigation }) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('VideoCall', { host })}
    >
      <LinearGradient colors={[host.color, '#7c3aed']} style={styles.photo}>
        <Text style={styles.avatar}>{host.name[0]}</Text>
        {host.online ? (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>● LIVE</Text>
          </View>
        ) : (
          <View style={[styles.liveBadge, styles.offlineBadge]}>
            <Text style={styles.liveText}>Offline</Text>
          </View>
        )}
        {host.online && (
          <View style={styles.viewers}>
            <Text style={styles.viewersText}>👁 {formatViewers(viewers)}</Text>
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
          <Text style={styles.name}>{host.name}</Text>
          <View style={styles.chips}>
            <Text style={[styles.chip, styles.lv]}>Lv{host.level}</Text>
            <Text style={styles.chip}>{host.flag} {host.country}</Text>
            <Text style={styles.chip}>{host.lang}</Text>
            {distanceLabel ? <Text style={styles.chip}>📍 {distanceLabel}</Text> : null}
          </View>
        </LinearGradient>
      </LinearGradient>
    </TouchableOpacity>
  );
});

export default function HomeScreen({ navigation }) {
  const [tab, setTab] = useState('Popular');
  const { coins, hosts: allHosts, userCountry, showToast } = useApp(); // [F3] userCountry from the store [/F3]

  // [F3] Filters — one value per group, null = no filter. Options are
  // derived from the real host list below, so they always match the
  // hosts that actually exist. Filters apply on top of the tab, on
  // the SAME allHosts list — no second list. [/F3]
  const [filters, setFilters] = useState({ country: null, gender: null, lang: null });
  const hasActiveFilters = Boolean(filters.country || filters.gender || filters.lang);
  // [F3] Tap an active chip to clear just that filter; tap another
  // option to switch to it. [/F3]
  const toggleFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));
  };
  const clearFilters = () => setFilters({ country: null, gender: null, lang: null });
  // [F3] Filter options, derived from the real host list. [/F3]
  const countryOptions = React.useMemo(() => [...new Set(allHosts.map((h) => h.country))], [allHosts]);
  const genderOptions = React.useMemo(() => [...new Set(allHosts.map((h) => h.gender).filter(Boolean))], [allHosts]);
  const langOptions = React.useMemo(() => [...new Set(allHosts.map((h) => h.lang))], [allHosts]);

  // [F3] Location state for the Nearby tab. 'idle' = never asked yet;
  // 'requesting' = permission prompt in flight; 'granted' = permission
  // given and coordinates read; 'denied' = permission refused;
  // 'unavailable' = expo-location is not installed in this build
  // (the normal case today) or the position read failed. No location
  // is ever read without permission. [/F3]
  const [userCoords, setUserCoords] = useState(null);
  const [locStatus, setLocStatus] = useState('idle');
  const locationRequestedRef = useRef(false); // [F3] permission is requested only once [/F3]

  // [F6] AI Smart Match — picks from the live store host list
  // (allHosts), so Host Dashboard online/rate changes apply.
  const [matchVisible, setMatchVisible] = useState(false);
  const [matchedHost, setMatchedHost] = useState(null);
  const runSmartMatch = () => {
    setMatchedHost(pickSmartMatch(allHosts, getUserPreferences()));
    setMatchVisible(true);
  };
  const callMatchedHost = () => {
    if (!matchedHost) return;
    setMatchVisible(false);
    // Same as tapping a Home card: normal incoming screen + billing.
    navigation.navigate('VideoCall', { host: matchedHost });
  };
  const findAnotherMatch = () => {
    const next = pickSmartMatch(allHosts, getUserPreferences(), matchedHost ? [matchedHost.id] : []);
    // Null when no other host is online — keep showing the current match.
    if (next) setMatchedHost(next);
  };
  // [/F6]

  // [Vero] Random Match — pick a random ONLINE host and open their
  // call at once. If nobody is online, say so instead of opening
  // an offline host.
  const randomMatch = () => {
    const online = allHosts.filter((h) => h.online);
    if (!online.length) {
      showToast('No hosts online right now — try again soon.');
      return;
    }
    const pick = online[Math.floor(Math.random() * online.length)];
    navigation.navigate('VideoCall', { host: pick });
  };

  // [Vero] Story row item — tap a story to call that host.
  const renderStory = ({ item }) => (
    <TouchableOpacity style={styles.story} activeOpacity={0.8} onPress={() => navigation.navigate('VideoCall', { host: item })}>
      <View style={[styles.storyRing, item.online ? styles.storyRingLive : styles.storyRingOff]}>
        <View style={[styles.storyAvatarBg, { backgroundColor: item.color }]}>
          <Text style={styles.storyAvatar}>{item.name[0]}</Text>
        </View>
      </View>
      <Text style={styles.storyName} numberOfLines={1}>{item.name}</Text>
    </TouchableOpacity>
  );
  // [/Vero]

  // [F3] Ask for location ONCE, the first time the Nearby tab opens.
  // If expo-location is not installed, loadLocationModule() returns
  // null and we fall back to country-based proximity — no crash, no
  // permission prompt, no location read. [/F3]
  useEffect(() => {
    if (tab !== 'Nearby' || locationRequestedRef.current) return;
    locationRequestedRef.current = true;
    (async () => {
      const Location = loadLocationModule();
      if (!Location) {
        setLocStatus('unavailable'); // [F3] expo-location not installed in this build [/F3]
        return;
      }
      try {
        setLocStatus('requesting');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocStatus('denied');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({}); // [F3] only after permission is granted [/F3]
        setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocStatus('granted');
      } catch (e) {
        setLocStatus('unavailable');
      }
    })();
  }, [tab]);

  // [F3] Tab ordering first, then the filters on top of it — all on
  // the same allHosts list from the store. Nearby sorts with
  // sortNearbyHosts: nearest-first when coordinates exist, otherwise
  // same-country-first (stable order). [/F3]
  const hosts = React.useMemo(() => {
    const tabHosts =
      tab === 'Online'
        ? allHosts.filter((h) => h.online)
        : tab === 'New'
          ? [...allHosts].reverse()
          : tab === 'Nearby'
            ? sortNearbyHosts(allHosts, { userCoords, userCountry })
            : allHosts;
    return tabHosts.filter((h) => // [F3] filters apply on top of the tab [/F3]
      (!filters.country || h.country === filters.country) &&
      (!filters.gender || h.gender === filters.gender) &&
      (!filters.lang || h.lang === filters.lang)
    );
  }, [tab, allHosts, filters, userCoords, userCountry]);

  // [F3] Honest Nearby status line. Demo data has no SGP host, so
  // when there is no same-country host the fallback leaves the order
  // unchanged and the line says so instead of pretending otherwise. [/F3]
  const hasSameCountryHost = allHosts.some((h) => h.country === userCountry);
  let nearbyStatus = '';
  if (tab === 'Nearby') {
    if (userCoords) {
      nearbyStatus = '📍 Sorted by distance from you.';
    } else if (!hasSameCountryHost) {
      const prefix =
        locStatus === 'denied' ? 'Location permission off — ' :
        locStatus === 'unavailable' ? 'Location not available on this build — ' : '';
      nearbyStatus = `${prefix}No hosts from ${userCountry} yet — showing all hosts`;
    } else if (locStatus === 'denied') {
      nearbyStatus = 'Location permission off — showing hosts from your country first.';
    } else if (locStatus === 'unavailable') {
      nearbyStatus = 'Location not available on this build — showing hosts from your country first.';
    } else {
      nearbyStatus = 'Showing hosts from your country first.';
    }
  }

  const renderHost = React.useCallback(({ item }) => {
    const viewers = VIEWERS[item.id] || 0;
    const distanceKm = userCoords ? distanceToHostKm(userCoords, item) : null;
    const distanceLabel = distanceKm !== null ? formatDistance(distanceKm) : '';
    return <HostCard host={item} viewers={viewers} distanceLabel={distanceLabel} navigation={navigation} />;
  }, [navigation, userCoords]);

  // [F3] One filter row: label + option chips. Tapping the active
  // chip clears that filter. [/F3]
  const renderFilterRow = (label, options, filterKey, formatOption) => (
    <View style={styles.filterRow} key={label}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
        {options.map((opt) => {
          const active = filters[filterKey] === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => toggleFilter(filterKey, opt)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {formatOption ? formatOption(opt) : opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <LinearGradient colors={['#f0fdf4', '#ffffff']} style={styles.bg}>
      <View style={styles.header}>
        <Text style={styles.logo}>Livo</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.randomBtn} onPress={randomMatch} activeOpacity={0.8}>
            <Text style={styles.randomBtnText}>🎲</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.coinPill} onPress={() => navigation.navigate('WalletTab')}>
            <Text style={styles.coinText}>🪙 {coins.toLocaleString()}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.trendingSub}>Discover who's trending</Text>

      {/* [Vero] Story row — tap a story to call that host. */}
      <FlatList
        data={allHosts}
        keyExtractor={(h) => h.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        renderItem={renderStory}
        contentContainerStyle={styles.storiesList}
        removeClippedSubviews
      />

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}>
            <Text style={[styles.tab, tab === t && styles.tabActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* [F3] Filter bar: Country / Gender / Language chips, options
          derived from the real host list. "✕ Clear filters" shows
          only while a filter is active. [/F3] */}
      <View style={styles.filterBar}>
        {renderFilterRow('Country', countryOptions, 'country')}
        {renderFilterRow('Gender', genderOptions, 'gender', (g) => GENDER_LABELS[g] || g)}
        {renderFilterRow('Language', langOptions, 'lang')}
        {hasActiveFilters && (
          <TouchableOpacity style={styles.clearFilters} onPress={clearFilters}>
            <Text style={styles.clearFiltersText}>✕ Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* [F3] Honest Nearby status line — only on the Nearby tab. [/F3] */}
      {tab === 'Nearby' && nearbyStatus ? (
        <Text style={styles.nearbyStatus}>{nearbyStatus}</Text>
      ) : null}
      {/* [F1] Lucky Spin + Daily Reward entry — opens the Rewards screen. */}
      <TouchableOpacity
        style={styles.rewardsBanner}
        onPress={() => navigation.navigate('Rewards')}
        activeOpacity={0.85}
      >
        <Text style={styles.rewardsBannerText}>🎡 Lucky Spin • Daily Reward</Text>
        <Text style={styles.rewardsBannerSub}>1 free spin today — win coins!</Text>
      </TouchableOpacity>
      {/* [/F1] */}
      {/* [F6] AI Smart Match button — under the tabs. */}
      <TouchableOpacity style={styles.smartMatchBtn} onPress={runSmartMatch} activeOpacity={0.85}>
        <Text style={styles.smartMatchText}>✨ Smart Match — find someone to talk to</Text>
      </TouchableOpacity>
      {/* [/F6] */}

      <FlatList
        data={hosts}
        keyExtractor={(h) => h.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={renderHost}
        contentContainerStyle={styles.list}
        removeClippedSubviews maxToRenderPerBatch={8} windowSize={8} initialNumToRender={8} updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          // [F3] Filter-aware empty state: when filters are active, say
          // so and offer to clear them. [/F3]
          hasActiveFilters ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>No hosts match these filters.</Text>
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.emptyClear}>Clear filters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.empty}>No hosts live right now.</Text>
          )
        }
      />

      {/* [F6] AI Smart Match result modal. */}
      <SmartMatchCard
        visible={matchVisible}
        host={matchedHost}
        onCall={callMatchedHost}
        onFindAnother={findAnotherMatch}
        onClose={() => setMatchVisible(false)}
        onTryAgain={runSmartMatch}
      />
      {/* [/F6] */}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: { color: '#fff', fontSize: 56, fontWeight: 'bold' },
  bg: { flex: 1, paddingTop: 40 },
  bottomShade: { bottom: 0, justifyContent: 'flex-end', left: 0, padding: 8, position: 'absolute', right: 0 },
  card: { borderRadius: 14, marginBottom: 12, overflow: 'hidden', width: '48%' },
  chip: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 10, fontSize: 11, marginRight: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chips: { flexDirection: 'row', marginTop: 4 },
  coinPill: { backgroundColor: '#fff', borderRadius: 20, elevation: 2, paddingHorizontal: 14, paddingVertical: 8 },
  coinText: { fontWeight: 'bold' },
  empty: { color: COLORS.grey, marginTop: 40, textAlign: 'center' },
  // [F3] Filter-aware empty state: "Clear filters" link under the message. [/F3]
  emptyWrap: { alignItems: 'center' },
  emptyClear: { color: COLORS.pink, fontWeight: 'bold', marginTop: 8, textAlign: 'center' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  list: { padding: 12 },
  liveBadge: { backgroundColor: '#ef4444', borderRadius: 10, left: 8, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 8 },
  liveText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  logo: { color: COLORS.purple, fontSize: 26, fontWeight: 'bold' },
  lv: { backgroundColor: '#fde68a' },
  name: { color: '#fff', fontSize: 15, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  offlineBadge: { backgroundColor: 'rgba(0,0,0,0.55)' },
  photo: { alignItems: 'center', height: 170, justifyContent: 'center', overflow: 'hidden' },
  row: { justifyContent: 'space-between' },
  // [F1] Rewards banner styles.
  rewardsBanner: { backgroundColor: COLORS.purple, borderRadius: 12, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rewardsBannerSub: { color: '#e9d5ff', fontSize: 12, marginTop: 2 },
  rewardsBannerText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  // [/F1]
  tab: { color: COLORS.grey, fontSize: 14, marginRight: 16, paddingBottom: 6 },
  tabActive: { borderBottomColor: COLORS.pink, borderBottomWidth: 2, color: COLORS.dark, fontWeight: 'bold' },
  // [Vero] Stories + Random Match styles.
  headerRight: { alignItems: 'center', flexDirection: 'row' },
  randomBtn: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 18, height: 36, justifyContent: 'center', marginRight: 8, width: 36 },
  randomBtnText: { fontSize: 18 },
  trendingSub: { color: COLORS.grey, fontSize: 13, marginTop: 4, paddingHorizontal: 16 },
  storiesList: { marginTop: 12, paddingHorizontal: 16 },
  story: { alignItems: 'center', marginRight: 12, width: 64 },
  storyRing: { alignItems: 'center', borderRadius: 32, borderWidth: 2.5, height: 64, justifyContent: 'center', width: 64 },
  storyRingLive: { borderColor: COLORS.green },
  storyRingOff: { borderColor: COLORS.lightGrey },
  storyAvatarBg: { alignItems: 'center', borderRadius: 27, height: 54, justifyContent: 'center', width: 54 },
  storyAvatar: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  storyName: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  // [/Vero]
  tabs: { flexDirection: 'row', marginTop: 14, paddingHorizontal: 16 },
  viewers: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8, top: 8 },
  viewersText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  // [F3] Filter bar styles. [/F3]
  filterBar: { marginTop: 10, paddingHorizontal: 16 },
  filterRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 6 },
  filterLabel: { color: COLORS.grey, fontSize: 12, fontWeight: 'bold', width: 64 },
  filterChips: { flex: 1 },
  filterChip: { backgroundColor: '#fff', borderColor: COLORS.grey, borderRadius: 14, borderWidth: 1, marginRight: 6, paddingHorizontal: 10, paddingVertical: 4 },
  filterChipActive: { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  filterChipText: { color: COLORS.dark, fontSize: 12 },
  filterChipTextActive: { color: '#fff', fontWeight: 'bold' },
  clearFilters: { alignSelf: 'flex-start', marginTop: 2 },
  clearFiltersText: { color: COLORS.pink, fontSize: 12, fontWeight: 'bold' },
  // [F3] Nearby status line under the filter bar. [/F3]
  nearbyStatus: { color: COLORS.grey, fontSize: 12, marginTop: 2, paddingHorizontal: 16 },
  // [F2] Voice-call button on host cards (top-right, under the
  // viewers pill; online hosts only).
  voiceBtn: { alignItems: 'center', backgroundColor: 'rgba(236,72,153,0.95)', borderRadius: 20, height: 40, justifyContent: 'center', position: 'absolute', right: 8, top: 40, width: 40 },
  voiceBtnText: { fontSize: 18 },
  // [/F2]
  // [F6] AI Smart Match button (purple, under the tabs).
  smartMatchBtn: { alignItems: 'center', backgroundColor: COLORS.purple, borderRadius: 24, marginHorizontal: 16, marginTop: 12, paddingVertical: 12 },
  smartMatchText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  // [/F6]
});
