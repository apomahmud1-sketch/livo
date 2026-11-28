// ─────────────────────────────────────────────────────────────────
// Livo — Daily gift rank (2026-11-28).
// The room's top gift senders TODAY (Singapore day), ranked by the
// diamonds the host received from each sender. Shared by the host
// room (VideoCallScreen) and the viewer room (LiveRoomScreen):
// both show the same left-side 🏆 Rank pill, tapping it opens
// this modal. Real transactions rows only — senders are recorded
// on gift_received rows (counterparty_id) since 28d; older gifts
// have no sender and never appear. Empty state when nobody sent
// a gift yet today.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { fetchDailyGiftRank } from '../supabase/wallet';

// Start of today in Asia/Singapore, as an ISO string (UTC).
export function sgtDayStartIso() {
  const now = new Date();
  const sgt = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  sgt.setHours(0, 0, 0, 0);
  return new Date(sgt.getTime() - 8 * 3600 * 1000).toISOString();
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function DailyGiftRank({ visible, hostProfileId, hostName, onClose }) {
  const [rows, setRows] = React.useState(null); // null = loading

  React.useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setRows(null);
    fetchDailyGiftRank(hostProfileId, sgtDayStartIso()).then((r) => {
      if (!cancelled) setRows(r || []);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, hostProfileId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.shade}>
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>🏆 Daily gift rank{hostName ? ` — ${hostName}` : ''}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <X size={20} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sub}>Top gift senders today (Singapore time)</Text>
          {rows === null ? (
            <Text style={styles.empty}>Loading…</Text>
          ) : rows.length === 0 ? (
            <Text style={styles.empty}>No gifts today yet — be the first to send one! 🎁</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {rows.map((r) => (
                <View key={String(r.senderId)} style={styles.row}>
                  <Text style={styles.medal}>{MEDAL[r.rank] || `#${r.rank}`}</Text>
                  {r.avatar ? (
                    <Image source={{ uri: r.avatar }} style={styles.avatar} resizeMode="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarTxt}>{(r.name || '?')[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.main}>
                    <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                    <Text style={styles.id}>ID: {r.userId || '—'}</Text>
                  </View>
                  <Text style={styles.diamonds}>💎 {Number(r.diamonds || 0).toLocaleString()}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'flex-end' },
  card: { backgroundColor: '#241536', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', padding: 16 },
  head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 16, fontWeight: '900' },
  sub: { color: '#cdbcf0', fontSize: 12, fontWeight: '700', marginTop: 4 },
  empty: { color: '#cdbcf0', fontSize: 13, lineHeight: 18, paddingVertical: 18, textAlign: 'center' },
  list: { marginTop: 10 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 9 },
  medal: { fontSize: 18, textAlign: 'center', width: 30 },
  avatar: { borderRadius: 19, height: 38, width: 38 },
  avatarFallback: { alignItems: 'center', backgroundColor: '#7c3aed', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  main: { flex: 1 },
  name: { color: '#fff', fontSize: 14, fontWeight: '800' },
  id: { color: '#cdbcf0', fontSize: 11, fontWeight: '700', marginTop: 1 },
  diamonds: { color: '#ffe9a8', fontSize: 13, fontWeight: '900' },
});
