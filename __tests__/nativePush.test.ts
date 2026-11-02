import { getApps } from '@react-native-firebase/app';
import * as messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { requestPushPermission } from '../src/notifications/permission';
jest.mock('../src/notifications/permission', () => ({
  requestPushPermission: jest.fn(async () => true),
}));
import { NativePush } from '../src/notifications/nativePush';
jest.mock('@react-native-firebase/app', () => ({ getApps: jest.fn() }));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: jest.fn(() => ({})),
  getInitialNotification: jest.fn(async () => null),
  unregister: jest.fn(async () => undefined),
  getAPNSToken: jest.fn(),
  unregisterDeviceForRemoteMessages: jest.fn(async () => undefined),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
  register: jest.fn(),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  onRegistered: jest.fn(() => jest.fn()),
}));
const payload = {
  version: '1',
  kind: 'reply_ready',
  event_id: '5ef747a8-61b7-42a4-91db-d7bb117941a2',
  request_id: '58e8f3dd-cd82-48a4-9df9-63c3a15b310f',
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getApps).mockReturnValue([{}] as ReturnType<typeof getApps>);
  jest.mocked(requestPushPermission).mockResolvedValue(true);
  jest.mocked(messaging.getAPNSToken).mockResolvedValue('synthetic-apns-token');
  jest
    .mocked(messaging.registerDeviceForRemoteMessages)
    .mockResolvedValue(undefined);
  jest.mocked(messaging.register).mockImplementation(async () => {
    const callback = jest.mocked(messaging.onRegistered).mock.calls.at(-1)![1];
    if (typeof callback === 'function') {
      callback('cSyntheticInstallationID');
    }
  });
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
});
function registration() {
  return {
    register: jest.fn(async () => undefined),
    unregister: jest.fn(async () => undefined),
  };
}
test('unconfigured providers do not prompt or register', async () => {
  jest.mocked(getApps).mockReturnValue([]);
  const push = new NativePush();
  expect(await push.enable(registration(), jest.fn())).toBe('unconfigured');
  expect(requestPushPermission).not.toHaveBeenCalled();
  push.listen(jest.fn(), jest.fn())();
});
test('permission denial never fetches a device token', async () => {
  jest.mocked(requestPushPermission).mockResolvedValue(false);
  expect(await new NativePush().enable(registration(), jest.fn())).toBe(
    'denied',
  );
  expect(messaging.register).not.toHaveBeenCalled();
  expect(messaging.registerDeviceForRemoteMessages).not.toHaveBeenCalled();
});
test('registration rotates and remote unregistration is ordered after in-flight writes', async () => {
  const push = new NativePush();
  const backend = registration();
  const failure = jest.fn();
  expect(await push.enable(backend, failure)).toBe('allowed');
  expect(backend.register).toHaveBeenCalledWith(
    'cSyntheticInstallationID',
    'ios',
  );
  const rotate = jest.mocked(messaging.onRegistered).mock.calls[0][1];
  if (typeof rotate === 'function') {
    rotate('cRotatedInstallationID');
  }
  await push.disable();
  expect(backend.register).toHaveBeenCalledTimes(1); // A queued update is invalidated by sign-out.
  expect(backend.unregister).toHaveBeenCalledTimes(1);
});
test('failed remote revocation can be retried instead of falsely reporting completion', async () => {
  const push = new NativePush();
  const backend = registration();
  await push.enable(backend, jest.fn());
  backend.unregister.mockRejectedValueOnce(new Error('offline'));
  await expect(push.disable()).rejects.toThrow('offline');
  expect(messaging.unregister).toHaveBeenCalledTimes(1);
  await push.disable();
  expect(backend.unregister).toHaveBeenCalledTimes(2);
});
test('logout while APNs registration is pending prevents Firebase registration', async () => {
  let finish!: () => void;
  jest.mocked(messaging.registerDeviceForRemoteMessages).mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  const push = new NativePush();
  const backend = registration();
  const enabling = push.enable(backend, jest.fn());
  for (let i = 0; i < 16; i++) {
    await Promise.resolve();
  }
  await push.disable();
  finish();
  expect(await enabling).toBe('denied');
  expect(backend.register).not.toHaveBeenCalled();
});
test('Android registers the FID with its platform without requesting APNs', async () => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  const push = new NativePush();
  const backend = registration();
  expect(await push.enable(backend, jest.fn())).toBe('allowed');
  expect(backend.register).toHaveBeenCalledWith(
    'cSyntheticInstallationID',
    'android',
  );
  expect(messaging.registerDeviceForRemoteMessages).not.toHaveBeenCalled();
  await push.disable();
});
test('listeners validate foreground, tap and cold-start payloads and unsubscribe', async () => {
  jest
    .mocked(messaging.getInitialNotification)
    .mockResolvedValueOnce({ data: payload });
  const push = new NativePush();
  const open = jest.fn();
  const foreground = jest.fn();
  const stop = push.listen(open, foreground);
  await Promise.resolve();
  expect(open).toHaveBeenCalledWith(payload);
  jest.mocked(messaging.onMessage).mock.calls[0][1]({ data: payload });
  jest
    .mocked(messaging.onMessage)
    .mock.calls[0][1]({ data: { kind: 'execute' } });
  expect(foreground).toHaveBeenCalledTimes(1);
  stop();
  jest
    .mocked(messaging.onNotificationOpenedApp)
    .mock.calls[0][1]({ data: payload });
  expect(open).toHaveBeenCalledTimes(1);
});

test('an immediate opt-out cancels enable before its initial cleanup completes', async () => {
  const push = new NativePush();
  const backend = registration();
  const enabling = push.enable(backend, jest.fn());
  await push.disable();
  expect(await enabling).toBe('denied');
  expect(requestPushPermission).not.toHaveBeenCalled();
  expect(backend.register).not.toHaveBeenCalled();
});

test('a previous cleanup cannot delete the token of a newer registration', async () => {
  const push = new NativePush();
  const previous = registration();
  await push.enable(previous, jest.fn());
  let finish!: () => void;
  previous.unregister.mockImplementationOnce(
    () =>
      new Promise<undefined>(resolve => {
        finish = () => resolve(undefined);
      }),
  );
  const disabling = push.disable();
  const next = registration();
  const enabling = push.enable(next, jest.fn());
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
  expect(next.register).not.toHaveBeenCalled();
  finish();
  await disabling;
  expect(await enabling).toBe('allowed');
  expect(next.register).toHaveBeenCalledTimes(1);
  expect(messaging.unregister).toHaveBeenCalledTimes(1);
  expect(
    jest.mocked(messaging.unregister).mock.invocationCallOrder[0],
  ).toBeLessThan(next.register.mock.invocationCallOrder[0]);
});

test('registration waits for the backend acknowledgement and cancels a pending FID on opt-out', async () => {
  jest.mocked(messaging.register).mockResolvedValue(undefined);
  const push = new NativePush();
  const backend = registration();
  const enabling = push.enable(backend, jest.fn());
  for (let i = 0; i < 16; i++) {
    await Promise.resolve();
  }
  await push.disable();
  const callback = jest.mocked(messaging.onRegistered).mock.calls[0][1];
  if (typeof callback === 'function') {
    callback('cLateInstallationID');
  }
  expect(await enabling).toBe('denied');
  expect(backend.register).not.toHaveBeenCalled();
});
test('SDK failure and FID timeout revoke registration rather than report enabled', async () => {
  jest.mocked(messaging.register).mockRejectedValueOnce(new Error('offline'));
  const push = new NativePush();
  const backend = registration();
  await expect(push.enable(backend, jest.fn())).rejects.toThrow(
    'Push registration failed',
  );
  expect(backend.unregister).toHaveBeenCalledTimes(1);
  jest.useFakeTimers();
  try {
    jest.mocked(messaging.register).mockResolvedValue(undefined);
    const enabling = push.enable(backend, jest.fn());
    const outcome = enabling.catch(error => error);
    for (let i = 0; i < 16; i++) {
      await Promise.resolve();
    }
    await jest.advanceTimersByTimeAsync(30000);
    expect(await outcome).toEqual(new Error('Push registration timed out'));
    const callback = jest.mocked(messaging.onRegistered).mock.calls.at(-1)![1];
    if (typeof callback === 'function') {
      callback('cLateInstallationID');
    }
    await Promise.resolve();
    expect(backend.register).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
test('failed backend FID admission is surfaced and cleaned up', async () => {
  const push = new NativePush();
  const backend = registration();
  const failure = jest.fn();
  backend.register.mockRejectedValueOnce(new Error('offline'));
  await expect(push.enable(backend, failure)).rejects.toThrow(
    'Push registration failed',
  );
  expect(failure).toHaveBeenCalledTimes(1);
  expect(backend.unregister).toHaveBeenCalled();
});

test('enabled is reported only after the server acknowledges the initial FID', async () => {
  const push = new NativePush();
  const backend = registration();
  let acknowledge!: () => void;
  backend.register.mockImplementationOnce(
    () =>
      new Promise<undefined>(resolve => {
        acknowledge = () => resolve(undefined);
      }),
  );
  let enabled = false;
  const enabling = push.enable(backend, jest.fn()).then(result => {
    enabled = result === 'allowed';
    return result;
  });
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
  expect(backend.register).toHaveBeenCalledTimes(1);
  expect(enabled).toBe(false);
  acknowledge();
  expect(await enabling).toBe('allowed');
  const callback = jest.mocked(messaging.onRegistered).mock.calls[0][1];
  if (typeof callback === 'function') {
    callback('cRotatedInstallationID');
  }
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  expect(backend.register).toHaveBeenLastCalledWith(
    'cRotatedInstallationID',
    'ios',
  );
  await push.disable();
});


test('refreshes stale iOS registration before requesting a Firebase installation', async () => {
  jest.mocked(messaging.getAPNSToken).mockResolvedValueOnce(null);
  const backend = registration();
  const push = new NativePush();
  expect(await push.enable(backend, jest.fn())).toBe('allowed');
  expect(messaging.registerDeviceForRemoteMessages).toHaveBeenCalledTimes(2);
  expect(messaging.unregisterDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
  expect(jest.mocked(messaging.unregisterDeviceForRemoteMessages).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(messaging.registerDeviceForRemoteMessages).mock.invocationCallOrder[1]);
  expect(jest.mocked(messaging.registerDeviceForRemoteMessages).mock.invocationCallOrder[1])
    .toBeLessThan(jest.mocked(messaging.register).mock.invocationCallOrder[0]);
  expect(backend.register).toHaveBeenCalledWith('cSyntheticInstallationID', 'ios');
  await push.disable();
});

test('does not reset healthy APNs registration', async () => {
  const push = new NativePush();
  await push.enable(registration(), jest.fn());
  expect(messaging.registerDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
  expect(messaging.unregisterDeviceForRemoteMessages).not.toHaveBeenCalled();
  await push.disable();
});

test('missing APNs token after refresh fails before Firebase and can be retried', async () => {
  jest.mocked(messaging.getAPNSToken).mockResolvedValue(null);
  const push = new NativePush();
  const backend = registration();
  await expect(push.enable(backend, jest.fn())).rejects.toThrow('Apple notification registration is not ready');
  expect(messaging.register).not.toHaveBeenCalled();
  expect(backend.register).not.toHaveBeenCalled();
  expect(backend.unregister).toHaveBeenCalledTimes(1);
  jest.mocked(messaging.getAPNSToken).mockResolvedValue('synthetic-apns-token');
  expect(await push.enable(backend, jest.fn())).toBe('allowed');
  await push.disable();
});

test('opt-out during APNs refresh prevents re-registration and backend admission', async () => {
  jest.mocked(messaging.getAPNSToken).mockResolvedValueOnce(null);
  let finish!: () => void;
  jest.mocked(messaging.unregisterDeviceForRemoteMessages).mockImplementationOnce(
    () => new Promise<void>(resolve => { finish = resolve; }),
  );
  const push = new NativePush();
  const backend = registration();
  const enabling = push.enable(backend, jest.fn());
  for (let index = 0; index < 24; index++) { await Promise.resolve(); }
  expect(finish).toBeDefined();
  await push.disable();
  finish();
  expect(await enabling).toBe('denied');
  expect(messaging.registerDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
  expect(messaging.register).not.toHaveBeenCalled();
  expect(backend.register).not.toHaveBeenCalled();
});
