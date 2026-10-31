// Absence periods ("Wir sind vom 1.–14.8. weg", docs/features.md): every upcoming event of the
// child in the period becomes "out". The answers remember which absence set them
// (responded_by 'absence:<id>'), so removing the absence takes back exactly those.
// Days count in Berlin time: a game on Saturday 1:00 belongs to Saturday.
import type { Db } from './db/client.ts';

export type Absence = {
  id: string;
  playerId: string;
  /** YYYY-MM-DD, inclusive */
  from: string;
  to: string;
  note: string | null;
};

/** An answer an absence set or took back */
export type ChangedAnswer = { playerId: string; eventId: string };

const BERLIN_DAY = `(e.starts_at AT TIME ZONE 'Europe/Berlin')::date`;

type AbsenceRow = {
  id: string;
  player_id: string;
  from_date: string;
  to_date: string;
  note: string | null;
};

function toAbsence(row: AbsenceRow) {
  return {
    id: row.id,
    playerId: row.player_id,
    from: row.from_date,
    to: row.to_date,
    note: row.note,
  } satisfies Absence;
}

// Dates come back as text, so PGlite and Neon agree and no time zone shifts the day
const ABSENCE_COLUMNS = `a.id, a.player_id, a.from_date::text AS from_date, a.to_date::text AS to_date, a.note`;

/** Current and future absences of all children of a guardian. */
export async function listAbsences(db: Db, guardianId: string, today: string) {
  const rows = await db.query<AbsenceRow>(
    `SELECT ${ABSENCE_COLUMNS} FROM absence a
       JOIN guardianship g ON g.player_id = a.player_id
      WHERE g.guardian_id = $1 AND a.to_date >= $2::date
      ORDER BY a.from_date`,
    [guardianId, today],
  );
  return rows.map(toAbsence);
}

/** Sets "out" for the upcoming events in the period of one absence. */
async function applyAbsence(db: Db, absenceId: string, now: Date) {
  return db.query<{ player_id: string; event_id: string }>(
    `INSERT INTO response (event_id, player_id, status, responded_by, updated_at)
     SELECT e.id, a.player_id, 'out', 'absence:' || a.id, now()
       FROM absence a
       JOIN team_member m ON m.player_id = a.player_id AND m.active
       JOIN event e ON e.team_id = m.team_id
      WHERE a.id = $1 AND NOT e.cancelled AND e.starts_at >= $2
        AND ${BERLIN_DAY} BETWEEN a.from_date AND a.to_date
     ON CONFLICT (event_id, player_id) DO UPDATE
       SET status = 'out', responded_by = excluded.responded_by, updated_at = now()
     RETURNING player_id, event_id`,
    [absenceId, now],
  );
}

/**
 * Records an absence for some children of a guardian (others are skipped) and applies it.
 * Returns the new absences and the answers that changed to "out".
 */
export async function addAbsence(
  db: Db,
  guardianId: string,
  input: { playerIds: string[]; from: string; to: string; note?: string | null },
  now = new Date(),
) {
  const absences: Absence[] = [];
  const changed: ChangedAnswer[] = [];
  for (const playerId of input.playerIds) {
    const [row] = await db.query<AbsenceRow>(
      `INSERT INTO absence (player_id, from_date, to_date, note, created_by)
       SELECT g.player_id, $3::date, $4::date, $5, 'guardian:' || g.guardian_id
         FROM guardianship g WHERE g.guardian_id = $1 AND g.player_id = $2
       RETURNING id, player_id, from_date::text AS from_date, to_date::text AS to_date, note`,
      [guardianId, playerId, input.from, input.to, input.note ?? null],
    );
    if (!row) continue;
    absences.push(toAbsence(row));
    const rows = await applyAbsence(db, row.id, now);
    changed.push(...rows.map((r) => ({ playerId: r.player_id, eventId: r.event_id })));
  }
  return { absences, changed };
}

/** Removes an absence of the guardian's children and takes back the answers it set. */
export async function removeAbsence(db: Db, guardianId: string, absenceId: string) {
  const [owned] = await db.query<{ id: string }>(
    `SELECT a.id FROM absence a JOIN guardianship g ON g.player_id = a.player_id
      WHERE a.id = $1 AND g.guardian_id = $2`,
    [absenceId, guardianId],
  );
  if (!owned) return undefined;
  const rows = await db.query<{ player_id: string; event_id: string }>(
    `DELETE FROM response WHERE responded_by = 'absence:' || $1 RETURNING player_id, event_id`,
    [absenceId],
  );
  await db.query('DELETE FROM absence WHERE id = $1', [absenceId]);
  return rows.map((r) => ({ playerId: r.player_id, eventId: r.event_id }) satisfies ChangedAnswer);
}

/** Gives new events "out" for children whose absence covers them (used by the Admin API). */
export async function applyAbsencesToEvents(db: Db, eventIds: string[]) {
  if (eventIds.length === 0) return;
  await db.query(
    `INSERT INTO response (event_id, player_id, status, responded_by, updated_at)
     SELECT e.id, a.player_id, 'out', 'absence:' || a.id, now()
       FROM event e
       JOIN team_member m ON m.team_id = e.team_id AND m.active
       JOIN absence a ON a.player_id = m.player_id
      WHERE e.id = ANY($1::uuid[]) AND NOT e.cancelled
        AND ${BERLIN_DAY} BETWEEN a.from_date AND a.to_date
     ON CONFLICT (event_id, player_id) DO NOTHING`,
    [eventIds],
  );
}
