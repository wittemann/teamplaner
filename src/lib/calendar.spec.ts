import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  calendarToken,
  findGuardianByCalendarToken,
  loadCalendar,
  rememberCalendarToken,
  toICal,
} from './calendar.ts';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';

let db: Db;
let close: () => Promise<void>;
let guardian: string;
let teamId: string;
const kids: Record<string, string> = {};

async function event(title: string, type: string, extra: Record<string, unknown> = {}) {
  return insert(db, 'event', {
    team_id: teamId,
    type,
    title,
    starts_at: '2027-05-22T09:00:00Z',
    ...extra,
  });
}

async function answer(eventId: string, child: string, status: 'in' | 'out') {
  await db.query(
    `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, $3, 'x')`,
    [eventId, kids[child], status],
  );
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
  guardian = await insert(db, 'guardian', {
    name: 'M',
    email: 'm@example.org',
    access_token_hash: 'a',
  });
  for (const name of ['Ella', 'Ben']) {
    kids[name] = await insert(db, 'player', {
      first_name: name,
      last_name_initial: 'M',
      birth_year: 2015,
    });
    await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [
      teamId,
      kids[name],
    ]);
    await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2)', [
      guardian,
      kids[name],
    ]);
  }
});
afterEach(() => close());

describe('calendar', () => {
  it('finds the family by the token derived from its link, until the link changes', async () => {
    await rememberCalendarToken(db, guardian, 'link-1');
    expect((await findGuardianByCalendarToken(db, calendarToken('link-1')))?.id).toBe(guardian);
    await rememberCalendarToken(db, guardian, 'link-2');
    expect(await findGuardianByCalendarToken(db, calendarToken('link-1'))).toBeUndefined();
  });

  it('lists games with a yes and trainings without opt-out, siblings merged', async () => {
    const game = await event('Spiel', 'game');
    const open = await event('Offen', 'game');
    const training = await event('Training', 'training');
    await answer(game, 'Ella', 'in');
    await answer(game, 'Ben', 'in');
    await answer(open, 'Ella', 'out');
    await answer(training, 'Ben', 'out');
    const events = await loadCalendar(db, guardian, new Date('2027-01-01'));
    expect(events.map((e) => [e.title, e.children.toSorted()])).toEqual([
      ['Spiel', ['Ben', 'Ella']],
      ['Training', ['Ella']],
    ]);
  });

  it('writes valid iCal: escaped, folded, cancelled events marked', async () => {
    const game = await event(
      'Spiel gegen Mannheim, Bruchsal; und eine sehr lange Beschreibung',
      'game',
      {
        meet_at: '2027-05-22T08:15:00Z',
        cancelled: true,
        cancel_reason: 'Platz gesperrt',
      },
    );
    await answer(game, 'Ella', 'in');
    const ics = toICal(
      await loadCalendar(db, guardian, new Date('2027-01-01')),
      'https://team.example',
    );
    expect(ics).toContain('DTSTART:20270522T081500Z');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SUMMARY:Abgesagt: Spiel gegen Mannheim\\, Bruchsal\\; und');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
    expect(ics).toContain('Treffpunkt 10:15\\, Beginn 11:00');
  });
});
