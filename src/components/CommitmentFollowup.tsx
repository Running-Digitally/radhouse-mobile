import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FollowupAction } from '../auth/client';
import { Action } from './Action';
import { styles } from '../theme';

export type Followup = {
  state: string;
  revision: number;
  next_review_at: number;
  last_review_at: number | null;
  progress: string;
  latest_note: {
    action: string;
    reason: string;
    preparation: string;
    quote: string;
  } | null;
};

export function readFollowup(raw: unknown): Followup | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') throw new Error('invalid');
  const value = raw as Followup;
  if (
    !['active', 'snoozed', 'completed', 'stopped', 'scope_changed'].includes(
      value.state,
    ) ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    !Number.isFinite(value.next_review_at) ||
    (value.last_review_at !== null && !Number.isFinite(value.last_review_at)) ||
    typeof value.progress !== 'string' ||
    value.progress.length > 2000
  )
    throw new Error('invalid');
  const note = value.latest_note;
  if (
    note !== null &&
    (!note ||
      typeof note !== 'object' ||
      !['action', 'reason', 'preparation', 'quote'].every(
        key =>
          typeof (note as unknown as Record<string, unknown>)[key] === 'string',
      ))
  ) {
    throw new Error('invalid');
  }
  return value;
}

export function CommitmentFollowup({
  value,
  active,
  busy,
  onChange,
}: Readonly<{
  value: Followup;
  active: boolean;
  busy: boolean;
  onChange: (action: FollowupAction) => void;
}>) {
  const [progress, setProgress] = useState(value.progress);
  useEffect(
    () => setProgress(value.progress),
    [value.progress, value.revision],
  );
  const live = ['active', 'snoozed'].includes(value.state);
  const revision = value.revision;
  return (
    <View>
      <Text style={styles.subtitle}>Ongoing follow-up</Text>
      <Text style={styles.eyebrow}>{value.state.toUpperCase()}</Text>
      {live ? (
        <Text style={styles.small}>
          Next review: {new Date(value.next_review_at * 1000).toLocaleString()}.
          Checks may wait for the shared review budget.
        </Text>
      ) : null}
      <Text style={styles.small}>
        {value.last_review_at
          ? 'Last reviewed: ' +
            new Date(value.last_review_at * 1000).toLocaleString()
          : 'Awaiting its first follow-up review.'}
      </Text>
      {value.latest_note ? (
        <>
          <Text style={styles.subtitle}>
            {value.latest_note.action === 'completion_check'
              ? 'Does this mean it is complete?'
              : 'Latest preparation'}
          </Text>
          <Text style={styles.body}>{value.latest_note.reason}</Text>
          <Text selectable style={styles.body}>
            {value.latest_note.preparation}
          </Text>
          <Text selectable style={styles.small}>
            “{value.latest_note.quote}”
          </Text>
        </>
      ) : null}
      {live ? (
        <>
          <Text style={styles.body}>Progress or a correction</Text>
          <TextInput
            accessibilityLabel="Progress or a correction"
            style={styles.input}
            multiline
            maxLength={2000}
            value={progress}
            onChangeText={setProgress}
            editable={!busy && active}
            placeholder="What has changed?"
          />
          <Action
            title="Save progress"
            disabled={busy || !active || !progress.trim()}
            onPress={() => onChange({ action: 'progress', revision, progress })}
          />
          <Action
            title="Snooze 1 day"
            secondary
            disabled={busy || !active}
            onPress={() => onChange({ action: 'snooze', revision, days: 1 })}
          />
          <Action
            title="Snooze 1 week"
            secondary
            disabled={busy || !active}
            onPress={() => onChange({ action: 'snooze', revision, days: 7 })}
          />
          {value.state === 'snoozed' ? (
            <Action
              title="Resume now"
              disabled={busy || !active}
              onPress={() => onChange({ action: 'resume', revision })}
            />
          ) : null}
          <Action
            title="Mark complete"
            disabled={busy}
            onPress={() => onChange({ action: 'complete', revision })}
          />
          <Action
            title="Stop following up"
            secondary
            disabled={busy}
            onPress={() => onChange({ action: 'stop', revision })}
          />
        </>
      ) : null}
    </View>
  );
}
