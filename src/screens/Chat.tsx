import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Action } from '../components/Action';
import { styles } from '../theme';
import { Turn } from '../workspace';
export function Chat({
  turns,
  setTurns,
}: Readonly<{
  turns: readonly Turn[];
  setTurns: React.Dispatch<React.SetStateAction<readonly Turn[]>>;
}>) {
  const [text, setText] = useState('');
  function send() {
    const question = text.trim();
    if (!question) {
      return;
    }
    setTurns(previous => [
      ...previous,
      {
        id: `preview-${previous.length}`,
        question,
        answer:
          'This is a sample reply. In the connected app, your message and reply belong to the same Radhouse conversation.',
      },
    ]);
    setText('');
  }
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>YOUR SPACE TO THINK</Text>
      <Text style={styles.title}>A little more clarity.</Text>
      <Text style={styles.subtitle}>Pick up where you left off.</Text>
      {turns.map(turn => (
        <View key={turn.id} style={styles.card}>
          <Text style={styles.eyebrow}>YOU</Text>
          <Text style={styles.body}>{turn.question}</Text>
          <Text style={styles.eyebrow}>NOVA · SAMPLE REPLY</Text>
          <Text style={styles.body}>{turn.answer}</Text>
        </View>
      ))}
      <TextInput
        accessibilityLabel="Message your assistant"
        placeholder="What’s on your mind?"
        multiline
        value={text}
        onChangeText={setText}
        style={styles.input}
      />
      <Action
        title="Send sample message"
        onPress={send}
        disabled={!text.trim()}
      />
    </ScrollView>
  );
}
