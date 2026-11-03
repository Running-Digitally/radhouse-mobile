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
