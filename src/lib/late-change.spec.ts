import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addAbsence } from './absence.ts';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';
import { lateWindow, reportLateChanges, withLateReport } from './late-change.ts';
import type { Mail } from './mail.ts';
import { setResponses } from './season.ts';

const ORIGIN = 'https://team.bretten-kangaroos.net';

describe('late changes', () => {
  let db: Db;
  let close: () => Promise<void>;
  let teamId: string;
  let late: string;
  let early: string;
  let ella: string;
  let anna: string;
  let mails: Mail[];
  const deps = {
    origin: ORIGIN,
    send: async (mail: Mail) => {
      mails.push(mail);
    },
  };

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    mails = [];
    // Relative to the real clock: the late window uses "now"
    const day = 24 * 3600 * 1000;
    const at = (days: number) => new Date(Date.now() + days * day).toISOString();
    teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
    const other = await insert(db, 'team', { name: 'Jugend', season: 2027 });
    ella = await insert(db, 'player', {
      first_name: 'Ella',
      last_name_initial: 'M',
      birth_year: 2016,
    });
    anna = await insert(db, 'guardian', {
      name: 'Anna Müller',
      email: 'anna@example.org',
      access_token_hash: 'x',
    });
    await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2)', [
      anna,
      ella,
    ]);
    await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [teamId, ella]);
    const coach = await insert(db, 'coach', {
      name: 'Tom',
      email: 'tom@example.org',
      access_token_hash: 'y',
    });
    await insert(db, 'coach', {
      name: 'Jana',
      email: 'jana@example.org',
      access_token_hash: 'z',
    });
    await db.query('INSERT INTO coach_team (coach_id, team_id) VALUES ($1, $2), ($3, $4)', [
      coach,
      teamId,
      (await db.query<{ id: string }>(`SELECT id FROM coach WHERE name = 'Jana'`))[0].id,
      other,
    ]);
    late = await insert(db, 'event', {
      team_id: teamId,
      type: 'game',
      title: 'vs. Karlsruhe',
      starts_at: at(2),
      respond_by: at(-1),
      min_players: 9,
    });
    early = await insert(db, 'event', {
      team_id: teamId,
      type: 'game',
      title: 'vs. Mannheim',
      starts_at: at(20),
      respond_by: at(15),
    });
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'in', 'x')`,
      [late, ella],
    );
  });
  afterEach(() => close());

  it('only watches games past their deadline that have not started', async () => {
    const window = await lateWindow(db, anna);
    expect([...window.entries()]).toEqual([[`${late}|${ella}`, 'in']]);
  });

  it('mails the team coach when a family says no after the deadline', async () => {
    await withLateReport(db, anna, deps, () => setResponses(db, anna, ella, [late, early], 'out'));
    expect(mails.map((m) => m.to)).toEqual(['tom@example.org']);
    const [mail] = mails;
    expect(mail.subject).toMatch(/^Späte Absage: Ella M\. – vs\. Karlsruhe \(/);
    expect(mail.text).toContain('Ella M. ist jetzt nicht dabei (vorher dabei)');
    expect(mail.text).toContain('Jetzt 0 von min. 9 dabei');
    expect(mail.text).toContain(`${ORIGIN}/trainer/termin/${late}`);
    expect(mail.text).not.toContain('Mannheim');
  });

  it('stays quiet when nothing late changes', async () => {
    await withLateReport(db, anna, deps, () => setResponses(db, anna, ella, [late], 'in'));
    await withLateReport(db, anna, deps, () => setResponses(db, anna, ella, [early], 'out'));
    expect(mails).toEqual([]);
  });

  it('counts absences, and falls back to admins for a team without coach', async () => {
    await db.query('DELETE FROM coach_team WHERE team_id = $1', [teamId]);
    await insert(db, 'coach', {
      name: 'Martin',
      email: 'martin@example.org',
      access_token_hash: 'a',
      is_admin: true,
    });
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await withLateReport(db, anna, deps, () =>
      addAbsence(db, anna, { playerIds: [ella], from: today, to: until, note: null }),
    );
    expect(mails.map((m) => m.to)).toEqual(['martin@example.org']);
  });

  it('never throws when the mail fails', async () => {
    const before = await lateWindow(db, anna);
    await setResponses(db, anna, ella, [late], 'out');
    const result = await reportLateChanges(db, before, await lateWindow(db, anna), {
      origin: ORIGIN,
      send: async () => {
        throw Object.assign(new Error('nope'), { code: 'EAUTH' });
      },
    });
    expect(result).toEqual({ changes: 1, sent: 0, failed: 1 });
  });
});
