// ─────────────────────────────────────────────────────────────────
// Gift animation overlay — plays a gift's uploaded animation
// (public.gifts.animation_url, set from the Mother Panel) as a
// full-screen overlay on the Live Room / Video Call screen when
// that gift is sent. Video (mp4/webm/mov) via expo-av, GIF via
// Image, SVGA (.svga) via the native SVGA player (SvgaPlayer —
// fail-soft: on APKs without the native module it reports an
// error instead of rendering). Auto-dismisses when the video /
// SVGA finishes, or after ~3s for a GIF. Never crashes, never
// blocks the gift flow: ANY load/play failure reports through
// onError and the parent falls back to the existing emoji gift
// effect (FullScreenGift for expensive gifts in a call, hearts +
// chat line in a room).
// Exactly one of onDone / onError ever fires per showing.
// pointerEvents="none" so it never blocks the call controls.
// ─────────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Video } from 'expo-av';
import SvgaPlayer from './SvgaPlayer';

const GIF_DISMISS_MS = 3000;
// Safety net: a video that never reports finished / error still
// goes away on its own (a stuck overlay must never cover a call).
const VIDEO_MAX_MS = 8000;

// The app's gift rows carry the URL as `animationUrl` (mapped in
// src/supabase/live.js); accept the raw column name too so a
// future caller passing the DB row directly still works.
export function giftAnimationUrl(gift) {
  if (!gift) return null;
  const url = gift.animationUrl || gift.animation_url || null;
  return typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
}

function isGifUrl(url) {
  return /\.gif(\?|#|$)/i.test(url);
}

function isSvgaUrl(url) {
  return /\.svga(\?|#|$)/i.test(url);
}

export default function GiftAnimationOverlay({ gift, senderName, visible, onDone, onError }) {
  const url = giftAnimationUrl(gift);
  const isGif = url ? isGifUrl(url) : false;
  const isSvga = url ? isSvgaUrl(url) : false;
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  // Finish exactly once, however many signals arrive (video
  // finished + safety timer, error + timer, re-renders, ...).
  const finish = (kind) => {
    if (doneRef.current) return;
    doneRef.current = true;
    try {
      if (kind === 'error') {
        if (onErrorRef.current) onErrorRef.current(gift);
      } else if (onDoneRef.current) {
        onDoneRef.current();
      }
    } catch (e) {
      // A parent callback must never crash the overlay.
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!visible || !gift || !url) return undefined;
    doneRef.current = false;
    // GIFs have no "finished" event — dismiss after ~3s. Videos
    // and SVGA dismiss on finished; the timer below is only the
    // safety net in case that event never arrives.
    const timer = setTimeout(() => finishRef.current('done'), isGif ? GIF_DISMISS_MS : VIDEO_MAX_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, gift, url, isGif, isSvga]);

  if (!visible || !gift || !url) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.dim} />
      <View style={styles.content}>
        {isSvga ? (
          <SvgaPlayer
            source={url}
            style={styles.media}
            loops={1}
            onFinished={() => finishRef.current('done')}
            onError={() => finishRef.current('error')}
          />
        ) : isGif ? (
          <Image
            source={{ uri: url }}
            style={styles.media}
            resizeMode="contain"
            onError={() => finishRef.current('error')}
          />
        ) : (
          <Video
            source={{ uri: url }}
            style={styles.media}
            resizeMode={Video.RESIZE_MODE_CONTAIN}
            shouldPlay
            isMuted
            useNativeControls={false}
            onPlaybackStatusUpdate={(status) => {
              try {
                if (status && status.didJustFinish) finishRef.current('done');
                if (status && status.error) finishRef.current('error');
              } catch (e) {
                // Never let a status callback crash the call screen.
              }
            }}
            onError={() => finishRef.current('error')}
          />
        )}
        <Text style={styles.senderText}>{senderName || 'You'} sent</Text>
        <Text style={styles.giftText}>
          {gift.emoji || '🎁'} {gift.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  media: {
    height: 260,
    width: '78%',
  },
  senderText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 18,
    textAlign: 'center',
  },
  giftText: {
    color: '#fbbf24',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
});
