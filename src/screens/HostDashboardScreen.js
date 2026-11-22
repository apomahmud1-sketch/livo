// Livo HostDashboardScreen — v3 (2026-11-22)
// REAL host dashboard: earnings come from the calls + transactions
// rows of the signed-in host, withdraw inserts a Pending row into
// withdrawals, and the Online switch + Call Rate picker persist to
// the hosts table (see src/supabase/host.js). No demo numbers
// anywhere on this screen — when there are no calls yet, the
// numbers are honestly 0.
//
// The signed-in user comes from supabase.auth.getUser(); user.id
// equals profiles.id. With no session the screen prompts login
// instead of showing anyone else's data. A host row is created on
// demand with status 'pending' — only the Mother Panel / an admin
// can approve it, so a pending host sees "Approval Pending" and
// cannot go live until then.
//
// Online presence: toggling Online sets hosts.is_online + a
// last_seen heartbeat every 30s (stops on toggle-off / unmount).
// Home treats a host as online only while the heartbeat is fresh.
//
// There is NO call summary screen (user 2026-11-18): after a call
// ends everyone goes straight back — the host sees the earnings
// here. The old demo "Imran" 1-to-1 request card is gone: it was
// a fabricated caller with no backend behind it. Real incoming
// call requests need a requests backend (not built yet).
import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
import {
  ensureHostRow,
  fetchHostEarnings,
  fetchMyWithdrawals,
  fetchWithdrawnDiamonds,
  getCurrentUser,
  getMyProfile,
  requestWithdrawal,
  setHostOnline,
  setHostRateTier,
  startHostHeartbeat,
  stopHostHeartbeat,
} from '../supabase/host';

const CHART_H = 120;
const WITHDRAW_METHODS = ['Bkash', 'Nagad', 'Bank'];

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export default function HostDashboardScreen({ navigation }) {
  const { showToast, hosts, setHostOnline: setStoreHostOnline, setHostRate: setStoreHostRate, callRates, getLiveCallRate } = useApp();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hostRow, setHostRow] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawnTotal, setWithdrawnTotal] = useState(0);
  const [online, setOnline] = useState(false);
  const [myTier, setMyTier] = useState('tier2');
  // Withdraw form.
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bkash');
  const [account, setAccount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const hostRowRef = useRef(null);
  hostRowRef.current = hostRow;

  const approved = hostRow && hostRow.status === 'approved';
  // Store host with the same host_id, so Home updates at once when
  // this host toggles online / changes rate in this session.
  const storeHost = hostRow ? hosts.find((h) => String(h.id) === String(hostRow.host_id)) : null;
  const rate = getLiveCallRate(myTier);
  const availableDiamonds = Math.max(0, (earnings ? earnings.totalDiamonds : 0) - withdrawnTotal);
  const weekMax = earnings ? Math.max(1, ...earnings.week.map((d) => d.coins)) : 1;

  // Load the signed-in host's real data once, on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(u);
      const [prof, row] = await Promise.all([getMyProfile(u.id), ensureHostRow(u)]);
      if (cancelled) return;
      setProfile(prof);
      setHostRow(row);
      if (row) {
        setOnline(!!row.is_online);
        setMyTier(row.rate_tier || 'tier2');
        if (row.is_online && row.status === 'approved') startHostHeartbeat(row.id);
        const [earn, wds, withdrawn] = await Promise.all([
          fetchHostEarnings(row.id, u.id),
          fetchMyWithdrawals(row.id),
          fetchWithdrawnDiamonds(row.id),
        ]);
        if (cancelled) return;
        setEarnings(earn);
        setWithdrawals(wds);
        setWithdrawnTotal(withdrawn);
      } else {
        setEarnings({
          todayCoins: 0, todayDiamonds: 0, todayCalls: 0, todayMinutes: 0,
          totalCoins: 0, totalDiamonds: 0, totalCalls: 0, totalMinutes: 0, week: [],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      // Deliberately NOT stopping the heartbeat here: leaving the
      // dashboard (e.g. Go Live) must not mark the host offline.
      // The toggle-off path stops it with markOffline=true.
    };
  }, []);

  const refreshMoney = async () => {
    const row = hostRowRef.current;
    if (!row || !user) return;
    const [earn, wds, withdrawn] = await Promise.all([
      fetchHostEarnings(row.id, user.id),
      fetchMyWithdrawals(row.id),
      fetchWithdrawnDiamonds(row.id),
    ]);
    setEarnings(earn);
    setWithdrawals(wds);
    setWithdrawnTotal(withdrawn);
  };

  const toggleOnline = async () => {
    if (!hostRow) return;
    if (!approved) {
      showToast('এখনো approve হয়নি — প্যানেল থেকে approve হলে লাইভে যেতে পারবে');
      return;
    }
    const next = !online;
    setOnline(next);
    const ok = await setHostOnline(hostRow.id, next);
    if (!ok) {
      setOnline(!next);
      showToast('Online অবস্থা সেভ হয়নি — আবার চেষ্টা করো');
      return;
    }
    if (next) startHostHeartbeat(hostRow.id);
    else stopHostHeartbeat(true);
    if (storeHost) setStoreHostOnline(storeHost.id, next);
    showToast(
      next
        ? 'Online হয়েছো — Home-এ তোমার লাইভ দেখা যাচ্ছে'
        : 'Offline হয়েছো — Home থেকে তোমার লাইভ নেমে গেছে'
    );
  };

  const pickRate = async (tierId) => {
    if (!hostRow) return;
    setMyTier(tierId);
    const ok = await setHostRateTier(hostRow.id, tierId);
    if (!ok) {
      showToast('রেট সেভ হয়নি — আবার চেষ্টা করো');
      return;
    }
    if (storeHost) setStoreHostRate(storeHost.id, tierId);
    const r = getLiveCallRate(tierId);
    showToast(`তোমার কল রেট এখন ${fmt(r.coinsPerMinute)} coins/min`);
  };

  const goLive = () => {
    if (!approved) {
      showToast('এখনো approve হয়নি — প্যানেল থেকে approve হলে লাইভে যেতে পারবে');
      return;
    }
    showToast('তুমি লাইভে আছো — এখান থেকে মাইক, ক্যামেরা আর বিউটি কন্ট্রোল করো');
    const host = storeHost || {
      id: hostRow.host_id,
      name: (profile && profile.username) || 'Host',
      rateTier: myTier,
      online: true,
      color: '#f472b6',
      country: 'BGD',
      flag: '🇧🇩',
      lang: 'English',
      level: 1,
      gender: 'female',
    };
    navigation.navigate('VideoCall', { host, asHost: true });
  };

  const doWithdraw = async () => {
    if (!hostRow || withdrawing) return;
    const diamonds = Math.floor(Number(amount) || 0);
    if (diamonds <= 0) {
      showToast('কত Diamond তুলবে সেটা লেখো');
      return;
    }
    if (diamonds > availableDiamonds) {
      showToast(`তোমার কাছে ${fmt(availableDiamonds)} Diamond আছে — এর বেশি তোলা যাবে না`);
      return;
    }
    if (!account.trim()) {
      showToast('টাকা পাঠানোর অ্যাকাউন্ট নম্বর লেখো');
      return;
    }
    setWithdrawing(true);
    const res = await requestWithdrawal(hostRow.id, { amountDiamonds: diamonds, method, account });
    setWithdrawing(false);
    if (!res.ok) {
      showToast('Withdraw জমা হয়নি — আবার চেষ্টা করো');
      return;
    }
    setAmount('');
    setAccount('');
    await refreshMoney();
    showToast(`Withdraw জমা হয়েছে — ${fmt(diamonds)} Diamond, ${method} (Pending)`);
  };

  if (loading) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.loadingText}>লোড হচ্ছে…</Text>
      </View>
    );
  }

  // No session: prompt login, never fake data.
  if (!user) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.loginTitle}>লগইন করো</Text>
        <Text style={styles.loginSub}>Host Dashboard দেখতে আগে লগইন করতে হবে।</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginBtnText}>লগইন করো</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayName = (profile && profile.username) || (user.email ? String(user.email).split('@')[0] : 'Host');
  const initial = String(displayName).charAt(0).toUpperCase() || 'H';

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

      {/* host profile — the signed-in host, never a hardcoded host */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          {profile && profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoInitial]}>
              <Text style={styles.photoInitialText}>{initial}</Text>
            </View>
          )}
          <View style={styles.profileText}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.hostId}>Host ID: {hostRow ? hostRow.host_id : '—'}</Text>
            {approved ? (
              <View style={styles.approvedBadge}>
                <Text style={styles.approvedText}>✓ Approved</Text>
              </View>
            ) : (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>⏳ Approval Pending</Text>
              </View>
            )}
          </View>
        </View>
        {!approved && (
          <Text style={styles.pendingNote}>
            তোমার host অ্যাকাউন্ট এখনো approve হয়নি — Mother Panel থেকে approve হলে লাইভে যেতে পারবে।
          </Text>
        )}
      </View>

      {/* online / offline switch — persisted to the hosts table */}
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
            style={[styles.switchTrack, online && styles.switchOn, !approved && styles.switchDisabled]}
            onPress={toggleOnline}
            accessibilityRole="switch"
            accessibilityState={{ checked: online }}
            accessibilityLabel="Online বা Offline করো"
          >
            <View style={[styles.switchKnob, online ? styles.knobRight : styles.knobLeft]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* today's earnings — real calls + transactions rows */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>আজকের আয়</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>🪙 {fmt(earnings ? earnings.todayCoins : 0)}</Text>
            <Text style={styles.statLabel}>আজকের কয়েন আয়</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>💎 {fmt(earnings ? earnings.todayDiamonds : 0)}</Text>
            <Text style={styles.statLabel}>Diamonds পেয়েছো</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(earnings ? earnings.todayCalls : 0)}</Text>
            <Text style={styles.statLabel}>আজকের কল</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(earnings ? earnings.todayMinutes : 0)}</Text>
            <Text style={styles.statLabel}>মোট মিনিট (কলে)</Text>
          </View>
        </View>
        <Text style={styles.totalNote}>
          মোট আয়: 🪙 {fmt(earnings ? earnings.totalCoins : 0)} কয়েন · 💎{' '}
          {fmt(earnings ? earnings.totalDiamonds : 0)} Diamond · {fmt(earnings ? earnings.totalCalls : 0)} কল
        </Text>
      </View>

      {/* call rate — persisted to the hosts table */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Call Rate — প্রতি মিনিটে</Text>
        <View style={styles.ratesRow}>
          {callRates.map((r) => (
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
          এখন তোমার রেট: <Text style={styles.bold}>{fmt(rate.coinsPerMinute)} coins/min</Text> — যেকোনো একটায়
          চাপ দিলেই সেটাই তোমার নতুন কল রেট হয়ে যাবে।
        </Text>
      </View>

      {/* go live */}
      <TouchableOpacity
        style={[styles.goLiveBtn, !approved && styles.goLiveDisabled]}
        onPress={goLive}
      >
        <Text style={styles.goLiveText}>🎥  Go Live</Text>
      </TouchableOpacity>

      {/* weekly earnings chart — real calls rows, last 7 days */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>এই সপ্তাহের আয় (কয়েন)</Text>
        {earnings && earnings.week.length > 0 ? (
          <View style={styles.chart}>
            {earnings.week.map((d) => (
              <View key={d.key} style={styles.barCol}>
                <Text style={[styles.barVal, d.key === earnings.week[6].key && styles.barValToday]}>
                  {fmt(d.coins)}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: d.coins > 0 ? Math.max(4, Math.round((CHART_H * d.coins) / weekMax)) : 2 },
                      d.key === earnings.week[6].key && styles.barToday,
                    ]}
                  />
                </View>
                <Text style={[styles.barDay, d.key === earnings.week[6].key && styles.barDayToday]}>{d.day}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>এখনো কোনো কল হয়নি — প্রথম কল হলেই এখানে আয় দেখা যাবে।</Text>
        )}
      </View>

      {/* withdraw — real Pending row in the withdrawals table */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Withdraw — টাকা তোলো</Text>
        <Text style={styles.balanceNote}>
          তোলা যাবে: 💎 <Text style={styles.bold}>{fmt(availableDiamonds)}</Text> Diamond
        </Text>
        <Text style={styles.fieldLabel}>কত Diamond তুলবে?</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="যেমন: 1000"
          placeholderTextColor={COLORS.grey}
        />
        <Text style={styles.fieldLabel}>কীভাবে পেতে চাও?</Text>
        <View style={styles.methodsRow}>
          {WITHDRAW_METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.methodBtn, method === m && styles.methodBtnSel]}
              onPress={() => setMethod(m)}
            >
              <Text style={[styles.methodText, method === m && styles.methodTextSel]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>অ্যাকাউন্ট নম্বর</Text>
        <TextInput
          style={styles.input}
          value={account}
          onChangeText={setAccount}
          keyboardType="default"
          placeholder="Bkash / Nagad / ব্যাংক অ্যাকাউন্ট নম্বর"
          placeholderTextColor={COLORS.grey}
        />
        <TouchableOpacity
          style={[styles.withdrawBtn, withdrawing && styles.withdrawDisabled]}
          onPress={doWithdraw}
          disabled={withdrawing}
        >
          <Text style={styles.withdrawText}>{withdrawing ? 'জমা হচ্ছে…' : '🪙  Withdraw জমা দাও'}</Text>
        </TouchableOpacity>
        <Text style={styles.withdrawNote}>
          জমা দিলে স্ট্যাটাস Pending থাকবে — অ্যাডমিন টাকা পাঠিয়ে approve করবে।
        </Text>
        {withdrawals.length > 0 && (
          <View style={styles.historyWrap}>
            <Text style={styles.historyTitle}>আগের Withdraw</Text>
            {withdrawals.map((w) => (
              <View key={w.id} style={styles.historyRow}>
                <Text style={styles.historyMain}>
                  💎 {fmt(w.amount_diamonds)} · {w.method}
                </Text>
                <Text style={[styles.historyStatus, String(w.status).toLowerCase() === 'pending' && styles.historyPending]}>
                  {w.status}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  approvedBadge: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 3 },
  approvedText: { color: '#15803d', fontSize: 12, fontWeight: 'bold' },
  back: { color: COLORS.dark, fontSize: 32, fontWeight: 'bold', lineHeight: 34, width: 28 },
  balanceNote: { color: COLORS.dark, fontSize: 15, marginBottom: 12 },
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
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  chart: { alignItems: 'flex-end', flexDirection: 'row' },
  emptyNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: COLORS.dark, fontSize: 13, fontWeight: 'bold', marginBottom: 6, marginTop: 10 },
  goLiveBtn: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 16, elevation: 2, marginTop: 16, paddingVertical: 16 },
  goLiveDisabled: { opacity: 0.5 },
  goLiveText: { color: '#fff', fontSize: 19, fontWeight: 'bold' },
  head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  headSpacer: { width: 28 },
  historyMain: { fontSize: 14, fontWeight: 'bold' },
  historyPending: { color: '#b45309' },
  historyRow: { alignItems: 'center', borderTopColor: COLORS.lightGrey, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  historyStatus: { color: COLORS.grey, fontSize: 13, fontWeight: 'bold' },
  historyTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  historyWrap: { marginTop: 16 },
  hostId: { color: COLORS.grey, fontSize: 13, marginTop: 2 },
  input: { borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, color: COLORS.dark, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 },
  knobLeft: { alignSelf: 'flex-start' },
  knobRight: { alignSelf: 'flex-end' },
  loadingText: { color: COLORS.grey, fontSize: 16 },
  loginBtn: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 16, marginTop: 20, paddingHorizontal: 32, paddingVertical: 14 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  loginSub: { color: COLORS.grey, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  loginTitle: { fontSize: 22, fontWeight: 'bold' },
  methodBtn: { alignItems: 'center', backgroundColor: '#f5f3ff', borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  methodBtnSel: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  methodText: { color: COLORS.dark, fontSize: 14, fontWeight: 'bold' },
  methodTextSel: { color: '#fff' },
  methodsRow: { flexDirection: 'row', marginHorizontal: -3 },
  name: { fontSize: 19, fontWeight: 'bold' },
  pendingBadge: { alignSelf: 'flex-start', backgroundColor: '#fef3c7', borderRadius: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 3 },
  pendingNote: { color: '#92400e', fontSize: 13, lineHeight: 19, marginTop: 12 },
  pendingText: { color: '#92400e', fontSize: 12, fontWeight: 'bold' },
  photo: { borderRadius: 32, height: 64, width: 64 },
  photoInitial: { alignItems: 'center', backgroundColor: '#f472b6', justifyContent: 'center' },
  photoInitialText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  profileRow: { alignItems: 'center', flexDirection: 'row' },
  profileText: { flex: 1, marginLeft: 14 },
  rateBtn: { alignItems: 'center', backgroundColor: '#f5f3ff', borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  rateBtnSel: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  rateNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19, marginTop: 10 },
  rateNum: { color: COLORS.dark, fontSize: 16, fontWeight: 'bold' },
  rateNumSel: { color: '#fff' },
  rateUnit: { color: COLORS.grey, fontSize: 10, marginTop: 2 },
  ratesRow: { flexDirection: 'row', marginHorizontal: -3 },
  stat: { marginBottom: 12, width: '50%' },
  statLabel: { color: COLORS.grey, fontSize: 12, marginTop: 2 },
  statValue: { fontSize: 19, fontWeight: 'bold' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  switchDisabled: { opacity: 0.5 },
  switchKnob: { backgroundColor: '#fff', borderRadius: 13, elevation: 2, height: 26, width: 26 },
  switchOn: { backgroundColor: COLORS.green },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchSub: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 4 },
  switchText: { flex: 1, paddingRight: 12 },
  switchTitle: { fontSize: 16, fontWeight: 'bold' },
  switchTrack: { backgroundColor: '#d1d5db', borderRadius: 17, height: 34, justifyContent: 'center', paddingHorizontal: 4, width: 60 },
  title: { fontSize: 21, fontWeight: 'bold' },
  totalNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19, marginTop: 4 },
  withdrawBtn: { alignItems: 'center', backgroundColor: '#f59e0b', borderRadius: 16, elevation: 2, marginTop: 16, paddingVertical: 15 },
  withdrawDisabled: { opacity: 0.6 },
  withdrawNote: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  withdrawText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  wrap: { padding: 16, paddingBottom: 32, paddingTop: 48 },
});
