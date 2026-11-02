import { getApps } from '@react-native-firebase/app';
import {
  unregister,
  registerDeviceForRemoteMessages,
  getInitialNotification,
  getMessaging,
  register,
  onMessage,
  onNotificationOpenedApp,
  onRegistered,
} from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { requestPushPermission } from './permission';
import { replyNotification, ReplyNotification } from './payload';

export type PushPermission = 'unconfigured' | 'denied' | 'allowed';
export interface PushRegistration {
  register(token: string, platform: 'ios' | 'android'): Promise<void>;
  unregister(): Promise<void>;
}
/** Registration callbacks must use the authenticated, owner-bound backend client. */
export class NativePush {
  private epoch = 0;
  private readonly subscriptions: (() => void)[] = [];
  private updates: Promise<void> = Promise.resolve();
  private cleanups: Promise<void> = Promise.resolve();
  private registration: PushRegistration | null = null;
  private cancelRegistration: (() => void) | null = null;

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
    const allowed = await requestPushPermission();
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
    try {
      const ready = await this.registerInstallation(
        messaging,
        epoch,
        registration,
        onFailure,
      );
      return ready && epoch === this.epoch ? 'allowed' : 'denied';
    } catch (error) {
      if (epoch === this.epoch) {
        await this.disable().catch(() => undefined);
      }
      throw error;
    }
  }

  private registerInstallation(
    messaging: ReturnType<typeof getMessaging>,
    epoch: number,
    registration: PushRegistration,
    onFailure: () => void,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ready: boolean, error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (this.cancelRegistration === cancel) {
          this.cancelRegistration = null;
        }
        if (error) {
          reject(error);
        } else {
          resolve(ready);
        }
      };
      const cancel = () => finish(false);
      const timer = setTimeout(
        () => finish(false, new Error('Push registration timed out')),
        30000,
      );
      this.cancelRegistration = cancel;
      this.subscriptions.push(
        onRegistered(messaging, fid => {
          this.register(fid, epoch, registration).then(
            () => finish(epoch === this.epoch),
            () => {
              onFailure();
              finish(false, new Error('Push registration failed'));
            },
          );
        }),
      );
      // Listen first: the SDK may publish its FID before register() resolves.
      register(messaging).catch(() =>
        finish(false, new Error('Push registration failed')),
      );
    });
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
    this.cancelRegistration?.();
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
          await unregister(getMessaging());
        }
      }
    }
    if (this.registration === registration) {
      this.registration = null;
    }
  }
}
