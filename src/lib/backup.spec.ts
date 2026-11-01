import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportData, restoreData } from './backup.ts';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const team = await insert(db, 'team', { name: 'Schüler', season: 2027 });
  const ella = await insert(db, 'player', {
    first_name: 'Ella',
    last_name_initial: 'M',
    birth_year: 2015,
  });
  await insert(db, 'team_member', { team_id: team, player_id: ella });
  const mother = await insert(db, 'guardian', {
    name: 'Anna Müller',
    email: 'anna@example.org',
    access_token_hash: 'hash',
  });
  await insert(db, 'guardianship', { guardian_id: mother, player_id: ella });
  const game = await insert(db, 'event', {
    team_id: team,
    type: 'game',
    title: 'vs. Karlsruhe',
    starts_at: '2027-04-17T11:00:00Z',
    min_players: 9,
  });
  await insert(db, 'response', {
    event_id: game,
    player_id: ella,
    status: 'in',
    responded_by: 'claude',
  });
});

afterEach(() => close());

describe('exportData', () => {
  it('exports every table', async () => {
    const backup = await exportData(db, new Date('2027-04-04T03:00:00Z'));
    expect(backup.createdAt).toBe('2027-04-04T03:00:00.000Z');
    expect(backup.tables.player).toEqual([expect.objectContaining({ first_name: 'Ella' })]);
    expect(backup.tables.response).toHaveLength(1);
    expect(backup.tables.coach).toEqual([]);
  });
});

describe('restoreData', () => {
  it('restores into an empty database with the same data', async () => {
    const backup = await exportData(db);
    const target = await createTestDb();
    try {
      const counts = await restoreData(target.db, backup);
      expect(counts).toMatchObject({ player: 1, response: 1, guardianship: 1 });
      // Through a JSON file, as in real life
      const again = await exportData(target.db, new Date(backup.createdAt));
      expect(again).toEqual(JSON.parse(JSON.stringify(backup)));
    } finally {
      await target.close();
    }
  });

  it('refuses a database that already has data', async () => {
    const backup = await exportData(db);
    await expect(restoreData(db, backup)).rejects.toThrow(/not empty/);
  });

  it('refuses a backup of another schema', async () => {
    const backup = { ...(await exportData(db)), migrations: ['0001_initial.sql'] };
    const target = await createTestDb();
    try {
      await expect(restoreData(target.db, backup)).rejects.toThrow(/Schema differs/);
    } finally {
      await target.close();
    }
  });
});
