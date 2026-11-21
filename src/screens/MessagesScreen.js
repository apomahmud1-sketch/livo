// Livo MessagesScreen — v3 (2026-11-21)
// Restyled to the v0 Home design (~/workspace/v0-design/SPEC.md):
// mint #f0fdf4 background, Stream/Follow-style top tabs (18px,
// selected #111713 + green #72d679 underline, inactive #959b97),
// sub-tabs in the same style, red #f04f4b badges, green online dots
// (#31bc63 + glow) on real host photos, lucide icons everywhere
// (no emoji). All behaviour, demo data and wording unchanged.
// ── ANDROID BACK (2026-11-21) ────────────────────────────────────
// The Customer Service view is rendered by state (csOpen), not by a
// route, so the native stack cannot pop it: a focus-effect
// BackHandler closes it first when it is open.

import React, { useEffect, useRef, useState } from 'react';
import {
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
import { Bell, ChevronLeft, Headphones, RotateCw, Send, Video } from 'lucide-react-native';
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
        <Video size={18} color="#9aa39c" style={styles.callIcon} />
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
            <ChevronLeft size={26} color="#111713" />
          </TouchableOpacity>
          <View style={[styles.avatar, { backgroundColor: '#db2777', width: 40, height: 40, borderRadius: 20 }]}>
            <Headphones size={20} color="#fff" />
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

          {/* Sub tabs: Chat / Say hi / Call — same style as the top tabs */}
          <View style={styles.subTabs}>
            {[
              { id: 'chat', label: 'Chat' },
              { id: 'sayhi', label: 'Say hi', badge: sayhiFeed.length },
              { id: 'call', label: 'Call' },
            ].map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.subTab}
                onPress={() => setSubTab(t.id)}
              >
                <Text style={[styles.subTabText, subTab === t.id && styles.subTabTextActive]}>
                  {t.label}
                  {t.badge ? <Text style={styles.sayhiBadge}> {t.badge}</Text> : null}
                </Text>
                {subTab === t.id ? <View style={styles.tabUnderline} /> : null}
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
                <RotateCw size={14} color="#20a64b" />
                <Text style={styles.newHiBtnText}> নতুন Say hi দেখো</Text>
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
              <Bell size={20} color="#7c3aed" />
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
  idChip: { color: '#818b84', fontSize: 12, fontWeight: 'normal' },
  input: { backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 20, borderWidth: 1, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  msgBody: { flex: 1, marginLeft: 10 },
  name: { color: '#1a211c', fontSize: 15, fontWeight: '800' },
  newChip: { backgroundColor: '#20a64b', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 'bold', overflow: 'hidden', paddingHorizontal: 6 },
  newHiBtn: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 20, borderWidth: 1, flexDirection: 'row', marginVertical: 8, paddingHorizontal: 16, paddingVertical: 9 },
  newHiBtnText: { color: '#20a64b', fontWeight: 'bold' },
  onlineDot: { backgroundColor: '#31bc63', borderColor: '#fff', borderRadius: 6, borderWidth: 2, bottom: 2, elevation: 3, height: 12, position: 'absolute', right: 2, shadowColor: '#31bc63', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4, width: 12 },
  onlineItem: { alignItems: 'center', marginHorizontal: 6, width: 52 },
  onlineName: { color: '#273029', fontSize: 11, marginTop: 4 },
  onlineRow: { flexGrow: 0, paddingVertical: 8 },
  row: { alignItems: 'center', borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  rowRight: { alignItems: 'flex-end' },
  sayhiBadge: { backgroundColor: '#f04f4b', borderRadius: 9, color: '#fff', fontSize: 8, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 6 },
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
