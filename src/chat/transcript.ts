import { SessionError } from '../auth/types';
import { object } from '../auth/transfer';
import type { Selection } from './inference';

export type LiveTurn = Readonly<{
  request_id: string;
  text: string;
  output: string | null;
  status: string;
  seq?: number;
  created_at?: string;
  inference?: Selection | null;
}>;
export function readTurns(value: unknown): LiveTurn[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new SessionError('invalid');
  }
  return value.map(item => {
    const turn = object(item);
    if (
      typeof turn.request_id !== 'string' ||
      typeof turn.text !== 'string' ||
      typeof turn.status !== 'string' ||
      !(turn.output === null || typeof turn.output === 'string')
    ) {
      throw new SessionError('invalid');
    }
    let inference: Selection | null = null;
    if (turn.inference) {
      const value_ = object(turn.inference);
      if (
        (typeof value_.model !== 'string' && value_.model !== null) ||
        typeof value_.thinking !== 'string' ||
        (value_.provider !== undefined && typeof value_.provider !== 'string')
      ) {
        throw new SessionError('invalid');
      }
      inference = {
        model: value_.model as string | null,
        thinking: value_.thinking,
        provider: value_.provider as string | undefined,
      };
    }
    return {
      request_id: turn.request_id,
      text: turn.text,
      status: turn.status,
      output: turn.output,
      seq: typeof turn.seq === 'number' ? turn.seq : undefined,
      created_at:
        typeof turn.created_at === 'string' ? turn.created_at : undefined,
      inference,
    };
  });
}
export function mergeTurns(
  previous: readonly LiveTurn[],
  incoming: readonly LiveTurn[],
) {
  const rows = new Map(previous.map(turn => [turn.request_id, turn]));
  incoming.forEach(turn => rows.set(turn.request_id, turn));
  return [...rows.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}
export function turnStatus(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Reply ready',
    waiting: 'Queued · waiting for the current reply',
    awaiting_dispatch: 'Message saved · preparing reply',
    running: 'Working on your reply',
    failed: 'Reply could not finish',
    interrupted: 'Reply interrupted',
    cancelled: 'Reply stopped',
  };
  return labels[status] ?? 'Working on your reply';
}
export function isWorking(turn: LiveTurn) {
  return !['completed', 'failed', 'interrupted', 'cancelled'].includes(
    turn.status,
  );
}
