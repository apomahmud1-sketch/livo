// ── First-time signup, step 2: Welcome setup ─────────────────────
// Waki Star flow, Livo purple-gold theme (not Waki's yellow).
// Profile photo (Take photos / Select from phone album — the
// Google photo is the default until the user picks one), nickname
// (prefilled from the Google display name), birthday (custom
// year/month/day wheel picker — no native date-picker dependency,
// so this ships via OTA), gender Male/Female with the once-only
// note. Birthday must be 18+ (the login 18+ agreement, enforced
// here with the real birth date). Nothing is saved by this screen
// — Submit hands the values to the flow, which writes the
// profiles row once. English-only UI.
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { THEME as T } from '../config';

const ITEM_H = 44;

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function ageOn(birthdayISO) {
  const b = new Date(`${birthdayISO}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

// One wheel column: the middle visible row is the selected value.
// Blank spacer rows top/bottom let the first/last values centre.
function WheelColumn({ values, selected, onPick }) {
  const data = React.useMemo(() => [null, ...values, null], [values]);
  const selIdx = Math.max(0, values.indexOf(selected));
  return (
    <FlatList
      data={data}
      keyExtractor={(_, i) => `w${i}`}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      initialScrollIndex={selIdx + 1}
      getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
      onMomentumScrollEnd={(e) => {
        const d = Math.round(e.nativeEvent.contentOffset.y / ITEM_H) + 1;
        const v = values[d - 1];
        if (v !== undefined && v !== selected) onPick(v);
      }}
      renderItem={({ item }) => {
        if (item === null) return <View style={{ height: ITEM_H }} />;
        const on = item === selected;
        return (
          <TouchableOpacity onPress={() => onPick(item)} style={[styles.wheelItem, on && styles.wheelItemOn]} activeOpacity={0.7}>
            <Text style={[styles.wheelTxt, on && styles.wheelTxtOn]}>{item}</Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

export default function SignupSetupScreen({ country, initialName, initialPhotoUri, submitting, error, onSubmit, onBack }) {
  const [photoUri, setPhotoUri] = React.useState(null); // newly picked local photo
  const [nickname, setNickname] = React.useState(initialName || '');
  const [birthday, setBirthday] = React.useState(null); // 'YYYY-MM-DD' | null
  const [gender, setGender] = React.useState(null); // 'male' | 'female' | null
  const [photoSheet, setPhotoSheet] = React.useState(false);
  const [dateSheet, setDateSheet] = React.useState(false);
  const [localError, setLocalError] = React.useState(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);

  // Wheel picker working state (confirmed with the sheet's Confirm).
  const nowYear = new Date().getFullYear();
  const [pickY, setPickY] = React.useState(2000);
  const [pickM, setPickM] = React.useState(1);
  const [pickD, setPickD] = React.useState(1);

  const shownPhoto = photoUri || initialPhotoUri || null;
  const shownInitial = (nickname || initialName || '?').charAt(0).toUpperCase();
  const err = localError || error || null;

  const pickPhoto = async (fromCamera) => {
    setPhotoSheet(false);
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
      if (!res.canceled && res.assets && res.assets[0] && res.assets[0].uri) {
        setPhotoUri(res.assets[0].uri);
        setLocalError(null);
      }
    } catch (e) {
      setLocalError('Could not open the photo picker — try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const openDateSheet = () => {
    if (birthday) {
      const [y, m, d] = birthday.split('-').map((n) => parseInt(n, 10));
      setPickY(y);
      setPickM(m);
      setPickD(d);
    }
    setDateSheet(true);
  };

  const confirmDate = () => {
    const mm = String(pickM).padStart(2, '0');
    const dd = String(pickD).padStart(2, '0');
    setBirthday(`${pickY}-${mm}-${dd}`);
    setLocalError(null);
    setDateSheet(false);
  };

  const submit = () => {
    if (submitting) return;
    if (!nickname.trim()) { setLocalError('Please enter a nickname.'); return; }
    if (!birthday) { setLocalError('Please select your birthday.'); return; }
    if (ageOn(birthday) < 18) { setLocalError('You must be over 18 to use Livo.'); return; }
    if (!gender) { setLocalError('Please select your gender.'); return; }
    setLocalError(null);
    if (onSubmit) {
      onSubmit({
        nickname: nickname.trim(),
        birthday,
        age: ageOn(birthday),
        gender,
        photoUri,
      });
    }
  };

  const years = [];
  for (let y = nowYear - 100; y <= nowYear - 18; y++) years.push(y);
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const dim = daysInMonth(pickY, pickM);
  const days = [];
  for (let d = 1; d <= dim; d++) days.push(d);
  const shownBirthday = birthday ? birthday.replace(/-0/g, '-').replace(/^(\d+)-(\d+)-(\d+)$/, '$1-$2-$3') : '';

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={styles.backTxt}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.title}>HI, welcome to Livo</Text>
      <Text style={styles.sub}>Improve information to match accurate friends~</Text>

      {/* Profile photo */}
      <View style={styles.fieldRow}>
        <Text style={styles.label}>Profile photo</Text>
        <TouchableOpacity onPress={() => setPhotoSheet(true)} disabled={photoBusy} activeOpacity={0.8}>
          {shownPhoto ? (
            <Image source={{ uri: shownPhoto }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackTxt}>{shownInitial}</Text>
            </View>
          )}
          <View style={styles.camBadge}>
            {photoBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.camBadgeTxt}>📷</Text>}
          </View>
        </TouchableOpacity>
      </View>

      {/* Nickname */}
      <Text style={styles.label}>Nickname</Text>
      <TextInput
        style={styles.input}
        value={nickname}
        onChangeText={setNickname}
        placeholder="Your nickname"
        placeholderTextColor={T.dim}
        maxLength={30}
        autoCorrect={false}
      />

      {/* Birthday */}
      <Text style={styles.label}>Birthday</Text>
      <TouchableOpacity onPress={openDateSheet} style={styles.valueRow} activeOpacity={0.7}>
        <Text style={[styles.valueTxt, !birthday && { color: T.dim }]}>
          {birthday ? shownBirthday : 'Select your birthday'}
        </Text>
      </TouchableOpacity>

      {/* Gender */}
      <Text style={styles.label}>Gender</Text>
      <View style={styles.genderRow}>
        {['male', 'female'].map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.genderBtn, gender === g && styles.genderBtnOn]}
            onPress={() => { setGender(g); setLocalError(null); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.genderBtnTxt, gender === g && styles.genderBtnTxtOn]}>
              {g === 'male' ? '♂ Male' : '♀ Female'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.pinkNote}>
        {gender ? '*Gender will not be changed after you select' : 'Not filling in gender yet'}
      </Text>

      {country ? (
        <Text style={styles.countryNote}>Country: {country.name} — set in the previous step, cannot be changed later.</Text>
      ) : null}
      {err ? <Text style={styles.error}>{err}</Text> : null}

      <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting} activeOpacity={0.85}>
        {submitting
          ? <ActivityIndicator size="small" color="#3d2400" />
          : <Text style={styles.submitTxt}>Submit</Text>}
      </TouchableOpacity>

      {/* Photo source sheet */}
      <Modal visible={photoSheet} transparent animationType="slide" onRequestClose={() => setPhotoSheet(false)}>
        <TouchableOpacity style={styles.sheetShade} activeOpacity={1} onPress={() => setPhotoSheet(false)}>
          <View style={styles.sheet}>
            <TouchableOpacity style={styles.sheetRow} onPress={() => pickPhoto(true)} activeOpacity={0.7}>
              <Text style={styles.sheetTxt}>Take photos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={() => pickPhoto(false)} activeOpacity={0.7}>
              <Text style={styles.sheetTxt}>Select from phone album</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetRow, styles.sheetCancel]} onPress={() => setPhotoSheet(false)} activeOpacity={0.7}>
              <Text style={[styles.sheetTxt, { color: T.dim }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Birthday wheel picker sheet */}
      <Modal visible={dateSheet} transparent animationType="slide" onRequestClose={() => setDateSheet(false)}>
        <View style={styles.sheetShade}>
          <View style={styles.sheet}>
            <View style={styles.dateHead}>
              <TouchableOpacity onPress={() => setDateSheet(false)}><Text style={styles.dateHeadBtn}>Cancel</Text></TouchableOpacity>
              <Text style={styles.dateHeadTitle}>Modify birthday</Text>
              <TouchableOpacity onPress={confirmDate}><Text style={[styles.dateHeadBtn, { color: T.gold, fontWeight: '700' }]}>Confirm</Text></TouchableOpacity>
            </View>
            <View style={styles.wheels}>
              <View style={styles.wheelCol}>
                <WheelColumn
                  values={years}
                  selected={pickY}
                  onPick={(y) => { setPickY(y); if (pickD > daysInMonth(y, pickM)) setPickD(daysInMonth(y, pickM)); }}
                />
              </View>
              <View style={styles.wheelCol}>
                <WheelColumn
                  values={months}
                  selected={pickM}
                  onPick={(m) => { setPickM(m); if (pickD > daysInMonth(pickY, m)) setPickD(daysInMonth(pickY, m)); }}
                />
              </View>
              <View style={styles.wheelCol}>
                <WheelColumn values={days} selected={pickD} onPick={setPickD} />
              </View>
            </View>
            <Text style={styles.dateHint}>You must be over 18 to use Livo.</Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: T.page, flex: 1 },
  content: { paddingBottom: 40, paddingHorizontal: 24, paddingTop: 56 },
  backBtn: { left: 16, padding: 8, position: 'absolute', top: 48, zIndex: 1 },
  backTxt: { color: T.text, fontSize: 32, fontWeight: '300' },
  title: { color: T.text, fontSize: 26, fontWeight: 'bold', marginBottom: 4 },
  sub: { color: T.dim, fontSize: 14, marginBottom: 28 },
  fieldRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { color: T.dim, fontSize: 14, marginBottom: 6, marginTop: 14 },
  avatar: { borderRadius: 36, height: 72, width: 72 },
  avatarFallback: { alignItems: 'center', backgroundColor: T.violet, justifyContent: 'center' },
  avatarFallbackTxt: { color: '#fff', fontSize: 30, fontWeight: 'bold' },
  camBadge: {
    alignItems: 'center',
    backgroundColor: T.violet,
    borderColor: T.page,
    borderRadius: 13,
    borderWidth: 2,
    bottom: 0,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 26,
  },
  camBadgeTxt: { fontSize: 12 },
  input: {
    borderBottomColor: T.line,
    borderBottomWidth: 1,
    color: T.text,
    fontSize: 17,
    paddingBottom: 8,
    paddingTop: 2,
  },
  valueRow: { borderBottomColor: T.line, borderBottomWidth: 1, paddingBottom: 8, paddingTop: 2 },
  valueTxt: { color: T.text, fontSize: 17 },
  genderRow: { flexDirection: 'row', gap: 12 },
  genderBtn: {
    alignItems: 'center',
    backgroundColor: T.panel,
    borderColor: T.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 14,
  },
  genderBtnOn: { backgroundColor: T.violet, borderColor: T.violet },
  genderBtnTxt: { color: T.dim, fontSize: 16, fontWeight: '600' },
  genderBtnTxtOn: { color: '#fff' },
  pinkNote: { color: '#ff5da2', fontSize: 13, marginTop: 8 },
  countryNote: { color: T.dim, fontSize: 13, lineHeight: 18, marginTop: 16 },
  error: { color: '#ff7a7a', fontSize: 14, marginTop: 16, textAlign: 'center' },
  submitBtn: {
    alignItems: 'center',
    backgroundColor: T.gold,
    borderRadius: 28,
    marginHorizontal: 40,
    marginTop: 28,
    paddingVertical: 15,
  },
  submitTxt: { color: '#3d2400', fontSize: 17, fontWeight: '700' },
  sheetShade: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.sheet, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, paddingHorizontal: 20, paddingTop: 12 },
  sheetRow: { borderBottomColor: T.line, borderBottomWidth: 1, paddingVertical: 16 },
  sheetTxt: { color: T.text, fontSize: 17, textAlign: 'center' },
  sheetCancel: { borderBottomWidth: 0 },
  dateHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  dateHeadBtn: { color: T.text, fontSize: 16 },
  dateHeadTitle: { color: T.text, fontSize: 17, fontWeight: '700' },
  wheels: { flexDirection: 'row', height: ITEM_H * 3, marginTop: 8 },
  wheelCol: { flex: 1 },
  wheelItem: { alignItems: 'center', height: ITEM_H, justifyContent: 'center' },
  wheelItemOn: { backgroundColor: 'rgba(123,47,247,0.18)', borderRadius: 8 },
  wheelTxt: { color: T.dim, fontSize: 18 },
  wheelTxtOn: { color: T.text, fontWeight: '700' },
  dateHint: { color: T.dim, fontSize: 13, marginTop: 12, textAlign: 'center' },
});
