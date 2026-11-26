// ── First-time signup flow (Waki Star flow, Livo theme) ───────────
// Shown by the App.js auth gate right after native Google sign-in
// when the signed-in profile is incomplete (no country or no
// gender saved). Steps: 1) Select country (once-only confirm),
// 2) Welcome setup (photo / nickname / birthday 18+ / gender),
// 3) Completed the registration → Enter Livo.
// Nothing is saved until the setup step submits: the country
// choice is held in flow state, and the single updateMyProfile
// write sets country + username + birthday + age + gender (and
// avatar_url when a new photo was picked and uploaded). A failed
// photo upload never blocks signup — the Google photo stays and
// the Done screen says so. Existing complete profiles never see
// this flow (the gate checks country + gender first).
// English-only UI.
import React from 'react';
import { supabase } from '../supabase/client';
import { updateMyProfile } from '../supabase/auth';
import SignupCountryScreen from './SignupCountryScreen';
import SignupSetupScreen from './SignupSetupScreen';
import SignupDoneScreen from './SignupDoneScreen';

export default function SignupFlow({ user, profile, onDone }) {
  const [step, setStep] = React.useState('country'); // 'country' | 'setup' | 'done'
  const [country, setCountry] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [photoWarning, setPhotoWarning] = React.useState(null);

  const meta = (user && user.user_metadata) || {};
  const initialName =
    (profile && profile.username) || meta.full_name || meta.name || '';
  const initialPhotoUri =
    (profile && profile.avatar_url) || meta.avatar_url || meta.picture || null;

  const submit = async (values) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setPhotoWarning(null);
    // New photo → public 'avatars' bucket (same pattern as the
    // Edit Profile photo change). A failed upload never blocks
    // signup: the Google photo stays and the Done screen says so.
    let avatarUrl = null;
    let warning = null;
    if (values.photoUri && user) {
      try {
        const resp = await fetch(values.photoUri);
        const blob = await resp.blob();
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = pub && pub.publicUrl;
        if (!avatarUrl) throw new Error('no public url');
      } catch (e) {
        warning = 'Your photo could not be uploaded — your Google photo is used for now. You can change it later in Edit Profile.';
      }
    }
    const patch = {
      country: country ? country.name : null,
      username: values.nickname,
      birthday: values.birthday,
      age: values.age,
      gender: values.gender,
    };
    if (avatarUrl) patch.avatar_url = avatarUrl;
    const saved = await updateMyProfile(patch);
    setSubmitting(false);
    if (!saved) {
      setError("Couldn't save — check your connection and try again.");
      return;
    }
    setPhotoWarning(warning);
    setStep('done');
  };

  if (step === 'setup') {
    return (
      <SignupSetupScreen
        country={country}
        initialName={initialName}
        initialPhotoUri={initialPhotoUri}
        submitting={submitting}
        error={error}
        onSubmit={submit}
        onBack={() => setStep('country')}
      />
    );
  }
  if (step === 'done') {
    return <SignupDoneScreen photoWarning={photoWarning} onEnter={onDone} />;
  }
  return (
    <SignupCountryScreen
      onSelect={(c) => { setCountry(c); setStep('setup'); }}
    />
  );
}
