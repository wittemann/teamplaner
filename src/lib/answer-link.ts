// Answering straight from the reminder mail (docs/tech.md, "Direkt aus der Mail antworten"): every
// button is a link /antwort/<token> for one parent, child, game and answer. The token is signed
// (HMAC with LINK_KEY) instead of stored, and the signature covers the parent's current personal
// link – a new link (e.g. after it was passed on) also ends the buttons in old mails.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from './db/client.ts';
import type { Status } from './season.ts';

export type Answer = { guardianId: string; playerId: string; eventId: string; status: Status };

const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ''), 'hex');

function uuidFrom(bytes: Buffer) {
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function signature(payload: Buffer, accessTokenHash: string, key: string) {
  return createHmac('sha256', key)
    .update('answer:')
    .update(accessTokenHash)
    .update(payload)
    .digest()
    .subarray(0, 16);
}

/** "<payload>.<signature>", about 90 characters. */
export function answerToken(answer: Answer, accessTokenHash: string, key: string) {
  const payload = Buffer.concat([
    uuidBytes(answer.guardianId),
    uuidBytes(answer.playerId),
    uuidBytes(answer.eventId),
    Buffer.from(answer.status === 'in' ? 'i' : 'o'),
  ]);
  return `${payload.toString('base64url')}.${signature(payload, accessTokenHash, key).toString('base64url')}`;
}

function parse(token: string) {
  const [payloadText, signatureText] = token.split('.');
  if (!payloadText || !signatureText) return undefined;
  const payload = Buffer.from(payloadText, 'base64url');
  const status = payload.subarray(48).toString();
  if (payload.length !== 49 || (status !== 'i' && status !== 'o')) return undefined;
  return {
    payload,
    signature: Buffer.from(signatureText, 'base64url'),
    answer: {
      guardianId: uuidFrom(payload.subarray(0, 16)),
      playerId: uuidFrom(payload.subarray(16, 32)),
      eventId: uuidFrom(payload.subarray(32, 48)),
      status: status === 'i' ? 'in' : 'out',
    } satisfies Answer,
  };
}

export type AnswerTarget = Answer & {
  firstName: string;
  title: string;
  startsAt: string;
  /** The answer saved now, if any */
  current: Status | null;
};

/** What a button link stands for, if its signature is valid and the child is still this parent's. */
export async function readAnswerToken(db: Db, token: string, key: string | undefined) {
  const parsed = parse(token);
  if (!parsed || !key) return undefined;
  const [row] = await db.query<{
    access_token_hash: string;
    first_name: string;
    title: string;
    starts_at: Date;
    status: Status | null;
  }>(
    `SELECT g.access_token_hash, p.first_name, e.title, e.starts_at, r.status
       FROM guardian g
       JOIN guardianship gs ON gs.guardian_id = g.id AND gs.player_id = $2
       JOIN player p ON p.id = gs.player_id
       JOIN event e ON e.id = $3
       LEFT JOIN response r ON r.event_id = e.id AND r.player_id = p.id
      WHERE g.id = $1`,
    [parsed.answer.guardianId, parsed.answer.playerId, parsed.answer.eventId],
  );
  if (!row) return undefined;
  const expected = signature(parsed.payload, row.access_token_hash, key);
  if (expected.length !== parsed.signature.length || !timingSafeEqual(expected, parsed.signature))
    return undefined;
  return {
    ...parsed.answer,
    firstName: row.first_name,
    title: row.title,
    startsAt: new Date(row.starts_at).toISOString(),
    current: row.status,
  } satisfies AnswerTarget;
}
