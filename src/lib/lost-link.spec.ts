import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';
import { linksToMail, lostLinkMail, rememberLink } from './lost-link.ts';
import { findGuardianByToken } from './season.ts';
import { hashToken, openToken, sealToken } from './token.ts';

const KEY = randomBytes(32).toString('base64url');
const NOW = new Date('2027-04-01T10:00:00Z');

describe('sealToken / openToken', () => {
  it('gets the token back with the same key only', () => {
    const sealed = sealToken('secret-token', KEY);
    expect(sealed).not.toContain('secret-token');
    expect(openToken(sealed!, KEY)).toBe('secret-token');
    expect(openToken(sealed!, randomBytes(32).toString('base64url'))).toBeUndefined();
  });

  it('seals nothing without a key', () => {
    expect(sealToken('secret-token', undefined)).toBeNull();
  });
});

describe('linksToMail', () => {
  let db: Db;
  let close: () => Promise<void>;
  let guardian: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    guardian = await insert(db, 'guardian', {
      name: 'Familie Müller',
      email: 'Mueller@Example.org',
      access_token_hash: hashToken('old-token'),
    });
  });
  afterEach(() => close());

  it('mails the stored link unchanged, matching the address in any case', async () => {
    await rememberLink(db, 'guardian', guardian, 'old-token', KEY);
    const links = await linksToMail(db, 'mueller@example.ORG', KEY, NOW);
    expect(links).toEqual([{ owner: 'guardian', name: 'Familie Müller', token: 'old-token' }]);
    expect(await findGuardianByToken(db, 'old-token')).toBeDefined();
  });

  it('makes a new link if the old one was never stored', async () => {
    const [link] = await linksToMail(db, 'mueller@example.org', KEY, NOW);
    expect(link.token).not.toBe('old-token');
    expect(await findGuardianByToken(db, link.token)).toBeDefined();
    expect(await findGuardianByToken(db, 'old-token')).toBeUndefined();
    // …and stores the new one, so the next request sends the same link
    const later = new Date(NOW.getTime() + 60 * 60_000);
    expect((await linksToMail(db, 'mueller@example.org', KEY, later))[0].token).toBe(link.token);
  });

  it('sends at most one mail per person in 10 minutes', async () => {
    await rememberLink(db, 'guardian', guardian, 'old-token', KEY);
    expect(await linksToMail(db, 'mueller@example.org', KEY, NOW)).toHaveLength(1);
    const soon = new Date(NOW.getTime() + 5 * 60_000);
    expect(await linksToMail(db, 'mueller@example.org', KEY, soon)).toEqual([]);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect(await linksToMail(db, 'mueller@example.org', KEY, later)).toHaveLength(1);
  });

  it('finds coaches too, and nobody for an unknown address', async () => {
    await insert(db, 'coach', {
      name: 'Martin',
      email: 'mueller@example.org',
      access_token_hash: hashToken('coach-token'),
    });
    const links = await linksToMail(db, 'mueller@example.org', KEY, NOW);
    expect(links.map((l) => l.owner)).toEqual(['guardian', 'coach']);
    expect(await linksToMail(db, 'someone@example.org', KEY, NOW)).toEqual([]);
  });
});

describe('lostLinkMail', () => {
  it('greets the family and contains the link', () => {
    const mail = lostLinkMail(
      [{ owner: 'guardian', name: 'Familie Müller', token: 'abc' }],
      'https://team.bretten-kangaroos.net',
    );
    expect(mail.subject).toBe('Dein Link zum Teamplaner');
    expect(mail.text).toContain('Hallo Familie Müller,');
    expect(mail.text).toContain('https://team.bretten-kangaroos.net/f/abc');
    expect(mail.html).toContain('href="https://team.bretten-kangaroos.net/f/abc"');
  });

  it('labels several links and escapes names in the HTML', () => {
    const mail = lostLinkMail(
      [
        { owner: 'guardian', name: 'Familie <Müller>', token: 'abc' },
        { owner: 'coach', name: 'Martin', token: 'xyz' },
      ],
      'https://team.bretten-kangaroos.net',
    );
    expect(mail.subject).toBe('Deine Links zum Teamplaner');
    expect(mail.text).toContain(
      'Trainerbereich (Martin):\nhttps://team.bretten-kangaroos.net/t/xyz',
    );
    expect(mail.html).toContain('Familie &lt;Müller&gt;');
  });
});
