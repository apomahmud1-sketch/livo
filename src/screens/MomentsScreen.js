// Livo MomentsScreen — Vero "Share your moment" short-video feed.
// A vertical feed of moment cards built from the demo host list.
// Like toggles locally; counts are demo values. Tapping a moment's
// Call button opens that host's 1-to-1 call. Card sizes scale with
// the phone width (Dimensions), so the feed looks right on every
// phone — small or big.
//
// Restyled 2026-11-21 to the v0 Home design language (see
// ~/workspace/v0-design/SPEC.md): mint background #f0fdf4, Home-style
// dark Live pill with 3 green bars, flagcdn flag images, and
// lucide-react-native icons (no emoji) in the actions row.
import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, MessageCircle, Phone, Share2 } from 'lucide-react-native';
import { HOSTS } from '../data';
import { useApp } from '../store';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32;
const PHOTO_H = Math.round(CARD_W * 1.05);

// Flag images from flagcdn (w40), shown 13x9 on the photo —
// same mapping as HomeScreen.js.
const FLAG_URL = {
  BGD: 'https://flagcdn.com/w40/bd.png',
  IND: 'https://flagcdn.com/w40/in.png',
  PAK: 'https://flagcdn.com/w40/pk.png',
};

const CAPTIONS = [
  'Live now — come say hi! 💬',
  'New look, same me ✨',
  'Good vibes only 🌸',
  'Call me tonight? 📞',
  'Dancing in the rain 💃',
  'Fresh moment, fresh energy 🔥',
];
const LIKES = [1284, 862, 2401, 519, 3107, 764];
const COMMENTS = [96, 41, 188, 23, 254, 57];

const MomentCard = React.memo(function MomentCard({ moment, liked, onLike, onCall, onShare }) {
  const likes = moment.likes + (liked ? 1 : 0);
  const flagUri = FLAG_URL[moment.host.country];
  return (
    <View style={styles.card}>
      <LinearGradient colors={[moment.host.color, '#111827']} style={[styles.photo, { height: PHOTO_H }]}>
        {moment.host.photo ? (
          <Image source={moment.host.photo} style={styles.photoImg} />
        ) : (
          <Text style={styles.bigAvatar}>{moment.host.name[0]}</Text>
        )}
        {moment.host.online && (
          <View style={styles.liveBadge}>
            <View style={styles.liveBars}>
              <View style={[styles.liveBar, { height: 5 }]} />
              <View style={[styles.liveBar, { height: 9 }]} />
              <View style={[styles.liveBar, { height: 7 }]} />
            </View>
            <Text style={styles.liveText}>Live</Text>
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.bottomShade}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{moment.host.name}</Text>
            {flagUri ? <Image source={{ uri: flagUri }} style={styles.flag} /> : null}
          </View>
          <Text style={styles.caption}>{moment.caption}</Text>
        </LinearGradient>
      </LinearGradient>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onLike} activeOpacity={0.8}>
          <Heart size={20} color={liked ? '#ef4444' : '#818b84'} fill={liked ? '#ef4444' : 'none'} strokeWidth={2} />
          <Text style={styles.actionText}>{likes.toLocaleString()}</Text>
        </TouchableOpacity>
        <View style={styles.action}>
          <MessageCircle size={20} color="#818b84" strokeWidth={2} />
          <Text style={styles.actionText}>{moment.comments}</Text>
        </View>
        <TouchableOpacity style={styles.action} onPress={onShare} activeOpacity={0.8}>
          <Share2 size={20} color="#818b84" strokeWidth={2} />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.callBtn} onPress={onCall} activeOpacity={0.85}>
          <Phone size={15} color="#fff" strokeWidth={2.2} />
          <Text style={styles.callBtnText}>Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function MomentsScreen({ navigation }) {
  const { showToast } = useApp();
  const [likedIds, setLikedIds] = useState({});
  const moments = useMemo(() => HOSTS.map((host, i) => ({
    id: host.id,
    host,
    caption: CAPTIONS[i % CAPTIONS.length],
    likes: LIKES[i % LIKES.length],
    comments: COMMENTS[i % COMMENTS.length],
  })), []);
  const toggleLike = (id) => setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const renderMoment = ({ item }) => (
    <MomentCard
      moment={item}
      liked={!!likedIds[item.id]}
      onLike={() => toggleLike(item.id)}
      onCall={() => navigation.navigate('VideoCall', { host: item.host })}
      onShare={() => showToast('Moment link copied')}
    />
  );
  return (
    <View style={styles.bg}>
      <Text style={styles.title}>Moments</Text>
      <Text style={styles.sub}>Share your moment — you make the feed.</Text>
      <FlatList
        data={moments}
        keyExtractor={(m) => m.id}
        renderItem={renderMoment}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews maxToRenderPerBatch={5} windowSize={5} initialNumToRender={4}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', flexDirection: 'row', marginRight: 16 },
  actionText: { color: '#818b84', fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  actions: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  bg: { backgroundColor: '#f0fdf4', flex: 1, paddingTop: 48 },
  bigAvatar: { color: '#fff', fontSize: 84, fontWeight: 'bold' },
  bottomShade: { bottom: 0, left: 0, padding: 12, position: 'absolute', right: 0 },
  callBtn: { alignItems: 'center', backgroundColor: '#20a64b', borderRadius: 18, flexDirection: 'row', gap: 5, paddingHorizontal: 14, paddingVertical: 7 },
  callBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  caption: { color: '#fff', fontSize: 14, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 15, elevation: 2, marginBottom: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  flag: { borderColor: 'rgba(255,255,255,0.75)', borderRadius: 2, borderWidth: 0.5, height: 9, marginLeft: 6, width: 13 },
  list: { padding: 16 },
  liveBadge: { alignItems: 'center', backgroundColor: 'rgba(22,28,24,0.76)', borderColor: 'rgba(255,255,255,0.10)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', height: 21, left: 8, paddingHorizontal: 8, position: 'absolute', top: 9 },
  liveBar: { backgroundColor: '#62e17d', borderRadius: 1, width: 2 },
  liveBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 1, marginRight: 4 },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  name: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  nameRow: { alignItems: 'center', flexDirection: 'row' },
  photo: { alignItems: 'center', justifyContent: 'center' },
  photoImg: { height: '100%', position: 'absolute', width: '100%' },
  sub: { color: '#818b84', marginTop: 4, paddingHorizontal: 16 },
  title: { color: '#111713', fontSize: 24, fontWeight: 'bold', paddingHorizontal: 16 },
});
