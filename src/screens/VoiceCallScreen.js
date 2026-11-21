// ─────────────────────────────────────────────────────────────────
// Livo — VoiceCallScreen [F2] (NEW FILE — audio-only 1-to-1 call)
// ─────────────────────────────────────────────────────────────────
// Audio-only variant of VideoCallScreen. Reached from:
//   • a host card on Home (📞 button) — navigation param
//     { host, audioOnly: true } on the 'VideoCall' route, or
//   • ChatDetailScreen (📞 button) — same params.
// VideoCallScreen renders this screen when route.params.audioOnly
// is true; the video path is untouched.
//
// AUDIO: <LiveVideo audioOnly> joins the same Agora channel as a
// video call (`livo-call-<hostId>`) with audio only — no camera
// track published, no video subscribed, no video surface rendered.
// The caller publishes mic only (role "host", same as the video
// call screen). Token rules are identical to video (Temp Token for
// testing, token server for production — see src/agora/LiveVideo.js).
//
// BILLING: voice rate = HALF the host's video tier, derived via
// getLiveVoiceCallRate() from the store (live Supabase tiers when
// the setup SQL is pasted, config.js demo tiers otherwise —
// 30/60/150/300/600 coins/min for video tiers 60/120/300/600/1200). Charged on end, per started
// minute, through store.chargeVoiceCall — same rule as video.
// CALL SUMMARY: there is none. When the call ends, everyone goes
// straight back (toast only) — the host sees the earnings in the
// Host Dashboard (same rule as video calls, 2026-11-18).
// The host side: route.params.asHost skips the balance gate and
// starts the call at once (same convention as VideoCallScreen).
// NOTE: the incoming-call screen is NOT changed by F2 — an incoming
// voice call still lands on the existing incoming screen, which
// opens the video call. Routing an incoming voice accept into this
// screen is follow-up work, not part of F2.
// ─────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { useApp } from '../store';
import LiveVideo, {
  leaveAgoraChannel,
  setAgoraMuted,
  setAgoraSpeakerphone,
} from '../agora/LiveVideo';

export default function VoiceCallScreen({ route, navigation }) {
  const { host, asHost } = route.params || {};
  const { coins, chargeVoiceCall, showToast, getLiveVoiceCallRate } = useApp();
  // [Live] Voice rate from the store (live Supabase tiers when the
  // setup SQL is pasted, config.js demo tiers otherwise).
  const voiceRate = getLiveVoiceCallRate(host ? host.rateTier : 'tier2');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [connected, setConnected] = useState(false);
  const timerRef = useRef(null);
  const endedRef = useRef(false);
  const gateCheckedRef = useRef(false);

  // Voice calls default to the loudspeaker; restore the earpiece
  // when the screen unmounts.
  useEffect(() => {
    setAgoraSpeakerphone(true);
    return () => {
      setAgoraSpeakerphone(false);
    };
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Balance gate (caller side only): need at least 1 voice minute.
  // Runs once — if the balance is too low, toast and go back.
  useEffect(() => {
    if (gateCheckedRef.current || asHost || !host) {
      return;
    }
    gateCheckedRef.current = true;
    if (coins < voiceRate.coinsPerMinute) {
      showToast('Not enough coins for 1 minute — please recharge first.');
      navigation.goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!host) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No host selected</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const liveCost = Math.ceil(seconds / 60) * voiceRate.coinsPerMinute;

  const endCall = () => {
    if (endedRef.current) {
      return;
    }
    endedRef.current = true;
    clearInterval(timerRef.current);
    leaveAgoraChannel();
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    chargeVoiceCall(host, minutes);
    // No call summary for anyone (same rule as video calls): the
    // host sees the earnings in the Host Dashboard. Just go back.
    showToast('কল শেষ হয়েছে');
    navigation.goBack();
  };

  const toggleMute = () => {
    setMuted(!muted);
    setAgoraMuted(!muted);
  };

  const toggleSpeaker = () => {
    setSpeaker(!speaker);
    setAgoraSpeakerphone(!speaker);
  };

  return (
    <LinearGradient colors={[COLORS.purpleDark, COLORS.purple, COLORS.pink]} style={styles.bg}>
      <View style={[styles.avatar, { backgroundColor: host.color || COLORS.purple }]}>
        <Text style={styles.avatarLetter}>{host.name[0]}</Text>
      </View>
      <Text style={styles.name}>{host.name}</Text>
      <Text style={styles.sub}>
        {connected ? 'Voice connected' : 'Calling…'} · {voiceRate.label}
      </Text>
      <Text style={styles.timer}>{mm}:{ss} · 🪙 {liveCost} coins</Text>

      <LiveVideo
        channel={`livo-call-${host.id}`}
        role="host"
        audioOnly
        style={styles.audioStatus}
        onRemoteJoin={() => setConnected(true)}
        onRemoteLeave={() => setConnected(false)}
      />

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrl, muted && styles.ctrlOff]} onPress={toggleMute}>
          <Text style={styles.ctrlText}>{muted ? '🔇' : '🎙️'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrl, speaker && styles.ctrlOn]} onPress={toggleSpeaker}>
          <Text style={styles.ctrlText}>🔊</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrl, styles.endBtn]} onPress={endCall}>
          <Text style={styles.ctrlText}>📞</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Voice call · Mic {muted ? 'muted' : 'on'} · Speaker {speaker ? 'on' : 'off'} · Audio via Agora
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  audioStatus: { alignSelf: 'stretch', marginTop: 20 },
  avatar: { alignItems: 'center', borderRadius: 60, height: 120, justifyContent: 'center', marginTop: 24, width: 120 },
  avatarLetter: { color: '#fff', fontSize: 56, fontWeight: 'bold' },
  bg: { alignItems: 'center', flex: 1, padding: 24, paddingTop: 64 },
  btn: { backgroundColor: COLORS.purple, borderRadius: 24, marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  controls: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  ctrl: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 30, height: 60, justifyContent: 'center', marginHorizontal: 8, width: 60 },
  ctrlOff: { backgroundColor: '#ef4444' },
  ctrlOn: { backgroundColor: COLORS.pink },
  ctrlText: { fontSize: 24 },
  endBtn: { backgroundColor: '#ef4444' },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 16, textAlign: 'center' },
  name: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  timer: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  title: { color: COLORS.dark, fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
});
