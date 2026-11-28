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
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Crown, Eye, Gift, Heart, Phone, Video, X } from 'lucide-react-native';
import { THEME, formatViewers } from '../config';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
import { isRoomBlocked } from '../supabase/host';
import { fetchMyProfile, getSessionUser } from '../supabase/auth';
import { joinLiveRoom, leaveLiveRoom, subscribeRoomPresence, subscribeRoomViewers } from '../supabase/presence';
import { fetchRoomMessages, sendRoomMessage, subscribeRoomMessages } from '../supabase/room_messages';
// Multi-guest (co-anchor): a viewer asks to join the live; the host
// agrees in the Multi-guest Management panel and the guest switches
// to broadcaster in the same Agora channel (see agoraUidForUser).
import {
  endGuestRequest,
  requestGuestJoin,
  subscribeMyGuestRequest,
} from '../supabase/guest_requests';
import LiveVideo, { agoraUidForUser } from '../agora/LiveVideo';
import GiftSheet from '../components/GiftSheet';
import DailyGiftRank from '../components/DailyGiftRank';
// Report a host to the Mother Panel (see ReportSheet): a viewer
// watching this live room can report the host — the report lands
// in the public.reports table for the owner to review.
import ReportSheet from '../components/ReportSheet';
import GiftAnimationOverlay, { giftAnimationUrl } from '../components/GiftAnimationOverlay';

const HEART_COLORS = ['#ff5da2', '#f43f9e', '#c084fc', '#ffd76a'];

// Live duration, HH:MM:SS like the reference room (00:45:32).
function formatLiveDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

// Stable avatar colour per sender (chat bubbles).
const AVATAR_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#fbbf24', '#34d399', '#fb7185'];
function avatarColorFor(key) {
  const s = String(key || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

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
  // Report sheet: a viewer can report the host of this room.
  const [reportOpen, setReportOpen] = useState(false);
  // Gift animation overlay: the gift with an uploaded animation
  // currently playing (null = none). The chat line + hearts below
  // still fire, so a load failure just leaves the existing effect.
  const [animGift, setAnimGift] = useState(null);
  const [hearts, setHearts] = useState([]);
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState('Guest');
  const [myDisplayId, setMyDisplayId] = useState(null);
  // Like: local in-room effect only (no likes table exists) — a tap
  // bursts floating hearts and bumps the counter shown by the button.
  const [likeCount, setLikeCount] = useState(0);
  // Photo-layout live room (2026-11-28): the host chip shows the
  // real VIP level (vip1/2/3 → VIP 1/2/3) and the pink ✓ only when
  // the host is video-verified. The LIVE timer counts from the
  // host's live_started_at (stamped when they go live).
  const [liveStartedAt, setLiveStartedAt] = useState(host ? host.liveStartedAt || null : null);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [chatDisabled, setChatDisabled] = useState(host ? host.chatDisabled === true : false);
  const [hostVip, setHostVip] = useState(host ? host.vipLevel || null : null);
  const [hostVerified, setHostVerified] = useState(host ? host.verified === true : false);
  const [joinNotice, setJoinNotice] = useState(null);
  const [hostSheetOpen, setHostSheetOpen] = useState(false);
  // Host chip self-heal (2026-11-28): the route host object can
  // carry a stale "Host u-..." name and no 8-digit ID when the
  // live.js profile lookup missed — fetch the host's profile
  // directly (see the effect below) and use it for the chip.
  const [chipName, setChipName] = useState(null);
  const [chipUserId, setChipUserId] = useState(null);
  const [chipPhoto, setChipPhoto] = useState(null);
  // Daily gift rank modal (left-side 🏆 Rank pill).
  const [rankOpen, setRankOpen] = useState(false);
  // Multi-guest (co-anchor): 'none' | 'pending' | 'approved' |
  // 'declined'. isCoGuest = approved and currently broadcasting.
  const [guestStatus, setGuestStatus] = useState('none');
  const [guestRequestId, setGuestRequestId] = useState(null);
  const [isCoGuest, setIsCoGuest] = useState(false);
  // Audience Management panel (viewer list).
  const [audienceOpen, setAudienceOpen] = useState(false);
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
          if (profile.user_id) setMyDisplayId(profile.user_id);
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

  // Host chip self-heal: when the route host object has no
  // 8-digit ID or a "Host u-..." fallback name, fetch the host's
  // profile directly (2026-11-28 — the 8-digit ID must show in
  // every room, everywhere). Runs once per host.
  useEffect(() => {
    if (!host || (host.userId && !String(host.name || '').startsWith('Host '))) return undefined;
    if (!host.profileId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username,user_id,avatar_url')
          .eq('id', host.profileId)
          .maybeSingle();
        if (cancelled || error || !data) return;
        if (data.username) setChipName(String(data.username));
        if (data.user_id) setChipUserId(String(data.user_id));
        if (data.avatar_url) setChipPhoto({ uri: String(data.avatar_url) });
      } catch (e) { /* keep the mapped values */ }
    })();
    return () => { cancelled = true; };
  }, [host]);

  // Live timer: ticks from the host's real live start.
  useEffect(() => {
    if (!liveStartedAt) return undefined;
    const tick = () => setLiveSeconds(Math.max(0, Math.floor((Date.now() - new Date(liveStartedAt).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [liveStartedAt]);

  // Room state refresh: the host's live start, chat on/off, VIP and
  // verified badge can change mid-room — poll the hosts + profiles
  // rows every 10s. A failed poll keeps the last known state.
  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const h = await supabase.from('hosts').select('live_started_at,live_chat_disabled,verification_status').eq('host_id', String(host.id)).maybeSingle();
        if (!cancelled && h && !h.error && h.data) {
          if (h.data.live_started_at) setLiveStartedAt(h.data.live_started_at);
          setChatDisabled(h.data.live_chat_disabled === true);
          setHostVerified(String(h.data.verification_status || '').toLowerCase() === 'verified');
        }
        if (host.profileId) {
          const p = await supabase.from('profiles').select('vip_level').eq('id', host.profileId).maybeSingle();
          if (!cancelled && p && !p.error && p.data) {
            const m = /^vip(\d+)$/.exec(String(p.data.vip_level || '').toLowerCase());
            setHostVip(m ? Number(m[1]) : null);
          }
        }
      } catch (e) { /* keep last known state */ }
    };
    refresh();
    const t = setInterval(refresh, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [host]);

  // Blocked from this room? Leave at once (room_blocks).
  useEffect(() => {
    if (!host || !myId) return undefined;
    let cancelled = false;
    isRoomBlocked(host.id, myId).then((blocked) => {
      if (!cancelled && blocked) {
        showToast('You are blocked from this room.');
        navigation.goBack();
      }
    });
    return () => { cancelled = true; };
  }, [host, myId]);

  // "X joined the room" pill when a new viewer appears in presence.
  const prevViewerIdsRef = useRef(new Set());
  const joinTimerRef = useRef(null);
  useEffect(() => {
    const prev = prevViewerIdsRef.current;
    const fresh = viewerList.filter((v) => v.userId && !prev.has(String(v.userId)) && String(v.userId) !== String(myId));
    if (fresh.length > 0) {
      const last = fresh[fresh.length - 1];
      setJoinNotice(`${last.name || 'Someone'} joined the room`);
      if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
      joinTimerRef.current = setTimeout(() => setJoinNotice(null), 5000);
    }
    prevViewerIdsRef.current = new Set(viewerList.map((v) => String(v.userId)));
  }, [viewerList, myId]);

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
    if (chatDisabled) {
      showToast('Chat is disabled by the host.');
      return;
    }
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

  // ── Multi-guest (co-anchor) ─────────────────────────────────
  // Ask the host to join this live as a co-guest. The host agrees
  // in the Multi-guest Management panel; the subscription below
  // then flips this viewer to broadcaster (same Agora channel).
  const requestJoin = async () => {
    if (!myId) {
      showToast('Please sign in first.');
      return;
    }
    if (guestStatus !== 'none' && guestStatus !== 'declined') return;
    const row = await requestGuestJoin({
      hostId: host.id,
      guestId: myId,
      guestName: myName,
      guestDisplayId: myDisplayId,
    });
    if (row) {
      setGuestRequestId(row.id);
      setGuestStatus('pending');
      showToast('Request sent — waiting for the host.');
    } else {
      showToast("Couldn't send the request — check your connection and try again.");
    }
  };

  // Leave the co-guest state (the host may also end it — the
  // subscription below then flips this viewer back to audience).
  const endCoGuest = async () => {
    if (guestRequestId) {
      endGuestRequest(guestRequestId).catch(() => {});
    }
    setIsCoGuest(false);
    setGuestStatus('none');
    setGuestRequestId(null);
  };

  // Watch my own request row: the host's Agree flips me to
  // broadcaster, Decline sends me back, Ended (host removed me)
  // drops me back to audience.
  useEffect(() => {
    if (!guestRequestId) return undefined;
    const unsub = subscribeMyGuestRequest(guestRequestId, (row) => {
      if (row.status === 'approved') {
        setGuestStatus('approved');
        setIsCoGuest(true);
        showToast("You're live as co-guest!");
      } else if (row.status === 'declined') {
        setIsCoGuest(false);
        setGuestStatus('declined');
        showToast('The host declined your request.');
      } else if (row.status === 'ended') {
        setIsCoGuest(false);
        setGuestStatus('none');
        setGuestRequestId(null);
      }
    });
    return unsub;
  }, [guestRequestId]);

  // Leaving the room while co-guest ends the request (best-effort)
  // so the host's panel does not keep showing a gone guest.
  const coGuestRef = useRef({ isCoGuest, guestRequestId });
  coGuestRef.current = { isCoGuest, guestRequestId };
  useEffect(() => () => {
    const cur = coGuestRef.current;
    if (cur.isCoGuest && cur.guestRequestId) {
      endGuestRequest(cur.guestRequestId).catch(() => {});
    }
  }, []);

  const onGiftSent = (gift) => {
    // A real event that just happened: show it in this room's feed
    // as a local line (gold, like the preview) + the uploaded
    // animation full-screen when the gift has one. Hearts stay
    // tap-only (empty-screen tap or the Like button) — a gift does
    // not burst hearts (2026-11-28).
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
  };

  return (
    <View style={styles.room}>
      <StatusBar style="light" />
      <LiveVideo
        channel={buildChannelName(host.id)}
        // Co-guest: an approved guest joins as a broadcaster with
        // their deterministic uid (the host matches it to the
        // approved request). Role change re-runs the join effect —
        // the guest leaves as audience and re-joins as broadcaster
        // with a publisher token. Everyone else stays audience.
        role={isCoGuest ? 'host' : 'audience'}
        uid={isCoGuest && myId ? agoraUidForUser(myId) : 0}
        style={styles.video}
        showLiveChip={false}
      />

      {/* Tap the empty video area → floating hearts (right side).
          This layer sits UNDER every button/pill, so taps on the
          controls still hit the controls, never the hearts. */}
      <Pressable style={styles.tapLayer} onPress={spawnHearts} />

      {/* Top row, exactly like the photo: host chip (avatar + crown,
          name + verified check, ID, VIP badge, Follow pill) on the
          left; viewer count + X on the right. No HAPA text anywhere. */}
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.hostChip}>
          <TouchableOpacity style={styles.hostChipMain} onPress={() => setHostSheetOpen(true)} activeOpacity={0.85}>
            <View style={styles.hostAvatarWrap}>
              {(chipPhoto || host.photo) ? (
                <Image source={chipPhoto || host.photo} style={styles.hostAvatar} resizeMode="cover" />
              ) : (
                <View style={[styles.hostAvatar, styles.hostAvatarFallback]}>
                  <Text style={styles.hostAvatarLetter}>{(chipName || host.name) ? (chipName || host.name)[0].toUpperCase() : '?'}</Text>
                </View>
              )}
              <Text style={styles.hostCrown}>👑</Text>
            </View>
            <View style={styles.hostMeta}>
              <Text style={styles.hostName} numberOfLines={1}>
                {chipName || host.name}
                {hostVerified ? <Text style={styles.verifiedCheck}> ✓</Text> : null}
              </Text>
              <Text style={styles.hostId}>ID: {chipUserId || host.userId || '—'}</Text>
              {hostVip ? (
                <View style={styles.vipBadge}>
                  <Text style={styles.vipBadgeTxt}>👑 VIP {hostVip}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.followBtn, isFollowing && styles.followBtnOn]}
            onPress={() => toggleFollow(host.id)}
            activeOpacity={0.85}
          >
            <Text style={styles.followTxt}>{isFollowing ? 'Following' : '+ Follow'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }} />
        {/* Viewer count box, top right — always visible (0 when
            nobody is in the room yet), never hidden. Tap opens
            Audience Management. */}
        <TouchableOpacity style={styles.viewerPill} onPress={() => setAudienceOpen(true)} activeOpacity={0.8}>
          <Eye size={14} color="#fff" strokeWidth={2} />
          <Text style={styles.viewerTxt}>{formatViewers(viewerCount ?? viewerList.length)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <X size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* LIVE badge + live duration, under the host chip (photo). */}
      <View style={styles.liveRow} pointerEvents="box-none">
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        {liveStartedAt ? (
          <View style={styles.timerPill}>
            <Text style={styles.timerTxt}>{formatLiveDuration(liveSeconds)}</Text>
          </View>
        ) : null}
      </View>

      {/* Daily gift rank (left side): tap → today's top gift
          senders list. */}
      <TouchableOpacity style={styles.rankPill} onPress={() => setRankOpen(true)} activeOpacity={0.85}>
        <Text style={styles.rankTxt}>🏆 Rank</Text>
      </TouchableOpacity>

      {/* Co-guest banner: approved guests see they are live */}
      {isCoGuest ? (
        <View style={styles.coGuestBanner} pointerEvents="box-none">
          <Text style={styles.coGuestBannerTxt}>🎥 You're live as co-guest</Text>
          <TouchableOpacity style={styles.coGuestEndBtn} onPress={endCoGuest} activeOpacity={0.85}>
            <Text style={styles.coGuestEndTxt}>End</Text>
          </TouchableOpacity>
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

      {/* Live chat feed — photo style: avatar + name line + message
          line per bubble, newest at the bottom. */}
      <View style={styles.chatWrap} pointerEvents="box-none">
        {joinNotice ? (
          <View style={styles.joinPill}>
            <Text style={styles.joinPillTxt}>👤 {joinNotice}</Text>
          </View>
        ) : null}
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
            messages.slice(-5).map((m) => (
              <View key={String(m.id)} style={styles.chatRow}>
                <View style={[styles.chatAvatar, { backgroundColor: avatarColorFor(m.senderId || m.senderName) }]}>
                  <Text style={styles.chatAvatarTxt}>{(m.senderName || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={styles.chatBubble}>
                  {m.kind === 'gift' ? (
                    <Text style={styles.chatGiftText}>
                      <Text style={styles.chatName}>{m.senderName}</Text>
                      {'\n'}
                      {m.text}
                    </Text>
                  ) : (
                    <Text style={styles.chatText}>
                      <Text style={styles.chatName}>{m.senderName}</Text>
                      {'\n'}
                      {m.text}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Bottom bar (viewer, photo layout): comment box + Like +
          Gift + Follow + Call. No Share below (2026-11-28) — the
          Call button sends a 1v1 video call to the host; when the
          host accepts, the live room closes and the call starts. */}
      <View style={styles.bottomBar}>
        <View style={[styles.inputWrap, chatDisabled && styles.inputWrapDisabled]}>
          <TextInput
            style={styles.input}
            placeholder={chatDisabled ? 'Chat is disabled by the host' : 'Say something...'}
            placeholderTextColor="#cdbcf0"
            value={input}
            onChangeText={setInput}
            maxLength={120}
            returnKeyType="send"
            onSubmitEditing={sendChat}
            editable={!chatDisabled}
          />
          <TouchableOpacity style={styles.smileBtn} onPress={() => setInput((t) => `${t}😊`)} activeOpacity={0.8}>
            <Text style={styles.smileTxt}>😊</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.bottomBtnWrap}>
          <TouchableOpacity
            style={styles.bottomBtn}
            onPress={() => {
              spawnHearts();
              setLikeCount((c) => c + 1);
            }}
            activeOpacity={0.8}
          >
            <Heart size={22} color="#ff5da2" strokeWidth={2.2} fill="#ff5da2" />
            {likeCount > 0 ? (
              <View style={styles.likeBadge}>
                <Text style={styles.likeBadgeTxt}>{likeCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <Text style={styles.bottomBtnLabel}>Like</Text>
        </View>
        <View style={styles.bottomBtnWrap}>
          <TouchableOpacity style={styles.bottomBtnGift} onPress={() => setGiftOpen(true)} activeOpacity={0.85}>
            <Gift size={22} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
          <Text style={styles.bottomBtnLabel}>Gift</Text>
        </View>
        <View style={styles.bottomBtnWrap}>
          <TouchableOpacity
            style={[styles.bottomBtn, isFollowing && styles.bottomBtnOn]}
            onPress={() => toggleFollow(host.id)}
            activeOpacity={0.85}
          >
            <Crown size={22} color="#f7b733" strokeWidth={2.2} fill={isFollowing ? '#f7b733' : 'transparent'} />
          </TouchableOpacity>
          <Text style={styles.bottomBtnLabel}>{isFollowing ? 'Following' : 'Follow'}</Text>
        </View>
        <View style={styles.bottomBtnWrap}>
          <TouchableOpacity
            style={[styles.bottomBtn, styles.bottomBtnCall]}
            onPress={() => navigation.navigate('VideoCall', { host })}
            activeOpacity={0.85}
          >
            <Phone size={22} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
          <Text style={styles.bottomBtnLabel}>Call</Text>
        </View>
      </View>

      {/* Audience Management: real viewers in this room (presence) */}
      <Modal visible={audienceOpen} transparent animationType="slide" onRequestClose={() => setAudienceOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>👥 Audience ({viewerList.length})</Text>
              <TouchableOpacity onPress={() => setAudienceOpen(false)} activeOpacity={0.8}>
                <X size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            {viewerList.length === 0 ? (
              <Text style={styles.modalEmpty}>No viewers in this room yet.</Text>
            ) : (
              <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                {viewerList.map((v, i) => (
                  <View key={String(v.userId) + i} style={styles.modalRow}>
                    <View style={styles.modalAvatar}>
                      <Text style={styles.modalAvatarTxt}>{(v.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.modalName} numberOfLines={1}>{v.name || 'Guest'}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Uploaded gift animation overlay (video/GIF, auto-dismiss;
          silent fallback to the chat line + hearts on load failure). */}
      <GiftAnimationOverlay
        gift={animGift}
        senderName="You"
        visible={!!animGift}
        onDone={() => setAnimGift(null)}
        onError={() => setAnimGift(null)}
      />

      {/* Host sheet: tap the host chip — profile, Follow, 1v1 Call,
          Join live (co-guest) and Report. */}
      <Modal visible={hostSheetOpen} transparent animationType="slide" onRequestClose={() => setHostSheetOpen(false)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{chipName || host.name}</Text>
              <TouchableOpacity onPress={() => setHostSheetOpen(false)} activeOpacity={0.8}>
                <X size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetProfile}>
              {host.photo ? (
                <Image source={host.photo} style={styles.sheetAvatar} resizeMode="cover" />
              ) : (
                <View style={[styles.sheetAvatar, styles.hostAvatarFallback]}>
                  <Text style={styles.sheetAvatarLetter}>{host.name ? host.name[0].toUpperCase() : '?'}</Text>
                </View>
              )}
              <Text style={styles.sheetId}>ID: {chipUserId || host.userId || '—'}</Text>
              {hostVip ? (
                <View style={styles.vipBadge}>
                  <Text style={styles.vipBadgeTxt}>👑 VIP {hostVip}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.sheetFollowBtn, isFollowing && styles.followBtnOn]}
              onPress={() => toggleFollow(host.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.followTxt}>{isFollowing ? 'Following' : '+ Follow'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setHostSheetOpen(false);
                navigation.navigate('VideoCall', { host });
              }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#f7b733', '#f59e0b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sheetCallBtn}>
                <Video size={16} color="#3d2400" strokeWidth={2.4} />
                <Text style={styles.sheetCallTxt}>1v1 Call</Text>
              </LinearGradient>
            </TouchableOpacity>
            {isCoGuest ? (
              <TouchableOpacity style={[styles.sheetJoinBtn, styles.sheetJoinBtnRed]} onPress={endCoGuest} activeOpacity={0.85}>
                <Text style={styles.sheetJoinTxt}>End co-guest</Text>
              </TouchableOpacity>
            ) : guestStatus === 'pending' ? (
              <View style={[styles.sheetJoinBtn, styles.sheetJoinBtnDim]}>
                <Text style={styles.sheetJoinTxt}>Request sent…</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.sheetJoinBtn} onPress={requestJoin} activeOpacity={0.85}>
                <Text style={styles.sheetJoinTxt}>{guestStatus === 'declined' ? 'Request again to join live' : '🎥 Join live as co-guest'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.sheetReportBtn}
              onPress={() => {
                setHostSheetOpen(false);
                setReportOpen(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.sheetReportTxt}>⚑ Report this host</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <GiftSheet visible={giftOpen} host={host} onClose={() => setGiftOpen(false)} onSent={onGiftSent} />

      <DailyGiftRank visible={rankOpen} hostProfileId={host.profileId} hostName={chipName || host.name} onClose={() => setRankOpen(false)} />

      {/* Report sheet: a viewer reports this host to the owner. */}
      <ReportSheet visible={reportOpen} host={host} onClose={() => setReportOpen(false)} />
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
  // Tap layer for floating hearts: full-screen, under all UI.
  tapLayer: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  // Top row.
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingTop: 48 },
  hostChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.52)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    maxWidth: '70%',
    paddingBottom: 4,
    paddingLeft: 4,
    paddingRight: 5,
    paddingTop: 4,
  },
  hostChipMain: { alignItems: 'center', flexDirection: 'row', flexShrink: 1 },
  hostAvatarWrap: { position: 'relative' },
  hostAvatar: { borderRadius: 20, height: 40, width: 40 },
  hostCrown: { fontSize: 16, position: 'absolute', right: -6, top: -10 },
  hostAvatarFallback: { alignItems: 'center', backgroundColor: THEME.violet, justifyContent: 'center' },
  hostAvatarLetter: { color: '#fff', fontSize: 17, fontWeight: '900' },
  hostMeta: { flexShrink: 1, marginLeft: 8, marginRight: 8 },
  hostName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  verifiedCheck: { color: '#ff5da2', fontSize: 14, fontWeight: '900' },
  hostId: { color: '#d9ccf5', fontSize: 11, fontWeight: '700', marginTop: 1 },
  vipBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f7b733',
    borderRadius: 999,
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  vipBadgeTxt: { color: '#3d2400', fontSize: 10.5, fontWeight: '900' },
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
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  // LIVE + timer row under the host chip (photo).
  liveRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  // Daily gift rank pill (left side, under the LIVE row).
  rankPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(10,0,20,0.52)', borderColor: 'rgba(255,255,255,0.16)', borderRadius: 999, borderWidth: 1, marginLeft: 12, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6 },
  rankTxt: { color: '#ffe9a8', fontSize: 12, fontWeight: '900' },
  timerPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.52)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timerTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  // Top viewers row (avatars, inside the second row).
  viewersRow: { alignItems: 'center', flexDirection: 'row' },
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
  // Second row: top viewers (left) + Quit Room / Report (right).
  subRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 9 },
  pillBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.52)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  quitBtn: { backgroundColor: 'rgba(239,43,60,0.55)' },
  // Co-guest banner (approved guest is live).
  coGuestBanner: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(124,58,237,0.85)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  coGuestBannerTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
  coGuestEndBtn: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  coGuestEndTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  // Right-side actions: Join live + Like (hearts rise from here).
  sideActions: { alignItems: 'center', bottom: 150, gap: 12, position: 'absolute', right: 12 },
  sideBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.6)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  sideBtnDim: { backgroundColor: 'rgba(10,0,20,0.35)' },
  sideBtnRed: { backgroundColor: 'rgba(239,43,60,0.7)' },
  sideBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  likeBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.6)',
    borderColor: 'rgba(255,93,162,0.5)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  likeCountTxt: { color: '#ff8fc0', fontSize: 11, fontWeight: '900', marginTop: 1 },
  // Audience Management modal.
  modalShade: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1c0b33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    width: '100%',
  },
  modalHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modalEmpty: { color: '#cdbcf0', fontSize: 13, paddingVertical: 12, textAlign: 'center' },
  modalList: { flexGrow: 0 },
  modalRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 8 },
  modalAvatar: { alignItems: 'center', backgroundColor: THEME.violet, borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  modalAvatarTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modalName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Floating hearts (tap-only: empty-screen tap or Like button).
  heartsZone: { bottom: 110, height: 220, position: 'absolute', right: 0, width: 90 },
  floatHeart: { position: 'absolute', top: 200 },
  // Chat feed (bottom-left; right edge clears the hearts column).
  chatWrap: { bottom: 104, left: 12, position: 'absolute', right: 96 },
  chatList: { gap: 6 },
  joinPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124,58,237,0.75)',
    borderRadius: 999,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  joinPillTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chatRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 6 },
  chatAvatar: { alignItems: 'center', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  chatAvatarTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },
  chatBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(10,0,20,0.52)', borderRadius: 12, flexShrink: 1, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 5 },
  chatText: { color: '#f1eaff', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  chatGiftText: { color: '#ffe9a8', fontSize: 12.5, fontWeight: '600', lineHeight: 17 },
  chatName: { color: THEME.gold2, fontWeight: '900' },
  // Bottom bar.
  bottomBar: { alignItems: 'flex-end', bottom: 0, flexDirection: 'row', gap: 6, left: 0, paddingBottom: 16, paddingHorizontal: 12, paddingTop: 10, position: 'absolute', right: 0 },
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
  inputWrapDisabled: { opacity: 0.6 },
  input: { color: '#fff', flex: 1, fontSize: 13.5, fontWeight: '600' },
  smileBtn: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  smileTxt: { fontSize: 20 },
  bottomBtnWrap: { alignItems: 'center', width: 52 },
  bottomBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(10,0,20,0.6)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 26,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  bottomBtnGift: {
    alignItems: 'center',
    backgroundColor: '#a855f7',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  bottomBtnCall: { backgroundColor: '#22c55e', borderWidth: 0 },
  bottomBtnOn: { borderColor: '#f7b733' },
  bottomBtnLabel: { color: '#fff', fontSize: 10.5, fontWeight: '800', marginTop: 3 },
  likeBadge: { alignItems: 'center', backgroundColor: '#ff5da2', borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 4, position: 'absolute', right: -2, top: -4 },
  likeBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  // Host sheet (tap the host chip).
  sheetProfile: { alignItems: 'center', marginBottom: 12 },
  sheetAvatar: { borderRadius: 40, height: 80, width: 80 },
  sheetAvatarLetter: { color: '#fff', fontSize: 30, fontWeight: '900' },
  sheetId: { color: '#d9ccf5', fontSize: 13, fontWeight: '700', marginTop: 8 },
  sheetFollowBtn: { alignSelf: 'center', backgroundColor: THEME.pink, borderRadius: 999, marginBottom: 10, paddingHorizontal: 22, paddingVertical: 9 },
  sheetCallBtn: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 46, paddingHorizontal: 16 },
  sheetCallTxt: { color: '#3d2400', fontSize: 15, fontWeight: '900' },
  sheetJoinBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, marginTop: 10, minHeight: 46, justifyContent: 'center', paddingHorizontal: 16 },
  sheetJoinBtnRed: { backgroundColor: 'rgba(239,43,60,0.7)' },
  sheetJoinBtnDim: { backgroundColor: 'rgba(255,255,255,0.07)' },
  sheetJoinTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  sheetReportBtn: { alignItems: 'center', marginTop: 14, paddingVertical: 6 },
  sheetReportTxt: { color: '#ff8fa3', fontSize: 13, fontWeight: '800' },
});
