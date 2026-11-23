import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, PLATFORM_COMMISSION_PERCENT } from '../config';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
import { fetchMyProfile } from '../supabase/auth';
import { joinLiveRoom, leaveLiveRoom } from '../supabase/presence';
// [Calls] Real signalling over Supabase Realtime (src/calls/signalling.js):
// an OUTGOING call places its ringing row at once (no self-accept
// step — see placeOutgoingCall); the callee's app (listening via
// useIncomingCallListener at the app root) navigates here with
// { callId, isCallee, caller }; Accept/Decline/End update the row
// and the other side sees it through its subscription.
import {
  acceptCall,
  buildChannelName,
  declineCall,
  endCallRecord,
  markCallMissed,
  placeCall,
  subscribeToCallUpdates,
} from '../calls/signalling';
// [F5] Full-screen gift animation for expensive gifts (price >= 1000 coins)
import FullScreenGift from '../components/FullScreenGift';
// [/F5]
import LiveVideo, {
  getAgoraEngine,
  leaveAgoraChannel,
  setAgoraBeauty,
  setAgoraMuted,
  switchAgoraCamera,
} from '../agora/LiveVideo';
import VoiceCallScreen from './VoiceCallScreen'; // [F2] audio-only variant
// [F7] Voice changer — Agora voice presets, see src/utils/voiceChanger.js
import { VOICE_PRESETS, applyVoicePreset, getVoicePresetLabel, resetVoicePreset } from '../utils/voiceChanger';
// [/F7]

// ─────────────────────────────────────────────────────────────────
// 1-to-1 video call. States: 'incoming' → 'calling'.
// Billing: per-minute rate from the host's call-rate tier
// (admin can change all 5 tiers in the admin panel). Cost is
// charged when the call ends, billed per started minute.
// INCOMING screen shows ONLY the caller's photo, name and the
// red Decline / green Accept buttons — no rate line, no
// "Incoming video call…" text (user's correction 2026-11-18).
// CALL SUMMARY: there is none. When a call ends, everyone goes
// straight back (toast only) — the host sees the call earnings in
// the Host Dashboard (user's correction 2026-11-18: no summary
// screen at all, the host already sees it in the dashboard).
// VideoCallScreen reads route.params.asHost (default false) only
// to skip the incoming stage for the host entry: the host starts
// live at once and never accepts their own call.
// The host opens the call with asHost: true (Host Dashboard
// Go Live + Imran Accept); Home cards open it as the viewer.
// An OUTGOING call (not asHost, not isCallee) starts in 'calling'
// at once and rings the host immediately — the caller no longer
// sees their own incoming screen and taps Accept first.
// Real video: <LiveVideo> joins the Agora channel
// `livo-call-<hostId>` when the call is accepted, fetching a fresh
// token from the token server first (EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL,
// dev fallback EXPO_PUBLIC_AGORA_TOKEN) — see src/agora/LiveVideo.js.
// Signalling: the caller inserts a ringing row in the calls table
// on entry (placeCall); the callee arrives here via
// useIncomingCallListener with { callId, isCallee, caller } and the
// incoming screen shows the REAL caller. Accept/Decline/End update
// the row (acceptCall / declineCall / endCallRecord) and the other
// side sees it through its Realtime subscription. A caller who ends
// (or waits out the 60s ring timeout) while the row is still
// 'ringing' marks it 'missed' instead — nobody pays for an
// unanswered call. No push exists:
// the callee only rings while their app is open.
// BILLING: only the caller (the paying viewer) is ever charged,
// and only when the Agora channel actually joined — a call that
// never connected costs nothing. The host side only closes the
// signalling row; endCallRecord never overwrites a finished
// billing record the other side already wrote.
// ─────────────────────────────────────────────────────────────────
// How long the caller waits for an answer before the call is
// marked missed (the callee never answered).
const RING_TIMEOUT_MS = 60 * 1000;
export default function VideoCallScreen({ route, navigation }) {
  const { host, asHost, audioOnly: audioOnlyParam, callId: incomingCallId, callType, isCallee, caller } = route.params || {}; // [F2] audioOnly added; [Calls] callId/isCallee/caller for real invites
  // Voice invites (callType 'voice') render the audio-only screen,
  // exactly like the audioOnly param from ChatDetail.
  const audioOnly = audioOnlyParam || callType === 'voice';
  // The calls row for this call (placed on entry for outgoing
  // calls, or the invite row when answering). Null = local-only
  // call (demo host or not signed in) — the call still works, it
  // just has no signalling.
  // Outgoing call: this user placed it (not the host going live,
  // not the callee answering). Outgoing calls start in 'calling'
  // and ring at once — no self-accept step.
  const isOutgoingCall = !asHost && !isCallee;
  const callIdRef = useRef(incomingCallId || null);
  const callUnsubRef = useRef(null);
  const roomChannelRef = useRef(null);
  // Did the callee accept? Set by the caller's row subscription
  // ('accepted') and by the callee's own Accept tap. A call that
  // ends while this is still false was never answered (missed).
  const callAcceptedRef = useRef(false);
  // Did the local Agora channel actually join? Set by LiveVideo's
  // onJoin (onJoinChannelSuccess). A call that never joined is
  // never charged.
  const joinedRef = useRef(false);
  // endCall is defined below; the ref always points at the latest
  // one so the hardware-back guard runs the current version (with
  // the current timer value). finishCall is the same path minus
  // the toast + navigation — the unmount guard calls that one,
  // since the screen is already leaving and the triggering path
  // already toasted (or there is nothing to say).
  const endedRef = useRef(false);
  const endCallRef = useRef(null);
  const finishCallRef = useRef(null);
  const stageRef = useRef(asHost || isOutgoingCall ? 'calling' : 'incoming');
  const ringTimerRef = useRef(null);
  const placeAttemptedRef = useRef(false);
  useEffect(() => () => {
    if (callUnsubRef.current) callUnsubRef.current();
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    if (roomChannelRef.current) leaveLiveRoom(roomChannelRef.current);
    // Unmount while still in a call (hardware back, gesture,
    // remote end): run the SAME endCall path (charge + record)
    // instead of silently dropping a free call — minus the toast
    // and navigation, which the triggering path already handled.
    // Video only — voice calls are ended by VoiceCallScreen's
    // own guard.
    if (!audioOnly && stageRef.current === 'calling' && finishCallRef.current) {
      finishCallRef.current();
    }
  }, []);
  const { coins, chargeCall, sendGift, showToast, vipLevel, gifts, getLiveCallRate, getLiveVoiceCallRate } = useApp();
  // [Live] Rates + gifts come from the store (live Supabase rows
  // when the setup SQL is pasted, config.js demo values otherwise).
  const rate = getLiveCallRate(host ? host.rateTier : 'tier2');
  const [stage, setStage] = useState(asHost || isOutgoingCall ? 'calling' : 'incoming');
  stageRef.current = stage;
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
  const [seconds, setSeconds] = useState(0);
  // Talk time starts when the call is actually answered (caller:
  // invite accepted; callee: Accept tapped; host going live:
  // channel joined) — NOT while it is still ringing. The timer
  // and the per-minute billing both run off `seconds`, so ringing
  // time is never billed.
  const [talkStarted, setTalkStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [beauty, setBeauty] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  // [F5] Gift currently playing the full-screen animation (null = none).
  // Only expensive gifts (price >= EXPENSIVE_GIFT_MIN_COINS) ever set this.
  const [bigGift, setBigGift] = useState(null);
  // [/F5]
  // [F7] Voice changer state. 'normal' = your real voice. The panel
  // is closed by default so the call controls stay uncluttered.
  const [voicePreset, setVoicePreset] = useState('normal');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  // [/F7]
  // [Vero] Rare Vehicle — Premium members get a vehicle entrance
  // effect when a call starts: a car slides across the screen once.
  const vehicleX = useRef(new Animated.Value(-140)).current;
  useEffect(() => {
    if (stage === 'calling' && vipLevel) {
      vehicleX.setValue(-140);
      Animated.timing(vehicleX, { toValue: Dimensions.get('window').width + 140, duration: 2600, useNativeDriver: true }).start();
    }
  }, [stage, vipLevel, vehicleX]);
  // [/Vero]
  const timerRef = useRef(null);

  useEffect(() => {
    if (stage === 'calling' && talkStarted) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [stage, talkStarted]);

  // [Presence] Join the live-room presence channel when the call
  // connects, so the host's viewer count is real (see
  // src/supabase/presence.js). Leaves on unmount / endCall.
  useEffect(() => {
    if (stage !== 'calling') return undefined;
    let cancelled = false;
    (async () => {
      let viewer = { id: undefined, name: 'Guest' };
      try {
        const { data } = await supabase.auth.getUser();
        const u = data && data.user;
        if (u) {
          viewer = {
            id: u.id,
            name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || 'Guest',
          };
        }
      } catch (e) {
        // Anonymous viewer — presence still counts the join.
      }
      if (cancelled) return;
      roomChannelRef.current = joinLiveRoom(host && host.id, viewer);
    })();
    return () => {
      cancelled = true;
      if (roomChannelRef.current) {
        leaveLiveRoom(roomChannelRef.current);
        roomChannelRef.current = null;
      }
    };
  }, [stage, host]);

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

  // Callee side: watch the invite row while the incoming screen
  // is up, so it dismisses itself if the caller backs out
  // (row → 'missed') or the call ends elsewhere. The caller-side
  // subscription (placeOutgoingCall) covers the outgoing side.
  useEffect(() => {
    if (!isCallee || !callIdRef.current) return undefined;
    const unsub = subscribeToCallUpdates(callIdRef.current, (updated) => {
      if (updated.status === 'missed') {
        showToast('Caller cancelled the call');
        navigation.goBack();
      } else if (updated.status === 'ended') {
        navigation.goBack();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallee]);

  // Hardware back during a video call ends the call through the
  // SAME endCall path (charge + record) instead of popping
  // silently. Voice calls are handled by VoiceCallScreen's own
  // guard; the incoming screen keeps the default back behaviour
  // (the root handler pops it).
  useEffect(() => {
    if (stage !== 'calling' || audioOnly) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (endCallRef.current) endCallRef.current();
      return true;
    });
    return () => sub.remove();
  }, [stage, audioOnly]);

  // Outgoing call: ring the host at once — the caller no longer
  // sees their own incoming screen and taps Accept first. The
  // balance gate runs here instead: too few coins for 1 minute
  // goes back with a toast, exactly as Accept used to. Null row
  // when there is no signed-in user or no DB host row (demo host):
  // the call then proceeds local-only, as before.
  const placeOutgoingCall = async () => {
    if (!host || placeAttemptedRef.current) return;
    placeAttemptedRef.current = true;
    // Voice calls bill at the half-price voice rate, video at the
    // full tier rate.
    const perMinute = audioOnly
      ? getLiveVoiceCallRate(host ? host.rateTier : 'tier2').coinsPerMinute
      : rate.coinsPerMinute;
    if (coins < perMinute) {
      showToast('Not enough coins for 1 minute — please recharge first.');
      navigation.goBack();
      return;
    }
    try {
      const row = await placeCall({
        host,
        callType: audioOnly ? 'voice' : 'video',
        ratePerMinute: perMinute,
      });
      if (row) {
        callIdRef.current = row.id;
        callUnsubRef.current = subscribeToCallUpdates(row.id, (updated) => {
          if (updated.status === 'accepted') {
            callAcceptedRef.current = true;
            setTalkStarted(true);
            if (ringTimerRef.current) {
              clearTimeout(ringTimerRef.current);
              ringTimerRef.current = null;
            }
          } else if (updated.status === 'declined') {
            showToast('Call declined');
            navigation.goBack();
          } else if (updated.status === 'ended') {
            navigation.goBack();
          }
        });
        // Ring timeout: nobody answered in time — mark the call
        // missed and leave. The unmount guard's endCall would do
        // the same marking; the timer also toasts so the caller
        // knows why the call ended.
        ringTimerRef.current = setTimeout(() => {
          ringTimerRef.current = null;
          if (!callAcceptedRef.current && callIdRef.current) {
            markCallMissed(callIdRef.current).catch(() => {});
          }
          showToast('No answer');
          navigation.goBack();
        }, RING_TIMEOUT_MS);
      }
    } catch (e) {
      // Signalling failure never blocks the call itself.
    }
  };

  // Outgoing calls start in 'calling' — place the invite row on
  // entry. (Incoming / host entries never run this.)
  useEffect(() => {
    if (stage !== 'calling' || !isOutgoingCall) return undefined;
    placeOutgoingCall();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const accept = async () => {
    // Callee only now — outgoing calls ring at once (see
    // placeOutgoingCall) and never show this screen. No balance
    // gate here: the callee is the host, who is paid — never
    // charged — so a host with 0 coins must still be able to
    // answer. The caller was already gated in placeOutgoingCall.
    if (isCallee && callIdRef.current) {
      // Answering a real invite: mark the row accepted so the
      // caller knows (their subscription fires). A failure here
      // must not block the call itself — still join the channel.
      acceptCall(callIdRef.current).catch(() => {});
      callAcceptedRef.current = true;
    }
    setTalkStarted(true);
    setStage('calling');
  };

  // Decline from the incoming screen: for a real invite this marks
  // the row declined so the caller sees it at once.
  const decline = () => {
    if (isCallee && callIdRef.current) {
      declineCall(callIdRef.current).catch(() => {});
    }
    navigation.goBack();
  };

  // Core end-of-call work: stop timers, reset the voice preset,
  // leave Agora + the presence room, and bill / close the
  // signalling row. Idempotent (endedRef) — safe to run from the
  // End button, the hardware-back guard and the unmount guard.
  // No toast, no navigation: the caller adds those. Async: the
  // charge is awaited before the calls row is written, so the row
  // never claims a cost that was never deducted (chargeCall
  // resolves to { cost } once its wallet write settles, or false
  // when refused / failed). Fire-and-forget from the guards — the
  // promise chain runs on after unmount.
  const finishCall = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearInterval(timerRef.current);
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (callUnsubRef.current) callUnsubRef.current();
    // [F7] The Agora engine is a shared singleton — reset the voice
    // so the effect does not leak into the next call.
    resetVoicePreset(getAgoraEngine());
    // [/F7]
    leaveAgoraChannel();
    if (roomChannelRef.current) {
      leaveLiveRoom(roomChannelRef.current);
      roomChannelRef.current = null;
    }
    // Billing: ONLY the caller (the paying viewer) is ever
    // charged — never the host answering (isCallee) or going live
    // (asHost). And only when the Agora channel actually joined:
    // a call that never connected costs nothing.
    const iAmCaller = !isCallee && !asHost;
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const rowId = callIdRef.current;
    callIdRef.current = null;
    if (rowId) {
      if (iAmCaller && !callAcceptedRef.current) {
        // Still ringing — the callee never answered: missed, and
        // nobody pays for an unanswered call.
        markCallMissed(rowId).catch(() => {});
      } else if (iAmCaller && joinedRef.current) {
        // Await the settled charge first: only write the cost the
        // wallet actually deducted.
        const settled = await chargeCall(host, minutes, rate.coinsPerMinute);
        if (settled && typeof settled.cost === 'number') {
          // Record the finished call on the signalling row (billing
          // already happened in the store above). Host share = cost
          // after the platform commission, in diamonds.
          const hostShare = Math.round((settled.cost * (100 - PLATFORM_COMMISSION_PERCENT)) / 100);
          endCallRecord(rowId, {
            durationSeconds: seconds,
            billedMinutes: minutes,
            costCoins: settled.cost,
            hostEarningsDiamonds: hostShare,
          }).catch(() => {});
        } else {
          // Charge refused (e.g. balance dropped mid-call) or the
          // wallet write failed — still close the row so the other
          // side is released, with no cost claimed.
          endCallRecord(rowId, {
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
        endCallRecord(rowId, {
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
    // No call summary for anyone (user 2026-11-18): the host sees
    // the earnings in the Host Dashboard. Just go back.
    showToast('কল শেষ হয়েছে');
    navigation.goBack();
  };
  endCallRef.current = endCall;
  finishCallRef.current = finishCall;

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

  // [F5] Send a gift: charge coins via the store first, then show the
  // full-screen animation ONLY for expensive gifts. Cheap gifts keep
  // the old toast-only behaviour (sendGift already toasted).
  // Threshold from the real gift data (gifts from the store — live
  // Supabase rows when the setup SQL is pasted, config.js demo
  // values otherwise):
  // the expensive gifts are Sports Car 2999, Rocket 4999 and
  // Castle 9999 — everything at or below Diamond Ring (999) is cheap.
  const EXPENSIVE_GIFT_MIN_COINS = 1000;
  const handleSendGift = (gift) => {
    if (!sendGift(gift, host)) return; // not enough coins — toast already shown
    if (gift.price >= EXPENSIVE_GIFT_MIN_COINS) {
      setBigGift(gift);
    }
  };
  // [/F5]
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

  if (stage === 'incoming') {
    // Real invite (isCallee): the caller is the person on this
    // screen — their real photo + name from profiles. Outgoing
    // (local) calls keep showing the host, as before. Photo, name
    // and Accept / Decline only — no rate line, no extra text.
    const incomingName = (isCallee && caller && caller.name) || host.name;
    const incomingPhoto = (isCallee && caller && caller.photo) || null;
    return (
      <LinearGradient colors={[COLORS.purpleDark, COLORS.purple, COLORS.pink]} style={styles.center}>
        {incomingPhoto ? (
          <Image source={incomingPhoto} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarBig}>{incomingName ? incomingName[0] : '?'}</Text>
        )}
        <Text style={styles.title}>{incomingName}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.btnDecline]} onPress={decline}>
            <Text style={styles.btnText}>✕ Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={accept}>
            <Text style={styles.btnText}>✓ Accept</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // [F2] Voice-call mode: after the incoming screen is accepted,
  // an audio-only call renders the audio-only screen instead of
  // video. The incoming screen itself is unchanged (photo, name,
  // Accept / Decline only). The video path below is untouched.
  // The calls row id is passed explicitly (prop AND route params):
  // VideoCallScreen renders this screen with the same route object
  // but never puts the outgoing callId into route.params, so the
  // voice screen on its own could never record the call.
  if (audioOnly) {
    return (
      <VoiceCallScreen
        route={{ ...route, params: { ...(route.params || {}), callId: callIdRef.current || incomingCallId || null } }}
        navigation={navigation}
        callId={callIdRef.current}
        callAcceptedRef={callAcceptedRef}
        roomChannel={roomChannelRef.current}
        talkStarted={talkStarted}
      />
    );
  }
  // [/F2]

  // calling
  return (
    <View style={styles.callBg}>
      <LiveVideo
        channel={buildChannelName(host.id)}
        role="host"
        style={styles.video}
        onJoin={() => {
          joinedRef.current = true;
          // Host going live has no accept step — talk starts when
          // the channel joins. (For caller/callee the talk clock
          // starts on accept instead; onJoin alone must not start
          // it, or ring time would be billed.)
          if (asHost) setTalkStarted(true);
        }}
        onJoinError={() => {
          joinedRef.current = false;
        }}
        onTokenExpiring={() => showToast('Call token expiring — the call may end soon.')}
        onTokenRenewalFailed={() => showToast('Could not renew the call token — the call may drop soon.')}
      />
      <Text style={styles.timer}>{mm}:{ss} · 🪙 {liveCost} coins</Text>
      <Text style={styles.callName}>{host.name} · {rate.label}</Text>
      {vipLevel && (
        <Animated.View style={[styles.vehicle, { transform: [{ translateX: vehicleX }] }]}>
          <Text style={styles.vehicleText}>🏎️</Text>
        </Animated.View>
      )}

      {/* All gifts, horizontally scrollable — the expensive gifts
          (>= 1000 coins, which trigger the full-screen animation)
          used to be cut off by gifts.slice(0, 4). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.giftRow}>
        {gifts.map((g) => (
          <TouchableOpacity key={g.id} style={styles.gift} onPress={() => handleSendGift(g)}>
            <Text style={styles.giftEmoji}>{g.emoji}</Text>
            <Text style={styles.giftPrice}>{g.price}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* [F7] Voice changer: a pill button opens the preset panel.
          The pill sits above the call controls so the existing
          4-button controls row is untouched. Tapping a preset
          applies it to the live Agora engine at once. */}
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
      {/* [F5] Full-screen animation overlay for an expensive gift (pointerEvents="none" inside — never blocks the call controls). senderName is the signed-in user's real username (fetched from their profiles row), not demo data. */}
      <FullScreenGift gift={bigGift} senderName={senderName || 'You'} visible={!!bigGift} onDone={() => setBigGift(null)} />
      {/* [/F5] */}
      {/* [F7] Voice label added to the existing hint line. */}
      <Text style={styles.hint}>Beauty {beauty ? 'on' : 'off'} · Mic {muted ? 'muted' : 'on'} · Voice {getVoicePresetLabel(voicePreset)} · Live video via Agora</Text>
      {/* [/F7] */}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBig: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 60, color: '#fff', fontSize: 64, fontWeight: 'bold', height: 120, lineHeight: 120, overflow: 'hidden', textAlign: 'center', width: 120 },
  // [Calls] Real caller photo on the incoming screen (from profiles).
  avatarImg: { borderRadius: 60, height: 120, width: 120 },
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
  timer: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  title: { color: COLORS.dark, fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  video: { height: 300 },
  // [Vero] Rare Vehicle entrance effect.
  vehicle: { position: 'absolute', top: 64, zIndex: 5 },
  vehicleText: { fontSize: 48 },
  // [/Vero]
  // [F7] Voice changer panel styles.
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
