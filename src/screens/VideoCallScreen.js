import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GIFTS, getCallRate } from '../config';
import { useApp } from '../store';
import LiveVideo, {
  leaveAgoraChannel,
  setAgoraBeauty,
  setAgoraMuted,
  switchAgoraCamera,
} from '../agora/LiveVideo';

// ─────────────────────────────────────────────────────────────────
// 1-to-1 video call. States: 'incoming' → 'calling' → 'summary'.
// Billing: per-minute rate from the host's call-rate tier
// (admin can change all 5 tiers in the admin panel). Cost is
// charged when the call ends, billed per started minute.
// Real video: <LiveVideo> joins the Agora channel
// `livo-call-<hostId>` when the call is accepted. The mic,
// camera-switch and beauty buttons below call the real Agora
// engine (mute / switchCamera / beauty filter). The token comes
// from EXPO_PUBLIC_AGORA_TOKEN (Temp Token for testing) or the
// token prop — see src/agora/LiveVideo.js.
// ─────────────────────────────────────────────────────────────────
export default function VideoCallScreen({ route, navigation }) {
  const { host } = route.params || {};
  const { coins, chargeCall, sendGift, showToast } = useApp();
  const rate = getCallRate(host ? host.rateTier : 'tier2');
  const [stage, setStage] = useState('incoming');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [beauty, setBeauty] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [summary, setSummary] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (stage === 'calling') {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [stage]);

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
  const liveCost = Math.ceil(seconds / 60) * rate.coinsPerMinute;

  const accept = () => {
    if (coins < rate.coinsPerMinute) {
      showToast('Not enough coins for 1 minute — please recharge first.');
      return;
    }
    setStage('calling');
  };

  const endCall = () => {
    clearInterval(timerRef.current);
    leaveAgoraChannel();
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const cost = chargeCall(host, minutes, rate.coinsPerMinute);
    setSummary({ minutes, seconds, cost: cost === false ? 0 : cost, paid: cost !== false });
    setStage('summary');
  };

  const toggleMute = () => {
    setMuted(!muted);
    setAgoraMuted(!muted);
  };

  const toggleCamera = () => {
    setFrontCamera(!frontCamera);
    switchAgoraCamera();
  };

  const toggleBeauty = () => {
    setBeauty(!beauty);
    setAgoraBeauty(!beauty);
  };

  if (stage === 'incoming') {
    return (
      <LinearGradient colors={[COLORS.purpleDark, COLORS.purple, COLORS.pink]} style={styles.center}>
        <Text style={styles.avatarBig}>{host.name[0]}</Text>
        <Text style={styles.title}>{host.name}</Text>
        <Text style={styles.sub}>{host.flag} {host.country} · {rate.label} · {rate.name}</Text>
        <Text style={styles.sub}>Incoming video call…</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.btnDecline]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnText}>✕ Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={accept}>
            <Text style={styles.btnText}>✓ Accept</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  if (stage === 'summary') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Call summary</Text>
        <Text style={styles.sub}>With {host.name}</Text>
        <Text style={styles.summaryLine}>Duration: {mm}:{ss} ({summary.minutes} min billed)</Text>
        <Text style={styles.summaryLine}>Rate: {rate.coinsPerMinute} coins / min ({rate.name})</Text>
        <Text style={styles.summaryLine}>
          {summary.paid ? `Total cost: ${summary.cost} coins` : 'Not charged — not enough coins'}
        </Text>
        <Text style={styles.summaryLine}>Balance: {coins.toLocaleString()} coins</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // calling
  return (
    <View style={styles.callBg}>
      <LiveVideo channel={`livo-call-${host.id}`} role="host" style={styles.video} />
      <Text style={styles.timer}>{mm}:{ss} · 🪙 {liveCost} coins</Text>
      <Text style={styles.callName}>{host.name} · {rate.label}</Text>

      <View style={styles.giftRow}>
        {GIFTS.slice(0, 4).map((g) => (
          <TouchableOpacity key={g.id} style={styles.gift} onPress={() => sendGift(g)}>
            <Text style={styles.giftEmoji}>{g.emoji}</Text>
            <Text style={styles.giftPrice}>{g.price}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.ctrl, muted && styles.ctrlOff]} onPress={toggleMute}>
          <Text style={styles.ctrlText}>{muted ? '🔇' : '🎙️'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ctrl} onPress={toggleCamera}>
          <Text style={styles.ctrlText}>🔄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrl, beauty && styles.ctrlOn]} onPress={toggleBeauty}>
          <Text style={styles.ctrlText}>✨</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ctrl, styles.endBtn]} onPress={endCall}>
          <Text style={styles.ctrlText}>📞</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Beauty {beauty ? 'on' : 'off'} · Mic {muted ? 'muted' : 'on'} · Live video via Agora</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBig: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 60, color: '#fff', fontSize: 64, fontWeight: 'bold', height: 120, lineHeight: 120, overflow: 'hidden', textAlign: 'center', width: 120 },
  btn: { backgroundColor: COLORS.purple, borderRadius: 24, marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  btnAccept: { backgroundColor: COLORS.green, marginLeft: 12 },
  btnDecline: { backgroundColor: '#ef4444' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  callBg: { backgroundColor: '#111827', flex: 1, padding: 16, paddingTop: 48 },
  callName: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 8, textAlign: 'center' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  controls: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  ctrl: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 30, height: 60, justifyContent: 'center', marginHorizontal: 8, width: 60 },
  ctrlOff: { backgroundColor: '#ef4444' },
  ctrlOn: { backgroundColor: COLORS.pink },
  ctrlText: { fontSize: 24 },
  endBtn: { backgroundColor: '#ef4444' },
  gift: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, marginHorizontal: 6, padding: 8, width: 64 },
  giftEmoji: { fontSize: 26 },
  giftPrice: { color: '#fff', fontSize: 12 },
  giftRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  hint: { color: '#9ca3af', fontSize: 12, marginTop: 16, textAlign: 'center' },
  row: { flexDirection: 'row', marginTop: 8 },
  sub: { color: '#e5e7eb', fontSize: 15, marginTop: 6, textAlign: 'center' },
  summaryLine: { color: COLORS.dark, fontSize: 16, marginTop: 8 },
  timer: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  title: { color: COLORS.dark, fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  video: { height: 300 },
});
