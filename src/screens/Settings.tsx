import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Action } from '../components/Action';
import { styles } from '../theme';
export function Settings({
  signOut,
  previewNotification,
}: Readonly<{ signOut: () => void; previewNotification: () => void }>) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>MAKE YOURSELF AT HOME</Text>
      <Text style={styles.title}>A quieter connection.</Text>
      <View style={styles.card}>
        <Text style={styles.body}>Reply notifications</Text>
        <Text style={styles.subtitle}>
          Know when your reply is ready. Open it when the moment is right.
        </Text>
        <Text style={styles.small}>
          Private by default: reply text stays off the lock screen.
        </Text>
        <Action
          title="Preview a reply notification"
          onPress={previewNotification}
          secondary
        />
        <Text style={styles.small}>
          Preview only. Remote push delivery is not connected yet.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.body}>Development preview</Text>
        <Text style={styles.subtitle}>
          Sample conversations and files. Live sign-in, streaming and push
          delivery are separate acceptance checks.
        </Text>
      </View>
      <Action title="Leave preview" onPress={signOut} secondary />
    </ScrollView>
  );
}
