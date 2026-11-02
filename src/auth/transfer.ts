import nacl from 'tweetnacl';
import { decodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { SessionError } from './types';
export const ORIGIN = 'https://radhouse.sati.sh';
export const ISSUER = 'https://satishsurath.cloudflareaccess.com';
export const AUDIENCE =
  '32606a7cb38e9e8e9927b87629919207a5fc15acbbf2cf5f07db2523f30cb01f';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SessionError('invalid');
  }
  return value as Record<string, unknown>;
}
export function decodeURLBase64(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  return decodeBase64(
    normalized + '='.repeat((4 - (normalized.length % 4)) % 4),
  );
}
export function tokenExpiry(token: string, now: number): number {
  try {
    if (token.length > 16384 || token.split('.').length !== 3) {
      throw new Error('Malformed application token');
    }
    const claims = object(
      JSON.parse(encodeUTF8(decodeURLBase64(token.split('.')[1]))),
    );
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== ISSUER ||
      !audiences.includes(AUDIENCE) ||
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp) ||
      claims.exp * 1000 <= now + 30000
    ) {
      throw new Error('Application token claims do not match');
    }
    // These checks bind the transfer. The gateway verifies the signature and owner.
    return claims.exp * 1000;
  } catch {
    throw new SessionError('expired');
  }
}
export function decryptTransfer(
  body: string,
  serviceKey: string,
  secret: Uint8Array,
): string {
  try {
    if (body.length > 65536) {
      throw new Error('Encrypted transfer exceeds the size limit');
    }
    const encrypted = decodeBase64(body);
    const sender = decodeURLBase64(serviceKey);
    if (sender.length !== 32 || encrypted.length < 40) {
      throw new Error('Malformed encrypted transfer');
    }
    const plain = nacl.box.open(
      encrypted.slice(24),
      encrypted.slice(0, 24),
      sender,
      secret,
    );
    if (!plain) {
      throw new Error('Encrypted transfer authentication failed');
    }
    try {
      const response = object(JSON.parse(encodeUTF8(plain)));
      if (typeof response.app_token !== 'string') {
        throw new TypeError('Application token must be a string');
      }
      return response.app_token; // Organization SSO token is deliberately discarded.
    } finally {
      plain.fill(0);
    }
  } catch {
    throw new SessionError('invalid');
  }
}
