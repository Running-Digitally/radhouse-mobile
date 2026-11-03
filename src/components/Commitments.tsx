import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SessionClient } from '../auth/client';
import {
  CommitmentFollowup,
  Followup,
  readFollowup,
} from './CommitmentFollowup';
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
  followup: Followup | null;
};
type ReviewState = {
  active: boolean;
  followupsSupported: boolean;
  suggestions: Item[];
  coverage: { checked_at: number; outcome: string } | null;
  last_review?: { state: string; error?: string | null } | null;
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
    return { ...value, followup: readFollowup(value.followup) } as Item;
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
  const scope = raw.scope as { followups_supported?: unknown } | undefined;
  return {
    active: raw.active,
    followupsSupported: scope?.followups_supported === true,
    suggestions,
    coverage,
    last_review: last,
  };
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
    quiet: 'Checked; nothing needs your attention.',
    unchanged: 'No new conversation to review.',
    ready: 'Suggestions or follow-up preparation ready.',
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
  let coverageMessage = 'No completed review yet.';
  if (value?.last_review?.error === 'review_evidence_too_large') {
    coverageMessage =
      'Review input exceeded the size limit; shorten progress notes.';
  } else if (stale) {
    coverageMessage = 'Recent coverage has not been established.';
  } else if (value?.coverage) {
    coverageMessage =
      'Last check: ' +
      new Date(value.coverage.checked_at * 1000).toLocaleString() +
      '. ' +
      (outcomes[outcome] ?? 'Review status unavailable.');
  }
  const items =
    value?.suggestions.filter(item => !focusId || item.id === focusId) ?? [];
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>STANDING RESPONSIBILITY</Text>
      <Text style={styles.title}>Commitments and follow-up</Text>
      <Text style={styles.body}>
        Radhouse may review saved commitments and your progress notes, plus up
        to 30 recent exchanges from the last seven days, up to four times per
        day, and prepare useful next steps. Activated commitments stay under
        review with progress check-ins, snooze and completion controls.
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
            {value.active ? 'Permission enabled.' : 'Paused.'} {coverageMessage}
          </Text>
          <Action
            title={value.active ? 'Pause reviews' : 'Resume reviews'}
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
                {value?.followupsSupported
                  ? 'Confirmation starts private ongoing review. Radhouse can prepare next steps and ask about progress; you control snooze, completion and stop. No external action is authorized.'
                  : 'Confirmation saves this commitment. Ongoing follow-up is not available on this server.'}
              </Text>
              <Action
                title={
                  value?.followupsSupported
                    ? 'Confirm and follow up'
                    : 'Confirm commitment'
                }
                disabled={busy || !value?.active}
                onPress={() =>
                  change(() =>
                    client.commitmentDecision(
                      item.id,
                      value?.followupsSupported
                        ? 'confirmed_followup'
                        : 'confirmed',
                    ),
                  )
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
          {item.state === 'confirmed' &&
          !item.followup &&
          value?.followupsSupported ? (
            <>
              <Text style={styles.small}>
                Saved only. Ongoing follow-up has not been started.
              </Text>
              <Action
                title="Start follow-up"
                disabled={busy || !value.active}
                onPress={() =>
                  change(() =>
                    client.commitmentDecision(item.id, 'confirmed_followup'),
                  )
                }
              />
            </>
          ) : null}
          {item.followup ? (
            <CommitmentFollowup
              value={item.followup}
              active={value?.active === true}
              busy={busy}
              onChange={action =>
                change(() => client.commitmentFollowup(item.id, action))
              }
            />
          ) : null}
        </View>
      ))}
      <Action title="Close responsibilities" secondary onPress={onClose} />
    </View>
  );
}
