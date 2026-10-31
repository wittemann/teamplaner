// Input schemas and database work behind the Admin API. Everything a coach can do, plus setting
// up teams, families and coaches, which only Martin does (through Claude).
import { z } from 'astro/zod';
import { applyAbsencesToEvents } from '../absence.ts';
import { groupByStatus } from '../answers.ts';
import { playerName, teamOverview, type CoachEvent } from '../coach.ts';
import type { Db } from '../db/client.ts';
import { hashToken, newAccessToken } from '../token.ts';
import { NotFound } from './route.ts';

const timestamp = z.iso.datetime({ offset: true });

export const teamInput = z.object({ name: z.string().min(1), season: z.number().int() });

export const eventInput = z.object({
  type: z.enum(['game', 'training', 'tournament', 'other']),
  title: z.string().min(1),
  opponent: z.string().nullish(),
  homeAway: z.enum(['home', 'away']).nullish(),
  seriesId: z.uuid().nullish(),
  bsmMatchId: z.number().int().nullish(),
  meetAt: timestamp.nullish(),
  startsAt: timestamp,
  endsAt: timestamp.nullish(),
  respondBy: timestamp.nullish(),
  locationName: z.string().nullish(),
  locationUrl: z.url().nullish(),
  minPlayers: z.number().int().positive().nullish(),
  coachNote: z.string().nullish(),
  cancelled: z.boolean().optional(),
  cancelReason: z.string().nullish(),
});
export const createEventsInput = z.object({
  teamId: z.uuid(),
  events: z.array(eventInput).min(1).max(200),
});
export const updateEventInput = eventInput.partial();

export const responseInput = z.object({
  eventId: z.uuid(),
  playerId: z.uuid(),
  /** null removes the answer: open again for games, "in" for trainings */
  status: z.enum(['in', 'out']).nullable(),
});

const newPlayer = z.object({
  firstName: z.string().min(1),
  lastNameInitial: z.string().length(1),
  birthYear: z.number().int(),
  teamId: z.uuid(),
});
export const familyInput = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().nullish(),
  /** New children, or IDs of children who already exist (e.g. for the second parent) */
  players: z.array(z.union([newPlayer, z.object({ playerId: z.uuid() })])).min(1),
});

export const coachInput = z.object({
  name: z.string().min(1),
  email: z.email(),
  isAdmin: z.boolean().optional(),
  teamIds: z.array(z.uuid()),
});

// camelCase input field → database column
const EVENT_COLUMNS: Record<keyof z.infer<typeof eventInput>, string> = {
  type: 'type',
  title: 'title',
  opponent: 'opponent',
  homeAway: 'home_away',
  seriesId: 'series_id',
  bsmMatchId: 'bsm_match_id',
  meetAt: 'meet_at',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  respondBy: 'respond_by',
  locationName: 'location_name',
  locationUrl: 'location_url',
  minPlayers: 'min_players',
  coachNote: 'coach_note',
  cancelled: 'cancelled',
  cancelReason: 'cancel_reason',
};

function eventColumns(input: Partial<z.infer<typeof eventInput>>) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined) as [
    keyof typeof EVENT_COLUMNS,
    unknown,
  ][];
  return {
    columns: entries.map(([key]) => EVENT_COLUMNS[key]),
    values: entries.map(([, value]) => value),
    hasNote: entries.some(([key]) => key === 'coachNote'),
  };
}

export async function listTeams(db: Db) {
  const teams = await db.query<{ id: string; name: string; season: number }>(
    'SELECT id, name, season FROM team ORDER BY season DESC, name DESC',
  );
  const players = await db.query<{
    team_id: string;
    id: string;
    first_name: string;
    last_name_initial: string;
    birth_year: number;
    active: boolean;
  }>(
    `SELECT m.team_id, p.id, p.first_name, p.last_name_initial, p.birth_year, m.active
       FROM player p JOIN team_member m ON m.player_id = p.id ORDER BY p.first_name`,
  );
  const guardians = await db.query<{
    player_id: string;
    id: string;
    name: string;
    email: string;
    has_phone: boolean;
  }>(
    `SELECT g.player_id, gu.id, gu.name, gu.email, gu.phone IS NOT NULL AS has_phone
       FROM guardianship g JOIN guardian gu ON gu.id = g.guardian_id ORDER BY gu.name`,
  );
  const coaches = await db.query<{ team_id: string; id: string; name: string }>(
    `SELECT ct.team_id, c.id, c.name FROM coach_team ct JOIN coach c ON c.id = ct.coach_id`,
  );
  return teams.map((team) => ({
    ...team,
    coaches: coaches.filter((c) => c.team_id === team.id).map(({ id, name }) => ({ id, name })),
    players: players
      .filter((p) => p.team_id === team.id)
      .map((p) => ({
        id: p.id,
        name: playerName(p.first_name, p.last_name_initial),
        birthYear: p.birth_year,
        active: p.active,
        guardians: guardians
          .filter((g) => g.player_id === p.id)
          .map((g) => ({ id: g.id, name: g.name, email: g.email, hasPhone: g.has_phone })),
      })),
  }));
}

export async function createTeam(db: Db, input: z.infer<typeof teamInput>) {
  const [team] = await db.query<{ id: string }>(
    'INSERT INTO team (name, season) VALUES ($1, $2) RETURNING id',
    [input.name, input.season],
  );
  return team;
}

/** Upcoming events of a team with counts and the names behind them. */
export async function listEvents(db: Db, teamId: string, from: Date) {
  const { players, events, answers } = await teamOverview(db, teamId, from);
  const name = (id: string) => players.find((p) => p.id === id)?.name;
  return events.map((event: CoachEvent) => {
    const groups = groupByStatus(event, players, answers);
    return {
      ...event,
      counts: { in: groups.in.length, out: groups.out.length, open: groups.open.length },
      out: groups.out.map((p) => p.name),
      open: groups.open.map((p) => p.name),
      lateChanges: answers
        .filter((a) => a.eventId === event.id && a.late)
        .map((a) => ({ player: name(a.playerId), status: a.status, at: a.updatedAt })),
    };
  });
}

export async function createEvents(db: Db, input: z.infer<typeof createEventsInput>) {
  const ids: string[] = [];
  for (const event of input.events) {
    const { columns, values } = eventColumns(event);
    const placeholders = values.map((_, i) => `$${i + 2}`).join(', ');
    const [row] = await db.query<{ id: string }>(
      `INSERT INTO event (team_id, ${columns.join(', ')}) VALUES ($1, ${placeholders}) RETURNING id`,
      [input.teamId, ...values],
    );
    ids.push(row.id);
  }
  // Children who already said they're away get "out" for the new events too
  await applyAbsencesToEvents(db, ids);
  return { created: ids };
}

export async function updateEvent(db: Db, id: string, input: z.infer<typeof updateEventInput>) {
  const { columns, values, hasNote } = eventColumns(input);
  if (columns.length === 0) return { updated: id };
  const sets = columns.map((column, i) => `${column} = $${i + 2}`);
  if (hasNote) sets.push('coach_note_updated_at = now()');
  const rows = await db.query(`UPDATE event SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, [
    id,
    ...values,
  ]);
  if (rows.length === 0) throw new NotFound(`event ${id}`);
  return { updated: id };
}

export async function setResponse(db: Db, input: z.infer<typeof responseInput>) {
  if (input.status === null) {
    await db.query('DELETE FROM response WHERE event_id = $1 AND player_id = $2', [
      input.eventId,
      input.playerId,
    ]);
    return { removed: true };
  }
  const rows = await db.query(
    `INSERT INTO response (event_id, player_id, status, responded_by, updated_at)
     SELECT e.id, m.player_id, $3, 'claude', now()
       FROM event e JOIN team_member m ON m.team_id = e.team_id AND m.player_id = $2
      WHERE e.id = $1
     ON CONFLICT (event_id, player_id) DO UPDATE
       SET status = excluded.status, responded_by = excluded.responded_by, updated_at = now()
     RETURNING event_id`,
    [input.eventId, input.playerId, input.status],
  );
  if (rows.length === 0) throw new NotFound('event, or child not in its team');
  return { saved: true };
}

/** Creates a parent with a new personal link; the token is returned once and never stored. */
export async function createFamily(db: Db, input: z.infer<typeof familyInput>) {
  const token = newAccessToken();
  const [guardian] = await db.query<{ id: string }>(
    'INSERT INTO guardian (name, email, phone, access_token_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [input.name, input.email, input.phone ?? null, hashToken(token)],
  );
  const playerIds: string[] = [];
  for (const player of input.players) {
    let playerId: string;
    if ('playerId' in player) {
      playerId = player.playerId;
    } else {
      const [created] = await db.query<{ id: string }>(
        'INSERT INTO player (first_name, last_name_initial, birth_year) VALUES ($1, $2, $3) RETURNING id',
        [player.firstName, player.lastNameInitial, player.birthYear],
      );
      playerId = created.id;
      await db.query('INSERT INTO team_member (team_id, player_id) VALUES ($1, $2)', [
        player.teamId,
        playerId,
      ]);
    }
    await db.query('INSERT INTO guardianship (guardian_id, player_id) VALUES ($1, $2)', [
      guardian.id,
      playerId,
    ]);
    playerIds.push(playerId);
  }
  return { guardianId: guardian.id, playerIds, token };
}

export async function createCoach(db: Db, input: z.infer<typeof coachInput>) {
  const token = newAccessToken();
  const [coach] = await db.query<{ id: string }>(
    'INSERT INTO coach (name, email, is_admin, access_token_hash) VALUES ($1, $2, $3, $4) RETURNING id',
    [input.name, input.email, input.isAdmin ?? false, hashToken(token)],
  );
  for (const teamId of input.teamIds) {
    await db.query('INSERT INTO coach_team (coach_id, team_id) VALUES ($1, $2)', [
      coach.id,
      teamId,
    ]);
  }
  return { coachId: coach.id, token };
}

/** New link for a parent or coach; the old one stops working at once. */
export async function rotateToken(db: Db, table: 'guardian' | 'coach', id: string) {
  const token = newAccessToken();
  const rows = await db.query(
    `UPDATE ${table} SET access_token_hash = $2 WHERE id = $1 RETURNING id`,
    [id, hashToken(token)],
  );
  if (rows.length === 0) throw new NotFound(`${table} ${id}`);
  return token;
}
