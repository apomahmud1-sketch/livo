// ─────────────────────────────────────────────────────────────────
// Livo — stable per-install device id (JS-only, OTA-safe).
//
// There is no native device-id module in the app (expo-application
// / expo-device are NOT installed, and adding one would need a new
// APK build). Instead the app keeps one random UUID per install in
// AsyncStorage ('livo-device-id') and registers it in the
// user_devices table on sign-in, so the Mother Panel can see how
// many devices an account uses and ban a device by id.
//
// The id is NOT hardware-bound: reinstalling the app (or clearing
// all app data) creates a new one. That is the documented trade-off
// of the JS-only approach — a hardware id would need a new native
// module + a new APK build.
// ─────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from './client';
import { withTimeout } from './timeout';

export const DEVICE_ID_KEY = 'livo-device-id';

// Returns the persistent device id for this install, creating and
// storing one on first use. Never throws — returns null only when
// storage itself is unusable. Storage reads are timeout-raced: the
// startup gate awaits this, and a stalled read must not hang the
// app on the loading screen (2026-11-24).
export async function getOrCreateDeviceId() {
  try {
    const existing = await withTimeout(AsyncStorage.getItem(DEVICE_ID_KEY));
    if (existing && typeof existing === 'string' && existing.length > 0) return existing;
    const fresh = Crypto.randomUUID();
    await withTimeout(AsyncStorage.setItem(DEVICE_ID_KEY, fresh));
    return fresh;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[Livo] device id unavailable:', e && e.message);
    return null;
  }
}

// Registers this device for the profile (upsert on
// (profile_id, device_id)) and refreshes last_seen. Best-effort:
// a failure must NEVER block sign-in — it only logs. The upsert is
// timeout-raced: the startup gate awaits it, and a stalled network
// request must not hang the app on the loading screen (2026-11-24).
export async function registerDevice(profileId, deviceId) {
  if (!supabase || !profileId || !deviceId) return false;
  try {
    const res = await withTimeout(
      supabase.from('user_devices').upsert(
        {
          profile_id: profileId,
          device_id: deviceId,
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'profile_id,device_id' },
      ),
    );
    if (!res || res.error) {
      // eslint-disable-next-line no-console
      console.log('[Livo] user_devices upsert failed:', res && res.error ? res.error.message : 'timed out');
      return false;
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[Livo] user_devices upsert failed:', e && e.message);
    return false;
  }
}
