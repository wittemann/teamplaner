import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/client.ts';
import { createTestDb, insert } from '../db/test-db.ts';
import { deleteEvent, listEvents, updateEvent } from './data.ts';
import { Conflict, NotFound } from './route.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('events through the Admin API', () => {
  let db: Db;
  let close: () => Promise<void>;
  let teamId: string;
  let ella: string;
  let eventId: string;

  const responses = () =>
    db.query<{ status: string; responded_by: string }>(
      'SELECT status, responded_by FROM response WHERE event_id = $1',
      [eventId],
    );
  const answer = (respondedBy: string) =>
    db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'out', $3)`,
      [eventId, ella, respondedBy],
    );

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
    ella = await insert(db, 'player', {
      first_name: 'Ella',
      last_name_initial: 'M',
      birth_year: 2016,
    });
    await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [teamId, ella]);
    await insert(db, 'absence', {
      player_id: ella,
      from_date: '2027-05-20',
      to_date: '2027-05-25',
      created_by: 'claude',
    });
    eventId = await insert(db, 'event', {
      team_id: teamId,
      type: 'training',
      title: 'Training',
      starts_at: '2027-05-11T15:30:00Z',
      series_id: '11111111-1111-4111-8111-111111111111',
    });
  });
  afterEach(() => close());

  describe('updateEvent', () => {
    it('applies an absence the new day falls into', async () => {
      await updateEvent(db, eventId, { startsAt: '2027-05-21T17:30:00+02:00' });
      expect(await responses()).toEqual([
        { status: 'out', responded_by: expect.stringMatching(/^absence:/) },
      ]);
    });

    it('leaves answers alone when the day stays, in another notation too', async () => {
      await db.query(`UPDATE event SET starts_at = '2027-05-21T15:30:00Z' WHERE id = $1`, [
        eventId,
      ]);
      await updateEvent(db, eventId, { startsAt: '2027-05-21T17:30:00+02:00' });
      expect(await responses()).toEqual([]);
    });

    it('keeps an answer the parent already gave', async () => {
      await db.query(
        `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'in', 'x')`,
        [eventId, ella],
      );
      await updateEvent(db, eventId, { startsAt: '2027-05-21T17:30:00+02:00' });
      expect(await responses()).toEqual([{ status: 'in', responded_by: 'x' }]);
    });

    it('reports an unknown event', async () => {
      await expect(
        updateEvent(db, MISSING, { startsAt: '2027-05-21T17:30:00+02:00' }),
      ).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe('deleteEvent', () => {
    const exists = async () =>
      (await db.query('SELECT 1 FROM event WHERE id = $1', [eventId])).length > 0;

    it('deletes an event without answers', async () => {
      expect(await deleteEvent(db, eventId, false)).toEqual({ deleted: eventId, answers: 0 });
      expect(await exists()).toBe(false);
    });

    it('does not count what an absence filled in', async () => {
      await answer('absence:1');
      expect(await deleteEvent(db, eventId, false)).toEqual({ deleted: eventId, answers: 0 });
    });

    it('refuses an event with answers unless forced', async () => {
      await answer('guardian:1');
      await expect(deleteEvent(db, eventId, false)).rejects.toBeInstanceOf(Conflict);
      expect(await exists()).toBe(true);
      expect(await deleteEvent(db, eventId, true)).toEqual({ deleted: eventId, answers: 1 });
      expect(await exists()).toBe(false);
      expect(await db.query('SELECT 1 FROM response')).toEqual([]);
    });

    it('reports an unknown event', async () => {
      await expect(deleteEvent(db, MISSING, true)).rejects.toBeInstanceOf(NotFound);
    });
  });

  it('listEvents returns what it takes to find a series or a BSM game', async () => {
    const game = await insert(db, 'event', {
      team_id: teamId,
      type: 'game',
      title: 'vs. Karlsruhe',
      opponent: 'Karlsruhe',
      bsm_match_id: 4711,
      starts_at: '2027-05-12T09:00:00Z',
    });
    const events = await listEvents(db, teamId, new Date('2027-01-01T00:00:00Z'));
    expect(events.find((e) => e.id === eventId)).toMatchObject({
      seriesId: '11111111-1111-4111-8111-111111111111',
      bsmMatchId: null,
    });
    expect(events.find((e) => e.id === game)).toMatchObject({
      opponent: 'Karlsruhe',
      bsmMatchId: 4711,
      seriesId: null,
    });
  });
});
