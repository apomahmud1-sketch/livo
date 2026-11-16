import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../config';
import { MESSAGES } from '../data';
import { useApp } from '../store';

export default function MessagesScreen({ navigation }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState([]);
  const { showToast } = useApp();

  return (
    <View style={styles.bg}>
      <Text style={styles.title}>Messages</Text>
      <FlatList
        data={MESSAGES}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('VideoCall', { host: { id: item.id, name: item.name, rateTier: 'tier2', country: '', flag: '' } })}>
            <View style={[styles.avatar, { backgroundColor: item.color }]}>
              <Text style={styles.avatarText}>{item.name[0]}</Text>
            </View>
            <View style={styles.msgBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.text} numberOfLines={1}>{item.text}</Text>
            </View>
            <Text style={styles.time}>{item.time}</Text>
          </TouchableOpacity>
        )}
      />
      <View style={styles.composer}>
        <TextInput style={styles.input} placeholder="Write a message…" value={text} onChangeText={setText} />
        <TouchableOpacity style={styles.send} onPress={() => { if (!text.trim()) return; setSent([...sent, text]); setText(''); showToast('Message sent (demo)'); }}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
      {sent.map((s, i) => (
        <Text key={i} style={styles.sent}>You: {s}</Text>
      ))}
      <Text style={styles.hint}>Tap a chat to start a 1-to-1 video call with that host.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  bg: { backgroundColor: '#fff', flex: 1, paddingTop: 48 },
  composer: { flexDirection: 'row', padding: 12 },
  hint: { color: COLORS.grey, fontSize: 12, paddingHorizontal: 16, paddingBottom: 16 },
  input: { backgroundColor: COLORS.lavender, borderRadius: 20, flex: 1, paddingHorizontal: 14, paddingVertical: 10 },
  msgBody: { flex: 1, marginLeft: 12 },
  name: { fontWeight: 'bold' },
  row: { alignItems: 'center', borderBottomColor: COLORS.lightGrey, borderBottomWidth: 1, flexDirection: 'row', padding: 14 },
  send: { backgroundColor: COLORS.purple, borderRadius: 20, justifyContent: 'center', marginLeft: 8, paddingHorizontal: 16 },
  sendText: { color: '#fff', fontWeight: 'bold' },
  sent: { color: COLORS.grey, paddingHorizontal: 16, paddingVertical: 2 },
  text: { color: COLORS.grey, marginTop: 2 },
  time: { color: COLORS.grey, fontSize: 12 },
  title: { fontSize: 24, fontWeight: 'bold', paddingHorizontal: 16, paddingBottom: 8 },
});
