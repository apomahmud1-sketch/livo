// ── First-time signup, step 1: Select country ────────────────────
// Waki Star flow, Livo purple-gold theme (not Waki's yellow).
// Searchable A–Z country list with a "recommended" row for the
// device-locale country. Tapping a country opens the once-only
// confirm dialog ("Once the country/region is changed, it cannot
// be changed again. Are you sure to select?") — Think again /
// Confirm. The choice is only held in the signup flow state until
// the setup step submits; it is NOT saved here, so abandoning the
// flow leaves nothing half-written. English-only UI.
import React from 'react';
import {
  FlatList,
  Modal,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { THEME as T } from '../config';
import { COUNTRIES, countryByCode, deviceCountryCode, flagFor } from '../data/countries';

function sectionsFor(list) {
  const groups = {};
  list.forEach((c) => {
    const letter = c.name.charAt(0).toUpperCase();
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(c);
  });
  return Object.keys(groups).sort().map((letter) => ({ title: letter, data: groups[letter] }));
}

export default function SignupCountryScreen({ onSelect }) {
  const [query, setQuery] = React.useState('');
  const [pending, setPending] = React.useState(null); // country awaiting confirm
  const recommended = React.useMemo(() => countryByCode(deviceCountryCode()), []);
  const q = query.trim().toLowerCase();
  const filtered = q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)) : COUNTRIES;
  const sections = React.useMemo(() => {
    if (q) return [];
    const all = sectionsFor(COUNTRIES);
    if (recommended) {
      return [{ title: 'recommended', data: [recommended] }, ...all];
    }
    return all;
  }, [q, recommended]);

  const row = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => setPending(item)} activeOpacity={0.7}>
      <Text style={styles.rowName}>{item.name}</Text>
      <Text style={styles.rowFlag}>{flagFor(item.code)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select country</Text>
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="search"
          placeholderTextColor={T.dim}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <Text style={styles.caution}>
        Be cautious: the platform recommends content and perform ranking data statistics based on your country and region.
      </Text>
      {q ? (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.code}
          renderItem={row}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.empty}>No country matches “{query}”.</Text>}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.code}
          renderItem={row}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHead}>{section.title}</Text>
          )}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Once-only confirm dialog */}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.modalFlag}>{pending ? flagFor(pending.code) : ''}</Text>
            <Text style={styles.modalName}>{pending ? pending.name : ''}</Text>
            <Text style={styles.modalText}>
              Once the country/region is changed, it cannot be changed again. Are you sure to select?
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.thinkBtn} onPress={() => setPending(null)} activeOpacity={0.8}>
                <Text style={styles.thinkTxt}>Think again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={() => { const c = pending; setPending(null); if (c && onSelect) onSelect(c); }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmTxt}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: T.page, flex: 1, paddingHorizontal: 20, paddingTop: 56 },
  title: { color: T.text, fontSize: 22, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  searchBox: {
    alignItems: 'center',
    backgroundColor: T.panel,
    borderColor: T.line,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  searchIcon: { color: T.dim, fontSize: 20, marginRight: 8 },
  searchInput: { color: T.text, flex: 1, fontSize: 16, paddingVertical: 12 },
  caution: { color: '#ff7a7a', fontSize: 13, lineHeight: 18, marginTop: 12 },
  sectionHead: {
    backgroundColor: T.page,
    color: T.dim,
    fontSize: 13,
    fontWeight: '700',
    paddingBottom: 4,
    paddingTop: 14,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: T.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowName: { color: T.text, fontSize: 16 },
  rowFlag: { fontSize: 22 },
  empty: { color: T.dim, fontSize: 15, marginTop: 24, textAlign: 'center' },
  modalShade: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  modalCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 28, width: '100%' },
  modalFlag: { fontSize: 56, marginBottom: 8 },
  modalName: { color: '#111827', fontSize: 18, fontWeight: '600', marginBottom: 16 },
  modalText: { color: '#111827', fontSize: 15, lineHeight: 22, marginBottom: 24, textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12 },
  thinkBtn: { backgroundColor: '#f3f4f6', borderRadius: 24, flex: 1, paddingVertical: 13 },
  thinkTxt: { color: '#374151', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  confirmBtn: { backgroundColor: T.gold, borderRadius: 24, flex: 1, paddingVertical: 13 },
  confirmTxt: { color: '#3d2400', fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
