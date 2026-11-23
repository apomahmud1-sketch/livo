import React, { useEffect, useRef, useState } from 'react';
import { Alert, ImageBackground, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { signInWithGoogle } from '../supabase/auth';

// Real login: Google (Gmail) via Supabase Auth. On success the App.js
// auth gate switches to Main automatically — this screen never
// navigates itself. (The old fake goHome() that just jumped to Main
// is gone.)
//
// Design: login-poster.jpg background, "Livo" title, Google-only
// login, 18+ Agree required before sign-in. The Agree text wraps in
// its own flex:1 container so it can never clip at the right edge
// (the old row put the Text directly in the row and it cut off on
// some phones). Safe-area aware, 360dp-safe.
export default function LoginScreen() {
  const [agreed, setAgreed] = useState(true);
  const [busy, setBusy] = useState(false);
  // The App.js gate unmounts this screen the moment sign-in
  // succeeds — never setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const signIn = async () => {
    if (!agreed) {
      Alert.alert('Please agree first', 'Tick "Agree to User Agreement & Privacy Policy and confirm I\'m over 18" to continue.');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await signInWithGoogle();
      if (error && mountedRef.current) {
        // The user closing the Google sheet is not an error to shout about.
        if (error.message !== 'Google sign-in was cancelled.') {
          Alert.alert('Google sign-in failed', error.message);
        }
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <ImageBackground source={require('../../assets/login-poster.jpg')} resizeMode="cover" style={styles.bg}>
      <LinearGradient colors={['rgba(30,27,75,0.60)', 'rgba(124,58,237,0.30)', 'rgba(236,72,153,0.60)']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.title}>Livo</Text>
            <View style={styles.rule} />
            <Text style={styles.subtitle}>Premium 1-to-1 video calls</Text>
            <Text style={styles.tagline}>Meet real hosts, live — anytime.</Text>
          </View>

          <View style={styles.bottom}>
            <TouchableOpacity
              style={[styles.googleBtn, busy && styles.btnDisabled]}
              onPress={signIn}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={styles.gLetter}>G</Text>
              <Text style={styles.googleBtnText}>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.8}>
              <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                {agreed && <Text style={styles.check}>✓</Text>}
              </View>
              <View style={styles.agreeTextWrap}>
                <Text style={styles.agreeText}>
                  Agree to <Text style={styles.link}>User Agreement</Text> &amp; <Text style={styles.link}>Privacy Policy</Text> and confirm I'm over 18
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.footnote}>18+ only · Sign in with your Google account</Text>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  agreeRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 18, paddingHorizontal: 6 },
  // The Text lives in its own flex:1 wrapper so it always wraps
  // inside the screen — never clipped at the right edge.
  agreeText: { color: '#f3f4f6', flexShrink: 1, flexWrap: 'wrap', fontSize: 12.5, lineHeight: 18 },
  agreeTextWrap: { flex: 1, flexShrink: 1 },
  bg: { flex: 1 },
  bottom: { marginTop: 'auto', paddingBottom: 8 },
  btnDisabled: { opacity: 0.65 },
  check: { color: '#fff', fontSize: 13, fontWeight: 'bold', lineHeight: 15 },
  checkbox: {
    alignItems: 'center',
    borderColor: '#fff',
    borderRadius: 6,
    borderWidth: 2,
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    width: 22,
  },
  checkboxOn: { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  content: { flex: 1, paddingBottom: 24, paddingHorizontal: 28, paddingTop: 24 },
  footnote: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 16, textAlign: 'center' },
  gLetter: { color: '#4285f4', fontSize: 20, fontWeight: '800', marginRight: 12 },
  googleBtn: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 30,
    elevation: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  googleBtnText: { color: '#1f2937', fontSize: 16, fontWeight: '700' },
  hero: { alignItems: 'center', marginTop: 56 },
  link: { color: '#fff', fontWeight: '600', textDecorationLine: 'underline' },
  rule: { backgroundColor: '#ec4899', borderRadius: 2, height: 3, marginTop: 14, width: 48 },
  safe: { flex: 1 },
  subtitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6, textAlign: 'center' },
  title: {
    color: '#fff',
    fontSize: 58,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
