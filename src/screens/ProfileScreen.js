// Livo — Profile (Me) screen, rebuilt from the web preview (livo-home-preview).
// Me top shows the REAL signed-in user now (name / ID / country /
// language from the Supabase profiles row + Google account). There
// is NO demo fallback: fields the account has not set show "—" /
// "Not set" — never the old demo profile (Mr.lee, ID 9065858).
// Sub-views: My chat Price, My Profile detail, Badge, Gift received,
// Edit Profile (real, writes via store.updateMyProfile), Second
// Language (persisted), My Level and VIP Member Centre.
//
// Balances: the Wallet card shows the LIVE store Diamonds balance
// (shared with WalletScreen via useApp). There are no Beans in the
// app — the old Exchange / Withdraw (Beans) UI is deleted, and no
// Diamonds are ever spent from this screen.
// Check-in lives ONLY in RewardsScreen (header button navigates
// there); Tasks live ONLY in TasksScreen. There is no invite /
// referral system, and no unread-message count source, so neither
// is shown.
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { THEME } from '../config';
import { useApp } from '../store';
import { AuthContext } from '../../App';
import { supabase } from '../supabase/client';
import { ensureProfile, equipFrame, fetchMyProfile, getSessionUser, signOut } from '../supabase/auth';
import { fetchUserTags } from '../supabase/tags';
import { DEVICE_ID_KEY } from '../supabase/device';
import { stopHostHeartbeat } from '../supabase/host';
import LevelView from './profile/LevelView';
import VipView from './profile/VipView';
import VipFrame from '../components/VipFrame'; // [Vero] animated VIP avatar frame
import {
  BADGES_ACH, BADGES_ACTIVITY, HIGHEST_CALL_PRICE,
  LANGUAGES, PRICE_OPTS, PROFILE_MEDALS,
} from './profile/levelData';

function themeFor(dark) {
  return dark
    ? { bg: '#111827', surface: '#1f2937', surface2: '#374151', text: '#f9fafb', muted: '#9ca3af', border: '#374151', cardBg: '#1f2937' }
    // [New UI 2026-11-25] Default theme is now the preview's dark
    // purple + gold (bg deep purple, panels #1e0a3d / #2a1152,
    // lavender text, gold accents). The dark toggle still switches
    // to the old grey-dark theme above.
    : { bg: '#150329', surface: '#1e0a3d', surface2: '#2a1152', text: '#f6f1ff', muted: '#b9a8d9', border: 'rgba(255,255,255,0.09)', cardBg: '#1e0a3d' };
}

// store vipLevel is a pack id such as 'vip1' — display it as 'VIP 1'.
function vipLabel(v) {
  if (!v) return null;
  const m = String(v).match(/^vip\s?(\d+)$/i);
  return m ? `VIP ${m[1]}` : String(v);
}

export default function ProfileScreen({ navigation }) {
  const { coins, diamonds, showToast, vipLevel, vipUntil, following, levelInfo, updateMyProfile, frames } = useApp();

  // ── Real signed-in user ──
  // user = Supabase auth user (Google account); profile = the user's
  // row in the profiles table (created on first sign-in, see auth.js).
  const [user, setUser] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  // Diagnostic (2026-11-23): last profile-fetch error message, shown
  // on the Me screen only while the profile row is missing.
  const [fetchErr, setFetchErr] = React.useState(null);
  // Storage self-test (2026-11-23): the phone's AsyncStorage read
  // returned no session right after sign-in. Write a timestamp and
  // read it back — if it does not match, local storage is broken.
  const [storageTest, setStorageTest] = React.useState('pending');
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stamp = String(Date.now());
        await AsyncStorage.setItem('livo-storage-test', stamp);
        const back = await AsyncStorage.getItem('livo-storage-test');
        if (mounted) setStorageTest(back === stamp ? 'ok' : 'fail');
      } catch (e) {
        if (mounted) setStorageTest('fail');
      }
    })();
    return () => { mounted = false; };
  }, []);
  // Identity PRIMARY source: the gate's live session via AuthContext
  // (in-memory — never a storage read). The old getSession()/listener
  // fallback runs only when the context has no user (e.g. after a
  // sign-out, when the context clears).
  const authCtx = React.useContext(AuthContext);
  const contextUser = authCtx && authCtx.user ? authCtx.user : null;
  React.useEffect(() => {
    if (contextUser) {
      setUser(contextUser);
      return undefined;
    }
    let mounted = true;
    if (supabase) {
      // Fallback only: identity from the LOCAL session (getSession
      // reads storage — no network). The network getUser() call
      // failed on the user's phone right after login and left this
      // screen showing "Not set".
      supabase.auth.getSession().then(({ data }) => {
        if (mounted) setUser(data && data.session ? data.session.user : null);
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (mounted) setUser(session && session.user ? session.user : null);
      });
      return () => {
        mounted = false;
        listener.subscription.unsubscribe();
      };
    }
    return undefined;
  }, [contextUser]);
  // Self-heal (2026-11-23): the signed-in user's profiles row was
  // missing on the server, so Me showed "Not set" even with a valid
  // session. Call ensureProfile FIRST (find-or-create, timeout-
  // guarded); only if it returns nothing, retry once with a
  // timeout-guarded fetchMyProfile. Never leave the screen empty.
  React.useEffect(() => {
    if (!user) return undefined;
    let mounted = true;
    (async () => {
      try {
        const { profile: ensured, error: ensureErr } = await ensureProfile(user);
        if (!mounted) return;
        if (ensured) { setProfile(ensured); return; }
        if (ensureErr) setFetchErr(ensureErr.message || String(ensureErr));
      } catch (e) {
        if (mounted) setFetchErr(e && e.message ? e.message : String(e));
      }
      try {
        const { profile: retry, error: retryErr } = await fetchMyProfile(user.id);
        if (!mounted) return;
        if (retryErr) setFetchErr(retryErr.message || String(retryErr));
        if (retry) setProfile(retry);
      } catch (e) {
        if (mounted) setFetchErr(e && e.message ? e.message : String(e));
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  // Admin-set tags (user_tags, active only) — small chips under
  // the name. No rows → no chips, never demo tags.
  const [userTags, setUserTags] = React.useState([]);
  React.useEffect(() => {
    if (!profile || !profile.id) return undefined;
    let mounted = true;
    fetchUserTags(profile.id).then((rows) => {
      if (mounted) setUserTags(rows);
    });
    return () => { mounted = false; };
  }, [profile && profile.id]);

  // Equipped avatar frame: name from the live frames catalog
  // (falls back to the raw frame id when the catalog has not
  // loaded it) + its expiry. frame_expires_at NULL = no expiry.
  const frameInfo = React.useMemo(() => {
    if (!profile || !profile.frame_id) return null;
    const found = (frames || []).find((f) => f.id === profile.frame_id);
    const expires = profile.frame_expires_at ? new Date(profile.frame_expires_at) : null;
    return {
      id: profile.frame_id,
      name: (found && found.name) || profile.frame_id,
      expiryText: expires
        ? `Expires ${expires.toLocaleDateString()}`
        : 'No expiry',
    };
  }, [profile && profile.frame_id, profile && profile.frame_expires_at, frames]);

  const equipFrameById = async (frameId) => {
    const u = await ensureUser();
    if (!u) { showToast('Please sign in first.'); return; }
    const updated = await equipFrame(frameId);
    if (!updated) { showToast("Couldn't equip the frame — try again."); return; }
    setProfile((p) => ({ ...(p || {}), ...updated }));
    showToast(`Frame equipped: ${updated.frame_id}`);
  };
  const PROFILE = React.useMemo(() => {
    const meta = (user && user.user_metadata) || {};
    const displayName =
      (profile && profile.username)
      || meta.full_name
      || meta.name
      || (user && user.email ? user.email.split('@')[0] : null);
    const displayId = (profile && profile.user_id) || (user && user.id) || null;
    return {
      name: displayName,
      id: displayId,
      country: (profile && profile.country) || null,
      language: (profile && profile.language) || null,
      age: profile && profile.age ? profile.age : null,
      gender: profile && profile.gender ? profile.gender : null,
      signature: (profile && profile.bio) || null,
    };
  }, [user, profile]);

  // Google profile photo when Google gave one, else the saved
  // avatar_url, else no photo (initial-letter placeholder).
  const googleAvatar = user && user.user_metadata ? user.user_metadata.avatar_url : null;
  const profileAvatar = profile ? profile.avatar_url : null;
  const avatarUri = googleAvatar || profileAvatar || null;

  const [view, setView] = React.useState('main');
  const [dark, setDark] = React.useState(false);
  // Gender gates Go Live, so it is real profile state, persisted
  // through store.updateMyProfile — never a local-only toggle.
  const [gender, setGender] = React.useState(null);
  React.useEffect(() => { setGender(profile && profile.gender ? profile.gender : null); }, [profile]);
  const [secondLang, setSecondLang] = React.useState(null);
  React.useEffect(() => { setSecondLang(profile && profile.second_language ? profile.second_language : null); }, [profile]);
  const [chatPrice, setChatPrice] = React.useState(null);
  const [priceEditing, setPriceEditing] = React.useState(false);
  const [badgeDetail, setBadgeDetail] = React.useState(null);
  // Edit-profile draft (filled when the edit view is opened).
  const [draft, setDraft] = React.useState({ nickname: '', bio: '', age: '', country: '', language: '', tags: '' });
  const [saving, setSaving] = React.useState(false);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  // Delete-account two-step confirm (Settings section).
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const t = themeFor(dark);

  const myLevelLabel = levelInfo && typeof levelInfo.level === 'number' ? `Lv${levelInfo.level}` : '—';
  const vipDaysLeft = vipUntil ? Math.max(0, Math.ceil((new Date(vipUntil).getTime() - Date.now()) / 86400000)) : 0;

  const copyId = async () => {
    if (!PROFILE.id) { showToast('No ID yet — sign in first'); return; }
    try { await Clipboard.setStringAsync(String(PROFILE.id)); } catch (e) { /* clipboard unavailable */ }
    showToast(`ID copied: ${PROFILE.id}`);
  };

  const toggleDark = () => {
    setDark((d) => !d);
    showToast(!dark ? 'Dark mode on' : 'Dark mode off');
  };

  const goWallet = () => navigation.navigate('WalletTab');

  // Real sign-out: clears the Supabase session; the App.js auth gate
  // then shows LoginScreen.
  const doLogout = async () => {
    try {
      // Stop the host heartbeat and mark offline, so the host does
      // not stay listed as online after signing out.
      await stopHostHeartbeat(true);
    } catch (e) {
      // Heartbeat stop must never block sign-out.
    }
    await signOut();
  };

  const parentOf = { badge: 'profile', gift: 'profile', edit: 'profile', lang: 'edit', chatprice: 'main' };
  const goBack = () => setView(parentOf[view] || 'main');

  const openBadge = (badge) => { setBadgeDetail(badge); setView('badge'); };

  // ── Real profile writes (via the store) ──
  // Save actions re-read the session when the local user state is
  // null (e.g. this screen mounted before the session arrived)
  // instead of refusing with "Please sign in first." at once.
  const ensureUser = async () => {
    if (user) return user;
    const u = await getSessionUser();
    if (u) setUser(u);
    return u;
  };
  // updateMyProfile returns false / { error } when the write failed;
  // on success the local profile state is merged so the screen
  // reflects the saved values at once.
  const savePatch = async (patch) => {
    // Guard only: the store is expected to provide updateMyProfile
    // (it is missing from store.js as read — reported to the
    // coordinator). A missing function must toast, never throw.
    if (typeof updateMyProfile !== 'function') {
      showToast("Couldn't save — profile saving is not set up yet.");
      return false;
    }
    const res = await updateMyProfile(patch);
    if (res === false || (res && res.error)) return false;
    setProfile((p) => ({ ...(p || {}), ...patch }));
    return true;
  };

  const persistGender = async (g) => {
    const u = await ensureUser();
    if (!u) { showToast('Please sign in first.'); return; }
    const ok = await savePatch({ gender: g });
    if (!ok) { showToast("Couldn't save gender — try again."); return; }
    setGender(g);
    showToast(`Gender set to ${g === 'female' ? 'Female' : 'Male'}`);
  };

  const pickSecondLang = async (en) => {
    const u = await ensureUser();
    if (!u) { showToast('Please sign in first.'); return; }
    const ok = await savePatch({ second_language: en });
    if (!ok) { showToast("Couldn't save — try again."); return; }
    setSecondLang(en);
    showToast(`Second Language: ${en}`);
    setView('edit');
  };

  const openEdit = () => {
    setDraft({
      nickname: (profile && profile.username) || PROFILE.name || '',
      bio: (profile && profile.bio) || '',
      age: profile && profile.age ? String(profile.age) : '',
      country: (profile && profile.country) || '',
      language: (profile && profile.language) || '',
      tags: (profile && profile.tags) || '',
    });
    setView('edit');
  };

  const saveProfile = async () => {
    const u = await ensureUser();
    if (!u) { showToast('Please sign in first.'); return; }
    const ageTrimmed = draft.age.trim();
    const ageNum = ageTrimmed ? parseInt(ageTrimmed, 10) : null;
    if (ageTrimmed && (Number.isNaN(ageNum) || ageNum < 13 || ageNum > 120)) {
      showToast('Age must be between 13 and 120');
      return;
    }
    const patch = {
      bio: draft.bio.trim(),
      country: draft.country.trim() || null,
      language: draft.language.trim() || null,
      tags: draft.tags.trim(),
    };
    if (draft.nickname.trim()) patch.username = draft.nickname.trim();
    if (ageNum !== null) patch.age = ageNum;
    setSaving(true);
    try {
      const ok = await savePatch(patch);
      if (!ok) { showToast("Couldn't save — try again."); return; }
      showToast('Profile saved');
      setView('profile');
    } catch (e) {
      showToast("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  // Avatar: pick a photo, upload it to the public 'avatars' storage
  // bucket, and save the public URL as avatar_url on the profile.
  const pickAvatar = async () => {
    const u = await ensureUser();
    if (!u) { showToast('Please sign in first.'); return; }
    if (avatarBusy) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets || !res.assets[0] || !res.assets[0].uri) return;
      setAvatarBusy(true);
      const uri = res.assets[0].uri;
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const path = `${u.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (upErr) { showToast('Could not upload photo — try again.'); return; }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub && pub.publicUrl;
      if (!url) { showToast('Could not upload photo — try again.'); return; }
      const ok = await savePatch({ avatar_url: url });
      if (!ok) { showToast('Photo uploaded but could not be saved — try again.'); return; }
      showToast('Profile photo updated');
    } catch (e) {
      showToast('Could not change photo — try again.');
    } finally {
      setAvatarBusy(false);
    }
  };

  // Clear Cache really clears the app's AsyncStorage caches (every
  // livo-* key: wallet cache, rewards display cache) and reports
  // what was removed. Server data (balances, VIP, tasks) is untouched.
  // The device id ('livo-device-id') is NOT cleared: it identifies
  // this install for the Mother Panel's device list, and wiping it
  // would register a brand-new device on the next sign-in.
  const clearCache = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const livoKeys = keys.filter((k) => k.indexOf('livo-') === 0 && k !== DEVICE_ID_KEY);
      if (livoKeys.length > 0) await AsyncStorage.multiRemove(livoKeys);
      showToast(livoKeys.length > 0
        ? `Cache cleared — ${livoKeys.length} item${livoKeys.length > 1 ? 's' : ''} removed`
        : 'Cache is already empty');
    } catch (e) {
      showToast('Could not clear cache — try again.');
    }
  };

  // Delete account (two-step confirm in Settings): stamps
  // profiles.deleted_at (kept 3 months, restorable from the admin
  // panel) and closes any live room — the host row is marked
  // offline, and its approval status is set to 'closed' on a
  // best-effort basis (the hosts.status values the app knows are
  // 'pending' / 'approved', so a panel check constraint may reject
  // 'closed' — the offline flag is what closes the room, and it
  // always runs first). Then signs out. A failed profile update
  // aborts before sign-out so nothing is half-deleted.
  const doDeleteAccount = async () => {
    const u = await ensureUser();
    if (!u) { showToast('Please sign in first.'); return; }
    if (deleting) return;
    setDeleting(true);
    try {
      const { error: delErr } = await supabase
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', u.id);
      if (delErr) {
        showToast("Couldn't delete the account — try again.");
        return;
      }
      try {
        const { data: hostRow } = await supabase
          .from('hosts')
          .select('id')
          .eq('profile_id', u.id)
          .maybeSingle();
        if (hostRow && hostRow.id) {
          await supabase
            .from('hosts')
            .update({ is_online: false, last_seen: new Date().toISOString() })
            .eq('id', hostRow.id);
          // Best-effort only: 'closed' is not a status the app has
          // ever written, so the panel may reject it.
          await supabase
            .from('hosts')
            .update({ status: 'closed' })
            .eq('id', hostRow.id);
        }
      } catch (e) { /* host cleanup must not block the delete */ }
      try {
        await stopHostHeartbeat(true);
      } catch (e) { /* never blocks sign-out */ }
      await signOut();
    } catch (e) {
      showToast("Couldn't delete the account — try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const subHead = (title, backTo) => (
    <View style={[styles.headRow, { backgroundColor: t.surface }]}>
      <TouchableOpacity onPress={() => setView(backTo || 'main')} style={styles.backBtn}>
        <Text style={[styles.backTxt, { color: t.text }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[styles.headTitle, { color: t.text }]}>{title}</Text>
    </View>
  );

  const menuRow = (icon, iconBg, label, right, onPress) => (
    <TouchableOpacity key={label} style={[styles.menuRow, { backgroundColor: t.surface, borderColor: t.border }]} onPress={onPress}>
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}><Text style={styles.menuEmoji}>{icon}</Text></View>
      <Text style={[styles.menuLabel, { color: t.text }]}>{label}</Text>
      {right}
      <Text style={styles.menuChev}>›</Text>
    </TouchableOpacity>
  );

  // Avatar image, or an initial-letter placeholder when no photo
  // is set (never another person's photo as a fallback).
  const avatarView = (size, radius) => (avatarUri
    ? <Image source={{ uri: avatarUri }} style={{ width: size, height: size, borderRadius: radius }} />
    : (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: radius }]}>
        <Text style={styles.avatarFallbackTxt}>{(PROFILE.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
    ));

  const genderChip = PROFILE.gender || PROFILE.age
    ? `${PROFILE.gender === 'female' ? '♀' : '♂'}${PROFILE.age ? ` ${PROFILE.age}` : ''}`
    : null;

  // ── My Level / VIP (separate components, own ScrollViews) ──
  if (view === 'level') {
    return (
      <LevelView
        gender={gender}
        onGenderChange={persistGender}
        onBack={() => setView('main')}
        onTopUp={goWallet}
        showToast={showToast}
      />
    );
  }
  if (view === 'vip') {
    return (
      <VipView
        showToast={showToast}
        onBack={() => setView('main')}
        onTopUp={goWallet}
        onBuyPremium={() => navigation.navigate('VIP')}
      />
    );
  }

  return (
    <ScrollView style={[styles.bg, { backgroundColor: t.bg }]} contentContainerStyle={styles.wrap}>
      <StatusBar style="light" />
      {/* ── Me main ── */}
      {view === 'main' && (
        <View style={styles.mainPad}>
          <View style={[styles.headerCard, { backgroundColor: t.surface }]}>
            <View style={styles.idHead}>
              <TouchableOpacity onPress={() => setView('profile')} activeOpacity={0.8} accessibilityLabel="Tap the photo to open the My Profile page">
                {vipLevel ? (
                  <VipFrame frame="gold" size={78}>
                    {avatarView(64, 32)}
                  </VipFrame>
                ) : (
                  avatarView(64, 32)
                )}
              </TouchableOpacity>
              <View style={styles.idMain}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: t.text }]}>{PROFILE.name || 'Not set'}</Text>
                  {vipLevel ? (
                    <TouchableOpacity style={styles.vipBadge} onPress={() => setView('vip')}>
                      <Text style={styles.vipBadgeTxt}>👑 {vipLabel(vipLevel)}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.idRow}>
                  <Text style={[styles.idTxt, { color: t.muted }]}>ID:&nbsp;{PROFILE.id || '—'}</Text>
                  <TouchableOpacity onPress={copyId} accessibilityLabel="Copy ID">
                    <Text style={styles.copyIcon}>📋</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chips}>
                  {PROFILE.country ? <Text style={styles.flagChipTxt}>{PROFILE.country}</Text> : null}
                  {genderChip ? <Text style={styles.chipMale}>{genderChip}</Text> : null}
                  {PROFILE.language ? <Text style={styles.chipLang}>{PROFILE.language}</Text> : null}
                  {!PROFILE.country && !genderChip && !PROFILE.language ? (
                    <Text style={[styles.idTxt, { color: t.muted }]}>Not set</Text>
                  ) : null}
                </View>
                {userTags.length > 0 ? (
                  <View style={styles.tagChips}>
                    {userTags.map((tg) => (
                      <Text key={tg.id || tg.tag} style={styles.tagChip}>{tg.tag}</Text>
                    ))}
                  </View>
                ) : null}
                {frameInfo ? (
                  <Text style={[styles.frameLine, { color: t.muted }]}>
                    Frame: {frameInfo.name} · {frameInfo.expiryText}
                  </Text>
                ) : null}
              </View>
              <View style={styles.topBtns}>
                {/* Single check-in path: RewardsScreen. */}
                <TouchableOpacity onPress={() => navigation.navigate('Rewards')} style={styles.checkinBtn} accessibilityLabel="Daily check-in">
                  <Text style={styles.checkinEmoji}>📅</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleDark} style={styles.moonBtn} accessibilityLabel="Turn dark mode on or off">
                  <Text style={styles.moonEmoji}>{dark ? '☀️' : '🌙'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: t.text }]}>—</Text>
                <Text style={[styles.statLbl, { color: t.muted }]}>Friend</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: t.text }]}>{following.length}</Text>
                <Text style={[styles.statLbl, { color: t.muted }]}>Follow</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statNum, { color: t.text }]}>—</Text>
                <Text style={[styles.statLbl, { color: t.muted }]}>Fans</Text>
              </View>
            </View>
          </View>

          {!profile && (
            <Text style={{ fontSize: 11, color: t.muted, marginTop: 6, marginBottom: 2 }}>
              {`Session: ${user ? 'yes' : 'no'} | User: ${user && user.id ? String(user.id).slice(0, 8) : 'none'} | Profile: missing | Error: ${fetchErr || 'none'} | Storage: ${storageTest}`}
            </Text>
          )}

          <TouchableOpacity style={styles.goldBanner} onPress={goWallet} activeOpacity={0.85}>
            <Text style={styles.goldBannerIcon}>🪙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.goldBannerTitle}>My Wallet</Text>
              <Text style={styles.goldBannerValue}>🪙 {Number(coins || 0).toLocaleString()} Coins · 💎 {diamonds.toLocaleString()} Diamonds</Text>
            </View>
            <Text style={styles.goldBannerChev}>›</Text>
          </TouchableOpacity>

          <View style={styles.darkRow}>
            <TouchableOpacity style={styles.darkCard} onPress={() => setView('level')} activeOpacity={0.85}>
              <Text style={styles.darkCardTitle}>My Level</Text>
              <Text style={styles.darkCardValue}>{myLevelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.darkCard} onPress={() => setView('vip')} activeOpacity={0.85}>
              <Text style={styles.darkCardTitle}>VIP</Text>
              <Text style={styles.darkCardValue}>{vipLevel ? `${vipLabel(vipLevel)}${vipDaysLeft > 0 ? ` · ${vipDaysLeft}d left` : ''}` : 'Member Centre'}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.menuCard, { backgroundColor: t.surface }]}>
            {menuRow('💬', '#fde7f1', 'Messages', null, () => navigation.navigate('MessagesTab'))}
            {menuRow('🎥', '#fde7f1', 'Host Dashboard', <Text style={styles.tagGreen}>Approved</Text>, () => navigation.navigate('HostDashboard'))}
            {menuRow('✅', '#e2f5ec', 'My Tasks', <Text style={styles.tagPink}>New Reward</Text>, () => navigation.navigate('Tasks'))}
            {menuRow('🎡', '#fef3c7', 'Lucky Spin', <Text style={styles.tagPink}>Free spin</Text>, () => navigation.navigate('Rewards'))}
            {menuRow('💬', '#e0f5fa', 'Chat Price', <Text style={styles.chatPriceVal}>{chatPrice ? `${chatPrice.toLocaleString()}/min` : 'Not set'}</Text>, () => setView('chatprice'))}
            {menuRow('👤', '#e0f5fa', 'My Profile', null, () => setView('profile'))}
            {menuRow('⚙️', '#eef0f4', 'Settings', null, () => setView('settings'))}
          </View>
        </View>
      )}

      {/* ── My chat Price ── */}
      {view === 'chatprice' && (
        <View>
          {subHead('My chat Price', 'main')}
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>Video Call Price</Text>
            <View style={styles.priceBigRow}>
              <Text style={[styles.priceBig, { color: t.text }]}>{chatPrice ? chatPrice.toLocaleString() : '—'}<Text style={styles.pricePer}>/ min</Text></Text>
              <TouchableOpacity style={styles.editBtn} onPress={() => setPriceEditing((e) => !e)}>
                <Text style={styles.editBtnTxt}>{priceEditing ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>
            </View>
            {priceEditing && (
              <View>
                <View style={styles.priceOpts}>
                  {PRICE_OPTS.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.priceOpt, chatPrice === v && styles.priceOptSel]}
                      onPress={() => { setChatPrice(v); showToast(`Video Call Price set: ${v.toLocaleString()}/min`); }}
                    >
                      <Text style={[styles.priceOptTxt, chatPrice === v && styles.priceOptTxtSel]}>{v.toLocaleString()}/min</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.hint, { color: t.muted }]}>You can set up to 3,000/min based on your level. This price is not saved to your profile yet — a host’s real call rate is set from the panel.</Text>
              </View>
            )}
          </View>
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>Highest Call Price</Text>
            <View style={styles.tableHead}>
              <Text style={styles.th}>Level</Text>
              <Text style={styles.th}>Max price / min</Text>
            </View>
            {HIGHEST_CALL_PRICE.map((r) => (
              <View key={r.level} style={[styles.tableRow, { borderColor: t.border }]}>
                <Text style={[styles.td, { color: t.text }]}>{r.level}</Text>
                <Text style={[styles.td, { color: t.text }]}>{r.price}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── My Profile detail ── */}
      {view === 'profile' && (
        <View>
          <View style={styles.heroWrap}>
            {avatarUri
              ? <Image source={{ uri: avatarUri }} style={styles.heroImg} />
              : <View style={[styles.heroImg, styles.heroFallback]} />}
            <TouchableOpacity onPress={() => setView('main')} style={styles.heroBack}>
              <Text style={styles.heroBackTxt}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openEdit} style={styles.heroEdit}>
              <Text style={styles.heroEditTxt}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.pfMain, { backgroundColor: t.surface }]}>
            <View style={styles.pfIdRow}>
              {avatarView(72, 36)}
              <View style={{ flex: 1 }}>
                <View style={styles.pfNameRow}>
                  <Text style={[styles.pfName, { color: t.text }]}>{PROFILE.name || 'Not set'}</Text>
                  <Text style={styles.onlineBadge}>● Online</Text>
                  {vipLevel ? <Text style={styles.vipBadge2}>👑 {vipLabel(vipLevel)}</Text> : null}
                </View>
                <Text style={[styles.pfStats, { color: t.muted }]}>Follow <Text style={{ fontWeight: 'bold', color: t.text }}>{following.length}</Text>   Fans <Text style={{ fontWeight: 'bold', color: t.text }}>—</Text></Text>
              </View>
            </View>
            <Text style={[styles.pfSig, { color: t.muted }]}>{PROFILE.signature || 'Not set'}</Text>
            {userTags.length > 0 ? (
              <View style={styles.tagChips}>
                {userTags.map((tg) => (
                  <Text key={tg.id || tg.tag} style={styles.tagChip}>{tg.tag}</Text>
                ))}
              </View>
            ) : null}
            {frameInfo ? (
              <Text style={[styles.frameLine, { color: t.muted }]}>
                Frame: {frameInfo.name} · {frameInfo.expiryText}
              </Text>
            ) : null}
            <View style={styles.chips}>
              {genderChip ? <Text style={styles.chipMale}>{genderChip}</Text> : null}
              <Text style={styles.flagChipTxt}>{PROFILE.country || 'Not set'}</Text>
            </View>
            <Text style={styles.infoTab}>Information</Text>
            <Text style={[styles.albumEmpty, { color: t.muted }]}>There are no photos in the album yet~</Text>

            {/* Avatar frame — equipped frame + expiry, and the live
                frames catalog to equip from. Equipping writes
                profiles.frame_id + frame_expires_at (VIP period,
                else 30 days). No frames in the panel → nothing here. */}
            {frames && frames.length > 0 ? (
              <View style={[styles.pfCard, { backgroundColor: t.surface2 }]}>
                <View style={styles.frameHead}>
                  <Text style={[styles.frameHeadTitle, { color: t.text }]}>Frame</Text>
                  <Text style={[styles.frameHeadSub, { color: t.muted }]}>
                    {frameInfo ? `${frameInfo.name} · ${frameInfo.expiryText}` : 'No frame equipped'}
                  </Text>
                </View>
                <View style={styles.frameList}>
                  {frames.map((f) => {
                    const equipped = profile && profile.frame_id === f.id;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.frameItem, equipped && styles.frameItemOn]}
                        onPress={() => { if (!equipped) equipFrameById(f.id); }}
                      >
                        <Text style={[styles.frameItemTxt, { color: t.text }]}>{f.name}</Text>
                        <Text style={[styles.frameItemSub, { color: t.muted }]}>
                          {equipped ? 'Equipped' : 'Tap to equip'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={[styles.pfCard, { backgroundColor: t.surface2 }]}>
              <TouchableOpacity style={styles.pfBannerGold} onPress={() => setView('badge')}>
                <Text style={styles.pfBannerTitle}>Badge</Text>
                <Text style={styles.pfBannerIcon}>🏆</Text>
                <Text style={styles.pfBannerChev}>›</Text>
              </TouchableOpacity>
              <View style={styles.medalRow}>
                {PROFILE_MEDALS.map((m) => (
                  <TouchableOpacity key={m} style={styles.medal} onPress={() => openBadge([...BADGES_ACTIVITY, ...BADGES_ACH].find((b) => b.n === m))}>
                    <Text style={styles.medalIcon}>🏅</Text>
                    <Text style={[styles.medalName, { color: t.text }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.pfCard, { backgroundColor: t.surface2 }]}>
              <TouchableOpacity style={styles.pfBannerPink} onPress={() => setView('gift')}>
                <Text style={styles.pfBannerTitle}>Gift received</Text>
                <Text style={styles.pfBannerIcon}>🎁</Text>
                <Text style={styles.pfBannerChev}>›</Text>
              </TouchableOpacity>
              <View style={styles.giftEmpty}>
                <Text style={styles.giftEmptyIcon}>🎁</Text>
                <Text style={[styles.giftEmptyTxt, { color: t.muted }]}>Haven't received a gift yet</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── Badge detail ── */}
      {view === 'badge' && (
        <View>
          {subHead('Badge', 'profile')}
          <View style={[styles.cardBox, { backgroundColor: t.surface }]}>
            <Text style={[styles.cardBoxTitle, { color: t.text }]}>{badgeDetail ? `${badgeDetail.n}${badgeDetail.got ? ' · Earned' : ` · ${badgeDetail.p}`}` : 'Choose a badge'}</Text>
            <Text style={[styles.hint, { color: t.muted }]}>
              {badgeDetail ? badgeDetail.d : 'Tap any badge below to see how to earn it.'}
            </Text>
          </View>
          <Text style={[styles.sec, { color: t.text }]}>Activity Medal</Text>
          <View style={styles.badgeGrid}>
            {BADGES_ACTIVITY.map((b) => (
              <TouchableOpacity key={b.n} style={[styles.badgeItem, { backgroundColor: t.surface }, badgeDetail && badgeDetail.n === b.n && styles.badgeSel]} onPress={() => setBadgeDetail(b)}>
                <View style={[styles.badgeIcon, { backgroundColor: b.bg }]}><Text style={styles.badgeEmoji}>{b.icon}</Text></View>
                <Text style={[styles.badgeName, { color: t.text }]}>{b.n}</Text>
                <Text style={[styles.badgeProg, { color: t.muted }]}>{b.p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.sec, { color: t.text }]}>Achievement</Text>
          <View style={styles.badgeGrid}>
            {BADGES_ACH.map((b) => (
              <TouchableOpacity key={b.n} style={[styles.badgeItem, { backgroundColor: t.surface }, badgeDetail && badgeDetail.n === b.n && styles.badgeSel]} onPress={() => setBadgeDetail(b)}>
                <View style={[styles.badgeIcon, { backgroundColor: b.bg }]}><Text style={styles.badgeEmoji}>{b.icon}</Text></View>
                <Text style={[styles.badgeName, { color: t.text }]}>{b.n}</Text>
                <Text style={[styles.badgeProg, { color: t.muted }]}>{b.p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Gift received detail ── */}
      {view === 'gift' && (
        <View>
          {subHead('Gift received', 'profile')}
          <View style={styles.giftEmptyBig}>
            <Text style={styles.giftEmptyIconBig}>🎁</Text>
            <Text style={[styles.giftEmptyTxt, { color: t.muted }]}>Haven't received a gift yet</Text>
            <Text style={[styles.hint, { color: t.muted, textAlign: 'center' }]}>
              When you go live or someone sends a gift to your profile, the gifts will appear here one by one — who sent them and how many Diamonds each gift is worth.
            </Text>
          </View>
        </View>
      )}

      {/* ── Edit Profile (real form — saves to the profiles row) ── */}
      {view === 'edit' && (
        <View>
          {subHead('Edit Profile', 'profile')}
          <View style={styles.menu}>
            <TouchableOpacity
              style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={pickAvatar}
              disabled={avatarBusy}
            >
              <Text style={[styles.editLabel, { color: t.text }]}>My Avatar</Text>
              {avatarView(40, 20)}
              <Text style={[styles.editValue, { color: t.muted }]}>{avatarBusy ? 'Uploading…' : 'Change photo'}</Text>
            </TouchableOpacity>
            <View style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.editLabel, { color: t.text }]}>ID</Text>
              <Text style={[styles.editValue, { color: t.muted }]}>{PROFILE.id || '—'}</Text>
              <TouchableOpacity onPress={copyId} style={styles.copyBtn}><Text style={styles.copyBtnTxt}>Copy</Text></TouchableOpacity>
            </View>
            <View style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.editLabel, { color: t.text }]}>Gmail</Text>
              <Text style={[styles.editValue, { color: t.muted }]}>{user && user.email ? user.email : 'Not set'}</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: t.text }]}>Nickname</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
              value={draft.nickname}
              onChangeText={(v) => setDraft((d) => ({ ...d, nickname: v }))}
              placeholder="Your nickname"
              placeholderTextColor={t.muted}
            />
            <Text style={[styles.fieldLabel, { color: t.text }]}>Age</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
              value={draft.age}
              onChangeText={(v) => setDraft((d) => ({ ...d, age: v.replace(/[^0-9]/g, '') }))}
              placeholder="Not set"
              placeholderTextColor={t.muted}
              keyboardType="numeric"
            />
            <Text style={[styles.fieldLabel, { color: t.text }]}>Gender (gates Go Live — saved to your profile)</Text>
            <View style={styles.genderRow}>
              {['male', 'female'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, gender === g && styles.genderBtnOn]}
                  onPress={() => persistGender(g)}
                >
                  <Text style={[styles.genderBtnTxt, gender === g && styles.genderBtnTxtOn]}>{g === 'male' ? 'Male' : 'Female'}</Text>
                </TouchableOpacity>
              ))}
              <Text style={[styles.editValue, { color: t.muted }]}>{gender ? '' : 'Not set'}</Text>
            </View>
            <Text style={[styles.fieldLabel, { color: t.text }]}>Country</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
              value={draft.country}
              onChangeText={(v) => setDraft((d) => ({ ...d, country: v }))}
              placeholder="Not set"
              placeholderTextColor={t.muted}
            />
            <Text style={[styles.fieldLabel, { color: t.text }]}>Language</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
              value={draft.language}
              onChangeText={(v) => setDraft((d) => ({ ...d, language: v }))}
              placeholder="Not set"
              placeholderTextColor={t.muted}
            />
            <TouchableOpacity
              style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => setView('lang')}
            >
              <Text style={[styles.editLabel, { color: t.text }]}>Second Language</Text>
              <Text style={[styles.editValue, { color: t.muted }]}>{secondLang || 'Not set'}</Text>
              <Text style={styles.menuChev}>›</Text>
            </TouchableOpacity>
            <Text style={[styles.fieldLabel, { color: t.text }]}>Tags (comma-separated)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
              value={draft.tags}
              onChangeText={(v) => setDraft((d) => ({ ...d, tags: v }))}
              placeholder="e.g. Designer, Leo, Cricket"
              placeholderTextColor={t.muted}
            />
            <Text style={[styles.fieldLabel, { color: t.text }]}>Self-introduction</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
              value={draft.bio}
              onChangeText={(v) => setDraft((d) => ({ ...d, bio: v }))}
              placeholder="Tell others about yourself"
              placeholderTextColor={t.muted}
              multiline
            />
            <TouchableOpacity style={[styles.bigGradBtn, saving && { opacity: 0.5 }]} onPress={saveProfile} disabled={saving}>
              <Text style={styles.bigGradTxt}>{saving ? 'Saving…' : 'Save Profile'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Second Language picker (persisted) ── */}
      {view === 'lang' && (
        <View>
          {subHead('Second Language', 'edit')}
          <View style={styles.menu}>
            {LANGUAGES.map(([en, native]) => (
              <TouchableOpacity
                key={en}
                style={[styles.langRow, { backgroundColor: t.surface, borderColor: t.border }]}
                onPress={() => pickSecondLang(en)}
              >
                <Text style={[styles.langName, { color: t.text }]}>{en} <Text style={{ color: t.muted }}>{native}</Text></Text>
                {secondLang === en && <Text style={styles.langTick}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── Settings ── */}
      {view === 'settings' && (
        <View>
          {subHead('Settings')}
          <View style={styles.menu}>
            <TouchableOpacity
              style={[styles.editRow, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={clearCache}
            >
              <Text style={[styles.editLabel, { color: t.text }]}>Clear Cache</Text>
              <Text style={[styles.editValue, { color: t.muted }]}>Removes saved app caches</Text>
              <Text style={styles.menuChev}>›</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.versionTxt, { color: t.muted }]}>Livo v1.0.0</Text>
          {confirmDelete ? (
            <View style={[styles.deleteBox, { backgroundColor: t.surface, borderColor: '#ef4444' }]}>
              <Text style={[styles.deleteTitle, { color: t.text }]}>Delete your account?</Text>
              <Text style={[styles.deleteText, { color: t.muted }]}>
                Your profile, ID, balance and saved items are kept for 3 months and can be restored from the admin panel.
              </Text>
              <View style={styles.deleteBtns}>
                <TouchableOpacity
                  style={[styles.deleteConfirmBtn, deleting && { opacity: 0.5 }]}
                  onPress={doDeleteAccount}
                  disabled={deleting}
                >
                  <Text style={styles.deleteConfirmTxt}>{deleting ? 'Deleting…' : 'Confirm delete'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setConfirmDelete(false)} disabled={deleting}>
                  <Text style={styles.deleteCancelTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.deleteBtn} onPress={() => setConfirmDelete(true)}>
              <Text style={styles.deleteBtnTxt}>Delete account</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.logoutBtn} onPress={doLogout}>
            <Text style={styles.logoutTxt}>Log Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  albumEmpty: { fontSize: 13, marginTop: 10 },
  avatar: { borderRadius: 32, height: 64, width: 64 },
  avatarFallback: { alignItems: 'center', backgroundColor: '#7c3aed', justifyContent: 'center' },
  avatarFallbackTxt: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  backBtn: { alignItems: 'center', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  backTxt: { fontSize: 28, fontWeight: 'bold' },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 8 },
  badgeEmoji: { fontSize: 22 },
  badgeIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  badgeItem: { alignItems: 'center', borderRadius: 12, marginBottom: 10, padding: 12, width: '31%' },
  badgeName: { fontSize: 12, fontWeight: 'bold', marginTop: 6, textAlign: 'center' },
  badgeProg: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  badgeSel: { borderColor: THEME.gold, borderWidth: 2 },
  bang: { color: '#ef4444', fontWeight: 'bold' },
  bg: { flex: 1 },
  bigDarkBtn: { backgroundColor: '#111827', borderRadius: 12, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
  bigDarkTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  bigGradBtn: { backgroundColor: THEME.violet, borderRadius: 12, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
  bigGradTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  calBtn: { alignSelf: 'flex-end', marginRight: 16, marginTop: 12 },
  calEmoji: { fontSize: 24 },
  card: { borderRadius: 16, flex: 1, minHeight: 118, padding: 12 },
  cardBox: { borderRadius: 14, marginHorizontal: 16, marginTop: 12, padding: 14 },
  cardBoxTitle: { fontSize: 16, fontWeight: 'bold' },
  cardIcon: { fontSize: 30, marginTop: 6 },
  cardIncome: { backgroundColor: '#fde68a' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginTop: 18 },
  cardTitleDark: { color: '#92400e', fontSize: 15, fontWeight: 'bold', marginTop: 18 },
  cardValue: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  cardValueDark: { color: '#92400e', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  cardWallet: { backgroundColor: '#7c3aed' },
  cards: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 14 },
  chatPriceVal: { color: '#db2777', fontSize: 14, fontWeight: 'bold' },
  checkinBtn: { alignItems: 'center', justifyContent: 'center' },
  checkinEmoji: { fontSize: 22 },
  chipLang: { backgroundColor: '#f97316', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  chipMale: { backgroundColor: '#3b82f6', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8 },
  claimBtn: { backgroundColor: '#f5b93f', borderRadius: 14, marginTop: 4, paddingHorizontal: 12, paddingVertical: 6 },
  claimBtnDone: { backgroundColor: '#d1d5db' },
  claimTxt: { color: '#1f2937', fontSize: 12, fontWeight: 'bold' },
  copyBtn: { backgroundColor: '#ede9fe', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  copyBtnTxt: { color: '#7c3aed', fontSize: 12, fontWeight: 'bold' },
  copyIcon: { fontSize: 15 },
  discountBadge: { backgroundColor: '#ec4899', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8, top: -8 },
  earnBeans: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 4 },
  earnBtn: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  earnBtnTxt: { color: '#92400e', fontSize: 13, fontWeight: 'bold' },
  earnBtns: { flexDirection: 'row', gap: 8 },
  earnCard: { borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12, padding: 16 },
  earnLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  earnTab: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingBottom: 6, paddingHorizontal: 4 },
  earnTabOn: { borderBottomColor: '#f59e0b' },
  earnTabTxt: { color: '#6b7280', fontSize: 14 },
  earnTabTxtOn: { color: '#111827', fontWeight: 'bold' },
  earnTabs: { flexDirection: 'row', gap: 18, marginHorizontal: 16, marginTop: 16 },
  earnUsd: { fontSize: 13, fontWeight: 'normal' },
  editAva: { borderRadius: 20, height: 40, width: 40 },
  editBtn: { backgroundColor: '#ede9fe', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnTxt: { color: '#7c3aed', fontSize: 13, fontWeight: 'bold' },
  editLabel: { flex: 1, fontSize: 15 },
  editRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 13 },
  editValue: { fontSize: 14, marginRight: 8 },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', marginHorizontal: 16, marginTop: 14 },
  flagChip: { fontSize: 16 },
  flagChipTxt: { backgroundColor: '#eef2ff', borderRadius: 10, color: '#1e293b', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  genderBtn: { borderColor: '#d1d5db', borderRadius: 16, borderWidth: 1, marginRight: 8, paddingHorizontal: 16, paddingVertical: 8 },
  genderBtnOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  genderBtnTxt: { color: '#374151', fontSize: 14, fontWeight: 'bold' },
  genderBtnTxtOn: { color: '#fff' },
  genderRow: { alignItems: 'center', flexDirection: 'row', marginHorizontal: 16, marginTop: 8 },
  giftEmpty: { alignItems: 'center', paddingVertical: 18 },
  giftEmptyBig: { alignItems: 'center', padding: 32 },
  giftEmptyIcon: { fontSize: 44 },
  giftEmptyIconBig: { fontSize: 64 },
  giftEmptyTxt: { fontSize: 14, marginTop: 10 },
  goldAva: { borderRadius: 24, height: 48, width: 48 },
  goldId: { fontSize: 13, marginTop: 2 },
  goldName: { fontSize: 17, fontWeight: 'bold' },
  goldUser: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 14 },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 44 },
  headTitle: { flex: 1, fontSize: 20, fontWeight: 'bold' },
  heroBack: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 18, height: 36, justifyContent: 'center', left: 12, position: 'absolute', top: 44, width: 36 },
  heroBackTxt: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  heroEdit: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, position: 'absolute', right: 12, top: 48 },
  heroEditTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  heroFallback: { backgroundColor: '#7c3aed' },
  heroImg: { height: 230, width: '100%' },
  heroWrap: { position: 'relative' },
  hint: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  idHead: { flexDirection: 'row' },
  idMain: { flex: 1, marginLeft: 12 },
  idRow: { alignItems: 'center', flexDirection: 'row', marginTop: 4 },
  idTxt: { fontSize: 12 },
  infoTab: { borderBottomColor: '#ffd76a', borderBottomWidth: 2, color: '#ffd76a', fontSize: 15, fontWeight: 'bold', marginTop: 16, paddingBottom: 6, width: 96 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 15, marginHorizontal: 16, marginTop: 6, paddingHorizontal: 12, paddingVertical: 10 },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  inviteCode: { fontSize: 18, fontWeight: 'bold' },
  inviteCodeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  langName: { fontSize: 15 },
  langRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
  langTick: { color: THEME.gold2, fontSize: 18, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 12, marginHorizontal: 16, marginTop: 20, paddingVertical: 13 },
  logoutTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  lvChip: { backgroundColor: '#ede9fe', borderRadius: 10, color: '#7c3aed', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  medal: { alignItems: 'center', flex: 1 },
  medalIcon: { fontSize: 34 },
  medalName: { fontSize: 11, fontWeight: 'bold', marginTop: 4, textAlign: 'center' },
  medalRow: { flexDirection: 'row', paddingVertical: 12 },
  menu: { marginHorizontal: 16, marginTop: 14 },
  menuChev: { color: '#9ca3af', fontSize: 20 },
  menuEmoji: { fontSize: 16 },
  menuIcon: { alignItems: 'center', borderRadius: 9, height: 32, justifyContent: 'center', width: 32 },
  menuLabel: { flex: 1, fontSize: 14, marginLeft: 10 },
  menuRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 10 },
  moonBtn: { alignItems: 'center', justifyContent: 'center' },
  moonEmoji: { fontSize: 20 },
  myBeans: { fontSize: 15, fontWeight: 'bold', marginHorizontal: 16, marginTop: 16 },
  name: { fontSize: 18, fontWeight: 'bold' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  noData: { alignItems: 'center', marginTop: 30 },
  noDataEmoji: { fontSize: 48 },
  noDataTxt: { fontSize: 14, marginTop: 8 },
  noteLine: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  notes: { marginHorizontal: 16, marginTop: 12 },
  onlineBadge: { backgroundColor: '#7c3aed', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  optB: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  optD: { fontSize: 15, fontWeight: 'bold' },
  optGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12 },
  optTile: { borderRadius: 12, borderWidth: 1.5, marginBottom: 10, padding: 12, width: '48%' },
  pfAva: { borderRadius: 36, height: 72, width: 72 },
  pfBannerChev: { color: '#fff', fontSize: 22 },
  pfBannerGold: { alignItems: 'center', backgroundColor: '#f5b93f', borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  pfBannerIcon: { fontSize: 20, marginLeft: 8 },
  pfBannerPink: { alignItems: 'center', backgroundColor: '#ec4899', borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  pfBannerTitle: { color: '#fff', flex: 1, fontSize: 16, fontWeight: 'bold' },
  pfCard: { borderRadius: 12, marginTop: 14, overflow: 'hidden' },
  pfIdRow: { flexDirection: 'row', gap: 12 },
  pfMain: { borderTopLeftRadius: 18, borderTopRightRadius: 18, marginTop: -18, padding: 16 },
  pfName: { fontSize: 20, fontWeight: 'bold' },
  pfNameRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pfSig: { fontSize: 13, marginTop: 12 },
  pfStats: { fontSize: 13, marginTop: 6 },
  priceBig: { fontSize: 26, fontWeight: 'bold' },
  priceBigRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  priceOpt: { borderColor: '#d1d5db', borderRadius: 16, borderWidth: 1, marginRight: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 7 },
  priceOptSel: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  priceOptTxt: { color: '#374151', fontSize: 13, fontWeight: 'bold' },
  priceOptTxtSel: { color: '#fff' },
  priceOpts: { flexDirection: 'row', flexWrap: 'wrap' },
  pricePer: { color: '#6b7280', fontSize: 14, fontWeight: 'normal' },
  recordLink: { color: THEME.gold2, fontSize: 13, fontWeight: 'bold' },
  redDot: { backgroundColor: '#ef4444', borderRadius: 5, height: 10, position: 'absolute', right: 0, top: 0, width: 10 },
  sec: { fontSize: 16, fontWeight: 'bold', marginHorizontal: 16, marginTop: 16 },
  sendTile: { alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontSize: 15, fontWeight: 'bold' },
  stat: { alignItems: 'center', flex: 1 },
  statLbl: { fontSize: 12, marginTop: 2 },
  statNum: { fontSize: 16, fontWeight: 'bold' },
  stats: { flexDirection: 'row', marginTop: 12 },
  tableHead: { backgroundColor: '#eef2ff', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 12, paddingVertical: 9 },
  tableRow: { borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  tagGold: { backgroundColor: '#fef3c7', borderRadius: 10, color: '#b45309', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  tagGreen: { backgroundColor: '#dcfce7', borderRadius: 10, color: '#16a34a', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  tagPink: { backgroundColor: '#fde7f1', borderRadius: 10, color: '#db2777', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  // Admin-set profile tags (user_tags) — small chips under the name.
  tagChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tagChip: { backgroundColor: '#ede9fe', borderRadius: 10, color: '#7c3aed', fontSize: 11, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  // Equipped avatar frame line (name + expiry) under the name.
  frameLine: { fontSize: 12, marginTop: 6 },
  // Frame equip card in the My Profile detail view.
  frameHead: { borderBottomColor: '#e5e7eb', borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  frameHeadTitle: { fontSize: 16, fontWeight: 'bold' },
  frameHeadSub: { fontSize: 12, marginTop: 2 },
  frameList: { paddingHorizontal: 8, paddingVertical: 6 },
  frameItem: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  frameItemOn: { backgroundColor: '#ede9fe' },
  frameItemTxt: { fontSize: 14, fontWeight: 'bold' },
  frameItemSub: { fontSize: 12, marginTop: 2 },
  // Delete-account two-step confirm (Settings).
  deleteBox: { borderRadius: 12, borderWidth: 1.5, marginHorizontal: 16, marginTop: 16, padding: 14 },
  deleteTitle: { fontSize: 16, fontWeight: 'bold' },
  deleteText: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  deleteBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  deleteConfirmBtn: { backgroundColor: '#ef4444', borderRadius: 10, flex: 1, paddingVertical: 11 },
  deleteConfirmTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  deleteCancelBtn: { backgroundColor: '#e5e7eb', borderRadius: 10, flex: 1, paddingVertical: 11 },
  deleteCancelTxt: { color: '#111827', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  deleteBtn: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  deleteBtnTxt: { color: '#ef4444', fontSize: 14, fontWeight: 'bold' },
  taskEmoji: { fontSize: 20 },
  taskIcon: { alignItems: 'center', borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  taskReward: { color: '#b45309', fontSize: 13, fontWeight: 'bold' },
  taskRight: { alignItems: 'flex-end' },
  taskRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 8, padding: 12 },
  taskSub: { fontSize: 12, marginTop: 2 },
  taskSummary: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 14 },
  taskSummaryIcon: { fontSize: 22 },
  taskSummaryTxt: { fontSize: 14 },
  taskSummaryVal: { fontSize: 16, fontWeight: 'bold' },
  taskTitle: { fontSize: 14, fontWeight: 'bold' },
  th: { fontSize: 13, fontWeight: 'bold' },
  td: { fontSize: 14 },
  topBtns: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  unreadBadge: { backgroundColor: '#ef4444', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 2 },
  versionTxt: { fontSize: 13, marginTop: 16, textAlign: 'center' },
  vipBadge: { backgroundColor: '#f5b93f', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  vipBadge2: { backgroundColor: '#f5b93f', borderRadius: 10, color: '#1f2937', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 3 },
  vipBadgeTxt: { color: '#1f2937', fontSize: 11, fontWeight: 'bold' },
  wdAuth: { fontSize: 14, fontWeight: 'bold', marginHorizontal: 16, marginTop: 10 },
  wdAva: { borderRadius: 20, height: 40, width: 40 },
  wdBanner: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12, padding: 12 },
  wdBannerChev: { color: '#fff', fontSize: 22 },
  wdBannerTxt: { color: '#fff', flex: 1, fontSize: 15, fontWeight: 'bold' },
  wdBeans: { fontSize: 13 },
  wdNote: { fontSize: 12, lineHeight: 18, marginHorizontal: 16, marginTop: 12 },
  wdOptHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 14 },
  wdOptTitle: { fontSize: 15, fontWeight: 'bold' },
  wrap: { paddingBottom: 32 },
  darkCard: { backgroundColor: '#2a1152', borderRadius: 14, flex: 1, padding: 14 },
  darkCardTitle: { color: '#fbbf24', fontSize: 13, fontWeight: 'bold' },
  darkCardValue: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  darkRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  goldBanner: { alignItems: 'center', backgroundColor: '#f5b93f', borderRadius: 14, flexDirection: 'row', gap: 10, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  goldBannerChev: { color: '#78350f', fontSize: 22, fontWeight: 'bold' },
  goldBannerIcon: { fontSize: 30 },
  goldBannerTitle: { color: '#1f2937', fontSize: 16, fontWeight: 'bold' },
  goldBannerValue: { color: '#78350f', fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  headerCard: { borderRadius: 16, padding: 14 },
  incomeVal: { color: '#b45309', fontSize: 13, fontWeight: 'bold' },
  mainPad: { paddingHorizontal: 14, paddingTop: 12 },
  menuCard: { borderRadius: 16, marginTop: 12, overflow: 'hidden', paddingHorizontal: 4 },
});
