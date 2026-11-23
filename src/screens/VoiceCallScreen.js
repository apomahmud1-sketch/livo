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
// call screen). Token: LiveVideo fetches a fresh token from the
// token server before joining (EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL,
// dev fallback EXPO_PUBLIC_AGORA_TOKEN) — see src/agora/LiveVideo.js.
// Signalling: same calls row as video — VideoCallScreen places the
// row on entry (placeCall) and this screen closes it on End
// (endCallRecord) with the voice rate; a real voice invite arrives
// with { callId, isCallee } in route.params and Accept already
// happened on the incoming screen in VideoCallScreen. The row id
// reaches this screen TWO ways: route.params.callId AND the callId
// prop VideoCallScreen passes explicitly (VideoCallScreen renders
// this screen with the same route object but never puts the
// outgoing callId into route.params, so the prop is what makes
// outgoing voice calls record at all).
// BILLING: only the caller (the paying viewer) is ever charged,
// and only when the Agora channel actually joined — a call that
// never connected costs nothing. A caller who ends while the row
// is still 'ringing' marks it 'missed' instead (nobody pays for
// an unanswered call). The host side only closes the row.
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
import { BackHandler, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, PLATFORM_COMMISSION_PERCENT } from '../config';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
import { fetchMyProfile } from '../supabase/auth';
import { leaveLiveRoom } from '../supabase/presence';
import { buildChannelName, endCallRecord, markCallMissed } from '../calls/signalling';
import LiveVideo, {
  getAgoraEngine,
  leaveAgoraChannel,
  setAgoraMuted,
  setAgoraSpeakerphone,
} from '../agora/LiveVideo';
// [F7] Voice changer — same pill/panel as video calls (see
// VideoCallScreen). The preset is reset on end so it never leaks
// into the next call.
import { VOICE_PRESETS, applyVoicePreset, getVoicePresetLabel, resetVoicePreset } from '../utils/voiceChanger';
// [F5] Full-screen gift animation for expensive gifts (price >= 1000 coins), same as video.
import FullScreenGift from '../components/FullScreenGift';

export default function VoiceCallScreen({ route, navigation, callId: callIdProp, callAcceptedRef, roomChannel, talkStarted }) {
  const { host, asHost, callId: routeCallId, isCallee } = route.params || {};
  // callId comes from VideoCallScreen two ways: the explicit prop
  // (outgoing calls — placed on entry) and route.params.callId
  // (the real invite row when answering). Null = local-only call.
  const callId = callIdProp || routeCallId || null;
  const { chargeVoiceCall, sendGift, showToast, getLiveVoiceCallRate, gifts } = useApp();
  // [Live] Voice rate from the store (live Supabase tiers when the
  // setup SQL is pasted, config.js demo tiers otherwise).
  const voiceRate = getLiveVoiceCallRate(host ? host.rateTier : 'tier2');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [connected, setConnected] = useState(false);
  // Did the local Agora channel actually join? Set by LiveVideo's
  // onJoin (onJoinChannelSuccess). A call that never joined is
  // never charged — onRemoteJoin alone is not enough (the remote
  // user may never arrive).
  const joinedRef = useRef(false);
  const timerRef = useRef(null);
  const endedRef = useRef(false);
  // endCall is defined below; the refs always point at the latest
  // ones so the guards run the current version (with the current
  // timer value). finishCall is the same path minus the toast +
  // navigation — the unmount guard calls that one, since the screen
  // is already leaving and the triggering path already toasted.
  const endCallRef = useRef(null);
  const finishCallRef = useRef(null);
  // [F7] Voice changer state (same as video calls).
  const [voicePreset, setVoicePreset] = useState('normal');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  // [F5] Gift currently playing the full-screen animation (null = none).
  const [bigGift, setBigGift] = useState(null);
  // The signed-in user's real username, for the full-screen gift
  // animation ("<name> sent"). Loaded once from their profiles row.
  const [senderName, setSenderName] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data && data.user && data.user.id;
        if (!uid) return;
        const { profile } = await fetchMyProfile(uid);
        if (!cancelled && profile && profile.username) setSenderName(profile.username);
      } catch (e) {
        // Anonymous — the gift animation falls back to 'You'.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Voice calls default to the loudspeaker; restore the earpiece
  // when the screen unmounts.
  useEffect(() => {
    setAgoraSpeakerphone(true);
    return () => {
      setAgoraSpeakerphone(false);
    };
  }, []);

  // Unmount while still in a call (hardware back, gesture, remote
  // end): run the SAME finishCall path (charge + record) instead
  // of silently dropping a free call — minus the toast and
  // navigation, which the triggering path already handled.
  useEffect(() => () => {
    if (!endedRef.current && finishCallRef.current) finishCallRef.current();
  }, []);

  // Hardware back ends the call through the same endCall path.
  // (Registered after VideoCallScreen's own back handler, so this
  // one runs first for voice calls and VideoCallScreen's video-only
  // guard never fires here.)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (endCallRef.current) endCallRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Talk time starts when the call is actually answered — the
  // parent (VideoCallScreen) owns that moment and passes it down
  // as talkStarted. Ring time is never billed: the timer and the
  // per-minute billing both run off `seconds`.
  useEffect(() => {
    if (!talkStarted) return undefined;
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [talkStarted]);

  // No balance gate here: the callee is the host, who is paid —
  // never charged — so a host with 0 coins must still be able to
  // answer. The caller was already gated by VideoCallScreen's
  // auto-place before this screen mounted.

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

  // Core end-of-call work: stop the timer, reset the voice preset,
  // leave Agora + the presence room, and bill / close the
  // signalling row. Idempotent (endedRef) — safe to run from the
  // End button, the hardware-back guard and the unmount guard.
  // No toast, no navigation: the caller adds those.
  // Core end-of-call work: stop the timer, reset the voice preset,
  // leave Agora + the presence room, and bill / close the
  // signalling row. Idempotent (endedRef) — safe to run from the
  // End button, the hardware-back guard and the unmount guard.
  // Async: the charge is awaited before the calls row is written,
  // so the row never claims a cost that was never deducted
  // (chargeVoiceCall resolves to { cost } once its wallet write
  // settles, or false when refused / failed). Fire-and-forget
  // from the guards — the promise chain runs on after unmount.
  const finishCall = async () => {
    if (endedRef.current) {
      return;
    }
    endedRef.current = true;
    clearInterval(timerRef.current);
    leaveAgoraChannel();
    // [F7] The Agora engine is a shared singleton — reset the voice
    // so the effect does not leak into the next call.
    resetVoicePreset(getAgoraEngine());
    // Leave the live-room presence channel VideoCallScreen joined
    // for this call (its unmount cleanup leaves it again —
    // leaveLiveRoom is safe to call twice).
    if (roomChannel) {
      leaveLiveRoom(roomChannel).catch(() => {});
    }
    // Billing: ONLY the caller (the paying viewer) is ever
    // charged — never the host answering (isCallee) or going live
    // (asHost). And only when the Agora channel actually joined:
    // a call that never connected costs nothing.
    const iAmCaller = !isCallee && !asHost;
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    if (callId) {
      const accepted = callAcceptedRef ? !!callAcceptedRef.current : false;
      if (iAmCaller && !accepted) {
        // Still ringing — the callee never answered: missed, and
        // nobody pays for an unanswered call.
        markCallMissed(callId).catch(() => {});
      } else if (iAmCaller && joinedRef.current) {
        // Await the settled charge first: only write the cost the
        // wallet actually deducted.
        const settled = await chargeVoiceCall(host, minutes);
        if (settled && typeof settled.cost === 'number') {
          // Close the signalling row with the voice billing (half
          // the video tier rate — chargeVoiceCall already used it).
          // Host share = cost after the platform commission, in
          // diamonds.
          const hostShare = Math.round((settled.cost * (100 - PLATFORM_COMMISSION_PERCENT)) / 100);
          endCallRecord(callId, {
            durationSeconds: seconds,
            billedMinutes: minutes,
            costCoins: settled.cost,
            hostEarningsDiamonds: hostShare,
          }).catch(() => {});
        } else {
          // Charge refused (e.g. balance dropped mid-call) or the
          // wallet write failed — still close the row so the other
          // side is released, with no cost claimed.
          endCallRecord(callId, {
            durationSeconds: seconds,
            billedMinutes: 0,
            costCoins: 0,
            hostEarningsDiamonds: 0,
          }).catch(() => {});
        }
      } else {
        // Host side, or a caller whose Agora channel never joined:
        // close the row with no charge. endCallRecord never
        // overwrites a finished billing record the other side
        // already wrote (see signalling.js).
        endCallRecord(callId, {
          durationSeconds: seconds,
          billedMinutes: 0,
          costCoins: 0,
          hostEarningsDiamonds: 0,
        }).catch(() => {});
      }
    }
  };

  const endCall = () => {
    finishCall();
    // No call summary for anyone (same rule as video calls): the
    // host sees the earnings in the Host Dashboard. Just go back.
    showToast('কল শেষ হয়েছে');
    navigation.goBack();
  };
  endCallRef.current = endCall;
  finishCallRef.current = finishCall;

  const toggleMute = () => {
    setMuted(!muted);
    setAgoraMuted(!muted);
  };

  const toggleSpeaker = () => {
    setSpeaker(!speaker);
    setAgoraSpeakerphone(!speaker);
  };

  // [F5] Send a gift: charge coins via the store first, then show the
  // full-screen animation ONLY for expensive gifts. Cheap gifts keep
  // the old toast-only behaviour (sendGift already toasted).
  // Same threshold as video calls: >= 1000 coins.
  const EXPENSIVE_GIFT_MIN_COINS = 1000;
  const handleSendGift = (gift) => {
    if (!sendGift(gift, host)) return; // not enough coins — toast already shown
    if (gift.price >= EXPENSIVE_GIFT_MIN_COINS) {
      setBigGift(gift);
    }
  };

  // [F7] Apply a voice preset to the live Agora engine. If the engine
  // is not ready (no native module / not joined yet) the helper
  // returns false and the voice simply stays as it was.
  const selectVoice = (presetId) => {
    const ok = applyVoicePreset(getAgoraEngine(), presetId);
    if (ok) {
      setVoicePreset(presetId);
      showToast(
        presetId === 'normal'
          ? 'Voice: Normal — your real voice'
          : `Voice: ${getVoicePresetLabel(presetId)}`,
      );
    } else {
      showToast('Voice changer is not available in this call yet.');
    }
  };
  // [/F7]

  return (
    <LinearGradient colors={[COLORS.purpleDark, COLORS.purple, COLORS.pink]} style={styles.bg}>
      {host.photo ? (
        <Image source={host.photo} style={styles.avatarImg} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: host.color || COLORS.purple }]}>
          <Text style={styles.avatarLetter}>{host.name[0]}</Text>
        </View>
      )}
      <Text style={styles.name}>{host.name}</Text>
      <Text style={styles.sub}>
        {connected ? 'Voice connected' : 'Calling…'} · {voiceRate.label}
      </Text>
      <Text style={styles.timer}>{mm}:{ss} · 🪙 {liveCost} coins</Text>

      <LiveVideo
        channel={buildChannelName(host.id)}
        role="host"
        audioOnly
        style={styles.audioStatus}
        onRemoteJoin={() => setConnected(true)}
        onRemoteLeave={() => setConnected(false)}
        onJoin={() => {
          joinedRef.current = true;
        }}
        onJoinError={() => {
          joinedRef.current = false;
        }}
        onTokenExpiring={() => showToast('Call token expiring — the call may end soon.')}
        onTokenRenewalFailed={() => showToast('Could not renew the call token — the call may drop soon.')}
      />

      {/* All gifts, horizontally scrollable — same as video calls. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.giftRow} style={styles.giftScroll}>
        {gifts.map((g) => (
          <TouchableOpacity key={g.id} style={styles.gift} onPress={() => handleSendGift(g)}>
            <Text style={styles.giftEmoji}>{g.emoji}</Text>
            <Text style={styles.giftPrice}>{g.price}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* [F7] Voice changer: a pill button opens the preset panel,
          same as video calls. */}
      <TouchableOpacity
        style={styles.voicePill}
        onPress={() => setVoicePanelOpen(!voicePanelOpen)}
      >
        <Text style={styles.voicePillText}>
          🎤 Voice: {getVoicePresetLabel(voicePreset)} {voicePanelOpen ? '▴' : '▾'}
        </Text>
      </TouchableOpacity>
      {voicePanelOpen ? (
        <View style={styles.voicePanel}>
          {VOICE_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.voiceChip, voicePreset === p.id && styles.voiceChipOn]}
              onPress={() => selectVoice(p.id)}
            >
              <Text style={styles.voiceChipEmoji}>{p.emoji}</Text>
              <Text style={[styles.voiceChipText, voicePreset === p.id && styles.voiceChipTextOn]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {/* [/F7] */}

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
      {/* [F5] Full-screen animation overlay for an expensive gift. senderName is the signed-in user's real username (fetched from their profiles row), not demo data. */}
      <FullScreenGift gift={bigGift} senderName={senderName || 'You'} visible={!!bigGift} onDone={() => setBigGift(null)} />
      <Text style={styles.hint}>
        Voice call · Mic {muted ? 'muted' : 'on'} · Speaker {speaker ? 'on' : 'off'} · Voice {getVoicePresetLabel(voicePreset)} · Audio via Agora
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  audioStatus: { alignSelf: 'stretch', marginTop: 20 },
  avatar: { alignItems: 'center', borderRadius: 60, height: 120, justifyContent: 'center', marginTop: 24, width: 120 },
  // Real host photo when the host has one (same shape as the
  // incoming screen in VideoCallScreen); otherwise the initial tile.
  avatarImg: { borderRadius: 60, height: 120, marginTop: 24, width: 120 },
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
  // Gift row — same as video calls: all gifts, horizontal scroll.
  gift: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, marginHorizontal: 6, padding: 8, width: 64 },
  giftEmoji: { fontSize: 26 },
  giftPrice: { color: '#fff', fontSize: 12 },
  giftRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  giftScroll: { alignSelf: 'stretch', marginTop: 16, maxHeight: 76 },
  hint: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 16, textAlign: 'center' },
  name: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  timer: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  title: { color: COLORS.dark, fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  // [F7] Voice changer panel styles (same as video calls).
  voiceChip: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, margin: 4, paddingVertical: 8, width: 96 },
  voiceChipEmoji: { fontSize: 22 },
  voiceChipOn: { backgroundColor: COLORS.pink },
  voiceChipText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginTop: 2 },
  voiceChipTextOn: { color: '#fff' },
  voicePanel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  voicePill: { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 },
  voicePillText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  // [/F7]
});
