// Livo HostDashboardScreen — v2 (2026-11-18)
// Rebuilt from the web preview's Host Dashboard demo (livo-home-preview,
// section #hostDashSection): host নুসরাত জাহান, Host ID 205517, green
// Approved badge, big Online/Offline switch, today's earnings, the
// 5-tier Call Rate picker (60/120/300/600/1200), big pink Go Live,
// Imran's 1-to-1 call request, 7-day earnings chart, Withdraw.
//
// ── WIRING (2026-11-18) ─────────────────────────────────────────
// The Online/Offline switch and the Call Rate picker are now LIVE:
// they call setHostOnline / setHostRate in the shared store, so the
// Home card updates at once (Offline removes Nusrat's LIVE card,
// a new rate shows inside the live room). The follow-up the first
// version flagged is done.
// ─────────────────────────────────────────────────────────────────
// Withdraw: ProfileScreen's Earn beans → Withdraw view is internal
// state with no route-param support, so this button opens the Me
// tab (ProfileTab) with a toast pointing to My Income → Withdraw.
// Follow-up (one line in ProfileScreen): accept route.params
// { initialView: 'withdraw' } and open that view on mount.
// Go Live: opens the app's live room (VideoCallScreen) with the
// Nusrat host object, the same screen Home cards open. The host
// control view is that screen.
// Both host entries pass asHost: true, so the host skips the
// incoming stage and starts live at once. There is NO call
// summary screen at all (user 2026-11-18): after a call ends,
// everyone goes straight back — the host sees the earnings here
// in the dashboard.
// Imran's request says 100/min in the preview, but 100 is not one
// of the 5 admin tiers, so the accepted call bills at Tier 2
// (120 coins/min) — flagged in the handoff, not silently changed.
// All earnings/chart numbers are DEMO SAMPLES until Supabase,
// labelled on screen like the preview does.
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CALL_RATES, COLORS, getCallRate } from '../config';
import { useApp } from '../store';

// Imran's 1-to-1 request. He is not in HOSTS; the object carries
// the fields VideoCallScreen reads (name, flag, country, rateTier).
// See the header note: 100/min is not a tier, so this bills at
// Tier 2 (120/min) until the admin adds a 100 tier.
const IMRAN = {
  id: 'imran',
  name: 'Imran',
  flag: '🇧🇩',
  country: 'BGD',
  lang: 'Bengali',
  level: 1,
  rateTier: 'tier2',
  color: '#34d399',
  online: true,
};

const WEEK = [
  { day: 'শনি', coins: 8200, pct: 58 },
  { day: 'রবি', coins: 9650, pct: 69 },
  { day: 'সোম', coins: 7400, pct: 52 },
  { day: 'মঙ্গল', coins: 11300, pct: 82 },
  { day: 'বুধ', coins: 9880, pct: 71 },
  { day: 'আজ', coins: 12450, pct: 92, today: true },
  { day: 'শুক্র', coins: 10720, pct: 78 },
];

const CHART_H = 120;

export default function HostDashboardScreen({ navigation }) {
  const { showToast, hosts, setHostOnline, setHostRate } = useApp();
  // Nusrat is host id '2' (rateTier tier3 = 300/min, matching the
  // preview where 300 is the selected rate). Her online state and
  // rate come from the shared store, so Home updates at once.
  const nusrat = hosts.find((h) => h.id === '2') || hosts[0];
  const online = nusrat.online;
  const myTier = nusrat.rateTier;
  // 'pending' | 'accepted' | 'declined'
  const [reqState, setReqState] = useState('pending');

  const rate = getCallRate(myTier);

  const toggleOnline = () => {
    const next = !online;
    setHostOnline('2', next);
    showToast(
      next
        ? 'Online হয়েছো — Home-এ তোমার লাইভ দেখা যাচ্ছে'
        : 'Offline হয়েছো — Home থেকে তোমার লাইভ নেমে গেছে'
    );
  };

  const pickRate = (tierId) => {
    setHostRate('2', tierId);
    const r = getCallRate(tierId);
    showToast(`তোমার কল রেট এখন ${r.coinsPerMinute.toLocaleString('en-US')} coins/min`);
  };

  const goLive = () => {
    showToast('তুমি লাইভে আছো — এখান থেকে মাইক, ক্যামেরা আর বিউটি কন্ট্রোল করো');
    navigation.navigate('VideoCall', { host: nusrat, asHost: true });
  };

  const acceptRequest = () => {
    setReqState('accepted');
    showToast("Imran-এর কল রিকোয়েস্ট গ্রহণ করা হয়েছে");
    navigation.navigate('VideoCall', { host: IMRAN, asHost: true });
  };

  const declineRequest = () => {
    setReqState('declined');
    showToast("Imran-এর কল রিকোয়েস্ট বাতিল করা হয়েছে");
  };

  const openWithdraw = () => {
    showToast('Withdraw — Me-তে My Income খুলে Withdraw চাপো');
    navigation.navigate('Main', { screen: 'ProfileTab' });
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      {/* header */}
      <View style={styles.head}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Host Dashboard</Text>
        <View style={styles.headSpacer} />
      </View>

      {/* host profile */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <Image source={require('../../assets/host-nusrat.jpg')} style={styles.photo} />
          <View style={styles.profileText}>
            <Text style={styles.name}>নুসরাত জাহান</Text>
            <Text style={styles.hostId}>Host ID: 205517</Text>
            <View style={styles.approvedBadge}>
              <Text style={styles.approvedText}>✓ Approved</Text>
            </View>
          </View>
        </View>
      </View>

      {/* online / offline switch */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>{online ? 'তুমি এখন Online' : 'তুমি এখন Offline'}</Text>
            <Text style={styles.switchSub}>
              {online
                ? 'Home-এ তোমার লাইভ LIVE ব্যাজসহ দেখা যাচ্ছে'
                : 'তুমি লাইভ থেকে নেমে গেছো — Home-এ আর দেখা যাচ্ছে না'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchTrack, online && styles.switchOn]}
            onPress={toggleOnline}
            accessibilityRole="switch"
            accessibilityState={{ checked: online }}
            accessibilityLabel="Online বা Offline করো"
          >
            <View style={[styles.switchKnob, online ? styles.knobRight : styles.knobLeft]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* today's earnings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>আজকের আয়</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>🪙 12,450</Text>
            <Text style={styles.statLabel}>আজকের কয়েন আয়</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>💎 8,320</Text>
            <Text style={styles.statLabel}>Diamonds পেয়েছো</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>18</Text>
            <Text style={styles.statLabel}>আজকের কল</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>214</Text>
            <Text style={styles.statLabel}>মোট মিনিট (কলে)</Text>
          </View>
        </View>
      </View>

      {/* call rate */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Call Rate — প্রতি মিনিটে</Text>
        <View style={styles.ratesRow}>
          {CALL_RATES.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.rateBtn, myTier === r.id && styles.rateBtnSel]}
              onPress={() => pickRate(r.id)}
            >
              <Text style={[styles.rateNum, myTier === r.id && styles.rateNumSel]}>
                {r.coinsPerMinute}
              </Text>
              <Text style={[styles.rateUnit, myTier === r.id && styles.rateNumSel]}>coins/min</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.rateNote}>
          এখন তোমার রেট: <Text style={styles.bold}>{rate.coinsPerMinute} coins/min</Text> — যেকোনো একটায়
          চাপ দিলেই সেটাই তোমার নতুন কল রেট হয়ে যাবে।
        </Text>
      </View>

      {/* go live */}
      <TouchableOpacity style={styles.goLiveBtn} onPress={goLive}>
        <Text style={styles.goLiveText}>🎥  Go Live</Text>
      </TouchableOpacity>

      {/* 1-to-1 call request */}
      {reqState !== 'declined' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1-to-1 কল রিকোয়েস্ট</Text>
          <View style={styles.reqRow}>
            <View style={styles.reqAva}>
              <Text style={styles.reqAvaText}>I</Text>
            </View>
            <View>
              <Text style={styles.reqName}>Imran</Text>
              <Text style={styles.reqSub}>প্রাইভেট ভিডিও কল · 100/min</Text>
            </View>
          </View>
          {reqState === 'pending' ? (
            <View style={styles.reqBtns}>
              <TouchableOpacity style={styles.reqOk} onPress={acceptRequest}>
                <Text style={styles.reqOkText}>গ্রহণ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reqNo} onPress={declineRequest}>
                <Text style={styles.reqNoText}>বাতিল</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.reqDone}>Imran-এর সাথে 1-to-1 কল চলছে · 100/min</Text>
          )}
        </View>
      )}

      {/* weekly earnings chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>এই সপ্তাহের আয় (কয়েন)</Text>
        <View style={styles.chart}>
          {WEEK.map((d) => (
            <View key={d.day} style={styles.barCol}>
              <Text style={[styles.barVal, d.today && styles.barValToday]}>
                {d.coins.toLocaleString('en-US')}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.round((CHART_H * d.pct) / 100) },
                    d.today && styles.barToday,
                  ]}
                />
              </View>
              <Text style={[styles.barDay, d.today && styles.barDayToday]}>{d.day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* withdraw */}
      <TouchableOpacity style={styles.withdrawBtn} onPress={openWithdraw}>
        <Text style={styles.withdrawText}>🪙  Withdraw — টাকা তোলো</Text>
      </TouchableOpacity>
      <Text style={styles.demoNote}>সব সংখ্যা ডেমো স্যাম্পল — আসল ডেটা পরে Supabase থেকে আসবে।</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  approvedBadge: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 3 },
  approvedText: { color: '#15803d', fontSize: 12, fontWeight: 'bold' },
  back: { color: COLORS.dark, fontSize: 32, fontWeight: 'bold', lineHeight: 34, width: 28 },
  bar: { backgroundColor: '#c4b5fd', borderRadius: 4, width: '100%' },
  barCol: { alignItems: 'center', flex: 1 },
  barDay: { color: COLORS.grey, fontSize: 11, marginTop: 6 },
  barDayToday: { color: COLORS.pink, fontWeight: 'bold' },
  barToday: { backgroundColor: COLORS.pink },
  barTrack: { height: CHART_H, justifyContent: 'flex-end', width: '62%' },
  barVal: { color: COLORS.grey, fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  barValToday: { color: COLORS.pink },
  bg: { backgroundColor: '#faf5ff', flex: 1 },
  bold: { fontWeight: 'bold' },
  card: { backgroundColor: '#fff', borderRadius: 16, elevation: 1, marginTop: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  chart: { alignItems: 'flex-end', flexDirection: 'row' },
  demoNote: { color: COLORS.grey, fontSize: 12, marginBottom: 8, marginTop: 12, textAlign: 'center' },
  goLiveBtn: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 16, elevation: 2, marginTop: 16, paddingVertical: 16 },
  goLiveText: { color: '#fff', fontSize: 19, fontWeight: 'bold' },
  head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  headSpacer: { width: 28 },
  hostId: { color: COLORS.grey, fontSize: 13, marginTop: 2 },
  knobLeft: { alignSelf: 'flex-start' },
  knobRight: { alignSelf: 'flex-end' },
  name: { fontSize: 19, fontWeight: 'bold' },
  photo: { borderRadius: 32, height: 64, width: 64 },
  profileRow: { alignItems: 'center', flexDirection: 'row' },
  profileText: { flex: 1, marginLeft: 14 },
  rateBtn: { alignItems: 'center', backgroundColor: '#f5f3ff', borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  rateBtnSel: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  rateNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19, marginTop: 10 },
  rateNum: { color: COLORS.dark, fontSize: 16, fontWeight: 'bold' },
  rateNumSel: { color: '#fff' },
  rateUnit: { color: COLORS.grey, fontSize: 10, marginTop: 2 },
  ratesRow: { flexDirection: 'row', marginHorizontal: -3 },
  reqAva: { alignItems: 'center', backgroundColor: '#34d399', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  reqAvaText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  reqBtns: { flexDirection: 'row', marginTop: 12 },
  reqDone: { color: COLORS.green, fontSize: 14, fontWeight: 'bold', marginTop: 12 },
  reqName: { fontSize: 16, fontWeight: 'bold' },
  reqNo: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 12, flex: 1, marginLeft: 6, paddingVertical: 12 },
  reqNoText: { color: '#b91c1c', fontWeight: 'bold' },
  reqOk: { alignItems: 'center', backgroundColor: COLORS.green, borderRadius: 12, flex: 1, marginRight: 6, paddingVertical: 12 },
  reqOkText: { color: '#fff', fontWeight: 'bold' },
  reqRow: { alignItems: 'center', flexDirection: 'row' },
  reqSub: { color: COLORS.grey, fontSize: 13, marginTop: 2 },
  stat: { marginBottom: 12, width: '50%' },
  statLabel: { color: COLORS.grey, fontSize: 12, marginTop: 2 },
  statValue: { fontSize: 19, fontWeight: 'bold' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  switchKnob: { backgroundColor: '#fff', borderRadius: 13, elevation: 2, height: 26, width: 26 },
  switchOn: { backgroundColor: COLORS.green },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchSub: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 4 },
  switchText: { flex: 1, paddingRight: 12 },
  switchTitle: { fontSize: 16, fontWeight: 'bold' },
  switchTrack: { backgroundColor: '#d1d5db', borderRadius: 17, height: 34, justifyContent: 'center', paddingHorizontal: 4, width: 60 },
  title: { fontSize: 21, fontWeight: 'bold' },
  withdrawBtn: { alignItems: 'center', backgroundColor: '#f59e0b', borderRadius: 16, elevation: 2, marginTop: 16, paddingVertical: 15 },
  withdrawText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  wrap: { padding: 16, paddingBottom: 32, paddingTop: 48 },
});
