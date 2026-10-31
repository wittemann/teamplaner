// Reads and writes what coaches see (docs/features.md, "Trainer"). Coaches see the teams they are
// assigned to; admins see all teams.
import type { Db } from './db/client.ts';
import type { Status } from './season.ts';
import { hashToken } from './token.ts';

export type Coach = { id: string; name: string; isAdmin: boolean };
export type Team = { id: string; name: string; season: number };

export type TeamPlayer = { id: string; name: string };

export type CoachEvent = {
  id: string;
  teamId: string;
  type: 'game' | 'training' | 'tournament' | 'other';
  title: string;
  homeAway: 'home' | 'away' | null;
  meetAt: string | null;
  startsAt: string;
  endsAt: string | null;
  respondBy: string | null;
  locationName: string | null;
  locationUrl: string | null;
  minPlayers: number | null;
  coachNote: string | null;
  cancelled: boolean;
  cancelReason: string | null;
};

/** One child's answer to one event, with "late" = changed after the deadline */
export type Answer = {
  eventId: string;
  playerId: string;
  status: Status;
  updatedAt: string;
  late: boolean;
};

const iso = (value: Date | string) => new Date(value).toISOString();
const isoOrNull = (value: Date | string | null) => (value === null ? null : iso(value));

/** "Ella M." – first name and initial, as everywhere in the coach area */
export function playerName(firstName: string, lastNameInitial: string) {
  return `${firstName} ${lastNameInitial}.`;
}

export async function findCoachByToken(db: Db, token: string) {
  const [coach] = await db.query<Coach>(
    'SELECT id, name, is_admin AS "isAdmin" FROM coach WHERE access_token_hash = $1',
    [hashToken(token)],
  );
  return coach;
}

export async function coachTeams(db: Db, coach: Coach) {
  return db.query<Team>(
    `SELECT t.id, t.name, t.season FROM team t
      WHERE $2 OR t.id IN (SELECT team_id FROM coach_team WHERE coach_id = $1)
      ORDER BY t.season DESC, t.name DESC`,
    [coach.id, coach.isAdmin],
  );
}

type EventRow = {
  id: string;
  team_id: string;
  type: CoachEvent['type'];
  title: string;
  home_away: CoachEvent['homeAway'];
  meet_at: Date | null;
  starts_at: Date;
  ends_at: Date | null;
  respond_by: Date | null;
  location_name: string | null;
  location_url: string | null;
  min_players: number | null;
  coach_note: string | null;
  cancelled: boolean;
  cancel_reason: string | null;
};

const EVENT_COLUMNS = `e.id, e.team_id, e.type, e.title, e.home_away, e.meet_at, e.starts_at,
  e.ends_at, e.respond_by, e.location_name, e.location_url, e.min_players, e.coach_note,
  e.cancelled, e.cancel_reason`;

function toEvent(row: EventRow) {
  return {
    id: row.id,
    teamId: row.team_id,
    type: row.type,
    title: row.title,
    homeAway: row.home_away,
    meetAt: isoOrNull(row.meet_at),
    startsAt: iso(row.starts_at),
    endsAt: isoOrNull(row.ends_at),
    respondBy: isoOrNull(row.respond_by),
    locationName: row.location_name,
    locationUrl: row.location_url,
    minPlayers: row.min_players,
    coachNote: row.coach_note,
    cancelled: row.cancelled,
    cancelReason: row.cancel_reason,
  } satisfies CoachEvent;
}

type AnswerRow = {
  event_id: string;
  player_id: string;
  status: Status;
  updated_at: Date;
  late: boolean;
};

function toAnswer(row: AnswerRow) {
  return {
    eventId: row.event_id,
    playerId: row.player_id,
    status: row.status,
    updatedAt: iso(row.updated_at),
    late: row.late,
  } satisfies Answer;
}

async function teamPlayers(db: Db, teamId: string) {
  const rows = await db.query<{ id: string; first_name: string; last_name_initial: string }>(
    `SELECT p.id, p.first_name, p.last_name_initial FROM player p
       JOIN team_member m ON m.player_id = p.id AND m.active
      WHERE m.team_id = $1 ORDER BY p.first_name, p.last_name_initial`,
    [teamId],
  );
  return rows.map((r) => ({ id: r.id, name: playerName(r.first_name, r.last_name_initial) }));
}

/** Upcoming events of a team with all answers – the data of the season matrix. */
export async function teamOverview(db: Db, teamId: string, now = new Date()) {
  const players = await teamPlayers(db, teamId);
  const events = (
    await db.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM event e
        WHERE e.team_id = $1 AND coalesce(e.ends_at, e.starts_at) >= $2
        ORDER BY e.starts_at`,
      [teamId, now],
    )
  ).map(toEvent);
  const answers = (
    await db.query<AnswerRow>(
      `SELECT r.event_id, r.player_id, r.status, r.updated_at,
              (e.respond_by IS NOT NULL AND r.updated_at > e.respond_by) AS late
         FROM response r JOIN event e ON e.id = r.event_id
        WHERE e.team_id = $1 AND coalesce(e.ends_at, e.starts_at) >= $2`,
      [teamId, now],
    )
  ).map(toAnswer);
  return { players, events, answers };
}

/** One event with its team's children and their answers. */
export async function eventDetail(db: Db, eventId: string) {
  const [row] = await db.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM event e WHERE e.id = $1`, [
    eventId,
  ]);
  if (!row) return undefined;
  const event = toEvent(row);
  const players = await teamPlayers(db, event.teamId);
  const answers = (
    await db.query<AnswerRow>(
      `SELECT r.event_id, r.player_id, r.status, r.updated_at,
              (e.respond_by IS NOT NULL AND r.updated_at > e.respond_by) AS late
         FROM response r JOIN event e ON e.id = r.event_id WHERE e.id = $1`,
      [eventId],
    )
  ).map(toAnswer);
  // Phone numbers for the personal WhatsApp nudge (only stored with consent)
  const phones = await db.query<{ player_id: string; phone: string }>(
    `SELECT g.player_id, gu.phone FROM guardianship g JOIN guardian gu ON gu.id = g.guardian_id
      WHERE gu.phone IS NOT NULL AND g.player_id IN
        (SELECT player_id FROM team_member WHERE team_id = $1 AND active)`,
    [event.teamId],
  );
  return { event, players, answers, phones: new Map(phones.map((p) => [p.player_id, p.phone])) };
}

export async function setCoachNote(db: Db, eventId: string, note: string | null) {
  await db.query('UPDATE event SET coach_note = $2, coach_note_updated_at = now() WHERE id = $1', [
    eventId,
    note,
  ]);
}

export function canSeeTeam(coach: Coach, teams: Team[], teamId: string) {
  return coach.isAdmin || teams.some((t) => t.id === teamId);
}
