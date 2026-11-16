import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS, COIN_PACKS, MIN_WITHDRAW_DIAMONDS, WITHDRAW_METHODS } from '../config';
import { useApp } from '../store';

export default function WalletScreen() {
  const { coins, diamonds, earnings, recharge, showToast } = useApp();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bKash');
  const [account, setAccount] = useState('');
  const [history, setHistory] = useState([
    { id: 'w1', amount: 10000, method: 'bKash', status: 'Approved' },
    { id: 'w2', amount: 5000, method: 'Nagad', status: 'Pending' },
  ]);

  const submitWithdraw = () => {
    const n = Number(amount);
    if (!n || n <= 0) { showToast('Enter a valid amount.'); return; }
    if (n < MIN_WITHDRAW_DIAMONDS) { showToast(`Minimum withdrawal is ${MIN_WITHDRAW_DIAMONDS} diamonds.`); return; }
    if (!account.trim()) { showToast('Enter your account number.'); return; }
    setHistory([{ id: String(Date.now()), amount: n, method, status: 'Pending' }, ...history]);
    setAmount(''); setAccount('');
    showToast('Withdraw request submitted — admin will review it.');
  };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>My Wallet</Text>
      <View style={styles.row}>
        <View style={[styles.card, styles.coins]}><Text style={styles.cardLabel}>🪙 Coins</Text><Text style={styles.cardValue}>{coins.toLocaleString()}</Text></View>
        <View style={[styles.card, styles.diamonds]}><Text style={styles.cardLabel}>💎 Diamonds</Text><Text style={styles.cardValue}>{diamonds.toLocaleString()}</Text></View>
      </View>
      <View style={styles.card}><Text style={styles.cardLabel}>💰 Earnings (withdrawable)</Text><Text style={styles.cardValue}>{earnings.toLocaleString()} diamonds</Text></View>

      <Text style={styles.section}>Recharge coins (demo prices — admin can change them)</Text>
      <View style={styles.row}>
        {COIN_PACKS.map((p) => (
          <TouchableOpacity key={p.id} style={styles.pack} onPress={() => recharge(p)}>
            <Text style={styles.packCoins}>{p.coins.toLocaleString()} 🪙</Text>
            {p.bonus ? <Text style={styles.bonus}>+{p.bonus} bonus</Text> : null}
            <Text>{p.price}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.note}>Recharge is a demo for now — connect a real payment method before launch.</Text>

      <Text style={styles.section}>Withdraw (min {MIN_WITHDRAW_DIAMONDS.toLocaleString()} diamonds)</Text>
      <View style={styles.row}>
        {WITHDRAW_METHODS.map((m) => (
          <TouchableOpacity key={m} style={[styles.method, method === m && styles.methodOn]} onPress={() => setMethod(m)}>
            <Text style={method === m ? styles.methodTextOn : styles.methodText}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={styles.input} placeholder="Amount in diamonds" keyboardType="numeric" value={amount} onChangeText={setAmount} />
      <TextInput style={styles.input} placeholder={`${method} account number`} value={account} onChangeText={setAccount} />
      <TouchableOpacity style={styles.btn} onPress={submitWithdraw}>
        <Text style={styles.btnText}>Submit Withdraw Request</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Withdraw history</Text>
      {history.map((h) => (
        <View key={h.id} style={styles.histRow}>
          <Text>{h.amount.toLocaleString()} diamonds · {h.method}</Text>
          <Text style={h.status === 'Approved' ? styles.ok : styles.pending}>{h.status}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#fff', flex: 1 },
  bonus: { color: COLORS.green, fontSize: 12, fontWeight: 'bold' },
  btn: { backgroundColor: COLORS.purple, borderRadius: 24, marginTop: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { borderRadius: 14, flex: 1, margin: 4, padding: 14 },
  cardLabel: { fontSize: 13 },
  cardValue: { fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  coins: { backgroundColor: '#fef3c7' },
  diamonds: { backgroundColor: '#e0e7ff' },
  histRow: { borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  input: { backgroundColor: COLORS.lavender, borderRadius: 12, marginTop: 10, padding: 12 },
  method: { borderColor: COLORS.lightGrey, borderRadius: 20, borderWidth: 1, margin: 4, paddingHorizontal: 14, paddingVertical: 8 },
  methodOn: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  methodText: { color: COLORS.dark },
  methodTextOn: { color: '#fff', fontWeight: 'bold' },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 8 },
  ok: { color: COLORS.green, fontWeight: 'bold' },
  pack: { backgroundColor: COLORS.lavender, borderRadius: 12, margin: 4, padding: 12, width: '30%' },
  packCoins: { fontWeight: 'bold' },
  pending: { color: '#f59e0b', fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  section: { fontSize: 17, fontWeight: 'bold', marginTop: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  wrap: { padding: 16, paddingTop: 48 },
});
