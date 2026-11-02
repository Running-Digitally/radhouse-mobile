import React from 'react';
import { AppState, ScrollView } from 'react-native';
import {
  act,
  fireEvent,
  renderAsync,
  waitFor,
  within,
} from '@testing-library/react-native';
import { Connected, readTurns } from '../src/screens/Connected';
import { SessionClient } from '../src/auth/client';
import { SessionError } from '../src/auth/types';
import { NotificationConnection } from '../src/notifications/connection';
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));
const info = {
  username: 'synthetic-owner',
  features: { browser_streaming: true, terminal: true },
};
const turn = {
  request_id: '58e8f3dd-cd82-48a4-9df9-63c3a15b310f',
  text: 'Synthetic question',
  output: 'Synthetic reply',
  status: 'completed',
};
async function fixture(
  restore: typeof info | null = null,
  notifications?: NotificationConnection,
) {
  const client = {
    restore: jest.fn(async () => restore),
    accessLogin: jest.fn(async () => undefined),
    localLogin: jest.fn(async () => info),
    logout: jest.fn(async () => undefined),
    newRequestId: jest.fn(async () => turn.request_id),
    send: jest.fn(async () => ({})),
    read: jest.fn(async (path: string) =>
      path === '/auth/session'
        ? info
        : path === '/chat/library'
        ? {
            files: [
              { id: 'file:synthetic', name: 'Sample note', kind: 'text' },
            ],
          }
        : path.startsWith('/chat/messages/')
        ? { turn }
        : { turns: [turn] },
    ),
  };
  const leave = jest.fn();
  const ui = await renderAsync(
    <Connected
      client={client as unknown as SessionClient}
      leave={leave}
      notifications={notifications}
    />,
  );
  return { client, leave, ui };
}
beforeEach(() => {
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
test('notification controls preserve consent, verify a tapped target, and revoke the session on logout', async () => {
  let callbacks!: Parameters<NotificationConnection['connect']>[1];
  const notifications = {
    connect: jest.fn(async (_username: string, listener: typeof callbacks) => {
      callbacks = listener;
      listener.state('off');
    }),
    enable: jest.fn(async () => callbacks.state('on')),
    disable: jest.fn(async () => callbacks.state('off')),
    disconnect: jest.fn(),
  };
  const f = await fixture(info, notifications as unknown as NotificationConnection);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  fireEvent.press(f.ui.getByText('Settings'));
  fireEvent.press(f.ui.getByText('Enable reply notifications'));
  await waitFor(() =>
    expect(f.ui.getByText('Turn off reply notifications')).toBeTruthy(),
  );
  act(() => callbacks.foreground());
  act(() => callbacks.open(turn.request_id));
  await waitFor(() =>
    expect(f.client.read).toHaveBeenCalledWith(
      '/chat/messages/' + turn.request_id,
    ),
  );
  expect(f.ui.getByText('A Radhouse reply is ready.')).toBeTruthy();
  fireEvent.press(f.ui.getByText('Back to current conversation'));
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(f.ui.getByText('Settings'));
  notifications.disable.mockRejectedValueOnce(new Error('provider offline'));
  fireEvent.press(f.ui.getByText('Turn off reply notifications'));
  await waitFor(() =>
    expect(
      f.ui.getByText(/Notification setup could not be confirmed/),
    ).toBeTruthy(),
  );
  fireEvent.press(f.ui.getByText('Turn off reply notifications'));
  await waitFor(() =>
    expect(f.ui.getByText('Enable reply notifications')).toBeTruthy(),
  );
  expect(notifications.enable).toHaveBeenCalledTimes(1);
  notifications.disable.mockRejectedValueOnce(new Error('provider offline'));
  fireEvent.press(f.ui.getByText('Sign out'));
  await waitFor(() => expect(f.leave).toHaveBeenCalled());
  expect(f.client.logout).toHaveBeenCalledTimes(1);
});
test('complete two-layer sign-in, native reads, viewer selection and logout', async () => {
  const f = await fixture();
  await waitFor(() =>
    expect(f.ui.getByText('Sign in with Access')).toBeTruthy(),
  );
  fireEvent.press(f.ui.getByText('Sign in with Access'));
  await waitFor(() =>
    expect(f.ui.getByLabelText('Radhouse username')).toBeTruthy(),
  );
  fireEvent.changeText(f.ui.getByLabelText('Radhouse username'), 'owner');
  fireEvent.changeText(
    f.ui.getByLabelText('Radhouse password'),
    'synthetic-password',
  );
  fireEvent.changeText(f.ui.getByLabelText('Authentication code'), '123456');
  fireEvent.press(f.ui.getByText('Open my workspace'));
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  expect(f.client.localLogin).toHaveBeenCalledWith(
    'owner',
    'synthetic-password',
    '123456',
  );
  fireEvent.press(f.ui.getByText('Library'));
  await waitFor(() => expect(f.ui.getByText('Sample note')).toBeTruthy());
  fireEvent.press(f.ui.getByText('Refresh files'));
  await waitFor(() =>
    expect(f.client.read).toHaveBeenCalledWith('/chat/library'),
  );
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(f.ui.getByText('Browser'));
  await waitFor(() =>
    expect(
      f.ui.UNSAFE_getByType('WebView' as never).props.source.uri,
    ).toContain('/browser'),
  );
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(f.ui.getByText('Terminal'));
  await waitFor(() =>
    expect(
      f.ui.UNSAFE_getByType('WebView' as never).props.source.uri,
    ).toContain('/terminal'),
  );
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(f.ui.getByText('Settings'));
  fireEvent.press(f.ui.getByText('Sign out'));
  await waitFor(() => expect(f.leave).toHaveBeenCalled());
});
test.each(['unavailable', 'conflict'] as const)(
  'Send failure (%s) retains frozen text and the same request ID on explicit retry',
  async kind => {
    const f = await fixture(info);
    await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
    f.client.send.mockRejectedValueOnce(new SessionError(kind));
    fireEvent.changeText(
      f.ui.getByLabelText('Message Radhouse'),
      'A single request',
    );
    fireEvent.press(f.ui.getByText('Send message'));
    await waitFor(() =>
      expect(f.ui.getByText('Retry same message')).toBeTruthy(),
    );
    expect(f.ui.getByLabelText('Message Radhouse').props.editable).toBe(false);
    if (kind === 'conflict') {
      expect(
        f.ui.getByText(
          'Radhouse reported a workspace conflict. Your message is kept for retry.',
        ),
      ).toBeTruthy();
      expect(
        f.ui.queryByText(
          'Connection could not be confirmed. Retry when you are connected.',
        ),
      ).toBeNull();
    }
    fireEvent.press(f.ui.getByText('Retry same message'));
    await waitFor(() => expect(f.ui.getByText('Send message')).toBeTruthy());
    expect(f.client.newRequestId).toHaveBeenCalledTimes(1);
    expect(f.client.send.mock.calls[0]).toEqual(f.client.send.mock.calls[1]);
  },
);
test('cancelled browser login cannot reopen the workspace', async () => {
  const f = await fixture();
  await waitFor(() =>
    expect(f.ui.getByText('Sign in with Access')).toBeTruthy(),
  );
  let finish!: () => void;
  f.client.accessLogin.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = () => resolve(undefined);
      }),
  );
  fireEvent.press(f.ui.getByText('Sign in with Access'));
  fireEvent.press(f.ui.getByText('Cancel sign-in'));
  await waitFor(() => expect(f.leave).toHaveBeenCalled());
  await act(async () => finish());
  expect(f.ui.queryByText('Welcome back.')).toBeNull();
});
test('expiry discards private content and asks for authentication again', async () => {
  const f = await fixture(info);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  f.client.read.mockRejectedValueOnce(new SessionError('expired'));
  fireEvent.press(f.ui.getByText('Refresh conversation'));
  await waitFor(() =>
    expect(f.ui.getByText('Sign in with Access')).toBeTruthy(),
  );
  expect(f.ui.queryByText('Synthetic reply')).toBeNull();
  expect(f.client.logout).toHaveBeenCalled();
});
test('background hides data and viewers, foreground revalidates before showing them', async () => {
  let changed!: (state: 'active' | 'background') => void;
  const spy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      changed = listener;
      return { remove: jest.fn() };
    });
  const f = await fixture(info);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  act(() => changed('background'));
  expect(f.ui.queryByText('Synthetic reply')).toBeNull();
  act(() => changed('active'));
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  expect(f.client.read).toHaveBeenCalledWith('/auth/session');
  await f.ui.unmountAsync();
  spy.mockRestore();
});
test('login rejection clears the entered password and provides an actionable error', async () => {
  const f = await fixture();
  await waitFor(() =>
    expect(f.ui.getByText('Sign in with Access')).toBeTruthy(),
  );
  fireEvent.press(f.ui.getByText('Sign in with Access'));
  await waitFor(() =>
    expect(f.ui.getByLabelText('Radhouse username')).toBeTruthy(),
  );
  f.client.localLogin.mockRejectedValueOnce(new SessionError('credentials'));
  fireEvent.changeText(f.ui.getByLabelText('Radhouse username'), 'owner');
  fireEvent.changeText(f.ui.getByLabelText('Radhouse password'), 'wrong');
  fireEvent.changeText(f.ui.getByLabelText('Authentication code'), '123456');
  fireEvent.press(f.ui.getByText('Open my workspace'));
  await waitFor(() =>
    expect(f.ui.getByText(/Check your username/)).toBeTruthy(),
  );
  expect(f.ui.getByLabelText('Radhouse password').props.value).toBe('');
});
test('server capabilities prevent unavailable viewers and failed logout remains honest', async () => {
  const f = await fixture({
    ...info,
    features: { browser_streaming: false, terminal: false },
  });
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  fireEvent.press(f.ui.getByText('Browser'));
  expect(
    f.ui.getByText('This feature is unavailable on your server.'),
  ).toBeTruthy();
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  fireEvent.press(f.ui.getByText('Settings'));
  f.client.logout.mockRejectedValueOnce(new Error('offline'));
  fireEvent.press(f.ui.getByText('Sign out'));
  await waitFor(() =>
    expect(
      f.ui.getByText(/Server revocation could not be confirmed/),
    ).toBeTruthy(),
  );
  expect(f.leave).not.toHaveBeenCalled();
});
test('malformed history never renders unchecked content', () => {
  expect(() => readTurns({})).toThrow('invalid');
  expect(() => readTurns([{}])).toThrow('invalid');
  expect(readTurns([{ ...turn, output: null }])[0].output).toBeNull();
});

test('background polling keeps the composer editable and does not block Send or overwrite a newer reply', async () => {
  jest.useFakeTimers();
  const f = await fixture(info);
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  let finishPoll!: () => void;
  f.client.read.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishPoll = () => resolve({ turns: [turn] });
      }),
  );
  const input = f.ui.getByLabelText('Message Radhouse');
  fireEvent.changeText(input, 'Typing through the refresh');
  try {
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(f.ui.queryByText('Connecting…')).toBeNull();
    expect(f.ui.getByLabelText('Message Radhouse')).toBe(input);
    expect(input.props.editable).toBe(true);
    expect(input.props.value).toBe('Typing through the refresh');
    f.client.read.mockResolvedValueOnce({
      turns: [{ ...turn, output: 'New reply after send' }],
    });
    await act(async () => {
      fireEvent.press(f.ui.getByText('Send message'));
    });
    expect(f.client.send).toHaveBeenCalledWith(
      turn.request_id,
      'Typing through the refresh',
    );
    expect(f.ui.getByText('New reply after send')).toBeTruthy();
    await act(async () => finishPoll());
    expect(f.ui.getByText('New reply after send')).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

test('history opens at the bottom, preserves reading position, and keeps the composer outside scrolling content', async () => {
  const scroll = jest
    .spyOn(ScrollView.prototype, 'scrollToEnd')
    .mockImplementation(() => undefined);
  try {
    const f = await fixture(info);
    await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
    const history = f.ui.getByTestId('conversation-history');
    expect(within(history).queryByLabelText('Message Radhouse')).toBeNull();
    expect(
      within(f.ui.getByTestId('conversation-composer')).getByLabelText(
        'Message Radhouse',
      ),
    ).toBeTruthy();
    fireEvent(history, 'contentSizeChange', 360, 4000);
    expect(scroll).toHaveBeenCalledWith({ animated: false });
    scroll.mockClear();
    fireEvent.scroll(history, {
      nativeEvent: {
        contentOffset: { y: 500 },
        contentSize: { height: 4000 },
        layoutMeasurement: { height: 600 },
      },
    });
    fireEvent(history, 'contentSizeChange', 360, 4200);
    fireEvent(history, 'layout', { nativeEvent: { layout: { height: 300 } } });
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.scroll(history, {
      nativeEvent: {
        contentOffset: { y: 3900 },
        contentSize: { height: 4200 },
        layoutMeasurement: { height: 300 },
      },
    });
    fireEvent(history, 'contentSizeChange', 360, 4300);
    expect(scroll).toHaveBeenCalledWith({ animated: false });
  } finally {
    scroll.mockRestore();
  }
});

test('logout invalidates the session immediately while notification cleanup is pending', async () => {
  let finish!: () => void;
  const notifications = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(),
    disable: jest.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    ),
  };
  const f = await fixture(info, notifications as unknown as NotificationConnection);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  fireEvent.press(f.ui.getByText('Settings'));
  fireEvent.press(f.ui.getByText('Sign out'));
  expect(f.client.logout).toHaveBeenCalledTimes(1);
  fireEvent.press(f.ui.getByText('Sign in with Access'));
  expect(f.client.accessLogin).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(f.leave).toHaveBeenCalledTimes(1);
});

test('sending from a notification returns to the current conversation', async () => {
  let callbacks!: Parameters<NotificationConnection['connect']>[1];
  const notifications = {
    connect: jest.fn(async (_username: string, listener: typeof callbacks) => {
      callbacks = listener;
    }),
    disconnect: jest.fn(),
  };
  const f = await fixture(info, notifications as unknown as NotificationConnection);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  act(() => callbacks.open(turn.request_id));
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  expect(f.ui.getByText('Back to current conversation')).toBeTruthy();
  fireEvent.changeText(
    f.ui.getByLabelText('Message Radhouse'),
    'Next question',
  );
  fireEvent.press(f.ui.getByText('Send message'));
  await waitFor(() =>
    expect(f.ui.queryByText('Back to current conversation')).toBeNull(),
  );
  await waitFor(() => expect(f.ui.queryByText('Connecting…')).toBeNull());
  expect(f.client.read).toHaveBeenLastCalledWith('/chat/reply');
});
