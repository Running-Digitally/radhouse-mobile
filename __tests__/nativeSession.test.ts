import { Linking, NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
test('native adapter isolates session storage and delegates to bounded native transport', async () => {
  const native = {
    request: jest.fn(async () => ({})),
    randomBytes: jest.fn(async () => 'synthetic-random'),
    syncCookies: jest.fn(async () => undefined),
    clearCookies: jest.fn(async () => undefined),
  };
  NativeModules.RadhouseHTTP = native;
  const { nativeSessionIO: io } = require('../src/auth/native');
  const browser = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  expect(await io.load()).toBeNull();
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({
    username: 'radhouse-session',
    password: 'synthetic-session',
    service: 'com.runningdigitally.radhouse.session',
    storage: 'mock',
  } as never);
  expect(await io.load()).toBe('synthetic-session');
  await io.save('synthetic-session');
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'radhouse-session',
    'synthetic-session',
    expect.objectContaining({
      service: 'com.runningdigitally.radhouse.session',
      accessible: 'device-only',
    }),
  );
  await io.clear();
  await io.clearCookies();
  await io.syncCookies('access', 'local');
  await io.request('url', 'GET', '', '', '', '');
  await io.randomBytes();
  await io.openBrowser('https://example.test');
  expect(browser).toHaveBeenCalledWith('https://example.test');
  expect(io.now()).toBeGreaterThan(0);
  jest.useFakeTimers();
  const pending = io.pause();
  jest.advanceTimersByTime(1500);
  await pending;
  jest.useRealTimers();
  browser.mockRestore();
});
test('notification preference storage has a separate device-only Keychain service', async () => {
  const {
    notificationPreferences,
  } = require('../src/notifications/nativeConnection');
  jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce(false);
  expect(await notificationPreferences.load()).toBeNull();
  await notificationPreferences.save('synthetic-preference');
  expect(Keychain.setGenericPassword).toHaveBeenLastCalledWith(
    'radhouse-push-preference',
    'synthetic-preference',
    expect.objectContaining({
      service: 'com.runningdigitally.radhouse.push-preference',
      accessible: 'device-only',
    }),
  );
});
