export interface ReplyNotification {
  version: '1';
  kind: 'reply_ready';
  event_id: string;
  request_id: string;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = new Set(['version', 'kind', 'event_id', 'request_id']);
export function replyNotification(value: unknown): ReplyNotification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !fields.has(key))) {
    return null;
  }
  if (
    data.version !== '1' ||
    data.kind !== 'reply_ready' ||
    typeof data.event_id !== 'string' ||
    !uuid.test(data.event_id) ||
    typeof data.request_id !== 'string' ||
    !uuid.test(data.request_id)
  ) {
    return null;
  }
  return {
    version: '1',
    kind: 'reply_ready',
    event_id: data.event_id,
    request_id: data.request_id,
  };
}
export interface NotificationDestination {
  ownsRequest(requestId: string): Promise<boolean>;
  openRequest(requestId: string): void;
}
/** A push is an untrusted hint; an authenticated server read authorizes its target. */
export class NotificationRouter {
  private epoch = 0;
  private seen = new Set<string>();
  private pending: ReplyNotification | null = null;
  private destination: NotificationDestination | null = null;
  private checking = new Set<string>();

  async signIn(destination: NotificationDestination): Promise<void> {
    this.epoch++;
    this.destination = destination;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      await this.open(pending);
    }
  }
  signOut(): void {
    this.epoch++;
    this.destination = null;
    this.pending = null;
    this.seen.clear();
    this.checking.clear();
  }
  async receive(value: unknown): Promise<boolean> {
    const notification = replyNotification(value);
    if (!notification || this.seen.has(notification.event_id)) {
      return false;
    }
    if (!this.destination) {
      this.pending = notification;
      return false;
    }
    return this.open(notification);
  }
  private async open(notification: ReplyNotification): Promise<boolean> {
    const destination = this.destination;
    const epoch = this.epoch;
    const key = `${epoch}:${notification.event_id}`;
    if (!destination || this.checking.has(key)) {
      return false;
    }
    this.checking.add(key);
    try {
      const allowed = await destination.ownsRequest(notification.request_id);
      if (
        !allowed ||
        epoch !== this.epoch ||
        destination !== this.destination
      ) {
        return false;
      }
      this.seen.add(notification.event_id);
      if (this.seen.size > 128) {
        const oldest = this.seen.values().next().value;
        if (oldest) {
          this.seen.delete(oldest);
        }
      }
      destination.openRequest(notification.request_id);
      return true;
    } catch {
      // A failed read never authorizes navigation. A later tap may retry it.
      return false;
    } finally {
      this.checking.delete(key);
    }
  }
}
