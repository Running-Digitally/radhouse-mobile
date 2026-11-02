import {
  NotificationRouter,
  replyNotification,
} from '../src/notifications/payload';
const event = {
  version: '1',
  kind: 'reply_ready',
  event_id: '5ef747a8-61b7-42a4-91db-d7bb117941a2',
  request_id: '58e8f3dd-cd82-48a4-9df9-63c3a15b310f',
};
test.each([
  null,
  [],
  4,
  {},
  { ...event, version: '2' },
  { ...event, request_id: 'https://foreign.invalid' },
  { ...event, url: 'https://foreign.invalid' },
  { ...event, kind: 'execute' },
  { ...event, event_id: 'bad' },
])('rejects malformed or extended payloads %p', value => {
  expect(replyNotification(value)).toBeNull();
});
test('cold-launch hint waits for authenticated ownership and deduplicates', async () => {
  const router = new NotificationRouter();
  const openRequest = jest.fn();
  const ownsRequest = jest.fn(async () => true);
  expect(await router.receive(event)).toBe(false);
  await router.signIn({ openRequest, ownsRequest });
  expect(openRequest).toHaveBeenCalledWith(event.request_id);
  expect(await router.receive(event)).toBe(false);
  expect(openRequest).toHaveBeenCalledTimes(1);
});
test('logout invalidates in-flight authorization; old identity cannot open a target', async () => {
  const router = new NotificationRouter();
  const openRequest = jest.fn();
  let finish!: (allowed: boolean) => void;
  await router.signIn({
    openRequest,
    ownsRequest: () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  });
  const result = router.receive(event);
  expect(await router.receive(event)).toBe(false);
  router.signOut();
  finish(true);
  expect(await result).toBe(false);
  expect(openRequest).not.toHaveBeenCalled();
});
test('foreign ownership and connection errors never authorize navigation', async () => {
  const router = new NotificationRouter();
  const openRequest = jest.fn();
  await router.signIn({ openRequest, ownsRequest: async () => false });
  expect(await router.receive(event)).toBe(false);
  await router.signIn({
    openRequest,
    ownsRequest: async () => {
      throw new Error('offline');
    },
  });
  expect(await router.receive(event)).toBe(false);
  expect(openRequest).not.toHaveBeenCalled();
});
