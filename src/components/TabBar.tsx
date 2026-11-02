import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Destination, destinations } from '../workspace';

const symbols: Record<Destination, string> = {
  Chat: '◌',
  Library: '▤',
  Browser: '◎',
  Terminal: '>_',
  Settings: '☷',
};
export function TabBar({
  destination,
  select,
  disabled = false,
}: Readonly<{
  destination: Destination;
  select: (value: Destination) => void;
  disabled?: boolean;
}>) {
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {destinations.map(item => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityLabel={item}
          accessibilityState={{ selected: destination === item, disabled }}
          disabled={disabled}
          onPress={() => select(item)}
          style={styles.tab}
        >
          <Text
            style={[styles.symbol, destination === item && styles.selected]}
          >
            {symbols[item]}
          </Text>
          <Text style={[styles.label, destination === item && styles.selected]}>
            {item}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 6,
    backgroundColor: colors.paper,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 8 },
  symbol: { fontSize: 22, height: 26, color: colors.muted },
  label: { fontSize: 10, fontWeight: '500', color: colors.muted },
  selected: { color: colors.ink, fontWeight: '700' },
});
