// Livo TasksScreen — Vero-style daily tasks that earn coins.
// Progress comes from real store state (check-in, spin, gifts
// sent, calls made, follows). Each task can be claimed once per
// day; claims are saved on the device (store.claimTask).
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
import { todayKey } from '../rewardsConfig';

const TASKS = [
  { id: 'task-checkin', icon: '📅', title: 'Daily check-in', desc: 'Claim your daily reward', reward: 100 },
  { id: 'task-spin', icon: '🎡', title: 'Spin the wheel', desc: 'Use your free spin today', reward: 50 },
  { id: 'task-gift', icon: '🎁', title: 'Send a gift', desc: 'Send any gift in a call', reward: 100 },
  { id: 'task-call', icon: '📞', title: 'Make a call', desc: 'Finish one video or voice call', reward: 200 },
  { id: 'task-follow', icon: '➕', title: 'Follow 2 hosts', desc: 'Follow hosts you like', reward: 100 },
];

export default function TasksScreen({ navigation }) {
  const { coins, lastCheckinDate, lastSpinDate, spinsUsedToday, giftsSent, callHistory, following, claimedTasks, claimTask } = useApp();
  const today = todayKey();
  const claimedToday = claimedTasks[today] || [];
  const isDone = (id) => {
    if (id === 'task-checkin') return lastCheckinDate === today;
    if (id === 'task-spin') return lastSpinDate === today && spinsUsedToday > 0;
    if (id === 'task-gift') return giftsSent > 0;
    if (id === 'task-call') return callHistory.length > 0;
    if (id === 'task-follow') return following.length >= 2;
    return false;
  };
  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>🎯 Daily Tasks</Text>
      <Text style={styles.sub}>Finish tasks, earn coins. Tasks reset every day.</Text>
      <View style={styles.coinPill}>
        <Text style={styles.coinText}>🪙 {coins.toLocaleString()} coins</Text>
      </View>
      {TASKS.map((t) => {
        const done = isDone(t.id);
        const claimed = claimedToday.includes(t.id);
        const disabled = !done || claimed;
        return (
          <View key={t.id} style={[styles.card, claimed && styles.cardClaimed]}>
            <Text style={styles.icon}>{t.icon}</Text>
            <View style={styles.info}>
              <Text style={styles.taskTitle}>{t.title}</Text>
              <Text style={styles.taskDesc}>{t.desc}</Text>
              <Text style={styles.reward}>+{t.reward} coins</Text>
            </View>
            <TouchableOpacity
              style={[styles.claimBtn, disabled && styles.claimBtnOff]}
              disabled={disabled}
              onPress={() => claimTask(t.id, today, t.reward)}
              activeOpacity={0.85}
            >
              <Text style={[styles.claimBtnText, disabled && styles.claimBtnTextOff]}>{claimed ? '✓ Claimed' : done ? 'Claim' : 'Not done'}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <Text style={styles.note}>Rewards are added to your real coin balance.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { color: COLORS.purple, fontSize: 16, fontWeight: 'bold' },
  bg: { backgroundColor: '#fff', flex: 1 },
  card: { alignItems: 'center', backgroundColor: COLORS.lavender, borderRadius: 14, flexDirection: 'row', marginTop: 12, padding: 14 },
  cardClaimed: { backgroundColor: '#dcfce7', opacity: 0.75 },
  claimBtn: { backgroundColor: COLORS.purple, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  claimBtnOff: { backgroundColor: COLORS.lightGrey },
  claimBtnText: { color: '#fff', fontWeight: 'bold' },
  claimBtnTextOff: { color: COLORS.grey },
  coinPill: { alignSelf: 'flex-start', backgroundColor: COLORS.lavender, borderRadius: 20, marginTop: 12, paddingHorizontal: 14, paddingVertical: 8 },
  coinText: { fontWeight: 'bold' },
  icon: { fontSize: 28 },
  info: { flex: 1, marginLeft: 12 },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 16, textAlign: 'center' },
  reward: { color: COLORS.purple, fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  sub: { color: COLORS.grey, marginTop: 4 },
  taskDesc: { color: COLORS.grey, fontSize: 13, marginTop: 2 },
  taskTitle: { fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 24, fontWeight: 'bold', marginTop: 8 },
  wrap: { padding: 16, paddingTop: 48 },
});
