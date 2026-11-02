import { Linking, NativeModules } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { SessionClient } from './client';
import { SessionIO } from './types';
const service = 'com.runningdigitally.radhouse.session';
const native = NativeModules.RadhouseHTTP as Pick<
  SessionIO,
  'request' | 'randomBytes' | 'syncCookies' | 'clearCookies'
>;
export const nativeSessionIO: SessionIO = {
  request: (...args) => native.request(...args),
  randomBytes: () => native.randomBytes(),
  syncCookies: (...args) => native.syncCookies(...args),
  clearCookies: () => native.clearCookies(),
  openBrowser: url => Linking.openURL(url),
  load: async () => {
    const saved = await Keychain.getGenericPassword({ service });
    return saved ? saved.password : null;
  },
  save: value =>
    Keychain.setGenericPassword('radhouse-session', value, {
      service,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => Keychain.resetGenericPassword({ service }),
  now: Date.now,
  pause: () => new Promise(resolve => setTimeout(resolve, 1500)),
};
export const nativeSession = new SessionClient(nativeSessionIO);
