import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Action } from '../components/Action';
import { colors, styles } from '../theme';
import {
  Catalog,
  Selection,
  selectedModel,
  thinkingChoices,
} from './inference';

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: Readonly<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        local.choice,
        selected && local.selected,
        disabled && local.disabled,
      ]}
    >
      <Text style={styles.body}>
        {selected ? '●  ' : '○  '}
        {label}
      </Text>
    </Pressable>
  );
}
export function ModelPicker({
  visible,
  close,
  catalog,
  selection,
  select,
  refresh,
  loading,
  error,
}: Readonly<{
  visible: boolean;
  close: () => void;
  catalog: Catalog | null;
  selection: Selection | null;
  select: (value: Selection | null) => void;
  refresh: () => void;
  loading: boolean;
  error: string;
}>) {
  const model = selectedModel(catalog, selection);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.page}>
          <Text accessibilityRole="header" style={styles.title}>
            Your next reply
          </Text>
          <Action title="Done" onPress={close} />
        </View>
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>
            Choose a model and how much it thinks. More thinking can take
            longer. OpenAI selections send conversation context to OpenAI.
          </Text>
          {error ? (
            <Text accessibilityRole="alert" style={styles.body}>
              {error}
            </Text>
          ) : null}
          <Text accessibilityRole="header" style={styles.eyebrow}>
            MODEL
          </Text>
          <Choice
            label="Default model"
            selected={!selection}
            onPress={() => select(null)}
          />
          {catalog?.models.map(row => (
            <Choice
              key={`${row.provider}:${row.id}`}
              label={row.label + (row.available ? '' : ' · unavailable')}
              disabled={!row.available || loading}
              selected={row === model}
              onPress={() =>
                select({
                  provider: row.provider,
                  model: row.id,
                  thinking: 'default',
                })
              }
            />
          ))}
          {selection && (
            <>
              <Text accessibilityRole="header" style={styles.eyebrow}>
                THINKING
              </Text>
              {thinkingChoices(model).map(effort => (
                <Choice
                  key={effort}
                  label={effort === 'default' ? 'Default thinking' : effort}
                  selected={effort === selection.thinking}
                  onPress={() => select({ ...selection, thinking: effort })}
                />
              ))}
            </>
          )}
          <Action
            title={loading ? 'Checking models…' : 'Refresh models'}
            secondary
            disabled={loading}
            onPress={refresh}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const local = StyleSheet.create({
  choice: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  selected: { borderColor: colors.ink, backgroundColor: colors.soft },
  disabled: { opacity: 0.5 },
});
