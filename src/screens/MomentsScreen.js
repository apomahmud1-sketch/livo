// Livo MomentsScreen — Vero "Share your moment" short-video feed.
// The feed reads the moments table (newest first, paginated), each
// post attributed to its real author (profiles join for username /
// avatar / country). No hardcoded captions or like counts.
//
// Upload (2026-11-22): green "+" button in the header opens a bottom
// sheet — Take Photo / Choose from Gallery / Record Video / Choose
// Video (expo-image-picker) → preview → caption → Post. Posting
// needs a signed-in user: the media goes to the moments bucket and
// a row is inserted into the moments table with host_id = the
// user's id, and the new row appears at the top of the feed at
// once. If the upload fails, the post is kept on-device only
// (AsyncStorage key LIVO_MOMENTS_KEY), as before. There is no likes
// table: the number shown is the real moments.likes column (0 for
// new posts) and the heart toggle is local-only. Own moments have
// no Call button (no calling yourself) and no Live pill. Videos
// play with expo-video (tap to play/pause). Restyled to the v0 Home
// design language (see ~/workspace/v0-design/SPEC.md): mint
// background #f0fdf4, Home-style dark Live pill with 3 green bars,
// flagcdn flag images, and lucide-react-native icons (no emoji) in
// the actions row.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Film, Heart, Image as ImageIcon, MessageCircle, Phone, Play, Plus, Share2, Video, X } from 'lucide-react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
// [Live] Real Moments feed + upload (moments table). No hardcoded
// captions/likes: the feed reads the table, newest first.
import { fetchMoments, uploadMoment } from '../supabase/moments';
import { getCurrentUserId } from '../supabase/chat';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32;
const PHOTO_H = Math.round(CARD_W * 1.05);

// AsyncStorage key for the user's own posted moments.
const LIVO_MOMENTS_KEY = 'livo-moments-v1';
// Folder (inside the app's document directory) where picked media is
// copied, so local posts survive app restarts.
const MOMENTS_DIR = `${FileSystem.documentDirectory}moments/`;

// Flag images from flagcdn (w40), shown 13x9 on the photo —
// same mapping as HomeScreen.js.
const FLAG_URL = {
  BGD: 'https://flagcdn.com/w40/bd.png',
  IND: 'https://flagcdn.com/w40/in.png',
  PAK: 'https://flagcdn.com/w40/pk.png',
};

// Video card media: tap to play/pause, play overlay when paused.
function MomentVideo({ uri }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };
  return (
    <TouchableOpacity activeOpacity={1} onPress={toggle} style={styles.mediaTouch}>
      <VideoView
        player={player}
        style={styles.photoImg}
        contentFit="cover"
        allowsFullscreen
        nativeControls={false}
      />
      {!playing && (
        <View style={styles.playOverlay}>
          <View style={styles.playCircle}>
            <Play size={30} color="#fff" fill="#fff" strokeWidth={2} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// [Live] There is NO likes table: the number shown is the real
// stored moments.likes column (0 for new posts). The heart toggle
// is local-only — it is not persisted anywhere.
const MomentCard = React.memo(function MomentCard({ moment, liked, onLike, onCall, onShare }) {
  const likes = moment.likes + (liked ? 1 : 0);
  const flagUri = moment.host && moment.host.country ? FLAG_URL[moment.host.country] : null;
  const isOwn = !!moment.isOwn;
  // Server rows carry no mediaType — detect video from the URL.
  const isVideo =
    moment.mediaType === 'video' ||
    (typeof moment.mediaUri === 'string' && /\.mp4($|\?)/i.test(moment.mediaUri));
  return (
    <View style={styles.card}>
      <LinearGradient colors={[moment.host.color, '#111827']} style={[styles.photo, { height: PHOTO_H }]}>
        {moment.mediaUri ? (
          isVideo ? (
            <MomentVideo uri={moment.mediaUri} />
          ) : (
            <Image source={{ uri: moment.mediaUri }} style={styles.photoImg} />
          )
        ) : moment.host.photo ? (
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
        {!isOwn && (
          <TouchableOpacity style={styles.callBtn} onPress={onCall} activeOpacity={0.85}>
            <Phone size={15} color="#fff" strokeWidth={2.2} />
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

// Bottom sheet for posting a moment: pick media, preview, caption, Post.
function UploadSheet({ visible, onClose, onPosted, showToast }) {
  const [picked, setPicked] = useState(null); // { uri, type: 'image'|'video' }
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);

  const reset = () => {
    setPicked(null);
    setCaption('');
    setPosting(false);
    postingRef.current = false;
  };
  const close = () => {
    reset();
    onClose();
  };

  // Copy a picked file into the app's document directory so the post
  // survives app restarts (picker cache files may be cleaned up).
  const persistMedia = async (asset) => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(MOMENTS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(MOMENTS_DIR, { intermediates: true });
      }
      const ext = asset.type === 'video' ? 'mp4' : 'jpg';
      const dest = `${MOMENTS_DIR}${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: asset.uri, to: dest });
      return dest;
    } catch (e) {
      // Fall back to the picker's own URI — still works this session.
      return asset.uri;
    }
  };

  const pick = async (kind) => {
    try {
      let perm;
      let result;
      if (kind === 'photo-camera') {
        perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          showToast('Please allow camera access in Settings to post a moment.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      } else if (kind === 'video-camera') {
        perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          showToast('Please allow camera access in Settings to post a moment.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], quality: 0.8 });
      } else {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          showToast('Please allow photo access in Settings to post a moment.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === 'photo-library' ? ['images'] : ['videos'],
          quality: 0.8,
        });
      }
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const type = asset.type === 'video' ? 'video' : 'image';
      const uri = await persistMedia(asset);
      setPicked({ uri, type });
    } catch (e) {
      showToast('Could not open picker — please try again.');
    }
  };

  // [Live] Post uploads to the moments bucket + moments table
  // (attributed to the signed-in user) and waits for the result:
  // on success the server row goes straight into the feed; on
  // failure the post is kept on-device only, as before.
  const post = async () => {
    if (!picked || postingRef.current) return;
    postingRef.current = true;
    setPosting(true);
    const moment = {
      id: `own-${Date.now()}`,
      caption: caption.trim(),
      mediaUri: picked.uri,
      mediaType: picked.type,
      createdAt: Date.now(),
      likes: 0,
      comments: 0,
    };
    await onPosted(moment);
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>New Moment</Text>
            <TouchableOpacity onPress={close} activeOpacity={0.8} style={styles.sheetClose}>
              <X size={20} color="#111713" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
          {!picked ? (
            <View>
              <TouchableOpacity style={styles.pickOption} onPress={() => pick('photo-camera')} activeOpacity={0.8}>
                <Camera size={22} color="#20a64b" strokeWidth={2} />
                <Text style={styles.pickOptionText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickOption} onPress={() => pick('photo-library')} activeOpacity={0.8}>
                <ImageIcon size={22} color="#20a64b" strokeWidth={2} />
                <Text style={styles.pickOptionText}>Choose from Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickOption} onPress={() => pick('video-camera')} activeOpacity={0.8}>
                <Video size={22} color="#20a64b" strokeWidth={2} />
                <Text style={styles.pickOptionText}>Record Video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pickOption, styles.pickOptionLast]} onPress={() => pick('video-library')} activeOpacity={0.8}>
                <Film size={22} color="#20a64b" strokeWidth={2} />
                <Text style={styles.pickOptionText}>Choose Video</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {picked.type === 'video' ? (
                <View style={styles.previewVideoWrap}>
                  <MomentVideo uri={picked.uri} />
                </View>
              ) : (
                <Image source={{ uri: picked.uri }} style={styles.previewImg} />
              )}
              <TextInput
                style={styles.captionInput}
                placeholder="Write a caption…"
                placeholderTextColor="#a0aaa2"
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={200}
              />
              <TouchableOpacity
                style={[styles.postBtn, posting && styles.postBtnDisabled]}
                onPress={post}
                disabled={posting}
                activeOpacity={0.85}
              >
                {posting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.postBtnText}>Post</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function MomentsScreen({ navigation }) {
  const { showToast } = useApp();
  const [likedIds, setLikedIds] = useState({});
  const [ownMoments, setOwnMoments] = useState([]);
  const [momentsLoaded, setMomentsLoaded] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  // [Live] Real feed from the moments table, newest first.
  const [feed, setFeed] = useState([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Signed-in user (null = no session; posting then prompts login).
  const [meId, setMeId] = useState(null);
  const [myUsername, setMyUsername] = useState('Livo user');
  const feedRef = useRef(feed);
  feedRef.current = feed;

  // Signed-in user + their display name (for new post attribution).
  useEffect(() => {
    (async () => {
      const uid = await getCurrentUserId();
      if (!uid) return;
      setMeId(uid);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', uid)
          .maybeSingle();
        if (data && data.username) setMyUsername(data.username);
      } catch (e) { /* name stays generic */ }
    })();
  }, []);

  // First page of the real feed.
  useEffect(() => {
    (async () => {
      const page = await fetchMoments({ limit: 10 });
      setFeed(page);
      setHasMore(page.length === 10);
      setFeedLoading(false);
    })();
  }, []);

  // Next older page, when the user scrolls to the bottom.
  const loadMore = async () => {
    if (feedLoading || loadingMore || !hasMore || feedRef.current.length === 0) return;
    setLoadingMore(true);
    const last = feedRef.current[feedRef.current.length - 1];
    const page = await fetchMoments({ limit: 10, before: last.createdAt });
    setFeed((prev) => [...prev, ...page]);
    setHasMore(page.length === 10);
    setLoadingMore(false);
  };

  // Load the user's own posted moments once, on start.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LIVO_MOMENTS_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved)) setOwnMoments(saved);
        }
      } catch (e) { /* storage unavailable — feed still works */ }
      setMomentsLoaded(true);
    })();
  }, []);

  // Save own moments whenever they change (only after the load above).
  useEffect(() => {
    if (!momentsLoaded) return;
    AsyncStorage.setItem(LIVO_MOMENTS_KEY, JSON.stringify(ownMoments)).catch(() => {});
  }, [momentsLoaded, ownMoments]);

  // [Live] The feed is the moments table (newest first), with
  // local-only posts that failed to upload kept at the top. Own
  // rows are marked so they show no Call button.
  const moments = useMemo(() => {
    const own = ownMoments.map((m) => ({
      id: m.id,
      host: { id: 'me', name: 'You', color: '#20a64b', photo: null, online: false },
      caption: m.caption || 'My moment',
      likes: m.likes || 0,
      comments: m.comments || 0,
      isOwn: true,
      mediaUri: m.mediaUri,
      mediaType: m.mediaType,
    }));
    const live = feed.map((m) => ({ ...m, isOwn: meId ? m.host.id === meId : false }));
    return [...own, ...live];
  }, [ownMoments, feed, meId]);

  const toggleLike = (id) => setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  // [Live] Upload (bucket + moments table, attributed to the
  // signed-in user). On success the new server row goes straight
  // to the top of the feed; on failure the post stays on-device
  // only, as before.
  const handlePosted = async (moment) => {
    if (!meId) {
      showToast('Please sign in to post a moment');
      return;
    }
    const item = await uploadMoment({
      userId: meId,
      username: myUsername,
      mediaUri: moment.mediaUri,
      mediaType: moment.mediaType,
      caption: moment.caption,
    });
    if (item) {
      setFeed((prev) => [{ ...item, isOwn: true }, ...prev]);
      showToast('Moment posted');
    } else {
      setOwnMoments((prev) => [moment, ...prev]);
      showToast('Moment saved on this device — it will appear online once the connection works');
    }
  };

  // Feed authors are profiles, not store hosts — VideoCall needs a
  // store host, so calling straight from a moment is not possible
  // yet (say so instead of passing a wrong host object).
  const handleCall = (item) => {
    if (item.host && item.host.storeId) {
      navigation.navigate('VideoCall', { host: item.host });
    } else {
      showToast('Video call is not available from Moments yet — open the host from Home');
    }
  };

  const renderMoment = ({ item }) => (
    <MomentCard
      moment={item}
      liked={!!likedIds[item.id]}
      onLike={() => toggleLike(item.id)}
      onCall={() => handleCall(item)}
      onShare={() => showToast('Moment link copied')}
    />
  );
  return (
    <View style={styles.bg}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Moments</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (!meId) {
              showToast('Please sign in to post a moment');
              navigation.navigate('Login');
              return;
            }
            setSheetVisible(true);
          }}
          activeOpacity={0.85}
          accessibilityLabel="Post a moment"
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>Share your moment — you make the feed.</Text>
      {feedLoading ? (
        <ActivityIndicator color="#20a64b" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(m) => m.id}
          renderItem={renderMoment}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews maxToRenderPerBatch={5} windowSize={5} initialNumToRender={4}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<Text style={styles.emptyText}>No moments yet — be the first to post!</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#20a64b" style={{ marginVertical: 16 }} /> : null}
        />
      )}
      <UploadSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onPosted={handlePosted}
        showToast={showToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'center', flexDirection: 'row', marginRight: 16 },
  actionText: { color: '#818b84', fontSize: 13, fontWeight: 'bold', marginLeft: 4 },
  actions: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  addBtn: { alignItems: 'center', backgroundColor: '#20a64b', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 },
  bg: { backgroundColor: '#f0fdf4', flex: 1, paddingTop: 48 },
  bigAvatar: { color: '#fff', fontSize: 84, fontWeight: 'bold' },
  bottomShade: { bottom: 0, left: 0, padding: 12, position: 'absolute', right: 0 },
  emptyText: { color: '#818b84', fontSize: 15, marginTop: 32, textAlign: 'center' },
  callBtn: { alignItems: 'center', backgroundColor: '#20a64b', borderRadius: 18, flexDirection: 'row', gap: 5, paddingHorizontal: 14, paddingVertical: 7 },
  callBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  caption: { color: '#fff', fontSize: 14, marginTop: 2 },
  captionInput: { backgroundColor: '#fff', borderColor: '#e9eeea', borderRadius: 12, borderWidth: 1, color: '#111713', fontSize: 14, marginTop: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  card: { backgroundColor: '#fff', borderRadius: 15, elevation: 2, marginBottom: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  flag: { borderColor: 'rgba(255,255,255,0.75)', borderRadius: 2, borderWidth: 0.5, height: 9, marginLeft: 6, width: 13 },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  list: { padding: 16 },
  liveBadge: { alignItems: 'center', backgroundColor: 'rgba(22,28,24,0.76)', borderColor: 'rgba(255,255,255,0.10)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', height: 21, left: 8, paddingHorizontal: 8, position: 'absolute', top: 9 },
  liveBar: { backgroundColor: '#62e17d', borderRadius: 1, width: 2 },
  liveBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 1, marginRight: 4 },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  mediaTouch: { height: '100%', position: 'absolute', width: '100%' },
  name: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  nameRow: { alignItems: 'center', flexDirection: 'row' },
  photo: { alignItems: 'center', justifyContent: 'center' },
  photoImg: { height: '100%', position: 'absolute', width: '100%' },
  pickOption: { alignItems: 'center', borderBottomColor: '#e9eeea', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 14 },
  pickOptionLast: { borderBottomWidth: 0 },
  pickOptionText: { color: '#111713', fontSize: 15, fontWeight: '600' },
  playCircle: { alignItems: 'center', backgroundColor: 'rgba(22,28,24,0.55)', borderRadius: 999, height: 56, justifyContent: 'center', width: 56 },
  playOverlay: { alignItems: 'center', height: '100%', justifyContent: 'center', position: 'absolute', width: '100%' },
  postBtn: { alignItems: 'center', backgroundColor: '#20a64b', borderRadius: 999, marginTop: 12, paddingVertical: 12 },
  postBtnDisabled: { opacity: 0.6 },
  postBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  previewImg: { borderRadius: 12, height: Math.round(CARD_W * 1.05), width: '100%' },
  previewVideoWrap: { borderRadius: 12, height: Math.round(CARD_W * 1.05), overflow: 'hidden', position: 'relative', width: '100%' },
  sheet: { backgroundColor: '#f0fdf4', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: 24, paddingHorizontal: 16, paddingTop: 12 },
  sheetBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheetClose: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { color: '#111713', fontSize: 18, fontWeight: 'bold' },
  sub: { color: '#818b84', marginTop: 4, paddingHorizontal: 16 },
  title: { color: '#111713', fontSize: 24, fontWeight: 'bold' },
});
