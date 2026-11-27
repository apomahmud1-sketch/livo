// Livo HostDashboardScreen — v3 (2026-11-22)
// REAL host dashboard: earnings come from the calls + transactions
// rows of the signed-in host, withdraw inserts a Pending row into
// withdrawals, and the Online switch + Call Rate picker persist to
// the hosts table (see src/supabase/host.js). No demo numbers
// anywhere on this screen — when there are no calls yet, the
// numbers are honestly 0.
//
// The signed-in user comes from the local session via
// getSessionUser() (src/supabase/auth.js); user.id
// equals profiles.id. With no session the screen prompts login
// instead of showing anyone else's data. A host row is created
// ONLY when the user taps "Apply to Become a Host" on this screen
// — opening the dashboard no longer creates one on its own. The
// new row has status 'pending' — only the Mother Panel / an admin
// can approve it, so a pending host sees "Approval Pending" and
// cannot go live until then.
//
// Identity verification (2026-11-27): applying REQUIRES a short
// verification video recorded live in the app (camera only, never
// the gallery, so it cannot be someone else's pre-recorded clip).
// The video is uploaded to the 'host-verification-videos' bucket
// under the user's own UID folder and the host row is marked
// verification_status 'pending' for Mother Panel review. The app
// never writes 'verified' / 'rejected' — a DB trigger blocks that;
// only the owner sets those from the panel. Existing approved
// hosts without a video (verification_status 'none') get a
// "Verify my identity" button that records + uploads the same
// way. No application is ever submitted without a video URL.
//
// Online presence: toggling Online sets hosts.is_online + a
// last_seen heartbeat every 30s (stops on toggle-off / unmount).
// Home treats a host as online only while the heartbeat is fresh.
//
// There is NO call summary screen (user 2026-11-18): after a call
// ends everyone goes straight back — the host sees the earnings
// here. The old demo "Imran" 1-to-1 request card is gone: it was
// a fabricated caller with no backend behind it. Real incoming
// call requests need a requests backend (not built yet).
import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, MIN_WITHDRAW_DIAMONDS, WITHDRAW_METHODS } from '../config';
import { useApp } from '../store';
import { useAppConfig, genderViewFor } from '../appConfig';
import { supabase } from '../supabase/client';
import { withTimeout } from '../supabase/timeout';
import { fetchMyProfile } from '../supabase/auth';
import {
  ensureHostRow,
  fetchHostEarnings,
  fetchMyWithdrawals,
  fetchRequestedLiveCheck,
  getCurrentUser,
  getMyHostRow,
  getMyProfile,
  markLiveCheckExpired,
  markLiveCheckLive,
  requestWithdrawal,
  setHostOnline,
  setHostRateTier,
  startHostHeartbeat,
  stopHostHeartbeat,
  updateHostVerification,
} from '../supabase/host';

const CHART_H = 120;

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

// Live-check countdown: "MM:SS", or "H:MM:SS" past an hour.
function fmtCountdown(totalSecs) {
  const s = Math.max(0, Math.floor(totalSecs || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function HostDashboardScreen({ navigation, route }) {
  const { showToast, hosts, setHostOnline: setStoreHostOnline, setHostRate: setStoreHostRate, callRates, getLiveCallRate, diamonds } = useApp();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [hostRow, setHostRow] = useState(null);
  const [applying, setApplying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // Surprise live check (Mother Panel verification): the pending
  // 'requested' live_checks row for this host, if any. liveCheck
  // = banner + countdown; liveCheckMissed = the deadline passed.
  const [liveCheck, setLiveCheck] = useState(null);
  const [liveCheckMissed, setLiveCheckMissed] = useState(false);
  const [liveCheckSecs, setLiveCheckSecs] = useState(0);
  const liveCheckRef = useRef(null);
  liveCheckRef.current = liveCheck;
  const [earnings, setEarnings] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [online, setOnline] = useState(false);
  const [myTier, setMyTier] = useState('tier2');
  // Withdraw form.
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(WITHDRAW_METHODS[0]);
  const [account, setAccount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const hostRowRef = useRef(null);
  hostRowRef.current = hostRow;

  const approved = hostRow && hostRow.status === 'approved';
  // Go Live is for female hosts only (profiles.gender). A missing
  // or non-female gender hides/disables it — never guessed.
  const isFemale = String((profile && profile.gender) || '').toLowerCase() === 'female';
  // Gender-based view (panel app_config → gender_views): the Go Live
  // button only shows when this user's view is 'host'. The approved
  // + female gates inside goLive() are unchanged. Fail open: no live
  // config or an unknown gender keeps the button (current behaviour).
  const appCfg = useAppConfig();
  const showGoLive = !appCfg.configLive
    || genderViewFor(appCfg, profile && profile.gender) === 'host';
  // Store host with the same host_id, so Home updates at once when
  // this host toggles online / changes rate in this session.
  const storeHost = hostRow ? hosts.find((h) => String(h.id) === String(hostRow.host_id)) : null;
  const rate = getLiveCallRate(myTier);
  // Available balance: the signed-in user's real profiles.diamonds
  // (store) MINUS pending withdrawals — paid-out ones already left
  // the balance, rejected/cancelled ones are free again.
  const pendingWithdrawals = withdrawals.reduce((sum, w) => (
    String(w.status || '').toLowerCase() === 'pending'
      ? sum + (Number(w.amount_diamonds) || 0)
      : sum
  ), 0);
  const availableDiamonds = Math.max(0, (diamonds || 0) - pendingWithdrawals);
  const weekMax = earnings ? Math.max(1, ...earnings.week.map((d) => d.coins)) : 1;

  // Load the signed-in host's real data once, on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(u);
      // getMyProfile (host.js) does not select gender/country, so
      // merge the auth.js profile row (which does) for the Go Live
      // gender gate and any other real profile values.
      // Read-only check on mount: the host row is created ONLY by
      // the Apply button below, never automatically on opening this
      // screen.
      const [prof, row, authProf] = await Promise.all([
        getMyProfile(u.id),
        getMyHostRow(u.id),
        fetchMyProfile(u.id),
      ]);
      if (cancelled) return;
      setProfile({ ...(prof || {}), ...((authProf && authProf.profile) || {}) });
      setHostRow(row);
      if (row) {
        setOnline(!!row.is_online);
        setMyTier(row.rate_tier || 'tier2');
        if (row.is_online && row.status === 'approved') startHostHeartbeat(row.id);
        const [earn, wds] = await Promise.all([
          fetchHostEarnings(row.id, u.id),
          fetchMyWithdrawals(row.id),
        ]);
        if (cancelled) return;
        setEarnings(earn);
        setWithdrawals(wds);
        // Surprise live check: a 'requested' check for this host
        // (the Mother Panel asked the host to go live before a
        // deadline). Deadline in the future → banner + countdown;
        // already past → mark it expired and show the missed
        // message instead of the prompt.
        const check = await fetchRequestedLiveCheck(row.host_id);
        if (cancelled) return;
        if (check) {
          const deadline = check.deadline_at ? new Date(check.deadline_at).getTime() : 0;
          const remaining = Math.floor((deadline - Date.now()) / 1000);
          if (deadline && remaining > 0) {
            setLiveCheck(check);
            setLiveCheckSecs(remaining);
          } else {
            markLiveCheckExpired(check.id);
            setLiveCheckMissed(true);
          }
        }
      } else {
        setEarnings({
          todayCoins: 0, todayDiamonds: 0, todayCalls: 0, todayMinutes: 0,
          totalCoins: 0, totalDiamonds: 0, totalCalls: 0, totalMinutes: 0, week: [],
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      // Deliberately NOT stopping the heartbeat here: leaving the
      // dashboard (e.g. Go Live) must not mark the host offline.
      // The toggle-off path stops it with markOffline=true.
    };
  }, []);

  // Live-check countdown: ticks once a second while a check is
  // pending. When it hits zero the check has expired — mark it
  // expired and show the missed message instead of the prompt.
  useEffect(() => {
    if (!liveCheck || !liveCheck.deadline_at) return undefined;
    const deadline = new Date(liveCheck.deadline_at).getTime();
    let done = false;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setLiveCheckSecs(remaining);
      if (remaining <= 0 && !done) {
        done = true;
        markLiveCheckExpired(liveCheck.id);
        setLiveCheck(null);
        setLiveCheckMissed(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [liveCheck]);

  const refreshMoney = async () => {
    const row = hostRowRef.current;
    if (!row || !user) return;
    const [earn, wds] = await Promise.all([
      fetchHostEarnings(row.id, user.id),
      fetchMyWithdrawals(row.id),
    ]);
    setEarnings(earn);
    setWithdrawals(wds);
  };

  // Identity verification state: 'none' | 'pending' | 'verified' |
  // 'rejected' (hosts.verification_status). The app only ever
  // writes 'pending' — see updateHostVerification (host.js).
  const verificationStatus = (hostRow && hostRow.verification_status) || 'none';

  // Record a verification video (camera only — never the gallery,
  // so the clip is recorded live in the app and cannot be someone
  // else's pre-recorded video) and upload it to the
  // 'host-verification-videos' bucket under this user's own UID
  // folder. Returns the public URL, or null when the host
  // cancelled or the upload failed (a message is shown on failure;
  // a plain cancel stays silent so retry is one tap away).
  const recordAndUploadVerificationVideo = async () => {
    if (!user) return null;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        showToast('Please allow camera access in Settings to record the verification video');
        return null;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        quality: 0.8,
        videoMaxDuration: 30,
      });
      if (res.canceled || !res.assets || !res.assets[0] || !res.assets[0].uri) return null;
      const uri = res.assets[0].uri;
      showToast('Uploading your verification video…');
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const path = `${user.id}/verification-${Date.now()}.mp4`;
      const upRes = await withTimeout(
        supabase.storage.from('host-verification-videos').upload(path, blob, {
          contentType: 'video/mp4',
          upsert: true,
        }),
        60000,
      );
      if (!upRes || upRes.error) {
        showToast('Video upload failed — check your connection and try again');
        return null;
      }
      const { data: pub } = supabase.storage.from('host-verification-videos').getPublicUrl(path);
      const url = pub && pub.publicUrl;
      if (!url) {
        showToast('Video upload failed — check your connection and try again');
        return null;
      }
      return url;
    } catch (e) {
      showToast('Could not record or upload the video — please try again');
      return null;
    }
  };

  // Re-record / first-time verify for an existing host row
  // (verification 'none' or 'rejected'). Marks the row 'pending'
  // for Mother Panel review — never 'verified' / 'rejected'.
  const recordVerificationVideo = async () => {
    if (!user || !hostRow || verifying) return;
    setVerifying(true);
    const url = await recordAndUploadVerificationVideo();
    if (!url) {
      setVerifying(false);
      return;
    }
    const ok = await updateHostVerification(hostRow.id, { verificationVideoUrl: url });
    setVerifying(false);
    if (!ok) {
      showToast('Video uploaded but could not be saved — please try again');
      return;
    }
    setHostRow({ ...hostRow, verification_video_url: url, verification_status: 'pending' });
    showToast('Verification video submitted — the Mother Panel will review it');
  };

  // Explicit Apply step: the only way a host row gets created.
  // The verification video comes FIRST — the application is never
  // submitted without a video URL. The new row has status
  // 'pending'; the Mother Panel approves it.
  const applyToBecomeHost = async () => {
    if (!user || applying) return;
    setApplying(true);
    const videoUrl = await recordAndUploadVerificationVideo();
    if (!videoUrl) {
      // Cancelled or upload failed — no host row is created, so
      // the host can simply tap Apply again and retry.
      setApplying(false);
      return;
    }
    const row = await ensureHostRow(user);
    if (!row) {
      setApplying(false);
      showToast('Apply was not submitted — please try again');
      return;
    }
    const ok = await updateHostVerification(row.id, { verificationVideoUrl: videoUrl });
    const finalRow = ok
      ? { ...row, verification_video_url: videoUrl, verification_status: 'pending' }
      : row;
    setHostRow(finalRow);
    setOnline(!!row.is_online);
    setMyTier(row.rate_tier || 'tier2');
    setEarnings({
      todayCoins: 0, todayDiamonds: 0, todayCalls: 0, todayMinutes: 0,
      totalCoins: 0, totalDiamonds: 0, totalCalls: 0, totalMinutes: 0, week: [],
    });
    setApplying(false);
    if (ok) {
      showToast('Application sent — the Mother Panel will review it');
    } else {
      showToast('Application sent, but the video could not be saved — record it again from the dashboard');
    }
  };

  const toggleOnline = async () => {
    if (!hostRow) return;
    if (!approved) {
      showToast('Not approved yet — you can go live once the panel approves you');
      return;
    }
    const next = !online;
    setOnline(next);
    const ok = await setHostOnline(hostRow.id, next);
    if (!ok) {
      setOnline(!next);
      showToast('Online status was not saved — please try again');
      return;
    }
    if (next) startHostHeartbeat(hostRow.id);
    else stopHostHeartbeat(true);
    if (storeHost) setStoreHostOnline(storeHost.id, next);
    showToast(
      next
        ? "You're online — your live is now showing on Home"
        : "You're offline — your live is no longer on Home"
    );
  };

  const pickRate = async (tierId) => {
    if (!hostRow) return;
    setMyTier(tierId);
    const ok = await setHostRateTier(hostRow.id, tierId);
    if (!ok) {
      showToast('Rate was not saved — please try again');
      return;
    }
    if (storeHost) setStoreHostRate(storeHost.id, tierId);
    const r = getLiveCallRate(tierId);
    showToast(`Your call rate is now ${fmt(r.coinsPerMinute)} coins/min`);
  };

  // Go Live must not depend on the store's live-hosts list: an
  // offline host is never in it (and the list is still the demo
  // fallback when the live fetch has not landed), so requiring it
  // made Go Live impossible for exactly the host trying to go
  // live. Build the same host object from this screen's own
  // loaded hostRow + profile instead — same shape as
  // fetchLiveHosts() maps (live.js), so VideoCall gets the exact
  // fields it uses: id (host_id "u-…"), name, country, rateTier.
  const buildLiveHost = () => {
    if (!hostRow || !profile) return null;
    const name =
      (profile.username && String(profile.username)) ||
      (user && user.email ? String(user.email).split('@')[0] : 'Host');
    const country = String(profile.country || 'SGP').toUpperCase();
    const flags = { BGD: '🇧🇩', IND: '🇮🇳', PAK: '🇵🇰', SGP: '🇸🇬', PHL: '🇵🇭', BRA: '🇧🇷', KOR: '🇰🇷' };
    return {
      id: String(hostRow.host_id),
      userId: profile.user_id || null,
      profileId: hostRow.profile_id || null,
      name,
      country,
      flag: flags[country] || '🌍',
      lang: profile.language || 'English',
      level: 1,
      rateTier: hostRow.rate_tier || myTier || 'tier2',
      color: '#f472b6',
      photo: profile.avatar_url ? { uri: profile.avatar_url } : null,
      online: true,
      viewerCount: null,
      lastSeen: null,
      status: 'Online now — video call 💬',
      gender: profile.gender || 'female',
      lat: null,
      lng: null,
    };
  };

  const goLive = () => {
    if (!approved) {
      showToast('Not approved yet — you can go live once the panel approves you');
      return;
    }
    if (!isFemale) {
      showToast('Go Live is only for female hosts');
      return;
    }
    // Prefer the store host (keeps Home in sync), but never block
    // on it: an offline host is not in the live-hosts list, and
    // the list is still the demo fallback while the live fetch
    // has not landed. Fall back to the host object built from
    // this screen's own loaded hostRow + profile.
    const host = storeHost || buildLiveHost();
    if (!host) {
      showToast('Your host profile has not loaded yet — please try again in a moment');
      return;
    }
    // Surprise live check: going live while a check is pending
    // marks that check 'live' so the Mother Panel can review it.
    // Fire-and-forget — never block going live on the write.
    const pendingCheck = liveCheckRef.current;
    if (pendingCheck) {
      markLiveCheckLive(pendingCheck.id);
      setLiveCheck(null);
    }
    showToast("You're live — control your mic, camera and beauty settings from here");
    navigation.navigate('VideoCall', { host, asHost: true });
  };

  // Centre Live tab (autoGoLive): the tab press navigates here
  // with autoGoLive=true so the camera goes live straight away —
  // the dashboard itself is only the fallback surface (not
  // approved / no host row yet / not female). Fires once the
  // initial load finishes; the param is cleared first so it never
  // re-fires on remount or after returning from a call. A missing
  // host row means the user has never applied — stay on the
  // dashboard so the Apply card is what they see. The gates and
  // toasts are goLive()'s own, byte-for-byte.
  useEffect(() => {
    const wantAuto = route && route.params && route.params.autoGoLive;
    if (!wantAuto || loading) return;
    navigation.setParams({ autoGoLive: false });
    if (!hostRow) return;
    goLive();
  }, [loading, hostRow, route && route.params && route.params.autoGoLive, navigation]);

  const doWithdraw = async () => {
    if (!hostRow || withdrawing) return;
    const diamonds = Math.floor(Number(amount) || 0);
    if (diamonds <= 0) {
      showToast('Enter how many Diamonds to withdraw');
      return;
    }
    if (diamonds < MIN_WITHDRAW_DIAMONDS) {
      showToast(`You need to withdraw at least ${fmt(MIN_WITHDRAW_DIAMONDS)} Diamonds`);
      return;
    }
    if (diamonds > availableDiamonds) {
      showToast(`You have ${fmt(availableDiamonds)} Diamonds — you can't withdraw more than that`);
      return;
    }
    if (!account.trim()) {
      showToast('Enter the account number to receive the money');
      return;
    }
    setWithdrawing(true);
    const res = await requestWithdrawal(hostRow.id, { amountDiamonds: diamonds, method, account });
    setWithdrawing(false);
    if (!res.ok) {
      showToast('Withdraw was not submitted — please try again');
      return;
    }
    setAmount('');
    setAccount('');
    await refreshMoney();
    showToast(`Withdraw submitted — ${fmt(diamonds)} Diamonds, ${method} (Pending)`);
  };

  if (loading) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  // No session: prompt login, never fake data.
  if (!user) {
    return (
      <View style={[styles.bg, styles.center]}>
        <Text style={styles.loginTitle}>Sign in</Text>
        <Text style={styles.loginSub}>Please sign in to see the Host Dashboard.</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No host row yet: explicit Apply step. Nothing is created
  // until the user taps Apply.
  if (!hostRow) {
    return (
      <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Host Dashboard</Text>
          <View style={styles.headSpacer} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Become a Host</Text>
          <Text style={styles.applyText}>
            Earn coins from video calls. Tap Apply and the Mother Panel will review your application — you can
            go live once it is approved. Go Live is for female hosts only.
          </Text>
          <Text style={styles.verifyNote}>
            🎥 First, record a short verification video in the app: show your face and say your name and Livo
            ID (under 30 seconds). The Mother Panel checks the video before approving you — this proves you
            are the person in your profile photo.
          </Text>
          <TouchableOpacity
            style={[styles.goLiveBtn, applying && styles.goLiveDisabled]}
            onPress={applyToBecomeHost}
            disabled={applying}
          >
            <Text style={styles.goLiveText}>{applying ? 'Applying…' : '🎥  Record verification video & Apply'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const displayName = (profile && profile.username) || (user.email ? String(user.email).split('@')[0] : 'Host');
  const initial = String(displayName).charAt(0).toUpperCase() || 'H';

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      {/* header */}
      <View style={styles.head}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Host Dashboard</Text>
        <View style={styles.headSpacer} />
      </View>

      {/* surprise live check — the Mother Panel asked this host to
          go live before a deadline so it can verify them. The
          banner only shows while a check is pending; going live
          marks the check 'live'. */}
      {liveCheck ? (
        <View style={styles.liveCheckBanner}>
          <Text style={styles.liveCheckTitle}>⚠️ Verification check — go live now</Text>
          <Text style={styles.liveCheckSub}>
            The Mother Panel asked you to go live for a verification check. Time left: {fmtCountdown(liveCheckSecs)}
          </Text>
          <TouchableOpacity
            style={[styles.goLiveBtn, (!approved || !isFemale) && styles.goLiveDisabled]}
            onPress={goLive}
            disabled={!approved || !isFemale}
          >
            <Text style={styles.goLiveText}>🎥  Go live now</Text>
          </TouchableOpacity>
          {(!approved || !isFemale) ? (
            <Text style={styles.liveCheckNote}>Go Live is only for approved female hosts — finish your approval first.</Text>
          ) : null}
        </View>
      ) : liveCheckMissed ? (
        <View style={styles.liveCheckMissed}>
          <Text style={styles.liveCheckMissedText}>Verification check missed — contact the owner</Text>
        </View>
      ) : null}

      {/* host profile — the signed-in host, never a hardcoded host */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          {profile && profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoInitial]}>
              <Text style={styles.photoInitialText}>{initial}</Text>
            </View>
          )}
          <View style={styles.profileText}>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.hostId}>Host ID: {profile && profile.user_id ? profile.user_id : '—'}</Text>
            {approved ? (
              <View style={styles.approvedBadge}>
                <Text style={styles.approvedText}>✓ Approved</Text>
              </View>
            ) : (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>⏳ Approval Pending</Text>
              </View>
            )}
          </View>
        </View>
        {!approved && (
          <Text style={styles.pendingNote}>
            Your host account is not approved yet — you can go live once the Mother Panel approves it.
          </Text>
        )}

        {/* identity verification — video recorded live in the app,
            reviewed by the Mother Panel. The app only ever sets
            'pending'; 'verified' / 'rejected' come from the panel. */}
        <View style={styles.verifyBox}>
          {verificationStatus === 'verified' ? (
            <Text style={styles.verifyOk}>✅ Identity verified</Text>
          ) : verificationStatus === 'pending' ? (
            <Text style={styles.verifyPending}>
              ⏳ Verification video submitted — waiting for review
            </Text>
          ) : verificationStatus === 'rejected' ? (
            <>
              <Text style={styles.verifyBad}>❌ Verification rejected — record again</Text>
              <TouchableOpacity
                style={[styles.verifyBtn, verifying && styles.verifyBtnDisabled]}
                onPress={recordVerificationVideo}
                disabled={verifying}
              >
                <Text style={styles.verifyBtnText}>
                  {verifying ? 'Recording…' : '🎥  Record verification video again'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.verifyNone}>🪪 Identity not verified yet</Text>
              <TouchableOpacity
                style={[styles.verifyBtn, verifying && styles.verifyBtnDisabled]}
                onPress={recordVerificationVideo}
                disabled={verifying}
              >
                <Text style={styles.verifyBtnText}>
                  {verifying ? 'Recording…' : '🎥  Verify my identity'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* online / offline switch — persisted to the hosts table */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchTitle}>{online ? "You're Online" : "You're Offline"}</Text>
            <Text style={styles.switchSub}>
              {online
                ? 'Your live is showing on Home with the LIVE badge'
                : "You've gone off live — you're no longer showing on Home"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchTrack, online && styles.switchOn, !approved && styles.switchDisabled]}
            onPress={toggleOnline}
            accessibilityRole="switch"
            accessibilityState={{ checked: online }}
            accessibilityLabel="Go online or offline"
          >
            <View style={[styles.switchKnob, online ? styles.knobRight : styles.knobLeft]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* today's earnings — real calls + transactions rows */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's earnings</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>🪙 {fmt(earnings ? earnings.todayCoins : 0)}</Text>
            <Text style={styles.statLabel}>Coins earned today</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>💎 {fmt(earnings ? earnings.todayDiamonds : 0)}</Text>
            <Text style={styles.statLabel}>Diamonds earned</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(earnings ? earnings.todayCalls : 0)}</Text>
            <Text style={styles.statLabel}>Calls today</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmt(earnings ? earnings.todayMinutes : 0)}</Text>
            <Text style={styles.statLabel}>Total minutes (on calls)</Text>
          </View>
        </View>
        <Text style={styles.totalNote}>
          Total earnings: 🪙 {fmt(earnings ? earnings.totalCoins : 0)} coins · 💎{' '}
          {fmt(earnings ? earnings.totalDiamonds : 0)} Diamonds · {fmt(earnings ? earnings.totalCalls : 0)} calls
        </Text>
      </View>

      {/* my income — Diamonds live here now (not in the Wallet):
          earnings history + withdraw live on the My Income screen. */}
      <TouchableOpacity
        style={styles.incomeBtn}
        onPress={() => navigation.navigate('MyIncome')}
      >
        <Text style={styles.incomeBtnText}>💎  My Income</Text>
        <Text style={styles.incomeBtnSub}>
          {fmt(availableDiamonds)} Diamonds available · see your earnings and withdraw
        </Text>
      </TouchableOpacity>

      {/* call rate — persisted to the hosts table */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Call Rate — per minute</Text>
        <View style={styles.ratesRow}>
          {callRates.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.rateBtn, myTier === r.id && styles.rateBtnSel]}
              onPress={() => pickRate(r.id)}
            >
              <Text style={[styles.rateNum, myTier === r.id && styles.rateNumSel]}>
                {r.coinsPerMinute}
              </Text>
              <Text style={[styles.rateUnit, myTier === r.id && styles.rateNumSel]}>coins/min</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.rateNote}>
          Your current rate: <Text style={styles.bold}>{fmt(rate.coinsPerMinute)} coins/min</Text> — tap any rate to make it your new call rate.
        </Text>
      </View>

      {/* go live — female hosts only; hidden/disabled otherwise.
          Also hidden entirely when this user's gender view is
          'caller' (panel gender_views). */}
      {showGoLive ? (
        <>
          <TouchableOpacity
            style={[styles.goLiveBtn, (!approved || !isFemale) && styles.goLiveDisabled]}
            onPress={goLive}
            disabled={!approved || !isFemale}
          >
            <Text style={styles.goLiveText}>🎥  Go Live</Text>
          </TouchableOpacity>
          {approved && !isFemale ? (
            <Text style={styles.goLiveNote}>Go Live is only for female hosts — your profile gender is not set or is not female.</Text>
          ) : null}
        </>
      ) : null}

      {/* weekly earnings chart — real calls rows, last 7 days */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>This week’s earnings (coins)</Text>
        {earnings && earnings.week.length > 0 ? (
          <View style={styles.chart}>
            {earnings.week.map((d) => (
              <View key={d.key} style={styles.barCol}>
                <Text style={[styles.barVal, d.key === earnings.week[6].key && styles.barValToday]}>
                  {fmt(d.coins)}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: d.coins > 0 ? Math.max(4, Math.round((CHART_H * d.coins) / weekMax)) : 2 },
                      d.key === earnings.week[6].key && styles.barToday,
                    ]}
                  />
                </View>
                <Text style={[styles.barDay, d.key === earnings.week[6].key && styles.barDayToday]}>{d.day}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>No calls yet — your earnings will show here after your first call.</Text>
        )}
      </View>

      {/* withdraw — real Pending row in the withdrawals table */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Withdraw — cash out</Text>
        <Text style={styles.balanceNote}>
          Available to withdraw: 💎 <Text style={styles.bold}>{fmt(availableDiamonds)}</Text> Diamonds
        </Text>
        <Text style={styles.fieldLabel}>How many Diamonds to withdraw?</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="e.g. 1000"
          placeholderTextColor={COLORS.grey}
        />
        <Text style={styles.fieldLabel}>How do you want to receive it?</Text>
        <View style={styles.methodsRow}>
          {WITHDRAW_METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.methodBtn, method === m && styles.methodBtnSel]}
              onPress={() => setMethod(m)}
            >
              <Text style={[styles.methodText, method === m && styles.methodTextSel]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Account number</Text>
        <TextInput
          style={styles.input}
          value={account}
          onChangeText={setAccount}
          keyboardType="default"
          placeholder="bKash / Nagad / bank account number"
          placeholderTextColor={COLORS.grey}
        />
        <TouchableOpacity
          style={[styles.withdrawBtn, withdrawing && styles.withdrawDisabled]}
          onPress={doWithdraw}
          disabled={withdrawing}
        >
          <Text style={styles.withdrawText}>{withdrawing ? 'Submitting…' : '🪙  Submit withdraw'}</Text>
        </TouchableOpacity>
        <Text style={styles.withdrawNote}>
          After submitting, the status stays Pending — the admin will send the money and approve it. You need to withdraw at least {fmt(MIN_WITHDRAW_DIAMONDS)} Diamonds.
        </Text>
        {withdrawals.length > 0 && (
          <View style={styles.historyWrap}>
            <Text style={styles.historyTitle}>Previous withdrawals</Text>
            {withdrawals.map((w) => (
              <View key={w.id} style={styles.historyRow}>
                <Text style={styles.historyMain}>
                  💎 {fmt(w.amount_diamonds)} · {w.method}
                </Text>
                <Text style={[styles.historyStatus, String(w.status).toLowerCase() === 'pending' && styles.historyPending]}>
                  {w.status}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  approvedBadge: { alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 3 },
  approvedText: { color: '#15803d', fontSize: 12, fontWeight: 'bold' },
  applyText: { color: COLORS.dark, fontSize: 14, lineHeight: 21 },
  back: { color: COLORS.dark, fontSize: 32, fontWeight: 'bold', lineHeight: 34, width: 28 },
  balanceNote: { color: COLORS.dark, fontSize: 15, marginBottom: 12 },
  bar: { backgroundColor: '#c4b5fd', borderRadius: 4, width: '100%' },
  barCol: { alignItems: 'center', flex: 1 },
  barDay: { color: COLORS.grey, fontSize: 11, marginTop: 6 },
  barDayToday: { color: COLORS.pink, fontWeight: 'bold' },
  barToday: { backgroundColor: COLORS.pink },
  barTrack: { height: CHART_H, justifyContent: 'flex-end', width: '62%' },
  barVal: { color: COLORS.grey, fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  barValToday: { color: COLORS.pink },
  bg: { backgroundColor: '#faf5ff', flex: 1 },
  bold: { fontWeight: 'bold' },
  card: { backgroundColor: '#fff', borderRadius: 16, elevation: 1, marginTop: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  chart: { alignItems: 'flex-end', flexDirection: 'row' },
  emptyNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19 },
  fieldLabel: { color: COLORS.dark, fontSize: 13, fontWeight: 'bold', marginBottom: 6, marginTop: 10 },
  goLiveBtn: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 16, elevation: 2, marginTop: 16, paddingVertical: 16 },
  goLiveDisabled: { opacity: 0.5 },
  goLiveNote: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  goLiveText: { color: '#fff', fontSize: 19, fontWeight: 'bold' },
  liveCheckBanner: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderRadius: 16, borderWidth: 1, elevation: 1, marginTop: 12, padding: 16 },
  liveCheckMissed: { backgroundColor: '#fee2e2', borderColor: '#ef4444', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14 },
  liveCheckMissedText: { color: '#991b1b', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  liveCheckNote: { color: '#92400e', fontSize: 12, lineHeight: 17, marginTop: 8, textAlign: 'center' },
  liveCheckSub: { color: '#78350f', fontSize: 13, lineHeight: 19, marginTop: 6 },
  liveCheckTitle: { color: '#92400e', fontSize: 17, fontWeight: 'bold' },
  head: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  headSpacer: { width: 28 },
  historyMain: { fontSize: 14, fontWeight: 'bold' },
  historyPending: { color: '#b45309' },
  historyRow: { alignItems: 'center', borderTopColor: COLORS.lightGrey, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  historyStatus: { color: COLORS.grey, fontSize: 13, fontWeight: 'bold' },
  historyTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  historyWrap: { marginTop: 16 },
  hostId: { color: COLORS.grey, fontSize: 13, marginTop: 2 },
  incomeBtn: { backgroundColor: '#7c3aed', borderRadius: 16, elevation: 2, marginTop: 16, padding: 16 },
  incomeBtnSub: { color: '#ede9fe', fontSize: 13, lineHeight: 18, marginTop: 4 },
  incomeBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  input: { borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, color: COLORS.dark, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10 },
  knobLeft: { alignSelf: 'flex-start' },
  knobRight: { alignSelf: 'flex-end' },
  loadingText: { color: COLORS.grey, fontSize: 16 },
  loginBtn: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 16, marginTop: 20, paddingHorizontal: 32, paddingVertical: 14 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  loginSub: { color: COLORS.grey, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  loginTitle: { fontSize: 22, fontWeight: 'bold' },
  methodBtn: { alignItems: 'center', backgroundColor: '#f5f3ff', borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  methodBtnSel: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  methodText: { color: COLORS.dark, fontSize: 14, fontWeight: 'bold' },
  methodTextSel: { color: '#fff' },
  methodsRow: { flexDirection: 'row', marginHorizontal: -3 },
  name: { fontSize: 19, fontWeight: 'bold' },
  pendingBadge: { alignSelf: 'flex-start', backgroundColor: '#fef3c7', borderRadius: 12, marginTop: 6, paddingHorizontal: 10, paddingVertical: 3 },
  pendingNote: { color: '#92400e', fontSize: 13, lineHeight: 19, marginTop: 12 },
  pendingText: { color: '#92400e', fontSize: 12, fontWeight: 'bold' },
  photo: { borderRadius: 32, height: 64, width: 64 },
  photoInitial: { alignItems: 'center', backgroundColor: '#f472b6', justifyContent: 'center' },
  photoInitialText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  profileRow: { alignItems: 'center', flexDirection: 'row' },
  profileText: { flex: 1, marginLeft: 14 },
  rateBtn: { alignItems: 'center', backgroundColor: '#f5f3ff', borderColor: COLORS.lightGrey, borderRadius: 12, borderWidth: 1, flex: 1, marginHorizontal: 3, paddingVertical: 10 },
  rateBtnSel: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  rateNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19, marginTop: 10 },
  rateNum: { color: COLORS.dark, fontSize: 16, fontWeight: 'bold' },
  rateNumSel: { color: '#fff' },
  rateUnit: { color: COLORS.grey, fontSize: 10, marginTop: 2 },
  ratesRow: { flexDirection: 'row', marginHorizontal: -3 },
  stat: { marginBottom: 12, width: '50%' },
  statLabel: { color: COLORS.grey, fontSize: 12, marginTop: 2 },
  statValue: { fontSize: 19, fontWeight: 'bold' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  switchDisabled: { opacity: 0.5 },
  switchKnob: { backgroundColor: '#fff', borderRadius: 13, elevation: 2, height: 26, width: 26 },
  switchOn: { backgroundColor: COLORS.green },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchSub: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 4 },
  switchText: { flex: 1, paddingRight: 12 },
  switchTitle: { fontSize: 16, fontWeight: 'bold' },
  switchTrack: { backgroundColor: '#d1d5db', borderRadius: 17, height: 34, justifyContent: 'center', paddingHorizontal: 4, width: 60 },
  title: { fontSize: 21, fontWeight: 'bold' },
  totalNote: { color: COLORS.grey, fontSize: 13, lineHeight: 19, marginTop: 4 },
  verifyBad: { color: '#b91c1c', fontSize: 13, fontWeight: 'bold', lineHeight: 19 },
  verifyBox: { backgroundColor: '#f5f3ff', borderRadius: 12, marginTop: 12, padding: 12 },
  verifyBtn: { alignItems: 'center', backgroundColor: COLORS.purple, borderRadius: 12, marginTop: 10, paddingVertical: 12 },
  verifyBtnDisabled: { opacity: 0.6 },
  verifyBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  verifyNone: { color: COLORS.dark, fontSize: 13, lineHeight: 19 },
  verifyNote: { color: COLORS.dark, fontSize: 13, lineHeight: 19, marginTop: 10 },
  verifyOk: { color: '#15803d', fontSize: 14, fontWeight: 'bold' },
  verifyPending: { color: '#92400e', fontSize: 13, lineHeight: 19 },
  withdrawBtn: { alignItems: 'center', backgroundColor: '#f59e0b', borderRadius: 16, elevation: 2, marginTop: 16, paddingVertical: 15 },
  withdrawDisabled: { opacity: 0.6 },
  withdrawNote: { color: COLORS.grey, fontSize: 12, lineHeight: 17, marginTop: 10, textAlign: 'center' },
  withdrawText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  wrap: { padding: 16, paddingBottom: 32, paddingTop: 48 },
});
