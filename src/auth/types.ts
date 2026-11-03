export class SessionError extends Error {
  constructor(
    public readonly kind:
      | 'expired'
      | 'cancelled'
      | 'unavailable'
      | 'invalid'
      | 'pending'
      | 'unsupported'
      | 'credentials'
      | 'conflict',
    public readonly admissionRejected = false,
  ) {
    super(kind);
  }
}
export interface HTTPResult {
  status: number;
  body: string;
  contentType: string;
  serviceKey: string;
  sessionToken: string;
}
export interface Credentials {
  access: string;
  local: string;
}
export interface SessionIO {
  request(
    url: string,
    method: string,
    access: string,
    local: string,
    csrf: string,
    body: string,
  ): Promise<HTTPResult>;
  randomBytes(): Promise<string>;
  openBrowser(url: string): Promise<unknown>;
  load(): Promise<string | null>;
  save(value: string): Promise<unknown>;
  clear(): Promise<unknown>;
  syncCookies(access: string, local: string): Promise<unknown>;
  clearCookies(): Promise<unknown>;
  now(): number;
  pause(): Promise<void>;
}
export interface SessionInfo {
  username: string;
  features: Record<string, boolean>;
}
