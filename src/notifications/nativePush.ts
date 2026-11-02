import { getApps } from '@react-native-firebase/app';
import {
  AuthorizationStatus,
  deleteToken,
  registerDeviceForRemoteMessages,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { replyNotification, ReplyNotification } from './payload';

export type PushPermission = 'unconfigured' | 'denied' | 'allowed';
export interface PushRegistration {
  register(token: string, platform: 'ios' | 'android'): Promise<void>;
  unregister(): Promise<void>;
}
/** Registration callbacks must use the authenticated, owner-bound backend client. */
export class NativePush {
  private epoch = 0;
  private subscriptions: (() => void)[] = [];
  private updates: Promise<void> = Promise.resolve();
  private cleanups: Promise<void> = Promise.resolve();
  private registration: PushRegistration | null = null;

  configured(): boolean {
    return getApps().length > 0;
  }
  async enable(
    registration: PushRegistration,
    onFailure: () => void,
  ): Promise<PushPermission> {
    const epoch = ++this.epoch;
    await this.cleanup();
    if (epoch !== this.epoch) {
      return 'denied';
    }
    if (!this.configured()) {
      return 'unconfigured';
    }
    const messaging = getMessaging();
    let allowed: boolean;
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      allowed =
        (await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        )) === PermissionsAndroid.RESULTS.GRANTED;
    } else {
      const status = await requestPermission(messaging);
      allowed =
        status === AuthorizationStatus.AUTHORIZED ||
        status === AuthorizationStatus.PROVISIONAL;
    }
    if (!allowed || epoch !== this.epoch) {
      return 'denied';
    }
    this.registration = registration;
    if (Platform.OS === 'ios') {
      await registerDeviceForRemoteMessages(messaging);
    }
    if (epoch !== this.epoch) {
      return 'denied';
    }
    const token = await getToken(messaging);
    if (epoch !== this.epoch) {
      return 'denied';
    }
    await this.register(token, epoch, registration);
    if (epoch !== this.epoch) {
      return 'denied';
    }
    this.subscriptions.push(
      onTokenRefresh(messaging, rotated => {
        this.register(rotated, epoch, registration).catch(onFailure);
      }),
    );
    return 'allowed';
  }
  private register(
    token: string,
    epoch: number,
    registration: PushRegistration,
  ): Promise<void> {
    this.updates = this.updates
      .catch(() => undefined)
      .then(async () => {
        if (epoch !== this.epoch || this.registration !== registration) {
          return;
        }
        if (!token || token.length > 4096) {
          throw new Error('Invalid push registration');
        }
        await registration.register(
          token,
          Platform.OS === 'ios' ? 'ios' : 'android',
        );
      });
    return this.updates;
  }
  listen(
    open: (data: ReplyNotification) => void,
    foreground: (data: ReplyNotification) => void,
  ): () => void {
    if (!this.configured()) {
      return () => undefined;
    }
    const messaging = getMessaging();
    let active = true;
    const emit = (
      value: unknown,
      callback: (data: ReplyNotification) => void,
    ) => {
      const payload = replyNotification(value);
      if (active && payload) {
        callback(payload);
      }
    };
    const stopOpen = onNotificationOpenedApp(messaging, message =>
      emit(message.data, open),
    );
    const stopForeground = onMessage(messaging, message =>
      emit(message.data, foreground),
    );
    getInitialNotification(messaging)
      .then(message => {
        if (message) {
          emit(message.data, open);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stopOpen();
      stopForeground();
    };
  }
  async disable(): Promise<void> {
    this.epoch++;
    await this.cleanup();
  }
  private cleanup(): Promise<void> {
    this.subscriptions.splice(0).forEach(stop => stop());
    this.cleanups = this.cleanups
      .catch(() => undefined)
      .then(() => this.clearRegistration());
    return this.cleanups;
  }
  private async clearRegistration(): Promise<void> {
    const registration = this.registration;
    await this.updates.catch(() => undefined);
    // Unregistration failure must remain visible to the caller; never claim remote revocation.
    if (registration) {
      try {
        await registration.unregister();
      } finally {
        // Stop provider delivery even when remote cleanup needs a retry.
        if (this.configured()) {
          await deleteToken(getMessaging());
        }
      }
    }
    if (this.registration === registration) {
      this.registration = null;
    }
  }
}
