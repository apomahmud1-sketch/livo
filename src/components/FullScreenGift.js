// ─────────────────────────────────────────────────────────────────
// F5 — Full-screen gift animation (expensive gifts only).
// Plays when the viewer sends a gift costing >= 1000 coins
// (Sports Car 2999, Rocket 4999, Castle 9999 — see GIFTS in
// src/config.js). React Native Animated ONLY, no new deps.
// One progress value (0 → 1 over 3000 ms) drives everything:
// the gift emoji pops in with an overshoot scale + wobble,
// two glowing rings (gold, then pink) expand and fade, 14 sparkle
// particles fly out radially from the centre, a light dim fades
// in over the video, and a text block slides up — then it all
// fades out. Auto-dismisses after exactly 3000 ms via onDone.
// pointerEvents="none" so it never blocks the call controls.
// All animated props are opacity / transform only, so the
// animation runs on the native driver.
// NOTE: onDone is kept in a ref — the parent (VideoCallScreen)
// re-renders every second for the call timer, and a fresh inline
// callback would restart the animation and its dismiss timer.
// ─────────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const DURATION_MS = 3000;

// 14 sparkles, cycling through 5 symbols, spread evenly around
// a full circle (one every ~25.7°).
const SPARKLES = ['✨', '💫', '⭐', '💎', '🌟', '✨', '💫', '⭐', '💎', '🌟', '✨', '💫', '⭐', '💎'];
const SPARKLE_COUNT = 14;
const SPARKLE_RADIUS = 130;

export default function FullScreenGift({ gift, senderName, visible, onDone }) {
  const progress = useRef(new Animated.Value(0)).current;
  const onDoneRef = useRef(onDone);
  // Always the latest callback — the parent re-renders every
  // second (call timer) and hands us a fresh inline onDone.
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!visible || !gift) return undefined;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      useNativeDriver: true,
    });
    anim.start();
    const timer = setTimeout(() => {
      if (onDoneRef.current) onDoneRef.current();
    }, DURATION_MS);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [visible, gift, progress]);

  if (!visible || !gift) return null;

  // ── Derived animations (all opacity / transform only) ──
  // Light dim over the video: in fast, hold, out at the end.
  const dimOpacity = progress.interpolate({
    inputRange: [0, 0.12, 0.85, 1],
    outputRange: [0, 0.35, 0.35, 0],
  });
  // Whole overlay fades out in the last stretch.
  const fadeOut = progress.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 1, 0],
  });
  // Gift emoji: pop in with overshoot, then settle.
  const giftScale = progress.interpolate({
    inputRange: [0, 0.12, 0.2, 0.3, 1],
    outputRange: [0, 1.25, 0.95, 1, 1],
  });
  // Wobble rotation while it pops in, then straight.
  const giftRotate = progress.interpolate({
    inputRange: [0, 0.1, 0.2, 0.3, 0.4, 1],
    outputRange: ['0deg', '-12deg', '10deg', '-6deg', '0deg', '0deg'],
  });
  // Ring 1 (gold): expands and fades, starting first.
  const ring1Scale = progress.interpolate({
    inputRange: [0.08, 0.6],
    outputRange: [0.5, 2.4],
  });
  const ring1Opacity = progress.interpolate({
    inputRange: [0.08, 0.2, 0.6],
    outputRange: [0, 0.9, 0],
  });
  // Ring 2 (pink): same move, starting a beat later.
  const ring2Scale = progress.interpolate({
    inputRange: [0.22, 0.75],
    outputRange: [0.5, 2.4],
  });
  const ring2Opacity = progress.interpolate({
    inputRange: [0.22, 0.34, 0.75],
    outputRange: [0, 0.9, 0],
  });
  // Text block: slides up from below, holds, drifts up as it fades.
  const textTranslateY = progress.interpolate({
    inputRange: [0, 0.25, 0.85, 1],
    outputRange: [40, 0, 0, -20],
  });
  const textOpacity = progress.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.dim, { opacity: dimOpacity }]} />
      <Animated.View style={[styles.content, { opacity: fadeOut }]}>
        <Animated.View
          style={[styles.ring, styles.ringGold, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]}
        />
        <Animated.View
          style={[styles.ring, styles.ringPink, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] }]}
        />
        {SPARKLES.slice(0, SPARKLE_COUNT).map((symbol, i) => {
          const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
          const dx = Math.cos(angle) * SPARKLE_RADIUS;
          const dy = Math.sin(angle) * SPARKLE_RADIUS;
          const translateX = progress.interpolate({
            inputRange: [0.1, 0.7],
            outputRange: [0, dx],
          });
          const translateY = progress.interpolate({
            inputRange: [0.1, 0.7],
            outputRange: [0, dy],
          });
          const sparkleOpacity = progress.interpolate({
            inputRange: [0.1, 0.25, 0.7, 0.85],
            outputRange: [0, 1, 1, 0],
          });
          return (
            <Animated.Text
              key={i}
              style={[styles.sparkle, { opacity: sparkleOpacity, transform: [{ translateX }, { translateY }] }]}
            >
              {symbol}
            </Animated.Text>
          );
        })}
        <Animated.Text style={[styles.giftEmoji, { transform: [{ scale: giftScale }, { rotate: giftRotate }] }]}>
          {gift.emoji}
        </Animated.Text>
        <Animated.View style={[styles.textBlock, { opacity: textOpacity, transform: [{ translateY: textTranslateY }] }]}>
          <Text style={styles.senderText}>{senderName} sent</Text>
          <Text style={styles.giftText}>
            {gift.emoji} {gift.name}
          </Text>
          <Text style={styles.priceText}>🪙 {gift.price} coins</Text>
        </Animated.View>
      </Animated.View>
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
    backgroundColor: '#000',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderRadius: 100,
    borderWidth: 3,
    height: 200,
    position: 'absolute',
    width: 200,
  },
  ringGold: {
    borderColor: '#fbbf24',
    shadowColor: '#fbbf24',
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  ringPink: {
    borderColor: '#ec4899',
    shadowColor: '#ec4899',
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  sparkle: {
    fontSize: 22,
    position: 'absolute',
  },
  giftEmoji: {
    fontSize: 110,
    textAlign: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginTop: 24,
  },
  senderText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  giftText: {
    color: '#fbbf24',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
  priceText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
    textAlign: 'center',
  },
});
