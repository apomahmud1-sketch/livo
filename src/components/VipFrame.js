// Livo VipFrame — animated avatar frame (Lottie) that wraps an avatar.
// Gold = VIP frame, purple = Dynamic frame. Both JSONs live in
// assets/frames (made with the Frame Designer). The animation loops
// forever; if a JSON ever fails to load, LottieView renders nothing
// and the avatar underneath still shows.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

const FRAMES = {
  gold: require('../../assets/frames/vip-gold-frame.json'),
  purple: require('../../assets/frames/dynamic-purple-frame.json'),
};

export default function VipFrame({ frame = 'gold', size, children }) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {children}
      <LottieView
        source={FRAMES[frame] || FRAMES.gold}
        autoPlay
        loop
        style={[styles.lottie, { width: size, height: size }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  lottie: { position: 'absolute' },
});
