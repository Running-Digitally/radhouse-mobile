import React from 'react';
import { AppState, Keyboard, Linking, Share, ScrollView } from 'react-native';
import {
  act,
  fireEvent,
  renderAsync,
  waitFor,
} from '@testing-library/react-native';
import { Connected } from '../src/screens/Connected';
import { SessionClient } from '../src/auth/client';
import { SessionError } from '../src/auth/types';
import { NotificationConnection } from '../src/notifications/connection';
import {
  readCatalog,
  selectionAvailable,
  thinkingChoices,
} from '../src/chat/inference';
import { readTurns, mergeTurns, turnStatus } from '../src/chat/transcript';
import { Reply, replyBlocks } from '../src/chat/Reply';

jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
const id = '58e8f3dd-cd82-48a4-9df9-63c3a15b310f';
const info = { username: 'synthetic-owner', features: { inference: true } };
const turn = {
  request_id: id,
  seq: 10,
  text: 'A question',
  output: 'A **readable** answer',
  status: 'completed',
};
const model = {
  provider: 'custom:openai',
  id: 'gpt-6.1-sol',
  label: 'GPT-6.1 Sol',
  available: true,
  thinking: {
    state: 'supported',
    choices: ['low', 'medium', 'high', 'xhigh', 'max'],
    can_disable: false,
    can_enable: false,
  },
};
const catalog = {
  schema: 'radhouse.inference.v1',
  state: 'available',
  current_model: 'local',
  engines: [{ id: 'custom:openai', label: 'OpenAI' }],
  models: [
    model,
    {
      ...model,
      id: 'gpt-6.1-terra',
      label: 'GPT-6.1 Terra',
      thinking: { ...model.thinking, can_disable: true },
    },
  ],
};
async function fixture(notifications?: NotificationConnection) {
  const read = jest.fn(
    async (path: string): Promise<Record<string, unknown>> => {
      if (path === '/auth/session') {
        return info;
      }
      if (path.startsWith('/chat/inference')) {
        return catalog;
      }
      return { turns: [turn], older_before: 10 };
    },
  );
  const client = {
    restore: jest.fn(async () => info),
    logout: jest.fn(async () => undefined),
    read,
    send: jest.fn(async () => ({})),
    newRequestId: jest.fn(async () => id),
  };
  const ui = await renderAsync(
    <Connected
      client={client as unknown as SessionClient}
      leave={jest.fn()}
      notifications={notifications}
    />,
  );
  await waitFor(() => expect(ui.queryByText('Connecting…')).toBeNull());
  await waitFor(() => expect(read).toHaveBeenCalledWith('/chat/inference'));
  await waitFor(() => expect(ui.getByText('A question')).toBeTruthy());
  await act(async () => {});
  return { ui, client };
}
beforeEach(() => {
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

// The first connected render also loads the instrumented native fixture on a
// cold coverage run. Its budget is separate from the assertion waits.
test('connected controls show supported thinking, selected radio state, and freeze settings across retry', async () => {
  const { ui, client } = await fixture();
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText(/OpenAI · GPT-6.1 Sol/));
  expect(ui.queryByText('○  off')).toBeNull();
  fireEvent.press(ui.getByText('○  max'));
  expect(
    ui.getByRole('radio', { name: '●  max' }).props.accessibilityState.selected,
  ).toBe(true);
  fireEvent.press(ui.getByText('Done'));
  client.send.mockRejectedValueOnce(new SessionError('unavailable'));
  fireEvent.changeText(
    ui.getByLabelText('Message Radhouse'),
    'One message with max thinking',
  );
  fireEvent.press(ui.getByText('Send message'));
  await waitFor(() => expect(ui.getByText('Retry same message')).toBeTruthy());
  expect(
    ui.getByLabelText('Choose model and thinking').props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(ui.getByText('Retry same message'));
  await waitFor(() => expect(client.send).toHaveBeenCalledTimes(2));
  expect(client.send.mock.calls[0]).toEqual([
    id,
    'One message with max thinking',
    { provider: 'custom:openai', model: 'gpt-6.1-sol', thinking: 'max' },
  ]);
  expect(client.send.mock.calls[1]).toEqual(client.send.mock.calls[0]);
  expect(client.newRequestId).toHaveBeenCalledTimes(2); // Browser tab and one message; retry keeps its ID.
}, 12000);

test('unavailable selected model cannot silently fall back; Default recovers', async () => {
  const { ui, client } = await fixture();
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText(/OpenAI · GPT-6.1 Terra/));
  fireEvent.press(ui.getByText('○  off'));
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(async path =>
    path === '/chat/inference?refresh=true'
      ? { ...catalog, models: [] }
      : originalRead(path),
  );
  const refresh = await ui.findByRole('button', {
    name: 'Refresh models',
    disabled: false,
  });
  await act(async () => fireEvent.press(refresh));
  expect(client.read).toHaveBeenCalledWith('/chat/inference?refresh=true');
  await waitFor(() =>
    expect(
      ui.queryByRole('radio', { name: /OpenAI · GPT-6.1 Terra/ }),
    ).toBeNull(),
  );
  fireEvent.press(ui.getByText('Done'));
  fireEvent.changeText(ui.getByLabelText('Message Radhouse'), 'Keep my draft');
  expect(
    ui.getByRole('button', { name: 'Send message' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText('○  Default model'));
  fireEvent.press(ui.getByText('Done'));
  expect(
    ui.getByRole('button', { name: 'Send message' }).props.accessibilityState
      .disabled,
  ).toBe(false);
});

test('a definitive model admission rejection restores the draft and permits choosing Default', async () => {
  const { ui, client } = await fixture();
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText(/OpenAI · GPT-6.1 Sol/));
  fireEvent.press(ui.getByText('Done'));
  client.send.mockRejectedValueOnce(new SessionError('conflict', true));
  fireEvent.changeText(
    ui.getByLabelText('Message Radhouse'),
    'Preserved draft',
  );
  fireEvent.press(ui.getByText('Send message'));
  await waitFor(() =>
    expect(ui.getByLabelText('Message Radhouse').props.editable).toBe(true),
  );
  expect(ui.getByLabelText('Message Radhouse').props.value).toBe(
    'Preserved draft',
  );
  expect(ui.queryByText('Retry same message')).toBeNull();
  expect(ui.getByText(/The model settings were not accepted/)).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText('○  Default model'));
  fireEvent.press(ui.getByText('Done'));
  fireEvent.changeText(ui.getByLabelText('Message Radhouse'), 'Edited draft');
  fireEvent.press(ui.getByText('Send message'));
  await waitFor(() =>
    expect(client.send).toHaveBeenLastCalledWith(id, 'Edited draft'),
  );
  expect(client.newRequestId).toHaveBeenCalledTimes(3); // Browser tab plus two distinct messages.
});

test('resuming after more than a latest page reopens history pagination and removes stale working state', async () => {
  let changed!: (state: 'active' | 'background') => void;
  jest
    .mocked(AppState.addEventListener)
    .mockImplementation((_event, callback) => {
      changed = callback;
      return { remove: jest.fn() };
    });
  const { ui, client } = await fixture();
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(async path =>
    path === '/chat/reply'
      ? {
          turns: [{ ...turn, status: 'running', output: '' }],
          older_before: null,
        }
      : originalRead(path),
  );
  await act(async () => fireEvent.press(ui.getByText('Refresh conversation')));
  await waitFor(() =>
    expect(ui.getAllByText('Working on your reply').length).toBeGreaterThan(0),
  );
  await waitFor(() =>
    expect(ui.queryByText('Load earlier messages')).toBeTruthy(),
  );
  // Exhaust the first window's cursor, as on an initially short conversation.
  client.read.mockImplementation(async path =>
    path.startsWith('/chat/history')
      ? { turns: [], older_before: null }
      : path === '/chat/reply'
      ? {
          turns: [{ ...turn, status: 'running', output: '' }],
          older_before: null,
        }
      : originalRead(path),
  );
  // The refresh can publish its rows before its final busy-state update. Wait
  // until a user could actually press the next control, not just see its label.
  await waitFor(() =>
    expect(
      ui.getByRole('button', { name: 'Load earlier messages' }).props
        .accessibilityState.disabled,
    ).toBe(false),
  );
  await act(async () => fireEvent.press(ui.getByText('Load earlier messages')));
  await waitFor(() =>
    expect(ui.queryByText('Load earlier messages')).toBeNull(),
  );
  fireEvent.changeText(
    ui.getByLabelText('Message Radhouse'),
    'Keep this draft',
  );
  const latest = Array.from({ length: 50 }, (_, index) => ({
    ...turn,
    seq: 71 + index,
    request_id: 'new-' + index,
    text: 'New question ' + index,
    output: 'New answer ' + index,
  }));
  client.read.mockImplementation(async path =>
    path === '/chat/reply'
      ? { turns: latest, older_before: 71 }
      : path === '/chat/history?before=71'
      ? {
          turns: [
            { ...turn, seq: 70, request_id: 'gap', text: 'Recovered gap' },
          ],
          older_before: 70,
        }
      : originalRead(path),
  );
  await act(async () => changed('background'));
  await act(async () => changed('active'));
  await waitFor(() => expect(ui.getByText('New question 49')).toBeTruthy());
  expect(ui.queryByText('A question')).toBeNull();
  expect(ui.queryByText('Working on your reply')).toBeNull();
  expect(ui.getByLabelText('Message Radhouse').props.value).toBe(
    'Keep this draft',
  );
  await act(async () => fireEvent.press(ui.getByText('Load earlier messages')));
  await waitFor(() => expect(ui.getByText('Recovered gap')).toBeTruthy());
  expect(client.read).toHaveBeenCalledWith('/chat/history?before=71');
});

test('model discovery failure leaves Default usable and exposes refresh', async () => {
  const { ui, client } = await fixture();
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(async path => {
    if (path === '/chat/inference?refresh=true')
      throw new SessionError('unavailable');
    return originalRead(path);
  });
  fireEvent.press(ui.getByText('Refresh models'));
  await waitFor(() =>
    expect(
      ui.getByText('Models could not be checked. Retry or use Default.'),
    ).toBeTruthy(),
  );
  fireEvent.press(ui.getByText('Done'));
  fireEvent.changeText(ui.getByLabelText('Message Radhouse'), 'Default works');
  fireEvent.press(ui.getByText('Send message'));
  await waitFor(() =>
    expect(client.send).toHaveBeenCalledWith(id, 'Default works'),
  );
});

test('an expired catalog response clears the connected session even after leaving Chat', async () => {
  const { ui, client } = await fixture();
  let rejectCatalog!: (error: unknown) => void;
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(path =>
    path === '/chat/inference?refresh=true'
      ? new Promise((_resolve, reject) => {
          rejectCatalog = reject;
        })
      : path === '/chat/library'
      ? Promise.resolve({ files: [] })
      : originalRead(path),
  );
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText('Refresh models'));
  fireEvent.press(ui.getByText('Done'));
  fireEvent.press(ui.getByText('Library'));
  await waitFor(() => expect(ui.getByText('Your Library.')).toBeTruthy());
  await act(async () => rejectCatalog(new SessionError('expired')));
  await waitFor(() => expect(client.logout).toHaveBeenCalledTimes(1));
  expect(ui.queryByText('Your Library.')).toBeNull();
  expect(
    ui.queryByText('Models could not be checked. Retry or use Default.'),
  ).toBeNull();
});

test('latest polling reconciles active turns loaded from earlier pages', async () => {
  const { ui, client } = await fixture();
  const originalRead = client.read.getMockImplementation()!;
  const earlierTurn = {
    ...turn,
    request_id: 'earlier-active',
    seq: 1,
    text: 'Earlier active',
    status: 'running',
    output: '',
  };
  client.read.mockImplementation(async path =>
    path === '/chat/history?before=10'
      ? { turns: [earlierTurn], older_before: null }
      : path === '/chat/messages/earlier-active'
      ? {
          turn: {
            ...earlierTurn,
            status: 'completed',
            output: 'Finished earlier answer',
          },
        }
      : originalRead(path),
  );
  fireEvent.press(ui.getByText('Load earlier messages'));
  await waitFor(() => expect(ui.getByText('Earlier active')).toBeTruthy());
  fireEvent.press(ui.getByText('Refresh conversation'));
  await waitFor(() =>
    expect(ui.getByText('Finished earlier answer')).toBeTruthy(),
  );
  expect(ui.queryByText('Working on your reply')).toBeNull();
  expect(ui.getByText('A question')).toBeTruthy();
  expect(ui.queryByText('Load earlier messages')).toBeNull();
  expect(client.read).toHaveBeenCalledWith('/chat/messages/earlier-active');
});

test('catalog expiry fences a concurrently pending conversation refresh', async () => {
  const { ui, client } = await fixture();
  let rejectCatalog!: (error: unknown) => void;
  let resolveConversation!: (value: Record<string, unknown>) => void;
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(path =>
    path === '/chat/inference?refresh=true'
      ? new Promise((_resolve, reject) => {
          rejectCatalog = reject;
        })
      : path === '/chat/reply'
      ? new Promise(resolve => {
          resolveConversation = resolve;
        })
      : originalRead(path),
  );
  fireEvent.press(ui.getByLabelText('Choose model and thinking'));
  fireEvent.press(ui.getByText('Refresh models'));
  fireEvent.press(ui.getByText('Done'));
  fireEvent.press(ui.getByText('Refresh conversation'));
  await waitFor(() => expect(resolveConversation).toBeDefined());
  await act(async () => rejectCatalog(new SessionError('expired')));
  await waitFor(() => expect(client.logout).toHaveBeenCalledTimes(1));
  await act(async () =>
    resolveConversation({ turns: [{ ...turn, text: 'Stale private result' }] }),
  );
  expect(ui.queryByText('Stale private result')).toBeNull();
  expect(ui.queryByText('Your conversation')).toBeNull();
});

test('search and earlier history preserve drafts; refresh keeps loaded earlier rows and exhausted cursor', async () => {
  const { ui, client } = await fixture();
  const old = {
    ...turn,
    seq: 1,
    request_id: 'older',
    text: 'Older question',
    output: 'Older answer',
  };
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(async path =>
    path === '/chat/history?before=10'
      ? { turns: [old], older_before: null }
      : originalRead(path),
  );
  fireEvent.changeText(ui.getByLabelText('Message Radhouse'), 'Unsent thought');
  fireEvent.press(ui.getByText('Load earlier messages'));
  await waitFor(() => expect(ui.getByText('Older answer')).toBeTruthy());
  fireEvent.press(ui.getByText('Refresh conversation'));
  await waitFor(() => expect(ui.queryByText('Connecting…')).toBeNull());
  expect(ui.queryByText('Load earlier messages')).toBeNull();
  expect(ui.getByText('Older answer')).toBeTruthy();
  fireEvent.press(ui.getByText('Search'));
  fireEvent.changeText(ui.getByLabelText('Search loaded messages'), 'Older');
  expect(ui.getByText('Older answer')).toBeTruthy();
  expect(ui.queryByText('A question')).toBeNull();
  fireEvent.press(ui.getByText('Close search'));
  expect(ui.getByText('A question')).toBeTruthy();
  expect(ui.getByLabelText('Message Radhouse').props.value).toBe(
    'Unsent thought',
  );
});

test('quote appends to the draft, share uses original text, and Latest resumes following', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.sharedAction });
  const scroll = jest
    .spyOn(ScrollView.prototype, 'scrollToEnd')
    .mockImplementation(() => undefined);
  const { ui } = await fixture();
  fireEvent.changeText(ui.getByLabelText('Message Radhouse'), 'My thought');
  fireEvent.press(ui.getByText('Quote reply'));
  expect(ui.getByLabelText('Message Radhouse').props.value).toBe(
    'My thought\n\n> A **readable** answer\n\n',
  );
  fireEvent.press(ui.getByText('Share reply'));
  expect(share).toHaveBeenCalledWith({ message: turn.output });
  fireEvent.scroll(ui.getByTestId('conversation-history'), {
    nativeEvent: {
      contentOffset: { y: 0 },
      contentSize: { height: 2000 },
      layoutMeasurement: { height: 400 },
    },
  });
  scroll.mockClear();
  fireEvent(
    ui.getByTestId('conversation-history'),
    'contentSizeChange',
    390,
    2500,
  );
  expect(scroll).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Latest message'));
  expect(scroll).toHaveBeenCalledWith({ animated: false });
});

test('a quote never turns a full draft into an invalid, uneditable retry', async () => {
  const { ui, client } = await fixture();
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(async path =>
    path === '/chat/reply'
      ? { turns: [{ ...turn, output: 'x\n'.repeat(600) }] }
      : originalRead(path),
  );
  fireEvent.press(ui.getByText('Refresh conversation'));
  await waitFor(() => expect(ui.queryByText('Connecting…')).toBeNull());
  fireEvent.changeText(
    ui.getByLabelText('Message Radhouse'),
    'a'.repeat(14000),
  );
  fireEvent.press(ui.getByText('Quote reply'));
  expect(ui.getByLabelText('Message Radhouse').props.value).toBe(
    'a'.repeat(14000),
  );
  expect(
    ui.getByText('Your draft is full. Shorten it before adding this quote.'),
  ).toBeTruthy();
  expect(client.send).not.toHaveBeenCalled();
});

test('keyboard hides bottom navigation and restores it on dismissal', async () => {
  const callbacks: Record<string, () => void> = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
    callbacks[name] = callback as () => void;
    return { remove: jest.fn() } as unknown as ReturnType<
      typeof Keyboard.addListener
    >;
  });
  const { ui } = await fixture();
  expect(ui.getByText('Settings')).toBeTruthy();
  act(() => callbacks.keyboardDidShow());
  expect(ui.queryByText('Settings')).toBeNull();
  act(() => callbacks.keyboardDidHide());
  expect(ui.getByText('Settings')).toBeTruthy();
});

test('native replies render safe links and fenced code without interpreting HTML', async () => {
  const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const text =
    '# Heading\n\n**Bold** and `inline` [Source](https://example.com)\n\n```js\nconst x = 1;\n```\n\n<script>literal</script> [unsafe](javascript:alert(1))';
  const ui = await renderAsync(<Reply text={text} />);
  expect(ui.getByText('Heading')).toBeTruthy();
  expect(ui.getByText('const x = 1;')).toBeTruthy();
  expect(ui.getByText(/<script>literal/)).toBeTruthy();
  expect(ui.getAllByRole('link')).toHaveLength(1);
  fireEvent.press(ui.getByText('Source'));
  expect(link).toHaveBeenCalledWith('https://example.com');
  expect(replyBlocks('```\nunclosed code')).toEqual([
    { id: 'code:4', code: true, text: 'unclosed code' },
  ]);
});

test('catalog and transcript decoders reject malformed responses and preserve per-turn model identity', () => {
  expect(() => readCatalog({ models: [] })).toThrow('invalid');
  expect(() =>
    readCatalog({
      ...catalog,
      models: [{ ...model, thinking: { ...model.thinking, choices: [2] } }],
    }),
  ).toThrow('invalid');
  expect(() => readTurns([{ ...turn, inference: { model: 3 } }])).toThrow(
    'invalid',
  );
  const selection = {
    provider: model.provider,
    model: model.id,
    thinking: 'max',
  };
  expect(selectionAvailable(readCatalog(catalog), selection)).toBe(true);
  expect(
    selectionAvailable(readCatalog(catalog), { ...selection, thinking: 'off' }),
  ).toBe(false);
  expect(selectionAvailable(null, selection)).toBe(false);
  expect(selectionAvailable(null, null)).toBe(true);
  expect(
    thinkingChoices({
      ...model,
      thinking: { ...model.thinking, state: 'unknown' },
    }),
  ).toEqual(['default']);
  expect(
    thinkingChoices({
      ...model,
      thinking: { ...model.thinking, can_enable: true },
    }),
  ).toContain('on');
  const rows = readTurns([
    { ...turn, inference: selection, created_at: '2026-11-02T12:00:00Z' },
  ]);
  expect(rows[0].inference).toEqual(selection);
  expect(mergeTurns(rows, [{ ...rows[0], output: 'Updated' }])).toHaveLength(1);
  expect(turnStatus('waiting')).toContain('Queued');
  expect(turnStatus('new-state')).toBe('Working on your reply');
});

test('returning from a notification resets pagination to the current history window', async () => {
  let listener!: Parameters<NotificationConnection['connect']>[1];
  const notifications = {
    connect: jest.fn(async (_: string, value: typeof listener) => {
      listener = value;
    }),
    disconnect: jest.fn(),
  };
  const { ui, client } = await fixture(
    notifications as unknown as NotificationConnection,
  );
  const originalRead = client.read.getMockImplementation()!;
  client.read.mockImplementation(async path => {
    if (path.startsWith('/chat/messages/')) return { turn };
    if (path === '/chat/reply') return { turns: [turn], older_before: 20 };
    return originalRead(path);
  });
  await act(async () => listener.open(id));
  await waitFor(() => expect(ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(ui.getByText('Back to current conversation'));
  await waitFor(() =>
    expect(ui.getByText('Load earlier messages')).toBeTruthy(),
  );
  await waitFor(() => expect(ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(ui.getByText('Load earlier messages'));
  await waitFor(() =>
    expect(client.read).toHaveBeenCalledWith('/chat/history?before=20'),
  );
});
