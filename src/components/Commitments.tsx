import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SessionClient } from '../auth/client';
import { Action } from './Action';
import { styles } from '../theme';

type Item = {
  id: string;
  source_request_id: string;
  title: string;
  quote: string;
  reason: string;
  preparation: string;
  state: string;
};
type ReviewState = {
  active: boolean;
  suggestions: Item[];
  coverage: { checked_at: number; outcome: string } | null;
  last_review?: { state: string } | null;
};
function readState(raw: Record<string, unknown>): ReviewState {
  if (
    typeof raw.active !== 'boolean' ||
    !Array.isArray(raw.suggestions) ||
    raw.suggestions.length > 100
  )
    throw new Error('invalid');
  const suggestions = raw.suggestions.map(value => {
    if (
      !value ||
      typeof value !== 'object' ||
      ![
        'id',
        'source_request_id',
        'title',
        'quote',
        'reason',
        'preparation',
        'state',
      ].every(key => typeof value[key] === 'string')
    )
      throw new Error('invalid');
    return value as Item;
  });
  const coverage = raw.coverage as ReviewState['coverage'];
  if (
    coverage &&
    (typeof coverage.checked_at !== 'number' ||
      typeof coverage.outcome !== 'string')
  )
    throw new Error('invalid');
  const last = raw.last_review as ReviewState['last_review'];
  if (last && typeof last.state !== 'string') throw new Error('invalid');
  return { active: raw.active, suggestions, coverage, last_review: last };
}

export function Commitments({
  client,
  focusId,
  onClose,
  onSource,
}: Readonly<{
  client: SessionClient;
  focusId: string | null;
  onClose: () => void;
  onSource: (id: string) => void;
}>) {
  const [value, setValue] = useState<ReviewState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async () =>
      readState(await client.read('/chat/responsibilities/commitments')),
    [client],
  );
  useEffect(() => {
    let current = true;
    load()
      .then(result => {
        if (current) setValue(result);
      })
      .catch(() => {
        if (current)
          setError(
            'Responsibilities could not be loaded. They may not be enabled on this server.',
          );
      });
    return () => {
      current = false;
    };
  }, [load, focusId]);
  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setValue(await load());
    } catch {
      setError(
        'The change could not be saved. Please reconnect and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const stale =
    value?.active &&
    (!value.coverage || Date.now() / 1000 - value.coverage.checked_at > 7200);
  const outcomes: Record<string, string> = {
    quiet: 'Checked; nothing new to suggest.',
    unchanged: 'No new conversation to review.',
    ready: 'Suggestions prepared.',
    running: 'Review in progress.',
    failed: 'The last review failed.',
    interrupted: 'The last review was interrupted.',
    stale: 'New conversation arrived; a fresh review is needed.',
    revoked: 'The earlier review was stopped by a scope change.',
    budget_wait: 'Waiting for the review budget to renew.',
  };
  const outcome =
    value?.coverage?.outcome === 'budget_wait'
      ? 'budget_wait'
      : value?.last_review?.state ?? value?.coverage?.outcome ?? '';
  const items =
    value?.suggestions.filter(item => !focusId || item.id === focusId) ?? [];
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>STANDING RESPONSIBILITY</Text>
      <Text style={styles.title}>Commitment suggestions</Text>
      <Text style={styles.body}>
        Radhouse may review up to 30 recent exchanges from the last seven days,
        up to four times per day, and prepare a suggested next step.
      </Text>
      <Text style={styles.small}>
        Attachments, Library, browser, other conversations and external actions
        are outside this scope. You decide which suggestions are commitments.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.body}>
          {error}
        </Text>
      ) : null}
      {value ? (
        <>
          <Text style={styles.small}>
            {value.active ? 'Permission enabled.' : 'Paused.'}{' '}
            {stale
              ? 'Recent coverage has not been established.'
              : value.coverage
              ? 'Last check: ' +
                new Date(value.coverage.checked_at * 1000).toLocaleString() +
                '. ' +
                (outcomes[outcome] ?? 'Review status unavailable.')
              : 'No completed review yet.'}
          </Text>
          <Action
            title={value.active ? 'Pause suggestions' : 'Enable suggestions'}
            disabled={busy}
            onPress={() =>
              change(() => client.commitmentControl(!value.active))
            }
          />
        </>
      ) : null}
      {value && !items.length ? (
        <Text style={styles.body}>No suggestions to consider here.</Text>
      ) : null}
      {items.map(item => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.eyebrow}>
            {item.state === 'suggested'
              ? 'FOR YOUR CONFIRMATION'
              : item.state.toUpperCase()}
          </Text>
          <Text style={styles.subtitle}>{item.title}</Text>
          <Text selectable style={styles.body}>
            “{item.quote}”
          </Text>
          <Text style={styles.body}>{item.reason}</Text>
          <Text style={styles.subtitle}>A possible next step</Text>
          <Text selectable style={styles.body}>
            {item.preparation}
          </Text>
          <Action
            title="Read the original message"
            secondary
            onPress={() => onSource(item.source_request_id)}
          />
          {item.state === 'suggested' ? (
            <>
              <Text style={styles.small}>
                Confirmation saves this commitment. It does not schedule
                follow-ups or authorize external actions.
              </Text>
              <Action
                title="Confirm commitment"
                disabled={busy}
                onPress={() =>
                  change(() => client.commitmentDecision(item.id, 'confirmed'))
                }
              />
              <Action
                title="Not a commitment"
                secondary
                disabled={busy}
                onPress={() =>
                  change(() => client.commitmentDecision(item.id, 'dismissed'))
                }
              />
            </>
          ) : null}
        </View>
      ))}
      <Action title="Close responsibilities" secondary onPress={onClose} />
    </View>
  );
}
