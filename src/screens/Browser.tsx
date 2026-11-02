import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Action } from '../components/Action';
import { styles } from '../theme';
import { BrowserMode } from '../workspace';
const labels: Record<BrowserMode, string> = {
  agent: 'Nova has control',
  private: 'Private · only you can see',
  observe: 'Observe · Nova can see, you control',
};
export function Browser() {
  const [mode, setMode] = useState<BrowserMode>('agent');
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>ONE SHARED WORKSPACE</Text>
      <Text style={styles.title}>Browse together.</Text>
      <Text style={styles.subtitle}>
        Follow along, or take the controls when you need them.
      </Text>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>STREAM PREVIEW</Text>
        <Text style={styles.body}>A window into your assistant’s browser.</Text>
        <Text style={styles.subtitle}>
          Live video will appear here after the app’s secure connection is
          qualified.
        </Text>
        <Text style={styles.small}>
          No remote browser is opened or controlled in this preview.
        </Text>
      </View>
      <Text accessibilityRole="summary" style={styles.body}>
        {labels[mode]}
      </Text>
      {mode === 'agent' ? (
        <Action
          title="Preview taking control"
          onPress={() => setMode('private')}
        />
      ) : (
        <>
          <Action
            title={
              mode === 'private'
                ? 'Preview Observe mode'
                : 'Return to Private mode'
            }
            onPress={() => setMode(mode === 'private' ? 'observe' : 'private')}
            secondary
          />
          <Action
            title="Return control to Nova"
            onPress={() => setMode('agent')}
          />
        </>
      )}
      <Text style={styles.small}>
        Private and Observe remain explicit choices. Reconnecting never grants
        new control.
      </Text>
    </ScrollView>
  );
}
