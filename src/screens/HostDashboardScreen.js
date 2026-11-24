// Livo HostDashboardScreen — v3 (2026-11-22)
// REAL host dashboard: earnings come from the calls + transactions
// rows of the signed-in host, withdraw inserts a Pending row into
// withdrawals, and the Online switch + Call Rate picker persist to
// the hosts table (see src/supabase/host.js). No demo numbers
// anywhere on this screen — when there are no calls yet, the
// numbers are honestly 0.
//
// The signed-in user comes from the local session via
// getSessionUser() (src/supabase/auth.js); user.id
// equals profiles.id. With no session the screen prompts login
// instead of showing anyone else's data. A host row is created
// ONLY when the user taps "Apply to Become a Host" on this screen
// — opening the dashboard no longer creates one on its own. The
// new row has status 'pending' — only the Mother Panel / an admin
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
import { COLORS, MIN_WITHDRAW_DIAMONDS, WITHDRAW_METHODS } from '../config';
import { useApp } from '../store';
import { fetchMyProfile } from '../supabase/auth';
import {
  ensureHostRow,
  fetchHostEarnings,
  fetchMyWithdrawals,
  getCurrentUser,
  getMyHostRow,
  getMyProfile,
  requestWithdrawal,
  setHostOnline,
  setHostRateTier,
  startHostHeartbeat,
  stopHostHeartbeat,
} from '../supabase/host';

const CHART_H = 120;

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

export default function HostDashboardScreen({ navigation }) {
  const { showToast, hosts, setHostOnline: setStoreHostOnline, setHostRate: setStoreHostRate, callRates, getLiveCallRate, diamonds } = useApp();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hostRow, setHostRow] = useState(null);
  const [applying, setApplying] = useState(false);
  const [earnings, setEarnings] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [online, setOnline] = useState(false);
  const [myTier, setMyTier] = useState('tier2');
  // Withdraw form.
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(WITHDRAW_METHODS[0]);
  const [account, setAccount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const hostRowRef = useRef(null);
  hostRowRef.current = hostRow;

  const approved = hostRow && hostRow.status === 'approved';
  // Go Live is for female hosts only (profiles.gender). A missing
  // or non-female gender hides/disables it — never guessed.
  const isFemale = String((profile && profile.gender) || '').toLowerCase() === 'female';
  // Store host with the same host_id, so Home updates at once when
  // this host toggles online / changes rate in this session.
  const storeHost = hostRow ? hosts.find((h) => String(h.id) === String(hostRow.host_id)) : null;
  const rate = getLiveCallRate(myTier);
  // Available balance: the signed-in user's real profiles.diamonds
  // (store) MINUS pending withdrawals — paid-out ones already left
  // the balance, rejected/cancelled ones are free again.
  const pendingWithdrawals = withdrawals.reduce((sum, w) => (
    String(w.status || '').toLowerCase() === 'pending'
      ? sum + (Number(w.amount_diamonds) || 0)
      : sum
  ), 0);
  const availableDiamonds = Math.max(0, (diamonds || 0) - pendingWithdrawals);
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
      // getMyProfile (host.js) does not select gender/country, so
      // merge the auth.js profile row (which does) for the Go Live
      // gender gate and any other real profile values.
      // Read-only check on mount: the host row is created ONLY by
      // the Apply button below, never automatically on opening this
      // screen.
      const [prof, row, authProf] = await Promise.all([
        getMyProfile(u.id),
        getMyHostRow(u.id),
        fetchMyProfile(u.id),
      ]);
      if (cancelled) return;
      setProfile({ ...(prof || {}), ...((authProf && authProf.profile) || {}) });
      setHostRow(row);
      if (row) {
        setOnline(!!row.is_online);
        setMyTier(row.rate_tier || 'tier2');
        if (row.is_online && row.status === 'approved') startHostHeartbeat(row.id);
        const [earn, wds] = await Promise.all([
          fetchHostEarnings(row.id, u.id),
          fetchMyWithdrawals(row.id),
        ]);
        if (cancelled) return;
        setEarnings(earn);
        setWithdrawals(wds);
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
    const [earn, wds] = await Promise.all([
      fetchHostEarnings(row.id, user.id),
      fetchMyWithdrawals(row.id),
    ]);
    setEarnings(earn);
    setWithdrawals(wds);
  };

  // Explicit Apply step: the only way a host row gets created.
  // The new row has status 'pending'; the Mother Panel approves it.
  const applyToBecomeHost = async () => {
    if (!user || applying) return;
    setApplying(true);
    const row = await ensureHostRow(user);
    setApplying(false);
    if (!row) {
      showToast('Apply was not submitted — please try again');
      return;
    }
    setHostRow(row);
    setOnline(!!row.is_online);
    setMyTier(row.rate_tier || 'tier2');
    setEarnings({
      todayCoins: 0, todayDiamonds: 0, todayCalls: 0, todayMinutes: 0,
      totalCoins: 0, totalDiamonds: 0, totalCalls: 0, totalMinutes: 0, week: [],
    });
    showToast('Application sent — the Mother Panel will review it');
  };

  const toggleOnline = async () => {
    if (!hostRow) return;
    if (!approved) {
      showToast('Not approved yet — you can go live once the panel approves you');
      return;
    }
    const next = !online;
    setOnline(next);
    const ok = await setHostOnline(hostRow.id, next);
    if (!ok) {
      setOnline(!next);
      showToast('Online status was not saved — please try again');
      return;
    }
    if (next) startHostHeartbeat(hostRow.id);
    else stopHostHeartbeat(true);
    if (storeHost) setStoreHostOnline(storeHost.id, next);
    showToast(
      next
        ? "You're online — your live is now showing on Home"
        : "You're offline — your live is no longer on Home"
    );
  };

  const pickRate = async (tierId) => {
    if (!hostRow) return;
    setMyTier(tierId);
    const ok = await setHostRateTier(hostRow.id, tierId);
    if (!ok) {
      showToast('Rate was not saved — please try again');
      return;
    }
    if (storeHost) setStoreHostRate(storeHost.id, tierId);
    const r = getLiveCallRate(tierId);
    showToast(`Your call rate is now ${fmt(r.coinsPerMinute)} coins/min`);
  };

  const goLive = () => {
    if (!approved) {
      showToast('Not approved yet — you can go live once the panel approves you');
      return;
    }
    if (!isFemale) {
      showToast('Go Live is only for female hosts');
      return;
    }
    if (!storeHost) {
      showToast('Your host profile has not loaded yet — please try again in a moment');
      return;
    }
    showToast("You're live — control your mic, camera and beauty settings from here");
    navigation.navigate('VideoCall', { host: storeHost, asHost: true });
  };

  const doWithdraw = async () => {
    if (!hostRow || withdrawing) return;
    const diamonds = Math.floor(Number(amount) || 0);
    if (diamonds <= 0) {
      showToast('Enter how many Diamonds to withdraw');
      return;
    }
    if (diamonds < MIN_WITHDRAW_DIAMONDS) {
      showToast(`You need to withdraw at least ${fmt(MIN_WITHDRAW_DIAMONDS)} Diamonds`);
      return;
    }
    if (diamonds > availableDiamonds) {
      showToast(`You have ${fmt(availableDiamonds)} Diamonds — you can't withdraw more than that`);
      return;
    }
    if (!account.trim()) {
      showToast('Enter the account number to receive the money');
      return;
    }
    setWithdrawing(true);
    const res = await requestWithdrawal(hostRow.id, { amountDiamonds: diamonds, method, account });
    setWithdrawing(false);
    if (!res.ok) {
      showToast('Withdraw was not submitted — please try again');
      return;
    }
    setAmount('');
    setAccount('');
    await refreshMoney();
    showToast(`Withdraw submitted — ${fmt(diamonds)} Diamonds, ${method} (Pending)`);
  };

  if (loading) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  // No session: prompt login, never fake data.
  if (!user) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.loginTitle}>Sign in</Text>
        <Text style={styles.loginSub}>Please sign in to see the Host Dashboard.</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No host row yet: explicit Apply step. Nothing is created
  // until the user taps Apply.
  if (!hostRow) {
    return (
      <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Host Dashboard</Text>
          <View style={styles.headSpacer} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Become a Host</Text>
          <Text style={styles.applyText}>
            Earn coins from video calls. Tap Apply and the Mother Panel will review your application — you can
            go live once it is approved. Go Live is for female hosts only.
          </Text>
          <TouchableOpacity
            style={[styles.goLiveBtn, applying && styles.goLiveDisabled]}
            onPress={applyToBecomeHost}
            disabled={applying}
          >
            <Text style={styles.goLiveText}>{applying ? 'Applying…' : '📝  Apply to Become a Host'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
            Your host account is not approved yet — you can go live once the Mother Panel approves it.
          </Text>
        )}
      </View>

      {/* online / offline switch — persisted to the hosts table */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>{online ? "You're Online" : "You're Offline"}</Text>
            <Text style={styles.switchSub}>
              {online
                ? 'Your live is showing on Home with the LIVE badge'
                : "You've gone off live — you're no longer showing on Home"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchTrack, online && styles.switchOn, !approved && styles.switchDisabled]}
            onPress={toggleOnline}
            accessibilityRole="switch"
            accessibilityState={{ checked: online }}
            accessibilityLabel="Go online or offline"
          >
            <View style={[styles.switchKnob, online ? styles.knobRight : styles.knobLeft]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* today's earnings — real calls + transactions rows */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's earnings</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>🪙 {fmt(earnings ? earnings.todayCoins : 0)}</Text>
            <Text style={styles.statLabel}>Coins earned today</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>💎 {fmt(earnings ? earnings.todayDiamonds : 0)}</Text>
            <Text style={styles.statLabel}>Diamonds earned</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(earnings ? earnings.todayCalls : 0)}</Text>
            <Text style={styles.statLabel}>Calls today</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(earnings ? earnings.todayMinutes : 0)}</Text>
            <Text style={styles.statLabel}>Total minutes (on calls)</Text>
          </View>
        </View>
        <Text style={styles.totalNote}>
          Total earnings: 🪙 {fmt(earnings ? earnings.totalCoins : 0)} coins · 💎{' '}
          {fmt(earnings ? earnings.totalDiamonds : 0)} Diamonds · {fmt(earnings ? earnings.totalCalls : 0)} calls
        </Text>
      </View>

      {/* call rate — persisted to the hosts table */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Call Rate — per minute</Text>
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
          Your current rate: <Text style={styles.bold}>{fmt(rate.coinsPerMinute)} coins/min</Text> — tap any rate to make it your new call rate.
        </Text>
      </View>

      {/* go live — female hosts only; hidden/disabled otherwise */}
      <TouchableOpacity
        style={[styles.goLiveBtn, (!approved || !isFemale) && styles.goLiveDisabled]}
        onPress={goLive}
        disabled={!approved || !isFemale}
      >
        <Text style={styles.goLiveText}>🎥  Go Live</Text>
      </TouchableOpacity>
      {approved && !isFemale ? (
        <Text style={styles.goLiveNote}>Go Live is only for female hosts — your profile gender is not set or is not female.</Text>
      ) : null}

      {/* weekly earnings chart — real calls rows, last 7 days */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>This week’s earnings (coins)</Text>
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
          <Text style={styles.emptyNote}>No calls yet — your earnings will show here after your first call.</Text>
        )}
      </View>

      {/* withdraw — real Pending row in the withdrawals table */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Withdraw — cash out</Text>
        <Text style={styles.balanceNote}>
          Available to withdraw: 💎 <Text style={styles.bold}>{fmt(availableDiamonds)}</Text> Diamonds
        </Text>
        <Text style={styles.fieldLabel}>How many Diamonds to withdraw?</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="e.g. 1000"
          placeholderTextColor={COLORS.grey}
        />
        <Text style={styles.fieldLabel}>How do you want to receive it?</Text>
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
        <Text style={styles.fieldLabel}>Account number</Text>
        <TextInput
          style={styles.input}
          value={account}
          onChangeText={setAccount}
          keyboardType="default"
          placeholder="bKash / Nagad / bank account number"
          placeholderTextColor={COLORS.grey}
        />
        <TouchableOpacity
          style={[styles.withdrawBtn, withdrawing && styles.withdrawDisabled]}
          onPress={doWithdraw}
          disabled={withdrawing}
        >
          <Text style={styles.withdrawText}>{withdrawing ? 'Submitting…' : '🪙  Submit withdraw'}</Text>
        </TouchableOpacity>
        <Text style={styles.withdrawNote}>
          After submitting, the status stays Pending — the admin will send the money and approve it. You need to withdraw at least {fmt(MIN_WITHDRAW_DIAMONDS)} Diamonds.
        </Text>
        {withdrawals.length > 0 && (
          <View style={styles.historyWrap}>
            <Text style={styles.historyTitle}>Previous withdrawals</Text>
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
  applyText: { color: COLORS.dark, fontSize: 14, lineHeight: 21 },
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
  goLiveNote: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 8, textAlign: 'center' },
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
