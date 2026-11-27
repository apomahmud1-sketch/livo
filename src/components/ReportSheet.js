// Livo ReportSheet — report a host to the Mother Panel.
// A caller in a 1v1 call or watching a live room can report the
// host (e.g. "Not the person in the photo"). The report goes into
// the public.reports table with status 'pending' for the owner to
// review. RLS lets a signed-in user insert ONLY their own report
// (reporter_id = their auth uid) and read ONLY their own reports
// — the app never shows anyone else's reports. A guest (no
// session) is asked to sign in instead of reporting.
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store';
import { supabase } from '../supabase/client';
import { fetchMyProfile, getSessionUser } from '../supabase/auth';

const REPORT_REASONS = [
  'Not the person in the photo',
  'Fake profile',
  'Inappropriate behaviour',
  'Other',
];

export default function ReportSheet({ visible, host, onClose }) {
  const { showToast } = useApp();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myUid, setMyUid] = useState(null);
  const [myDisplayId, setMyDisplayId] = useState('');

  // My identity for the report row: auth uid + 8-digit user_id.
  // Loaded when the sheet opens; a guest (no session) cannot
  // report — the submit path asks them to sign in.
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const u = await getSessionUser();
        if (!u || cancelled) return;
        setMyUid(u.id);
        const { profile } = await fetchMyProfile(u.id);
        if (!cancelled && profile) setMyDisplayId(String(profile.user_id || ''));
      } catch (e) {
        // No identity — the submit path will ask the user to sign in.
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  const submit = async () => {
    if (submitting) return;
    if (!host || !host.id) {
      showToast('Could not send the report — please try again');
      return;
    }
    if (!myUid) {
      showToast('Please sign in to report');
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: myUid,
        reporter_display_id: myDisplayId,
        target_type: 'host',
        target_id: String(host.id),
        target_name: String(host.name || 'Host'),
        reason,
        details: details.trim(),
        status: 'pending',
      });
      setSubmitting(false);
      if (error) {
        showToast('Could not send the report — please try again');
        return;
      }
      setReason(REPORT_REASONS[0]);
      setDetails('');
      showToast('Report sent — the owner will review it');
      onClose();
    } catch (e) {
      setSubmitting(false);
      showToast('Could not send the report — please try again');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.veil}>
        <TouchableOpacity style={styles.veilTap} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Report this host</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sheetSub}>Tell us what is wrong. The owner will review it.</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonRow, reason === r && styles.reasonRowSel]}
                onPress={() => setReason(r)}
                activeOpacity={0.85}
              >
                <View style={[styles.radio, reason === r && styles.radioOn]} />
                <Text style={[styles.reasonTxt, reason === r && styles.reasonTxtSel]}>{r}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.fieldLabel}>Details (optional)</Text>
            <TextInput
              style={styles.input}
              value={details}
              onChangeText={setDetails}
              placeholder="What happened? (optional)"
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={300}
            />
          </ScrollView>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitDisabled]}
            onPress={submit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.submitTxt}>{submitting ? 'Sending…' : 'Submit report'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'flex-end' },
  veilTap: { flex: 1 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', padding: 20, paddingBottom: 28 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 19, fontWeight: 'bold' },
  closeBtn: { alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  closeTxt: { color: '#374151', fontSize: 15, fontWeight: 'bold' },
  sheetSub: { color: '#6b7280', fontSize: 13, lineHeight: 19, marginTop: 6 },
  reasonRow: { alignItems: 'center', borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginTop: 10, paddingHorizontal: 14, paddingVertical: 13 },
  reasonRowSel: { backgroundColor: '#fef2f2', borderColor: '#ef4444' },
  radio: { borderColor: '#9ca3af', borderRadius: 9, borderWidth: 2, height: 18, width: 18 },
  radioOn: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  reasonTxt: { color: '#111827', fontSize: 15, fontWeight: '600', marginLeft: 10 },
  reasonTxtSel: { color: '#991b1b' },
  fieldLabel: { color: '#374151', fontSize: 13, fontWeight: 'bold', marginTop: 16 },
  input: { borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, color: '#111827', fontSize: 15, marginTop: 8, minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  submitBtn: { alignItems: 'center', backgroundColor: '#ef4444', borderRadius: 14, marginTop: 16, paddingVertical: 15 },
  submitDisabled: { opacity: 0.6 },
  submitTxt: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
