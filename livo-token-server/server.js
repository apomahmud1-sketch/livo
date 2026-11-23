// ─────────────────────────────────────────────────────────────────
// Livo — Agora RTC token server.
//
// Issues short-lived Agora tokens so the app never ships a secret.
// The App ID and App Certificate come from ENVIRONMENT VARIABLES
// ONLY — never put them in this file, never commit a .env file.
//   AGORA_APP_ID          — from the Agora Console (same App ID the
//                           app already uses in app.json → extra)
//   AGORA_APP_CERTIFICATE — from the Agora Console → your project →
//                           App Certificate → Primary Certificate
//                           (the user supplies this at deploy time)
//   PORT                  — default 3000
//   TOKEN_TTL_SECONDS     — token lifetime, default 3600 (1 hour)
//
// Endpoints:
//   GET /health            → { ok: true } (uptime check)
//   GET /token?channel=<name>&uid=<number>&role=publisher|subscriber
//                          → { token, channel, uid, expiresAt }
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_ID = (process.env.AGORA_APP_ID || '').trim();
const APP_CERTIFICATE = (process.env.AGORA_APP_CERTIFICATE || '').trim();
const TOKEN_TTL_SECONDS = Math.min(
  Math.max(Number(process.env.TOKEN_TTL_SECONDS || 3600) || 3600, 60),
  86400
);

// The app fetches from a phone, so allow cross-origin requests.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, configured: Boolean(APP_ID && APP_CERTIFICATE) });
});

app.get('/token', (req, res) => {
  if (!APP_ID || !APP_CERTIFICATE) {
    return res.status(500).json({
      error: 'Token server is not configured: set AGORA_APP_ID and AGORA_APP_CERTIFICATE.',
    });
  }

  const channel = String(req.query.channel || '').trim();
  // Agora channel names: 1–64 chars, letters/digits/_/-
  if (!channel || channel.length > 64 || !/^[A-Za-z0-9_-]+$/.test(channel)) {
    return res.status(400).json({
      error: 'Missing or invalid channel. Use 1–64 letters, digits, _ or -.',
    });
  }

  const uidRaw = String(req.query.uid ?? '0').trim();
  const uid = Number(uidRaw);
  if (!Number.isInteger(uid) || uid < 0) {
    return res.status(400).json({ error: 'uid must be a non-negative integer (0 = any user).' });
  }

  const role =
    String(req.query.role || 'publisher').toLowerCase() === 'subscriber'
      ? RtcRole.SUBSCRIBER
      : RtcRole.PUBLISHER;

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expireTs = nowSeconds + TOKEN_TTL_SECONDS;
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channel,
      uid,
      role,
      expireTs
    );
    return res.json({
      token,
      channel,
      uid,
      role: role === RtcRole.PUBLISHER ? 'publisher' : 'subscriber',
      expiresAt: new Date(expireTs * 1000).toISOString(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[token] failed to build token:', err && err.message);
    return res.status(500).json({ error: 'Failed to build token.' });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Not found. Use GET /token or GET /health.' }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[livo-token-server] listening on :${PORT} (configured: ${Boolean(APP_ID && APP_CERTIFICATE)})`);
});
