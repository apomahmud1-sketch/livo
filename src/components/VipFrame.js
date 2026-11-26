// Livo VipFrame — animated avatar frame (Lottie) that wraps an avatar.
// The frame comes from the LIVE frames catalog (panel → frames
// table → store `frames`), passed in as the `frames` prop. The
// catalog row's file_name resolves to a bundled Lottie JSON when
// it matches a local asset, or to a remote URL when it is one.
// Honest empty state: when the catalog is empty or has no row for
// this frame id, the avatar renders with NO frame overlay — never
// a fake frame. When a catalog row exists but has no playable
// animation, its panel colour is shown as a ring instead.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

// Bundled frame animations (made with the Frame Designer), keyed
// by file name so a catalog row's file_name can find its local
// asset. Remote file_name values (http(s) URLs) are loaded by
// LottieView directly instead.
const LOCAL_FRAMES_BY_FILE = {
  'vip-gold-frame.json': require('../../assets/frames/vip-gold-frame.json'),
  'dynamic-purple-frame.json': require('../../assets/frames/dynamic-purple-frame.json'),
};
const LOCAL_FRAMES_BY_ID = {
  gold: LOCAL_FRAMES_BY_FILE['vip-gold-frame.json'],
  purple: LOCAL_FRAMES_BY_FILE['dynamic-purple-frame.json'],
};

function resolveAnimation(row, frameId) {
  const fileName = row && typeof row.fileName === 'string' ? row.fileName : '';
  if (fileName) {
    const base = fileName.split('/').pop();
    if (LOCAL_FRAMES_BY_FILE[base]) return LOCAL_FRAMES_BY_FILE[base];
    if (/^https?:\/\//i.test(fileName)) return { uri: fileName };
  }
  if (frameId && LOCAL_FRAMES_BY_ID[frameId]) return LOCAL_FRAMES_BY_ID[frameId];
  return null;
}

export default function VipFrame({ frame = 'gold', size, children, frames }) {
  const catalog = Array.isArray(frames) ? frames : [];
  const row = catalog.find((f) => f && f.id === frame) || null;
  // No catalog row for this frame (catalog empty / not loaded /
  // frame not in it): honest empty state — avatar only, no frame.
  if (!row) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        {children}
      </View>
    );
  }
  const animation = resolveAnimation(row, frame);
  if (animation) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        {children}
        <LottieView
          source={animation}
          autoPlay
          loop
          style={[styles.lottie, { width: size, height: size }]}
        />
      </View>
    );
  }
  // Catalog row exists but no playable animation: show the
  // panel's frame colour as a ring (or a plain ring with no colour).
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {children}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: row.color || '#d4af37',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  lottie: { position: 'absolute' },
  ring: { borderWidth: 3, position: 'absolute' },
});
