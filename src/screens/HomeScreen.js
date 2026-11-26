// Livo HomeScreen — new purple-gold UI (2026-11-25), built from the
// approved preview (livo-new-ui-preview): crown + Livo wordmark top
// bar with the real coin balance, "1v1 Video Call / Find your best
// match!" hero, Start Match + Quick Match / Video Call / Friend Call
// tiles, and a "Live Hosts" grid. NO Hot Live Rooms section — Home
// shows only hosts who are really live on video (is_online + fresh
// heartbeat, same live-only rule as before). Card tap opens the
// host's public Live Room (not a direct call). Offline hosts are
// hidden entirely; when nobody is live the honest "No hosts live
// right now." empty state shows. Viewer counts come from Realtime
// presence — null (unknown) shows nothing, never an invented number.
import React, { useEffect, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Bell, Crown, Eye, Users, Video, Zap } from 'lucide-react-native';
import { formatViewers } from '../config';
import { resolveAppPage, shadeColor, useAppConfig } from '../appConfig';
import { useApp } from '../store';
import { subscribeRoomViewers } from '../supabase/presence';
import { CoinIcon } from '../components/GiftSheet';

// Live host card, like the preview: full-bleed photo, LIVE badge
// top-left, gold rate pill top-right, name + pink ♀ + country code
// + real viewer count at the bottom. Tapping opens the Live Room.
const HostCard = React.memo(function HostCard({ host, viewers, rate, navigation, styles }) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('LiveRoom', { host })}
    >
      <View style={styles.photo}>
        {host.photo ? (
          <Image source={host.photo} style={styles.photoImg} resizeMode="cover" />
        ) : (
          <Text style={styles.avatar}>{host.name ? host.name[0] : '?'}</Text>
        )}
        <LinearGradient
          colors={['rgba(10,0,20,0.28)', 'rgba(10,0,20,0)', 'rgba(10,0,20,0.82)']}
          locations={[0, 0.45, 1]}
          style={styles.photoShade}
        />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.ratePill}>
          <CoinIcon size={13} fontSize={8} />
          <Text style={styles.rateText}>{rate}/min</Text>
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{host.name}</Text>
            <Text style={styles.female}>♀</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.flagChip}>{host.country}</Text>
            {/* Live viewer count only: null (unknown) shows nothing —
                never an invented number. */}
            {viewers == null ? null : (
              <View style={styles.viewers}>
                <Eye size={13} color="#e7dcff" strokeWidth={2} />
                <Text style={styles.viewersText}>{formatViewers(viewers)} watching</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function HomeScreen({ navigation }) {
  const { coins, hosts: allHosts, liveHostsLoaded, unreadTotal, getLiveCallRate, showToast } = useApp();
  // Panel-driven config (app_config): theme colours, hero text, notice.
  const { theme: T, homeHero, noticeText, app_pages } = useAppConfig();
  // Belt-and-braces: the hero text must never crash Home — if the
  // panel config ever lacks home_hero, the built-in default stands in.
  const hero = homeHero || { title: '1v1 Video Call', subtitle: 'Find your best match!' };
  // ── App Builder (Mother Panel → app_pages) — Home page ─────────
  // The panel's `home` page config hides / reorders the Home
  // sections: notice, hero, quickmatch (the three tiles), rewards
  // (the banner that opens Rewards), livehosts (the Live Hosts
  // grid). The grid is a scrolling list, so it always sits below
  // the header blocks even when the panel order puts it first —
  // that is the honest limit of this layout. `tabbar` is the bottom
  // tab bar, handled in App.js, not here.
  const homePage = React.useMemo(() => resolveAppPage(app_pages, 'home'), [app_pages]);
  const homeItemById = React.useMemo(() => new Map(homePage.items.map((i) => [i.id, i])), [homePage]);
  const showHomeBlock = (id) => {
    const it = homeItemById.get(id);
    return !!it && !it.hidden;
  };
  const showLiveHosts = showHomeBlock('livehosts');
  // Header blocks in the panel's order (livehosts + tabbar excluded).
  const homeHeaderOrder = homePage.items
    .filter((i) => !i.hidden && ['notice', 'hero', 'quickmatch', 'rewards'].indexOf(i.id) !== -1)
    .map((i) => i.id);
  const styles = React.useMemo(() => makeStyles(T), [T]);

  // Live-only Home: only hosts who are really live on video appear
  // here. "Live" means hosts.is_online AND a fresh heartbeat
  // (isHostOnlineNow, live.js). liveHostsLoaded is false while the
  // list is still the local demo fallback, so demo hosts can never
  // show as live. Empty list -> the honest "No hosts live right now."
  const liveHosts = React.useMemo(
    () => (liveHostsLoaded ? allHosts.filter((h) => h.online) : []),
    [allHosts, liveHostsLoaded],
  );

  // Live viewer counts per visible host id (null = unknown yet —
  // no count is shown until Realtime presence reports one).
  const [viewerCounts, setViewerCounts] = useState({});

  // Subscribe to Realtime presence for each visible host so the
  // cards show live viewer counts. Re-subscribes when the visible
  // list changes; every subscription is removed on cleanup.
  useEffect(() => {
    const unsubs = liveHosts
      .map((h) =>
        subscribeRoomViewers(h.id, (count) => {
          setViewerCounts((prev) =>
            prev[h.id] === count ? prev : { ...prev, [h.id]: count },
          );
        }),
      )
      .filter(Boolean);
    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch (e) {
          // Channel already removed.
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveHosts]);

  const renderHost = React.useCallback(({ item }) => (
    <HostCard
      host={item}
      viewers={viewerCounts[item.id] ?? null}
      rate={getLiveCallRate(item.rateTier).coinsPerMinute}
      navigation={navigation}
      styles={styles}
    />
  ), [navigation, viewerCounts, getLiveCallRate, styles]);

  const goMatching = () => navigation.navigate('Matching');

  // One header block per App Builder item id, rendered in the
  // panel's order (see homeHeaderOrder above).
  const renderHomeBlock = (id) => {
    if (id === 'notice') {
      // App notice from the Mother Panel (app_config notice.text).
      // Empty text = no banner at all.
      return noticeText ? (
        <View key="notice" style={styles.noticeBanner}>
          <Text style={styles.noticeText}>{noticeText}</Text>
        </View>
      ) : null;
    }
    if (id === 'hero') {
      // Hero banner — title + subtitle come from app_config home_hero.
      return (
        <LinearGradient
          key="hero"
          colors={[T.violet, T.purple, T.pink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>{hero.title}</Text>
          <Text style={styles.heroSub}>{hero.subtitle}</Text>
          <TouchableOpacity onPress={goMatching} activeOpacity={0.85}>
            <LinearGradient
              colors={[T.pinkLight, T.pink]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startMatchBtn}
            >
              <Text style={styles.startMatchTxt}>Start Match →</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      );
    }
    if (id === 'quickmatch') {
      // Three tiles.
      return (
        <View key="quickmatch" style={styles.tiles}>
          <TouchableOpacity onPress={goMatching} activeOpacity={0.85} style={styles.tileWrap}>
            <LinearGradient colors={[T.violet, T.violetDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
              <View style={styles.tileIcon}><Zap size={20} color="#ffd23e" strokeWidth={2.4} /></View>
              <Text style={styles.tileTitle}>Quick Match</Text>
              <Text style={styles.tileSub}>1v1 Chat</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={goMatching} activeOpacity={0.85} style={styles.tileWrap}>
            <LinearGradient colors={['#0ea5e9', '#2563eb']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
              <View style={styles.tileIcon}><Video size={20} color="#fff" strokeWidth={2.4} /></View>
              <Text style={styles.tileTitle}>Video Call</Text>
              <Text style={styles.tileSub}>Random</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('MessagesTab')} activeOpacity={0.85} style={styles.tileWrap}>
            <LinearGradient colors={['#f59e0b', '#ea580c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tile}>
              <View style={styles.tileIcon}><Users size={20} color="#fff" strokeWidth={2.4} /></View>
              <Text style={styles.tileTitle}>Friend Call</Text>
              <Text style={styles.tileSub}>Call friends</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }
    if (id === 'rewards') {
      // Rewards banner (App Builder `home:rewards` — the panel
      // preview shows it on Home): opens the real Rewards screen.
      return (
        <TouchableOpacity key="rewards" onPress={() => navigation.navigate('Rewards')} activeOpacity={0.85} style={styles.rewardsBanner}>
          <Text style={styles.rewardsBannerTxt}>🎁 Rewards — spin daily &amp; check in for coins</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const listHeader = (
    <View>
      {homeHeaderOrder.map((id) => renderHomeBlock(id))}
      {/* Live Hosts section header — hidden with the grid. */}
      {showLiveHosts ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Live Hosts</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => showToast('Showing all live hosts')} activeOpacity={0.8}>
            {/* See All: the grid below already shows every live host. */}
            <Text style={styles.seeAll}>See All ›</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  return (
    <LinearGradient colors={[T.panel2, T.deep, shadeColor(T.page, -45)]} style={styles.bg}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View style={styles.logo}>
          <Crown size={19} color={T.gold} strokeWidth={2.4} />
          <Text style={styles.logoTxt}>Livo</Text>
        </View>
        <TouchableOpacity
          style={styles.coinPill}
          onPress={() => navigation.navigate('WalletTab')}
          activeOpacity={0.8}
        >
          <CoinIcon size={19} fontSize={11} />
          <Text style={styles.coinText}>{Number(coins || 0).toLocaleString()}</Text>
          <View style={styles.coinPlus}><Text style={styles.coinPlusTxt}>+</Text></View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => navigation.navigate('MessagesTab')}
          activeOpacity={0.8}
        >
          <Bell size={19} color={T.text} strokeWidth={2} />
          {unreadTotal > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeTxt}>{unreadTotal > 9 ? '9+' : unreadTotal}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <FlatList
        data={showLiveHosts ? liveHosts : []}
        style={{ flex: 1 }}
        keyExtractor={(h) => String(h.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={renderHost}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        removeClippedSubviews maxToRenderPerBatch={8} windowSize={8} initialNumToRender={8} updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          showLiveHosts ? <Text style={styles.empty}>No hosts live right now.</Text> : null
        }
      />
    </LinearGradient>
  );
}

const makeStyles = (t) => StyleSheet.create({
  bg: { flex: 1, paddingTop: 40 },
  // Top bar: crown + Livo wordmark, coin pill, bell.
  topBar: { alignItems: 'center', flexDirection: 'row', paddingBottom: 10, paddingHorizontal: 16, paddingTop: 8 },
  logo: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 5 },
  logoTxt: { color: '#fff', fontSize: 24, fontStyle: 'italic', fontWeight: '900', letterSpacing: 0.5 },
  coinPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 5,
    paddingLeft: 9,
    paddingRight: 6,
    paddingTop: 5,
  },
  coinText: { color: t.text, fontSize: 14.5, fontWeight: '900' },
  coinPlus: { alignItems: 'center', backgroundColor: t.violet, borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  coinPlusTxt: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 17 },
  bellBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    marginLeft: 10,
    width: 38,
  },
  bellBadge: {
    alignItems: 'center',
    backgroundColor: t.red,
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -3,
    top: -3,
  },
  bellBadgeTxt: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
  // Hero banner.
  hero: { borderRadius: 20, marginHorizontal: 14, marginTop: 2, minHeight: 158, paddingHorizontal: 18, paddingVertical: 18 },
  // App notice banner (Mother Panel) — gold bg, dark text.
  noticeBanner: { backgroundColor: t.gold, borderRadius: 12, marginHorizontal: 14, marginTop: 2, paddingHorizontal: 14, paddingVertical: 10 },
  noticeText: { color: '#1f2937', fontSize: 13.5, fontWeight: '700' },
  // Rewards banner (App Builder `home:rewards`) — gold, like the panel preview.
  rewardsBanner: { backgroundColor: t.gold, borderRadius: 12, marginHorizontal: 14, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12 },
  rewardsBannerTxt: { color: '#3b2a00', fontSize: 13, fontWeight: '800' },
  heroTitle: { color: '#ffe259', fontSize: 21, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  heroSub: { color: '#fff', fontSize: 13.5, fontWeight: '700', marginTop: 4 },
  startMatchBtn: { alignSelf: 'flex-start', borderRadius: 999, marginTop: 16, minHeight: 40, paddingHorizontal: 17, paddingVertical: 9 },
  startMatchTxt: { color: '#fff', fontSize: 14.5, fontWeight: '900' },
  // Tiles.
  tiles: { flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 14 },
  tileWrap: { flex: 1 },
  tile: { borderRadius: 17, minHeight: 96, paddingBottom: 11, paddingHorizontal: 6, paddingTop: 13 },
  tileIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  tileTitle: { color: '#fff', fontSize: 13.5, fontWeight: '800', marginTop: 10 },
  tileSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  // Section header.
  sectionHead: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 11, marginHorizontal: 16, marginTop: 19 },
  sectionTitle: { color: t.text, fontSize: 17, fontWeight: '900' },
  seeAll: { color: t.dim, fontSize: 13, fontWeight: '800' },
  // Host grid.
  list: { paddingBottom: 24, paddingHorizontal: 14 },
  row: { gap: 11 },
  card: { flex: 1, marginBottom: 11 },
  photo: { alignItems: 'center', aspectRatio: 3 / 3.9, backgroundColor: t.panel2, borderRadius: 17, justifyContent: 'center', overflow: 'hidden' },
  photoImg: { height: '100%', position: 'absolute', width: '100%' },
  photoShade: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  avatar: { color: '#fff', fontSize: 56, fontWeight: '700' },
  liveBadge: { alignItems: 'center', backgroundColor: t.red, borderRadius: 6, flexDirection: 'row', gap: 4, left: 8, paddingHorizontal: 7, paddingVertical: 3, position: 'absolute', top: 8 },
  liveDot: { backgroundColor: '#fff', borderRadius: 3, height: 6, width: 6 },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  ratePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.55)',
    borderColor: 'rgba(247,183,51,0.5)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  rateText: { color: t.gold2, fontSize: 10.5, fontWeight: '900' },
  cardBottom: { bottom: 10, left: 10, position: 'absolute', right: 10 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  name: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  female: { color: t.pinkLight, fontSize: 12, fontWeight: '800' },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 4 },
  flagChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 5, color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.4, overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 2 },
  viewers: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  viewersText: { color: '#e7dcff', fontSize: 11.5, fontWeight: '700' },
  empty: { color: t.dim, fontSize: 14, marginTop: 40, textAlign: 'center' },
});
