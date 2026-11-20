// Livo MomentsScreen — Vero "Share your moment" short-video feed.
// A vertical feed of moment cards built from the demo host list.
// Like toggles locally; counts are demo values. Tapping a moment's
// Call button opens that host's 1-to-1 call. Card sizes scale with
// the phone width (Dimensions), so the feed looks right on every
// phone — small or big.
import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../config';
import { HOSTS } from '../data';
import { useApp } from '../store';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32;
const PHOTO_H = Math.round(CARD_W * 1.05);

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
  return (
    <View style={styles.card}>
      <LinearGradient colors={[moment.host.color, '#111827']} style={[styles.photo, { height: PHOTO_H }]}>
        <Text style={styles.bigAvatar}>{moment.host.name[0]}</Text>
        {moment.host.online && (
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>● LIVE</Text>
          </View>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.bottomShade}>
          <Text style={styles.name}>{moment.host.name} {moment.host.flag}</Text>
          <Text style={styles.caption}>{moment.caption}</Text>
        </LinearGradient>
      </LinearGradient>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} onPress={onLike} activeOpacity={0.8}>
          <Text style={styles.actionEmoji}>{liked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionText}>{likes.toLocaleString()}</Text>
        </TouchableOpacity>
        <View style={styles.action}>
          <Text style={styles.actionEmoji}>💬</Text>
          <Text style={styles.actionText}>{moment.comments}</Text>
        </View>
        <TouchableOpacity style={styles.action} onPress={onShare} activeOpacity={0.8}>
          <Text style={styles.actionEmoji}>↗️</Text>
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.callBtn} onPress={onCall} activeOpacity={0.85}>
          <Text style={styles.callBtnText}>📞 Call</Text>
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
  actionEmoji: { fontSize: 20 },
  actionText: { fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  actions: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  bg: { backgroundColor: '#fff', flex: 1, paddingTop: 48 },
  bigAvatar: { color: '#fff', fontSize: 84, fontWeight: 'bold' },
  bottomShade: { bottom: 0, left: 0, padding: 12, position: 'absolute', right: 0 },
  callBtn: { backgroundColor: COLORS.purple, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  callBtnText: { color: '#fff', fontWeight: 'bold' },
  caption: { color: '#fff', fontSize: 14, marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 16, elevation: 2, marginBottom: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  list: { padding: 16 },
  liveBadge: { backgroundColor: '#ef4444', borderRadius: 10, left: 12, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 12 },
  liveText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  photo: { alignItems: 'center', justifyContent: 'center' },
  sub: { color: COLORS.grey, marginTop: 4, paddingHorizontal: 16 },
  title: { color: COLORS.dark, fontSize: 24, fontWeight: 'bold', paddingHorizontal: 16 },
});
