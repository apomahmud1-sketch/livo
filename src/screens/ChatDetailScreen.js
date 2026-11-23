// Livo ChatDetailScreen — v3 (2026-11-21)
// Restyled to the v0 Home design (~/workspace/v0-design/SPEC.md):
// mint #f0fdf4 background, white profile card with soft shadow,
// green #20a64b Follow button and Send button, white incoming
// bubbles / light-green #dcfce7 outgoing bubbles, lucide icons
// everywhere (no emoji).
//
// ── BEHAVIOUR (from the preview) ───────────────────────────────────
// Messages are real: sent into the messages table and delivered
// live via a Realtime subscription — there is no canned auto-reply.
// Follow toggles locally. The fake "unlock x1 ticket" line is gone
// (no ticket is spent, no payment happens for chatting). Photos are
// coloured initial tiles: the app has no host photos for these demo
// chats yet.
// ── FOLLOW-UP (done 2026-11-23) ──────────────────────────────────
// The Free video button starts a real free call (VideoCall with
// freeCall: true — no balance gate, no charge). The gift button
// opens a real gift picker (gifts from the store) and sends for
// real, recording the gift as a message. Emoji / image / report
// buttons are gone — there is no backend for them and no
// toast-only button may remain.

// ── F4 (2026-11-19) ───────────────────────────────────────────────
// Chat auto-translation: a toggle (🌐 button below, or "Translation
// settings" under the first message) translates incoming messages via
// the free MyMemory API — see src/utils/translate.js. Translated text
// is the main line, the original stays underneath in small text, and
// tapping the bubble swaps them. If translation fails, the original
// is shown unchanged. All F4 code is wrapped in // [F4] markers.

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  MapPin,
  Phone,
  Video,
} from 'lucide-react-native';
import { COLORS } from '../config'; // [F2] getVoiceCallRate added
import { useApp } from '../store';
// [F4] Auto-translation helper + the SIGNED-IN user's profile
// language (fetchMyProfile, 'English' -> 'en'; falls back to 'en').
import { resolveTargetLanguage, translateText } from '../utils/translate';
import { fetchMyProfile } from '../supabase/auth';
// [Live] Real chat over the messages table (no canned replies).
import {
  fetchConversation,
  getCurrentUserId,
  markConversationRead,
  resolveRecipientProfileId,
  sendMessage,
  subscribeToConversation,
} from '../supabase/chat';
// [/F4]

// Clock time of a message ("20:41") for the first-message stamp.
function formatClock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
  const { showToast, following, toggleFollow, hosts, getLiveVoiceCallRate, gifts, sendGift, refreshUnreadTotal } = useApp(); // [F2] hosts added
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

  // Free video call: a real call with freeCall: true (the call
  // screen honours it — no balance gate, no charge). Only for a
  // live host; otherwise an honest reason, not a fake start.
  const startFreeVideo = () => {
    if (!chatHost) {
      showToast('Free video call is only available with a live host');
      return;
    }
    if (!chatHost.online) {
      showToast(`${chatHost.name} এখন অফলাইন`);
      return;
    }
    navigation.navigate('VideoCall', { host: chatHost, freeCall: true });
  };

  // Real gift picker state. Sending a gift deducts real coins via
  // the store and records the gift as a real message row.
  const [giftPickerVisible, setGiftPickerVisible] = useState(false);
  const [sendingGift, setSendingGift] = useState(false);

  const sendGiftFromPicker = async (gift) => {
    if (sendingGift || !meId || !otherId) return;
    setSendingGift(true);
    const ok = sendGift(gift, chatHost || null);
    if (!ok) {
      // Store already toasted the reason (not signed in / not
      // enough coins) — keep the picker open.
      setSendingGift(false);
      return;
    }
    const saved = await sendMessage({
      senderId: meId,
      recipientId: otherId,
      body: `🎁 Sent ${gift.name}`,
    });
    setSendingGift(false);
    setGiftPickerVisible(false);
    if (saved) {
      setMsgs((m) => [...m, saved]);
      if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
    }
  };
  const [text, setText] = useState('');
  const [localFollowing, setLocalFollowing] = useState(
    profile && profile.storeId ? following.includes(profile.storeId) : false,
  );
  // [Live] Real conversation from the messages table — no seeded
  // demo message, no canned replies. `meId` is the signed-in user;
  // null + authChecked means "no session — prompt login".
  const [msgs, setMsgs] = useState([]);
  const [meId, setMeId] = useState(null);
  const [otherId, setOtherId] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Load history (newest 30) + subscribe to new messages in this
  // conversation. Runs once per chat open.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    (async () => {
      const uid = await getCurrentUserId();
      if (cancelled) return;
      setMeId(uid);
      setAuthChecked(true);
      if (!uid) {
        setLoadingHistory(false);
        return;
      }
      const oid = await resolveRecipientProfileId(profile);
      if (cancelled) return;
      setOtherId(oid);
      if (!oid) {
        setLoadingHistory(false);
        return;
      }
      const page = await fetchConversation({ meId: uid, otherId: oid, limit: 30 });
      if (cancelled) return;
      setMsgs(page);
      setHasMore(page.length === 30);
      setLoadingHistory(false);
      // Opening the chat marks it read (real read receipts).
      markConversationRead(uid, oid);
      if (typeof refreshUnreadTotal === 'function') refreshUnreadTotal();
      unsubscribe = subscribeToConversation({
        meId: uid,
        otherId: oid,
        onMessage: (m) => {
          setMsgs((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          if (!m.me) {
            markConversationRead(uid, oid);
            if (typeof refreshUnreadTotal === 'function') refreshUnreadTotal();
          }
        },
      });
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the next older page (30) before the oldest loaded message.
  const loadEarlier = async () => {
    if (!meId || !otherId || msgs.length === 0 || loadingMore) return;
    setLoadingMore(true);
    const page = await fetchConversation({
      meId,
      otherId,
      limit: 30,
      before: msgs[0].created_at,
    });
    setMsgs((prev) => [...page, ...prev]);
    setHasMore(page.length === 30);
    setLoadingMore(false);
  };
  // [/Live]

  // [F4] Auto-translation state.
  // Target language: the SIGNED-IN user's profiles.language
  // (fetchMyProfile), 'English' by default. Never the static
  // preview PROFILE — that is demo data, not the user's language.
  const [myLanguage, setMyLanguage] = useState(null);
  useEffect(() => {
    if (!meId) return undefined;
    let cancelled = false;
    fetchMyProfile(meId).then(({ profile: mine }) => {
      if (!cancelled && mine && mine.language) setMyLanguage(mine.language);
    });
    return () => {
      cancelled = true;
    };
  }, [meId]);
  const targetLangLabel = myLanguage || 'English';
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

  // [Live] No Supabase session — prompt login instead of showing
  // fake messages. (The Login screen still needs real Google
  // sign-in wired to Supabase Auth — see the build report.)
  if (authChecked && !meId) {
    return (
      <View style={[styles.bg, styles.promptWrap]}>
        <Text style={styles.promptText}>Please sign in to chat.</Text>
        <TouchableOpacity style={styles.promptBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.promptBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // [Live] The other person has no real account (no profiles.id to
  // send to) — e.g. an old demo-only chat. Nothing fake is shown.
  if (authChecked && meId && !otherId && !loadingHistory) {
    return (
      <View style={[styles.bg, styles.promptWrap]}>
        <Text style={styles.promptText}>{profile.name} has no real account yet — chat is not available.</Text>
        <TouchableOpacity style={styles.promptBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.promptBtnText}>Go back</Text>
        </TouchableOpacity>
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

  // [Live] Real send: insert into the messages table. The
  // Realtime subscription above delivers the other person's
  // replies — no canned auto-reply. On failure the text is put
  // back in the composer so nothing is silently lost.
  const send = async () => {
    const txt = text.trim();
    if (!txt || !meId || !otherId || sending) return;
    setText('');
    setSending(true);
    const saved = await sendMessage({ senderId: meId, recipientId: otherId, body: txt });
    setSending(false);
    if (!saved) {
      setText(txt);
      showToast('Message could not be sent — please try again');
      return;
    }
    setMsgs((m) => [...m, saved]);
    if (scrollRef.current) scrollRef.current.scrollToEnd({ animated: true });
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
            {profile.age != null && profile.age !== '' ? (
              <Text style={styles.meta}>{profile.age}</Text>
            ) : null}
            {/* "Real" only when a real profiles row backs the peer
                (otherId resolved) — never a static badge. */}
            {otherId ? (
              <View style={styles.metaItem}>
                <Check size={13} color="#20a64b" strokeWidth={3} />
                <Text style={styles.meta}> Real</Text>
              </View>
            ) : null}
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

        {/* Real first-message time — omitted when there are no
            messages yet. Never a hardcoded clock time. */}
        {msgs.length > 0 ? (
          <Text style={styles.time}>{formatClock(msgs[0].created_at)}</Text>
        ) : null}

        {/* Messages */}
        {loadingHistory ? (
          <ActivityIndicator color="#20a64b" style={{ marginTop: 32 }} />
        ) : msgs.length === 0 ? (
          <Text style={styles.empty}>No messages yet — say hi!</Text>
        ) : (
          <View>
            {hasMore ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadEarlier} disabled={loadingMore}>
                <Text style={styles.loadMoreText}>{loadingMore ? 'Loading…' : 'Load earlier messages'}</Text>
              </TouchableOpacity>
            ) : null}
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
              </View>
            </View>
          ),
            )}
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={styles.inputBar}>
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
          onPress={startFreeVideo}
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
        <TouchableOpacity style={styles.act} onPress={() => setGiftPickerVisible(true)}>
          <Gift size={26} color="#9aa39c" />
        </TouchableOpacity>
      </View>

      {/* Real gift picker — gifts from the store; tapping one sends
          it for real (coins deducted, host credited) and records
          the gift as a message row. */}
      <Modal
        visible={giftPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setGiftPickerVisible(false)}
      >
        <View style={styles.giftBackdrop}>
          <View style={styles.giftSheet}>
            <View style={styles.giftHeader}>
              <Text style={styles.giftTitle}>Send a gift</Text>
              <TouchableOpacity onPress={() => setGiftPickerVisible(false)}>
                <Text style={styles.giftClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {!gifts || gifts.length === 0 ? (
              <Text style={styles.empty}>No gifts available right now.</Text>
            ) : (
              gifts.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={styles.giftRow}
                  onPress={() => sendGiftFromPicker(g)}
                  disabled={sendingGift}
                >
                  <Text style={styles.giftEmoji}>{g.emoji}</Text>
                  <Text style={styles.giftName}>{g.name}</Text>
                  <Text style={styles.giftPrice}>{g.price} coins</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </Modal>
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
  loadMoreBtn: { alignSelf: 'center', backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 16, borderWidth: 1, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 7 },
  loadMoreText: { color: '#20a64b', fontSize: 13, fontWeight: 'bold' },
  // [Live] Sign-in prompt (shown instead of fake messages).
  promptBtn: { backgroundColor: '#20a64b', borderRadius: 18, marginTop: 16, paddingHorizontal: 20, paddingVertical: 10 },
  promptBtnText: { color: '#fff', fontWeight: 'bold' },
  promptText: { color: '#111713', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  promptWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
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
  // [F2] Voice-call rate label above the Phone button.
  voiceRate: { color: '#20a64b', fontSize: 11, fontWeight: 'bold' },
  voiceRateRow: { alignItems: 'center', flexDirection: 'row' },
  // [/F2]
  // Real gift picker (bottom sheet).
  giftBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  giftSheet: { backgroundColor: '#f0fdf4', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 24, paddingHorizontal: 16, paddingTop: 12 },
  giftHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  giftTitle: { color: '#111713', fontSize: 18, fontWeight: 'bold' },
  giftClose: { color: '#111713', fontSize: 18, fontWeight: '700' },
  giftRow: { alignItems: 'center', borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingVertical: 12 },
  giftEmoji: { fontSize: 22, marginRight: 12 },
  giftName: { color: '#111713', flex: 1, fontSize: 15, fontWeight: '600' },
  giftPrice: { color: '#20a64b', fontSize: 13, fontWeight: 'bold' },
  unreadBadge: { alignItems: 'center', backgroundColor: '#f04f4b', borderRadius: 7, height: 14, justifyContent: 'center', marginLeft: 4, minWidth: 14, paddingHorizontal: 4 },
  unreadText: { color: '#fff', fontSize: 8, fontWeight: '800', textAlign: 'center' },
});
