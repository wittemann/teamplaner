import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';
import {
  playersWithoutPush,
  pushCancelled,
  pushCoachNote,
  saveSubscription,
  type Subscription,
} from './push.ts';

const device = (name: string) =>
  ({
    endpoint: `https://push.example/${name}`,
    keys: { p256dh: 'p', auth: 'a' },
  }) satisfies Subscription;

describe('push', () => {
  let db: Db;
  let close: () => Promise<void>;
  let teamId: string;
  let ella: string;
  let noah: string;
  let anna: string;
  let ben: string;
  let sent: string[];
  const send = async (subscription: Subscription) => {
    sent.push(subscription.endpoint);
  };

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    sent = [];
    teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
    ella = await insert(db, 'player', {
      first_name: 'Ella',
      last_name_initial: 'M',
      birth_year: 2016,
    });
    noah = await insert(db, 'player', {
      first_name: 'Noah',
      last_name_initial: 'K',
      birth_year: 2016,
    });
    anna = await insert(db, 'guardian', {
      name: 'Anna',
      email: 'a@example.org',
      access_token_hash: 'a',
    });
    ben = await insert(db, 'guardian', {
      name: 'Ben',
      email: 'b@example.org',
      access_token_hash: 'b',
    });
    await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2), ($3, $4)', [
      anna,
      ella,
      ben,
      noah,
    ]);
    await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2), ($1, $3)', [
      teamId,
      ella,
      noah,
    ]);
    await saveSubscription(db, { guardianId: anna }, device('anna'), null);
    await saveSubscription(db, { guardianId: ben }, device('ben'), null);
  });
  afterEach(() => close());

  async function event(type: string, cancelled = false) {
    const startsAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const id = await insert(db, 'event', {
      team_id: teamId,
      type,
      title: 'vs. Karlsruhe',
      starts_at: startsAt,
      cancelled,
    });
    return { id, title: 'vs. Karlsruhe', startsAt };
  }

  it('sends a game note to families who said yes only', async () => {
    const game = await event('game');
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'in', 'x')`,
      [game.id, ella],
    );
    expect(await pushCoachNote(db, game, 'Weiße Hosen', 'Sa 17.05.', send)).toMatchObject({
      reached: 1,
      missed: 0,
    });
    expect(sent).toEqual(['https://push.example/anna']);
  });

  it('sends a training note to everyone who did not opt out', async () => {
    const training = await event('training');
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'out', 'x')`,
      [training.id, noah],
    );
    await pushCoachNote(db, training, 'Halle statt Platz', 'Di 13.05.', send);
    expect(sent).toEqual(['https://push.example/anna']);
  });

  it('sends nothing for a cancelled event', async () => {
    await pushCoachNote(db, await event('training', true), 'x', 'x', send);
    expect(sent).toEqual([]);
  });

  it('tells the families taking part that a training is cancelled', async () => {
    const training = await event('training', true);
    const result = await pushCancelled(
      db,
      { ...training, cancelled: true },
      'Platz gesperrt',
      'Di 13.05.',
      async (subscription, payload) => {
        sent.push(subscription.endpoint);
        expect(JSON.parse(payload)).toMatchObject({
          title: 'Fällt aus: vs. Karlsruhe (Di 13.05.)',
          body: 'Platz gesperrt',
        });
      },
    );
    expect(result).toMatchObject({ reached: 2, missed: 0 });
  });

  it('moves a device to the family that signs up on it last', async () => {
    await saveSubscription(db, { guardianId: ben }, device('anna'), null);
    // Anna's only device is Ben's now, Ben has two
    expect(await playersWithoutPush(db, teamId)).toEqual(new Set([ella]));
    expect(
      await db.query('SELECT 1 FROM push_subscription WHERE guardian_id = $1', [ben]),
    ).toHaveLength(2);
  });

  it('keeps a coach and a family on the same device apart', async () => {
    const coach = await insert(db, 'coach', {
      name: 'Tom',
      email: 't@example.org',
      access_token_hash: 't',
    });
    await saveSubscription(db, { coachId: coach }, device('anna'), null);
    expect(await playersWithoutPush(db, teamId)).toEqual(new Set());
  });
});
