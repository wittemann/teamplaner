import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addAbsence, applyAbsencesToEvents, listAbsences, removeAbsence } from './absence.ts';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';

const NOW = new Date('2027-04-01T10:00:00Z');

let db: Db;
let close: () => Promise<void>;
let teamId: string;
let ella: string;
let guardian: string;
let other: string;

async function event(startsAt: string, type = 'game') {
  return insert(db, 'event', { team_id: teamId, type, title: type, starts_at: startsAt });
}

async function statuses() {
  return db.query<{ title: string; starts_at: Date; status: string; responded_by: string }>(
    `SELECT e.starts_at, r.status, r.responded_by FROM response r JOIN event e ON e.id = r.event_id
      WHERE r.player_id = $1 ORDER BY e.starts_at`,
    [ella],
  );
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
  ella = await insert(db, 'player', {
    first_name: 'Ella',
    last_name_initial: 'M',
    birth_year: 2015,
  });
  await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [teamId, ella]);
  guardian = await insert(db, 'guardian', {
    name: 'Müller',
    email: 'm@example.org',
    access_token_hash: 'a',
  });
  other = await insert(db, 'guardian', {
    name: 'Other',
    email: 'o@example.org',
    access_token_hash: 'b',
  });
  await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2)', [
    guardian,
    ella,
  ]);
});
afterEach(() => close());

describe('absence', () => {
  it('sets "out" for events on the days of the period, in Berlin time', async () => {
    await event('2027-05-21T22:30:00Z'); // Sat 22.05. 00:30 in Berlin → inside
    await event('2027-05-29T10:00:00Z', 'training'); // last day → inside
    await event('2027-05-30T09:00:00Z'); // after → outside
    const { changed } = await addAbsence(
      db,
      guardian,
      { playerIds: [ella], from: '2027-05-22', to: '2027-05-29' },
      NOW,
    );
    expect(changed).toHaveLength(2);
    expect((await statuses()).map((r) => r.status)).toEqual(['out', 'out']);
  });

  it('overrides an earlier yes and takes it back when removed', async () => {
    const game = await event('2027-05-22T09:00:00Z');
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'in', 'x')`,
      [game, ella],
    );
    const { absences } = await addAbsence(
      db,
      guardian,
      { playerIds: [ella], from: '2027-05-22', to: '2027-05-22' },
      NOW,
    );
    expect((await statuses())[0].status).toBe('out');
    expect(await removeAbsence(db, guardian, absences[0].id)).toHaveLength(1);
    expect(await statuses()).toEqual([]);
  });

  it("ignores other families' children and absences", async () => {
    await event('2027-05-22T09:00:00Z');
    const result = await addAbsence(
      db,
      other,
      { playerIds: [ella], from: '2027-05-22', to: '2027-05-22' },
      NOW,
    );
    expect(result.absences).toEqual([]);
    const { absences } = await addAbsence(
      db,
      guardian,
      { playerIds: [ella], from: '2027-05-22', to: '2027-05-22' },
      NOW,
    );
    expect(await removeAbsence(db, other, absences[0].id)).toBeUndefined();
    expect(await listAbsences(db, guardian, '2027-05-01')).toHaveLength(1);
  });

  it('gives new events "out" when an absence covers them', async () => {
    await addAbsence(
      db,
      guardian,
      { playerIds: [ella], from: '2027-06-01', to: '2027-06-10' },
      NOW,
    );
    const game = await event('2027-06-05T09:00:00Z');
    await applyAbsencesToEvents(db, [game]);
    expect((await statuses()).map((r) => r.status)).toEqual(['out']);
  });
});
