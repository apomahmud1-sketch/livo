// Livo — Agent Portal (coin agents only).
// An approved agent sends coins from their agent wallet to any
// user by display ID. Everything is real: balance + recipient
// preview + transfer + history all come from the agent_*
// SECURITY DEFINER RPCs (src/supabase/agent.js). No demo data.
// The screen is unreachable for non-agents: the Me menu entry
// renders only when agent_portal_info says the user is an
// approved agent, and the screen itself re-checks on load.
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { THEME } from '../config';
import { useApp } from '../store';
import {
  fetchAgentTransactions,
  getAgentPortalInfo,
  resolveAgentUser,
  sendAgentCoins,
} from '../supabase/agent';

const SEND_ERROR_TEXT = {
  'invalid-amount': 'Enter a valid amount of coins.',
  'not-an-agent': 'This account is not a coin agent.',
  'not-approved': 'Your agent account is not approved yet.',
  'insufficient-balance': 'Not enough coins in your agent wallet.',
  'user-not-found': 'No user with that ID.',
  'cannot-send-to-self': "You can't send coins to yourself.",
  'update-failed': "Couldn't confirm the transfer — check your history before trying again.",
  'send-failed': "Couldn't send the coins — try again.",
};

export default function AgentPortalScreen({ navigation }) {
  const { showToast } = useApp();
  const [loading, setLoading] = React.useState(true);
  const [info, setInfo] = React.useState(null);
  const [recipientId, setRecipientId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [recipient, setRecipient] = React.useState(null);
  const [resolving, setResolving] = React.useState(false);
  const [resolvedFor, setResolvedFor] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [history, setHistory] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const data = await getAgentPortalInfo();
    setInfo(data);
    setLoading(false);
    if (data.isAgent && data.status === 'approved') {
      setHistoryLoading(true);
      setHistory(await fetchAgentTransactions());
      setHistoryLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const lookupRecipient = React.useCallback(async (id) => {
    const clean = String(id || '').trim();
    if (!clean) { setRecipient(null); setResolvedFor(''); return; }
    if (clean === resolvedFor) return;
    setResolving(true);
    const found = await resolveAgentUser(clean);
    setRecipient(found);
    setResolvedFor(clean);
    setResolving(false);
  }, [resolvedFor]);

  const onSend = () => {
    const cleanId = recipientId.trim();
    const coins = Math.floor(Number(amount));
    if (!cleanId) { showToast('Enter the user ID first.'); return; }
    if (!coins || coins <= 0) { showToast('Enter a valid amount of coins.'); return; }
    if (info && coins > info.walletCoins) { showToast('Not enough coins in your agent wallet.'); return; }
    if (!recipient || resolvedFor !== cleanId) { showToast('Check the user ID first.'); return; }
    Alert.alert(
      'Send coins?',
      `Send ${coins.toLocaleString()} coins to ${recipient.username || cleanId} (ID ${cleanId})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSending(true);
            const res = await sendAgentCoins(cleanId, coins);
            setSending(false);
            if (res.error) {
              showToast(SEND_ERROR_TEXT[res.error] || SEND_ERROR_TEXT['send-failed']);
              return;
            }
            setInfo((prev) => (prev ? { ...prev, walletCoins: res.walletCoins } : prev));
            setAmount('');
            setRecipient(null);
            setResolvedFor('');
            setRecipientId('');
            showToast(`Sent ${coins.toLocaleString()} coins to ${recipient.username || cleanId}.`);
            setHistoryLoading(true);
            setHistory(await fetchAgentTransactions());
            setHistoryLoading(false);
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <StatusBar style="light" />
      <View style={styles.headRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headTitle}>Agent Portal</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={THEME.gold} />
          <Text style={styles.muted}>Loading agent account…</Text>
        </View>
      ) : !info || !info.isAgent || info.status !== 'approved' ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Agent Portal is not available</Text>
          <Text style={styles.muted}>
            {!info || !info.isAgent
              ? 'This account is not registered as a coin agent. Ask the admin to add you as an agent.'
              : 'Your agent account is waiting for approval. You can send coins once the admin approves you.'}
          </Text>
        </View>
      ) : (
        <View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Agent wallet</Text>
            <Text style={styles.balanceValue}>🪙 {Number(info.walletCoins || 0).toLocaleString()}</Text>
            <Text style={styles.balanceSub}>{info.agentName ? `${info.agentName} · ` : ''}Agent ID {info.agentId || '—'}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Send coins to a user</Text>
            <Text style={styles.label}>User ID</Text>
            <View style={styles.idRow}>
              <TextInput
                style={[styles.input, styles.idInput]}
                value={recipientId}
                onChangeText={(v) => { setRecipientId(v); setRecipient(null); setResolvedFor(''); }}
                onBlur={() => lookupRecipient(recipientId)}
                placeholder="e.g. 63227007"
                placeholderTextColor={THEME.dim}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.checkBtn}
                onPress={() => lookupRecipient(recipientId)}
                disabled={resolving || !recipientId.trim()}
              >
                <Text style={styles.checkBtnTxt}>{resolving ? '…' : 'Check'}</Text>
              </TouchableOpacity>
            </View>
            {resolvedFor === recipientId.trim() && recipientId.trim() !== '' ? (
              recipient ? (
                <Text style={styles.recipientOk}>✓ {recipient.username || 'User'} (ID {recipient.userId})</Text>
              ) : (
                <Text style={styles.recipientBad}>No user with that ID.</Text>
              )
            ) : null}
            <Text style={styles.label}>Coins to send</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 100"
              placeholderTextColor={THEME.dim}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={onSend} disabled={sending}>
              <Text style={styles.sendBtnTxt}>{sending ? 'Sending…' : 'Send coins'}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Coins come out of your agent wallet. The user receives them instantly.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.historyHead}>
              <Text style={styles.cardTitle}>Sent history</Text>
              <TouchableOpacity
                onPress={async () => { setHistoryLoading(true); setHistory(await fetchAgentTransactions()); setHistoryLoading(false); }}
              >
                <Text style={styles.refreshTxt}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {historyLoading ? (
              <ActivityIndicator color={THEME.gold} style={{ marginVertical: 12 }} />
            ) : history.length === 0 ? (
              <Text style={styles.muted}>No coins sent yet.</Text>
            ) : (
              history.map((t) => (
                <View key={String(t.id)} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txName}>{t.username || 'User'} · ID {t.userId}</Text>
                    <Text style={styles.txDate}>{t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}</Text>
                  </View>
                  <Text style={styles.txCoins}>−{Number(t.coins || 0).toLocaleString()} 🪙</Text>
                </View>
              ))
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: THEME.page },
  wrap: { padding: 16, paddingBottom: 40 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: THEME.text, fontSize: 28 },
  headTitle: { color: THEME.text, fontSize: 18, fontWeight: '700' },
  center: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: THEME.text, fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  muted: { color: THEME.dim, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  balanceCard: { backgroundColor: THEME.panel, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: THEME.line },
  balanceLabel: { color: THEME.dim, fontSize: 13 },
  balanceValue: { color: THEME.gold, fontSize: 30, fontWeight: '800', marginTop: 4 },
  balanceSub: { color: THEME.dim, fontSize: 12, marginTop: 4 },
  card: { backgroundColor: THEME.panel, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: THEME.line },
  cardTitle: { color: THEME.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  label: { color: THEME.dim, fontSize: 13, marginBottom: 6 },
  idRow: { flexDirection: 'row', marginBottom: 8 },
  input: { backgroundColor: THEME.panel2, borderWidth: 1, borderColor: THEME.line, borderRadius: 10, color: THEME.text, fontSize: 15, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10 },
  idInput: { flex: 1, marginBottom: 0, marginRight: 8 },
  checkBtn: { backgroundColor: THEME.violet, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  checkBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  recipientOk: { color: THEME.green, fontSize: 13, marginBottom: 10 },
  recipientBad: { color: THEME.red, fontSize: 13, marginBottom: 10 },
  sendBtn: { backgroundColor: THEME.gold, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnTxt: { color: '#231303', fontSize: 16, fontWeight: '800' },
  hint: { color: THEME.dim, fontSize: 12, marginTop: 10, lineHeight: 17 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshTxt: { color: THEME.gold, fontSize: 13, fontWeight: '700' },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: THEME.line },
  txName: { color: THEME.text, fontSize: 14, fontWeight: '600' },
  txDate: { color: THEME.dim, fontSize: 12, marginTop: 2 },
  txCoins: { color: THEME.gold, fontSize: 14, fontWeight: '700' },
});
