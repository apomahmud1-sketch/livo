# Livo — Agora token server

A tiny Express server that issues short-lived Agora RTC tokens, so
the app never ships a token or a secret. The App Certificate lives
only on the server, as an environment variable.

## What you need before deploying

1. **Agora App ID** — the same App ID the Livo app already uses
   (Agora Console → your project). It is also in the app's
   `app.json` → `extra` → `AGORA_APP_ID`.
2. **Agora App Certificate (Primary Certificate)** — Agora Console →
   your project → App Certificate. **Only the project owner can
   copy this from his own console.** It is a secret: it goes into
   the host's environment variables, never into code, chat, or git.

## Run it locally (test)

```bash
cd livo-token-server
npm install
cp .env.example .env   # then fill in AGORA_APP_ID + AGORA_APP_CERTIFICATE
npm start              # listens on :3000
curl "http://localhost:3000/token?channel=livo-call-2&uid=0"
# → { "token": "007e...", "channel": "livo-call-2", "uid": 0, ... }
```

## Deploy on Render (recommended — free, Blueprint file included)

`render.yaml` in this folder is a Render Blueprint: it creates the
web service with the right build/start commands and the env-var
slots. Exact steps (do these on the computer, not the phone):

1. Push this folder to GitHub (it lives in the Livo repo).
2. Render Dashboard (dashboard.render.com) → **New → Blueprint** →
   pick the repo → Render reads `render.yaml` and shows the
   `livo-token-server` web service (Free plan, Node).
3. Click **Apply**. Render asks for the two secret values
   (`sync: false` in the Blueprint means Render will NOT deploy
   without them — fill them in when prompted):
   - `AGORA_APP_ID` — the same App ID the Livo app already uses
     (Agora Console → your project; also in the app's `app.json` →
     `extra` → `AGORA_APP_ID`).
   - `AGORA_APP_CERTIFICATE` — see the ⚠️ note below.
4. Wait for the deploy to turn **Live**, then check:
   `curl https://livo-token-server.onrender.com/health`
   → `{"ok":true,"configured":true}` (configured is false until
   both secrets are set).
5. Test a token:
   `curl "https://livo-token-server.onrender.com/token?channel=livo-call-2&uid=0"`
   → `{"token":"007e...","channel":"livo-call-2",...}`.
6. Point the app at it: in the Livo app's `.env` (or the EAS build
   environment) set
   `EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL=https://livo-token-server.onrender.com`
   (no trailing slash) and rebuild. The app fetches a fresh token
   for every call from this URL — no token is ever baked into the
   app. (If you rename the Render service, the URL changes — use
   the exact URL Render shows.)

Free-tier note: Render Free sleeps after ~15 minutes with no
traffic, so the FIRST call after a pause waits ~30–60 seconds
while the service wakes (the app's token fetch times out after
8 seconds and shows "Could not reach the token server" — just
retry). If that delay is a problem, upgrade to Starter ($7/month,
stays awake). The old README's "$5/month" options (Railway/Fly.io)
still work the same way.

## ⚠️ AGORA_APP_CERTIFICATE is MISSING — only the user can fetch it

The token server CANNOT mint tokens without the Primary
Certificate, and nobody else can copy it. Only the project owner
(the user, signed in to his own Agora account) can get it:

**Agora Console (console.agora.io) → your project → App Certificate
→ Primary Certificate → copy it.**

Then paste it ONLY into the host's environment variables (Render
Dashboard → livo-token-server → Environment → `AGORA_APP_CERTIFICATE`,
or Railway/Fly secrets). Never paste it into code, chat, GitHub, or
the app — anyone with it can mint tokens for the whole Agora project.
Until it is set, `GET /token` answers 500 ("Token server is not
configured") and the app shows a clear "token server is not set up"
message instead of joining without a token.

## Deploy (other options — about $5/month)

- **Railway** — `railway init` → `railway up`, then set
  `AGORA_APP_ID` + `AGORA_APP_CERTIFICATE` in Variables.
  (Hobby $5/month; always on.)
- **Render** — see the Blueprint steps above (recommended).
  Manual alternative: New → Web Service → connect this folder,
  Build `npm install`, Start `npm start`, set the two env vars.
  (Free tier sleeps after inactivity — bad for live calls; the
  $7/month Starter plan stays awake.)
- **Fly.io** — `fly launch` → `fly secrets set AGORA_APP_ID=…
  AGORA_APP_CERTIFICATE=…` → `fly deploy`. (~$2/month for a
  small shared machine.)

After deploy, note the public URL, e.g.
`https://livo-token-server.up.railway.app`.

## How the app uses it

`src/agora/LiveVideo.js` fetches a fresh token right before
joining a channel, and keeps the env token only as a dev fallback:

- Token server set (`EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL`) → the app
  calls `GET {URL}/token?channel=<name>&uid=0&role=publisher|subscriber`
  for every call (8-second timeout, clear in-app error if the server
  is down or unconfigured). Token renewal on expiry uses the same
  endpoint (`onTokenPrivilegeWillExpire` → `renewToken`).
- No server URL → falls back to `EXPO_PUBLIC_AGORA_TOKEN` (a Temp
  Token — 24 hours, testing only).
- Neither configured → the call screen shows a clear "token server
  is not set up yet" message instead of joining without a token
  (Secure Mode would reject it anyway).

The channel name the app uses is `livo-call-<hostId>` (see
`VideoCallScreen.js` / `src/calls/signalling.js`), and `uid=0`
makes the token valid for any user in that channel. Call invites
themselves travel over Supabase Realtime on the `calls` table
(`src/calls/signalling.js`) — no push/FCM: the callee only rings
while their app is open.

## Security notes

- Never put `AGORA_APP_CERTIFICATE` in the app, in git, or in
  chat. Anyone with it can mint tokens for your Agora project.
- The `/token` endpoint is intentionally open (the app calls it
  from users' phones). For production, consider adding a simple
  shared secret header or rate limiting, and only minting tokens
  for channels that match `livo-call-*`.
- Tokens live at most 1 hour (`TOKEN_TTL_SECONDS`, max 86400).
  The app should fetch a fresh token for every call.
