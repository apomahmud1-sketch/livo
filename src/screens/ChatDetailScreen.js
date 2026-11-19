// Livo ChatDetailScreen — v2 (2026-11-19)
// The chat screen that opens from any Chat / Say hi / Contacts row
// (preview livo-home-preview v24, #msgSection → .cd-view): host name +
// green online dot on top, a profile card (level badge, Follow button,
// country, age, Real badge, language, photos), the host's message
// bubble with Translation settings, the "Spend x1 to unlock chat"
// line, a Say something box + Send, and translate / photo / video
// (Free) / gift icons at the bottom.
//
// ── BEHAVIOUR (from the preview) ───────────────────────────────────
// The first message sent spends ticket x1 and unlocks the chat (the
// unlock line disappears); the host auto-replies ~1s later from a
// demo reply list. Follow toggles locally.
// ── DEMO (Supabase / payments replace this later) ──────────────────
// No real ticket is spent and no real payment happens yet — the x1
// unlock is a demo state, like the preview. Photos are coloured
// initial tiles: the app has no host photos for these demo chats yet.
// ── FOLLOW-UP (not silently changed) ───────────────────────────────
// The Free video button only shows a toast: VideoCallScreen bills
// per minute on end (chargeCall), so opening a "free" call through
// it today would charge coins. A free-call mode in VideoCallScreen
// is needed before this button can really start a free call. The
// gift button likewise needs the Live Room gift panel wired in.

// ── F4 (2026-11-19) ───────────────────────────────────────────────
// Chat auto-translation: a toggle (🌐 button below, or "Translation
// settings" under the first message) translates incoming messages via
// the free MyMemory API — see src/utils/translate.js. Translated text
// is the main line, the original stays underneath in small text, and
// tapping the bubble swaps them. If translation fails, the original
// is shown unchanged. All F4 code is wrapped in // [F4] markers.

import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, getVoiceCallRate } from '../config'; // [F2] getVoiceCallRate added
import { useApp } from '../store';
// [F4] Auto-translation helper + the user's profile language
// (PROFILE.language, 'English' -> 'en'; falls back to 'en').
import { resolveTargetLanguage, translateText } from '../utils/translate';
import { PROFILE } from './profile/levelData';
// [/F4]

const HOST_REPLIES = [
  'Thank you!',
  'তুমি কেমন আছো?',
  'আজ লাইভে এসো, আড্ডা হবে',
  'Nice to meet you!',
  'হ্যালো! তুমি কোথা থেকে?',
  'Ok, live-এ দেখা হবে',
];

// [F4] Incoming-message bubble with auto-translation.
// When a translation exists, the translated text is the main line and
// the original is shown underneath in small text; tapping the bubble
// swaps them. While a translation is pending — or when it failed —
// the original text is shown unchanged (never blank, never a crash).
function TranslatedBubble({ msg, translated, showOriginal, translating, onToggleOriginal }) {
  const hasTranslation =
    typeof translated === 'string' &&
    translated.trim() !== '' &&
    translated.trim() !== msg.text.trim();
  const mainText = hasTranslation && !showOriginal ? translated : msg.text;
  const subText = hasTranslation ? (showOriginal ? translated : msg.text) : null;
  return (
    <View>
      <TouchableOpacity
        style={[styles.bubble, styles.bubbleThem]}
        activeOpacity={0.85}
        onPress={hasTranslation ? onToggleOriginal : undefined}
      >
        <Text style={styles.bubbleText}>{mainText}</Text>
        {subText ? <Text style={styles.origText}>{subText}</Text> : null}
      </TouchableOpacity>
      {translating ? <Text style={styles.translatingNote}>Translating…</Text> : null}
    </View>
  );
}
// [/F4]

export default function ChatDetailScreen({ navigation, route }) {
  const { profile } = route.params || {};
  const { showToast, following, toggleFollow, hosts } = useApp(); // [F2] hosts added
  // [F2] Voice call needs the live store host (rate tier + online
  // state). Chat-only profiles (no storeId) have none — the voice
  // button then toasts instead of navigating.
  const chatHost = profile && profile.storeId
    ? hosts.find((h) => h.id === profile.storeId)
    : null;
  const voiceRate = chatHost ? getVoiceCallRate(chatHost.rateTier) : null;

  const startVoiceCall = () => {
    if (!chatHost) {
      showToast('ভয়েস কল লাইভ হোস্টদের জন্য — Home থেকে হোস্টের কার্ডে 📞 চাপুন');
      return;
    }
    if (!chatHost.online) {
      showToast(`${chatHost.name} এখন অফলাইন`);
      return;
    }
    navigation.navigate('VideoCall', { host: chatHost, audioOnly: true });
  };
  // [/F2]
  const [text, setText] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [localFollowing, setLocalFollowing] = useState(
    profile && profile.storeId ? following.includes(profile.storeId) : false,
  );
  const [msgs, setMsgs] = useState([
    { id: 'm0', me: false, text: (profile && profile.firstMsg) || 'Hi!', translate: true },
  ]);
  const idRef = useRef(1);
  const scrollRef = useRef(null);

  // [F4] Auto-translation state.
  // Target language: the user's profile language when one is set
  // (PROFILE.language, e.g. 'English' -> 'en'); English by default.
  // Note: the store holds no language field, so PROFILE is the source.
  const targetLangLabel = (PROFILE && PROFILE.language) || 'English';
  const targetLang = resolveTargetLanguage(targetLangLabel);
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState({}); // msg id -> translated text
  const [showOriginal, setShowOriginal] = useState({}); // msg id -> original shown as main line
  const [translatingIds, setTranslatingIds] = useState({}); // msg id -> request pending
  // "target::msg-id" already requested — scrolling / re-rendering
  // never re-requests the same message (translate.js also caches).
  const attemptedRef = useRef(new Set());

  // Translate each incoming message once, while the toggle is ON.
  // A failed request (null) simply leaves the original visible.
  useEffect(() => {
    if (!translateOn) return undefined;
    let cancelled = false;
    msgs.forEach((m) => {
      if (m.me || !m.text) return;
      const key = `${targetLang}::${m.id}`;
      if (attemptedRef.current.has(key)) return;
      attemptedRef.current.add(key);
      setTranslatingIds((prev) => ({ ...prev, [m.id]: true }));
      translateText(m.text, targetLang)
        .then((out) => {
          if (cancelled) return;
          setTranslatingIds((prev) => {
            const next = { ...prev };
            delete next[m.id];
            return next;
          });
          if (out && out.trim() !== '' && out.trim() !== m.text.trim()) {
            setTranslations((prev) => ({ ...prev, [m.id]: out }));
          }
        })
        .catch(() => {
          // translateText never throws; this is belt-and-braces.
          // The original stays visible — nothing else to do.
          if (cancelled) return;
          setTranslatingIds((prev) => {
            const next = { ...prev };
            delete next[m.id];
            return next;
          });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [translateOn, msgs, targetLang]);
  // [/F4]

  if (!profile) {
    return (
      <View style={styles.bg}>
        <Text style={styles.empty}>No chat selected.</Text>
      </View>
    );
  }

  const isFollowing = profile.storeId ? following.includes(profile.storeId) : localFollowing;

  const onFollow = () => {
    if (profile.storeId) {
      toggleFollow(profile.storeId);
      showToast(
        following.includes(profile.storeId)
          ? `${profile.name}-কে Unfollow করা হয়েছে`
          : `${profile.name}-কে Follow করা হয়েছে`,
      );
    } else {
      const next = !localFollowing;
      setLocalFollowing(next);
      showToast(next ? `${profile.name}-কে Follow করা হয়েছে` : `${profile.name}-কে Unfollow করা হয়েছে`);
    }
  };

  const send = () => {
    const txt = text.trim();
    if (!txt) return;
    setText('');
    const myId = `m${idRef.current++}`;
    setMsgs((m) => [...m, { id: myId, me: true, text: txt }]);
    if (!unlocked) {
      setUnlocked(true);
      showToast('টিকিট x1 দিয়ে চ্যাট আনলক হয়েছে');
    }
    const prof = profile;
    setTimeout(() => {
      const reply = HOST_REPLIES[Math.floor(Math.random() * HOST_REPLIES.length)];
      setMsgs((m) => [...m, { id: `r${idRef.current++}`, me: false, text: reply }]);
      if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
    }, 1100);
  };

  // [F4] Auto-translate toggle. Turning it off keeps the cached
  // translations, so turning it back on is instant (no re-request).
  const toggleTranslate = () => {
    const next = !translateOn;
    setTranslateOn(next);
    showToast(
      next ? `অটো অনুবাদ চালু — ${targetLangLabel}` : 'অটো অনুবাদ বন্ধ',
    );
  };
  // [/F4]

  return (
    <View style={styles.bg}>
      {/* Header: back, unread badge, name + online dot, more */}
      <View style={styles.head}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>‹</Text>
        </TouchableOpacity>
        {profile.unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{profile.unread}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{profile.name}</Text>
        <View style={styles.onlineDot} />
        <TouchableOpacity onPress={() => showToast('রিপোর্ট / ব্লক অপশন (প্রিভিউ)')}>
          <Text style={styles.moreBtn}>•••</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        onContentSizeChange={() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: false })}
      >
        {/* Profile card */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.cardName}>{profile.name}</Text>
            <View style={styles.lvBadge}>
              <Text style={styles.lvText}>♥ {profile.lv}</Text>
            </View>
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followBtnOn]}
              onPress={onFollow}
            >
              <Text style={[styles.followText, isFollowing && styles.followTextOn]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>📍 {profile.country}</Text>
            <Text style={styles.meta}>♀ {profile.age}</Text>
            <Text style={styles.meta}>✓ Real</Text>
          </View>
          <Text style={styles.lang}>{profile.lang}</Text>
          <View style={styles.photosRow}>
            <View style={[styles.photoTile, { backgroundColor: profile.color || '#7c3aed' }]}>
              <Text style={styles.photoLetter}>{profile.name[0]}</Text>
            </View>
            <View style={[styles.photoTile, { backgroundColor: '#a78bfa' }]}>
              <Text style={styles.photoLetter}>{profile.name[0]}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.time}>20:41</Text>

        {/* Messages */}
        {msgs.map((m) =>
          m.me ? (
            <View key={m.id} style={styles.msgRowMe}>
              <View style={[styles.bubble, styles.bubbleMe]}>
                <Text style={styles.bubbleMeText}>{m.text}</Text>
              </View>
            </View>
          ) : (
            <View key={m.id} style={styles.msgRow}>
              <View style={[styles.miniAva, { backgroundColor: profile.color || '#7c3aed' }]}>
                <Text style={styles.miniAvaText}>{profile.name[0]}</Text>
              </View>
              <View>
                {/* [F4] Incoming bubble: translated text on top, original
                    underneath in small text; tap the bubble to swap them.
                    Translation off / pending / failed -> original only. */}
                <TranslatedBubble
                  msg={m}
                  translated={translations[m.id]}
                  showOriginal={!!showOriginal[m.id]}
                  translating={!!translatingIds[m.id]}
                  onToggleOriginal={() =>
                    setShowOriginal((prev) => ({ ...prev, [m.id]: !prev[m.id] }))
                  }
                />
                {/* [/F4] */}
                {m.translate ? (
                  <TouchableOpacity
                    onPress={toggleTranslate}
                  >
                    <Text style={styles.translateLink}>
                      {translateOn ? `Auto-translate: ON (${targetLangLabel})` : 'Translation settings'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ),
        )}
      </ScrollView>

      {/* Unlock line — hidden after the first message unlocks the chat */}
      {!unlocked && (
        <Text style={styles.unlock}>
          Spend 🎫 <Text style={styles.unlockX1}>x1</Text> to unlock chat with her. No reply in 30 mins? Auto refund.
        </Text>
      )}

      {/* Composer */}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={() => showToast('ইমোজি প্যানেল খুলবে (প্রিভিউ)')}>
          <Text style={styles.emojiBtn}>😊</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Say something"
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom actions */}
      <View style={styles.actions}>
        {/* [F4] 🌐 toggles chat auto-translation (was a preview toast).
            Highlighted while ON. */}
        <TouchableOpacity
          style={[styles.act, translateOn && styles.actOn]}
          onPress={toggleTranslate}
        >
          <Text style={styles.actIcon}>🌐</Text>
        </TouchableOpacity>
        {/* [/F4] */}
        <TouchableOpacity
          style={styles.act}
          onPress={() => showToast(unlocked ? 'ছবি বাছাই খুলবে (প্রিভিউ)' : 'ছবি পাঠাতে আগে চ্যাট আনলক করো')}
        >
          <Text style={styles.actIcon}>🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.act}
          onPress={() => showToast('Free ভিডিও কল শুরু হচ্ছে… (প্রিভিউ)')}
        >
          <Text style={styles.freeBadge}>Free</Text>
          <Text style={styles.actIcon}>📹</Text>
        </TouchableOpacity>
        {/* [F2] Voice call: audio-only, half the video rate (rate
            shown above the icon when the host is known). */}
        <TouchableOpacity style={styles.act} onPress={startVoiceCall}>
          {voiceRate && <Text style={styles.voiceRate}>🪙 {voiceRate.coinsPerMinute}/min</Text>}
          <Text style={styles.actIcon}>📞</Text>
        </TouchableOpacity>
        {/* [/F2] */}
        <TouchableOpacity style={styles.act} onPress={() => showToast('গিফট প্যানেল খুলবে (প্রিভিউ)')}>
          <Text style={styles.actIcon}>🎁</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { borderTopColor: COLORS.lightGrey, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10 },
  act: { alignItems: 'center', minWidth: 56 },
  // [F4] Highlight on the 🌐 button while auto-translate is ON.
  actOn: { backgroundColor: '#ede9fe', borderRadius: 12 },
  // [F4] Original text shown small under a translated message.
  origText: { color: COLORS.grey, fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  translatingNote: { color: COLORS.grey, fontSize: 11, marginTop: 4 },
  // [/F4]
  actIcon: { fontSize: 26 },
  backBtn: { color: COLORS.dark, fontSize: 32, fontWeight: 'bold', paddingHorizontal: 8 },
  bg: { backgroundColor: '#fff', flex: 1, paddingTop: 48 },
  body: { flex: 1, paddingHorizontal: 14 },
  bubble: { borderRadius: 14, maxWidth: 260, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleMe: { backgroundColor: COLORS.purple },
  bubbleMeText: { color: '#fff' },
  bubbleText: { color: COLORS.dark },
  bubbleThem: { backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fdf4ff', borderRadius: 16, marginTop: 10, padding: 14 },
  cardName: { fontSize: 18, fontWeight: 'bold' },
  cardTop: { alignItems: 'center', flexDirection: 'row' },
  empty: { color: COLORS.grey, marginTop: 40, textAlign: 'center' },
  emojiBtn: { fontSize: 24, paddingHorizontal: 6 },
  followBtn: { backgroundColor: COLORS.pink, borderRadius: 14, marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 6 },
  followBtnOn: { backgroundColor: COLORS.lightGrey },
  followText: { color: '#fff', fontWeight: 'bold' },
  followTextOn: { color: COLORS.dark },
  freeBadge: { color: COLORS.green, fontSize: 11, fontWeight: 'bold' },
  head: { alignItems: 'center', borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 10, paddingHorizontal: 8 },
  input: { backgroundColor: COLORS.lavender, borderRadius: 20, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  inputBar: { alignItems: 'center', flexDirection: 'row', padding: 12 },
  lang: { color: COLORS.purple, fontWeight: '600', marginTop: 8 },
  lvBadge: { backgroundColor: COLORS.pink, borderRadius: 10, marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2 },
  lvText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  meta: { color: COLORS.dark, marginRight: 12 },
  metaRow: { flexDirection: 'row', marginTop: 8 },
  miniAva: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', marginRight: 8, width: 32 },
  miniAvaText: { color: '#fff', fontWeight: 'bold' },
  moreBtn: { color: COLORS.dark, fontSize: 20, fontWeight: 'bold', paddingHorizontal: 8 },
  msgRow: { alignItems: 'flex-start', flexDirection: 'row', marginVertical: 4 },
  msgRowMe: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 4 },
  onlineDot: { backgroundColor: COLORS.green, borderRadius: 5, height: 10, marginLeft: 6, width: 10 },
  photoLetter: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  photoTile: { alignItems: 'center', borderRadius: 12, height: 110, justifyContent: 'center', marginRight: 10, width: 110 },
  photosRow: { flexDirection: 'row', marginTop: 10 },
  sendBtn: { backgroundColor: COLORS.purple, borderRadius: 18, marginLeft: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: 'bold' },
  time: { color: COLORS.grey, fontSize: 12, marginVertical: 8, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginLeft: 4 },
  translateLink: { color: COLORS.purple, fontSize: 12, marginTop: 4 },
  unlock: { fontSize: 14, fontWeight: '700', lineHeight: 21, paddingHorizontal: 16, paddingTop: 10 },
  unlockX1: { color: '#e021c8' },
  // [F2] Voice-call rate label above the 📞 button.
  voiceRate: { color: COLORS.purple, fontSize: 11, fontWeight: 'bold' },
  // [/F2]
  unreadBadge: { backgroundColor: '#ef4444', borderRadius: 10, marginLeft: 4, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2 },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
});
