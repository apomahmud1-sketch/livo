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
// join any channel. The token comes from ONE of these places:
//   1. The `token` prop passed to <LiveVideo> (preferred), or
//   2. The AGORA_TOKEN constant below, which reads the
//      EXPO_PUBLIC_AGORA_TOKEN env var (set it in .env or in the
//      EAS build environment — NEVER commit a real token to GitHub).
//
// FOR TESTING ONLY: generate a Temp Token in the Agora Console
// (console.agora.io -> your project -> Generate temp token).
// A Temp Token lasts 24 hours and is tied to ONE channel name.
// FOR PRODUCTION you MUST run a token server (your backend
// generates a fresh token per user per channel). NEVER embed the
// Primary Certificate in the app — anyone who has it can join
// any channel as anyone.
//
// The App ID comes from app.json -> extra -> AGORA_APP_ID
// (see src/config.js). It is NOT a secret.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AGORA_APP_ID, AGORA_APP_ID_IS_PLACEHOLDER, COLORS } from '../config';

// ── Token ──────────────────────────────────────────────────────
// Set EXPO_PUBLIC_AGORA_TOKEN in .env (testing: paste a Temp Token
// from the Agora Console; production: leave empty — the token must
// come from your token server, passed as the `token` prop).
// This file NEVER contains a real token value.
export const AGORA_TOKEN = process.env.EXPO_PUBLIC_AGORA_TOKEN || '';
export const AGORA_TOKEN_IS_MISSING = !AGORA_TOKEN;

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
      // Temp Tokens expire after 24h. In production, fetch a fresh
      // token from the token server here and call renewToken().
      // eslint-disable-next-line no-console
      console.warn('[Agora] Token will expire soon — fetch a new token from the token server.');
    },
    onError: (err, msg) => {
      // eslint-disable-next-line no-console
      console.warn('[Agora] engine error', err, msg);
    },
  });
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

  if (!engine) {
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
//   token    — RTC token (defaults to AGORA_TOKEN / EXPO_PUBLIC_AGORA_TOKEN)
//   role     — 'host' (goes live, publishes camera+mic) or
//              'audience' (watches, publishes nothing). Default 'audience'.
//   audioOnly — [F2] true = voice call: joins the channel with audio
//              only (see joinAgoraChannel) and renders a compact
//              audio status view instead of any video surface — no
//              local preview, no remote video view.
//   uid      — numeric uid (0 = Agora assigns one). Default 0.
//   style    — container style
//   onRemoteJoin(uid) / onRemoteLeave(uid) — optional callbacks
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
  onRemoteJoin,
  onRemoteLeave,
}) {
  const [status, setStatus] = React.useState('idle'); // idle | joining | joined | error
  const [error, setError] = React.useState('');
  const [remoteUid, setRemoteUid] = React.useState(null);
  const [localUid, setLocalUid] = React.useState(0);
  const joinedChannelRef = React.useRef(null);
  const RtcSurfaceViewRef = React.useRef(null);

  React.useEffect(() => {
    const lib = loadAgora();
    if (lib && lib.RtcSurfaceView) {
      RtcSurfaceViewRef.current = lib.RtcSurfaceView;
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

    const effectiveToken = token || AGORA_TOKEN;
    if (!effectiveToken) {
      setStatus('error');
      setError(
        'Agora token is missing. Generate a Temp Token in the Agora Console ' +
          '(24 hours, testing only) and set EXPO_PUBLIC_AGORA_TOKEN, ' +
          'or pass a token-server token as the token prop.',
      );
      return undefined;
    }

    setStatus('joining');
    const unsubscribe = onAgoraRemoteUser((event) => {
      if (event.type === 'joined') {
        setRemoteUid(event.uid);
        if (onRemoteJoin) {
          onRemoteJoin(event.uid);
        }
      } else if (event.type === 'left') {
        setRemoteUid((current) => (current === event.uid ? null : current));
        if (onRemoteLeave) {
          onRemoteLeave(event.uid);
        }
      } else if (event.type === 'joined-self') {
        setStatus('joined');
      }
    });

    let cancelled = false;
    try {
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
      }
    }

    return () => {
      cancelled = true;
      unsubscribe();
      leaveAgoraChannel();
      joinedChannelRef.current = null;
    };
    // Re-join only when the channel, role or audio mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, role, audioOnly]); // [F2] audioOnly added to deps

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
  if (!RtcSurfaceView) {
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.emoji}>📹</Text>
        <Text style={styles.title}>Starting live video…</Text>
      </View>
    );
  }

  const isHost = role === 'host';
  return (
    <View style={[styles.videoBox, style]}>
      {remoteUid ? (
        <RtcSurfaceView
          style={styles.remoteVideo}
          canvas={{ uid: remoteUid, renderMode: RENDER_MODE_HIDDEN }}
        />
      ) : (
        <View style={styles.waiting}>
          <Text style={styles.waitingEmoji}>📹</Text>
          <Text style={styles.waitingText}>
            {status === 'joining'
              ? 'Joining live…'
              : isHost
                ? 'You are live — waiting for viewers…'
                : 'Waiting for the host to join…'}
          </Text>
        </View>
      )}
      {isHost && (
        <View style={styles.localPreview}>
          <RtcSurfaceView
            style={styles.localVideo}
            canvas={{ uid: localUid, renderMode: RENDER_MODE_HIDDEN }}
            zOrderMediaOverlay
          />
          <Text style={styles.localLabel}>You</Text>
        </View>
      )}
      <View style={styles.liveChip}>
        <Text style={styles.liveChipText}>
          {status === 'joined' ? '● LIVE' : '● Connecting…'}
        </Text>
      </View>
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
  note: { color: '#fbbf24', fontSize: 12, marginTop: 12, textAlign: 'center' },
  remoteVideo: { flex: 1 },
  text: { color: '#d1d5db', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  title: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  videoBox: { backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  waiting: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 20 },
  waitingEmoji: { fontSize: 40, marginBottom: 8 },
  waitingText: { color: '#d1d5db', fontSize: 14, textAlign: 'center' },
});
