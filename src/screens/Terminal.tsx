import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Action } from '../components/Action';
import { colors, styles } from '../theme';
export function Terminal() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState(false);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>WHEN YOU NEED A CLOSER LOOK</Text>
      <Text style={styles.title}>Your terminal.</Text>
      <Text style={styles.subtitle}>
        An explicit connection to the assistant’s workspace.
      </Text>
      <View style={terminalStyles.viewport}>
        <Text style={terminalStyles.prompt}>
          {open
            ? '$ sample workspace\n\nReady for the next step.\n▌'
            : '>_\n\nTerminal is closed.'}
        </Text>
      </View>
      <Action
        title={open ? 'Close preview terminal' : 'Open preview terminal'}
        onPress={() => {
          setOpen(!open);
          setContext(false);
        }}
      />
      <View style={styles.card}>
        <View style={styles.spread}>
          <Text style={[styles.body, styles.grow]}>
            Include context in my next message
          </Text>
          <Switch
            accessibilityLabel="Include terminal context"
            value={context}
            disabled={!open}
            onValueChange={setContext}
          />
        </View>
        <Text style={styles.small}>
          Selected text or a bounded recent excerpt, shared only when you send.
        </Text>
      </View>
      <Text style={styles.small}>
        This preview executes no commands. Live terminal input will require a
        confirmed connection and server acknowledgement.
      </Text>
    </ScrollView>
  );
}
const terminalStyles = StyleSheet.create({
  viewport: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    padding: 22,
    minHeight: 230,
  },
  prompt: {
    color: colors.paper,
    fontFamily: 'Courier',
    fontSize: 15,
    lineHeight: 25,
  },
});
