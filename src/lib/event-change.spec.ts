import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAnswerToken } from './answer-link.ts';
import { eventDetail, type CoachEvent } from './coach.ts';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';
import {
  confirmedFamilies,
  isMoved,
  movedMail,
  notifyEventChange,
  notifyMoved,
} from './event-change.ts';
import { saveSubscription } from './push.ts';
import type { Mail } from './mail.ts';
import { hashToken, sealToken } from './token.ts';

const KEY = randomBytes(32).toString('base64url');
const NOW = new Date('2027-04-01T10:00:00Z');
const ORIGIN = 'https://team.bretten-kangaroos.net';

const game = {
  type: 'game',
  startsAt: '2027-05-08T09:00:00.000Z',
  meetAt: '2027-05-08T07:30:00.000Z',
  locationName: 'Ballpark',
  cancelled: false,
} satisfies Partial<CoachEvent>;

describe('isMoved', () => {
  it('is true when day, time, meeting time or place change', () => {
    expect(isMoved(game, { ...game }, NOW)).toBe(false);
    expect(isMoved(game, { ...game, startsAt: '2027-05-15T09:00:00.000Z' }, NOW)).toBe(true);
    expect(isMoved(game, { ...game, meetAt: null }, NOW)).toBe(true);
    expect(isMoved(game, { ...game, locationName: 'Mannheim' }, NOW)).toBe(true);
  });

  it('ignores trainings, cancelled and past games', () => {
    const later = { startsAt: '2027-05-15T09:00:00.000Z' };
    expect(isMoved(game, { ...game, ...later, type: 'training' }, NOW)).toBe(false);
    expect(isMoved(game, { ...game, ...later, cancelled: true }, NOW)).toBe(false);
    expect(isMoved(game, { ...game, ...later }, new Date('2027-06-01T00:00:00Z'))).toBe(false);
  });
});

describe('notifyMoved', () => {
  let db: Db;
  let close: () => Promise<void>;
  let eventId: string;
  let ella: string;
  let anna: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
    ella = await insert(db, 'player', {
      first_name: 'Ella',
      last_name_initial: 'M',
      birth_year: 2016,
    });
    const tim = await insert(db, 'player', {
      first_name: 'Tim',
      last_name_initial: 'B',
      birth_year: 2016,
    });
    anna = await insert(db, 'guardian', {
      name: 'Anna Müller',
      email: 'anna@example.org',
      access_token_hash: hashToken('anna-token'),
      access_token_sealed: sealToken('anna-token', KEY),
    });
    const bernd = await insert(db, 'guardian', {
      name: 'Bernd Müller',
      email: 'bernd@example.org',
      access_token_hash: hashToken('bernd-token'),
    });
    const braun = await insert(db, 'guardian', {
      name: 'Familie Braun',
      email: 'braun@example.org',
      access_token_hash: hashToken('braun-token'),
    });
    for (const [player, guardian] of [
      [ella, anna],
      [ella, bernd],
      [tim, braun],
    ]) {
      await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2)', [
        guardian,
        player,
      ]);
    }
    for (const player of [ella, tim]) {
      await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [
        teamId,
        player,
      ]);
    }
    eventId = await insert(db, 'event', {
      team_id: teamId,
      type: 'game',
      title: 'vs. Karlsruhe',
      starts_at: '2027-05-15T09:00:00Z',
      meet_at: '2027-05-15T07:30:00Z',
      location_name: 'Ballpark',
    });
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by)
       VALUES ($1, $2, 'in', 'x'), ($1, $3, 'out', 'x')`,
      [eventId, ella, tim],
    );
  });
  afterEach(() => close());

  it('tells both parents of children who said yes, nobody else', async () => {
    const families = await confirmedFamilies(db, eventId);
    expect(families.map((f) => f.name)).toEqual(['Anna Müller', 'Bernd Müller']);
    const mails: Mail[] = [];
    const event = (await eventDetail(db, eventId))!.event;
    const result = await notifyMoved(db, event, 'Schüler', {
      origin: ORIGIN,
      key: KEY,
      send: async (mail) => {
        mails.push(mail);
      },
    });
    expect(result).toEqual({ pushed: 0, missed: 2, sent: 2, failed: 0 });
    expect(mails.map((m) => m.to)).toEqual(['anna@example.org', 'bernd@example.org']);
  });

  describe('notifyEventChange', () => {
    const notify = async (change: Partial<CoachEvent>) => {
      const before = (await eventDetail(db, eventId))!.event;
      const mails: Mail[] = [];
      const pushes: { title: string; body: string }[] = [];
      await saveSubscription(
        db,
        { guardianId: anna },
        { endpoint: 'https://push.example/anna', keys: { p256dh: 'p', auth: 'a' } },
        null,
      );
      const result = await notifyEventChange(
        db,
        before,
        { ...before, ...change },
        {
          origin: ORIGIN,
          key: KEY,
          send: async (mail) => {
            mails.push(mail);
          },
          push: async (_, payload) => {
            pushes.push(JSON.parse(payload));
          },
        },
      );
      return { result, mails, pushes };
    };

    it('says nothing when only other fields change', async () => {
      const { result, mails, pushes } = await notify({ minPlayers: 10 });
      expect(result).toEqual({ pushed: 0, missed: 0, mailed: 0, failed: 0 });
      expect(mails).toEqual([]);
      expect(pushes).toEqual([]);
    });

    it('pushes a cancellation with its reason, no mail', async () => {
      const { result, mails, pushes } = await notify({ cancelled: true, cancelReason: 'Regen' });
      expect(pushes).toEqual([expect.objectContaining({ body: 'Regen' })]);
      expect(pushes[0].title).toContain('Fällt aus: vs. Karlsruhe');
      expect(mails).toEqual([]);
      expect(result).toEqual({ pushed: 1, missed: 1, mailed: 0, failed: 0 });
    });

    it('pushes a move, and mails the parent no push reached', async () => {
      const { result, mails, pushes } = await notify({ startsAt: '2099-05-22T09:00:00.000Z' });
      expect(pushes[0].title).toBe('Geändert: vs. Karlsruhe');
      expect(mails.map((m) => m.to)).toEqual(['bernd@example.org']);
      expect(mails[0].html).toContain('Schüler');
      expect(result).toEqual({ pushed: 1, missed: 1, mailed: 1, failed: 0 });
    });

    it('pushes a new note, not an unchanged one', async () => {
      const { pushes } = await notify({ coachNote: 'Weiße Trikots' });
      expect(pushes).toEqual([expect.objectContaining({ body: 'Weiße Trikots' })]);
    });

    it('pushes no note on a cancelled event', async () => {
      const { pushes } = await notify({ cancelled: true, coachNote: 'Weiße Trikots' });
      expect(pushes).toHaveLength(1);
      expect(pushes[0].title).toContain('Fällt aus');
    });
  });

  it('writes the new plan and buttons that work', async () => {
    const [family] = await confirmedFamilies(db, eventId);
    const event = (await eventDetail(db, eventId))!.event;
    const mail = movedMail(family, event, 'Schüler', ORIGIN, KEY);
    expect(mail.subject).toBe('Geändert: vs. Karlsruhe – bitte prüfen');
    expect(mail.text).toContain(
      'Samstag, 15. Mai 2027 · Treffpunkt 9:30 · Beginn 11:00 · Ballpark',
    );
    expect(mail.text).toContain('Ella hat zugesagt – passt es noch?');
    expect(mail.text).toContain(`${ORIGIN}/f/anna-token`);
    const no = mail.text.match(/Nein, nicht mehr dabei: \S+\/antwort\/(\S+)/)![1];
    expect(await readAnswerToken(db, no, KEY)).toMatchObject({
      guardianId: anna,
      playerId: ella,
      status: 'out',
      current: 'in',
    });
  });

  it('counts failed mails without stopping', async () => {
    const event = (await eventDetail(db, eventId))!.event;
    const result = await notifyMoved(db, event, 'Schüler', {
      origin: ORIGIN,
      key: KEY,
      send: async () => {
        throw Object.assign(new Error('nope'), { code: 'EAUTH' });
      },
    });
    expect(result).toEqual({ pushed: 0, missed: 2, sent: 0, failed: 2 });
  });

  it('pushes first and mails only the parents the push did not reach', async () => {
    await saveSubscription(
      db,
      { guardianId: anna },
      { endpoint: 'https://push.example/anna', keys: { p256dh: 'p', auth: 'a' } },
      null,
    );
    const mails: Mail[] = [];
    const payloads: string[] = [];
    const event = (await eventDetail(db, eventId))!.event;
    const result = await notifyMoved(db, event, 'Schüler', {
      origin: ORIGIN,
      key: KEY,
      send: async (mail) => {
        mails.push(mail);
      },
      push: async (_, payload) => {
        payloads.push(payload);
      },
    });
    expect(result).toEqual({ pushed: 1, missed: 1, sent: 1, failed: 0 });
    expect(mails.map((m) => m.to)).toEqual(['bernd@example.org']);
    expect(JSON.parse(payloads[0]).title).toBe('Geändert: vs. Karlsruhe');
  });
});
