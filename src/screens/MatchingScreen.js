// Livo Matching screen (new UI 2026-11-25, preview §3.3).
// Matches the signed-in user against REAL online hosts only:
// approved + live (is_online + fresh heartbeat) + female + not
// yourself. If nobody is online, the honest "No hosts online
// right now." state shows — a match is never faked.
// DELIBERATE difference from the preview: the preview auto-opens
// a Video Call 0.7s after "Host found!". The real app never
// starts a paid call by itself — the matched host is shown with a
// "Start Video Call" button instead, so the user chooses.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Heart } from 'lucide-react-native';
import { THEME } from '../config';
import { useApp } from '../store';
import { AuthContext } from '../../App';
import { getSessionUser } from '../supabase/auth';
import { CoinIcon } from '../components/GiftSheet';

// Seconds before the search resolves (preview: 4.2s).
const SEARCH_MS = 4200;

function AvatarCircle({ photo, name, ringColor, glowColor, size = 128 }) {
  return (
    <View
      style={[
        styles.avatarRing,
        {
          height: size,
          width: size,
          borderRadius: size / 2,
          borderColor: ringColor,
          shadowColor: glowColor,
        },
      ]}
    >
      {photo ? (
        <Image source={photo} style={{ height: size - 6, width: size - 6, borderRadius: (size - 6) / 2 }} resizeMode="cover" />
      ) : (
        <Text style={[styles.avatarLetter, { fontSize: size * 0.4 }]}>{name ? name[0].toUpperCase() : '?'}</Text>
      )}
    </View>
  );
}

export default function MatchingScreen({ navigation }) {
  const { hosts, liveHostsLoaded, getLiveCallRate } = useApp();
  const authCtx = useContext(AuthContext);
  const [seconds, setSeconds] = useState(0);
  const [phase, setPhase] = useState('searching'); // searching | found | none
  const [candidate, setCandidate] = useState(null);
  const [myId, setMyId] = useState(null);
  const myIdRef = useRef(null);

  // My auth id, so I can never be matched with myself.
  useEffect(() => {
    let cancelled = false;
    getSessionUser().then((u) => {
      if (!cancelled && u && u.id) {
        setMyId(u.id);
        myIdRef.current = u.id;
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Real match pool: live + female + not me. Gated on
  // liveHostsLoaded so demo hosts can never be matched.
  const pool = useMemo(() => {
    if (!liveHostsLoaded) return [];
    return hosts.filter(
      (h) =>
        h.online &&
        String(h.gender || '').toLowerCase() === 'female' &&
        (!myId || h.profileId !== myId),
    );
  }, [hosts, liveHostsLoaded, myId]);

  // Search timer.
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Resolve the search after SEARCH_MS: pick a random host from
  // the real pool, or the honest empty state when nobody is online.
  useEffect(() => {
    if (phase !== 'searching' || !liveHostsLoaded) return undefined;
    const t = setTimeout(() => {
      if (pool.length > 0) {
        setCandidate(pool[Math.floor(Math.random() * pool.length)]);
        setPhase('found');
      } else {
        setPhase('none');
      }
    }, SEARCH_MS);
    return () => clearTimeout(t);
  }, [phase, liveHostsLoaded, pool]);

  // Pulsing stage rings + beating heart (preview animations).
  const pulse = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    p.start();
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    b.start();
    return () => { p.stop(); b.stop(); };
  }, [pulse, beat]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.14] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.15] });
  const heartScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const pickAnother = () => {
    if (pool.length <= 1) return;
    let next = candidate;
    while (next === candidate) {
      next = pool[Math.floor(Math.random() * pool.length)];
    }
    setCandidate(next);
  };

  const retry = () => {
    setSeconds(0);
    setCandidate(null);
    setPhase('searching');
  };

  const myMeta = (authCtx && authCtx.user && authCtx.user.user_metadata) || {};
  const myPhoto = myMeta.avatar_url ? { uri: myMeta.avatar_url } : null;
  const myName = myMeta.full_name || myMeta.name || 'You';

  const statusText =
    phase === 'searching'
      ? 'Searching for an online host...'
      : phase === 'found'
        ? 'Host found!'
        : 'No hosts online right now';

  return (
    <LinearGradient colors={['#341064', '#1c0538', '#12021f']} style={styles.bg}>
      <StatusBar style="light" />
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <ChevronLeft size={30} color={THEME.text} strokeWidth={2.5} />
      </TouchableOpacity>

      <Text style={styles.title}>Matching...</Text>
      <Text style={styles.subtitle}>Finding the best partner for you</Text>

      {/* Stage: host avatar + beating heart + my avatar */}
      <View style={styles.stage}>
        <Animated.View style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
        <AvatarCircle
          photo={candidate ? candidate.photo : null}
          name={candidate ? candidate.name : '?'}
          ringColor="#f43f9e"
          glowColor="rgba(244,63,158,0.75)"
        />
        <Animated.View style={[styles.heart, { transform: [{ scale: heartScale }] }]}>
          <Heart size={44} color="#ff2e88" fill="#ff2e88" strokeWidth={1} />
        </Animated.View>
        <AvatarCircle
          photo={myPhoto}
          name={myName}
          ringColor="#38bdf8"
          glowColor="rgba(56,189,248,0.75)"
        />
      </View>

      <View style={styles.timerRow}>
        <Text style={styles.timer}>🕐 {mm}:{ss}</Text>
      </View>
      <Text style={styles.status}>{statusText}</Text>

      {/* Found: the real matched host + Start / Next */}
      {phase === 'found' && candidate ? (
        <View style={styles.foundCard}>
          <View style={styles.foundRow}>
            <AvatarCircle photo={candidate.photo} name={candidate.name} ringColor="#f7b733" glowColor="rgba(247,183,51,0.5)" size={72} />
            <View style={styles.foundInfo}>
              <View style={styles.foundNameRow}>
                <Text style={styles.foundName}>{candidate.name}</Text>
                <Text style={styles.female}>♀</Text>
              </View>
              <Text style={styles.foundMeta}>{candidate.country} · {candidate.lang || 'English'}</Text>
              <View style={styles.ratePill}>
                <CoinIcon size={14} fontSize={9} />
                <Text style={styles.rateText}>{getLiveCallRate(candidate.rateTier).coinsPerMinute} Coins / Min</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('VideoCall', { host: candidate })}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#ff5da2', '#f43f9e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.callBtn}>
              <Text style={styles.callBtnTxt}>Start Video Call</Text>
            </LinearGradient>
          </TouchableOpacity>
          {pool.length > 1 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={pickAnother} activeOpacity={0.8}>
              <Text style={styles.nextTxt}>Next →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Nobody online: honest empty state */}
      {phase === 'none' ? (
        <View style={styles.noneCard}>
          <Text style={styles.noneTxt}>No hosts are live right now.{"\n"}Please try again later.</Text>
          <TouchableOpacity onPress={retry} activeOpacity={0.85}>
            <LinearGradient colors={['#8b3dff', '#7b2ff7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.retryBtn}>
              <Text style={styles.retryTxt}>Try again</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />
      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
        <Text style={styles.cancelTxt}>Cancel</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, paddingHorizontal: 20, paddingTop: 44 },
  backBtn: { alignSelf: 'flex-start', marginLeft: -6, padding: 6 },
  title: { color: THEME.text, fontSize: 27, fontWeight: '900', marginTop: 26 },
  subtitle: { color: THEME.dim, fontSize: 14.5, fontWeight: '700', marginTop: 6 },
  stage: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 250,
    justifyContent: 'space-between',
    marginTop: 36,
    position: 'relative',
  },
  pulseRing: {
    borderColor: 'rgba(244,63,158,0.5)',
    borderRadius: 140,
    borderWidth: 2,
    height: 280,
    left: '50%',
    marginLeft: -140,
    position: 'absolute',
    top: -15,
    width: 280,
  },
  avatarRing: {
    alignItems: 'center',
    backgroundColor: THEME.panel2,
    borderWidth: 3,
    elevation: 8,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 34,
  },
  avatarLetter: { color: '#fff', fontWeight: '900' },
  heart: { marginHorizontal: -8, zIndex: 2 },
  timerRow: { alignItems: 'center', marginTop: 10 },
  timer: { color: THEME.text, fontSize: 21, fontWeight: '900' },
  status: { color: THEME.dim, fontSize: 14.5, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  foundCard: {
    backgroundColor: THEME.panel,
    borderColor: THEME.line,
    borderRadius: 17,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },
  foundRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  foundInfo: { flex: 1 },
  foundNameRow: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  foundName: { color: THEME.text, fontSize: 18, fontWeight: '900' },
  female: { color: THEME.pinkLight, fontSize: 15, fontWeight: '800' },
  foundMeta: { color: THEME.dim, fontSize: 13, fontWeight: '600', marginTop: 3 },
  ratePill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(20,4,40,0.66)',
    borderColor: 'rgba(247,183,51,0.4)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  rateText: { color: '#ffe9a8', fontSize: 13.5, fontWeight: '900' },
  callBtn: { alignItems: 'center', borderRadius: 999, marginTop: 16, minHeight: 48, paddingVertical: 13 },
  callBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  nextBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 6 },
  nextTxt: { color: THEME.gold2, fontSize: 14, fontWeight: '800' },
  noneCard: { alignItems: 'center', marginTop: 22 },
  noneTxt: { color: THEME.dim, fontSize: 15, fontWeight: '700', lineHeight: 22, textAlign: 'center' },
  retryBtn: { alignItems: 'center', borderRadius: 999, marginTop: 16, minHeight: 46, paddingHorizontal: 28, paddingVertical: 12 },
  retryTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  cancelBtn: {
    alignSelf: 'center',
    backgroundColor: 'rgba(139,61,255,0.14)',
    borderColor: THEME.purple,
    borderRadius: 999,
    borderWidth: 2,
    marginBottom: 40,
    minHeight: 50,
    paddingVertical: 13,
    width: '72%',
  },
  cancelTxt: { color: '#e9dcff', fontSize: 16.5, fontWeight: '900', textAlign: 'center' },
});
