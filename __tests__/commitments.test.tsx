import React from 'react';
import { fireEvent, renderAsync, waitFor } from '@testing-library/react-native';
import { Commitments } from '../src/components/Commitments';
import { SessionClient } from '../src/auth/client';
import {
  agentNotification,
  NotificationRouter,
} from '../src/notifications/payload';

const id = '58e8f3dd-cd82-48a4-9df9-63c3a15b310f';
const event = {
  version: '2',
  kind: 'commitment_ready',
  event_id: '5ef747a8-61b7-42a4-91db-d7bb117941a2',
  item_id: id,
};

test.each([
  { ...event, url: 'https://foreign.test' },
  { ...event, request_id: id },
  { ...event, item_id: '../foreign' },
  { ...event, kind: 'execute' },
])('rejects proactive authority or navigation injected in a payload', value => {
  expect(agentNotification(value)).toBeNull();
});
test('proactive notification waits for current authenticated ownership and opens its own destination', async () => {
  const router = new NotificationRouter();
  const openRequest = jest.fn(),
    openCommitment = jest.fn();
  expect(await router.receive(event)).toBe(false);
  await router.signIn({
    ownsRequest: async () => true,
    openRequest,
    ownsCommitment: async () => true,
    openCommitment,
  });
  expect(openCommitment).toHaveBeenCalledWith(id);
  expect(openRequest).not.toHaveBeenCalled();
  expect(await router.receive(event)).toBe(false);
});
test('a client without the proactive destination cannot reinterpret it as a reply', async () => {
  const router = new NotificationRouter();
  const openRequest = jest.fn();
  await router.signIn({ ownsRequest: async () => true, openRequest });
  expect(await router.receive(event)).toBe(false);
  expect(openRequest).not.toHaveBeenCalled();
});
test('logout invalidates proactive authorization still in flight', async () => {
  const router = new NotificationRouter();
  const openCommitment = jest.fn();
  let finish!: (allowed: boolean) => void;
  await router.signIn({
    ownsRequest: async () => true,
    openRequest: jest.fn(),
    openCommitment,
    ownsCommitment: () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  });
  const pending = router.receive(event);
  router.signOut();
  finish(true);
  expect(await pending).toBe(false);
  expect(openCommitment).not.toHaveBeenCalled();
});
test('commitment screen shows evidence and waits for an explicit decision', async () => {
  const item = {
    id,
    source_request_id: id,
    title: 'Prepare the draft',
    quote: 'send the draft',
    reason: 'A possible intention.',
    preparation: 'Review the draft first.',
    state: 'suggested',
  };
  const client = {
    read: jest.fn(async () => ({
      active: true,
      suggestions: [item],
      coverage: null,
    })),
    commitmentDecision: jest.fn(async () => {
      item.state = 'confirmed';
      return { status: 'confirmed' };
    }),
    commitmentControl: jest.fn(async () => ({})),
  };
  const source = jest.fn();
  const ui = await renderAsync(
    <Commitments
      client={client as unknown as SessionClient}
      focusId={id}
      onClose={jest.fn()}
      onSource={source}
    />,
  );
  expect(ui.getByText('“send the draft”')).toBeTruthy();
  expect(ui.getByText('Review the draft first.')).toBeTruthy();
  expect(client.commitmentDecision).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Read the original message'));
  expect(source).toHaveBeenCalledWith(id);
  fireEvent.press(ui.getByText('Confirm commitment'));
  await waitFor(() =>
    expect(client.commitmentDecision).toHaveBeenCalledWith(id, 'confirmed'),
  );
  await waitFor(() => expect(ui.getByText('CONFIRMED')).toBeTruthy());
});

test('later follow-up occurrences open the same authenticated commitment independently', async () => {
  const router = new NotificationRouter();
  const openCommitment = jest.fn();
  await router.signIn({
    ownsRequest: async () => false,
    openRequest: jest.fn(),
    ownsCommitment: async () => true,
    openCommitment,
  });
  expect(await router.receive(event)).toBe(true);
  expect(
    await router.receive({
      ...event,
      event_id: 'c7ea6f4e-612f-46e2-849e-135b45cb24c7',
    }),
  ).toBe(true);
  expect(openCommitment.mock.calls).toEqual([[id], [id]]);
});

test('explicit follow-up confirmation exposes progress, snooze and terminal controls', async () => {
  const followup = {
    state: 'active',
    revision: 1,
    next_review_at: 1000000,
    last_review_at: null,
    progress: '',
    latest_note: null,
  };
  const item = {
    id,
    source_request_id: id,
    title: 'Prepare the draft',
    quote: 'send the draft',
    reason: 'A possible intention.',
    preparation: 'Review the draft first.',
    state: 'suggested',
    followup: null as typeof followup | null,
  };
  const client = {
    read: jest.fn(async () => ({
      active: true,
      scope: { followups_supported: true },
      suggestions: [item],
      coverage: null,
    })),
    commitmentDecision: jest.fn(async () => {
      item.state = 'confirmed';
      item.followup = { ...followup };
    }),
    commitmentFollowup: jest.fn(
      async (
        _id: string,
        body: { action: string; revision: number; progress?: string },
      ) => {
        if (body.action === 'progress')
          item.followup!.progress = body.progress!;
        if (body.action === 'snooze') item.followup!.state = 'snoozed';
        if (body.action === 'complete') item.followup!.state = 'completed';
        item.followup = { ...item.followup!, revision: body.revision + 1 };
      },
    ),
    commitmentControl: jest.fn(),
  };
  const ui = await renderAsync(
    <Commitments
      client={client as unknown as SessionClient}
      focusId={id}
      onClose={jest.fn()}
      onSource={jest.fn()}
    />,
  );
  fireEvent.press(ui.getByText('Confirm and follow up'));
  await waitFor(() =>
    expect(client.commitmentDecision).toHaveBeenCalledWith(
      id,
      'confirmed_followup',
    ),
  );
  await waitFor(() => expect(ui.getByText('Ongoing follow-up')).toBeTruthy());
  fireEvent.changeText(
    ui.getByLabelText('Progress or a correction'),
    'Opening paragraph finished.',
  );
  fireEvent.press(ui.getByText('Save progress'));
  await waitFor(() =>
    expect(client.commitmentFollowup).toHaveBeenCalledWith(id, {
      action: 'progress',
      revision: 1,
      progress: 'Opening paragraph finished.',
    }),
  );
  await waitFor(() =>
    expect(ui.getByText('Save progress').parent).toBeTruthy(),
  );
  fireEvent.press(ui.getByText('Snooze 1 day'));
  await waitFor(() => expect(ui.getByText('Resume now')).toBeTruthy());
  fireEvent.press(ui.getByText('Mark complete'));
  await waitFor(() => expect(ui.getByText('COMPLETED')).toBeTruthy());
  expect(ui.queryByText('Save progress')).toBeNull();
});
