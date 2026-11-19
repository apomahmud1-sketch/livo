// Livo — Voice changer [F7]
// Changes the local user's voice in a live 1-to-1 call / live room
// with Agora's built-in voice presets. No new dependency — it calls
// the engine methods of react-native-agora (already in package.json).
//
// ── API names — VERIFIED against the react-native-agora 4.4.0
// package typings (lib/typescript/src/IAgoraRtcEngine.d.ts and
// AgoraBase.d.ts), not from memory. Method names, enum member names
// and numeric values below match v4.4.0 exactly:
//   engine.setVoiceBeautifierPreset(preset: VoiceBeautifierPreset)
//   engine.setAudioEffectPreset(preset: AudioEffectPreset)
//   engine.setVoiceConversionPreset(preset: VoiceConversionPreset)
//   (also exist: setLocalVoicePitch, setLocalVoiceEqualization,
//   setLocalVoiceReverb — not used here; the presets cover the UI.)
//
// The three preset families overwrite each other in the SDK, so
// applying a preset ALWAYS resets all three to Off first, then
// applies the chosen one. The engine is a shared singleton (see
// src/agora/LiveVideo.js), so the voice is also reset when a call
// ends — otherwise the effect would leak into the next call.
//
// This module NEVER throws: a missing engine, a missing method or a
// failed call just returns false and the UI keeps the previous
// voice (or Normal). The preset VALUES are resolved from the live
// Agora lib enums when available; the numeric fallbacks below are
// the exact values from the 4.4.0 typings, used only if the enum
// object cannot be loaded (e.g. Expo Go).

const VOICE_PRESET_NORMAL = 'normal';

// kind: which Agora method applies this preset.
// enumObject / enumMember: the live lib enum to read the value from.
// value: the exact numeric value from the 4.4.0 typings (fallback).
export const VOICE_PRESETS = [
  {
    id: 'normal', label: 'Normal', emoji: '🎙️', hint: 'Your real voice',
    kind: 'off',
  },
  {
    id: 'deep', label: 'Deep', emoji: '🎩', hint: 'Low, deep voice',
    kind: 'beautifier', method: 'setVoiceBeautifierPreset',
    enumObject: 'VoiceBeautifierPreset', enumMember: 'TimbreTransformationDeep',
    value: 16974336,
  },
  {
    id: 'magnetic', label: 'Magnetic', emoji: '🧲', hint: 'Warm, magnetic voice',
    kind: 'beautifier', method: 'setVoiceBeautifierPreset',
    enumObject: 'VoiceBeautifierPreset', enumMember: 'ChatBeautifierMagnetic',
    value: 16843008,
  },
  {
    id: 'fresh', label: 'Fresh', emoji: '🌿', hint: 'Bright, fresh voice',
    kind: 'beautifier', method: 'setVoiceBeautifierPreset',
    enumObject: 'VoiceBeautifierPreset', enumMember: 'ChatBeautifierFresh',
    value: 16843264,
  },
  {
    id: 'falsetto', label: 'Cute', emoji: '🐰', hint: 'High, cute voice',
    kind: 'beautifier', method: 'setVoiceBeautifierPreset',
    enumObject: 'VoiceBeautifierPreset', enumMember: 'TimbreTransformationFalsetto',
    value: 16974848,
  },
  {
    id: 'girl', label: 'Girl', emoji: '👧', hint: 'Girl voice',
    kind: 'effect', method: 'setAudioEffectPreset',
    enumObject: 'AudioEffectPreset', enumMember: 'VoiceChangerEffectGirl',
    value: 33686784,
  },
  {
    id: 'boy', label: 'Boy', emoji: '👦', hint: 'Boy voice',
    kind: 'effect', method: 'setAudioEffectPreset',
    enumObject: 'AudioEffectPreset', enumMember: 'VoiceChangerEffectBoy',
    value: 33686272,
  },
  {
    id: 'uncle', label: 'Uncle', emoji: '👨', hint: 'Uncle voice',
    kind: 'effect', method: 'setAudioEffectPreset',
    enumObject: 'AudioEffectPreset', enumMember: 'VoiceChangerEffectUncle',
    value: 33685760,
  },
  {
    id: 'hulk', label: 'Monster', emoji: '👹', hint: 'Deep monster voice',
    kind: 'effect', method: 'setAudioEffectPreset',
    enumObject: 'AudioEffectPreset', enumMember: 'VoiceChangerEffectHulk',
    value: 33687296,
  },
];

export function getVoicePreset(presetId) {
  const found = VOICE_PRESETS.find((p) => p.id === presetId);
  return found || VOICE_PRESETS[0];
}

export function getVoicePresetLabel(presetId) {
  return getVoicePreset(presetId).label;
}

// ── Lazy load of the Agora lib (same pattern as LiveVideo.js) ──
// react-native-agora only works in a dev build / EAS build; in Expo
// Go the require throws, and we fall back to the numeric values.
let AgoraLib = null;
let agoraLoadFailed = false;

function loadAgoraLib() {
  if (AgoraLib || agoraLoadFailed) {
    return AgoraLib;
  }
  try {
    // eslint-disable-next-line global-require
    AgoraLib = require('react-native-agora');
    return AgoraLib;
  } catch (e) {
    agoraLoadFailed = true;
    return null;
  }
}

// Resolve a preset's numeric value: live enum first, verified
// numeric fallback second. Never throws.
function resolvePresetValue(preset) {
  try {
    const lib = loadAgoraLib();
    const enumObj = lib && lib[preset.enumObject];
    const live = enumObj && enumObj[preset.enumMember];
    if (typeof live === 'number') return live;
  } catch (e) {
    // Fall through to the numeric value.
  }
  return preset.value;
}

function callEngine(engine, method, value) {
  if (!engine || typeof engine[method] !== 'function') return false;
  try {
    const code = engine[method](value);
    // Agora returns 0 on success. (A mock / stub may return
    // undefined — treat that as success, not failure.)
    return code === 0 || code === undefined;
  } catch (e) {
    return false;
  }
}

// Turn every voice effect off. Safe with a null engine or a missing
// method. Returns true when an engine was present.
export function resetVoicePreset(engine) {
  if (!engine || typeof engine !== 'object') return false;
  const lib = loadAgoraLib();
  const off = (method, enumObject, member) => {
    let value = 0;
    try {
      const enumObj = lib && lib[enumObject];
      const live = enumObj && enumObj[member];
      if (typeof live === 'number') value = live;
    } catch (e) {
      // Off is 0 in every preset enum — the fallback is exact.
    }
    callEngine(engine, method, value);
  };
  off('setVoiceBeautifierPreset', 'VoiceBeautifierPreset', 'VoiceBeautifierOff');
  off('setAudioEffectPreset', 'AudioEffectPreset', 'AudioEffectOff');
  off('setVoiceConversionPreset', 'VoiceConversionPreset', 'VoiceConversionOff');
  return true;
}

// Apply a voice preset to a live engine. Unknown ids fall back to
// Normal (all effects off). Returns true when the voice was applied
// (or reset to Normal), false when there is no usable engine.
// Never throws.
export function applyVoicePreset(engine, presetId) {
  if (!engine || typeof engine !== 'object') return false;
  const preset = getVoicePreset(presetId);
  resetVoicePreset(engine);
  if (preset.kind === 'off') return true;
  return callEngine(engine, preset.method, resolvePresetValue(preset));
}
