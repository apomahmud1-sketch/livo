import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Camera, Check, Ellipsis, Gift, Heart, Mic, MicOff, Phone, RefreshCw, UserPlus, Users, Video, Volume2, VolumeX, X } from 'lucide-react-native';
import { COLORS, PLATFORM_COMMISSION_PERCENT, THEME } from '../config';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
import { fetchMyProfile, getSessionUser } from '../supabase/auth';
import { joinLiveRoom, leaveLiveRoom, subscribeRoomPresence, subscribeRoomViewers } from '../supabase/presence';
import { fetchRoomMessages, sendRoomMessage, subscribeRoomMessages } from '../supabase/room_messages';
// Multi-guest (co-anchor): viewers ask to join this live; the host
// agrees/declines in the Multi-guest Management panel. An approved
// guest switches to broadcaster in the same Agora channel.
import {
  decideGuestRequest,
  endGuestRequest,
  fetchGuestRequests,
  subscribeGuestRequests,
} from '../supabase/guest_requests';
import GiftSheet from '../components/GiftSheet';
// Report a host to the Mother Panel (see ReportSheet): the caller
// in a 1v1 call can report the host — the report lands in the
// public.reports table for the owner to review.
import ReportSheet from '../components/ReportSheet';
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
// Gift animation overlay — plays a gift's uploaded animation
// (animation_url) when that gift is sent, instead of the emoji
// effect. Falls back to FullScreenGift (expensive gifts) on load
// failure — see the onSent handler below.
import GiftAnimationOverlay, { giftAnimationUrl } from '../components/GiftAnimationOverlay';
import LiveVideo, {
  agoraUidForUser,
  getAgoraEngine,
  leaveAgoraChannel,
  setAgoraBeauty,
  setAgoraCameraEnabled,
  setAgoraMuted,
  setAgoraSpeakerphone,
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

const HEART_COLORS = ['#ff5da2', '#f43f9e', '#c084fc', '#ffd76a'];

// One floating heart: rises and fades over 2.4s, then removes itself.
// (Live-room Like button — local in-room effect only, no likes table.)
function FloatingHeart({ left, color, size, onDone }) {
  const rise = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(rise, { toValue: -150, duration: 2400, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ]).start(() => onDone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.Text
      style={[styles.floatHeart, { left, color, fontSize: size, opacity: fade, transform: [{ translateY: rise }] }]}
    >
      ❤️
    </Animated.Text>
  );
}
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
  const { coins, chargeCall, showToast, vipLevel, getLiveCallRate, getLiveVoiceCallRate } = useApp();
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
        // Identity from the local session (see getSessionUser):
        // the network getUser() call can fail on a phone right after login.
        const sessionUser = await getSessionUser();
        const uid = sessionUser && sessionUser.id;
        if (!uid) return;
        if (!cancelled) setMyId(uid);
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
  // [New UI 2026-11-25] Camera on/off + speaker on/off + gift sheet.
  const [cameraOn, setCameraOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [giftOpen, setGiftOpen] = useState(false);
  // Report sheet: only the caller (not the host going live and
  // not the host answering) can report the host in this call.
  const [reportOpen, setReportOpen] = useState(false);
  // [F5] Gift currently playing the full-screen animation (null = none).
  // Only expensive gifts (price >= EXPENSIVE_GIFT_MIN_COINS) ever set this.
  const [bigGift, setBigGift] = useState(null);
  // Gift animation overlay: the gift with an uploaded animation
  // currently playing (null = none). Takes priority over bigGift
  // for that gift; on load failure the overlay reports onError
  // and the expensive-gift emoji effect plays instead.
  const [animGift, setAnimGift] = useState(null);
  // [/F5]
  // [F7] Voice changer state. 'normal' = your real voice. The panel
  // is closed by default so the call controls stay uncluttered.
  const [voicePreset, setVoicePreset] = useState('normal');
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  // [/F7]
  // ── Live room (host broadcasting, asHost, no 1v1 caller yet) ──
  // The host's live room overlays the broadcast: live chat, Like,
  // viewer count + Audience Management, and Multi-guest Management
  // (co-anchor requests). All of it hides the moment a 1v1 caller
  // joins — the call layout takes over, exactly as before.
  const [myId, setMyId] = useState(null);
  // Remote Agora uids currently in the channel (a 1v1 caller and/or
  // approved co-guests). Tracked via LiveVideo's onRemoteJoin/Leave.
  const [remoteUids, setRemoteUids] = useState([]);
  // Live chat for this room (room_messages).
  const [roomMessages, setRoomMessages] = useState([]);
  const [roomInput, setRoomInput] = useState('');
  const roomChatScrollRef = useRef(null);
  // Viewers (Realtime presence) + panels.
  const [viewerCount, setViewerCount] = useState(null);
  const [viewerList, setViewerList] = useState([]);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  // Multi-guest requests for this room (pending + approved).
  const [guestRequests, setGuestRequests] = useState([]);
  // Like: local in-room effect only (no likes table exists).
  const [hearts, setHearts] = useState([]);
  const [likeCount, setLikeCount] = useState(0);
  const heartsIdRef = useRef(0);
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
        // Identity from the local session (see getSessionUser):
        // the network getUser() call can fail on a phone right after login.
        const u = await getSessionUser();
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

  // ── Live room data (host broadcasting only) ────────────────
  // Live chat for this room (room_messages, same as LiveRoomScreen).
  useEffect(() => {
    if (!asHost || stage !== 'calling' || !host) return undefined;
    let cancelled = false;
    fetchRoomMessages(host.id, 50).then((rows) => {
      if (!cancelled) setRoomMessages(rows);
    });
    const unsub = subscribeRoomMessages(host.id, (msg) => {
      setRoomMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev.slice(-49), msg];
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [asHost, stage, host]);

  // Keep the host's room chat scrolled to the newest message.
  useEffect(() => {
    if (roomChatScrollRef.current) {
      roomChatScrollRef.current.scrollToEnd({ animated: true });
    }
  }, [roomMessages]);

  // Viewers: count + list (Realtime presence, same channel the
  // call already joins above).
  useEffect(() => {
    if (!asHost || stage !== 'calling' || !host) return undefined;
    const unsubCount = subscribeRoomViewers(host.id, (count) => setViewerCount(count));
    const unsubList = subscribeRoomPresence(host.id, (entries) => setViewerList(entries));
    return () => {
      if (unsubCount) unsubCount();
      if (unsubList) unsubList();
    };
  }, [asHost, stage, host]);

  // Multi-guest requests for this room: initial list + Realtime.
  // Upsert on insert/update while pending/approved; drop the row
  // when it is declined or ended (it is no longer actionable).
  useEffect(() => {
    if (!asHost || stage !== 'calling' || !host) return undefined;
    let cancelled = false;
    fetchGuestRequests(host.id).then((rows) => {
      if (!cancelled) setGuestRequests(rows);
    });
    const unsub = subscribeGuestRequests(host.id, (row) => {
      setGuestRequests((prev) => {
        if (row.status === 'pending' || row.status === 'approved') {
          if (prev.some((r) => r.id === row.id)) {
            return prev.map((r) => (r.id === row.id ? row : r));
          }
          return [row, ...prev];
        }
        return prev.filter((r) => r.id !== row.id);
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [asHost, stage, host]);

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

  // ── Live room derived state ──────────────────────────────────
  // Approved co-guests (their deterministic Agora uids) and the
  // pending requests the host must decide. A joined remote whose
  // uid matches an approved guest is a co-guest (small box); any
  // other joined remote is the 1v1 caller (call layout).
  // (Plain computation, not useMemo: this sits after the `if
  // (!host)` early return, where hooks must not be added.)
  const approvedGuests = guestRequests.filter((r) => r.status === 'approved');
  const pendingRequests = guestRequests.filter((r) => r.status === 'pending');
  const approvedGuestUidSet = new Set(approvedGuests.map((r) => agoraUidForUser(r.guestId)));
  const approvedGuestUids = [...approvedGuestUidSet];
  const activeCallerUid = remoteUids.find((u) => !approvedGuestUidSet.has(Number(u))) ?? null;
  // Live-room overlays (chat, Like, audience, multi-guest) show
  // only while the host is broadcasting with no 1v1 caller — the
  // moment a caller joins, the call layout takes over.
  const isLiveRoom = asHost && !activeCallerUid;

  const spawnHearts = () => {
    const batch = [0, 1, 2].map(() => ({
      id: ++heartsIdRef.current,
      left: 10 + Math.random() * 60,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      size: 17 + Math.random() * 6,
    }));
    setHearts((prev) => [...prev, ...batch]);
  };

  const sendRoomChat = async () => {
    const text = roomInput.trim();
    if (!text) return;
    if (!myId) {
      showToast('Please sign in first.');
      return;
    }
    setRoomInput('');
    const row = await sendRoomMessage({ hostId: host.id, senderId: myId, senderName: senderName || 'Host', body: text });
    if (row) {
      setRoomMessages((prev) => [...prev.slice(-49), row]);
    } else {
      showToast("Couldn't send — check your connection and try again.");
    }
  };

  // Multi-guest decisions. Optimistic: the panel updates at once
  // (the Realtime subscription will confirm it). A failed write
  // reloads the list from the server so the panel never lies.
  const decideGuest = async (id, status) => {
    setGuestRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const row = await decideGuestRequest(id, status);
    if (!row) {
      showToast("Couldn't update — check your connection and try again.");
      fetchGuestRequests(host.id).then((rows) => setGuestRequests(rows));
    }
  };

  const endGuest = async (id) => {
    setGuestRequests((prev) => prev.filter((r) => r.id !== id));
    const ok = await endGuestRequest(id);
    if (!ok) {
      fetchGuestRequests(host.id).then((rows) => setGuestRequests(rows));
    }
  };

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
    showToast('Call ended');
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

  // [New UI] Camera on/off (preview control row) + speaker on/off.
  const toggleCameraEnabled = () => {
    const next = !cameraOn;
    setCameraOn(next);
    setAgoraCameraEnabled(next);
    showToast(next ? 'Camera on' : 'Camera off');
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    setAgoraSpeakerphone(next);
    showToast(next ? 'Speaker on' : 'Speaker off');
  };

  const toggleBeauty = () => {
    setBeauty(!beauty);
    setAgoraBeauty(!beauty);
  };

  // [F5] Expensive gifts (>= EXPENSIVE_GIFT_MIN_COINS) play the
  // full-screen animation when sent from the Gift sheet (see the
  // GiftSheet onSent callback below). Cheap gifts keep the
  // toast-only behaviour (sendGift already toasted).
  // Threshold from the real gift data (gifts from the store — live
  // Supabase rows when the setup SQL is pasted, config.js demo
  // values otherwise):
  // the expensive gifts are Sports Car 2999, Rocket 4999 and
  // Castle 9999 — everything at or below Diamond Ring (999) is cheap.
  const EXPENSIVE_GIFT_MIN_COINS = 1000;
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
    // [New UI 2026-11-25] Preview style: blurred photo backdrop,
    // 172px avatar with a violet ring, two 66px round buttons
    // (red Reject / green Accept) with labels underneath.
    const incomingName = (isCallee && caller && caller.name) || host.name;
    const incomingPhoto = (isCallee && caller && caller.photo) || null;
    return (
      <View style={styles.incomingBg}>
        <StatusBar style="light" />
        {incomingPhoto ? (
          <Image source={incomingPhoto} style={styles.incomingBgPhoto} resizeMode="cover" />
        ) : null}
        <LinearGradient
          colors={['rgba(21,3,41,0.82)', 'rgba(42,17,82,0.78)', 'rgba(18,2,31,0.88)']}
          style={styles.incomingShade}
        />
        <View style={styles.incomingContent}>
          {incomingPhoto ? (
            <Image source={incomingPhoto} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarBig}>{incomingName ? incomingName[0] : '?'}</Text>
          )}
          <Text style={styles.incomingTitle}>{incomingName}</Text>
          <View style={styles.incomingRow}>
            <View style={styles.incomingBtnWrap}>
              <TouchableOpacity style={[styles.incomingCircle, styles.btnDecline]} onPress={decline} activeOpacity={0.85}>
                <Phone size={26} color="#fff" strokeWidth={2.2} style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <Text style={styles.incomingBtnLabel}>Reject</Text>
            </View>
            <View style={styles.incomingBtnWrap}>
              <TouchableOpacity style={[styles.incomingCircle, styles.btnAccept]} onPress={accept} activeOpacity={0.85}>
                <Video size={26} color="#fff" strokeWidth={2.2} />
              </TouchableOpacity>
              <Text style={styles.incomingBtnLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
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

  // calling — [New UI 2026-11-25] preview Video Call screen:
  // full-screen video, timer + spent pills top-left, host name +
  // rate pill + Camera / Mute / Speaker / Flip controls at the
  // bottom, gift FAB + red hangup + ••• (beauty). Billing, the
  // voice changer, the VIP vehicle entrance and the expensive-gift
  // animation all work exactly as before. Gifts now open the
  // shared Gift sheet instead of the inline row.
  return (
    <View style={styles.callBg}>
      <StatusBar style="light" />
      <LiveVideo
        channel={buildChannelName(host.id)}
        role="host"
        style={styles.video}
        showLiveChip={false}
        // Live room: approved co-guests (matched by agoraUidForUser)
        // render as small boxes on the host's full-screen live;
        // any other joined remote is the 1v1 caller (call layout).
        coGuestUids={approvedGuestUids}
        onRemoteJoin={(uid) => setRemoteUids((prev) => (prev.includes(uid) ? prev : [...prev, uid]))}
        onRemoteLeave={(uid) => setRemoteUids((prev) => prev.filter((u) => u !== uid))}
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

      {/* Top overlay: call timer + coins spent so far */}
      <View style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.timerPill}>
          <View style={styles.timerDot} />
          <Text style={styles.timerTxt}>{mm}:{ss}</Text>
        </View>
        <View style={styles.spentPill}>
          <Text style={styles.spentTxt}>🪙 -{liveCost.toLocaleString()}</Text>
        </View>
      </View>
      {/* Report: the caller (not the host) can report this host —
          the report goes to the Mother Panel for review. */}
      {isOutgoingCall ? (
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => setReportOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.reportBtnTxt}>⚑ Report</Text>
        </TouchableOpacity>
      ) : null}
      {/* Live room (host broadcasting, no 1v1 caller): viewer count,
          Audience Management and Multi-guest Management. */}
      {isLiveRoom && stage === 'calling' ? (
        <View style={styles.roomTopRight} pointerEvents="box-none">
          {viewerCount != null ? (
            <TouchableOpacity style={styles.roomViewerPill} onPress={() => setAudienceOpen(true)} activeOpacity={0.8}>
              <Text style={styles.roomViewerTxt}>👁 {viewerCount} viewers</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.roomIconBtn} onPress={() => setAudienceOpen(true)} activeOpacity={0.8}>
            <Users size={17} color="#fff" strokeWidth={2.2} />
            <Text style={styles.roomIconBtnTxt}>Audience</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.roomIconBtn} onPress={() => setGuestsOpen(true)} activeOpacity={0.8}>
            <UserPlus size={17} color="#fff" strokeWidth={2.2} />
            <Text style={styles.roomIconBtnTxt}>Guests</Text>
            {pendingRequests.length > 0 ? (
              <View style={styles.roomBadge}>
                <Text style={styles.roomBadgeTxt}>{pendingRequests.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      ) : null}
      {vipLevel && (
        <Animated.View style={[styles.vehicle, { transform: [{ translateX: vehicleX }] }]}>
          <Text style={styles.vehicleText}>🏎️</Text>
        </Animated.View>
      )}

      {/* Live room overlays (host broadcasting, no 1v1 caller):
          live chat + Like. Hidden during a 1v1 call. */}
      {isLiveRoom && stage === 'calling' ? (
        <>
          <View style={styles.roomHeartsZone} pointerEvents="none">
            {hearts.map((h) => (
              <FloatingHeart
                key={h.id}
                left={h.left}
                color={h.color}
                size={h.size}
                onDone={() => setHearts((prev) => prev.filter((x) => x.id !== h.id))}
              />
            ))}
          </View>
          <TouchableOpacity
            style={styles.roomLikeBtn}
            onPress={() => {
              spawnHearts();
              setLikeCount((c) => c + 1);
            }}
            activeOpacity={0.8}
          >
            <Heart size={24} color="#ff5da2" strokeWidth={2.2} fill="#ff5da2" />
            {likeCount > 0 ? <Text style={styles.roomLikeCountTxt}>{likeCount}</Text> : null}
          </TouchableOpacity>
          <View style={styles.roomChatWrap} pointerEvents="box-none">
            <ScrollView
              ref={roomChatScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.roomChatList}
              onContentSizeChange={() => roomChatScrollRef.current && roomChatScrollRef.current.scrollToEnd({ animated: true })}
            >
              {roomMessages.length === 0 ? (
                <View style={styles.roomChatBubble}>
                  <Text style={styles.roomChatText}>No messages yet — say hi to your viewers! 👋</Text>
                </View>
              ) : (
                roomMessages.slice(-4).map((m) => (
                  <View key={String(m.id)} style={styles.roomChatBubble}>
                    <Text style={styles.roomChatText}>
                      <Text style={styles.roomChatName}>{m.senderName}</Text> {m.text}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.roomChatInputWrap}>
              <TextInput
                style={styles.roomChatInput}
                placeholder="Reply to chat..."
                placeholderTextColor="#cdbcf0"
                value={roomInput}
                onChangeText={setRoomInput}
                maxLength={120}
                returnKeyType="send"
                onSubmitEditing={sendRoomChat}
              />
              <TouchableOpacity style={styles.roomChatSendBtn} onPress={sendRoomChat} activeOpacity={0.8}>
                <Text style={styles.roomChatSendTxt}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : null}

      {/* Bottom overlay: host, rate, controls, actions */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <View style={styles.callNameRow}>
          <Text style={styles.callName}>{host.name}</Text>
          <Text style={styles.callFemale}>♀</Text>
          {host.country ? <Text style={styles.callFlag}>{host.country}</Text> : null}
        </View>
        <View style={styles.ratePill}>
          <Text style={styles.ratePillTxt}>🪙 {rate.coinsPerMinute} Coins / Min</Text>
        </View>

        {/* [F7] Voice changer: a pill button opens the preset panel. */}
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
          <View style={styles.ctrlWrap}>
            <TouchableOpacity style={[styles.ctrl, !cameraOn && styles.ctrlOff]} onPress={toggleCameraEnabled}>
              <Camera size={22} color={cameraOn ? '#fff' : '#22103f'} strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Camera</Text>
          </View>
          <View style={styles.ctrlWrap}>
            <TouchableOpacity style={[styles.ctrl, muted && styles.ctrlOff]} onPress={toggleMute}>
              {muted
                ? <MicOff size={22} color="#22103f" strokeWidth={2.2} />
                : <Mic size={22} color="#fff" strokeWidth={2.2} />}
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Mute</Text>
          </View>
          <View style={styles.ctrlWrap}>
            <TouchableOpacity style={[styles.ctrl, !speakerOn && styles.ctrlOff]} onPress={toggleSpeaker}>
              {speakerOn
                ? <Volume2 size={22} color="#fff" strokeWidth={2.2} />
                : <VolumeX size={22} color="#22103f" strokeWidth={2.2} />}
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Speaker</Text>
          </View>
          <View style={styles.ctrlWrap}>
            <TouchableOpacity style={styles.ctrl} onPress={toggleCamera}>
              <RefreshCw size={22} color="#fff" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.ctrlLabel}>Flip</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity onPress={() => setGiftOpen(true)} activeOpacity={0.85}>
            <LinearGradient colors={['#a855f7', '#7b2ff7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.giftFab}>
              <Gift size={24} color="#fff" strokeWidth={2.2} />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.hangupBtn} onPress={endCall} activeOpacity={0.85}>
            <Phone size={28} color="#fff" strokeWidth={2.2} style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.moreBtn, beauty && styles.moreBtnOn]}
            onPress={() => {
              toggleBeauty();
              showToast(!beauty ? 'Beauty on' : 'Beauty off');
            }}
            activeOpacity={0.85}
          >
            <Ellipsis size={22} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
        {/* [F7] Voice label added to the existing hint line. */}
        <Text style={styles.hint}>Beauty {beauty ? 'on' : 'off'} · Mic {muted ? 'muted' : 'on'} · Voice {getVoicePresetLabel(voicePreset)} · Live video via Agora</Text>
        {/* [/F7] */}
      </View>
      {/* [F5] Full-screen animation overlay for an expensive gift (pointerEvents="none" inside — never blocks the call controls). senderName is the signed-in user's real username (fetched from their profiles row), not demo data. */}
      <FullScreenGift gift={bigGift} senderName={senderName || 'You'} visible={!!bigGift} onDone={() => setBigGift(null)} />
      {/* [/F5] */}
      {/* Uploaded gift animation overlay: plays when the sent gift
          has an animation_url. On load failure it falls back to
          the expensive-gift emoji effect above (cheap gifts keep
          the toast-only behaviour — sendGift already toasted). */}
      <GiftAnimationOverlay
        gift={animGift}
        senderName={senderName || 'You'}
        visible={!!animGift}
        onDone={() => setAnimGift(null)}
        onError={(g) => {
          setAnimGift(null);
          if (g && g.price >= EXPENSIVE_GIFT_MIN_COINS) setBigGift(g);
        }}
      />
      {/* [New UI] Shared Gift sheet: sending charges real coins via
          the store; a gift with an uploaded animation plays the
          overlay above, an expensive gift without one plays the
          full-screen emoji animation. */}
      <GiftSheet
        visible={giftOpen}
        host={host}
        onClose={() => setGiftOpen(false)}
        onSent={(gift) => {
          if (giftAnimationUrl(gift)) setAnimGift(gift);
          else if (gift.price >= EXPENSIVE_GIFT_MIN_COINS) setBigGift(gift);
        }}
      />
      {/* Report sheet: the caller reports this host to the owner. */}
      <ReportSheet visible={reportOpen} host={host} onClose={() => setReportOpen(false)} />

      {/* Audience Management: real viewers in this room (presence). */}
      <Modal visible={audienceOpen} transparent animationType="slide" onRequestClose={() => setAudienceOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>👥 Audience ({viewerList.length})</Text>
              <TouchableOpacity onPress={() => setAudienceOpen(false)} activeOpacity={0.8}>
                <X size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            {viewerList.length === 0 ? (
              <Text style={styles.modalEmpty}>No viewers in this room yet.</Text>
            ) : (
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {viewerList.map((v, i) => (
                  <View key={String(v.userId) + i} style={styles.modalRow}>
                    <View style={styles.modalAvatar}>
                      <Text style={styles.modalAvatarTxt}>{(v.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.modalName} numberOfLines={1}>{v.name || 'Guest'}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Multi-guest Management: viewers asking to join this live
          as co-guests. Agree = they switch to broadcaster in this
          channel and show in a small box on your live; Decline
          turns them away; End removes an approved co-guest. */}
      <Modal visible={guestsOpen} transparent animationType="slide" onRequestClose={() => setGuestsOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>🎥 Multi-guest</Text>
              <TouchableOpacity onPress={() => setGuestsOpen(false)} activeOpacity={0.8}>
                <X size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            {pendingRequests.length === 0 && approvedGuests.length === 0 ? (
              <Text style={styles.modalEmpty}>No guest requests yet. When a viewer asks to join your live, it shows here.</Text>
            ) : (
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {pendingRequests.map((r) => (
                  <View key={String(r.id)} style={styles.modalRow}>
                    <View style={styles.modalAvatar}>
                      <Text style={styles.modalAvatarTxt}>{(r.guestName || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={styles.modalRowMain}>
                      <Text style={styles.modalName} numberOfLines={1}>{r.guestName}</Text>
                      <Text style={styles.modalSub}>{r.guestDisplayId ? `ID: ${r.guestDisplayId}` : 'wants to join your live'}</Text>
                    </View>
                    <TouchableOpacity style={[styles.guestDecideBtn, styles.guestAgreeBtn]} onPress={() => decideGuest(r.id, 'approved')} activeOpacity={0.85}>
                      <Check size={15} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.guestDecideTxt}>Agree</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.guestDecideBtn, styles.guestDeclineBtn]} onPress={() => decideGuest(r.id, 'declined')} activeOpacity={0.85}>
                      <Text style={styles.guestDecideTxt}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {approvedGuests.map((r) => {
                  const live = remoteUids.includes(agoraUidForUser(r.guestId));
                  return (
                    <View key={String(r.id)} style={styles.modalRow}>
                      <View style={styles.modalAvatar}>
                        <Text style={styles.modalAvatarTxt}>{(r.guestName || '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={styles.modalRowMain}>
                        <Text style={styles.modalName} numberOfLines={1}>{r.guestName}</Text>
                        <Text style={styles.modalSub}>{live ? '● Live as co-guest' : 'Approved — not in the room yet'}</Text>
                      </View>
                      <TouchableOpacity style={[styles.guestDecideBtn, styles.guestDeclineBtn]} onPress={() => endGuest(r.id)} activeOpacity={0.85}>
                        <Text style={styles.guestDecideTxt}>End</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBig: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 86, color: '#fff', fontSize: 72, fontWeight: 'bold', height: 172, lineHeight: 172, overflow: 'hidden', textAlign: 'center', width: 172 },
  // [Calls] Real caller photo on the incoming screen (from profiles).
  avatarImg: {
    borderColor: '#c084fc',
    borderRadius: 86,
    borderWidth: 3,
    height: 172,
    width: 172,
  },
  btn: { backgroundColor: COLORS.purple, borderRadius: 24, marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  btnAccept: { backgroundColor: '#1fc457' },
  btnDecline: { backgroundColor: '#ef2b3c' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  // [New UI] Incoming call: blurred photo backdrop + violet shade.
  incomingBg: { backgroundColor: '#12021f', flex: 1 },
  incomingBgPhoto: { height: '100%', position: 'absolute', width: '100%' },
  incomingShade: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  incomingContent: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  incomingTitle: { color: '#fff', fontSize: 27, fontWeight: '900', marginTop: 18, textAlign: 'center' },
  incomingRow: { flexDirection: 'row', gap: 56, marginTop: 64 },
  incomingBtnWrap: { alignItems: 'center' },
  incomingCircle: {
    alignItems: 'center',
    borderRadius: 33,
    elevation: 8,
    height: 66,
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    width: 66,
  },
  incomingBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 8 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  // [New UI] Calling: full-screen video, overlays float on top.
  callBg: { backgroundColor: '#000', flex: 1 },
  video: { borderRadius: 0, flex: 1 },
  topOverlay: { left: 16, position: 'absolute', top: 48 },
  timerPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(10,0,20,0.5)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  timerDot: { backgroundColor: '#2ee66b', borderRadius: 4, height: 8, width: 8 },
  timerTxt: { color: '#fff', fontSize: 13.5, fontWeight: '900' },
  spentPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(10,0,20,0.5)',
    borderRadius: 999,
    marginTop: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  spentTxt: { color: THEME.gold2, fontSize: 13.5, fontWeight: '900' },
  reportBtn: { backgroundColor: 'rgba(10,0,20,0.5)', borderColor: 'rgba(255,255,255,0.25)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, position: 'absolute', right: 16, top: 48 },
  reportBtnTxt: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  bottomOverlay: { bottom: 0, left: 0, paddingBottom: 20, paddingHorizontal: 16, position: 'absolute', right: 0 },
  callNameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  callName: { color: '#fff', fontSize: 16, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  callFemale: { color: THEME.pinkLight, fontSize: 14, fontWeight: '800' },
  callFlag: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 5, color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.4, overflow: 'hidden', paddingHorizontal: 5, paddingVertical: 2 },
  ratePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(20,4,40,0.66)',
    borderColor: 'rgba(247,183,51,0.4)',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  ratePillTxt: { color: '#ffe9a8', fontSize: 13.5, fontWeight: '900' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, maxWidth: 320, width: '100%' },
  ctrlWrap: { alignItems: 'center' },
  ctrl: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,4,40,0.55)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  ctrlOff: { backgroundColor: '#fff' },
  ctrlLabel: { color: '#fff', fontSize: 11.5, fontWeight: '800', marginTop: 5 },
  actionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, maxWidth: 320, width: '100%' },
  giftFab: {
    alignItems: 'center',
    borderRadius: 16,
    elevation: 6,
    height: 52,
    justifyContent: 'center',
    shadowColor: '#8b3dff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    width: 52,
  },
  hangupBtn: {
    alignItems: 'center',
    backgroundColor: '#ef2b3c',
    borderRadius: 32,
    elevation: 8,
    height: 64,
    justifyContent: 'center',
    shadowColor: '#ef2b3c',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 26,
    width: 64,
  },
  moreBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,4,40,0.55)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  moreBtnOn: { backgroundColor: THEME.pink },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, marginTop: 14, textAlign: 'center' },
  // ── Live room (host broadcasting) ──────────────────────────
  // Top-right: viewer count + Audience + Guests buttons (stacked,
  // like the reference room — a single row would overflow a phone).
  roomTopRight: { alignItems: 'flex-end', flexDirection: 'column', gap: 7, position: 'absolute', right: 16, top: 48 },
  roomViewerPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.5)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roomViewerTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  roomIconBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.5)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  roomIconBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  roomBadge: { alignItems: 'center', backgroundColor: '#ef2b3c', borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 4 },
  roomBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  // Floating hearts + Like button (right side, above the controls).
  roomHeartsZone: { bottom: 350, height: 150, position: 'absolute', right: 0, width: 90 },
  floatHeart: { position: 'absolute', top: 130 },
  roomLikeBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.6)',
    borderColor: 'rgba(255,93,162,0.5)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    bottom: 352,
    width: 52,
  },
  roomLikeCountTxt: { color: '#ff8fc0', fontSize: 11, fontWeight: '900', marginTop: 1 },
  // Live chat overlay (bottom-left, above the call controls).
  roomChatWrap: { bottom: 340, left: 12, maxHeight: 150, position: 'absolute', right: 84 },
  roomChatList: { gap: 6 },
  roomChatBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(10,0,20,0.52)', borderRadius: 12, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 5 },
  roomChatText: { color: '#f1eaff', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  roomChatName: { color: THEME.gold2, fontWeight: '900' },
  roomChatInputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.55)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 6,
    minHeight: 36,
    paddingLeft: 12,
    paddingRight: 4,
  },
  roomChatInput: { color: '#fff', flex: 1, fontSize: 13, fontWeight: '600' },
  roomChatSendBtn: { alignItems: 'center', backgroundColor: THEME.violet, borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  roomChatSendTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  // Audience + Multi-guest modals.
  modalShade: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1c0b33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    width: '100%',
  },
  modalHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modalEmpty: { color: '#cdbcf0', fontSize: 13, lineHeight: 19, paddingVertical: 12, textAlign: 'center' },
  modalList: { flexGrow: 0 },
  modalRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 8 },
  modalRowMain: { flex: 1 },
  modalAvatar: { alignItems: 'center', backgroundColor: THEME.violet, borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  modalAvatarTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modalName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  modalSub: { color: '#cdbcf0', fontSize: 12, fontWeight: '600', marginTop: 2 },
  guestDecideBtn: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 3, paddingHorizontal: 11, paddingVertical: 7 },
  guestAgreeBtn: { backgroundColor: '#1fc457' },
  guestDeclineBtn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  guestDecideTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  title: { color: COLORS.dark, fontSize: 26, fontWeight: 'bold', marginTop: 16, textAlign: 'center' },
  // [Vero] Rare Vehicle entrance effect.
  vehicle: { position: 'absolute', top: 64, zIndex: 5 },
  vehicleText: { fontSize: 48 },
  // [/Vero]
  // [F7] Voice changer panel styles.
  voiceChip: { alignItems: 'center', backgroundColor: 'rgba(20,4,40,0.55)', borderRadius: 12, margin: 4, paddingVertical: 8, width: 96 },
  voiceChipEmoji: { fontSize: 22 },
  voiceChipOn: { backgroundColor: THEME.pink },
  voiceChipText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginTop: 2 },
  voiceChipTextOn: { color: '#fff' },
  voicePanel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  voicePill: { alignSelf: 'center', backgroundColor: 'rgba(20,4,40,0.55)', borderRadius: 16, marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 },
  voicePillText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  // [/F7]
});
