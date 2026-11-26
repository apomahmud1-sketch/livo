// Livo MessagesScreen — v4 (2026-11-22)
// Restyled to the v0 Home design (~/workspace/v0-design/SPEC.md):
// mint #f0fdf4 background, Stream/Follow-style top tabs (18px,
// selected #111713 + green #72d679 underline, inactive #959b97),
// sub-tabs in the same style, red #f04f4b badges, green online dots
// (#31bc63 + glow) on real host photos, lucide icons everywhere
// (no emoji).
// ── ANDROID BACK (2026-11-21) ────────────────────────────────────
// The Customer Service view is rendered by state (csOpen), not by a
// route, so the native stack cannot pop it: a focus-effect
// BackHandler closes it first when it is open.
// ── REAL CHAT (2026-11-22) ───────────────────────────────────────
// The Chat list is now the real conversation list from the
// messages table (latest message per counterpart, newest first) —
// the hardcoded CHATS and the fake Say-hi entry every 30s are
// gone. Say Hi is a real action: it sends a real first message
// ('Hi!') into the messages table, then opens the chat. The Call
// tab lists the real call history from the `calls` table (duration,
// cost, status, other party). Unread counts are real (messages
// with read_at NULL) and shown as badges on chat rows. When there
// is no Supabase session the Chat list prompts login instead of
// showing fake chats.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, Headphones, Send, Video } from 'lucide-react-native';
import { COLORS } from '../config';
import { useApp } from '../store';
// [Live] Real conversations + real first message.
import {
  fetchCallHistory,
  fetchConversations,
  getCurrentUserId,
  resolveRecipientProfileId,
  sendMessage,
} from '../supabase/chat';

// Fixed row height: 44 avatar + 10 + 10 padding + 1 border = 65.
// Lets FlatList skip measuring every row while scrolling.
const ROW_H = 65;
const msgLayout = (data, index) => ({ length: ROW_H, offset: ROW_H * index, index });

const CS_TOPICS = [
  'Payment Issue', 'Video Problem', 'Account Issue', 'Report User',
  'App Error', 'Suggestions', 'Invite', 'Free video', 'Rate us',
];

const COUNTRY_NAMES = { BGD: 'Bangladesh', IND: 'India', PAK: 'Pakistan' };

// Relative time for a message timestamp ("2m", "1h", "Yesterday").
function formatTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d`;
}

// Duration of a finished call ("45s", "3m 20s").
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s % 60}s`;
}

// Profile for ChatDetail from a real conversation row.
function profileForConversation(conv) {
  return {
    profileId: conv.counterpartId,
    name: conv.name,
    country: COUNTRY_NAMES[conv.country] || conv.country || 'Bangladesh',
    age: conv.age != null ? conv.age : null,
    lv: '',
    lang: conv.lang || 'English',
    firstMsg: conv.lastBody,
    unread: conv.unread || 0,
    color: '#7c3aed',
    avatarUrl: conv.avatarUrl,
  };
}

// Profile for a live store host (online row / Contacts / Say hi).
// Age is unknown here (hosts carry no age) — never invented.
function profileForHost(host, firstMsg) {
  return {
    storeId: host.id,
    name: host.name,
    country: COUNTRY_NAMES[host.country] || host.country || 'Bangladesh',
    age: null,
    lv: host.level || 1,
    lang: host.lang || 'English',
    firstMsg: firstMsg || 'Hi!',
    unread: 0,
    color: host.color || '#7c3aed',
  };
}

const Avatar = React.memo(function Avatar({ name, color, size = 44, photo }) {
  if (photo) {
    return <Image source={photo} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.avatar, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{name ? name[0] : '?'}</Text>
    </View>
  );
});

export default function MessagesScreen({ navigation }) {
  const { hosts, showToast } = useApp();
  const [topTab, setTopTab] = useState('message'); // message | notice | contacts
  const [subTab, setSubTab] = useState('chat'); // chat | sayhi | call
  const [csOpen, setCsOpen] = useState(false);
  const [csMsgs, setCsMsgs] = useState([{ id: 'cs0', me: false, text: 'hello, what can i help you' }]);
  const [csText, setCsText] = useState('');

  // [Live] Real conversation list (messages table). `meId` null +
  // authChecked means "no session — prompt login, show no chats".
  const [conversations, setConversations] = useState([]);
  const [meId, setMeId] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [sendingHi, setSendingHi] = useState(false);

  // [Live] Real call history from the `calls` table, loaded when
  // the Call sub-tab is opened.
  const [callHistory, setCallHistory] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);

  useEffect(() => {
    if (subTab !== 'call' || !meId) return undefined;
    let cancelled = false;
    setLoadingCalls(true);
    fetchCallHistory(meId).then((rows) => {
      if (cancelled) return;
      setCallHistory(rows);
      setLoadingCalls(false);
    });
    return () => {
      cancelled = true;
    };
  }, [subTab, meId]);

  const loadConversations = useCallback(async () => {
    const uid = await getCurrentUserId();
    setMeId(uid);
    setAuthChecked(true);
    if (!uid) {
      setConversations([]);
      setLoadingChats(false);
      return;
    }
    const list = await fetchConversations(uid);
    setConversations(list);
    setLoadingChats(false);
  }, []);

  // Reload every time the Messages tab is focused (a chat opened
  // from here may have added a conversation).
  useFocusEffect(
    useCallback(() => {
      setLoadingChats(true);
      loadConversations();
      return undefined;
    }, [loadConversations]),
  );

  // ── Android back: the Customer Service view is state, not a
  // route — close it first instead of leaving the Messages tab.
  useFocusEffect(
    React.useCallback(() => {
      if (!csOpen) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setCsOpen(false);
        return true;
      });
      return () => sub.remove();
    }, [csOpen]),
  );

  const openChat = (profile) => {
    navigation.navigate('ChatDetail', { profile });
  };

  // [Live] Say Hi is a real first message in the messages table,
  // then the chat opens. Needs a signed-in user and a real host
  // account (resolved via the hosts table).
  const sendSayHi = async (host) => {
    if (sendingHi) return;
    if (!meId) {
      showToast('Please sign in to say hi');
      navigation.navigate('Login');
      return;
    }
    setSendingHi(true);
    const recipientId = await resolveRecipientProfileId({ storeId: host.id });
    if (!recipientId) {
      setSendingHi(false);
      showToast(`${host.name} has no real account yet`);
      return;
    }
    const saved = await sendMessage({ senderId: meId, recipientId, body: 'Hi!' });
    setSendingHi(false);
    if (!saved) {
      showToast('Say hi could not be sent — please try again');
      return;
    }
    openChat({ ...profileForHost(host, 'Hi!'), profileId: recipientId });
  };

  const csAsk = (topic) => {
    const id = Date.now();
    setCsMsgs((m) => [...m, { id: `m${id}`, me: true, text: topic }]);
    setTimeout(() => {
      setCsMsgs((m) => [
        ...m,
        { id: `r${id}`, me: false, text: `Thanks! We received your message about “${topic}” — our Customer Service team will help you soon.` },
      ]);
    }, 450);
  };

  const onlineHosts = hosts.filter((h) => h.online);

  const renderChatRow = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => openChat(profileForConversation(item))}>
      <Avatar name={item.name} color="#7c3aed" photo={item.avatarUrl ? { uri: item.avatarUrl } : null} />
      <View style={styles.msgBody}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.text} numberOfLines={1}>{item.lastBody}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.time}>{formatTime(item.lastAt)}</Text>
        {item.unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unread}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  // [Live] One real call-history row: other party, direction,
  // duration, cost, status, time. Honest empty state when none.
  const renderCallRow = ({ item }) => (
    <View style={styles.row}>
      <View style={styles.msgBody}>
        <Text style={styles.name}>
          {item.otherName}{' '}
          <Text style={styles.idChip}>{item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}</Text>
        </Text>
        <Text style={styles.text} numberOfLines={1}>
          {formatDuration(item.durationSeconds)} · {item.costCoins} coins{item.status ? ` · ${item.status}` : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
      </View>
    </View>
  );

  const renderSayHiRow = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => sendSayHi(item)}
    >
      <View>
        <Avatar name={item.name} color={item.color || '#7c3aed'} photo={item.photo} />
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.msgBody}>
        <Text style={styles.name}>
          {item.name} <Text style={styles.idChip}>ID: {item.userId || '—'}</Text>
        </Text>
        <Text style={styles.text} numberOfLines={1}>Say hi to {item.name}</Text>
      </View>
      <View style={styles.rowRight}>
        <TouchableOpacity
          style={styles.sayHiBtn}
          onPress={() => sendSayHi(item)}
        >
          <Text style={styles.sayHiBtnText}>Say hi</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  // ── Customer service chat (preview: Notice → Customer service) ──
  if (csOpen) {
    return (
      <View style={styles.bg}>
        <View style={styles.csHead}>
          <TouchableOpacity onPress={() => setCsOpen(false)}>
            <ChevronLeft size={26} color="#111713" />
          </TouchableOpacity>
          <View style={[styles.avatar, { backgroundColor: '#db2777', width: 40, height: 40, borderRadius: 20 }]}>
            <Headphones size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.csTitle}>Customer service</Text>
            <Text style={styles.csSub}>Online · Usually replies quickly</Text>
          </View>
        </View>
        <ScrollView style={styles.csMsgs}>
          {csMsgs.map((m) => (
            <View key={m.id} style={[styles.csBubble, m.me ? styles.csBubbleMe : styles.csBubbleThem]}>
              <Text style={m.me ? styles.csBubbleMeText : styles.csBubbleText}>{m.text}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.chipsRow}>
          {CS_TOPICS.map((t) => (
            <TouchableOpacity key={t} style={styles.chip} onPress={() => csAsk(t)}>
              <Text style={styles.chipText}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Write a message…"
            value={csText}
            onChangeText={setCsText}
            onSubmitEditing={() => {
              if (!csText.trim()) return;
              csAsk(csText.trim());
              setCsText('');
            }}
          />
          <TouchableOpacity
            style={styles.send}
            onPress={() => {
              if (!csText.trim()) return;
              csAsk(csText.trim());
              setCsText('');
            }}
          >
            <Send size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bg}>
      {/* Top tabs: Message / Notice / Contacts — Home Stream/Follow style */}
      <View style={styles.topTabs}>
        {[
          { id: 'message', label: 'Message' },
          { id: 'notice', label: 'Notice' },
          { id: 'contacts', label: 'Contacts' },
        ].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={styles.topTab}
            onPress={() => setTopTab(t.id)}
          >
            <Text style={[styles.topTabText, topTab === t.id && styles.topTabTextActive]}>{t.label}</Text>
            {topTab === t.id ? <View style={styles.tabUnderline} /> : null}
          </TouchableOpacity>
        ))}
      </View>

      {topTab === 'message' && (
        <View style={{ flex: 1 }}>
          {/* Online hosts row — live from the store */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.onlineRow}>
            {onlineHosts.map((h) => (
              <TouchableOpacity
                key={h.id}
                style={styles.onlineItem}
                onPress={() => navigation.navigate('VideoCall', { host: h })}
              >
                <View>
                  <Avatar name={h.name} color={h.color || '#7c3aed'} size={44} photo={h.photo} />
                  <View style={styles.onlineDot} />
                </View>
                <Text style={styles.onlineName} numberOfLines={1}>{h.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Sub tabs: Chat / Say hi / Call — same style as the top tabs */}
          <View style={styles.subTabs}>
            {[
              { id: 'chat', label: 'Chat' },
              { id: 'sayhi', label: 'Say hi' },
              { id: 'call', label: 'Call' },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.subTab}
                onPress={() => setSubTab(t.id)}
              >
                <Text style={[styles.subTabText, subTab === t.id && styles.subTabTextActive]}>
                  {t.label}
                </Text>
                {subTab === t.id ? <View style={styles.tabUnderline} /> : null}
              </TouchableOpacity>
            ))}
          </View>

          {subTab === 'chat' && (
            loadingChats ? (
              <ActivityIndicator color="#20a64b" style={{ marginTop: 32 }} />
            ) : !authChecked ? null : !meId ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Please sign in to see your chats.</Text>
                <TouchableOpacity style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.loginBtnText}>Sign in</Text>
                </TouchableOpacity>
              </View>
            ) : conversations.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No chats yet — say hi to a host!</Text>
              </View>
            ) : (
              <FlatList data={conversations} keyExtractor={(m) => m.counterpartId} renderItem={renderChatRow} removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout} />
            )
          )}
          {subTab === 'call' && (
            loadingCalls ? (
              <ActivityIndicator color="#20a64b" style={{ marginTop: 32 }} />
            ) : !meId ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Please sign in to see your call history.</Text>
              </View>
            ) : callHistory.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No call history yet.</Text>
              </View>
            ) : (
              <FlatList data={callHistory} keyExtractor={(c) => String(c.id)} renderItem={renderCallRow} removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout} />
            )
          )}
          {subTab === 'sayhi' && (
            onlineHosts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No hosts online right now.</Text>
              </View>
            ) : (
              <FlatList data={onlineHosts} keyExtractor={(h) => String(h.id)} renderItem={renderSayHiRow} removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout} />
            )
          )}
        </View>
      )}

      {topTab === 'notice' && (
        <View>
          <TouchableOpacity style={styles.row} onPress={() => setCsOpen(true)}>
            <View style={[styles.avatar, { backgroundColor: '#fde7f1' }]}>
              <Headphones size={20} color="#db2777" />
            </View>
            <View style={styles.msgBody}>
              <Text style={styles.name}>Customer service</Text>
              <Text style={styles.text} numberOfLines={1}>hello, what can i help you</Text>
            </View>
            <Text style={styles.time}>09:41</Text>
          </TouchableOpacity>
        </View>
      )}

      {topTab === 'contacts' && (
        <FlatList
          data={hosts}
          keyExtractor={(h) => h.id}
          removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openChat(profileForHost(item, 'Hi!'))}>
              <Avatar name={item.name} color={item.color || '#7c3aed'} photo={item.photo} />
              <View style={styles.msgBody}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.text} numberOfLines={1}>ID: {item.userId || '—'} · {item.lang}</Text>
              </View>
              <View style={styles.sayHiBtn}>
                <Text style={styles.sayHiBtnText}>Chat</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  bg: { backgroundColor: '#f0fdf4', flex: 1, paddingTop: 36 },
  callIcon: { marginTop: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 6 },
  chip: { backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 16, borderWidth: 1, margin: 4, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: '#20a64b', fontSize: 13, fontWeight: '600' },
  composer: { alignItems: 'center', flexDirection: 'row', padding: 12 },
  csBubble: { borderRadius: 14, marginHorizontal: 14, marginVertical: 4, maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 9 },
  csBubbleMe: { alignSelf: 'flex-end', backgroundColor: '#dcfce7' },
  csBubbleMeText: { color: '#111713' },
  csBubbleText: { color: '#111713' },
  csBubbleThem: { alignSelf: 'flex-start', backgroundColor: '#fff', borderColor: '#e9eeea', borderWidth: 1 },
  csHead: { alignItems: 'center', borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 10, paddingHorizontal: 8 },
  csMsgs: { flex: 1, paddingTop: 10 },
  csSub: { color: '#818b84', fontSize: 12 },
  csTitle: { color: '#111713', fontSize: 17, fontWeight: '800' },
  // [Live] Empty / sign-in states for the real chat list.
  emptyText: { color: '#818b84', fontSize: 15, textAlign: 'center' },
  emptyWrap: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  idChip: { color: '#818b84', fontSize: 12, fontWeight: 'normal' },
  input: { backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 20, borderWidth: 1, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  loginBtn: { backgroundColor: '#20a64b', borderRadius: 18, marginTop: 16, paddingHorizontal: 20, paddingVertical: 10 },
  loginBtnText: { color: '#fff', fontWeight: 'bold' },
  msgBody: { flex: 1, marginLeft: 10 },
  name: { color: '#1a211c', fontSize: 15, fontWeight: '800' },
  onlineDot: { backgroundColor: '#31bc63', borderColor: '#fff', borderRadius: 6, borderWidth: 2, bottom: 2, elevation: 3, height: 12, position: 'absolute', right: 2, shadowColor: '#31bc63', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4, width: 12 },
  onlineItem: { alignItems: 'center', marginHorizontal: 6, width: 52 },
  onlineName: { color: '#273029', fontSize: 11, marginTop: 4 },
  onlineRow: { flexGrow: 0, paddingVertical: 8 },
  row: { alignItems: 'center', borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  rowRight: { alignItems: 'flex-end' },
  sayHiBtn: { backgroundColor: '#20a64b', borderRadius: 14, marginTop: 4, paddingHorizontal: 10, paddingVertical: 3 },
  sayHiBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  send: { alignItems: 'center', backgroundColor: '#20a64b', borderRadius: 20, justifyContent: 'center', marginLeft: 8, paddingHorizontal: 14, paddingVertical: 10 },
  subTab: { paddingBottom: 8, paddingHorizontal: 12, paddingTop: 4, position: 'relative' },
  subTabText: { color: '#959b97', fontSize: 16, fontWeight: '600' },
  subTabTextActive: { color: '#111713', fontWeight: '800' },
  subTabs: { borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 8 },
  tabUnderline: { backgroundColor: '#72d679', borderRadius: 3, bottom: 5, height: 3, left: 2, position: 'absolute', right: 2 },
  text: { color: '#818b84', fontSize: 13, marginTop: 2 },
  time: { color: '#a0aaa2', fontSize: 11 },
  topTab: { alignItems: 'center', flex: 1, paddingBottom: 10, paddingTop: 4, position: 'relative' },
  topTabText: { color: '#959b97', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  topTabTextActive: { color: '#111713', fontWeight: '800' },
  topTabs: { borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 8 },
  unreadBadge: { alignItems: 'center', backgroundColor: '#f04f4b', borderRadius: 7, height: 14, justifyContent: 'center', marginTop: 4, minWidth: 14, paddingHorizontal: 4 },
  unreadText: { color: '#fff', fontSize: 8, fontWeight: '800', textAlign: 'center' },
});
