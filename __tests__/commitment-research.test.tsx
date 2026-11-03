import React from 'react';
import { fireEvent, renderAsync, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { ResearchCitations } from '../src/components/CommitmentResearch';
import {
  CommitmentFollowup,
  readFollowup,
} from '../src/components/CommitmentFollowup';

const followup = {
  state: 'active',
  revision: 4,
  next_review_at: 1000000,
  last_review_at: null,
  progress: '',
  latest_note: null,
  research: { enabled: false, question: '', coverage: null },
};

test('a source link opens only on a tap and reports a failed launch', async () => {
  const open = jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValue(new Error('synthetic unavailable browser'));
  const citation = {
    source_id: 'a'.repeat(64),
    title: 'Public writing guide',
    url: 'https://example.org/guide',
    quote: 'Identify the audience before drafting.',
    retrieved_at: 1000000,
  };
  const ui = await renderAsync(<ResearchCitations values={[citation]} />);
  expect(open).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Public writing guide'));
  expect(open).toHaveBeenCalledWith('https://example.org/guide');
  await waitFor(() =>
    expect(ui.getByText('This source could not be opened.')).toBeTruthy(),
  );
  open.mockRestore();
});

test('research requires an explicit public question and preserves the revision', async () => {
  const onChange = jest.fn();
  const ui = await renderAsync(
    <CommitmentFollowup
      value={followup}
      active
      busy={false}
      onChange={onChange}
    />,
  );
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Enable public research'));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.changeText(
    ui.getByLabelText('Public research question'),
    'What makes a clear technical draft?',
  );
  fireEvent.press(ui.getByText('Enable public research'));
  expect(onChange).toHaveBeenCalledWith({
    action: 'research',
    revision: 4,
    question: 'What makes a clear technical draft?',
  });
});

test('coverage and stopping research are distinct from stopping follow-up', async () => {
  const onChange = jest.fn();
  const value = {
    ...followup,
    research: {
      enabled: true,
      question: 'Public question',
      coverage: {
        coverage: 'unavailable' as const,
        provider: 'keenable' as const,
        source_count: 0,
        checked_at: 1000000,
      },
    },
  };
  expect(readFollowup(value)).toEqual(value);
  const ui = await renderAsync(
    <CommitmentFollowup
      value={value}
      active
      busy={false}
      onChange={onChange}
    />,
  );
  expect(ui.getByText(/Sources could not be checked/)).toBeTruthy();
  fireEvent.press(ui.getByText('Stop public research'));
  expect(onChange).toHaveBeenCalledWith({
    action: 'research',
    revision: 4,
    question: '',
  });
  expect(ui.getByText('Stop following up')).toBeTruthy();
});

test.each([
  ['javascript', 'alert(1)'].join(':'),
  'https://127.0.0.1/',
  'https://user:secret@example.org',
  'https://example.org/?token=secret',
])('rejects unsafe citation %s', url => {
  expect(() =>
    readFollowup({
      ...followup,
      latest_note: {
        action: 'update',
        reason: 'Reason',
        preparation: 'Draft',
        quote: 'Owner quote',
        citations: [
          {
            source_id: 'a'.repeat(64),
            title: 'Source',
            url,
            quote: 'Exact public quotation.',
            retrieved_at: 1000000,
          },
        ],
      },
    }),
  ).toThrow('invalid');
});

test('older servers remain compatible and do not display unavailable controls', async () => {
  const legacy = { ...followup, research: undefined };
  expect(readFollowup(legacy)).toEqual(legacy);
  const ui = await renderAsync(
    <CommitmentFollowup
      value={legacy}
      active
      busy={false}
      onChange={jest.fn()}
    />,
  );
  expect(ui.queryByText('Enable public research')).toBeNull();
});

test('research can be stopped while global reviews are paused', async () => {
  const onChange = jest.fn();
  const ui = await renderAsync(
    <CommitmentFollowup
      value={{
        ...followup,
        research: {
          enabled: true,
          question: 'Public question',
          coverage: null,
        },
      }}
      active={false}
      busy={false}
      onChange={onChange}
    />,
  );
  fireEvent.press(ui.getByText('Update public question'));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Stop public research'));
  expect(onChange).toHaveBeenCalledWith({
    action: 'research',
    revision: 4,
    question: '',
  });
});

test.each(['completed', 'stopped', 'scope_changed'])(
  'ended follow-up %s does not promise another research check',
  async state => {
    const ui = await renderAsync(
      <CommitmentFollowup
        value={{
          ...followup,
          state,
          research: {
            enabled: true,
            question: 'Public question',
            coverage: null,
          },
        }}
        active
        busy={false}
        onChange={jest.fn()}
      />,
    );
    expect(
      ui.getByText('Research is inactive because this follow-up has ended.'),
    ).toBeTruthy();
    expect(ui.queryByText('Awaiting its first public-web check.')).toBeNull();
    expect(ui.queryByText('Update public question')).toBeNull();
  },
);
