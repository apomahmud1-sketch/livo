import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, ImageBackground, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Path, Svg } from 'react-native-svg';
import { signInWithGoogle } from '../supabase/auth';
import { useAppConfig } from '../appConfig';

// Real login: Google (Gmail) via Supabase Auth. On success the App.js
// auth gate switches to Main automatically — this screen never
// navigates itself. (The old fake goHome() that just jumped to Main
// is gone.)
//
// Login design comes from the Mother Panel (app_config login_style):
// 'neon' | 'white' | 'pink' | 'blue'. EVERY variant is Google-only
// login with the 18+ agreement mandatory before sign-in — the design
// changes, the rules never do. Legal pages open INSIDE the app
// (LegalScreen) — never a browser.
//
//   neon  — Neon Party (default): looping background video + poster,
//           purple/pink overlay, gold "Continue with Google" button.
//   white — Clean White: plain professional white, panel-primary
//           title + button, dark text.
//   pink  — Party Pink (Bigo/Chamet-style): pink gradient, white
//           button, white text.
//   blue  — Ocean Blue: light-blue image background, white card at
//           the bottom holding the button + agreement.
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

// Colours per login variant. `primary` is the panel theme primary
// (app_config theme.primary); `gold` the panel gold.
function paletteFor(style, primary) {
  switch (style) {
    case 'white':
      return {
        bg: 'plain', bgColor: '#ffffff',
        title: primary, subtitle: '#111827', tagline: '#6b7280', rule: primary,
        btnBg: primary, btnText: '#ffffff',
        agree: '#374151', link: primary, footnote: '#9ca3af',
        terms: '#6b7280', termsDot: '#9ca3af',
        checkBorder: '#9ca3af', checkOn: primary, checkMark: '#ffffff',
        cardBg: null,
      };
    case 'pink':
      return {
        bg: 'gradient', gradient: ['#f9a8d4', '#ec4899', '#be185d'],
        title: '#ffffff', subtitle: '#ffffff', tagline: 'rgba(255,255,255,0.9)', rule: '#ffffff',
        btnBg: '#ffffff', btnText: '#be185d',
        agree: '#ffffff', link: '#ffffff', footnote: 'rgba(255,255,255,0.75)',
        terms: 'rgba(255,255,255,0.85)', termsDot: 'rgba(255,255,255,0.7)',
        checkBorder: '#ffffff', checkOn: '#ffffff', checkMark: '#ec4899',
        cardBg: null,
      };
    case 'blue':
      return {
        bg: 'image-blue',
        overlay: ['rgba(186,230,253,0.30)', 'rgba(125,211,252,0.35)', 'rgba(59,130,246,0.50)'],
        title: '#ffffff', subtitle: '#ffffff', tagline: 'rgba(255,255,255,0.9)', rule: '#ffffff',
        btnBg: primary, btnText: '#ffffff',
        agree: '#374151', link: primary, footnote: '#9ca3af',
        terms: '#6b7280', termsDot: '#9ca3af',
        checkBorder: '#9ca3af', checkOn: primary, checkMark: '#ffffff',
        cardBg: '#ffffff',
      };
    case 'neon':
    default:
      return {
        bg: 'video',
        overlay: ['rgba(30,27,75,0.55)', 'rgba(124,58,237,0.25)', 'rgba(236,72,153,0.55)'],
        title: '#ffffff', subtitle: '#ffffff', tagline: 'rgba(255,255,255,0.85)', rule: '#ec4899',
        btnBg: '#fff6cf', btnText: '#1e293b',
        agree: '#f3f4f6', link: '#ffffff', footnote: 'rgba(255,255,255,0.65)',
        terms: 'rgba(255,255,255,0.75)', termsDot: 'rgba(255,255,255,0.7)',
        checkBorder: '#ffffff', checkOn: '#ec4899', checkMark: '#ffffff',
        cardBg: null,
      };
  }
}

export default function LoginScreen({ navigation }) {
  const [agreed, setAgreed] = useState(true);
  const [busy, setBusy] = useState(false);
  // Video failed to load/play — hide it so the poster underneath
  // shows instead of a black box.
  const [videoFailed, setVideoFailed] = useState(false);
  // Login design + panel primary colour (app_config).
  const { loginStyle, theme } = useAppConfig();
  const p = paletteFor(loginStyle, theme.violet);
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
      {/* Background layer — depends on the selected login design. */}
      {p.bg === 'video' && (
        <>
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
          <LinearGradient colors={p.overlay} style={StyleSheet.absoluteFill} />
        </>
      )}
      {p.bg === 'plain' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bgColor }]} />
      )}
      {p.bg === 'gradient' && (
        <LinearGradient colors={p.gradient} style={StyleSheet.absoluteFill} />
      )}
      {p.bg === 'image-blue' && (
        <>
          <ImageBackground source={require('../../assets/login-poster.jpg')} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <LinearGradient colors={p.overlay} style={StyleSheet.absoluteFill} />
        </>
      )}
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image source={require('../../assets/icon.png')} style={styles.appIcon} />
            <Text style={[styles.title, { color: p.title }]}>Livo</Text>
            <View style={[styles.rule, { backgroundColor: p.rule }]} />
            <Text style={[styles.subtitle, { color: p.subtitle }]}>Premium 1-to-1 video calls</Text>
            <Text style={[styles.tagline, { color: p.tagline }]}>Meet real hosts, live — anytime.</Text>
          </View>

          <View style={[styles.bottom, p.cardBg && styles.bottomCard]}>
            <TouchableOpacity
              style={[styles.googleBtn, { backgroundColor: p.btnBg }, busy && styles.btnDisabled]}
              onPress={signIn}
              disabled={busy}
              activeOpacity={0.85}
            >
              <View style={styles.gIcon}>
                <GoogleG size={22} />
              </View>
              <Text style={[styles.googleBtnText, { color: p.btnText }]}>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.8}>
              <View style={[styles.checkbox, { borderColor: p.checkBorder }, agreed && { backgroundColor: p.checkOn, borderColor: p.checkOn }]}>
                {agreed && <Text style={[styles.check, { color: p.checkMark }]}>✓</Text>}
              </View>
              <View style={styles.agreeTextWrap}>
                <Text style={[styles.agreeText, { color: p.agree }]}>
                  Agree to <Text style={[styles.link, { color: p.link }]} onPress={() => openLegal('terms')}>User Agreement</Text> &amp; <Text style={[styles.link, { color: p.link }]} onPress={() => openLegal('privacy')}>Privacy Policy</Text> and confirm I'm over 18
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={[styles.termsLine, { color: p.terms }]}>By continuing, you agree to our</Text>
            <Text style={styles.termsLinks}>
              <Text style={[styles.link, { color: p.link }]} onPress={() => openLegal('terms')}>Terms of Service</Text>
              <Text style={[styles.termsDot, { color: p.termsDot }]}>  ·  </Text>
              <Text style={[styles.link, { color: p.link }]} onPress={() => openLegal('privacy')}>Privacy Policy</Text>
            </Text>

            <Text style={[styles.footnote, { color: p.footnote }]}>18+ only · Sign in with your Google account</Text>
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
  agreeText: { flexShrink: 1, flexWrap: 'wrap', fontSize: 12.5, lineHeight: 18 },
  agreeTextWrap: { flex: 1, flexShrink: 1 },
  appIcon: { borderRadius: 22, height: 92, marginBottom: 10, width: 92 },
  bg: { flex: 1 },
  bottom: { marginTop: 'auto', paddingBottom: 8 },
  // Ocean Blue variant: the bottom section sits in a white card
  // that stretches full-width to the bottom edge of the screen.
  bottomCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginBottom: -24, marginHorizontal: -28, paddingBottom: 8, paddingHorizontal: 28, paddingTop: 22 },
  btnDisabled: { opacity: 0.65 },
  check: { fontSize: 13, fontWeight: 'bold', lineHeight: 15 },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 2,
    flexShrink: 0,
    height: 22,
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
    width: 22,
  },
  content: { flex: 1, paddingBottom: 24, paddingHorizontal: 28, paddingTop: 24 },
  footnote: { fontSize: 11, marginTop: 14, textAlign: 'center' },
  gIcon: { marginRight: 12 },
  // Google button: background + text colour come from the selected
  // login design (gold/cream on neon, panel primary on white/blue,
  // white on pink).
  googleBtn: {
    alignItems: 'center',
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
  googleBtnText: { fontSize: 16, fontWeight: '700' },
  hero: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  link: { fontWeight: '600', textDecorationLine: 'underline' },
  rule: { borderRadius: 2, height: 3, marginTop: 14, width: 48 },
  safe: { flex: 1 },
  subtitle: { fontSize: 16, fontWeight: '600', marginTop: 14, textAlign: 'center' },
  tagline: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  termsDot: {},
  termsLine: { fontSize: 12, marginTop: 16, textAlign: 'center' },
  termsLinks: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  title: {
    fontSize: 58,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
