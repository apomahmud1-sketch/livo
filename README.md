# Livo — APK-Ready Expo Project

> **This project has NO APK file inside — it is the complete source code to build the APK.**
> No payment was needed for this code. Only Google Play charges $25 later, one time.

Livo — premium 1-to-1 video calling app. Users find online hosts, tap to call,
pay per minute in coins, send gifts during the call, and hosts earn diamonds
that they can withdraw. VIP, ranking, chat, wallet and a host dashboard are included.

---

## The admin-panel rule (most important)

**Everything in this app lives in the admin panel.** The app never hard-codes
a price forever. `src/config.js` holds only the *defaults* — the admin panel
can change them at any time, and the app must read the admin values from the
backend (Supabase tables in `supabase/schema.sql`) once it is connected:

- **5 call-rate tiers** (demo prices): Tier 1 = 60, Tier 2 = 120, Tier 3 = 300,
  Tier 4 = 600, Tier 5 = 1,200 coins per minute. Admin can rename tiers,
  change any price, add or remove tiers.
- **Coin recharge packs** (demo prices): 100 coins $0.99, 500 $4.99,
  1,000 $9.99 (+100 bonus), 5,000 $49.99 (+500 bonus), 10,000 $99.99 (+1,500 bonus).
  Admin can add / edit / delete packs at any time.
- **Gifts**: Rose 10 → Castle 9,999 coins. Admin can upload, edit, activate
  and deactivate gifts.
- **Platform commission**: 30% of call earnings (demo). Admin can change it.
- **Minimum withdrawal**: 10,000 diamonds (demo). Admin can change it.
- **VIP packages**: VIP 1 $4.99 / 30 days, VIP 2 $9.99, VIP 3 $19.99 (demo).

Until the backend is connected the app runs on these demo values
(`src/config.js` + `src/data.js` + `src/store.js`).

---

## Screens (9)

- **Login** — poster background, Livo title, Google login only, 18+ Agree
  to User Agreement & Privacy Policy (login requires the tick).
- **Home** — For You / Online / Popular / New, 2-column host cards with
  photo, name, country flag, language, level, online status and
  per-minute coin price. Tap a host → video call.
- **Video Call** — incoming Accept / Decline, then full call screen with
  timer, live cost, mute, switch camera, beauty, gifts, end call and a
  call summary (duration, billed minutes, total cost, new balance).
  Billing is per started minute at the host's tier rate.
- **Messages** — chat list; tap a chat to call that host.
- **Wallet** — Coins, Diamonds, Earnings, demo recharge packs, Withdraw
  (bKash / Nagad / Bank / USDT) with Pending / Approved history.
- **Profile** — avatar, ID, country, Coins / Diamonds / Earnings, menu
  (Wallet, Host Dashboard, VIP, Ranking, chat price, Settings), call history.
- **Host Dashboard** — Online / Offline switch, total earnings, diamonds,
  my call-rate tier (pick any of the 5 admin tiers), recent calls.
- **Ranking** — Daily / Weekly / Monthly top hosts by earnings.
- **VIP** — VIP 1 / 2 / 3 packages.

Navigation: Login → Tabs (Home / Messages / Ranking / Me) → Video Call,
Wallet, Host Dashboard, VIP as stack screens.

---

## Remaining before APK — checklist

**DONE ✅**
- ✅ Full app code + 9 screens
- ✅ 5 call-rate tiers + demo coin packs in `src/config.js`
- ✅ Agora placeholder (empty App ID — no fake ID)
- ✅ Supabase backend scaffold — `src/supabase/client.js` + `supabase/schema.sql`
  (profiles, hosts, call_rates, coin_packs, gifts, calls, transactions,
  withdrawals, vip_packages)
- ✅ Play Store listing doc, Privacy Policy + Terms (templates — put your
  real support email in before publishing)

**STILL NEEDS THE USER ⏳**
- ⏳ **Free Agora App ID** — console.agora.io → Create a project → paste
  the App ID into `app.json` → `extra` → `AGORA_APP_ID`. Without it the
  call screen shows "Add your free Agora App ID" — no fake video is shown.
  Keep App Certificate OFF / Test Mode first, so no token is needed.
- ⏳ **Real video join logic** — `src/agora/LiveVideo.js` has a clear TODO:
  `createAgoraRtcEngine` + `joinChannel` with a token. Until that is added,
  no build will show real live video.
- ⏳ **Free Supabase project** — supabase.com → free project → URL + anon key
  in `.env` → run `supabase/schema.sql` once. Until then the app runs on
  demo data, and admin-panel changes cannot reach the app yet.
- ⏳ **Free Expo account** — `eas login`, otherwise no EAS build.
- ⏳ **$25 Play Store fee** — only when publishing, not now.
- ⏳ **Real payment gateway** — recharge / withdraw are demo for now.

---

## Build the APK — free (EAS), same flow as M Live

```bash
npm install
npx expo start          # test free in Expo Go (QR code)
npm install -g eas-cli
eas login
eas build --configure        # first time only — sets the real eas.projectId
eas build -p android --profile preview      # ← APK (install directly)
eas build -p android --profile production   # ← AAB (Google Play)
```

- `preview` profile = **APK**, `production` profile = **AAB** (both in `eas.json`).
- Or upload this whole folder to GitHub (no `node_modules/`) and use
  Expo's "Build from GitHub", exactly like the M Live project.
- `app.json` → `extra.eas.projectId` is the placeholder
  `00000000-0000-0000-0000-000000000000` — `eas build --configure`
  fills in the real one. If your Expo project is owned by a team, add
  `"owner": "<your-team>"` to `app.json` (M Live needed this).
- ⚠️ Expo Go cannot run real Agora video (native module) — use the
  EAS APK / dev build for video tests.

## Project structure

```
livo-apk-project/
├── App.js                  # Navigation: Login → Tabs (Home/Messages/Ranking/Me)
├── app.json                # name Livo, package com.livo.app, AGORA_APP_ID empty
├── eas.json                # preview = APK, production = AAB
├── package.json            # Expo SDK 52, React Navigation, react-native-agora, Supabase
├── babel.config.js / metro.config.js / index.js
├── .env.example
├── src/
│   ├── config.js           # ★ CALL_RATES (5 tiers), COIN_PACKS, GIFTS, commission
│   ├── data.js             # demo hosts, messages, ranking, call history
│   ├── store.js            # coins, chargeCall (per-minute billing), gifts, recharge
│   ├── screens/            # Login, Home, VideoCall, Messages, Wallet,
│   │                       #   Profile, HostDashboard, Ranking, VIP
│   ├── agora/LiveVideo.js  # Agora placeholder + joinChannel TODO
│   └── supabase/client.js  # Supabase scaffold (null until keys are added)
├── supabase/schema.sql     # profiles, hosts, call_rates, coin_packs, gifts,
│                           #   calls, transactions, withdrawals, vip_packages
└── assets/                 # icon.png, splash.png, login-poster.jpg
```

## Costs — what is free, what is not

| Item | Cost |
|---|---|
| This code | **Free** |
| Agora (10,000 min/month) | **Free** |
| Expo Go test | **Free** |
| EAS APK build (free tier) | **Free** |
| Google Play Developer account | **$25 one time** (only when publishing) |
