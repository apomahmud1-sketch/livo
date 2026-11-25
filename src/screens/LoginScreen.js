import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, ImageBackground, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Path, Svg } from 'react-native-svg';
import { COLORS } from '../config';
import { signInWithGoogle } from '../supabase/auth';

// Real login: Google (Gmail) via Supabase Auth. On success the App.js
// auth gate switches to Main automatically — this screen never
// navigates itself. (The old fake goHome() that just jumped to Main
// is gone.)
//
// Design (Hapa-style, 2026-11-25): full-screen looping muted
// background VIDEO (assets/login-bg.mp4 — free Pexels stock, young
// woman dancing with headphones) with login-poster.jpg underneath
// as the fallback if the video cannot play; Livo icon + title in
// the middle; gold/cream "Continue with Google" button with the
// real multicolour Google G; Terms of Service / Privacy Policy
// links below. Google-only login — NO "Continue with Password"
// button (his decision: Google-only; password login is a separate
// step if he ever asks). 18+ Agree stays mandatory before sign-in.
// The Agree text wraps in its own flex:1 container so it can never
// clip at the right edge. Safe-area aware, 360dp-safe.
function GoogleG({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

export default function LoginScreen({ navigation }) {
  const [agreed, setAgreed] = useState(true);
  const [busy, setBusy] = useState(false);
  // Video failed to load/play — hide it so the poster underneath
  // shows instead of a black box.
  const [videoFailed, setVideoFailed] = useState(false);
  // Legal pages open INSIDE the app (LegalScreen) — never a browser.
  const openLegal = (kind) => {
    if (navigation) navigation.navigate('Legal', { kind });
  };
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
    <View style={styles.bg}>
      {/* Poster fallback layer — always underneath the video. */}
      <ImageBackground source={require('../../assets/login-poster.jpg')} resizeMode="cover" style={StyleSheet.absoluteFill} />
      {!videoFailed && (
        <Video
          source={require('../../assets/login-bg.mp4')}
          style={StyleSheet.absoluteFill}
          resizeMode={Video.RESIZE_MODE_COVER}
          shouldPlay
          isLooping
          isMuted
          onError={() => setVideoFailed(true)}
        />
      )}
      <LinearGradient colors={['rgba(30,27,75,0.55)', 'rgba(124,58,237,0.25)', 'rgba(236,72,153,0.55)']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
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
              <View style={styles.gIcon}>
                <GoogleG size={22} />
              </View>
              <Text style={styles.googleBtnText}>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.8}>
              <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                {agreed && <Text style={styles.check}>✓</Text>}
              </View>
              <View style={styles.agreeTextWrap}>
                <Text style={styles.agreeText}>
                  Agree to <Text style={styles.link} onPress={() => openLegal('terms')}>User Agreement</Text> &amp; <Text style={styles.link} onPress={() => openLegal('privacy')}>Privacy Policy</Text> and confirm I'm over 18
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.termsLine}>By continuing, you agree to our</Text>
            <Text style={styles.termsLinks}>
              <Text style={styles.link} onPress={() => openLegal('terms')}>Terms of Service</Text>
              <Text style={styles.termsDot}>  ·  </Text>
              <Text style={styles.link} onPress={() => openLegal('privacy')}>Privacy Policy</Text>
            </Text>

            <Text style={styles.footnote}>18+ only · Sign in with your Google account</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  agreeRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 18, paddingHorizontal: 6 },
  // The Text lives in its own flex:1 wrapper so it always wraps
  // inside the screen — never clipped at the right edge.
  agreeText: { color: '#f3f4f6', flexShrink: 1, flexWrap: 'wrap', fontSize: 12.5, lineHeight: 18 },
  agreeTextWrap: { flex: 1, flexShrink: 1 },
  appIcon: { borderRadius: 22, height: 92, marginBottom: 10, width: 92 },
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
  footnote: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 14, textAlign: 'center' },
  gIcon: { marginRight: 12 },
  // Hapa-style gold/cream button: pale gold background, dark text.
  googleBtn: {
    alignItems: 'center',
    backgroundColor: '#fff6cf',
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
  googleBtnText: { color: '#1e293b', fontSize: 16, fontWeight: '700' },
  hero: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  link: { color: '#fff', fontWeight: '600', textDecorationLine: 'underline' },
  rule: { backgroundColor: '#ec4899', borderRadius: 2, height: 3, marginTop: 14, width: 48 },
  safe: { flex: 1 },
  subtitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6, textAlign: 'center' },
  termsDot: { color: 'rgba(255,255,255,0.7)' },
  termsLine: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 16, textAlign: 'center' },
  termsLinks: { fontSize: 13, marginTop: 4, textAlign: 'center' },
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
