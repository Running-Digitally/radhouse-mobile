import { getApps } from '@react-native-firebase/app';
import * as messaging from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { NativePush } from '../src/notifications/nativePush';
jest.mock('@react-native-firebase/app', () => ({ getApps: jest.fn() }));
jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: jest.fn(() => ({})),
  getInitialNotification: jest.fn(async () => null),
  deleteToken: jest.fn(async () => undefined),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
  getToken: jest.fn(async () => 'synthetic-device-token'),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  onTokenRefresh: jest.fn(() => jest.fn()),
  requestPermission: jest.fn(async () => 1),
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
  jest.mocked(messaging.getToken).mockResolvedValue('synthetic-device-token');
  jest.mocked(messaging.requestPermission).mockResolvedValue(1);
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
  expect(messaging.requestPermission).not.toHaveBeenCalled();
  push.listen(jest.fn(), jest.fn())();
});
test('permission denial never fetches a device token', async () => {
  jest.mocked(messaging.requestPermission).mockResolvedValue(0);
  expect(await new NativePush().enable(registration(), jest.fn())).toBe(
    'denied',
  );
  expect(messaging.getToken).not.toHaveBeenCalled();
  expect(messaging.registerDeviceForRemoteMessages).not.toHaveBeenCalled();
});
test('registration rotates and remote unregistration is ordered after in-flight writes', async () => {
  const push = new NativePush();
  const backend = registration();
  const failure = jest.fn();
  expect(await push.enable(backend, failure)).toBe('allowed');
  expect(backend.register).toHaveBeenCalledWith(
    'synthetic-device-token',
    'ios',
  );
  const rotate = jest.mocked(messaging.onTokenRefresh).mock.calls[0][1];
  rotate('rotated-token');
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
  expect(messaging.deleteToken).toHaveBeenCalledTimes(1);
  await push.disable();
  expect(backend.unregister).toHaveBeenCalledTimes(2);
});
test('logout while token retrieval is pending prevents subsequent registration', async () => {
  let finish!: (token: string) => void;
  jest.mocked(messaging.getToken).mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const push = new NativePush();
  const backend = registration();
  const enabling = push.enable(backend, jest.fn());
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
  await push.disable();
  finish('late-token');
  expect(await enabling).toBe('denied');
  expect(backend.register).not.toHaveBeenCalled();
});
test('Android uses notification permission and registers the correct platform', async () => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  Object.defineProperty(Platform, 'Version', { value: 35, configurable: true });
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  const push = new NativePush();
  const backend = registration();
  expect(await push.enable(backend, jest.fn())).toBe('allowed');
  expect(backend.register).toHaveBeenCalledWith(
    'synthetic-device-token',
    'android',
  );
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
