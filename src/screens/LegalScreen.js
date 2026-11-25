import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';

// In-app legal pages (Hapa-style, 2026-11-25): the Terms of Service
// and Privacy Policy open INSIDE Livo — no browser, no external
// link. The login screen's "User Agreement", "Terms of Service"
// and "Privacy Policy" texts navigate here. English only.
const CONTENT = {
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated: 25 November 2026',
    sections: [
      {
        heading: '1. About Livo',
        body: 'Livo is a live 1-to-1 video calling app. You can meet approved hosts live, chat, send gifts, and join video calls. By creating an account or using Livo, you agree to these Terms. If you do not agree, do not use the app.',
      },
      {
        heading: '2. You must be 18 or older',
        body: 'Livo is for adults only. You confirm you are at least 18 years old when you sign in. Accounts found to belong to anyone under 18 will be closed immediately.',
      },
      {
        heading: '3. Your account',
        body: 'You sign in with your Google account. You are responsible for keeping your account safe and for everything done with it. Do not share your account, sell it, or let anyone else use it. One person may not run several accounts to abuse rewards, gifts, or calls.',
      },
      {
        heading: '4. Hosts and live calls',
        body: 'Only approved hosts can go live. Hosts set their own call price from the rates shown in the app. When you call a host, the price shown before the call applies and coins are charged per minute. Be polite on every call: harassment, threats, hate speech, and any sexual content involving minors are strictly forbidden and lead to an immediate permanent ban.',
      },
      {
        heading: '5. Coins, diamonds and gifts',
        body: 'Coins and diamonds are virtual items inside Livo. They have no cash value outside the app and cannot be sold or transferred between users, except through the features Livo itself provides. Coin packs are sold through Google Play and follow Google Play refund rules. Hosts earn diamonds from calls and gifts; withdrawals follow the rules and minimum amounts shown in the app and may change from time to time.',
      },
      {
        heading: '6. What you must not do',
        body: 'You must not: post or share illegal, abusive, or sexually explicit content involving minors; harass, threaten, or blackmail anyone; record or share a private call without the other person agreeing; cheat, use bots, or fake activity to earn coins, diamonds, or rewards; try to break, copy, or reverse-engineer the app; or use Livo for any illegal purpose.',
      },
      {
        heading: '7. Suspension and closing accounts',
        body: 'We may warn, suspend, or permanently ban any account that breaks these Terms, without refund of unused coins. You can delete your own account from the app settings at any time; a deleted account can be restored from the admin panel within 3 months.',
      },
      {
        heading: '8. Changes to these Terms',
        body: 'We may update these Terms when the app changes. The new version applies from the day it is published in the app. If you keep using Livo after a change, you accept the new Terms.',
      },
      {
        heading: '9. Contact',
        body: 'For help, reports, or questions about these Terms, contact Livo support from inside the app.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: 25 November 2026',
    sections: [
      {
        heading: '1. What we collect',
        body: 'When you sign in with Google we receive your name, email address, and profile picture from Google. Inside Livo we store the profile you create (username, country, gender, bio, avatar), your coins and diamonds balance, your call and chat history, the hosts you follow, and a device identifier so we can keep your account safe and enforce bans. We do not collect your password — sign-in is handled by Google.',
      },
      {
        heading: '2. Calls and messages',
        body: 'Video and audio calls run through our calling provider so you and the host can see and hear each other. Livo does not record your calls. Messages you send in the app are stored so the other person can read them.',
      },
      {
        heading: '3. How we use your data',
        body: 'We use your data to run Livo: to sign you in, show your profile, connect calls, keep your wallet balance, show you hosts, keep the app safe from abuse, and answer your support requests. We do not sell your personal data to anyone.',
      },
      {
        heading: '4. Who we share data with',
        body: 'Your data is processed by the services that run Livo: our database and login provider, our calling provider for live video and audio, Google for sign-in, and Google Play for payments. Each of them handles your data under its own privacy rules and only to provide its service to Livo.',
      },
      {
        heading: '5. How long we keep it',
        body: 'We keep your data while your account exists. If you delete your account from the app settings, it can be restored from the admin panel within 3 months; after that it is permanently deleted.',
      },
      {
        heading: '6. Your choices',
        body: 'You can edit your profile, change your avatar, and delete your account from inside the app. You can turn notifications, microphone, and camera permission on or off in your phone settings at any time.',
      },
      {
        heading: '7. Children',
        body: 'Livo is for adults aged 18 and over only. We do not knowingly collect data from anyone under 18. If you believe a child is using Livo, contact support so the account can be closed.',
      },
      {
        heading: '8. Contact',
        body: 'For privacy questions, data requests, or account deletion help, contact Livo support from inside the app.',
      },
    ],
  },
};

export default function LegalScreen({ navigation, route }) {
  const kind = route && route.params && route.params.kind === 'privacy' ? 'privacy' : 'terms';
  const page = CONTENT[kind];
  return (
    <SafeAreaView style={styles.bg}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{page.title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.updated}>{page.updated}</Text>
        {page.sections.map((s) => (
          <View key={s.heading} style={styles.section}>
            <Text style={styles.heading}>{s.heading}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
        <View style={styles.endPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backArrow: { color: COLORS.purple, fontSize: 26, fontWeight: '700', lineHeight: 28, marginRight: 2 },
  backBtn: { alignItems: 'center', flexDirection: 'row', paddingVertical: 6 },
  backText: { color: COLORS.purple, fontSize: 15, fontWeight: '600' },
  bg: { backgroundColor: '#fff', flex: 1 },
  body: { color: '#374151', fontSize: 14.5, lineHeight: 22 },
  endPad: { height: 24 },
  header: {
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerSpacer: { width: 56 },
  headerTitle: { color: '#111827', fontSize: 17, fontWeight: '700' },
  heading: { color: '#111827', fontSize: 15.5, fontWeight: '700', marginBottom: 6 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  section: { marginBottom: 18 },
  updated: { color: '#6b7280', fontSize: 12.5, marginBottom: 18 },
});
