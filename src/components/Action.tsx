import React from 'react';
import { Pressable, Text } from 'react-native';
import { styles } from '../theme';
export function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: Readonly<{
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondary]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
        {title}
      </Text>
    </Pressable>
  );
}
