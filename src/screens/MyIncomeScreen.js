// Livo — My Income (2026-11-27, user request): Diamonds do NOT
// live in the Wallet any more — they live here. A host's gift +
// call earnings arrive as Diamonds (calls: 70% of the call cost,
// i.e. 100 - PLATFORM_COMMISSION_PERCENT; gifts: the full gift
// price — see GIFT_HOST_SHARE_PERCENT in config.js, currently
// 100) and the host withdraws them from here.
//
// Earnings history is the signed-in user's own transactions rows
// (kinds call_earnings / gift_received, written by
// creditHostEarnings). The Withdraw form is the SAME flow as the
// Host Dashboard: requestWithdrawal() inserts a Pending row into
// the withdrawals table, the Mother Panel approves it — no new
// withdraw system. Non-hosts get an honest empty state, never
// fake earnings.
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, MIN_WITHDRAW_DIAMONDS, THEME, WITHDRAW_METHODS } from '../config';
import { useApp } from '../store';
import { fetchMyWithdrawals, getCurrentUser, getMyHostRow, requestWithdrawal } from '../supabase/host';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function kindLabel(kind) {
  if (kind === 'call_earnings') return 'Video call';
  if (kind === 'gift_received') return 'Gift received';
  return String(kind || 'Earning');
}

export default function MyIncomeScreen({ navigation }) {
  const { diamonds, transactions, refreshTransactions, showToast, signedIn } = useApp();
  const [hostRow, setHostRow] = useState(null);
  const [hostChecked, setHostChecked] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);
  // Withdraw form (same flow as Host Dashboard).
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(WITHDRAW_METHODS[0]);
  const [account, setAccount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  // Fresh earnings on open, plus the host row (needed for the
  // withdraw form and the pending-withdrawals balance).
  useEffect(() => {
    if (typeof refreshTransactions === 'function') refreshTransactions();
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        setHostChecked(true);
        return;
      }
      const row = await getMyHostRow(u.id);
      if (cancelled) return;
      setHostRow(row);
      setHostChecked(true);
      if (row) {
        const wds = await fetchMyWithdrawals(row.id);
        if (!cancelled) setWithdrawals(wds);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Only the host's own earnings kinds — never the caller's spend
  // rows (call_charge / gift_sent) and never anyone else's.
  const earnings = transactions.filter(
    (t) => t.kind === 'call_earnings' || t.kind === 'gift_received',
  );
  const totalEarned = earnings.reduce((sum, t) => sum + (Number(t.amountDiamonds) || 0), 0);
  // Available balance: real Diamonds MINUS pending withdrawals —
  // paid-out ones already left the balance, rejected/cancelled
  // ones are free again (same rule as Host Dashboard).
  const pendingWithdrawals = withdrawals.reduce((sum, w) => (
    String(w.status || '').toLowerCase() === 'pending'
      ? sum + (Number(w.amount_diamonds) || 0)
      : sum
  ), 0);
  const availableDiamonds = Math.max(0, (diamonds || 0) - pendingWithdrawals);

  const doWithdraw = async () => {
    if (!hostRow || withdrawing) return;
    const value = Math.floor(Number(amount) || 0);
    if (value <= 0) {
      showToast('Enter how many Diamonds to withdraw');
      return;
    }
    if (value < MIN_WITHDRAW_DIAMONDS) {
      showToast(`You need to withdraw at least ${fmt(MIN_WITHDRAW_DIAMONDS)} Diamonds`);
      return;
    }
    if (value > availableDiamonds) {
      showToast(`You have ${fmt(availableDiamonds)} Diamonds — you can't withdraw more than that`);
      return;
    }
    if (!account.trim()) {
      showToast('Enter the account number to receive the money');
      return;
    }
    setWithdrawing(true);
    const res = await requestWithdrawal(hostRow.id, { amountDiamonds: value, method, account });
    setWithdrawing(false);
    if (!res.ok) {
      showToast('Withdraw was not submitted — please try again');
      return;
    }
    setAmount('');
    setAccount('');
    const wds = await fetchMyWithdrawals(hostRow.id);
    setWithdrawals(wds);
    showToast(`Withdraw submitted — ${fmt(value)} Diamonds, ${method} (Pending)`);
  };

  const goBack = () => {
    if (navigation && navigation.goBack) navigation.goBack();
  };

  return (
    <LinearGradient colors={['#341064', '#1c0538', '#12021f']} style={styles.bg}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>My Income</Text>
          <View style={styles.headerSpacer} />
        </View>

        {!signedIn ? (
          <Text style={styles.empty}>Please sign in to see your income.</Text>
        ) : (
          <>
            <LinearGradient
              colors={['#a855f7', '#ec4899', '#fb923c']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.balanceCard}
            >
              <Text style={styles.balanceLabel}>💎 Diamond balance</Text>
              <Text style={styles.balanceValue}>{fmt(diamonds)}</Text>
              <Text style={styles.balanceSub}>
                Available to withdraw: 💎 {fmt(availableDiamonds)}
                {pendingWithdrawals > 0 ? ` · 💎 ${fmt(pendingWithdrawals)} in pending withdrawals` : ''}
              </Text>
              <Text style={styles.balanceSub}>Total earned: 💎 {fmt(totalEarned)}</Text>
            </LinearGradient>

            <Text style={styles.sectionTitle}>Earnings history</Text>
            {earnings.length === 0 ? (
              <Text style={styles.empty}>
                {hostChecked && !hostRow
                  ? 'You are not a host yet — apply from the Host Dashboard to start earning Diamonds from calls and gifts.'
                  : 'No earnings yet — Diamonds from your calls and gifts will show here.'}
              </Text>
            ) : (
              earnings.map((t) => (
                <View key={t.id} style={styles.earnRow}>
                  <View style={styles.earnInfo}>
                    <Text style={styles.earnMain}>
                      +{fmt(t.amountDiamonds)} 💎 · {kindLabel(t.kind)}
                    </Text>
                    {t.reference ? <Text style={styles.earnRef}>{String(t.reference)}</Text> : null}
                  </View>
                  <Text style={styles.earnDate}>
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''}
                  </Text>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>Withdraw — cash out</Text>
            {!hostChecked ? (
              <Text style={styles.empty}>Loading…</Text>
            ) : !hostRow ? (
              <View style={styles.card}>
                <Text style={styles.cardText}>
                  Withdraw is for hosts. Apply to become a host first — your Diamond earnings will be withdrawable from here.
                </Text>
                <TouchableOpacity
                  style={styles.hostBtn}
                  onPress={() => navigation.navigate('HostDashboard')}
                >
                  <Text style={styles.hostBtnText}>Go to Host Dashboard</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>How many Diamonds to withdraw?</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="e.g. 10000"
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
                        <Text style={styles.historyMain}>💎 {fmt(w.amount_diamonds)} · {w.method}</Text>
                        <Text style={[styles.historyStatus, String(w.status).toLowerCase() === 'pending' && styles.historyPending]}>
                          {w.status}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  back: { color: THEME.text, fontSize: 28, fontWeight: 'bold' },
  balanceCard: { borderRadius: 24, marginTop: 12, padding: 20 },
  balanceLabel: { color: '#fff', fontSize: 15 },
  balanceSub: { color: '#fff', fontSize: 14, marginTop: 6, opacity: 0.9 },
  balanceValue: { color: '#fff', fontSize: 44, fontWeight: 'bold', marginTop: 4 },
  bg: { flex: 1 },
  card: { backgroundColor: THEME.panel2, borderRadius: 16, marginTop: 8, padding: 16 },
  cardText: { color: THEME.text, fontSize: 14, lineHeight: 21 },
  earnDate: { color: THEME.dim, fontSize: 13 },
  earnInfo: { flex: 1 },
  earnMain: { color: THEME.text, fontSize: 15, fontWeight: 'bold' },
  earnRef: { color: THEME.dim, fontSize: 13, marginTop: 2 },
  earnRow: { alignItems: 'center', backgroundColor: THEME.panel2, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, padding: 12 },
  empty: { color: THEME.text, fontSize: 14, lineHeight: 21, marginTop: 20, textAlign: 'center' },
  fieldLabel: { color: THEME.text, fontSize: 13, fontWeight: 'bold', marginBottom: 6, marginTop: 10 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerSpacer: { width: 28 },
  historyMain: { color: THEME.text, fontSize: 14, fontWeight: 'bold' },
  historyPending: { color: '#fbbf24' },
  historyRow: { alignItems: 'center', borderTopColor: THEME.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  historyStatus: { color: THEME.dim, fontSize: 13, fontWeight: 'bold' },
  historyTitle: { color: THEME.text, fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  historyWrap: { marginTop: 16 },
  hostBtn: { alignItems: 'center', backgroundColor: THEME.violet, borderRadius: 16, marginTop: 14, paddingVertical: 13 },
  hostBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: THEME.line, borderRadius: 12, borderWidth: 1, color: THEME.text, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 },
  methodBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderColor: THEME.line, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  methodBtnSel: { backgroundColor: THEME.violet, borderColor: THEME.violet },
  methodText: { color: THEME.text, fontSize: 14, fontWeight: 'bold' },
  methodTextSel: { color: '#fff' },
  methodsRow: { flexDirection: 'row', marginHorizontal: -3 },
  sectionTitle: { color: THEME.text, fontSize: 20, fontWeight: 'bold', marginTop: 24 },
  title: { color: THEME.text, fontSize: 20, fontWeight: 'bold' },
  withdrawBtn: { alignItems: 'center', backgroundColor: '#f59e0b', borderRadius: 16, marginTop: 16, paddingVertical: 15 },
  withdrawDisabled: { opacity: 0.6 },
  withdrawNote: { color: THEME.dim, fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  withdrawText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  wrap: { padding: 16, paddingBottom: 32, paddingTop: 48 },
});
