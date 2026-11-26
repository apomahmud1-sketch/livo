// ── First-time signup, step 3: Completed the registration ────────
// Waki Star flow, Livo purple-gold theme (not Waki's yellow).
// Shown after the setup step saves the profile. "Enter Livo"
// hands the user into the app (the gate then shows Main).
// English-only UI.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { THEME as T } from '../config';

export default function SignupDoneScreen({ photoWarning, onEnter }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.checkCircle}>
        <Text style={styles.checkMark}>✓</Text>
      </View>
      <Text style={styles.title}>Completed the registration</Text>
      <Text style={styles.sub}>
        Logging in means you agree to Livo <Text style={styles.link}>《User Agreement》</Text>
      </Text>
      {photoWarning ? <Text style={styles.warn}>{photoWarning}</Text> : null}
      <TouchableOpacity style={styles.enterBtn} onPress={onEnter} activeOpacity={0.85}>
        <Text style={styles.enterTxt}>Enter Livo</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: T.page, flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  checkCircle: {
    alignItems: 'center',
    borderColor: '#22c55e',
    borderRadius: 48,
    borderWidth: 4,
    height: 96,
    justifyContent: 'center',
    marginBottom: 24,
    width: 96,
  },
  checkMark: { color: '#22c55e', fontSize: 48, fontWeight: 'bold' },
  title: { color: T.text, fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  sub: { color: T.dim, fontSize: 14, lineHeight: 20, marginBottom: 32, textAlign: 'center' },
  link: { color: T.gold },
  warn: { color: '#ff7a7a', fontSize: 14, lineHeight: 20, marginBottom: 24, textAlign: 'center' },
  enterBtn: { backgroundColor: T.gold, borderRadius: 28, paddingHorizontal: 48, paddingVertical: 15 },
  enterTxt: { color: '#3d2400', fontSize: 17, fontWeight: '700' },
});
