// ─────────────────────────────────────────────────────────────────
// SvgaPlayer — plays a .svga animation (VIP entry effects, animated
// gifts/frames) via react-native-svga-player (native SVGAPlayer SDK).
// Fail-soft by design: the native view only exists in APKs built
// AFTER the library was added. If this JS is delivered by OTA to an
// older APK without the native module, the view manager is absent —
// hasViewManagerConfig() catches that BEFORE render, and any other
// render failure is caught by the error boundary, so the parent
// falls back to its emoji/video path instead of crashing the screen.
// Props: { source (URL string), style, loops (default 1 = play once),
//   onFinished, onError }.
// ─────────────────────────────────────────────────────────────────
import React from 'react';
import { UIManager } from 'react-native';

let RNSvgaPlayer = null;
try {
  // eslint-disable-next-line global-require
  const mod = require('react-native-svga-player');
  RNSvgaPlayer = (mod && mod.default) || mod || null;
} catch (e) {
  RNSvgaPlayer = null;
}

function nativeSvgaAvailable() {
  try {
    if (!RNSvgaPlayer) return false;
    if (UIManager && typeof UIManager.hasViewManagerConfig === 'function') {
      return UIManager.hasViewManagerConfig('RNSvgaPlayer');
    }
    return true;
  } catch (e) {
    return false;
  }
}

class SvgaPlayer extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: false };
    this.available = nativeSvgaAvailable();
    if (!this.available && typeof props.onError === 'function') {
      // Let the parent fall back (emoji effect) instead of showing
      // an empty overlay. Async so it never fires during render.
      setTimeout(() => {
        try {
          props.onError();
        } catch (e) {
          // Never let the fallback callback crash the overlay.
        }
      }, 0);
    }
  }

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch() {
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError();
      } catch (e) {
        // Never let the fallback callback crash the overlay.
      }
    }
  }

  render() {
    if (!this.available || this.state.error || !this.props.source) return null;
    return (
      <RNSvgaPlayer
        source={this.props.source}
        style={this.props.style}
        loops={typeof this.props.loops === 'number' ? this.props.loops : 1}
        onFinished={this.props.onFinished}
      />
    );
  }
}

export default SvgaPlayer;
