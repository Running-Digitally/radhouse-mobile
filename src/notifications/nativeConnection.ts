import * as Keychain from 'react-native-keychain';
import { nativeSession } from '../auth/native';
import { NotificationConnection } from './connection';
import { NativePush } from './nativePush';

const options = {
  service: 'com.runningdigitally.radhouse.push-preference',
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const notificationPreferences = {
  load: async () => {
    const saved = await Keychain.getGenericPassword(options);
    return saved ? saved.password : null;
  },
  save: (value: string) =>
    Keychain.setGenericPassword('radhouse-push-preference', value, options),
};
export const createMobileNotifications = () =>
  new NotificationConnection(
    nativeSession,
    new NativePush(),
    notificationPreferences,
  );
