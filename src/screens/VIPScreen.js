import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS, VIP_PACKS } from '../config';
import { useApp } from '../store';

export default function VIPScreen() {
  const [vip, setVip] = useState(null);
  const { showToast } = useApp();
  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>VIP Membership</Text>
      <Text style={styles.sub}>Exclusive badge, profile frame, premium gifts and effects.</Text>
      {VIP_PACKS.map((p) => (
        <View key={p.id} style={styles.card}>
          <Text style={styles.name}>{p.name} · {p.days} days</Text>
          <Text style={styles.price}>{p.price}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => { setVip(p.id); showToast(`${p.name} activated (demo — no real payment yet)`); }}>
            <Text style={styles.btnText}>{vip === p.id ? '✓ Active' : 'Buy VIP'}</Text>
          </TouchableOpacity>
        </View>
      ))}
      <Text style={styles.note}>VIP packages and prices are set by the admin panel.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#fff', flex: 1 },
  btn: { backgroundColor: COLORS.purple, borderRadius: 20, marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: COLORS.lavender, borderRadius: 14, marginTop: 12, padding: 16 },
  name: { fontSize: 18, fontWeight: 'bold' },
  note: { color: COLORS.grey, fontSize: 12, marginTop: 16 },
  price: { fontSize: 16, marginTop: 4 },
  sub: { color: COLORS.grey, marginTop: 6 },
  title: { fontSize: 24, fontWeight: 'bold' },
  wrap: { padding: 16, paddingTop: 48 },
});
