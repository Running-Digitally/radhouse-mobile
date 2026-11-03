import nacl from 'tweetnacl';
import type { Selection } from '../chat/inference';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import {
  AUDIENCE,
  ORIGIN,
  decryptTransfer,
  object,
  tokenExpiry,
} from './transfer';
import {
  Credentials,
  HTTPResult,
  SessionError,
  SessionInfo,
  SessionIO,
} from './types';
import type { PushRegistration } from '../notifications/nativePush';

const localToken = /^[A-Za-z0-9_-]{40,200}$/;
const inferenceRejections: Record<string, number> = {
  inference_selection_invalid: 422,
  inference_catalog_unavailable: 503,
  inference_model_unavailable: 409,
  inference_thinking_unavailable: 409,
};
const readablePaths = new Set([
  '/auth/session',
  '/chat/history',
  '/chat/reply',
  '/chat/inference',
  '/chat/inference?refresh=true',
  '/chat/library',
  '/chat/agent-profile',
]);
function inferenceAdmissionRejected(result: HTTPResult): boolean {
  if (
    !result.contentType.toLowerCase().startsWith('application/json') ||
    result.body.length > 4096
  ) {
    return false;
  }
  try {
    const code = object(JSON.parse(result.body)).error;
    return (
      typeof code === 'string' &&
      Object.hasOwn(inferenceRejections, code) &&
      inferenceRejections[code] === result.status
    );
  } catch {
    // An unreadable response cannot establish whether admission happened.
    return false;
  }
}
function checkHTTPStatus(result: HTTPResult, path: string, method: string) {
  if (result.status >= 300 && result.status < 400) {
    throw new SessionError('expired');
  }
  if (result.status === 401 || result.status === 403) {
    throw new SessionError(path === '/auth/login' ? 'credentials' : 'expired');
  }
  if (
    path === '/chat/messages' &&
    method === 'POST' &&
    inferenceAdmissionRejected(result)
  ) {
    throw new SessionError('conflict', true);
  }
  if (result.status === 409) {
    throw new SessionError('conflict');
  }
  if (result.status === 404 && path.startsWith('/chat/push/')) {
    throw new SessionError('unsupported');
  }
  if (result.status < 200 || result.status >= 300) {
    throw new SessionError('unavailable');
  }
}
/** One owner session. Credentials never belong to React screen state. */
export type FollowupAction = { revision: number } & (
  | { action: 'progress'; progress: string }
  | { action: 'snooze'; days: 1 | 3 | 7 }
  | { action: 'research'; question: string }
  | { action: 'resume' | 'complete' | 'stop' }
);

export class SessionClient {
  private credentials: Credentials = { access: '', local: '' };
  private csrf = '';
  private epoch = 0;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly io: SessionIO) {}
  private current(epoch: number) {
    if (epoch !== this.epoch) {
      throw new SessionError('cancelled');
    }
  }
  private persist(action: () => Promise<unknown>) {
    this.writes = this.writes.catch(() => undefined).then(action);
    return this.writes;
  }
  async logout(): Promise<void> {
    const credentials = this.credentials;
    const csrf = this.csrf;
    this.epoch++;
    this.credentials = { access: '', local: '' };
    this.csrf = '';
    // Clear local authority even if remote revocation cannot be confirmed offline.
    const cleanup = this.persist(async () => {
      try {
        await this.io.clear();
      } finally {
        await this.io.clearCookies();
      }
    });
    try {
      if (credentials.local) {
        const response = await this.io.request(
          ORIGIN + '/auth/logout',
          'POST',
          credentials.access,
          credentials.local,
          csrf,
          '',
        );
        if (response.status !== 204 && response.status !== 401) {
          throw new SessionError('unavailable');
        }
      }
    } finally {
      await cleanup;
    }
  }
  private async json(
    path: string,
    credentials: Credentials,
    method = 'GET',
    body?: object,
  ) {
    const epoch = this.epoch;
    let result;
    try {
      result = await this.io.request(
        ORIGIN + path,
        method,
        credentials.access,
        credentials.local,
        this.csrf,
        body ? JSON.stringify(body) : '',
      );
    } catch {
      this.current(epoch);
      throw new SessionError('unavailable');
    }
    this.current(epoch);
    checkHTTPStatus(result, path, method);
    if (
      !result.contentType.toLowerCase().startsWith('application/json') ||
      result.body.length > 4194304
    ) {
      throw new SessionError('invalid');
    }
    try {
      return {
        data: object(JSON.parse(result.body)),
        token: result.sessionToken,
      };
    } catch {
      throw new SessionError('invalid');
    }
  }
  private sessionInfo(data: Record<string, unknown>): SessionInfo {
    if (
      typeof data.username !== 'string' ||
      typeof data.csrf_token !== 'string' ||
      !localToken.test(data.csrf_token)
    ) {
      throw new SessionError('invalid');
    }
    const features = object(data.features);
    if (Object.values(features).some(value => typeof value !== 'boolean')) {
      throw new SessionError('invalid');
    }
    this.csrf = data.csrf_token;
    return {
      username: data.username,
      features: features as Record<string, boolean>,
    };
  }
  async restore(): Promise<SessionInfo | null> {
    const epoch = ++this.epoch;
    // Wait for an earlier logout/save before reading secure storage.
    await this.writes.catch(() => undefined);
    const raw = await this.io.load();
    this.current(epoch);
    if (!raw) {
      return null;
    }
    let credentials: Credentials;
    try {
      const saved = object(JSON.parse(raw));
      if (
        typeof saved.access !== 'string' ||
        typeof saved.local !== 'string' ||
        !localToken.test(saved.local)
      ) {
        throw new SessionError('invalid');
      }
      tokenExpiry(saved.access, this.io.now());
      credentials = { access: saved.access, local: saved.local };
    } catch {
      await this.logout();
      return null;
    }
    try {
      const result = await this.json('/auth/session', credentials);
      this.current(epoch);
      const info = this.sessionInfo(result.data);
      this.credentials = credentials;
      await this.persist(() =>
        this.io.syncCookies(credentials.access, credentials.local),
      );
      this.current(epoch);
      return info;
    } catch (error) {
      this.current(epoch);
      if (error instanceof SessionError && error.kind === 'expired') {
        await this.logout();
        return null;
      }
      throw error; // Connectivity failures preserve the saved session for retry.
    }
  }
  async accessLogin(): Promise<void> {
    await this.logout();
    const epoch = ++this.epoch;
    const seed = decodeBase64(await this.io.randomBytes());
    this.current(epoch);
    if (seed.length !== 32) {
      throw new SessionError('invalid');
    }
    const keys = nacl.box.keyPair.fromSecretKey(seed);
    seed.fill(0);
    try {
      const publicKey = encodeBase64(keys.publicKey)
        .replaceAll('+', '-')
        .replaceAll('/', '_');
      const params = `token=${encodeURIComponent(publicKey)}&aud=${AUDIENCE}`;
      const redirect = `${ORIGIN}/?${params}`;
      await this.io.openBrowser(
        `${ORIGIN}/cdn-cgi/access/cli?${params}&redirect_url=${encodeURIComponent(
          redirect,
        )}&send_org_token=true&edge_token_transfer=true`,
      );
      const deadline = this.io.now() + 600000;
      this.current(epoch);
      while (this.io.now() < deadline) {
        let result;
        try {
          result = await this.io.request(
            `https://login.cloudflareaccess.org/transfer/${publicKey}`,
            'GET',
            '',
            '',
            '',
            '',
          );
        } catch {
          this.current(epoch);
          await this.io.pause();
          continue;
        }
        this.current(epoch);
        if (result.status === 200) {
          const access = decryptTransfer(
            result.body,
            result.serviceKey,
            keys.secretKey,
          );
          tokenExpiry(access, this.io.now());
          const credentials = { access, local: '' };
          const probe = await this.json('/healthz', credentials);
          if (probe.data.status !== 'ready' || probe.data.scope !== 'web') {
            throw new SessionError('invalid');
          }
          this.current(epoch);
          this.credentials = credentials;
          return;
        }
        if (
          (result.status >= 300 && result.status < 400) ||
          result.status >= 500
        ) {
          throw new SessionError('unavailable');
        }
        await this.io.pause();
        this.current(epoch);
      }
      throw new SessionError('pending');
    } finally {
      keys.secretKey.fill(0);
    }
  }
  async localLogin(
    username: string,
    password: string,
    code: string,
  ): Promise<SessionInfo> {
    const epoch = this.epoch;
    if (
      !this.credentials.access ||
      !username.trim() ||
      !password ||
      !/^\d{6}$/.test(code)
    ) {
      throw new SessionError('credentials');
    }
    const result = await this.json('/auth/login', this.credentials, 'POST', {
      username: username.trim(),
      password,
      totp_code: code,
      remember_browser: true,
    });
    if (!localToken.test(result.token)) {
      throw new SessionError('invalid');
    }
    const info = this.sessionInfo(result.data);
    const credentials = { ...this.credentials, local: result.token };
    this.current(epoch);
    this.credentials = credentials;
    await this.persist(async () => {
      this.current(epoch);
      await this.io.save(JSON.stringify(credentials));
      this.current(epoch);
      await this.io.syncCookies(credentials.access, credentials.local);
    });
    this.current(epoch);
    return info;
  }
  async read(path: string): Promise<Record<string, unknown>> {
    if (
      !readablePaths.has(path) &&
      !/^\/chat\/history\?before=[1-9]\d{0,12}$/.test(path) &&
      !/^\/chat\/messages\/[a-f0-9-]{36}$/.test(path) &&
      !/^\/chat\/responsibilities\/commitments(?:\/[a-f0-9-]{36})?$/.test(path)
    ) {
      throw new SessionError('invalid');
    }
    if (!this.credentials.local) {
      throw new SessionError('expired');
    }
    return (await this.json(path, this.credentials)).data;
  }
  async send(
    requestId: string,
    text: string,
    inference: Selection | null = null,
  ): Promise<Record<string, unknown>> {
    if (!this.credentials.local || !this.csrf) {
      throw new SessionError('expired');
    }
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        requestId,
      ) ||
      !text.trim() ||
      text.length > 16000
    ) {
      throw new SessionError('invalid');
    }
    return (
      await this.json('/chat/messages', this.credentials, 'POST', {
        request_id: requestId,
        text,
        attachments: [],
        ...(inference ? { inference } : {}),
      })
    ).data;
  }
  async newRequestId(): Promise<string> {
    const bytes = decodeBase64(await this.io.randomBytes()).slice(0, 16);
    if (bytes.length !== 16) {
      throw new SessionError('invalid');
    }
    bytes[6] = (bytes[6] % 16) + 64;
    bytes[8] = (bytes[8] % 64) + 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(
      '',
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
      12,
      16,
    )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async pushAvailable(): Promise<boolean> {
    if (!this.credentials.local) {
      throw new SessionError('expired');
    }
    try {
      const { data } = await this.json('/chat/push/status', this.credentials);
      return data.available === true;
    } catch (error) {
      if (error instanceof SessionError && error.kind === 'unsupported') {
        return false;
      }
      throw error;
    }
  }
  async commitmentDecision(
    identifier: string,
    decision: 'confirmed' | 'dismissed' | 'confirmed_followup',
  ) {
    if (
      !/^[a-f0-9-]{36}$/.test(identifier) ||
      !['confirmed', 'dismissed', 'confirmed_followup'].includes(decision)
    )
      throw new SessionError('invalid');
    if (!this.credentials.local) throw new SessionError('expired');
    return (
      await this.json(
        '/chat/responsibilities/commitments/' + identifier,
        this.credentials,
        'POST',
        { decision },
      )
    ).data;
  }
  async commitmentFollowup(identifier: string, action: FollowupAction) {
    if (
      !/^[a-f0-9-]{36}$/.test(identifier) ||
      !Number.isInteger(action.revision) ||
      action.revision < 1 ||
      ![
        'progress',
        'snooze',
        'resume',
        'complete',
        'stop',
        'research',
      ].includes(action.action) ||
      (action.action === 'research' &&
        (typeof action.question !== 'string' || action.question.length > 300))
    ) {
      throw new SessionError('invalid');
    }
    if (!this.credentials.local) throw new SessionError('expired');
    return (
      await this.json(
        '/chat/responsibilities/commitments/' + identifier,
        this.credentials,
        'POST',
        action,
      )
    ).data;
  }
  async commitmentControl(active: boolean) {
    if (typeof active !== 'boolean') throw new SessionError('invalid');
    if (!this.credentials.local) throw new SessionError('expired');
    return (
      await this.json(
        '/chat/responsibilities/commitments',
        this.credentials,
        'POST',
        { active },
      )
    ).data;
  }
  pushRegistration(
    installation: string,
    commitments = false,
  ): PushRegistration {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        installation,
      )
    ) {
      throw new SessionError('invalid');
    }
    const epoch = this.epoch;
    const path = '/chat/push/devices/' + installation;
    const credentials = { ...this.credentials };
    const csrf = this.csrf;
    const change = async (method: string, body?: object) => {
      this.current(epoch);
      if (!this.credentials.local || !this.csrf) {
        throw new SessionError('expired');
      }
      await this.json(path, this.credentials, method, body);
    };
    return {
      register: async (token, platform) => {
        if (!/^[A-Za-z0-9_:.-]{20,4096}$/.test(token)) {
          throw new SessionError('invalid');
        }
        if (commitments) {
          const { data } = await this.json(
            '/chat/push/status',
            this.credentials,
          );
          if (data.commitments !== true) throw new SessionError('unsupported');
        }
        await change('PUT', {
          token,
          platform,
          ...(commitments ? { commitments: true } : {}),
        });
      },
      unregister: async () => {
        // Cleanup stays bound to the original session even after a new login.
        // The server also matches the stored session hash before deleting.
        const response = await this.io.request(
          ORIGIN + path,
          'DELETE',
          credentials.access,
          credentials.local,
          csrf,
          '',
        );
        if (response.status !== 200 && response.status !== 401) {
          throw new SessionError('unavailable');
        }
      },
    };
  }
}
