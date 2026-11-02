import { SessionClient } from '../auth/client';
import { SessionError } from '../auth/types';
import { NativePush, PushSetupError } from './nativePush';
import { NotificationRouter } from './payload';

export type NotificationState =
  | 'loading'
  | 'unavailable'
  | 'off'
  | 'on'
  | 'error';
export interface PreferenceStore {
  load(): Promise<string | null>;
  save(value: string): Promise<unknown>;
}
type Preference = { installation: string; username: string; enabled: boolean };
type Listener = {
  state: (value: NotificationState) => void;
  open: (requestId: string) => void;
  foreground: () => void;
};

export class NotificationConnection {
  private epoch = 0;
  private preference: Preference | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private readonly router = new NotificationRouter();
  private stop: (() => void) | null = null;
  private listener: Listener | null = null;
  private username = '';
  private setupFailure: PushSetupError['stage'] | null = null;
  failureDescription(): string {
    switch (this.setupFailure) {
      case 'cleanup': return 'Previous notification registration could not be cleared. Please retry.';
      case 'apple': return 'Apple notification registration did not complete. Please retry.';
      case 'firebase': return 'Notification delivery registration did not complete. Please retry.';
      case 'server': return 'Radhouse could not save notification registration. Please retry.';
      default: return 'Notification setup could not be confirmed. Retry when connected.';
    }
  }
  constructor(
    private readonly client: SessionClient,
    private readonly native: NativePush,
    private readonly storage: PreferenceStore,
  ) {}

  private report(value: NotificationState) {
    this.listener?.state(value);
  }
  private persist(value: Preference) {
    this.preference = value;
    this.writes = this.writes
      .catch(() => undefined)
      .then(() => this.storage.save(JSON.stringify(value)));
    return this.writes;
  }
  private current(epoch: number) {
    if (epoch !== this.epoch) {
      throw new SessionError('cancelled');
    }
  }
  async connect(username: string, listener: Listener) {
    this.disconnect();
    this.listener = listener;
    this.username = username;
    const epoch = this.epoch;
    this.report('loading');
    this.stop = this.native.listen(
      data => {
        this.router.receive(data).catch(() => this.report('error'));
      },
      () => this.listener?.foreground(),
    );
    await this.router.signIn({
      ownsRequest: async id => {
        try {
          const result = await this.client.read('/chat/messages/' + id);
          const turn = result.turn as { request_id?: unknown } | undefined;
          return turn?.request_id === id;
        } catch {
          return false;
        }
      },
      openRequest: id => this.listener?.open(id),
    });
    try {
      await this.writes.catch(() => undefined);
      const raw = await this.storage.load();
      this.current(epoch);
      this.preference = this.readPreference(raw);
      const available = await this.client.pushAvailable();
      this.current(epoch);
      if (!available || !this.native.configured()) {
        this.report('unavailable');
        return;
      }
      if (this.preference?.username === username && this.preference.enabled) {
        await this.enable();
      } else {
        this.report('off');
      }
    } catch (error) {
      if (epoch === this.epoch) {
        this.setupFailure = error instanceof PushSetupError ? error.stage : null;
        this.report('error');
      }
      if (!(error instanceof SessionError && error.kind === 'cancelled')) {
        throw error;
      }
    }
  }
  private readPreference(raw: string | null): Preference | null {
    try {
      const value = JSON.parse(raw ?? 'null');
      if (
        value &&
        typeof value.username === 'string' &&
        typeof value.enabled === 'boolean' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
          value.installation,
        )
      ) {
        return value;
      }
    } catch {
      /* Missing or malformed preferences never grant notification consent. */
    }
    return null;
  }
  async enable() {
    this.setupFailure = null;
    const epoch = this.epoch;
    this.report('loading');
    try {
      if (!(await this.client.pushAvailable()) || !this.native.configured()) {
        this.current(epoch);
        this.report('unavailable');
        return;
      }
      const installation =
        this.preference?.username === this.username
          ? this.preference.installation
          : await this.client.newRequestId();
      this.current(epoch);
      const allowed = await this.native.enable(
        this.client.pushRegistration(installation),
        () => {
          if (epoch === this.epoch) {
            this.report('error');
          }
        },
      );
      this.current(epoch);
      await this.persist({
        installation,
        username: this.username,
        enabled: allowed === 'allowed',
      });
      this.current(epoch);
      this.report(allowed === 'allowed' ? 'on' : 'off');
    } catch (error) {
      if (epoch === this.epoch) {
        this.setupFailure = error instanceof PushSetupError ? error.stage : null;
        this.report('error');
      }
      throw error;
    }
  }
  async disable() {
    this.epoch++;
    this.report('loading');
    try {
      try {
        if (this.preference) {
          await this.persist({ ...this.preference, enabled: false });
        }
      } finally {
        await this.native.disable();
      }
      this.report('off');
    } catch (error) {
      this.report('error');
      throw error;
    }
  }
  disconnect() {
    this.epoch++;
    this.stop?.();
    this.stop = null;
    this.router.signOut();
    this.listener = null;
  }
}
