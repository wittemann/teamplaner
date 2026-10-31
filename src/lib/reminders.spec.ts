import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answerToken, readAnswerToken } from './answer-link.ts';
import type { Db } from './db/client.ts';
import { createTestDb, insert } from './db/test-db.ts';
import type { Mail } from './mail.ts';
import { teamOverview } from './coach.ts';
import { planReminders, reminderMail, sendReminders, teamReminderPlan } from './reminders.ts';
import { hashToken, sealToken } from './token.ts';

const KEY = randomBytes(32).toString('base64url');
// Thursday 1 April 2027, 17:00 in Berlin
const NOW = new Date('2027-04-01T15:00:00Z');
const ORIGIN = 'https://team.bretten-kangaroos.net';

let db: Db;
let close: () => Promise<void>;
let teamId: string;
let ella: string;
let mother: string;
let father: string;
let game: string;

async function addGame(startsAt: string, respondBy: string | null, extra = {}) {
  return insert(db, 'event', {
    team_id: teamId,
    type: 'game',
    title: 'vs. Karlsruhe',
    starts_at: startsAt,
    respond_by: respondBy,
    min_players: 9,
    ...extra,
  });
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  teamId = await insert(db, 'team', { name: 'Schüler', season: 2027 });
  ella = await insert(db, 'player', {
    first_name: 'Ella',
    last_name_initial: 'M',
    birth_year: 2016,
  });
  await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [teamId, ella]);
  mother = await insert(db, 'guardian', {
    name: 'Anna Müller',
    email: 'anna@example.org',
    access_token_hash: hashToken('anna-token'),
    access_token_sealed: sealToken('anna-token', KEY),
  });
  father = await insert(db, 'guardian', {
    name: 'Bernd Müller',
    email: 'bernd@example.org',
    access_token_hash: hashToken('bernd-token'),
  });
  for (const g of [mother, father]) {
    await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2)', [g, ella]);
  }
  // Deadline Thursday 8 April, 20:00 – 7 days from NOW
  game = await addGame('2027-04-10T09:00:00Z', '2027-04-08T18:00:00Z');
});
afterEach(() => close());

describe('planReminders', () => {
  it('reminds 7 days and 1 day before the deadline, not in between', async () => {
    expect(await planReminders(db, { mode: 'due' }, NOW)).toHaveLength(1);
    const in3Days = new Date('2027-04-04T15:00:00Z');
    expect(await planReminders(db, { mode: 'due' }, in3Days)).toEqual([]);
    const dayBefore = new Date('2027-04-07T15:00:00Z');
    expect(await planReminders(db, { mode: 'due' }, dayBefore)).toHaveLength(1);
  });

  it('sends the first reminder to one parent, later ones to both, at most one a day', async () => {
    const send = async () => {};
    const first = await sendReminders(db, { mode: 'all' }, { origin: ORIGIN, key: KEY, send }, NOW);
    expect(first.map((r) => r.guardian)).toEqual(['Anna Müller']);
    const sameEvening = new Date('2027-04-01T20:00:00Z');
    expect((await planReminders(db, { mode: 'all' }, sameEvening)).map((r) => r.name)).toEqual([
      'Bernd Müller',
    ]);
    const nextDay = new Date('2027-04-02T15:00:00Z');
    expect((await planReminders(db, { mode: 'all' }, nextDay)).map((r) => r.name)).toEqual([
      'Anna Müller',
      'Bernd Müller',
    ]);
  });

  it('stops once the game is answered or cancelled', async () => {
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'in', 'x')`,
      [game, ella],
    );
    expect(await planReminders(db, { mode: 'all' }, NOW)).toEqual([]);
    await db.query('DELETE FROM response');
    await db.query('UPDATE event SET cancelled = true');
    expect(await planReminders(db, { mode: 'all' }, NOW)).toEqual([]);
  });

  it('uses the game day when there is no deadline, and ignores trainings', async () => {
    await db.query('DELETE FROM event');
    await addGame('2027-04-02T09:00:00Z', null);
    await addGame('2027-04-08T09:00:00Z', null, { type: 'training', title: 'Training' });
    const [reminder] = await planReminders(db, { mode: 'due' }, NOW);
    expect(reminder.children[0].games.map((g) => g.title)).toEqual(['vs. Karlsruhe']);
  });

  it('only covers the chosen team', async () => {
    const other = await insert(db, 'team', { name: 'Jugend', season: 2027 });
    expect(await planReminders(db, { mode: 'all', teamId: other }, NOW)).toEqual([]);
    expect(await planReminders(db, { mode: 'all', teamId }, NOW)).toHaveLength(1);
  });

  it('logs nothing when a mail fails', async () => {
    const send = async () => {
      throw new Error('SMTP down');
    };
    const [result] = await sendReminders(
      db,
      { mode: 'all' },
      { origin: ORIGIN, key: KEY, send },
      NOW,
    );
    expect(result).toMatchObject({ sent: false, error: 'SMTP down' });
    expect(await db.query('SELECT * FROM reminder_mail')).toEqual([]);
  });
});

describe('teamReminderPlan', () => {
  const plan = async (now: Date) =>
    teamReminderPlan(db, teamId, await teamOverview(db, teamId, now), now);

  it('shows the planned reminders, then what was sent', async () => {
    expect(await plan(NOW)).toEqual([
      {
        day: '2027-04-01',
        what: '7 Tage vor dem Stichtag',
        detail: 'Sa 10.04. vs. Karlsruhe · 1 offen',
        status: 'planned',
      },
      {
        day: '2027-04-07',
        what: '1 Tag vor dem Stichtag',
        detail: 'Sa 10.04. vs. Karlsruhe · 1 offen',
        status: 'planned',
      },
    ]);
    await sendReminders(
      db,
      { mode: 'due' },
      { origin: ORIGIN, key: KEY, send: async () => {} },
      NOW,
    );
    expect((await plan(NOW)).map((e) => [e.day, e.status, e.detail])).toEqual([
      ['2027-04-01', 'sent', '1 Kind, 1 Elternteil'],
      ['2027-04-07', 'planned', 'Sa 10.04. vs. Karlsruhe · 1 offen'],
    ]);
  });

  it('plans nothing once every game is answered', async () => {
    await db.query(
      `INSERT INTO response (event_id, player_id, status, responded_by) VALUES ($1, $2, 'out', 'x')`,
      [game, ella],
    );
    expect(await plan(NOW)).toEqual([]);
  });

  it('leaves out other teams’ reminders', async () => {
    await sendReminders(
      db,
      { mode: 'all' },
      { origin: ORIGIN, key: KEY, send: async () => {} },
      NOW,
    );
    const other = await insert(db, 'team', { name: 'Jugend', season: 2027 });
    expect(await teamReminderPlan(db, other, await teamOverview(db, other, NOW), NOW)).toEqual([]);
  });
});

describe('reminderMail', () => {
  it('lists the open games with answer buttons and the personal link', async () => {
    const [reminder] = await planReminders(db, { mode: 'all' }, NOW);
    const mail: Mail = reminderMail(reminder, ORIGIN, KEY);
    expect(mail.to).toBe('anna@example.org');
    expect(mail.subject).toBe('Ella: noch 1 Spiel offen');
    expect(mail.text).toContain('Sa 10.04. · vs. Karlsruhe');
    expect(mail.text).toContain('Noch 9 Zusagen bis 9 Spieler');
    expect(mail.text).toContain('Antwort bis Do 08.04., 20 Uhr');
    expect(mail.text).toContain(`Alle Termine ansehen: ${ORIGIN}/f/anna-token`);
    expect(mail.html.match(/\/antwort\//g)).toHaveLength(2);
  });

  it('leaves out the buttons without a key', async () => {
    const [reminder] = await planReminders(db, { mode: 'all' }, NOW);
    const mail = reminderMail(reminder, ORIGIN, undefined);
    expect(mail.html).not.toContain('/antwort/');
    expect(mail.text).toContain(`Alle Termine ansehen: ${ORIGIN}/`);
  });
});

describe('answer links', () => {
  const answer = () => ({
    guardianId: mother,
    playerId: ella,
    eventId: game,
    status: 'in' as const,
  });

  it('reads back what the button stands for', async () => {
    const token = answerToken(answer(), hashToken('anna-token'), KEY);
    expect(await readAnswerToken(db, token, KEY)).toMatchObject({
      ...answer(),
      firstName: 'Ella',
      title: 'vs. Karlsruhe',
      current: null,
    });
  });

  it('rejects changed tokens, other keys and links of a renewed personal link', async () => {
    const token = answerToken(answer(), hashToken('anna-token'), KEY);
    const outToken = answerToken({ ...answer(), status: 'out' }, hashToken('anna-token'), KEY);
    const forged = `${outToken.split('.')[0]}.${token.split('.')[1]}`;
    expect(await readAnswerToken(db, forged, KEY)).toBeUndefined();
    expect(await readAnswerToken(db, token, randomBytes(32).toString('base64url'))).toBeUndefined();
    expect(await readAnswerToken(db, 'nonsense', KEY)).toBeUndefined();
    await db.query('UPDATE guardian SET access_token_hash = $2 WHERE id = $1', [
      mother,
      hashToken('new-token'),
    ]);
    expect(await readAnswerToken(db, token, KEY)).toBeUndefined();
  });

  it('rejects a parent who is not the child’s', async () => {
    const stranger = await insert(db, 'guardian', {
      name: 'X',
      email: 'x@example.org',
      access_token_hash: hashToken('x-token'),
    });
    const token = answerToken({ ...answer(), guardianId: stranger }, hashToken('x-token'), KEY);
    expect(await readAnswerToken(db, token, KEY)).toBeUndefined();
  });
});
