// Livo — runtime permission prompts (Hapa-style: ask at the right
// moment, never at launch).
//
// Notifications: asked once, right after the FIRST successful
// Google sign-in (App.js SIGNED_IN). Android 13+ only — older
// Android grants notifications at install time.
//   NOTE: the system dialog only appears when POST_NOTIFICATIONS
//   is declared in AndroidManifest.xml. It is added to app.json
//   (android.permissions) and the local build-script guard, so the
//   NEXT native build includes it. On the current APK the request
//   below resolves 'never_ask_again' without a dialog and is a
//   harmless no-op.
// Microphone + camera: asked before joining an Agora channel as a
// publisher (LiveVideo, role 'host') — i.e. when the user taps Go
// Live or answers a call. Viewers (audience) are never asked.
//   Mic uses the Expo API (expo-av Audio.requestPermissionsAsync);
//   camera uses PermissionsAndroid (no expo-camera module in this
//   build). Both permissions are already declared in the manifest,
//   so these dialogs work with this OTA.
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

// In-memory guard so the notification prompt can never fire twice
// in one app run (AsyncStorage on a nearly-full phone can fail to
// persist the flag — see App.js AuthContext note).
const notifAskedInRun = new Set();

export async function requestNotificationPermission(userId) {
  if (Platform.OS !== 'android' || !userId) return false;
  if (notifAskedInRun.has(userId)) return false;
  notifAskedInRun.add(userId);
  try {
    const key = `livo_notif_prompt_done:${userId}`;
    const done = await AsyncStorage.getItem(key);
    if (done) return false;
    await AsyncStorage.setItem(key, '1');
  } catch (e) {
    // Storage failure must never block the prompt — continue.
  }
  // Below Android 13 notifications are granted at install.
  if (Platform.Version < 33) return true;
  // Let the sign-in transition finish before the dialog pops.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    return false;
  }
}

// Ask for mic (+ camera for video) before joining a call as a
// publisher. Already-granted permissions resolve instantly with no
// dialog. Never throws; a denial never blocks the join — the call
// still connects for receiving, and the local tracks simply stay
// unpublished.
export async function requestCallPermissions({ audioOnly = false } = {}) {
  const result = { mic: false, camera: false };
  try {
    const mic = await Audio.requestPermissionsAsync();
    result.mic = mic && mic.status === 'granted';
  } catch (e) {
    // Fall through — camera may still be requested.
  }
  if (!audioOnly) {
    try {
      const cam = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      result.camera = cam === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      // Ignore.
    }
  } else {
    result.camera = true; // Voice call: no camera needed.
  }
  return result;
}
