// F6 — AI Smart Match card (modal).
// Shows the host pickSmartMatch chose, in the same style as the
// Home cards: gradient photo + initial, red LIVE badge, name,
// flag + country and language chips, and the per-minute rate
// from the real getCallRate(host.rateTier) in src/config.js.
//  • Call -> onCall: the parent navigates to 'VideoCall' with
//    { host }, exactly like tapping a Home card, so the normal
//    incoming screen and per-minute billing apply.
//  • Find another -> onFindAnother: re-rolls a new match.
//  • Close -> onClose.
// When host is null (nobody online) it shows "No hosts online
// right now." with a Try again button — no crash.
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, getCallRate } from '../config';

export default function SmartMatchCard({ visible, host, onCall, onFindAnother, onClose, onTryAgain }) {
  const rate = host ? getCallRate(host.rateTier) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {host ? (
            <>
              <Text style={styles.title}>✨ Your Smart Match</Text>
              <LinearGradient colors={[host.color, '#7c3aed']} style={styles.photo}>
                <Text style={styles.avatar}>{host.name[0]}</Text>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>● LIVE</Text>
                </View>
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.65)']}
                  style={styles.bottomShade}
                >
                  <Text style={styles.name}>{host.name}</Text>
                  <View style={styles.chips}>
                    <Text style={[styles.chip, styles.lv]}>Lv{host.level}</Text>
                    <Text style={styles.chip}>{host.flag} {host.country}</Text>
                    <Text style={styles.chip}>{host.lang}</Text>
                  </View>
                </LinearGradient>
              </LinearGradient>
              <Text style={styles.rate}>🪙 {rate.coinsPerMinute} coins / min</Text>
              <TouchableOpacity style={styles.callBtn} onPress={onCall} activeOpacity={0.85}>
                <Text style={styles.callText}>📹 Call {host.name}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.againBtn} onPress={onFindAnother} activeOpacity={0.85}>
                <Text style={styles.againText}>🔄 Find another</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>✨ Smart Match</Text>
              <Text style={styles.empty}>No hosts online right now.</Text>
              <TouchableOpacity style={styles.callBtn} onPress={onTryAgain} activeOpacity={0.85}>
                <Text style={styles.callText}>🔄 Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  againBtn: { alignItems: 'center', borderColor: COLORS.purple, borderRadius: 24, borderWidth: 1.5, marginTop: 10, paddingVertical: 12 },
  againText: { color: COLORS.purple, fontSize: 16, fontWeight: 'bold' },
  avatar: { color: '#fff', fontSize: 64, fontWeight: 'bold' },
  bottomShade: { bottom: 0, justifyContent: 'flex-end', left: 0, padding: 10, position: 'absolute', right: 0 },
  callBtn: { alignItems: 'center', backgroundColor: COLORS.pink, borderRadius: 24, marginTop: 12, paddingVertical: 13 },
  callText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  chip: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 10, fontSize: 11, marginRight: 4, paddingHorizontal: 6, paddingVertical: 2 },
  chips: { flexDirection: 'row', marginTop: 4 },
  closeText: { color: COLORS.grey, fontSize: 14, marginTop: 14, textAlign: 'center' },
  empty: { color: COLORS.dark, fontSize: 16, marginVertical: 18, textAlign: 'center' },
  liveBadge: { backgroundColor: '#ef4444', borderRadius: 10, left: 8, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', top: 8 },
  liveText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  lv: { backgroundColor: '#fde68a' },
  name: { color: '#fff', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', padding: 24 },
  photo: { alignItems: 'center', borderRadius: 14, height: 190, justifyContent: 'center', marginTop: 12, overflow: 'hidden' },
  rate: { color: COLORS.dark, fontSize: 16, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  sheet: { backgroundColor: '#fff', borderRadius: 18, padding: 18, width: '100%' },
  title: { color: COLORS.dark, fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
});
