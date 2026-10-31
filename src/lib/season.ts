// Reads and writes what a family sees on its season page (docs/features.md, "Eltern").
// Rules: games without an answer are open; trainings count as "in" unless the family opted out.
import type { Db } from './db/client.ts';
import { hashToken } from './token.ts';

export type Status = 'in' | 'out';

export type SeasonEvent = {
  id: string;
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
  /** This child's answer; null = no answer yet */
  status: Status | null;
  /** Children of the team who said yes (games only) */
  confirmed: number;
};

export type SeasonChild = {
  playerId: string;
  firstName: string;
  teamName: string;
  season: number;
  games: SeasonEvent[];
  trainings: SeasonEvent[];
};

export type Guardian = { id: string; name: string };

/** Everything except trainings needs an explicit answer. */
export function needsAnswer(type: SeasonEvent['type']) {
  return type !== 'training';
}

export async function findGuardianByToken(db: Db, token: string) {
  const [guardian] = await db.query<Guardian>(
    'SELECT id, name FROM guardian WHERE access_token_hash = $1',
    [hashToken(token)],
  );
  return guardian;
}

type EventRow = {
  player_id: string;
  first_name: string;
  team_name: string;
  season: number;
  id: string;
  type: SeasonEvent['type'];
  title: string;
  home_away: SeasonEvent['homeAway'];
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
  status: Status | null;
  confirmed: number;
};

/** Upcoming events of all children of a guardian, grouped by child. */
export async function loadSeason(db: Db, guardianId: string, now = new Date()) {
  const rows = await db.query<EventRow>(
    `SELECT p.id AS player_id, p.first_name, t.name AS team_name, t.season,
            e.id, e.type, e.title, e.home_away, e.meet_at, e.starts_at, e.ends_at, e.respond_by,
            e.location_name, e.location_url, e.min_players, e.coach_note, e.cancelled,
            e.cancel_reason, r.status,
            (SELECT count(*)::int FROM response c
               JOIN team_member cm ON cm.player_id = c.player_id AND cm.team_id = e.team_id AND cm.active
              WHERE c.event_id = e.id AND c.status = 'in') AS confirmed
       FROM guardianship g
       JOIN player p ON p.id = g.player_id
       JOIN team_member m ON m.player_id = p.id AND m.active
       JOIN team t ON t.id = m.team_id
       JOIN event e ON e.team_id = t.id
       LEFT JOIN response r ON r.event_id = e.id AND r.player_id = p.id
      WHERE g.guardian_id = $1 AND coalesce(e.ends_at, e.starts_at) >= $2
      ORDER BY p.birth_year DESC, p.first_name, e.starts_at`,
    [guardianId, now],
  );

  const children = new Map<string, SeasonChild>();
  for (const row of rows) {
    let child = children.get(row.player_id);
    if (!child) {
      child = {
        playerId: row.player_id,
        firstName: row.first_name,
        teamName: row.team_name,
        season: row.season,
        games: [],
        trainings: [],
      };
      children.set(row.player_id, child);
    }
    const event: SeasonEvent = {
      id: row.id,
      type: row.type,
      title: row.title,
      homeAway: row.home_away,
      meetAt: row.meet_at && new Date(row.meet_at).toISOString(),
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: row.ends_at && new Date(row.ends_at).toISOString(),
      respondBy: row.respond_by && new Date(row.respond_by).toISOString(),
      locationName: row.location_name,
      locationUrl: row.location_url,
      minPlayers: row.min_players,
      coachNote: row.coach_note,
      cancelled: row.cancelled,
      cancelReason: row.cancel_reason,
      status: row.status,
      confirmed: row.confirmed,
    };
    (needsAnswer(row.type) ? child.games : child.trainings).push(event);
  }
  return [...children.values()];
}

/**
 * Saves answers of one child for the given events. Only events of the child's teams count;
 * cancelled and past events are skipped. Returns the IDs that were saved.
 */
export async function setResponses(
  db: Db,
  guardianId: string,
  playerId: string,
  eventIds: string[],
  status: Status,
  now = new Date(),
) {
  const rows = await db.query<{ event_id: string }>(
    `INSERT INTO response (event_id, player_id, status, responded_by, updated_at)
     SELECT e.id, p.id, $4, 'guardian:' || g.guardian_id, now()
       FROM guardianship g
       JOIN player p ON p.id = g.player_id
       JOIN team_member m ON m.player_id = p.id AND m.active
       JOIN event e ON e.team_id = m.team_id
      WHERE g.guardian_id = $1 AND p.id = $2 AND e.id = ANY($3::uuid[])
        AND NOT e.cancelled AND coalesce(e.ends_at, e.starts_at) >= $5
     ON CONFLICT (event_id, player_id)
       DO UPDATE SET status = excluded.status, responded_by = excluded.responded_by,
                     updated_at = excluded.updated_at
     RETURNING event_id`,
    [guardianId, playerId, eventIds, status, now],
  );
  return rows.map((row) => row.event_id);
}
