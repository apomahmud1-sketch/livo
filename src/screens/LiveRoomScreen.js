// Livo Live Room screen (new UI 2026-11-25, preview §3.8).
// A PUBLIC room: anyone can watch the host's live video, read the
// live chat and send gifts; the gold "1v1 Call" button starts a
// PRIVATE 1-to-1 Agora call with the host. Everything here is real:
//   • Video — the host's real Agora stream on channel
//     `livo-call-<hostId>` (audience role). While the host is not
//     in the channel yet, the honest "Waiting for the host" state
//     shows instead of a fake video.
//   • Viewers — Realtime presence (joinLiveRoom /
//     subscribeRoomViewers / subscribeRoomPresence). No count is
//     shown until presence reports one; no invented viewers.
//   • Chat — the room_messages table (fetch + Realtime insert
//     subscription). An empty room shows "No messages yet — say
//     hi!" — never scripted chat lines.
//   • Gifts — the real catalog via the shared Gift sheet; sending
//     charges real coins and credits the host (store.sendGift).
//   • Follow — the real follows table (store.toggleFollow).
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Eye, Gift, Send, Video, X } from 'lucide-react-native';
import { THEME, formatViewers } from '../config';
import { useApp } from '../store';
import { fetchMyProfile, getSessionUser } from '../supabase/auth';
import { joinLiveRoom, leaveLiveRoom, subscribeRoomPresence, subscribeRoomViewers } from '../supabase/presence';
import { fetchRoomMessages, sendRoomMessage, subscribeRoomMessages } from '../supabase/room_messages';
import { buildChannelName } from '../calls/signalling';
import LiveVideo from '../agora/LiveVideo';
import GiftSheet from '../components/GiftSheet';
import GiftAnimationOverlay, { giftAnimationUrl } from '../components/GiftAnimationOverlay';

const HEART_COLORS = ['#ff5da2', '#f43f9e', '#c084fc', '#ffd76a'];

// One floating heart: rises and fades over 2.4s, then removes itself.
function FloatingHeart({ left, color, size, onDone }) {
  const rise = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(rise, { toValue: -150, duration: 2400, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 0, duration: 2400, useNativeDriver: true }),
    ]).start(() => onDone());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.Text
      style={[styles.floatHeart, { left, color, fontSize: size, opacity: fade, transform: [{ translateY: rise }] }]}
    >
      ❤️
    </Animated.Text>
  );
}

export default function LiveRoomScreen({ route, navigation }) {
  const { host } = route.params || {};
  const { showToast, toggleFollow, following } = useApp();
  const [viewerCount, setViewerCount] = useState(null);
  const [viewerList, setViewerList] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [giftOpen, setGiftOpen] = useState(false);
  // Gift animation overlay: the gift with an uploaded animation
  // currently playing (null = none). The chat line + hearts below
  // still fire, so a load failure just leaves the existing effect.
  const [animGift, setAnimGift] = useState(null);
  const [hearts, setHearts] = useState([]);
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState('Guest');
  const chatScrollRef = useRef(null);
  const roomChannelRef = useRef(null);
  const heartsIdRef = useRef(0);

  // My identity (for presence + chat sender name): real username
  // from the profiles row, falling back to the auth metadata.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getSessionUser();
        if (!u || cancelled) return;
        setMyId(u.id);
        const { profile } = await fetchMyProfile(u.id);
        if (!cancelled && profile && profile.username) {
          setMyName(profile.username);
          return;
        }
        const meta = u.user_metadata || {};
        if (!cancelled) setMyName(meta.full_name || meta.name || u.email || 'Guest');
      } catch (e) {
        // Guest — presence + chat still work.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Presence: join this room as a viewer (counts me), watch the
  // viewer count + viewer list. Everything leaves on unmount.
  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    (async () => {
      let viewer = { id: undefined, name: 'Guest' };
      try {
        const u = await getSessionUser();
        if (u) {
          viewer = {
            id: u.id,
            name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || 'Guest',
          };
        }
      } catch (e) {
        // Anonymous viewer — presence still counts the join.
      }
      if (cancelled) return;
      roomChannelRef.current = joinLiveRoom(host.id, viewer);
    })();
    const unsubCount = subscribeRoomViewers(host.id, (count) => setViewerCount(count));
    const unsubList = subscribeRoomPresence(host.id, (entries) => setViewerList(entries));
    return () => {
      cancelled = true;
      if (roomChannelRef.current) {
        leaveLiveRoom(roomChannelRef.current);
        roomChannelRef.current = null;
      }
      if (unsubCount) unsubCount();
      if (unsubList) unsubList();
    };
  }, [host]);

  // Chat: load the recent history, then listen for new messages.
  // My own sent message is appended from the insert result; the
  // subscription dedupes by id so it never appears twice.
  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    fetchRoomMessages(host.id, 50).then((rows) => {
      if (!cancelled) setMessages(rows.map((r) => ({ ...r, kind: 'chat', me: myId ? r.senderId === myId : false })));
    });
    const unsub = subscribeRoomMessages(host.id, (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev.slice(-49), { ...msg, kind: 'chat', me: myId ? msg.senderId === myId : false }];
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [host, myId]);

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  if (!host) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>No host selected</Text>
        <TouchableOpacity style={styles.centerBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.centerBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFollowing = following.includes(String(host.id));

  const spawnHearts = () => {
    const batch = [0, 1, 2].map(() => ({
      id: ++heartsIdRef.current,
      left: 10 + Math.random() * 60,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      size: 17 + Math.random() * 6,
    }));
    setHearts((prev) => [...prev, ...batch]);
  };

  const sendChat = async () => {
    const text = input.trim();
    if (!text) return;
    if (!myId) {
      showToast('Please sign in first.');
      return;
    }
    setInput('');
    const row = await sendRoomMessage({ hostId: host.id, senderId: myId, senderName: myName, body: text });
    if (row) {
      // The Realtime subscription will also deliver it — deduped by id.
      setMessages((prev) => [...prev.slice(-49), { ...row, kind: 'chat', me: true }]);
    } else {
      showToast("Couldn't send — check your connection and try again.");
    }
  };

  const onGiftSent = (gift) => {
    // A real event that just happened: show it in this room's feed
    // as a local line (gold, like the preview) + floating hearts.
    // A gift with an uploaded animation also plays it full-screen
    // (overlay below); a load failure just leaves the line +
    // hearts — the existing effect — and never blocks anything.
    if (giftAnimationUrl(gift)) setAnimGift(gift);
    setMessages((prev) => [
      ...prev.slice(-49),
      {
        id: `local-gift-${Date.now()}`,
        senderName: 'You',
        text: `sent a ${gift.name} ${gift.emoji}`,
        kind: 'gift',
        me: true,
        created_at: new Date().toISOString(),
      },
    ]);
    spawnHearts();
  };

  const shownViewers = viewerList.slice(0, 4);
  const extraViewers = viewerList.length - shownViewers.length;

  return (
    <View style={styles.room}>
      <StatusBar style="light" />
      <LiveVideo
        channel={buildChannelName(host.id)}
        role="audience"
        style={styles.video}
        showLiveChip={false}
      />

      {/* Top row: host chip, LIVE badge, viewer count, close */}
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.hostChip}>
          {host.photo ? (
            <Image source={host.photo} style={styles.hostAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.hostAvatar, styles.hostAvatarFallback]}>
              <Text style={styles.hostAvatarLetter}>{host.name ? host.name[0].toUpperCase() : '?'}</Text>
            </View>
          )}
          <View style={styles.hostMeta}>
            <Text style={styles.hostName} numberOfLines={1}>{host.name}</Text>
            <Text style={styles.hostId}>ID: {host.userId || '—'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followBtnOn]}
            onPress={() => toggleFollow(host.id)}
            activeOpacity={0.85}
          >
            <Text style={styles.followTxt}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        {viewerCount != null ? (
          <View style={styles.viewerPill}>
            <Eye size={14} color="#fff" strokeWidth={2} />
            <Text style={styles.viewerTxt}>{formatViewers(viewerCount)}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <X size={18} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Top viewers — real presence entries only */}
      {viewerList.length > 0 ? (
        <View style={styles.viewersRow} pointerEvents="none">
          {shownViewers.map((v, i) => (
            <View key={String(v.userId) + i} style={[styles.viewerAvatar, i > 0 && styles.viewerAvatarOverlap]}>
              <Text style={styles.viewerAvatarTxt}>{(v.name || '?')[0].toUpperCase()}</Text>
            </View>
          ))}
          {extraViewers > 0 ? (
            <View style={[styles.viewerAvatar, styles.viewerMore]}>
              <Text style={styles.viewerMoreTxt}>+{extraViewers}</Text>
            </View>
          ) : null}
          <Text style={styles.viewersLabel}>Top viewers in this room</Text>
        </View>
      ) : null}

      {/* Floating hearts zone (right side) */}
      <View style={styles.heartsZone} pointerEvents="none">
        {hearts.map((h) => (
          <FloatingHeart
            key={h.id}
            left={h.left}
            color={h.color}
            size={h.size}
            onDone={() => setHearts((prev) => prev.filter((x) => x.id !== h.id))}
          />
        ))}
      </View>

      {/* Live chat feed */}
      <View style={styles.chatWrap} pointerEvents="box-none">
        <ScrollView
          ref={chatScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => chatScrollRef.current && chatScrollRef.current.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={styles.chatBubble}>
              <Text style={styles.chatText}>No messages yet — say hi! 👋</Text>
            </View>
          ) : (
            messages.slice(-7).map((m) => (
              <View key={String(m.id)} style={styles.chatBubble}>
                {m.kind === 'gift' ? (
                  <Text style={styles.chatGiftText}>
                    <Text style={styles.chatName}>{m.senderName}</Text> {m.text}
                  </Text>
                ) : (
                  <Text style={styles.chatText}>
                    <Text style={styles.chatName}>{m.senderName}</Text> {m.text}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Bottom bar: chat input, 1v1 Call, gift */}
      <View style={styles.bottomBar}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Say something..."
            placeholderTextColor="#cdbcf0"
            value={input}
            onChangeText={setInput}
            maxLength={120}
            returnKeyType="send"
            onSubmitEditing={sendChat}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendChat} activeOpacity={0.8}>
            <Send size={15} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('VideoCall', { host })}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#f7b733', '#f59e0b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.callBtn}>
            <Video size={15} color="#3d2400" strokeWidth={2.4} />
            <Text style={styles.callBtnTxt}>1v1 Call</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.giftBtn} onPress={() => setGiftOpen(true)} activeOpacity={0.85}>
          <LinearGradient colors={['#a855f7', '#7b2ff7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.giftBtnGrad}>
            <Gift size={20} color="#fff" strokeWidth={2.2} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Uploaded gift animation overlay (video/GIF, auto-dismiss;
          silent fallback to the chat line + hearts on load failure). */}
      <GiftAnimationOverlay
        gift={animGift}
        senderName="You"
        visible={!!animGift}
        onDone={() => setAnimGift(null)}
        onError={() => setAnimGift(null)}
      />

      <GiftSheet visible={giftOpen} host={host} onClose={() => setGiftOpen(false)} onSent={onGiftSent} />
    </View>
  );
}

const styles = StyleSheet.create({
  room: { backgroundColor: '#000', flex: 1 },
  video: { borderRadius: 0, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  center: { alignItems: 'center', backgroundColor: THEME.deep, flex: 1, justifyContent: 'center', padding: 24 },
  centerTitle: { color: THEME.text, fontSize: 20, fontWeight: 'bold' },
  centerBtn: { backgroundColor: THEME.violet, borderRadius: 24, marginTop: 16, paddingHorizontal: 24, paddingVertical: 12 },
  centerBtnTxt: { color: '#fff', fontWeight: 'bold' },
  // Top row.
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingTop: 48 },
  hostChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.52)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: '58%',
    paddingBottom: 4,
    paddingLeft: 4,
    paddingRight: 5,
    paddingTop: 4,
  },
  hostAvatar: { borderRadius: 16, height: 32, width: 32 },
  hostAvatarFallback: { alignItems: 'center', backgroundColor: THEME.violet, justifyContent: 'center' },
  hostAvatarLetter: { color: '#fff', fontSize: 15, fontWeight: '900' },
  hostMeta: { flexShrink: 1, marginLeft: 7, marginRight: 7 },
  hostName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  hostId: { color: '#d9ccf5', fontSize: 10.5, fontWeight: '700' },
  followBtn: { backgroundColor: THEME.pink, borderRadius: 999, minHeight: 30, paddingHorizontal: 12, paddingVertical: 6 },
  followBtnOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  followTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  liveBadge: { alignItems: 'center', backgroundColor: THEME.red, borderRadius: 6, flexDirection: 'row', gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { backgroundColor: '#fff', borderRadius: 3, height: 6, width: 6 },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  viewerPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.52)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  viewerTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  closeBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.52)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  // Top viewers row.
  viewersRow: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 14, paddingTop: 9 },
  viewerAvatar: {
    alignItems: 'center',
    backgroundColor: THEME.violet,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  viewerAvatarOverlap: { marginLeft: -7 },
  viewerAvatarTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  viewerMore: { backgroundColor: 'rgba(139,61,255,0.85)', borderColor: 'rgba(255,255,255,0.35)' },
  viewerMoreTxt: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
  viewersLabel: { color: '#e7dcff', fontSize: 11.5, fontWeight: '800', marginLeft: 8, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  // Floating hearts.
  heartsZone: { bottom: 150, height: 170, position: 'absolute', right: 0, width: 90 },
  floatHeart: { position: 'absolute', top: 150 },
  // Chat feed.
  chatWrap: { bottom: 88, left: 12, position: 'absolute', right: 78 },
  chatList: { gap: 6 },
  chatBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(10,0,20,0.52)', borderRadius: 12, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 5 },
  chatText: { color: '#f1eaff', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  chatGiftText: { color: '#ffe9a8', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  chatName: { color: THEME.gold2, fontWeight: '900' },
  // Bottom bar.
  bottomBar: { alignItems: 'center', bottom: 0, flexDirection: 'row', gap: 8, left: 0, paddingBottom: 16, paddingHorizontal: 12, paddingTop: 10, position: 'absolute', right: 0 },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.55)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 44,
    paddingLeft: 14,
    paddingRight: 5,
  },
  input: { color: '#fff', flex: 1, fontSize: 13.5, fontWeight: '600' },
  sendBtn: { alignItems: 'center', backgroundColor: THEME.violet, borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  callBtn: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 5, minHeight: 44, paddingHorizontal: 13 },
  callBtnTxt: { color: '#3d2400', fontSize: 13, fontWeight: '900' },
  giftBtn: { borderRadius: 22, height: 44, width: 44 },
  giftBtnGrad: { alignItems: 'center', borderRadius: 22, flex: 1, justifyContent: 'center' },
});
