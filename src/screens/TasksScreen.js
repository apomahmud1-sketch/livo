// Livo TasksScreen — Vero-style daily tasks that earn coins.
// The task list comes from the Supabase `tasks` table (active rows
// only, withTimeout-guarded). There is NO hardcoded fallback list:
// a failed read or an empty table shows an honest empty / error
// state instead of pretending demo tasks are live.
// Claiming goes through store.claimTask(task), which is server-
// gated: completion is derived on the server, and it returns true
// only when the reward was actually credited (false = not complete
// yet or already claimed). No local in-memory completion check is
// used as a source of truth — the claimed marks shown here are only
// a session display cache of server-confirmed claims.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
import { withTimeout } from '../supabase/timeout';

// The tasks table has no icon column — pick one from the title.
const ICON_FOR_TITLE = [
  [/check-in/i, '📅'],
  [/spin/i, '🎡'],
  [/gift/i, '🎁'],
  [/call/i, '📞'],
  [/follow/i, '➕'],
];
function iconFor(task) {
  const title = (task && task.title) || '';
  const hit = ICON_FOR_TITLE.find(([re]) => re.test(title));
  return hit ? hit[1] : '🎯';
}

export default function TasksScreen({ navigation }) {
  const { coins, claimTask, showToast } = useApp();
  const [tasks, setTasks] = React.useState(null); // null = loading
  const [loadError, setLoadError] = React.useState(false);
  const [claimedIds, setClaimedIds] = React.useState([]); // server-confirmed, this session only
  const [claimingId, setClaimingId] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      if (!supabase) {
        if (mounted) setLoadError(true);
        return;
      }
      const res = await withTimeout(
        supabase.from('tasks').select('*').eq('is_active', true),
      );
      if (!mounted) return;
      if (res && !res.error && Array.isArray(res.data)) {
        setTasks(res.data);
      } else {
        setLoadError(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onClaim = async (task) => {
    if (claimingId) return;
    setClaimingId(task.id);
    try {
      const ok = await claimTask(task);
      if (ok === true) {
        setClaimedIds((ids) => (ids.includes(task.id) ? ids : [...ids, task.id]));
        showToast(`+${Number(task.reward_coins || 0).toLocaleString()} coins — task complete!`);
      } else {
        showToast('Not complete yet — finish the task first, then claim.');
      }
    } catch (e) {
      showToast('Could not claim — check your connection and try again.');
    } finally {
      setClaimingId(null);
    }
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
      {tasks === null && !loadError ? (
        <Text style={styles.empty}>Loading tasks…</Text>
      ) : loadError ? (
        <Text style={styles.empty}>Couldn&apos;t load tasks — check your connection and try again.</Text>
      ) : tasks.length === 0 ? (
        <Text style={styles.empty}>No tasks right now — check back tomorrow.</Text>
      ) : (
        tasks.map((t) => {
          const claimed = claimedIds.includes(t.id);
          const claiming = claimingId === t.id;
          const disabled = claimed || claiming;
          return (
            <View key={t.id} style={[styles.card, claimed && styles.cardClaimed]}>
              <Text style={styles.icon}>{iconFor(t)}</Text>
              <View style={styles.info}>
                <Text style={styles.taskTitle}>{t.title}</Text>
                {t.description ? <Text style={styles.taskDesc}>{t.description}</Text> : null}
                {t.target_count && t.target_count > 1 ? (
                  <Text style={styles.taskDesc}>Target: {t.target_count} {t.target_unit || ''}</Text>
                ) : null}
                <Text style={styles.reward}>+{Number(t.reward_coins || 0).toLocaleString()} coins</Text>
              </View>
              <TouchableOpacity
                style={[styles.claimBtn, disabled && styles.claimBtnOff]}
                disabled={disabled}
                onPress={() => onClaim(t)}
                activeOpacity={0.85}
              >
                <Text style={[styles.claimBtnText, disabled && styles.claimBtnTextOff]}>{claimed ? '✓ Claimed' : claiming ? '…' : 'Claim'}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}
      <Text style={styles.note}>Rewards are added to your real coin balance. Completion is checked on the server.</Text>
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
  empty: { color: COLORS.grey, fontSize: 14, marginTop: 24, textAlign: 'center' },
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
