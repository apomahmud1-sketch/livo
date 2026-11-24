// ── First-login gender step ──────────────────────────────────────
// Login never asked for gender (the only gender picker lived in
// Me → Edit Profile, which most users never open), so new profiles
// were created with gender null — and the Go Live gate
// (profiles.gender === 'female') could never pass for a real
// female user. This screen appears once, right after sign-in,
// when the signed-in profile has no gender saved. It is mandatory:
// the user picks Male or Female to enter the app. Existing users
// with a gender already saved never see it. The value is saved
// with updateMyProfile (same write path as the profile editor).
// English-only UI, like the rest of the app.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { updateMyProfile } from '../supabase/auth';

export default function GenderScreen({ onDone }) {
  const [saving, setSaving] = React.useState(null); // 'Male' | 'Female' | null
  const [error, setError] = React.useState(null);

  const pick = async (gender) => {
    if (saving) return;
    setError(null);
    setSaving(gender);
    const saved = await updateMyProfile({ gender });
    setSaving(null);
    if (!saved) {
      setError("Couldn't save — check your connection and try again.");
      return;
    }
    if (onDone) onDone(gender);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>One last step</Text>
      <Text style={styles.sub}>
        Select your gender to continue. It is used for Go Live and matching,
        and you can change it later in your profile.
      </Text>
      <View style={styles.card}>
        {['Male', 'Female'].map((g) => (
          <TouchableOpacity
            key={g}
            style={styles.btn}
            onPress={() => pick(g)}
            disabled={!!saving}
            activeOpacity={0.8}
          >
            <Text style={styles.btnIcon}>{g === 'Male' ? '♂' : '♀'}</Text>
            <Text style={styles.btnTxt}>{g}</Text>
            {saving === g ? <ActivityIndicator size="small" color="#7c3aed" /> : null}
          </TouchableOpacity>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: '#7c3aed',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  sub: { color: '#ede9fe', fontSize: 15, lineHeight: 22, marginBottom: 28, textAlign: 'center' },
  card: { alignSelf: 'stretch' },
  btn: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 16,
  },
  btnIcon: { color: '#7c3aed', fontSize: 20, fontWeight: 'bold', marginRight: 10 },
  btnTxt: { color: '#7c3aed', fontSize: 18, fontWeight: 'bold' },
  error: { color: '#fecaca', fontSize: 14, marginTop: 8, textAlign: 'center' },
});
