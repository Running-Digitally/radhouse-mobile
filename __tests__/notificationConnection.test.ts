import { NotificationConnection } from '../src/notifications/connection';
import { SessionClient } from '../src/auth/client';
import { NativePush, PushSetupError } from '../src/notifications/nativePush';
import { ReplyNotification } from '../src/notifications/payload';
import { SessionError } from '../src/auth/types';
const id = '58e8f3dd-cd82-48a4-9df9-63c3a15b310f';
const payload: ReplyNotification = {
  version: '1',
  kind: 'reply_ready',
  event_id: id,
  request_id: id,
};
const pref = (enabled = true, username = 'owner') =>
  JSON.stringify({ installation: id, username, enabled });
function fixture(raw: string | null = null) {
  const client = {
    pushAvailable: jest.fn(async () => true),
    newRequestId: jest.fn(async () => id),
    pushRegistration: jest.fn(() => ({
      register: jest.fn(),
      unregister: jest.fn(),
    })),
    read: jest.fn(async () => ({ turn: { request_id: id } })),
  };
  let open!: (data: ReplyNotification) => void;
  let foreground!: (data: ReplyNotification) => void;
  const stop = jest.fn();
  const native = {
    configured: jest.fn(() => true),
    enable: jest.fn(async () => 'allowed'),
    disable: jest.fn(async () => undefined),
    listen: jest.fn((a, b) => {
      open = a;
      foreground = b;
      return stop;
    }),
  };
  const storage = {
    load: jest.fn(async () => raw),
    save: jest.fn(async (_value: string) => undefined),
  };
  const listener = { state: jest.fn(), open: jest.fn(), foreground: jest.fn() };
  const connection = new NotificationConnection(
    client as unknown as SessionClient,
    native as unknown as NativePush,
    storage,
  );
  return {
    connection,
    client,
    native,
    storage,
    listener,
    stop,
    open: () => open(payload),
    foreground: () => foreground(payload),
  };
}

test('fresh preferences require opt-in; enable and opt-out persist device-only consent', async () => {
  const f = fixture();
  await f.connection.connect('owner', f.listener);
  expect(f.native.enable).not.toHaveBeenCalled();
  expect(f.listener.state).toHaveBeenLastCalledWith('off');
  await f.connection.enable();
  expect(f.storage.save).toHaveBeenLastCalledWith(pref());
  expect(f.listener.state).toHaveBeenLastCalledWith('on');
  await f.connection.disable();
  expect(f.storage.save).toHaveBeenLastCalledWith(pref(false));
  expect(f.native.disable).toHaveBeenCalledTimes(1);
});
test('saved consent resumes registration; notification target requires authenticated ownership', async () => {
  const f = fixture(pref());
  await f.connection.connect('owner', f.listener);
  expect(f.native.enable).toHaveBeenCalledTimes(1);
  expect(f.client.newRequestId).not.toHaveBeenCalled();
  f.foreground();
  expect(f.listener.foreground).toHaveBeenCalled();
  f.open();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.client.read).toHaveBeenCalledWith('/chat/messages/' + id);
  expect(f.listener.open).toHaveBeenCalledWith(id);
  f.connection.disconnect();
  expect(f.stop).toHaveBeenCalled();
});
test.each([
  'malformed',
  pref(true, 'another-owner'),
  JSON.stringify({ installation: 'bad', username: 'owner', enabled: true }),
])(
  'malformed or prior-account preferences do not enable delivery: %s',
  async raw => {
    const f = fixture(raw);
    await f.connection.connect('owner', f.listener);
    expect(f.native.enable).not.toHaveBeenCalled();
    await f.connection.enable();
    expect(f.client.newRequestId).toHaveBeenCalledTimes(1);
  },
);
test('missing server or native configuration never requests notification permission', async () => {
  const f = fixture();
  f.client.pushAvailable.mockResolvedValue(false);
  await f.connection.connect('owner', f.listener);
  await f.connection.enable();
  expect(f.listener.state).toHaveBeenLastCalledWith('unavailable');
  expect(f.native.enable).not.toHaveBeenCalled();
  f.client.pushAvailable.mockResolvedValue(true);
  f.native.configured.mockReturnValue(false);
  await f.connection.connect('owner', f.listener);
  expect(f.native.enable).not.toHaveBeenCalled();
});
test('denial does not persist enabled consent and registration failure remains visible', async () => {
  const f = fixture();
  await f.connection.connect('owner', f.listener);
  f.native.enable.mockResolvedValueOnce('denied');
  await f.connection.enable();
  expect(f.storage.save).toHaveBeenLastCalledWith(pref(false));
  f.native.enable.mockRejectedValueOnce(new Error('registration failed'));
  await expect(f.connection.enable()).rejects.toThrow('registration failed');
  expect(f.listener.state).toHaveBeenLastCalledWith('error');
});
test('cancelling a pending enable cannot persist a late consent grant', async () => {
  const f = fixture();
  await f.connection.connect('owner', f.listener);
  let release!: () => void;
  f.native.enable.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        release = () => resolve('allowed');
      }),
  );
  const pending = f.connection.enable();
  await Promise.resolve();
  await Promise.resolve();
  await f.connection.disable();
  release();
  await expect(pending).rejects.toThrow('cancelled');
  expect(f.storage.save).not.toHaveBeenCalled();
});
test('preference-write failure still attempts provider shutdown', async () => {
  const f = fixture(pref());
  await f.connection.connect('owner', f.listener);
  f.storage.save.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(f.connection.disable()).rejects.toThrow('storage unavailable');
  expect(f.native.disable).toHaveBeenCalled();
});
test('offline target or target from a prior session never opens private content', async () => {
  const f = fixture();
  await f.connection.connect('owner', f.listener);
  f.client.read.mockRejectedValueOnce(new SessionError('expired'));
  f.open();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.listener.open).not.toHaveBeenCalled();
  f.client.pushAvailable.mockRejectedValueOnce(new Error('offline'));
  await expect(f.connection.connect('owner', f.listener)).rejects.toThrow(
    'offline',
  );
  expect(f.listener.state).toHaveBeenLastCalledWith('error');
});

test.each(['apple', 'firebase', 'server', 'cleanup'] as const)('setup exposes a safe %s failure and clears it on retry', async stage => {
  const f = fixture();
  await f.connection.connect('owner', f.listener);
  f.native.enable.mockRejectedValueOnce(new PushSetupError(stage));
  await expect(f.connection.enable()).rejects.toEqual(new PushSetupError(stage));
  expect(f.listener.state).toHaveBeenLastCalledWith('error');
  const descriptions = {
    cleanup: 'Previous notification registration could not be cleared. Please retry.',
    apple: 'Apple notification registration did not complete. Please retry.',
    firebase: 'Notification delivery registration did not complete. Please retry.',
    server: 'Radhouse could not save notification registration. Please retry.',
  };
  expect(f.connection.failureDescription()).toBe(descriptions[stage]);
  await f.connection.enable();
  expect(f.listener.state).toHaveBeenLastCalledWith('on');
  expect(f.connection.failureDescription()).toBe('Notification setup could not be confirmed. Retry when connected.');
});
