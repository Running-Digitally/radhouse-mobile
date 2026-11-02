import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Connected, readTurns } from '../src/screens/Connected';
import { SessionClient } from '../src/auth/client';
import { SessionError } from '../src/auth/types';
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
function fixture(restore: typeof info | null = null) {
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
        : { turns: [turn] },
    ),
  };
  const leave = jest.fn();
  const ui = render(
    <Connected client={client as unknown as SessionClient} leave={leave} />,
  );
  return { client, leave, ui };
}
beforeEach(() => {
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
test('complete two-layer sign-in, native reads, viewer selection and logout', async () => {
  const f = fixture();
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
test('uncertain Send retains frozen text and the same request ID on explicit retry', async () => {
  const f = fixture(info);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  f.client.send.mockRejectedValueOnce(new SessionError('unavailable'));
  fireEvent.changeText(
    f.ui.getByLabelText('Message Radhouse'),
    'A single request',
  );
  fireEvent.press(f.ui.getByText('Send message'));
  await waitFor(() =>
    expect(f.ui.getByText('Retry same message')).toBeTruthy(),
  );
  expect(f.ui.getByLabelText('Message Radhouse').props.editable).toBe(false);
  fireEvent.press(f.ui.getByText('Retry same message'));
  await waitFor(() => expect(f.ui.getByText('Send message')).toBeTruthy());
  expect(f.client.newRequestId).toHaveBeenCalledTimes(1);
  expect(f.client.send.mock.calls[0]).toEqual(f.client.send.mock.calls[1]);
});
test('cancelled browser login cannot reopen the workspace', async () => {
  const f = fixture();
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
  const f = fixture(info);
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
  const f = fixture(info);
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  act(() => changed('background'));
  expect(f.ui.queryByText('Synthetic reply')).toBeNull();
  act(() => changed('active'));
  await waitFor(() => expect(f.ui.getByText('Synthetic reply')).toBeTruthy());
  expect(f.client.read).toHaveBeenCalledWith('/auth/session');
  f.ui.unmount();
  spy.mockRestore();
});
test('login rejection clears the entered password and provides an actionable error', async () => {
  const f = fixture();
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
  const f = fixture({
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
