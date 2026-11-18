# Livo — Real Agora Video (2026-11-18)

Live video is now REAL code, not a placeholder. Hosts publish their
camera + mic, viewers watch the host's real video, and 1-to-1 calls
use a real Agora channel. What is still demo: the token (see below).

## What changed

### `src/agora/LiveVideo.js` — rewritten (real module)
- Reads the App ID from `app.json` → `extra.AGORA_APP_ID` via
  `src/config.js` (unchanged). Nothing here is a placeholder anymore.
- Exports:
  - `joinAgoraChannel({ token, channelName, uid = 0, role })` —
    creates the engine once, `initialize({ appId, channelProfile:
    ChannelProfileLiveBroadcasting })`, `setClientRole`,
    `enableVideo`, `startPreview` (host only), then
    `joinChannel(token, channelId, uid, { clientRoleType,
    publishCameraTrack, publishMicrophoneTrack,
    autoSubscribeAudio: true, autoSubscribeVideo: true })`.
    Throws a readable Error when the App ID, the token or the
    native module is missing, or when initialize/join returns
    a non-zero code.
  - `leaveAgoraChannel()` — leaves the channel (safe when not joined).
  - `releaseAgoraEngine()` — leaves and destroys the engine.
  - `setAgoraMuted(muted)` — `muteLocalAudioStream`.
  - `setAgoraCameraEnabled(enabled)` — `enableLocalVideo` +
    `muteLocalVideoStream`.
  - `switchAgoraCamera()` — `switchCamera` (front/back).
  - `setAgoraBeauty(enabled)` — `setBeautyEffectOptions` with
    lightening 0.7 / smoothness 0.5 / redness 0.1 / sharpness 0.3.
  - `onAgoraRemoteUser(cb)` — subscribe to `{ type: 'joined' |
    'left', uid }`; returns an unsubscribe function. Backed by
    `registerEventHandler` (`onUserJoined`, `onUserOffline`,
    `onJoinChannelSuccess`, `onLeaveChannel`, `onError`,
    `onTokenPrivilegeWillExpire`).
  - `AGORA_TOKEN` — reads `EXPO_PUBLIC_AGORA_TOKEN` from the
    environment. No real token value is in this file, ever.
- Default export `<LiveVideo channel token role uid style
  onRemoteJoin onRemoteLeave>`:
  - Joins on mount, leaves on unmount.
  - `role="host"` publishes camera + mic and shows the local
    preview picture-in-picture; `role="audience"` watches only.
  - Remote video renders full-screen with `<RtcSurfaceView
    canvas={{ uid, renderMode: RenderModeHidden }}>`.
  - While nobody else is in the channel it shows "Waiting for
    the host…" / "You are live — waiting for viewers…" — never a
    fake video.
  - If the App ID is missing, the native module is missing
    (Expo Go), or the token is missing, it shows a clear message
    explaining what to do.
- API source: react-native-agora **4.4.0** package typings
  (`lib/typescript/src/IAgoraRtcEngine.d.ts`, `AgoraBase.d.ts`,
  `AgoraRtcRenderView.d.ts`). Every method name, argument order
  and enum value was read from those files, not from memory.

### `src/screens/VideoCallScreen.js` — wired (minimal changes)
- The mic / camera-switch / beauty buttons now call the real
  engine (`setAgoraMuted`, `switchAgoraCamera`, `setAgoraBeauty`).
- `endCall` also calls `leaveAgoraChannel()` (the `<LiveVideo>`
  unmount cleanup leaves too — both are safe).
- The fake "You · Front camera" self-preview box is gone:
  `<LiveVideo>` now renders the real local preview PiP.
- The hint line no longer says "Demo video — real Agora video
  comes later"; it now says "Live video via Agora".
- Nothing else changed: same labels, prices, billing, gifts,
  timer, incoming/summary screens.

### `src/screens/HomeScreen.js` — no change needed
- Tapping a live card already navigates to `VideoCall` with the
  host, and `VideoCallScreen` is the live room. So the host-live
  and viewer-watch paths both run through the wired screen above.
  (There is no separate LiveRoom screen in the code project.)

### Not touched
`store.js`, `config.js`, `WalletScreen.js`, `app.json` — exactly
as instructed. Nothing was pushed to GitHub.

## How to test (Temp Token — testing only)

A Temp Token lasts **24 hours** and works for **one channel name
only**. It is for testing, never for real users.

1. Open **console.agora.io** → your project (the one with App ID
   `ac11cdc3f22b4f86bb2fceab3820b8d7`) → **Generate temp token**.
2. Channel name: the channel the app joins. For a 1-to-1 call
   with host id 2 the app joins `livo-call-2`, so generate the
   token for channel `livo-call-2`. (Host ids are in `src/data.js`.)
3. Copy the token.
4. Set it as `EXPO_PUBLIC_AGORA_TOKEN` in the EAS build
   environment (or in a local `.env` file for a local dev build).
   Never commit a token to GitHub.
5. Build in Expo (Android, preview profile) and install the APK.
6. Test with two phones (or one phone + the Agora web demo):
   open the same host card on both, Accept the call on one —
   each phone must join the same channel with its own token
   (generate a second Temp Token for the same channel name).
   You should see the other person's real camera video.
7. If joining fails, the app shows the error on screen. The most
   common causes: token expired (24h), token generated for a
   different channel name, or the build is Expo Go (Agora does
   not work in Expo Go — use an EAS build).

## Still missing for production

1. **Token server (required).** Temp Tokens expire after 24h and
   cannot be shipped to real users. A small backend endpoint must
   generate a fresh RTC token per user per channel (using the
   App ID + App Certificate on the server). The app then passes
   that token as the `token` prop. The Primary Certificate must
   NEVER be in the app.
2. **Token refresh.** `onTokenPrivilegeWillExpire` currently only
   logs a warning. It should fetch a fresh token and call
   `engine.renewToken(newToken)`.
3. **Permissions.** Android `CAMERA` + `RECORD_AUDIO` are already
   in `app.json`. On first join the OS asks the user — if they
   deny, video/audio will be black/silent.
4. **Host go-live from Host Dashboard.** `HostDashboardScreen`
   has no Go Live navigation yet — when it is added it should
   navigate to `VideoCall` with the host (same as Home does),
   or to a dedicated live-room screen reusing `<LiveVideo
   role="host">` with channel `livo-live-<hostId>`.
5. **Viewer counts / live status.** Still demo numbers in
   `HomeScreen.js` (`VIEWERS` map). Real counts come from
   Supabase once screens are wired to it.

## Verify (done 2026-11-18)

```
npx --yes esbuild --loader:.js=jsx --jsx=automatic --outfile=/dev/null src/agora/LiveVideo.js
npx --yes esbuild --loader:.js=jsx --jsx=automatic --outfile=/dev/null src/screens/VideoCallScreen.js
# full sweep: every .js file in the project parses OK
```
