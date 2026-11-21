// Livo MessagesScreen — v2 (2026-11-19)
// Rebuilt from the web preview's Messages demo (livo-home-preview v24,
// section #msgSection): top tabs Message / Notice / Contacts, a row of
// round photos of online hosts, then Chat / Say hi (badge) / Call tabs,
// and a chat list with name, last message, time and unread red badge.
// Tapping any chat opens the ChatDetail screen (ChatDetailScreen.js).
//
// ── WIRING ─────────────────────────────────────────────────────────
// The online-host row and the Contacts list read the LIVE host list
// from the shared store (useApp hosts), so the Host Dashboard's
// Online/Offline switch really adds/removes hosts here too. Tapping
// an online host opens the live room (VideoCallScreen), as before.
// ── DEMO DATA (Supabase replaces this later) ──────────────────────
// The Chat / Call lists use the preview's demo names (Sadiya Moni,
// bvG8K, qSOgr, Em Em, LULA, Rifda) with coloured initial avatars —
// host photos now live in assets (host-ruma/sadia/rakib/priya/arif/nusrat.jpg);
// the top row, Say hi and Contacts show them. Say hi greetings, chat profiles,
// replies and the Customer service answers are the preview's demo
// content. Nothing here spends real coins or tickets yet.
// ── FOLLOW-UP (not silently changed) ──────────────────────────────
// ChatDetail's Follow button is local state here; the store's
// following list is used only when the chat opened from a store host.

import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../config';
import { useApp } from '../store';

// ── Demo chat list (preview #msgSection) ───────────────────────────
const CHATS = [
  { id: 'c1', name: 'Sadiya Moni', color: '#f472b6', last: 'Hello! আজ লাইভে এসো', time: '2m', unread: 2 },
  { id: 'c2', name: 'bvG8K', color: '#e021c8', last: 'Thank you so much!', time: '18m', unread: 1 },
  { id: 'c3', name: 'qSOgr', color: '#38bdf8', last: 'ok, see you in live', time: '1h', unread: 3 },
  { id: 'c4', name: 'Em Em', color: '#a78bfa', last: 'Hi, কেমন আছো?', time: '2h', unread: 0 },
  { id: 'c5', name: 'LULA', color: '#fb7185', last: 'Gift পাঠানোর জন্য ধন্যবাদ', time: '3h', unread: 1 },
  { id: 'c6', name: 'Rifda', color: '#34d399', last: 'Assalamu alaikum', time: '5h', unread: 0 },
];

// Profile shown inside ChatDetail for each demo chat (preview data).
export const CHAT_PROFILES = {
  'Sadiya Moni': { country: 'Pakistan', age: 22, lv: 7, lang: 'English', firstMsg: 'Hello! আজ লাইভে এসো' },
  bvG8K: { country: 'Bangladesh', age: 19, lv: 2, lang: 'English', firstMsg: 'Are you single?' },
  qSOgr: { country: 'India', age: 21, lv: 3, lang: 'English', firstMsg: 'ok, see you in live' },
  'Em Em': { country: 'India', age: 20, lv: 4, lang: 'English', firstMsg: 'Hi, কেমন আছো?' },
  LULA: { country: 'India', age: 23, lv: 5, lang: 'English', firstMsg: 'Gift পাঠানোর জন্য ধন্যবাদ' },
  Rifda: { country: 'Bangladesh', age: 21, lv: 6, lang: 'Bengali', firstMsg: 'Assalamu alaikum' },
};

// Fixed row height: 44 avatar + 10 + 10 padding + 1 border = 65.
// Lets FlatList skip measuring every row while scrolling.
const ROW_H = 65;
const msgLayout = (data, index) => ({ length: ROW_H, offset: ROW_H * index, index });

const CALLS = [
  { id: 'k1', name: 'Sadiya Moni', color: '#f472b6', last: 'Video call · 12 মিনিট', time: '11:20' },
  { id: 'k2', name: 'bvG8K', color: '#e021c8', last: 'Missed call', time: 'গতকাল' },
  { id: 'k3', name: 'LULA', color: '#fb7185', last: 'Video call · 5 মিনিট', time: 'গতকাল' },
];

const HI_TEXTS = [
  'Hi!', 'Hello!', 'কেমন আছো?', 'আসসালামু আলাইকুম', 'Hey! কেমন আছো?',
  'হাই! আমার লাইভে এসো', 'Hello! আজ লাইভে আছি', 'Hi, ভালো আছো তো?',
  'হ্যালো! কথা হবে?', 'Hey there!', 'কেমন আছো? লাইভে এসো',
];

const CS_TOPICS = [
  'Payment Issue', 'Video Problem', 'Account Issue', 'Report User',
  'App Error', 'Suggestions', 'Invite', 'Free video', 'Rate us',
];

const COUNTRY_NAMES = { BGD: 'Bangladesh', IND: 'India', PAK: 'Pakistan' };

function profileForChat(chat) {
  const p = CHAT_PROFILES[chat.name] || {};
  return {
    name: chat.name,
    country: p.country || 'Bangladesh',
    age: p.age || 20,
    lv: p.lv || 1,
    lang: p.lang || 'English',
    firstMsg: p.firstMsg || chat.last,
    unread: chat.unread || 0,
    color: chat.color,
  };
}

// Profile for a live store host (online row / Contacts / Say hi).
function profileForHost(host, firstMsg) {
  return {
    storeId: host.id,
    name: host.name,
    country: COUNTRY_NAMES[host.country] || host.country || 'Bangladesh',
    age: 19 + (parseInt(host.id, 10) % 6),
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
  const [chats, setChats] = useState(CHATS);
  const [csOpen, setCsOpen] = useState(false);
  const [csMsgs, setCsMsgs] = useState([{ id: 'cs0', me: false, text: 'hello, what can i help you' }]);
  const [csText, setCsText] = useState('');

  // ── Say hi feed: seeded from online hosts, badge = feed length ──
  const [sayhiFeed, setSayhiFeed] = useState(() => {
    const online = hosts.filter((h) => h.online);
    const times = ['10m', '32m', '1h', '2h'];
    return online.slice(0, 4).map((h, i) => ({
      id: `hi-seed-${h.id}`,
      host: h,
      text: HI_TEXTS[Math.floor(Math.random() * HI_TEXTS.length)],
      time: times[i] || '2h',
      fresh: false,
    }));
  });
  const feedRef = useRef(sayhiFeed);
  feedRef.current = sayhiFeed;

  const addSayHi = (auto) => {
    const online = hosts.filter((h) => h.online);
    if (!online.length) return null;
    const h = online[Math.floor(Math.random() * online.length)];
    const entry = {
      id: `hi-${Date.now()}`,
      host: h,
      text: HI_TEXTS[Math.floor(Math.random() * HI_TEXTS.length)],
      time: 'এখনই',
      fresh: true,
    };
    setSayhiFeed((f) =>
      [{ ...entry }, ...f.map((e) => ({ ...e, fresh: false, time: e.time === 'এখনই' ? '1m' : e.time }))].slice(0, 12),
    );
    if (auto) showToast(`${h.name} অনলাইনে এসেছে — নতুন Say hi পাঠিয়েছে`);
    return h;
  };

  // Preview behaviour: a host coming online sends a fresh Say hi
  // every so often (30s in the preview). Demo only.
  useEffect(() => {
    const t = setInterval(() => addSayHi(true), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChat = (profile) => {
    if (profile.unread) {
      setChats((cs) => cs.map((c) => (c.name === profile.name ? { ...c, unread: 0 } : c)));
    }
    navigation.navigate('ChatDetail', { profile });
  };

  const csAsk = (topic) => {
    const id = Date.now();
    setCsMsgs((m) => [...m, { id: `m${id}`, me: true, text: topic }]);
    setTimeout(() => {
      setCsMsgs((m) => [
        ...m,
        { id: `r${id}`, me: false, text: `ধন্যবাদ! তোমার “${topic}” বিষয়টা আমরা পেয়েছি — Customer service টিম শীঘ্রই সাহায্য করবে।` },
      ]);
    }, 450);
  };

  const onlineHosts = hosts.filter((h) => h.online);

  const renderChatRow = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => openChat(profileForChat(item))}>
      <Avatar name={item.name} color={item.color} photo={item.photo} />
      <View style={styles.msgBody}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.text} numberOfLines={1}>{item.last}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.time}>{item.time}</Text>
        {item.unread > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unread}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const renderCallRow = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => showToast(`${item.name}-এর কল হিস্ট্রি (প্রিভিউ)`)}
    >
      <Avatar name={item.name} color={item.color} photo={item.photo} />
      <View style={styles.msgBody}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.text} numberOfLines={1}>{item.last}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.time}>{item.time}</Text>
        <Text style={styles.callIcon}>📹</Text>
      </View>
    </TouchableOpacity>
  );

  const renderSayHiRow = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => openChat(profileForHost(item.host, item.text))}
    >
      <View>
        <Avatar name={item.host.name} color={item.host.color || '#7c3aed'} photo={item.host.photo} />
        <View style={styles.onlineDot} />
      </View>
      <View style={styles.msgBody}>
        <Text style={styles.name}>
          {item.host.name} <Text style={styles.idChip}>ID: {item.host.id}</Text>
          {item.fresh ? <Text style={styles.newChip}> নতুন</Text> : null}
        </Text>
        <Text style={styles.text} numberOfLines={1}>“{item.text}”</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.time}>{item.time}</Text>
        <TouchableOpacity
          style={styles.sayHiBtn}
          onPress={() => showToast(`${item.host.name}-কে Say hi পাঠানো হয়েছে`)}
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
            <Text style={styles.backBtn}>‹</Text>
          </TouchableOpacity>
          <View style={[styles.avatar, { backgroundColor: '#db2777', width: 40, height: 40, borderRadius: 20 }]}>
            <Text style={styles.avatarText}>🎧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.csTitle}>Customer service</Text>
            <Text style={styles.csSub}>Online · সাধারণত দ্রুত উত্তর দেয়</Text>
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
            placeholder="মেসেজ লেখো…"
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
            <Text style={styles.sendText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bg}>
      {/* Top tabs: Message / Notice / Contacts */}
      <View style={styles.topTabs}>
        {[
          { id: 'message', label: 'Message' },
          { id: 'notice', label: 'Notice' },
          { id: 'contacts', label: 'Contacts' },
        ].map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.topTab, topTab === t.id && styles.topTabActive]}
            onPress={() => setTopTab(t.id)}
          >
            <Text style={[styles.topTabText, topTab === t.id && styles.topTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {topTab === 'message' && (
        <>
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

          {/* Sub tabs: Chat / Say hi / Call */}
          <View style={styles.subTabs}>
            {[
              { id: 'chat', label: 'Chat' },
              { id: 'sayhi', label: 'Say hi', badge: sayhiFeed.length },
              { id: 'call', label: 'Call' },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.subTab, subTab === t.id && styles.subTabActive]}
                onPress={() => setSubTab(t.id)}
              >
                <Text style={[styles.subTabText, subTab === t.id && styles.subTabTextActive]}>
                  {t.label}
                  {t.badge ? <Text style={styles.sayhiBadge}> {t.badge}</Text> : null}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {subTab === 'chat' && (
            <FlatList data={chats} keyExtractor={(m) => m.id} renderItem={renderChatRow} removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout} />
          )}
          {subTab === 'call' && (
            <FlatList data={CALLS} keyExtractor={(m) => m.id} renderItem={renderCallRow} removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout} />
          )}
          {subTab === 'sayhi' && (
            <>
              <TouchableOpacity
                style={styles.newHiBtn}
                onPress={() => {
                  const h = addSayHi(false);
                  if (h) showToast(`${h.name}-এর কাছ থেকে নতুন Say hi এসেছে`);
                }}
              >
                <Text style={styles.newHiBtnText}>↻ নতুন Say hi দেখো</Text>
              </TouchableOpacity>
              <FlatList data={sayhiFeed} keyExtractor={(m) => m.id} renderItem={renderSayHiRow} removeClippedSubviews maxToRenderPerBatch={10} windowSize={8} initialNumToRender={10} updateCellsBatchingPeriod={50} getItemLayout={msgLayout} />
            </>
          )}
        </>
      )}

      {topTab === 'notice' && (
        <View>
          <TouchableOpacity
            style={styles.row}
            onPress={() => showToast('System message: Task completed! Rewards have been credited automatically')}
          >
            <View style={[styles.avatar, { backgroundColor: '#f1eafd' }]}>
              <Text style={styles.avatarText}>🔔</Text>
            </View>
            <View style={styles.msgBody}>
              <Text style={styles.name}>System message</Text>
              <Text style={styles.text} numberOfLines={2}>Task completed! Rewards have been credited automatically</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.time}>10:05</Text>
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>1</Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => setCsOpen(true)}>
            <View style={[styles.avatar, { backgroundColor: '#fde7f1' }]}>
              <Text style={styles.avatarText}>🎧</Text>
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
                <Text style={styles.text} numberOfLines={1}>ID: {item.id} · {item.lang}</Text>
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
  backBtn: { color: COLORS.dark, fontSize: 28, fontWeight: 'bold', paddingHorizontal: 8 },
  bg: { backgroundColor: '#fff', flex: 1, paddingTop: 36 },
  callIcon: { fontSize: 18, marginTop: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 6 },
  chip: { backgroundColor: COLORS.lavender, borderRadius: 16, margin: 4, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: COLORS.purple, fontSize: 13, fontWeight: '600' },
  composer: { flexDirection: 'row', padding: 12 },
  csBubble: { borderRadius: 14, marginHorizontal: 14, marginVertical: 4, maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 9 },
  csBubbleMe: { alignSelf: 'flex-end', backgroundColor: COLORS.purple },
  csBubbleMeText: { color: '#fff' },
  csBubbleText: { color: COLORS.dark },
  csBubbleThem: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9' },
  csHead: { alignItems: 'center', borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', paddingBottom: 10, paddingHorizontal: 8 },
  csMsgs: { flex: 1, paddingTop: 10 },
  csSub: { color: COLORS.grey, fontSize: 12 },
  csTitle: { fontSize: 17, fontWeight: 'bold' },
  idChip: { color: COLORS.grey, fontSize: 12, fontWeight: 'normal' },
  input: { backgroundColor: COLORS.lavender, borderRadius: 20, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  msgBody: { flex: 1, marginLeft: 10 },
  name: { fontSize: 15, fontWeight: 'bold' },
  newChip: { backgroundColor: COLORS.green, borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 6 },
  newHiBtn: { alignSelf: 'center', backgroundColor: COLORS.lavender, borderRadius: 20, marginVertical: 8, paddingHorizontal: 16, paddingVertical: 9 },
  newHiBtnText: { color: COLORS.purple, fontWeight: 'bold' },
  onlineDot: { backgroundColor: COLORS.green, borderColor: '#fff', borderRadius: 6, borderWidth: 2, bottom: 2, height: 12, position: 'absolute', right: 2, width: 12 },
  onlineItem: { alignItems: 'center', marginHorizontal: 6, width: 52 },
  onlineName: { color: COLORS.dark, fontSize: 11, marginTop: 4 },
  onlineRow: { flexGrow: 0, paddingVertical: 8 },
  row: { alignItems: 'center', borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  rowRight: { alignItems: 'flex-end' },
  sayhiBadge: { backgroundColor: COLORS.pink, borderRadius: 9, color: '#fff', fontSize: 12, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 6 },
  sayHiBtn: { backgroundColor: COLORS.pink, borderRadius: 14, marginTop: 4, paddingHorizontal: 10, paddingVertical: 3 },
  sayHiBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  send: { backgroundColor: COLORS.purple, borderRadius: 20, justifyContent: 'center', marginLeft: 8, paddingHorizontal: 16 },
  sendText: { color: '#fff', fontWeight: 'bold' },
  subTab: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingBottom: 6, paddingHorizontal: 12 },
  subTabActive: { borderBottomColor: COLORS.pink },
  subTabText: { color: COLORS.grey, fontSize: 13, fontWeight: '600' },
  subTabTextActive: { color: COLORS.dark },
  subTabs: { borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 8 },
  text: { color: COLORS.grey, fontSize: 13, marginTop: 2 },
  time: { color: COLORS.grey, fontSize: 11 },
  topTab: { borderBottomColor: 'transparent', borderBottomWidth: 2, flex: 1, paddingBottom: 8, paddingTop: 4 },
  topTabActive: { borderBottomColor: COLORS.purple },
  topTabText: { color: COLORS.grey, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  topTabTextActive: { color: COLORS.purple },
  topTabs: { borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 8 },
  unreadBadge: { backgroundColor: '#ef4444', borderRadius: 10, marginTop: 4, minWidth: 18, paddingHorizontal: 6, paddingVertical: 1 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
});
