import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/** Permission belongs to the OS, independently of Firebase registration. */
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return NativeModules.RadhouseHTTP.requestNotificationPermission();
  }
  if (Number(Platform.Version) < 33) {
    return true;
  }
  return (
    (await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    )) === PermissionsAndroid.RESULTS.GRANTED
  );
}
