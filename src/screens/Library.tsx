import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Action } from '../components/Action';
import { styles } from '../theme';
import { sampleFiles } from '../workspace';
export function Library() {
  const [selected, setSelected] = useState<string | null>(null);
  const file = sampleFiles.find(item => item.id === selected);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>KEEP WHAT MATTERS</Text>
      <Text style={styles.title}>Your Library.</Text>
      <Text style={styles.subtitle}>
        A place for the things you want to return to.
      </Text>
      {file ? (
        <View style={styles.card}>
          <Text style={styles.body}>{file.name}</Text>
          <Text style={styles.subtitle}>{file.detail}</Text>
          <Text style={styles.small}>
            Preview file. Your private Library stays on Radhouse.
          </Text>
          <Action
            title="Back to files"
            onPress={() => setSelected(null)}
            secondary
          />
        </View>
      ) : (
        sampleFiles.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => setSelected(item.id)}
            style={styles.card}
          >
            <Text style={styles.eyebrow}>{item.kind.toUpperCase()}</Text>
            <Text style={styles.body}>{item.name}</Text>
            <Text style={styles.small}>{item.detail}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
