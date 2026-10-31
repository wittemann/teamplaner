import { createHash, randomBytes } from 'node:crypto';

/** A new token for a personal parent link: 32 random bytes, URL-safe. */
export function newAccessToken() {
  return randomBytes(32).toString('base64url');
}

/** What the database stores instead of the token itself. */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
