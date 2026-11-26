// Livo — Agent Detail (2026-11-27, user request): tapping an
// agent card in the Wallet opens the agent's detail inside the
// app — name, @handle, rate, the WhatsApp button and how to pay.
// The agent rows come from list_public_agents() (see
// src/supabase/agent.js); the phone is normalized to wa.me the
// same way as the Wallet (agentWhatsAppNumber, WalletScreen).
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { THEME } from '../config';
import { useApp } from '../store';
import { agentWhatsAppNumber } from './WalletScreen';

export default function AgentDetailScreen({ navigation, route }) {
  const { showToast } = useApp();
  const agent = (route && route.params && route.params.agent) || {};
  const name = agent.name || agent.agentId || 'Agent';
  const handle = agent.agentId || '';
  const rate = Number(agent.rate) || 0;
  const phone = agent.phone || '';

  const openWhatsApp = async () => {
    if (!phone) {
      showToast('This agent has no WhatsApp number yet.');
      return;
    }
    const url = `https://wa.me/${agentWhatsAppNumber(phone)}`;
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        showToast('Could not open WhatsApp.');
      }
    } catch (e) {
      showToast('Could not open WhatsApp.');
    }
  };

  const goBack = () => {
    if (navigation && navigation.goBack) navigation.goBack();
  };

  return (
    <LinearGradient colors={['#341064', '#1c0538', '#12021f']} style={styles.bg}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{String(name).charAt(0).toUpperCase() || 'A'}</Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          {handle ? <Text style={styles.handle}>@{handle}</Text> : null}
          <Text style={styles.rate}>
            {rate > 0 ? `${rate.toLocaleString()} coins per $1` : 'Coin agent'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to buy coins</Text>
          <Text style={styles.howText}>
            1. Pay the agent by cash or bKash.{'\n'}
            2. Share your Livo ID with the agent on WhatsApp.{'\n'}
            3. The agent sends the coins to your account.
          </Text>
          <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp}>
            <Text style={styles.waBtnText}>💬  Chat on WhatsApp</Text>
          </TouchableOpacity>
          <Text style={styles.note}>
            Only pay after the agent confirms your Livo ID — the coins arrive from the agent, not from the app.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: THEME.gold, borderRadius: 36, height: 72, justifyContent: 'center', width: 72 },
  avatarText: { color: '#3d2400', fontSize: 30, fontWeight: 'bold' },
  back: { color: THEME.text, fontSize: 28, fontWeight: 'bold' },
  bg: { flex: 1 },
  card: { alignItems: 'center', backgroundColor: THEME.panel2, borderRadius: 16, marginTop: 16, padding: 20 },
  cardTitle: { alignSelf: 'flex-start', color: THEME.text, fontSize: 17, fontWeight: 'bold', marginBottom: 10 },
  handle: { color: THEME.dim, fontSize: 14, marginTop: 4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerSpacer: { flex: 1 },
  howText: { alignSelf: 'flex-start', color: THEME.text, fontSize: 15, lineHeight: 24 },
  name: { color: THEME.text, fontSize: 22, fontWeight: 'bold', marginTop: 12 },
  note: { alignSelf: 'flex-start', color: THEME.dim, fontSize: 13, lineHeight: 19, marginTop: 12 },
  rate: { color: THEME.gold, fontSize: 16, fontWeight: 'bold', marginTop: 8 },
  waBtn: { alignItems: 'center', backgroundColor: '#25d366', borderRadius: 20, marginTop: 16, paddingVertical: 14, width: '100%' },
  waBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  wrap: { padding: 16, paddingBottom: 32, paddingTop: 48 },
});
