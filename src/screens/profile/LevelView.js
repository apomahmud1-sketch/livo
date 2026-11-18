// Livo — My Level page, from the web preview.
// Male: grey-blue, Top-up/Consumption rule. Female: orange, Received Beans rule.
// Both show Level 2, 39,200 points, a 13% progress bar to Lv3,
// Lv1-Lv50 privilege tabs and the full Lv0-Lv50 table.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  LEVEL_NOTE_LOW_BALANCE, LEVEL_RULE_FEMALE, LEVEL_RULE_MALE, LV_PRIVS_FEMALE,
  LV_PRIVS_MALE, LV_ROWS, PROFILE,
} from './levelData';

function levelPillIcon(lv) {
  if (lv === 0) return '♥';
  if (lv <= 2) return '💎';
  if (lv <= 5) return '✈️';
  if (lv <= 8) return '⭐';
  return '👑';
}

export default function LevelView({ gender, onGenderChange, onBack, onTopUp, showToast }) {
  const female = gender === 'female';
  const privs = female ? LV_PRIVS_FEMALE : LV_PRIVS_MALE;
  const rule = female ? LEVEL_RULE_FEMALE : LEVEL_RULE_MALE;
  const head2 = female ? 'Received Beans' : 'Top-up/Consumption';
  // Preview default tab: male Lv1, female Lv2.
  const [tab, setTab] = React.useState(female ? 2 : 1);
  const unlocked = privs.filter((p) => tab >= p.unlock).length;

  const theme = female
    ? { hero: ['#ffedd5', '#fdba74'], accent: '#ea580c', bar: '#fb923c', note: '#9a3412' }
    : { hero: ['#eef2ff', '#c7d2fe'], accent: '#4f46e5', bar: '#6366f1', note: '#3730a3' };

  return (
    <ScrollView style={styles.bg} contentContainerStyle={styles.wrap}>
      <View style={styles.headRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backTxt}>‹</Text></TouchableOpacity>
        <Text style={styles.headTitle}>My Level</Text>
        <View style={styles.genderSeg}>
          <TouchableOpacity
            style={[styles.segBtn, !female && styles.segBtnOn]}
            onPress={() => { onGenderChange('male'); setTab(1); }}
          >
            <Text style={[styles.segTxt, !female && styles.segTxtOn]}>ছেলে ID</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, female && styles.segBtnOnF]}
            onPress={() => { onGenderChange('female'); setTab(2); }}
          >
            <Text style={[styles.segTxt, female && styles.segTxtOn]}>মেয়ে ID</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hero card */}
      <View style={[styles.hero, { backgroundColor: theme.hero[0], borderColor: theme.hero[1] }]}>
        <View style={styles.heroTop}>
          <Text style={styles.heroTitle}>Level <Text style={styles.heroLv}>{PROFILE.level}</Text></Text>
          <Text style={[styles.heroBadge, { backgroundColor: theme.accent }]}>✔</Text>
        </View>
        <View style={styles.progMeta}>
          <Text style={styles.progCur}>Lv{PROFILE.level} ♥ {PROFILE.levelPoints.toLocaleString()}</Text>
          <Text style={styles.progNext}>Lv{PROFILE.level + 1}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${PROFILE.levelProgress}%`, backgroundColor: theme.bar }]} />
        </View>
        <Text style={[styles.progNote, { color: theme.note }]}>
          Top up {PROFILE.levelTopUpToGo.toLocaleString()} diamonds more to level up
        </Text>
      </View>

      <Text style={styles.sec}>Level Privileges</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {Array.from({ length: 50 }, (_, i) => i + 1).map((lv) => (
          <TouchableOpacity
            key={lv}
            style={[styles.tab, tab === lv && { backgroundColor: theme.accent, borderColor: theme.accent }]}
            onPress={() => setTab(lv)}
          >
            <Text style={[styles.tabTxt, tab === lv && styles.tabTxtOn]}>Lv{lv}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.privNote}>
        {unlocked === privs.length
          ? `Lv${tab} — ${unlocked}/${privs.length} privileges · এই লেভেলের সব Privileges খোলা আছে`
          : `Lv${tab} — ${unlocked}/${privs.length} privileges খোলা · বাকিগুলো আরও উঁচু লেভেলে খুলবে`}
      </Text>
      {privs.map((p) => {
        const locked = tab < p.unlock;
        return (
          <TouchableOpacity
            key={p.t}
            style={[styles.priv, locked && styles.privLocked]}
            onPress={() => showToast(locked ? `${p.t} — Lv${p.unlock}-এ গেলে খুলবে` : `${p.t} — Lv${tab} Privilege`)}
          >
            <View style={[styles.privIcon, { backgroundColor: p.bg }]}>
              <Text style={styles.privEmoji}>{p.icon}</Text>
            </View>
            <View style={styles.privBody}>
              <Text style={styles.privTitle}>{p.t}</Text>
              <Text style={styles.privDesc}>{p.d}{locked ? ` (Unlocks at Lv${p.unlock})` : ''}</Text>
            </View>
            {locked ? <Text style={styles.lockTxt}>🔒 Lv{p.unlock}</Text> : <Text style={styles.chev}>›</Text>}
          </TouchableOpacity>
        );
      })}

      <Text style={styles.sec}>Level Rule</Text>
      <Text style={styles.rule}>{rule}</Text>

      <View style={styles.tableHead}>
        <Text style={styles.th}>Level</Text>
        <Text style={styles.th}>{head2}</Text>
      </View>
      {LV_ROWS.map(([lv, val]) => (
        <View key={lv} style={[styles.tableRow, lv === PROFILE.level && styles.tableRowNow]}>
          <Text style={styles.tdLv}>{levelPillIcon(lv)} Lv{lv}</Text>
          <Text style={styles.tdVal}>{val}</Text>
        </View>
      ))}
      {!female && <Text style={styles.lowNote}>{LEVEL_NOTE_LOW_BALANCE}</Text>}
      {!female && (
        <TouchableOpacity style={styles.topUpBtn} onPress={onTopUp}>
          <Text style={styles.topUpTxt}>Top Up Now</Text>
        </TouchableOpacity>
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backBtn: { alignItems: 'center', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  backTxt: { color: '#111827', fontSize: 28, fontWeight: 'bold' },
  barFill: { borderRadius: 5, height: 10 },
  barTrack: { backgroundColor: '#e5e7eb', borderRadius: 5, height: 10, marginTop: 8 },
  bg: { backgroundColor: '#f8fafc', flex: 1 },
  chev: { color: '#9ca3af', fontSize: 22 },
  genderSeg: { flexDirection: 'row', gap: 6 },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 44 },
  headTitle: { flex: 1, fontSize: 20, fontWeight: 'bold' },
  hero: { borderRadius: 16, borderWidth: 1, marginHorizontal: 16, marginTop: 12, padding: 16 },
  heroBadge: { alignItems: 'center', borderRadius: 24, color: '#fff', fontSize: 26, fontWeight: 'bold', height: 48, justifyContent: 'center', lineHeight: 48, textAlign: 'center', width: 48 },
  heroLv: { fontSize: 30 },
  heroTitle: { color: '#1e293b', fontSize: 22, fontWeight: 'bold' },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  lockTxt: { color: '#9ca3af', fontSize: 12, fontWeight: 'bold' },
  lowNote: { color: '#6b7280', fontSize: 12, marginHorizontal: 16, marginTop: 10, textAlign: 'center' },
  priv: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', marginHorizontal: 16, marginTop: 8, padding: 12 },
  privBody: { flex: 1, marginLeft: 12 },
  privDesc: { color: '#6b7280', fontSize: 12, lineHeight: 17, marginTop: 2 },
  privEmoji: { fontSize: 20 },
  privIcon: { alignItems: 'center', borderRadius: 10, height: 44, justifyContent: 'center', width: 44 },
  privLocked: { opacity: 0.65 },
  privNote: { color: '#6b7280', fontSize: 12, marginHorizontal: 16, marginTop: 8 },
  privTitle: { fontSize: 15, fontWeight: 'bold' },
  progCur: { fontSize: 15, fontWeight: 'bold' },
  progMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  progNext: { color: '#6b7280', fontSize: 14 },
  progNote: { fontSize: 12, marginTop: 8 },
  rule: { backgroundColor: '#fff', borderRadius: 12, color: '#374151', fontSize: 13, lineHeight: 19, marginHorizontal: 16, marginTop: 8, padding: 12 },
  sec: { fontSize: 17, fontWeight: 'bold', marginHorizontal: 16, marginTop: 18 },
  segBtn: { borderColor: '#cbd5e1', borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  segBtnOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  segBtnOnF: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
  segTxt: { color: '#475569', fontSize: 12, fontWeight: 'bold' },
  segTxtOn: { color: '#fff' },
  tab: { borderColor: '#d1d5db', borderRadius: 16, borderWidth: 1, marginRight: 6, paddingHorizontal: 12, paddingVertical: 7 },
  tabTxt: { color: '#374151', fontSize: 13, fontWeight: 'bold' },
  tabTxtOn: { color: '#fff' },
  tabs: { marginLeft: 16, marginTop: 10 },
  tableHead: { backgroundColor: '#eef2ff', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 9 },
  tableRow: { borderBottomColor: '#e5e7eb', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 8 },
  tableRowNow: { backgroundColor: '#fef3c7' },
  tdLv: { fontSize: 14, fontWeight: 'bold' },
  tdVal: { fontSize: 14 },
  th: { fontSize: 13, fontWeight: 'bold' },
  topUpBtn: { backgroundColor: '#7c3aed', borderRadius: 12, marginHorizontal: 16, marginTop: 16, paddingVertical: 14 },
  topUpTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  wrap: { paddingBottom: 24 },
});
