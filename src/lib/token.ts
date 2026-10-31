import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** A new token for a personal parent link: 32 random bytes, URL-safe. */
export function newAccessToken() {
  return randomBytes(32).toString('base64url');
}

/** What the database stores instead of the token itself. */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// "Link verloren?" mails the existing link again, so it is also stored encrypted (AES-256-GCM).
// The key (LINK_KEY, 32 random bytes base64url) lives only in the Vercel environment: a database
// leak alone still reveals no working links. Without a key nothing is sealed.

function linkKey(key: string) {
  const bytes = Buffer.from(key, 'base64url');
  if (bytes.length !== 32) throw new Error('LINK_KEY must be 32 bytes, base64url');
  return bytes;
}

/** The token encrypted for the database: "<iv>.<tag>.<ciphertext>", or null without a key. */
export function sealToken(token: string, key: string | undefined) {
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', linkKey(key), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
}

/** The token back from sealToken; undefined if it can't be read (e.g. the key was changed). */
export function openToken(sealed: string, key: string | undefined) {
  if (!key) return undefined;
  const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  try {
    const decipher = createDecipheriv('aes-256-gcm', linkKey(key), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return undefined;
  }
}
