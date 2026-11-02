import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { requestPushPermission } from '../src/notifications/permission';

test.each([true, false])(
  'iOS uses the OS permission bridge and returns %s',
  async allowed => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    NativeModules.RadhouseHTTP = {
      requestNotificationPermission: jest.fn(async () => allowed),
    };
    expect(await requestPushPermission()).toBe(allowed);
  },
);
test.each([
  PermissionsAndroid.RESULTS.GRANTED,
  PermissionsAndroid.RESULTS.DENIED,
])('Android 33+ requests OS permission: %s', async result => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  Object.defineProperty(Platform, 'Version', { value: 35, configurable: true });
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValueOnce(result);
  expect(await requestPushPermission()).toBe(
    result === PermissionsAndroid.RESULTS.GRANTED,
  );
});
test('Android before 33 does not request an unsupported runtime permission', async () => {
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  Object.defineProperty(Platform, 'Version', { value: 32, configurable: true });
  const request = jest.spyOn(PermissionsAndroid, 'request');
  request.mockClear();
  expect(await requestPushPermission()).toBe(true);
  expect(request).not.toHaveBeenCalled();
});
