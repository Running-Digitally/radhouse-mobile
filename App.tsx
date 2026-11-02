import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Connected } from './src/screens/Connected';
import { nativeSession } from './src/auth/native';
import { Action } from './src/components/Action';
import { Chat } from './src/screens/Chat';
import { Library } from './src/screens/Library';
import { Browser } from './src/screens/Browser';
import { Terminal } from './src/screens/Terminal';
import { Settings } from './src/screens/Settings';
import { Destination, destinations, sampleTurns, Turn } from './src/workspace';
import { colors, styles } from './src/theme';
const symbols: Record<Destination, string> = {
  Chat: '◌',
  Library: '▤',
  Browser: '◎',
  Terminal: '>_',
  Settings: '☷',
};
function Workspace() {
  const [connected, setConnected] = useState(false);
  const [turns, setTurns] = useState<readonly Turn[]>(sampleTurns);
  const [preview, setPreview] = useState(false);
  const [destination, setDestination] = useState<Destination>('Chat');
  const [notification, setNotification] = useState(false);
  function leave() {
    setTurns(sampleTurns);
    setPreview(false);
    setNotification(false);
    setDestination('Chat');
  }
  function screen() {
    switch (destination) {
      case 'Chat':
        return <Chat turns={turns} setTurns={setTurns} />;
      case 'Library':
        return <Library />;
      case 'Browser':
        return <Browser />;
      case 'Terminal':
        return <Terminal />;
      case 'Settings':
        return (
          <Settings
            signOut={leave}
            previewNotification={() => setNotification(true)}
          />
        );
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <View style={appStyles.header}>
        <Text style={appStyles.brand}>radhouse</Text>
        <Text style={styles.eyebrow}>A PLACE TO RETURN TO</Text>
      </View>
      {connected ? (
        <KeyboardAvoidingView
          style={styles.grow}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Connected client={nativeSession} leave={() => setConnected(false)} />
        </KeyboardAvoidingView>
      ) : preview ? (
        <>
          <View style={appStyles.preview}>
            <Text style={styles.small}>Development preview · sample data</Text>
          </View>
          {notification && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open sample reply notification"
              style={appStyles.notification}
              onPress={() => {
                setDestination('Chat');
                setNotification(false);
              }}
            >
              <Text style={styles.body}>Your Radhouse reply is ready</Text>
              <Text style={styles.small}>
                Sample notification · tap to return to Chat
              </Text>
            </Pressable>
          )}
          <KeyboardAvoidingView
            style={styles.grow}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {screen()}
          </KeyboardAvoidingView>
          <View style={appStyles.tabs} accessibilityRole="tablist">
            {destinations.map(item => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityLabel={item}
                accessibilityState={{ selected: destination === item }}
                onPress={() => setDestination(item)}
                style={appStyles.tab}
              >
                <Text
                  style={[
                    appStyles.tabSymbol,
                    destination === item && appStyles.selected,
                  ]}
                >
                  {symbols[item]}
                </Text>
                <Text
                  style={[
                    appStyles.tabLabel,
                    destination === item && appStyles.selected,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={[styles.page, appStyles.welcome]}>
          <View style={appStyles.mark}>
            <Text style={appStyles.markText}>r.</Text>
          </View>
          <Text style={styles.eyebrow}>YOUR ASSISTANT. YOUR SPACE.</Text>
          <Text style={appStyles.welcomeTitle}>
            Bring a thought.{'\n'}Find a little clarity.
          </Text>
          <Text style={styles.subtitle}>
            Your conversation, files and workspace, together wherever you are.
          </Text>
          <Action
            title="Connect to my Radhouse"
            onPress={() => setConnected(true)}
          />
          <Action
            title="Explore the app preview"
            onPress={() => setPreview(true)}
          />
          <Text style={styles.small}>
            Connect to your account, or explore with sample data.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Workspace />
    </SafeAreaProvider>
  );
}
const appStyles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingVertical: 18, gap: 6 },
  brand: {
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.ink,
  },
  welcome: { flex: 1, justifyContent: 'center', paddingBottom: 60, gap: 24 },
  welcomeTitle: {
    fontSize: 36,
    lineHeight: 43,
    fontWeight: '600',
    color: colors.ink,
  },
  mark: {
    width: 72,
    height: 72,
    backgroundColor: colors.ink,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontSize: 46, color: colors.paper, fontWeight: '600' },
  preview: {
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: colors.soft,
  },
  notification: {
    padding: 14,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.accent,
    gap: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 10,
    backgroundColor: colors.paper,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8 },
  tabSymbol: { fontSize: 22, height: 28, color: colors.muted },
  tabLabel: { fontSize: 10, fontWeight: '500', color: colors.muted },
  selected: { color: colors.ink, fontWeight: '700' },
});
