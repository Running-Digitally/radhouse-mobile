import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, decodeUTF8 } from 'tweetnacl-util';
import { SessionClient } from '../src/auth/client';
import {
  AUDIENCE,
  ISSUER,
  ORIGIN,
  decryptTransfer,
  object,
  tokenExpiry,
} from '../src/auth/transfer';
import { HTTPResult, SessionIO } from '../src/auth/types';
const seed = new Uint8Array(32).fill(17);
const local = 'L'.repeat(43);
const csrf = 'c'.repeat(64);
const now = 1800000000000;
const claims = { iss: ISSUER, aud: [AUDIENCE], exp: now / 1000 + 7200 };
const jwt = (value: object) =>
  `header.${encodeBase64(decodeUTF8(JSON.stringify(value)))}.signature`;
const access = jwt(claims);
const info = {
  username: 'synthetic-owner',
  csrf_token: csrf,
  features: { terminal: true, browser_streaming: true },
};
const response = (body: object, status = 200): HTTPResult => ({
  status,
  body: JSON.stringify(body),
  contentType: 'application/json',
  serviceKey: '',
  sessionToken: '',
});
function transfer() {
  const peer = nacl.box.keyPair.fromSecretKey(new Uint8Array(32).fill(23));
  const client = nacl.box.keyPair.fromSecretKey(seed);
  const nonce = new Uint8Array(24).fill(8);
  const ciphertext = nacl.box(
    decodeUTF8(JSON.stringify({ app_token: access, org_token: 'discard-me' })),
    nonce,
    client.publicKey,
    peer.secretKey,
  );
  return {
    body: encodeBase64(new Uint8Array([...nonce, ...ciphertext])),
    serviceKey: encodeBase64(peer.publicKey)
      .replaceAll('+', '-')
      .replaceAll('/', '_'),
  };
}
function fixture() {
  const io = {
    request: jest.fn(async (url: string): Promise<HTTPResult> => {
      if (url.startsWith('https://login.cloudflareaccess.org/transfer/')) {
        return { ...response({}), ...transfer() };
      }
      if (url.endsWith('/healthz')) {
        return response({ status: 'ready', scope: 'web' });
      }
      if (url.endsWith('/auth/login')) {
        return { ...response(info), sessionToken: local };
      }
      if (url.endsWith('/auth/logout')) {
        return response({}, 204);
      }
      if (url.endsWith('/auth/session')) {
        return response(info);
      }
      return response({ turns: [] });
    }),
    randomBytes: jest.fn(async () => encodeBase64(seed)),
    openBrowser: jest.fn(async () => undefined),
    load: jest.fn(async (): Promise<string | null> => null),
    save: jest.fn(async (_value: string) => undefined),
    clear: jest.fn(async () => undefined),
    syncCookies: jest.fn(async () => undefined),
    clearCookies: jest.fn(async () => undefined),
    now: () => now,
    pause: jest.fn(async () => undefined),
  };
  const client = new SessionClient(io as SessionIO);
  const login = async () => {
    await client.accessLogin();
    return client.localLogin('synthetic-owner', 'synthetic-password', '123456');
  };
  return { io, client, login };
}
test('push capability and mutations are session bound; stale register cannot use a new login', async () => {
  const f = fixture();
  await expect(f.client.pushAvailable()).rejects.toThrow('expired');
  await f.login();
  f.io.request.mockResolvedValueOnce(response({ available: true }));
  expect(await f.client.pushAvailable()).toBe(true);
  f.io.request.mockResolvedValueOnce(response({}, 404));
  expect(await f.client.pushAvailable()).toBe(false);
  f.io.request.mockRejectedValueOnce(new Error('offline'));
  await expect(f.client.pushAvailable()).rejects.toThrow('unavailable');
  const id = await f.client.newRequestId();
  const registration = f.client.pushRegistration(id);
  await registration.register('synthetic-fcm-token-0001', 'ios');
  expect(f.io.request).toHaveBeenLastCalledWith(
    ORIGIN + '/chat/push/devices/' + id,
    'PUT',
    access,
    local,
    csrf,
    JSON.stringify({ token: 'synthetic-fcm-token-0001', platform: 'ios' }),
  );
  await expect(registration.register('bad', 'ios')).rejects.toThrow('invalid');
  expect(() => f.client.pushRegistration('invalid')).toThrow('invalid');
  await f.client.logout();
  await expect(
    registration.register('synthetic-fcm-token-0001', 'ios'),
  ).rejects.toThrow('cancelled');
  f.io.request.mockResolvedValueOnce(response({}, 401));
  await registration.unregister();
  expect(f.io.request).toHaveBeenLastCalledWith(
    ORIGIN + '/chat/push/devices/' + id,
    'DELETE',
    access,
    local,
    csrf,
    '',
  );
  f.io.request.mockResolvedValueOnce(response({}, 503));
  await expect(registration.unregister()).rejects.toThrow('unavailable');
});
test('Access transfer authenticates the app token, discards organization token and binds the app', async () => {
  const f = fixture();
  const session = await f.login();
  expect(session.username).toBe('synthetic-owner');
  expect(f.io.openBrowser).toHaveBeenCalledWith(
    expect.stringContaining(`${ORIGIN}/cdn-cgi/access/cli?`),
  );
  expect(f.io.save).toHaveBeenCalledWith(JSON.stringify({ access, local }));
  expect(f.io.syncCookies).toHaveBeenCalledWith(access, local);
  expect(
    f.io.request.mock.calls.find(call => call[0].includes('/transfer/')),
  ).toEqual([expect.any(String), 'GET', '', '', '', '']);
});
test('session uses Origin-aware native transport and stable request IDs on explicit retry', async () => {
  const f = fixture();
  await f.login();
  const id = await f.client.newRequestId();
  expect(id).toMatch(/^[a-f0-9-]{14}4/);
  await f.client.send(id, 'Hello');
  await f.client.send(id, 'Hello');
  const calls = f.io.request.mock.calls.filter(c =>
    c[0].endsWith('/chat/messages'),
  );
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0]).toEqual([
    ORIGIN + '/chat/messages',
    'POST',
    access,
    local,
    csrf,
    JSON.stringify({ request_id: id, text: 'Hello', attachments: [] }),
  ]);
  await f.client.read('/chat/history');
  await expect(f.client.read('https://untrusted.invalid')).rejects.toThrow(
    'invalid',
  );
  await expect(f.client.send('invalid', 'hi')).rejects.toThrow('invalid');
});
test('saved sessions restore only after server authorization and viewer cookie installation', async () => {
  const f = fixture();
  f.io.load.mockResolvedValue(JSON.stringify({ access, local }));
  expect(await f.client.restore()).toEqual({
    username: info.username,
    features: info.features,
  });
  expect(f.io.syncCookies).toHaveBeenCalledWith(access, local);
});
test('missing and malformed saved credentials fail closed', async () => {
  const f = fixture();
  expect(await f.client.restore()).toBeNull();
  for (const raw of [
    'bad',
    JSON.stringify({ access: 'bad', local }),
    JSON.stringify({ access, local: 'bad' }),
  ]) {
    f.io.load.mockResolvedValue(raw);
    expect(await f.client.restore()).toBeNull();
  }
  expect(f.io.clear).toHaveBeenCalledTimes(3);
});
test('offline restore preserves secure storage while expired sessions clear it', async () => {
  const f = fixture();
  f.io.load.mockResolvedValue(JSON.stringify({ access, local }));
  f.io.request.mockRejectedValueOnce(new Error('network'));
  await expect(f.client.restore()).rejects.toThrow('unavailable');
  expect(f.io.clear).not.toHaveBeenCalled();
  f.io.request.mockResolvedValueOnce(response({}, 401));
  expect(await f.client.restore()).toBeNull();
  expect(f.io.clear).toHaveBeenCalled();
});
test('logout clears device credentials and viewer data even if remote revocation fails', async () => {
  const f = fixture();
  await f.login();
  f.io.request.mockRejectedValueOnce(new Error('offline'));
  await expect(f.client.logout()).rejects.toThrow('offline');
  expect(f.io.clearCookies).toHaveBeenCalledTimes(2);
  await expect(f.client.read('/chat/history')).rejects.toThrow('expired');
  await expect(f.client.send('x', 'y')).rejects.toThrow('expired');
});
test('a stale local login cannot reinstall credentials after logout', async () => {
  const f = fixture();
  await f.client.accessLogin();
  let finish!: (r: HTTPResult) => void;
  f.io.request.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = f.client.localLogin('owner', 'password', '123456');
  await f.client.logout();
  finish({ ...response(info), sessionToken: local });
  await expect(pending).rejects.toThrow('cancelled');
  expect(f.io.save).not.toHaveBeenCalled();
});
test('logout ordered after a pending secure save wins and clears credentials', async () => {
  const f = fixture();
  await f.client.accessLogin();
  let finish!: () => void;
  f.io.save.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = () => resolve(undefined);
      }),
  );
  const pending = f.client.localLogin('owner', 'password', '123456');
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
  const logout = f.client.logout();
  finish();
  await expect(pending).rejects.toThrow('cancelled');
  await logout;
  expect(f.io.syncCookies).not.toHaveBeenCalled();
  expect(f.io.clearCookies).toHaveBeenCalledTimes(2);
});
test.each([301, 302, 307, 401, 403, 409, 500])(
  'request status %s never authorizes a response',
  async status => {
    const f = fixture();
    await f.login();
    f.io.request.mockResolvedValueOnce(response({}, status));
    await expect(f.client.read('/chat/history')).rejects.toThrow(
      status === 409 ? 'conflict' : status === 500 ? 'unavailable' : 'expired',
    );
  },
);
test.each([
  { body: 'not json', contentType: 'application/json' },
  { body: '{}', contentType: 'text/html' },
  { body: '[]', contentType: 'application/json' },
])('invalid response body is rejected: %s', async patch => {
  const f = fixture();
  await f.login();
  f.io.request.mockResolvedValueOnce({ ...response({}), ...patch });
  await expect(f.client.read('/chat/history')).rejects.toThrow('invalid');
});
test('local login requires Access, valid credentials, server csrf and a validated session cookie', async () => {
  const f = fixture();
  await expect(f.client.localLogin('owner', 'pw', '123456')).rejects.toThrow(
    'credentials',
  );
  await f.client.accessLogin();
  await expect(f.client.localLogin('owner', 'pw', 'bad')).rejects.toThrow(
    'credentials',
  );
  f.io.request.mockResolvedValueOnce(response({}, 403));
  await expect(f.client.localLogin('owner', 'pw', '123456')).rejects.toThrow(
    'credentials',
  );
  for (const result of [
    response(info),
    { ...response({ ...info, csrf_token: 'bad' }), sessionToken: local },
    {
      ...response({ ...info, features: { bad: 'true' } }),
      sessionToken: local,
    },
  ]) {
    f.io.request.mockResolvedValueOnce(result);
    await expect(f.client.localLogin('owner', 'pw', '123456')).rejects.toThrow(
      'invalid',
    );
  }
});
test('Access login retries transient polling, rejects redirects, and can be cancelled', async () => {
  const f = fixture();
  f.io.request
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response({}, 404));
  await f.client.accessLogin();
  expect(f.io.pause).toHaveBeenCalledTimes(2);
  f.io.request.mockResolvedValueOnce(response({}, 302));
  await expect(f.client.accessLogin()).rejects.toThrow('unavailable');
  let finish!: (r: HTTPResult) => void;
  f.io.request.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = f.client.accessLogin();
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
  await f.client.logout();
  finish({ ...response({}), ...transfer() });
  await expect(pending).rejects.toThrow('cancelled');
});
test('invalid transfer, unhealthy origin and bad randomness cannot establish Access', async () => {
  const f = fixture();
  f.io.randomBytes.mockResolvedValueOnce('');
  await expect(f.client.accessLogin()).rejects.toThrow('invalid');
  f.io.request.mockResolvedValueOnce(response({}));
  await expect(f.client.accessLogin()).rejects.toThrow('invalid');
  f.io.request
    .mockResolvedValueOnce({ ...response({}), ...transfer() })
    .mockResolvedValueOnce(response({ status: 'wrong' }));
  await expect(f.client.accessLogin()).rejects.toThrow('invalid');
  f.io.randomBytes.mockResolvedValueOnce('');
  await expect(f.client.newRequestId()).rejects.toThrow('invalid');
});
test('transfer claims and encrypted data reject foreign or malformed input', () => {
  expect(tokenExpiry(access, now)).toBe(claims.exp * 1000);
  for (const value of [null, [], 1]) {
    expect(() => object(value)).toThrow('invalid');
  }
  for (const token of [
    'bad',
    jwt({ ...claims, iss: 'foreign' }),
    jwt({ ...claims, aud: 'foreign' }),
    jwt({ ...claims, exp: now / 1000 }),
    jwt({ ...claims, exp: 'forever' }),
  ]) {
    expect(() => tokenExpiry(token, now)).toThrow('expired');
  }
  const t = transfer();
  expect(
    decryptTransfer(t.body, t.serviceKey, decodeBase64(encodeBase64(seed))),
  ).toBe(access);
  expect(() => decryptTransfer('x'.repeat(65537), '', seed)).toThrow('invalid');
  expect(() => decryptTransfer(t.body, 'bad', seed)).toThrow('invalid');
  expect(() =>
    decryptTransfer(t.body, t.serviceKey, new Uint8Array(32)),
  ).toThrow('invalid');
});
