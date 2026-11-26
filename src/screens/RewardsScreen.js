// Livo RewardsScreen — Lucky Spin + Daily Reward  [F1]
// ─────────────────────────────────────────────────────────────────
// • Lucky Spin: 1 free spin per day (FREE_SPINS_PER_DAY), coin
//   prizes from the live spin_prizes table via the store —
//   rewardsConfig.js is only the fallback when the table is
//   missing. The admin panel can change the prizes / odds /
//   free spins at any time.
// • Daily check-in: claim once a day, 7-day streak cycle, reward
//   from the live app_config `rewards` key via the store
//   (CHECKIN_REWARDS in rewardsConfig.js is the fallback).
// • Winnings are added to the LIVE coin balance via the store's
//   real addRewardCoins() — no demo / hard-coded balance.
// • SERVER GATE: spin and check-in go through the store's
//   recordSpin() / recordCheckin(), which are server-gated to once
//   per day and return { ok, alreadyClaimed }. The local dates /
//   streak shown here are a DISPLAY CACHE ONLY — the server gate is
//   the source of truth. A spin is gated BEFORE the wheel turns, so
//   an already-claimed day never spins or credits. A check-in is
//   gated BEFORE the coins are credited.
// • No new native dependencies: the wheel is plain Views +
//   Animated (React Native core). No call summary anywhere.
// ─────────────────────────────────────────────────────────────────
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { useAppConfig } from '../appConfig';
import { useApp } from '../store';
import {
  CHECKIN_CYCLE_DAYS,
  CHECKIN_REWARDS as DEFAULT_CHECKIN_REWARDS,
  FREE_SPINS_PER_DAY as DEFAULT_FREE_SPINS_PER_DAY,
  SPIN_PRIZES as DEFAULT_SPIN_PRIZES,
  pickSpinPrizeFrom,
  todayKey,
  yesterdayKey,
} from '../rewardsConfig';

// Wheel geometry: 8 segments of 45°. Each segment is a triangle
// (border trick) with its apex at the wheel centre and its base
// on the rim. base = 2 * R * tan(22.5°).
// Wheel fits every phone: 280px on big screens, smaller on narrow ones.
const { width: SCREEN_W } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(280, SCREEN_W - 48);
const RADIUS = WHEEL_SIZE / 2;
const SEGMENT_BASE = Math.round(2 * RADIUS * Math.tan(Math.PI / 8)); // ≈116
const SPIN_TURNS = 5;
const SPIN_DURATION_MS = 4000;

export default function RewardsScreen({ navigation }) {
  // Panel toggle (app_config features.my_tasks): the Daily Tasks
  // button below is hidden when tasks are OFF.
  const { features } = useAppConfig();
  const {
    coins,
    addRewardCoins,
    recordSpin,
    recordCheckin,
    spinsUsedToday,
    lastSpinDate,
    lastCheckinDate,
    checkinStreak,
    showToast,
    // [Live] Spin prizes / free spins / check-in rewards from
    // Supabase (store), falling back to the hardcoded values
    // above when the tables / app_config key are missing.
    spinPrizes: liveSpinPrizes,
    freeSpinsPerDay: liveFreeSpins,
    checkinRewards: liveCheckinRewards,
  } = useApp();

  // Live values win when the store resolved them; otherwise the
  // hardcoded defaults stand in — the wheel always has exactly 8
  // segments (the store only accepts an 8-prize live list).
  const SPIN_PRIZES =
    Array.isArray(liveSpinPrizes) && liveSpinPrizes.length === 8 ? liveSpinPrizes : DEFAULT_SPIN_PRIZES;
  const FREE_SPINS_PER_DAY =
    Number.isInteger(liveFreeSpins) && liveFreeSpins > 0 ? liveFreeSpins : DEFAULT_FREE_SPINS_PER_DAY;
  const CHECKIN_REWARDS =
    Array.isArray(liveCheckinRewards) && liveCheckinRewards.length === 7 ? liveCheckinRewards : DEFAULT_CHECKIN_REWARDS;
  const SEGMENT_ANGLE = 360 / SPIN_PRIZES.length; // 45° with 8 prizes

  const [spinning, setSpinning] = useState(false);
  const [lastWin, setLastWin] = useState(null);
  const rotation = useRef(new Animated.Value(0)).current;
  const rotationDeg = useRef(0); // accumulated degrees, kept in sync

  const today = todayKey();
  const spinsUsed = lastSpinDate === today ? spinsUsedToday : 0;
  const spinsLeft = Math.max(0, FREE_SPINS_PER_DAY - spinsUsed);
  const canSpin = spinsLeft > 0 && !spinning;

  const checkinClaimedToday = lastCheckinDate === today;
  // Next streak: continue if yesterday was claimed, else restart at 1.
  const nextStreak = lastCheckinDate === yesterdayKey() ? checkinStreak + 1 : 1;
  const nextCheckinReward =
    CHECKIN_REWARDS[(nextStreak - 1) % CHECKIN_CYCLE_DAYS];

  const spin = async () => {
    if (spinning) return;
    if (spinsLeft <= 0) {
      showToast('No free spins left today — come back tomorrow!');
      return;
    }
    // Server gate first: once per day, per account. The gate is the
    // source of truth — the local spinsLeft above is display only.
    // (A missing gate result is treated as allowed; the gate itself
    // is what enforces the once-per-day rule.)
    let gate = null;
    try {
      gate = await recordSpin();
    } catch (e) {
      showToast('Could not start the spin — check your connection and try again.');
      return;
    }
    if (gate && gate.alreadyClaimed) {
      showToast('You already used your free spin today — come back tomorrow!');
      return;
    }
    if (gate && gate.ok === false) {
      showToast('Could not start the spin — try again.');
      return;
    }
    const prize = pickSpinPrizeFrom(SPIN_PRIZES);
    const prizeIndex = SPIN_PRIZES.findIndex((p) => p.id === prize.id);
    // Segment i is centred at i * 45° clockwise from the top.
    // Rotate the wheel so that centre lands under the top pointer,
    // with a small random offset so it never stops dead-centre.
    const jitter = Math.random() * 24 - 12; // ±12° inside the segment
    const targetOffset =
      (360 - prizeIndex * SEGMENT_ANGLE) % 360 + jitter;
    const total = SPIN_TURNS * 360 + targetOffset;
    const from = rotationDeg.current;
    const to = from + total;

    setSpinning(true);
    setLastWin(null);
    Animated.timing(rotation, {
      toValue: to,
      duration: SPIN_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      rotationDeg.current = to % 360;
      rotation.setValue(rotationDeg.current); // same angle, keeps numbers small
      setSpinning(false);
      addRewardCoins(prize.coins, 'Lucky Spin');
      setLastWin(prize);
    });
  };

  const claimCheckin = async () => {
    if (checkinClaimedToday) return;
    // Server gate first: once per day, per account. Coins are
    // credited ONLY when the gate allows the claim.
    let gate = null;
    try {
      gate = await recordCheckin();
    } catch (e) {
      showToast('Could not claim — check your connection and try again.');
      return;
    }
    if (gate && gate.alreadyClaimed) {
      showToast('Already claimed today — come back tomorrow!');
      return;
    }
    if (gate && gate.ok === false) {
      showToast('Could not claim — try again.');
      return;
    }
    addRewardCoins(nextCheckinReward, 'Daily Reward');
  };

  const wheelSpin = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <LinearGradient colors={['#fffbeb', '#fef3c7', '#fff7ed']} style={styles.bg}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🎡 Rewards</Text>
          <View style={styles.coinPill}>
            <Text style={styles.coinText}>🪙 {coins.toLocaleString()}</Text>
          </View>
        </View>

        {/* ── Lucky Spin ─────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Lucky Spin</Text>
        <Text style={styles.sectionSub}>
          {spinsLeft > 0
            ? `${spinsLeft} free spin${spinsLeft > 1 ? 's' : ''} left today`
            : 'No free spins left today — come back tomorrow!'}
        </Text>

        <View style={styles.wheelWrap}>
          {/* Pointer at the top */}
          <View style={styles.pointer} />
          <Animated.View style={[styles.wheel, { transform: [{ rotate: wheelSpin }] }]}>
            <View style={styles.wheelBase} />
            {SPIN_PRIZES.map((prize, i) => (
              <View
                key={prize.id}
                style={[styles.segment, { transform: [{ rotate: `${i * SEGMENT_ANGLE}deg` }] }]}
              >
                <View
                  style={[
                    styles.wedge,
                    {
                      borderTopColor: prize.color,
                      borderLeftWidth: SEGMENT_BASE / 2,
                      borderRightWidth: SEGMENT_BASE / 2,
                      borderTopWidth: RADIUS,
                    },
                  ]}
                />
                <View style={styles.labelWrap}>
                  <Text style={styles.label}>🪙{'\n'}{prize.label}</Text>
                </View>
              </View>
            ))}
            <View style={styles.hub}>
              <Text style={styles.hubText}>LIVO</Text>
            </View>
          </Animated.View>
        </View>

        <TouchableOpacity
          style={[styles.spinButton, !canSpin && styles.buttonDisabled]}
          onPress={spin}
          disabled={!canSpin}
          activeOpacity={0.85}
        >
          <Text style={styles.spinButtonText}>
            {spinning ? 'Spinning…' : spinsLeft > 0 ? 'SPIN (FREE)' : 'COME BACK TOMORROW'}
          </Text>
        </TouchableOpacity>

        {lastWin && (
          <View style={styles.winBanner}>
            <Text style={styles.winText}>
              🎉 You won {lastWin.coins.toLocaleString()} coins!
            </Text>
          </View>
        )}

        {/* ── Daily check-in ─────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Daily Reward</Text>
        <Text style={styles.sectionSub}>
          {checkinClaimedToday
            ? `Claimed today — ${checkinStreak}-day streak 🔥 Come back tomorrow!`
            : `Check in today for ${nextCheckinReward} coins (day ${((nextStreak - 1) % CHECKIN_CYCLE_DAYS) + 1} of ${CHECKIN_CYCLE_DAYS})`}
        </Text>

        <View style={styles.weekRow}>
          {CHECKIN_REWARDS.map((amount, i) => {
            const day = i + 1;
            const cycleDay = ((nextStreak - 1) % CHECKIN_CYCLE_DAYS) + 1;
            const isToday = !checkinClaimedToday && day === cycleDay;
            const isClaimed = checkinClaimedToday
              ? day <= cycleDay
              : day < cycleDay;
            return (
              <View
                key={day}
                style={[
                  styles.dayBox,
                  isToday && styles.dayToday,
                  isClaimed && styles.dayClaimed,
                ]}
              >
                <Text style={styles.dayLabel}>Day {day}</Text>
                <Text style={styles.dayCoins}>🪙{amount}</Text>
                {isClaimed && <Text style={styles.dayCheck}>✓</Text>}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.claimButton, checkinClaimedToday && styles.buttonDisabled]}
          onPress={claimCheckin}
          disabled={checkinClaimedToday}
          activeOpacity={0.85}
        >
          <Text style={styles.claimButtonText}>
            {checkinClaimedToday
              ? 'CLAIMED ✓'
              : `CLAIM ${nextCheckinReward} COINS`}
          </Text>
        </TouchableOpacity>

        {/* [Vero] Daily Tasks — finish tasks, earn coins.
            Hidden when the panel turns my_tasks OFF. */}
        {features.my_tasks ? (
          <TouchableOpacity
            style={styles.tasksButton}
            onPress={() => navigation.navigate('Tasks')}
            activeOpacity={0.85}
          >
            <Text style={styles.tasksButtonText}>🎯 Daily Tasks — Earn Coins</Text>
          </TouchableOpacity>
        ) : null}
        {/* [/Vero] */}

        <Text style={styles.note}>
          Rewards are added to your real coin balance. Spins and
          check-ins are limited to once a day on your account — the
          server checks this, not just this device.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  back: { color: COLORS.purple, fontSize: 16, fontWeight: 'bold' },
  bg: { flex: 1, paddingTop: 48 },
  buttonDisabled: { opacity: 0.45 },
  claimButton: {
    backgroundColor: COLORS.green,
    borderRadius: 24,
    marginTop: 14,
    paddingVertical: 14,
  },
  claimButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  coinPill: { backgroundColor: '#fff', borderRadius: 20, elevation: 2, paddingHorizontal: 14, paddingVertical: 8 },
  coinText: { fontWeight: 'bold' },
  dayBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: COLORS.lightGrey,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 2,
    paddingVertical: 8,
  },
  dayCheck: { color: COLORS.green, fontSize: 12, fontWeight: 'bold' },
  dayClaimed: { backgroundColor: '#dcfce7', borderColor: COLORS.green },
  dayCoins: { fontSize: 12, fontWeight: 'bold', marginTop: 2 },
  dayLabel: { color: COLORS.grey, fontSize: 10 },
  dayToday: { borderColor: COLORS.purple, borderWidth: 2 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  hub: {
    alignItems: 'center',
    backgroundColor: COLORS.purple,
    borderColor: '#fff',
    borderRadius: 34,
    borderWidth: 3,
    height: 68,
    justifyContent: 'center',
    left: RADIUS - 34,
    position: 'absolute',
    top: RADIUS - 34,
    width: 68,
  },
  hubText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  label: { color: COLORS.dark, fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  labelWrap: { alignItems: 'center', left: RADIUS - 30, position: 'absolute', top: 16, width: 60 },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 16, textAlign: 'center' },
  pointer: {
    borderBottomColor: COLORS.pink,
    borderBottomWidth: 22,
    borderLeftColor: 'transparent',
    borderLeftWidth: 12,
    borderRightColor: 'transparent',
    borderRightWidth: 12,
    height: 0,
    marginBottom: -6,
    width: 0,
    zIndex: 2,
  },
  scroll: { paddingBottom: 40, paddingHorizontal: 16 },
  sectionSub: { color: COLORS.grey, marginBottom: 12, marginTop: 4, textAlign: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 18, textAlign: 'center' },
  segment: { height: WHEEL_SIZE, left: 0, position: 'absolute', top: 0, width: WHEEL_SIZE },
  spinButton: {
    backgroundColor: COLORS.pink,
    borderRadius: 24,
    marginTop: 16,
    paddingVertical: 14,
  },
  spinButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold', textAlign: 'center' },
  // [Vero] Daily Tasks button.
  tasksButton: { backgroundColor: COLORS.green, borderRadius: 24, marginTop: 14, paddingVertical: 14 },
  tasksButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  // [/Vero]
  title: { color: COLORS.purple, fontSize: 22, fontWeight: 'bold' },
  wedge: {
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    height: 0,
    left: (WHEEL_SIZE - SEGMENT_BASE) / 2,
    position: 'absolute',
    top: 0, // apex lands on the wheel centre (borderTopWidth = RADIUS)
    width: 0,
  },
  weekRow: { flexDirection: 'row', marginTop: 6 },
  wheel: {
    borderColor: COLORS.gold,
    borderRadius: RADIUS,
    borderWidth: 5,
    height: WHEEL_SIZE,
    overflow: 'hidden',
    width: WHEEL_SIZE,
  },
  wheelBase: {
    backgroundColor: '#fff7ed',
    borderRadius: RADIUS,
    height: WHEEL_SIZE,
    left: 0,
    position: 'absolute',
    top: 0,
    width: WHEEL_SIZE,
  },
  wheelWrap: { alignItems: 'center', marginTop: 8 },
  winBanner: { backgroundColor: '#dcfce7', borderRadius: 12, marginTop: 12, paddingVertical: 10 },
  winText: { color: '#166534', fontWeight: 'bold', textAlign: 'center' },
});
