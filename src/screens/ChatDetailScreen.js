// Livo ChatDetailScreen — v3 (2026-11-21)
// Restyled to the v0 Home design (~/workspace/v0-design/SPEC.md):
// mint #f0fdf4 background, white profile card with soft shadow,
// green #20a64b Follow button and Send button, white incoming
// bubbles / light-green #dcfce7 outgoing bubbles, lucide icons
// everywhere (no emoji). All behaviour, demo data and wording
// unchanged — except the unlock line's 🎫, which is now a lucide
// Ticket icon (same words).
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
import {
  Check,
  ChevronLeft,
  Coins,
  Gift,
  Globe,
  Heart,
  Image as ImageIcon,
  MapPin,
  MoreHorizontal,
  Phone,
  Smile,
  Ticket,
  Video,
} from 'lucide-react-native';
import { COLORS } from '../config'; // [F2] getVoiceCallRate added
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
  const { showToast, following, toggleFollow, hosts, getLiveVoiceCallRate } = useApp(); // [F2] hosts added
  // [F2] Voice call needs the live store host (rate tier + online
  // state). Chat-only profiles (no storeId) have none — the voice
  // button then toasts instead of navigating.
  const chatHost = profile && profile.storeId
    ? hosts.find((h) => h.id === profile.storeId)
    : null;
  // [Live] Voice rate from the store (live Supabase tiers when the
  // setup SQL is pasted, config.js demo tiers otherwise).
  const voiceRate = chatHost ? getLiveVoiceCallRate(chatHost.rateTier) : null;

  const startVoiceCall = () => {
    if (!chatHost) {
      showToast('ভয়েস কল শুধু লাইভ হোস্টদের জন্য');
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
          <ChevronLeft size={28} color="#111713" />
        </TouchableOpacity>
        {profile.unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{profile.unread}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{profile.name}</Text>
        <View style={styles.onlineDot} />
        <TouchableOpacity onPress={() => showToast('রিপোর্ট / ব্লক অপশন (প্রিভিউ)')}>
          <MoreHorizontal size={24} color="#111713" />
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
              <Heart size={11} color="#fff" fill="#fff" />
              <Text style={styles.lvText}> {profile.lv}</Text>
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
            <View style={styles.metaItem}>
              <MapPin size={13} color="#273029" />
              <Text style={styles.meta}> {profile.country}</Text>
            </View>
            <Text style={styles.meta}>{profile.age}</Text>
            <View style={styles.metaItem}>
              <Check size={13} color="#20a64b" strokeWidth={3} />
              <Text style={styles.meta}> Real</Text>
            </View>
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
        <View style={styles.unlockRow}>
          <Ticket size={15} color="#111713" />
          <Text style={styles.unlock}>
            {' '}Spend <Text style={styles.unlockX1}>x1</Text> to unlock chat with her. No reply in 30 mins? Auto refund.
          </Text>
        </View>
      )}

      {/* Composer */}
      <View style={styles.inputBar}>
        <TouchableOpacity onPress={() => showToast('ইমোজি প্যানেল খুলবে (প্রিভিউ)')}>
          <Smile size={24} color="#9aa39c" />
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
        {/* [F4] Globe toggles chat auto-translation (was a preview toast).
            Highlighted while ON. */}
        <TouchableOpacity
          style={[styles.act, translateOn && styles.actOn]}
          onPress={toggleTranslate}
        >
          <Globe size={26} color={translateOn ? '#20a64b' : '#9aa39c'} />
        </TouchableOpacity>
        {/* [/F4] */}
        <TouchableOpacity
          style={styles.act}
          onPress={() => showToast(unlocked ? 'ছবি বাছাই খুলবে (প্রিভিউ)' : 'ছবি পাঠাতে আগে চ্যাট আনলক করো')}
        >
          <ImageIcon size={26} color="#9aa39c" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.act}
          onPress={() => showToast('Free ভিডিও কল শুরু হচ্ছে… (প্রিভিউ)')}
        >
          <Text style={styles.freeBadge}>Free</Text>
          <Video size={26} color="#9aa39c" />
        </TouchableOpacity>
        {/* [F2] Voice call: audio-only, half the video rate (rate
            shown above the icon when the host is known). */}
        <TouchableOpacity style={styles.act} onPress={startVoiceCall}>
          {voiceRate && (
            <View style={styles.voiceRateRow}>
              <Coins size={11} color="#20a64b" />
              <Text style={styles.voiceRate}> {voiceRate.coinsPerMinute}/min</Text>
            </View>
          )}
          <Phone size={26} color="#9aa39c" />
        </TouchableOpacity>
        {/* [/F2] */}
        <TouchableOpacity style={styles.act} onPress={() => showToast('গিফট প্যানেল খুলবে (প্রিভিউ)')}>
          <Gift size={26} color="#9aa39c" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { borderTopColor: '#e9eeea', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10 },
  act: { alignItems: 'center', minWidth: 56 },
  // [F4] Highlight on the Globe button while auto-translate is ON.
  actOn: { backgroundColor: '#dcfce7', borderRadius: 12 },
  // [F4] Original text shown small under a translated message.
  origText: { color: '#818b84', fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  translatingNote: { color: '#818b84', fontSize: 11, marginTop: 4 },
  // [/F4]
  bg: { backgroundColor: '#f0fdf4', flex: 1, paddingTop: 48 },
  body: { flex: 1, paddingHorizontal: 14 },
  bubble: { borderRadius: 14, maxWidth: 260, paddingHorizontal: 12, paddingVertical: 9 },
  bubbleMe: { backgroundColor: '#dcfce7' },
  bubbleMeText: { color: '#111713' },
  bubbleText: { color: '#111713' },
  bubbleThem: { backgroundColor: '#fff', borderColor: '#e9eeea', borderWidth: 1 },
  card: { backgroundColor: '#fff', borderRadius: 16, elevation: 2, marginTop: 10, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  cardName: { color: '#111713', fontSize: 18, fontWeight: '800' },
  cardTop: { alignItems: 'center', flexDirection: 'row' },
  empty: { color: '#818b84', marginTop: 40, textAlign: 'center' },
  followBtn: { backgroundColor: '#20a64b', borderRadius: 14, marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 6 },
  followBtnOn: { backgroundColor: '#e9eeea' },
  followText: { color: '#fff', fontWeight: 'bold' },
  followTextOn: { color: '#273029' },
  freeBadge: { color: '#20a64b', fontSize: 11, fontWeight: 'bold' },
  head: { alignItems: 'center', borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 10, paddingHorizontal: 8 },
  input: { backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 20, borderWidth: 1, flex: 1, marginLeft: 6, paddingHorizontal: 14, paddingVertical: 10 },
  inputBar: { alignItems: 'center', flexDirection: 'row', padding: 12 },
  lang: { color: '#20a64b', fontWeight: '600', marginTop: 8 },
  lvBadge: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 10, flexDirection: 'row', marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2 },
  lvText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  meta: { color: '#273029' },
  metaItem: { alignItems: 'center', flexDirection: 'row', marginRight: 12 },
  metaRow: { alignItems: 'center', flexDirection: 'row', marginTop: 8 },
  miniAva: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', marginRight: 8, width: 32 },
  miniAvaText: { color: '#fff', fontWeight: 'bold' },
  msgRow: { alignItems: 'flex-start', flexDirection: 'row', marginVertical: 4 },
  msgRowMe: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end', marginVertical: 4 },
  onlineDot: { backgroundColor: '#31bc63', borderRadius: 5, elevation: 2, height: 10, marginLeft: 6, shadowColor: '#31bc63', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 3, width: 10 },
  photoLetter: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  photoTile: { alignItems: 'center', borderRadius: 12, height: 110, justifyContent: 'center', marginRight: 10, width: 110 },
  photosRow: { flexDirection: 'row', marginTop: 10 },
  sendBtn: { backgroundColor: '#20a64b', borderRadius: 18, marginLeft: 8, paddingHorizontal: 16, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: 'bold' },
  time: { color: '#a0aaa2', fontSize: 12, marginVertical: 8, textAlign: 'center' },
  title: { color: '#111713', fontSize: 18, fontWeight: '800', marginLeft: 4 },
  translateLink: { color: '#20a64b', fontSize: 12, marginTop: 4 },
  unlock: { color: '#111713', flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  unlockRow: { alignItems: 'flex-start', flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10 },
  unlockX1: { color: '#20a64b' },
  // [F2] Voice-call rate label above the Phone button.
  voiceRate: { color: '#20a64b', fontSize: 11, fontWeight: 'bold' },
  voiceRateRow: { alignItems: 'center', flexDirection: 'row' },
  // [/F2]
  unreadBadge: { alignItems: 'center', backgroundColor: '#f04f4b', borderRadius: 7, height: 14, justifyContent: 'center', marginLeft: 4, minWidth: 14, paddingHorizontal: 4 },
  unreadText: { color: '#fff', fontSize: 8, fontWeight: '800', textAlign: 'center' },
});
