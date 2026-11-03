export interface ReplyNotification {
  version: '1';
  kind: 'reply_ready';
  event_id: string;
  request_id: string;
}
export interface CommitmentNotification {
  version: '2';
  kind: 'commitment_ready';
  event_id: string;
  item_id: string;
}
export type AgentNotification = ReplyNotification | CommitmentNotification;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = new Set(['version', 'kind', 'event_id', 'request_id']);
const commitmentFields = new Set(['version', 'kind', 'event_id', 'item_id']);
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
export function agentNotification(value: unknown): AgentNotification | null {
  const reply = replyNotification(value);
  if (reply) return reply;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== commitmentFields.size ||
    Object.keys(data).some(key => !commitmentFields.has(key)) ||
    data.version !== '2' ||
    data.kind !== 'commitment_ready' ||
    typeof data.event_id !== 'string' ||
    !uuid.test(data.event_id) ||
    typeof data.item_id !== 'string' ||
    !uuid.test(data.item_id)
  )
    return null;
  return {
    version: '2',
    kind: 'commitment_ready',
    event_id: data.event_id,
    item_id: data.item_id,
  };
}
export interface NotificationDestination {
  ownsRequest(requestId: string): Promise<boolean>;
  openRequest(requestId: string): void;
  ownsCommitment?(itemId: string): Promise<boolean>;
  openCommitment?(itemId: string): void;
}
/** A push is an untrusted hint; an authenticated server read authorizes its target. */
export class NotificationRouter {
  private epoch = 0;
  private readonly seen = new Set<string>();
  private pending: AgentNotification | null = null;
  private destination: NotificationDestination | null = null;
  private readonly checking = new Set<string>();

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
    const notification = agentNotification(value);
    if (!notification || this.seen.has(notification.event_id)) {
      return false;
    }
    if (!this.destination) {
      this.pending = notification;
      return false;
    }
    return this.open(notification);
  }
  private async open(notification: AgentNotification): Promise<boolean> {
    const destination = this.destination;
    const epoch = this.epoch;
    const key = `${epoch}:${notification.event_id}`;
    if (!destination || this.checking.has(key)) {
      return false;
    }
    this.checking.add(key);
    try {
      const allowed =
        notification.kind === 'commitment_ready'
          ? Boolean(
              destination.openCommitment &&
                (await destination.ownsCommitment?.(notification.item_id)),
            )
          : await destination.ownsRequest(notification.request_id);
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
      if (notification.kind === 'commitment_ready')
        destination.openCommitment?.(notification.item_id);
      else destination.openRequest(notification.request_id);
      return true;
    } catch {
      // A failed read never authorizes navigation. A later tap may retry it.
      return false;
    } finally {
      this.checking.delete(key);
    }
  }
}
