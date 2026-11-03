import React, { useEffect, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { FollowupAction } from '../auth/client';
import { styles } from '../theme';
import { Action } from './Action';

export type Research = {
  enabled: boolean;
  question: string;
  coverage: null | {
    coverage: 'available' | 'partial' | 'unavailable';
    checked_at: number;
    provider: 'keenable';
    source_count: number;
  };
};
export type Citation = {
  source_id: string;
  title: string;
  url: string;
  quote: string;
  retrieved_at: number;
};

export function publicCitation(value: Citation): boolean {
  try {
    const url = new URL(value.url);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!url.port || url.port === '443') &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
        url.hostname,
      ) &&
      !/\.(local|localhost|internal|test|invalid|example)$/i.test(
        url.hostname,
      ) &&
      typeof value.title === 'string' &&
      value.title.length <= 200 &&
      typeof value.quote === 'string' &&
      value.quote.length <= 400 &&
      /^[a-f0-9]{64}$/.test(value.source_id) &&
      Number.isFinite(value.retrieved_at)
    );
  } catch {
    return false;
  }
}

export function readResearch(value: Research | undefined): boolean {
  if (value === undefined) return true; // Older servers do not offer this control.
  if (
    !value ||
    typeof value.enabled !== 'boolean' ||
    typeof value.question !== 'string' ||
    value.question.length > 300
  )
    return false;
  const c = value.coverage;
  return (
    c === null ||
    Boolean(
      c &&
        ['available', 'partial', 'unavailable'].includes(c.coverage) &&
        Number.isFinite(c.checked_at) &&
        c.provider === 'keenable' &&
        Number.isInteger(c.source_count) &&
        c.source_count >= 0 &&
        c.source_count <= 2,
    )
  );
}

export function ResearchCitations({
  values,
}: Readonly<{ values: Citation[] }>) {
  const [error, setError] = useState('');
  return (
    <View>
      {values.map(value => (
        <View key={value.source_id}>
          <Action
            title={value.title}
            secondary
            onPress={() => {
              if (publicCitation(value))
                Linking.openURL(value.url).catch(() =>
                  setError('This source could not be opened.'),
                );
            }}
          />
          <Text selectable style={styles.small}>
            “{value.quote}”
          </Text>
          <Text style={styles.small}>
            Checked {new Date(value.retrieved_at * 1000).toLocaleString()}
          </Text>
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={styles.small}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function CommitmentResearch({
  value,
  revision,
  live,
  active,
  busy,
  onChange,
}: Readonly<{
  value: Research;
  revision: number;
  live: boolean;
  active: boolean;
  busy: boolean;
  onChange: (action: FollowupAction) => void;
}>) {
  const [question, setQuestion] = useState(value.question);
  useEffect(() => setQuestion(value.question), [value.question, revision]);
  const coverage = value.coverage;
  let status = 'Off for this commitment.';
  if (value.enabled) status = 'Enabled for this commitment.';
  if (value.enabled && !live)
    status = 'Research is inactive because this follow-up has ended.';
  return (
    <View>
      <Text style={styles.subtitle}>Public-web research</Text>
      <Text style={styles.small}>{status}</Text>
      {coverage ? (
        <Text style={styles.small}>
          {coverage.coverage === 'unavailable'
            ? 'Sources could not be checked.'
            : `Limited research: ${coverage.source_count} source(s) checked.`}{' '}
          {new Date(coverage.checked_at * 1000).toLocaleString()}. Search does
          not cover the whole web.
        </Text>
      ) : null}
      {!coverage && value.enabled && live ? (
        <Text style={styles.small}>Awaiting its first public-web check.</Text>
      ) : null}
      {live ? (
        <>
          <Text style={styles.body}>Public research question</Text>
          <TextInput
            accessibilityLabel="Public research question"
            style={styles.input}
            multiline
            maxLength={300}
            value={question}
            onChangeText={setQuestion}
            editable={!busy && active}
            placeholder="A public question that would help this commitment"
          />
          <Text style={styles.small}>
            Only this question is sent to Keenable for search. Leave out private
            details. Radhouse reads up to two public pages; it cannot use your
            browser logins or act on the results.
          </Text>
          <Action
            title={
              value.enabled
                ? 'Update public question'
                : 'Enable public research'
            }
            disabled={busy || !active || question.trim().length < 5}
            onPress={() => onChange({ action: 'research', revision, question })}
          />
          {value.enabled ? (
            <Action
              title="Stop public research"
              secondary
              disabled={busy}
              onPress={() =>
                onChange({ action: 'research', revision, question: '' })
              }
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
