// ─────────────────────────────────────────────────────────────────
// Livo — REAL Agora live video (react-native-agora 4.4.0)
// ─────────────────────────────────────────────────────────────────
// API source: the react-native-agora 4.4.0 package typings
// (lib/typescript/src/IAgoraRtcEngine.d.ts, AgoraBase.d.ts,
// AgoraRtcRenderView.d.ts). Method names and signatures below
// match v4.4.0 exactly — do not "upgrade" them from memory:
//
//   createAgoraRtcEngine()                     -> IRtcEngine
//   engine.initialize({ appId, channelProfile }) -> 0 = OK
//   engine.setClientRole(ClientRoleType)       (1 = Broadcaster, 2 = Audience)
//   engine.enableVideo()
//   engine.startPreview()                      (local preview, broadcaster)
//   engine.joinChannel(token, channelId, uid, ChannelMediaOptions)
//   engine.leaveChannel()
//   engine.muteLocalAudioStream(mute) / muteLocalVideoStream(mute)
//   engine.enableLocalVideo(enabled)
//   engine.setBeautyEffectOptions(enabled, BeautyOptions)
//   engine.switchCamera()
//   [F2] engine.disableVideo() — voice calls: video module off
//   [F2] engine.setEnableSpeakerphone(enabled) — voice-call speaker
//   engine.registerEventHandler({ onJoinChannelSuccess,
//     onUserJoined, onUserOffline, onLeaveChannel, onError,
//     onTokenPrivilegeWillExpire })
//   engine.release()
//   <RtcSurfaceView canvas={{ uid, renderMode }} zOrderMediaOverlay />
//
// ── TOKEN — READ THIS ──────────────────────────────────────────
// The Agora project is in Secure Mode, so a TOKEN IS REQUIRED to
// join any channel. The token comes from ONE of these places, in
// this order (see resolveAgoraToken below):
//   1. The `token` prop passed to <LiveVideo> (preferred), or
//   2. The token server: GET {EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL}
//      /token?channel=&uid=&role= — fetched fresh for EVERY call
//      (fetchAgoraToken). Set the URL in .env or the EAS build
//      environment after deploying livo-token-server (see
//      ~/workspace/livo-token-server/README.md). No secret is ever
//      in the app — the App Certificate lives only on the server.
//   3. EXPO_PUBLIC_AGORA_TOKEN (dev only): a Temp Token from the
//      Agora Console, 24 hours, one channel. NEVER commit a real
//      token to GitHub.
// If NONE of these is configured, joining fails with a clear
// in-app message instead of joining without a token (which Secure
// Mode would reject anyway).
//
// FOR TESTING ONLY: generate a Temp Token in the Agora Console
// (console.agora.io -> your project -> Generate temp token).
// FOR PRODUCTION you MUST run the token server. NEVER embed the
// Primary Certificate in the app — anyone who has it can join
// any channel as anyone.
//
// The App ID comes from app.json -> extra -> AGORA_APP_ID
// (see src/config.js). It is NOT a secret.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AGORA_APP_ID, AGORA_APP_ID_IS_PLACEHOLDER, COLORS } from '../config';
import { requestCallPermissions } from '../permissions';

// ── Token ──────────────────────────────────────────────────────
// Token server base URL (no trailing slash). Empty = not deployed
// yet. Example: https://livo-token-server.onrender.com
export const AGORA_TOKEN_SERVER_URL = (
  process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL || ''
).trim().replace(/\/+$/, '');
// Set EXPO_PUBLIC_AGORA_TOKEN in .env (testing: paste a Temp Token
// from the Agora Console; production: leave empty — the token must
// come from your token server, passed as the `token` prop or
// fetched from AGORA_TOKEN_SERVER_URL below).
// This file NEVER contains a real token value.
export const AGORA_TOKEN = process.env.EXPO_PUBLIC_AGORA_TOKEN || '';
export const AGORA_TOKEN_IS_MISSING = !AGORA_TOKEN && !AGORA_TOKEN_SERVER_URL;

// Fetch a fresh RTC token from the token server for one channel.
// Throws a plain Error with a readable message on any failure
// (server not deployed, not configured, network error, bad channel).
// The server answers { token, channel, uid, role, expiresAt }.
export async function fetchAgoraToken(channelName, uid = 0, role = 'publisher') {
  if (!AGORA_TOKEN_SERVER_URL) {
    throw new Error(
      'Token server is not set up yet (EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL is empty). ' +
        'Deploy the token server first — see livo-token-server/README.md.',
    );
  }
  if (!channelName) {
    throw new Error('Agora channel name is missing.');
  }
  const url =
    `${AGORA_TOKEN_SERVER_URL}/token?channel=${encodeURIComponent(channelName)}` +
    `&uid=${encodeURIComponent(String(uid))}&role=${role === 'subscriber' ? 'subscriber' : 'publisher'}`;
  let res;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    throw new Error(
      'Could not reach the token server. Check your connection and that the token server is deployed and awake.',
    );
  }
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    // Non-JSON answer — handled by the status check below.
  }
  if (!res.ok) {
    throw new Error(
      (body && body.error) ||
        `Token server error ${res.status}. The server may not be configured yet (its App Certificate is missing).`,
    );
  }
  if (!body || !body.token) {
    throw new Error('Token server answered without a token. Try again.');
  }
  return body.token;
}

// Resolve the token to join with: explicit prop token first, then
// a fresh token from the token server, then the dev-only env token.
// Throws when nothing is configured — the caller shows the message
// instead of joining without a token.
export async function resolveAgoraToken({ token, channelName, uid = 0, role = 'publisher' }) {
  if (token) return token;
  if (AGORA_TOKEN_SERVER_URL) {
    return fetchAgoraToken(channelName, uid, role);
  }
  if (AGORA_TOKEN) return AGORA_TOKEN;
  throw new Error(
    'Agora token is missing. The token server is not set up yet ' +
      '(EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL is empty) and no dev token ' +
      'is set. Deploy the token server (see livo-token-server/README.md), ' +
      'or for testing set EXPO_PUBLIC_AGORA_TOKEN to a 24-hour Temp Token ' +
      'from the Agora Console.',
  );
}

// RenderModeType.RenderModeHidden = 1 (verified in v4.4.0 typings).
const RENDER_MODE_HIDDEN = 1;

// ── Lazy load of the native module ─────────────────────────────
// react-native-agora only works in a dev build / EAS build.
// Expo Go cannot load custom native modules, so we require it
// lazily and show a clear message instead of crashing.
let AgoraLib = null;
let agoraLoadFailed = false;

function loadAgora() {
  if (AgoraLib || agoraLoadFailed) {
    return AgoraLib;
  }
  try {
    // eslint-disable-next-line global-require
    AgoraLib = require('react-native-agora');
    return AgoraLib;
  } catch (e) {
    agoraLoadFailed = true;
    return null;
  }
}

// ── Engine (one shared instance for the whole app) ─────────────
let engine = null;
let engineChannel = null;
// Last token request, so onTokenPrivilegeWillExpire can fetch a
// fresh token from the token server and renew it (no re-join).
let lastTokenRequest = null;
const remoteListeners = new Set();

function emitRemote(event) {
  remoteListeners.forEach((cb) => {
    try {
      cb(event);
    } catch (e) {
      // A listener must never break the engine handler.
    }
  });
}

// ── Token-expiry events ──────────────────────────────────────────
// The engine's onTokenPrivilegeWillExpire handler is registered
// once, globally (registerEngineEvents), so it cannot call a
// component's props directly. It emits here instead, and the
// mounted <LiveVideo> forwards the event to its
// onTokenExpiring / onTokenRenewalFailed props so the call screen
// can toast the user instead of the call dying silently.
// Events: 'expiring-no-renewal' (token about to expire and no
// fresh token can be fetched) and 'renewal-failed' (the token
// server fetch failed). A successful renewal is silent — the
// call just continues.
const tokenEventListeners = new Set();

function emitTokenEvent(event) {
  tokenEventListeners.forEach((cb) => {
    try {
      cb(event);
    } catch (e) {
      // A listener must never break the engine handler.
    }
  });
}

/**
 * Subscribe to token-expiry events. cb receives
 * { type: 'expiring-no-renewal' | 'renewal-failed' }.
 * Returns an unsubscribe function.
 */
export function onAgoraTokenEvent(cb) {
  tokenEventListeners.add(cb);
  return () => tokenEventListeners.delete(cb);
}

/**
 * Subscribe to remote-user events.
 * cb receives { type: 'joined' | 'left', uid }.
 * Returns an unsubscribe function.
 */
export function onAgoraRemoteUser(cb) {
  remoteListeners.add(cb);
  return () => remoteListeners.delete(cb);
}

export function getAgoraEngine() {
  return engine;
}

// ── Co-guest uid ───────────────────────────────────────────────
// Deterministic Agora uid for a user id (FNV-1a, positive 31-bit,
// never 0). A viewer approved as co-guest joins the channel with
// this uid (as a broadcaster); the host computes the same value
// from the approved guest's user id and matches the joined remote
// uid to it — so the host knows the remote is a co-guest (small
// box, host stays full-screen) and not a 1v1 caller (call layout).
// No signalling round-trip is needed for the match.
export function agoraUidForUser(userId) {
  const s = String(userId || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

function registerEngineEvents(lib) {
  engine.registerEventHandler({
    onJoinChannelSuccess: () => {
      emitRemote({ type: 'joined-self' });
    },
    onUserJoined: (_connection, remoteUid) => {
      emitRemote({ type: 'joined', uid: remoteUid });
    },
    onUserOffline: (_connection, remoteUid) => {
      emitRemote({ type: 'left', uid: remoteUid });
    },
    onLeaveChannel: () => {
      engineChannel = null;
    },
    onTokenPrivilegeWillExpire: () => {
      // Token is about to expire: fetch a fresh one from the token
      // server and renew it in place (no re-join). Dev-only env
      // tokens cannot be renewed — the call just ends when they
      // expire (Temp Tokens last 24h). Either way the user is told
      // (via onAgoraTokenEvent → the call screen's toast) instead
      // of the call dying silently on a long call.
      if (!lastTokenRequest || !AGORA_TOKEN_SERVER_URL || !engine) {
        // eslint-disable-next-line no-console
        console.warn('[Agora] Token will expire soon — fetch a new token from the token server.');
        emitTokenEvent({ type: 'expiring-no-renewal' });
        return;
      }
      fetchAgoraToken(lastTokenRequest.channelName, lastTokenRequest.uid, lastTokenRequest.role)
        .then((freshToken) => {
          if (engine && engine.renewToken) engine.renewToken(freshToken);
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('[Agora] Token renewal failed:', e && e.message);
          emitTokenEvent({ type: 'renewal-failed' });
        });
    },
    onError: (err, msg) => {
      // eslint-disable-next-line no-console
      console.warn('[Agora] engine error', err, msg);
    },
  });
}

// Create the shared engine (if needed) and register its event
// handlers. Idempotent — a second call is a no-op.
function ensureEngine(lib) {
  if (engine) return;
  engine = lib.createAgoraRtcEngine();
  const initCode = engine.initialize({
    appId: AGORA_APP_ID,
    channelProfile: lib.ChannelProfileType.ChannelProfileLiveBroadcasting,
  });
  if (initCode !== 0) {
    const broken = engine;
    engine = null;
    throw new Error(`Agora initialize failed (code ${initCode}). Check the App ID.`);
  }
  registerEngineEvents(lib);
}

// ── Local preview (instant live) ───────────────────────────────
// Start the local camera preview WITHOUT joining a channel.
// Go Live calls this BEFORE the token fetch, so the host sees
// themselves at once while the token server wakes up and the join
// runs in the background — the reference live apps feel instant
// because the camera is on screen first and the connection
// happens behind it. Idempotent: joinAgoraChannel runs the same
// enableVideo / startPreview steps before joining, so calling
// this first changes nothing about the join itself.
// Throws a plain Error when the native module or the App ID is
// missing. A denied camera permission does NOT throw here — the
// preview simply stays black and the join proceeds as before.
export function startLocalPreview({ role = 'host', audioOnly = false } = {}) {
  const lib = loadAgora();
  if (!lib) {
    throw new Error(
      'react-native-agora is not available in this build. Use a dev build / EAS build — it does not work in Expo Go.',
    );
  }
  if (AGORA_APP_ID_IS_PLACEHOLDER) {
    throw new Error('Agora App ID is not set. Put it in app.json → extra → AGORA_APP_ID.');
  }
  if (audioOnly) return;
  ensureEngine(lib);
  const isHost = role === 'host';
  const clientRole = isHost
    ? lib.ClientRoleType.ClientRoleBroadcaster
    : lib.ClientRoleType.ClientRoleAudience;
  engine.setClientRole(clientRole);
  engine.enableVideo();
  if (isHost) {
    engine.startPreview();
  }
}

/** Stop the local camera preview. Safe to call when not started. */
export function stopLocalPreview() {
  if (!engine) return;
  try {
    engine.stopPreview();
  } catch (e) {
    // Already stopped — ignore.
  }
}

/**
 * Create the engine (if needed) and join a channel.
 *   token       — RTC token for this channel (Temp Token for testing,
 *                 token-server token for production). REQUIRED.
 *   channelName — e.g. `livo-call-<hostId>` (1-to-1) or
 *                 `livo-live-<hostId>` (host live room).
 *   uid         — your numeric uid in the channel (0 = let Agora assign).
 *   role        — 'host' (broadcaster: publishes camera + mic) or
 *                 'audience' (watches only, publishes nothing).
 *   audioOnly   — [F2] true = voice call: joins with audio only —
 *                 no camera track published, no video subscribed,
 *                 video module disabled on the shared engine. The
 *                 same channel/token/role rules apply as video.
 * Returns the engine. Throws a plain Error with a readable message
 * when the App ID, the token or the native module is missing, or
 * when initialize / joinChannel returns a non-zero code.
 */
export function joinAgoraChannel({ token, channelName, uid = 0, role = 'audience', audioOnly = false }) {
  const lib = loadAgora();
  if (!lib) {
    throw new Error(
      'react-native-agora is not available in this build. Use a dev build / EAS build — it does not work in Expo Go.',
    );
  }
  if (AGORA_APP_ID_IS_PLACEHOLDER) {
    throw new Error('Agora App ID is not set. Put it in app.json → extra → AGORA_APP_ID.');
  }
  if (!token) {
    throw new Error(
      'Agora token is missing. This project is in Secure Mode, so a token is required. ' +
        'For testing, generate a Temp Token in the Agora Console and set EXPO_PUBLIC_AGORA_TOKEN. ' +
        'For production, use a token server.',
    );
  }
  if (!channelName) {
    throw new Error('Agora channel name is missing.');
  }

  ensureEngine(lib);

  const isHost = role === 'host';
  const clientRole = isHost
    ? lib.ClientRoleType.ClientRoleBroadcaster
    : lib.ClientRoleType.ClientRoleAudience;
  engine.setClientRole(clientRole);
  // [F2] Audio-only: disable the video module on the shared engine
  // (a previous video session may have enabled it) and publish /
  // subscribe audio only. Video mode re-enables video below, so a
  // later video call still works after a voice call.
  if (audioOnly) {
    engine.disableVideo();
  } else {
    engine.enableVideo();
  }
  if (isHost && !audioOnly) {
    engine.startPreview();
  }
  // [/F2]

  const joinCode = engine.joinChannel(token, channelName, uid, {
    clientRoleType: clientRole,
    // [F2] Voice call: no camera track, no video subscription.
    publishCameraTrack: isHost && !audioOnly,
    publishMicrophoneTrack: isHost,
    autoSubscribeAudio: true,
    autoSubscribeVideo: !audioOnly,
    // [/F2]
  });
  if (joinCode !== 0) {
    throw new Error(
      `Agora joinChannel failed (code ${joinCode}). The token is probably wrong, ` +
        'expired, or was generated for a different channel name.',
    );
  }
  engineChannel = channelName;
  lastTokenRequest = { channelName, uid, role: isHost ? 'publisher' : 'subscriber' };
  return engine;
}

/** Leave the current channel. Safe to call when not joined. */
export function leaveAgoraChannel() {
  if (!engine) {
    return;
  }
  try {
    engine.leaveChannel();
  } catch (e) {
    // Already left — ignore.
  }
  engineChannel = null;
}

/** Leave the channel and destroy the engine (call on app exit). */
export function releaseAgoraEngine() {
  if (!engine) {
    return;
  }
  try {
    engine.leaveChannel();
  } catch (e) {
    // Ignore.
  }
  try {
    engine.release();
  } catch (e) {
    // Ignore.
  }
  engine = null;
  engineChannel = null;
}

/** Mute / unmute the local microphone. */
export function setAgoraMuted(muted) {
  if (engine) {
    engine.muteLocalAudioStream(muted);
  }
}

/** Turn the local camera on / off. */
export function setAgoraCameraEnabled(enabled) {
  if (!engine) {
    return;
  }
  engine.enableLocalVideo(enabled);
  engine.muteLocalVideoStream(!enabled);
}

/** Switch between the front and back cameras. */
export function switchAgoraCamera() {
  if (engine) {
    engine.switchCamera();
  }
}

// [F2] Route call audio to the loudspeaker (voice calls) or back to
// the earpiece. react-native-agora v4.4.0:
// engine.setEnableSpeakerphone(enabled). Voice calls default to
// the speaker; VoiceCallScreen restores the earpiece on unmount.
export function setAgoraSpeakerphone(enabled) {
  if (engine) {
    engine.setEnableSpeakerphone(enabled);
  }
}
// [/F2]

/** Turn the beauty filter on / off. */
export function setAgoraBeauty(enabled) {
  if (!engine) {
    return;
  }
  engine.setBeautyEffectOptions(enabled, {
    lighteningLevel: 0.7,
    smoothnessLevel: 0.5,
    rednessLevel: 0.1,
    sharpnessLevel: 0.3,
  });
}

// ── <LiveVideo> component ──────────────────────────────────────
// Props:
//   channel  — channel name to join (required)
//   token    — RTC token. When omitted, LiveVideo fetches a fresh
//              token from the token server (EXPO_PUBLIC_AGORA_TOKEN_
//              SERVER_URL) and falls back to the dev-only
//              EXPO_PUBLIC_AGORA_TOKEN. With neither configured it
//              shows a clear error instead of joining token-less.
//   role     — 'host' (goes live, publishes camera+mic) or
//              'audience' (watches, publishes nothing). Default 'audience'.
//   audioOnly — [F2] true = voice call: joins the channel with audio
//              only (see joinAgoraChannel) and renders a compact
//              audio status view instead of any video surface — no
//              local preview, no remote video view.
//   uid      — numeric uid (0 = Agora assigns one). Default 0.
//   style    — container style
//   coGuestUids — [Live room] numeric Agora uids of the host's
//     APPROVED co-guests (agoraUidForUser of their user ids).
//     A joined remote whose uid is in this list is a co-guest:
//     the host stays full-screen and the guest shows in a small
//     box. Any other joined remote is a 1v1 caller and drives the
//     call layout (caller main + host small preview). Empty =
//     no co-guests, behaviour exactly as before.
//   deferJoin — [Pre-live] true = start the local camera preview
//     on mount but do NOT fetch a token or join yet. The parent
//     flips it to false when the host taps "Start Live" and the
//     join effect re-runs and joins. While deferred the status
//     is 'preview' and the waiting pill is hidden (the parent
//     draws its own Start Live button). Default false — callers,
//     callees and viewers join on mount exactly as before.
//   onRemoteJoin(uid) / onRemoteLeave(uid) — optional callbacks
//   onJoin() — the local user actually joined the channel
//     (onJoinChannelSuccess). Call screens use it as the "connected"
//     flag for billing: no join = no charge.
//   onJoinError(error) — joining failed (token fetch / joinChannel).
//   onTokenExpiring() — the token is about to expire and cannot be
//     renewed (dev token / no token server): the call may drop soon.
//   onTokenRenewalFailed() — the token-server renewal fetch failed:
//     the call may drop soon.
//   Callbacks are read through a ref so a parent re-render never
//   re-runs the join effect (the effect deps stay channel/role/
//   audioOnly only).
//
// Joins on mount, leaves on unmount. Shows the remote user's video
// full-screen, with the local preview as a small picture-in-picture
// for the host. While nobody else is in the channel it shows a
// "waiting" state instead of a fake video.
export default function LiveVideo({
  channel,
  token,
  role = 'audience',
  audioOnly = false, // [F2]
  uid = 0,
  style,
  showLiveChip = true, // [New UI] false = the parent draws its own top UI (timer pills, LIVE badge)
  coGuestUids = [], // [Live room] approved co-guest Agora uids (see above)
  deferJoin = false, // [Pre-live] preview only until the parent flips it off (see above)
  onRemoteJoin,
  onRemoteLeave,
  onJoin,
  onJoinError,
  onTokenExpiring,
  onTokenRenewalFailed,
}) {
  const [status, setStatus] = React.useState('idle'); // idle | joining | joined | error | preview (pre-live: camera on, join deferred)
  const [error, setError] = React.useState('');
  // All currently-joined remote uids (a 1v1 caller and/or approved
  // co-guests). Split below into callerUid (call layout) and
  // guestUids (small co-guest boxes on the host's live).
  const [remoteUids, setRemoteUids] = React.useState([]);
  const [localUid, setLocalUid] = React.useState(0);
  // True only once onJoinChannelSuccess has actually fired — the join is
  // confirmed, not just attempted. The full-screen self view is keyed on
  // this so its setupLocalVideo runs AGAIN after joining: the join path
  // resets the engine (enableVideo), which detaches the pre-join binding
  // and leaves the view black until it re-binds post-join.
  const [joinConfirmed, setJoinConfirmed] = React.useState(false);
  // Instant live: true once the local camera preview has started
  // (before the token fetch). joinAttempt re-runs the join effect
  // when the host taps "Try again" after a failed join.
  const [previewStarted, setPreviewStarted] = React.useState(false);
  const [joinAttempt, setJoinAttempt] = React.useState(0);
  const joinedChannelRef = React.useRef(null);
  const RtcSurfaceViewRef = React.useRef(null);
  // TextureView for the full-screen self view (see the render
  // section): it draws inside the window, so the waiting pill
  // and the call overlays stay visible on top of it.
  const RtcTextureViewRef = React.useRef(null);
  // Latest callbacks, read by the join effect (which must NOT
  // re-run when a parent re-renders with new inline callbacks).
  const callbacksRef = React.useRef({});
  callbacksRef.current = {
    onRemoteJoin,
    onRemoteLeave,
    onJoin,
    onJoinError,
    onTokenExpiring,
    onTokenRenewalFailed,
  };

  // Retry after a failed join: clear the error and re-run the
  // join effect (permissions + preview + token + join). The token
  // server is often awake by the second attempt.
  const retryJoin = () => {
    setError('');
    setStatus('joining');
    setJoinConfirmed(false);
    setJoinAttempt((n) => n + 1);
  };

  React.useEffect(() => {
    const lib = loadAgora();
    if (lib && lib.RtcSurfaceView) {
      RtcSurfaceViewRef.current = lib.RtcSurfaceView;
    }
    if (lib && lib.RtcTextureView) {
      RtcTextureViewRef.current = lib.RtcTextureView;
    }

    if (AGORA_APP_ID_IS_PLACEHOLDER) {
      setStatus('error');
      setError('Live video needs your free Agora App ID.');
      return undefined;
    }
    if (!lib) {
      setStatus('error');
      setError('react-native-agora is not available in this build. Use a dev build / EAS build — it does not work in Expo Go.');
      return undefined;
    }

    // Token: explicit prop first, else a fresh token fetched from
    // the token server, else the dev-only env token. When nothing
    // is configured, resolveAgoraToken throws and the error view
    // below shows the message — never join without a token.
    setStatus('joining');
    setJoinConfirmed(false);
    const unsubscribe = onAgoraRemoteUser((event) => {
      const cb = callbacksRef.current;
      if (event.type === 'joined') {
        setRemoteUids((prev) => (prev.includes(event.uid) ? prev : [...prev, event.uid]));
        if (cb.onRemoteJoin) {
          cb.onRemoteJoin(event.uid);
        }
      } else if (event.type === 'left') {
        setRemoteUids((prev) => prev.filter((u) => u !== event.uid));
        if (cb.onRemoteLeave) {
          cb.onRemoteLeave(event.uid);
        }
      } else if (event.type === 'joined-self') {
        setStatus('joined');
        setJoinConfirmed(true);
        if (cb.onJoin) {
          cb.onJoin();
        }
      }
    });
    // Token-expiry events come from the shared engine handler —
    // forward them to this screen's toast callbacks.
    const unsubscribeToken = onAgoraTokenEvent((event) => {
      const cb = callbacksRef.current;
      if (event.type === 'expiring-no-renewal' && cb.onTokenExpiring) {
        cb.onTokenExpiring();
      } else if (event.type === 'renewal-failed' && cb.onTokenRenewalFailed) {
        cb.onTokenRenewalFailed();
      }
    });

    let cancelled = false;
    (async () => {
      try {
        // Permissions (Hapa-style: ask at the moment of use, never
        // at launch): a publisher — Go Live or answering a call —
        // is asked for mic (+ camera for video) BEFORE joining.
        // Viewers (audience) are never asked. A denial never
        // blocks the join — the call still connects for receiving.
        if (role === 'host') {
          try {
            await requestCallPermissions({ audioOnly });
          } catch (e) {
            // Best-effort — join anyway.
          }
          // Instant live: start the local camera preview FIRST,
          // before the token fetch — the host sees themselves at
          // once (the full-screen self view renders the running
          // preview) while the token server wakes up and the join
          // runs in the background. A preview failure never blocks
          // the join; the error view below is the fallback.
          if (!audioOnly && !cancelled) {
            try {
              startLocalPreview({ role, audioOnly });
              if (!cancelled) setPreviewStarted(true);
            } catch (e) {
              // Best-effort — the join below still runs.
            }
          }
        }
        if (cancelled) return;
        // [Pre-live] The host is on the pre-live screen: the
        // camera preview above is already running — stop here and
        // wait. The parent flips deferJoin to false when the host
        // taps "Start Live"; the effect re-runs (deferJoin is a
        // dep) and continues into the token fetch + join below.
        // The status 'preview' keeps the self view up with no
        // "Joining live…" pill (the pill is also gated on
        // !deferJoin in the render below).
        if (deferJoin) {
          if (!cancelled) setStatus('preview');
          return;
        }
        // Token fetch happens in the BACKGROUND of the running
        // preview: a token is minted per call, per channel (role
        // publisher for the host side, subscriber for the audience
        // side). On a cold Render Free server this can take
        // seconds — the host watches their own camera meanwhile
        // instead of a black "Joining live…" screen.
        const effectiveToken = await resolveAgoraToken({
          token,
          channelName: channel,
          uid,
          role: role === 'host' ? 'publisher' : 'subscriber',
        });
        if (cancelled) return;
        // [F2] audioOnly is passed through: voice calls join the same
        // channel with audio only, no video tracks.
        joinAgoraChannel({ token: effectiveToken, channelName: channel, uid, role, audioOnly });
        // [/F2]
        joinedChannelRef.current = channel;
        // If this uid was assigned by Agora (uid 0), the local canvas
        // still uses uid 0, which the SDK treats as "local user".
        setLocalUid(uid);
        // onJoinChannelSuccess flips the status to 'joined'; if the
        // callback is delayed, 'joining' still shows the video surface.
        setStatus('joined');
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not join the live channel.');
          setStatus('error');
          if (callbacksRef.current.onJoinError) {
            callbacksRef.current.onJoinError(e);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeToken();
      leaveAgoraChannel();
      // The preview was started on mount (instant live) — stop it
      // when this screen goes away so the camera does not keep
      // running after the call ends. Harmless for audience (the
      // preview never started) and for a retry re-run (the effect
      // starts it again right after).
      stopLocalPreview();
      joinedChannelRef.current = null;
    };
    // Re-join only when the channel, role or audio mode changes,
    // when the host taps "Try again" after a failed join, or when
    // deferJoin flips (the host tapped "Start Live" on the
    // pre-live screen and the token fetch + join may run now).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, role, audioOnly, joinAttempt, deferJoin]); // [F2] audioOnly added to deps

  // Multi-guest split (defined here so the audio-only early return
  // below can use remoteUid): a joined remote whose uid matches an
  // approved co-guest is a guest (small box); any other joined
  // remote is the 1v1 caller (call layout). With no coGuestUids
  // the split is a no-op and behaviour is exactly as before.
  // remoteUid = first joined remote, for the audio-only text.
  const coGuestSet = React.useMemo(
    () => new Set((coGuestUids || []).map((u) => Number(u))),
    [coGuestUids],
  );
  const guestUids = remoteUids.filter((u) => coGuestSet.has(Number(u)));
  const callerUid = remoteUids.find((u) => !coGuestSet.has(Number(u))) ?? null;
  const remoteUid = remoteUids.length > 0 ? remoteUids[0] : null;

  if (AGORA_APP_ID_IS_PLACEHOLDER) {
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.emoji}>📹</Text>
        <Text style={styles.title}>Live video needs your free Agora App ID</Text>
        <Text style={styles.text}>
          1. Sign up free at console.agora.io{'\n'}
          2. Create a project and copy the App ID{'\n'}
          3. Paste it in app.json → extra → AGORA_APP_ID{'\n'}
          (or in a .env file — see README.md)
        </Text>
        <Text style={styles.note}>Demo video is shown here until then — no fake live video.</Text>
      </View>
    );
  }

  if (status === 'error') {
    // Instant live: the camera preview is already running — keep
    // it on screen and show the error as an overlay with a retry
    // button, instead of a black error box. The host sees
    // themselves and can tap retry (the token server is often
    // awake by the second attempt). Without a running preview
    // (audience, voice call, or the preview never started) fall
    // through to the plain error box below.
    const RtcTextureView = RtcTextureViewRef.current;
    const RtcSurfaceView = RtcSurfaceViewRef.current;
    if (previewStarted && role === 'host' && !audioOnly && (RtcTextureView || RtcSurfaceView)) {
      return (
        <View style={[styles.videoBox, style]}>
          {RtcTextureView ? (
            <RtcTextureView
              style={styles.remoteVideo}
              canvas={{ uid: localUid, renderMode: RENDER_MODE_HIDDEN }}
            />
          ) : (
            <RtcSurfaceView
              style={styles.remoteVideo}
              canvas={{ uid: localUid, renderMode: RENDER_MODE_HIDDEN }}
              zOrderMediaOverlay
            />
          )}
          <View style={styles.errorOverlay}>
            <View style={styles.errorPill}>
              <Text style={styles.errorPillText}>⚠️ {error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={retryJoin} activeOpacity={0.85}>
                <Text style={styles.retryBtnText}>↻ Try again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.emoji}>⚠️</Text>
        <Text style={styles.title}>Live video could not start</Text>
        <Text style={styles.text}>{error}</Text>
        <Text style={styles.note}>Agora needs a dev build / EAS build — it does not work in Expo Go.</Text>
      </View>
    );
  }

  // [F2] Audio-only mode: no video surfaces at all — just a compact
  // status view. The channel is still joined (audio), and remote
  // join/leave events still fire, so the caller knows when the
  // host's audio is connected.
  if (audioOnly) {
    return (
      <View style={[styles.audioBox, style]}>
        <Text style={styles.audioEmoji}>🎙️</Text>
        <Text style={styles.audioText}>
          {status === 'joining'
            ? 'Joining voice call…'
            : remoteUid
              ? 'Voice connected'
              : 'Waiting for the host to join…'}
        </Text>
        <View style={styles.voiceChip}>
          <Text style={styles.liveChipText}>● VOICE</Text>
        </View>
      </View>
    );
  }
  // [/F2]

  const RtcSurfaceView = RtcSurfaceViewRef.current;
  const RtcTextureView = RtcTextureViewRef.current;
  if (!RtcSurfaceView) {
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.emoji}>📹</Text>
        <Text style={styles.title}>Starting live video…</Text>
      </View>
    );
  }

  const isHost = role === 'host';
  // Live broadcast: while the host has no 1v1 caller (a co-guest
  // does not count — they are a small box, not the main view),
  // show the host's OWN camera full-screen instead of a black
  // waiting placeholder. When a 1v1 caller joins, the layout flips
  // to caller main + the small "You" preview; when they leave it
  // flips back (and any co-guest boxes return).
  // The self view is a TextureView, NOT a SurfaceView: a plain
  // SurfaceView renders black here (its surface sits behind the
  // window and the videoBox's opaque background occludes it — the
  // 9c1244b full-screen SurfaceView showed black on the owner's
  // phone while the identical canvas on the small preview worked),
  // and adding zOrderMediaOverlay would put the surface ABOVE the
  // window and hide the waiting pill, the timer and the call
  // controls. A TextureView draws inside the window, so the
  // camera shows AND the pill/overlays stay visible on top of it.
  // The small "You" preview keeps working as a media-overlay
  // SurfaceView because it is tiny and overlaps no UI. Fallback:
  // if the TextureView is unavailable in this build, use a
  // media-overlay SurfaceView (camera visible, overlays covered)
  // rather than a black screen.
  const showSelfFullscreen = isHost && !callerUid;
  return (
    <View style={[styles.videoBox, style]}>
      {callerUid ? (
        <RtcSurfaceView
          style={styles.remoteVideo}
          canvas={{ uid: callerUid, renderMode: RENDER_MODE_HIDDEN }}
        />
      ) : showSelfFullscreen ? (
        RtcTextureView ? (
          <RtcTextureView
            key={joinConfirmed ? 'self-joined' : 'self-preview'}
            style={styles.remoteVideo}
            canvas={{ uid: localUid, renderMode: RENDER_MODE_HIDDEN }}
          />
        ) : (
          <RtcSurfaceView
            key={joinConfirmed ? 'self-joined' : 'self-preview'}
            style={styles.remoteVideo}
            canvas={{ uid: localUid, renderMode: RENDER_MODE_HIDDEN }}
            zOrderMediaOverlay
          />
        )
      ) : (
        <View style={styles.waiting}>
          <Text style={styles.waitingEmoji}>📹</Text>
          <Text style={styles.waitingText}>
            {status === 'joining' ? 'Joining live…' : 'Waiting for the host to join…'}
          </Text>
        </View>
      )}
      {/* [Pre-live] No pill while the join is deferred — the
          pre-live screen is camera + Start Live button only. The
          pill returns ("Joining live…") once Start Live is tapped
          and the join is actually running. */}
      {showSelfFullscreen && !deferJoin ? (
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingPill}>
            <Text style={styles.waitingPillText}>
              {status === 'joining' ? 'Joining live…' : 'You are live — waiting for viewers…'}
            </Text>
          </View>
        </View>
      ) : null}
      {isHost && callerUid ? (
        <View style={styles.localPreview}>
          <RtcSurfaceView
            style={styles.localVideo}
            canvas={{ uid: localUid, renderMode: RENDER_MODE_HIDDEN }}
            zOrderMediaOverlay
          />
          <Text style={styles.localLabel}>You</Text>
        </View>
      ) : null}
      {/* Co-guest video boxes: approved guests publish in the same
          channel; the host stays full-screen and each guest shows
          in a small box (reference "Waiting…(2)" box). Hidden
          during a 1v1 call — the caller layout takes over then. */}
      {showSelfFullscreen && guestUids.length > 0 ? (
        <View style={styles.guestRow}>
          {guestUids.map((uid) => (
            <View key={String(uid)} style={styles.guestBox}>
              <RtcSurfaceView
                style={styles.guestVideo}
                canvas={{ uid, renderMode: RENDER_MODE_HIDDEN }}
                zOrderMediaOverlay
              />
              <Text style={styles.guestLabel}>Guest</Text>
            </View>
          ))}
        </View>
      ) : null}
      {showLiveChip ? (
        <View style={styles.liveChip}>
          <Text style={styles.liveChipText}>
            {status === 'joined' ? '● LIVE' : '● Connecting…'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // [F2] Audio-only status view styles.
  audioBox: { alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 12, justifyContent: 'center', padding: 16 },
  audioEmoji: { fontSize: 32, marginBottom: 6 },
  audioText: { color: '#d1d5db', fontSize: 13, textAlign: 'center' },
  voiceChip: { backgroundColor: 'rgba(124,58,237,0.9)', borderRadius: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 10 },
  // [/F2]
  box: { backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 12 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  emoji: { fontSize: 40, marginBottom: 8 },
  liveChip: { backgroundColor: 'rgba(239,68,68,0.9)', borderRadius: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 10 },
  liveChipText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  localLabel: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginTop: 2, textAlign: 'center' },
  localPreview: { borderRadius: 10, overflow: 'hidden', position: 'absolute', right: 10, top: 10, width: 96 },
  localVideo: { height: 128, width: 96 },
  // Co-guest small boxes (top-right, stacked) on the host's live.
  guestRow: { gap: 8, position: 'absolute', right: 10, top: 10 },
  guestBox: { borderRadius: 10, overflow: 'hidden', width: 96 },
  guestVideo: { height: 128, width: 96 },
  guestLabel: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginTop: 2, textAlign: 'center' },
  note: { color: '#fbbf24', fontSize: 12, marginTop: 12, textAlign: 'center' },
  remoteVideo: { flex: 1 },
  text: { color: '#d1d5db', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  videoBox: { backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  waiting: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 20 },
  waitingEmoji: { fontSize: 40, marginBottom: 8 },
  waitingText: { color: '#d1d5db', fontSize: 14, textAlign: 'center' },
  // Top, just under the timer/coins pills (which end ~y=110):
  // the bottom of the screen is covered by VideoCallScreen's
  // bottom overlay (name, rate, controls, footer hint), which the
  // pill used to overlap when it sat at bottom: 12.
  waitingOverlay: { alignItems: 'center', left: 0, position: 'absolute', right: 0, top: 132 },
  waitingPill: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  waitingPillText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  // Join failed with the camera preview already running: the
  // error sits as a centred overlay on top of the host's own
  // video (never a black screen) with a retry button.
  errorOverlay: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  errorPill: { backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 14, marginHorizontal: 28, padding: 14 },
  errorPillText: { color: '#fff', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retryBtn: { alignSelf: 'center', backgroundColor: '#ec4899', borderRadius: 20, marginTop: 12, paddingHorizontal: 20, paddingVertical: 9 },
  retryBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
