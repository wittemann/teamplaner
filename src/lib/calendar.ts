// Calendar subscription (docs/features.md, "Kalender-Abo"): /kalender/<token>.ics lists the events
// a family's children go to – games with "Dabei", trainings not opted out. Cancelled ones stay in
// as CANCELLED, so subscribed calendars drop them instead of keeping a stale entry.
// The calendar token is derived from the personal link, so a new link also ends the old calendar.
import { createHash } from 'node:crypto';
import type { Db } from './db/client.ts';
import { time } from './format.ts';
import { needsAnswer, type SeasonEvent } from './season.ts';
import { hashToken } from './token.ts';

export function calendarToken(accessToken: string) {
  return createHash('sha256').update(`calendar:${accessToken}`).digest('base64url');
}

/** Stores the calendar token of the family's current link (no write if unchanged). */
export async function rememberCalendarToken(db: Db, guardianId: string, accessToken: string) {
  const hash = hashToken(calendarToken(accessToken));
  await db.query(
    `UPDATE guardian SET calendar_token_hash = $2
      WHERE id = $1 AND calendar_token_hash IS DISTINCT FROM $2`,
    [guardianId, hash],
  );
}

export async function findGuardianByCalendarToken(db: Db, token: string) {
  const [guardian] = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM guardian WHERE calendar_token_hash = $1',
    [hashToken(token)],
  );
  return guardian;
}

export type CalendarEvent = {
  id: string;
  type: SeasonEvent['type'];
  title: string;
  /** First names of the children who go */
  children: string[];
  start: Date;
  meetAt: Date | null;
  end: Date | null;
  location: string | null;
  locationUrl: string | null;
  coachNote: string | null;
  cancelled: boolean;
  cancelReason: string | null;
};

type CalendarRow = {
  id: string;
  type: SeasonEvent['type'];
  title: string;
  first_name: string;
  starts_at: Date;
  meet_at: Date | null;
  ends_at: Date | null;
  location_name: string | null;
  location_url: string | null;
  coach_note: string | null;
  cancelled: boolean;
  cancel_reason: string | null;
  status: 'in' | 'out' | null;
};

/** Events of the family's children since a day, one entry per event (siblings merged). */
export async function loadCalendar(db: Db, guardianId: string, since: Date) {
  const rows = await db.query<CalendarRow>(
    `SELECT e.id, e.type, e.title, p.first_name, e.starts_at, e.meet_at, e.ends_at,
            e.location_name, e.location_url, e.coach_note, e.cancelled, e.cancel_reason,
            r.status
       FROM guardianship g
       JOIN player p ON p.id = g.player_id
       JOIN team_member m ON m.player_id = p.id AND m.active
       JOIN event e ON e.team_id = m.team_id
       LEFT JOIN response r ON r.event_id = e.id AND r.player_id = p.id
      WHERE g.guardian_id = $1 AND e.starts_at >= $2
      ORDER BY e.starts_at, p.first_name`,
    [guardianId, since],
  );
  const events = new Map<string, CalendarEvent>();
  for (const row of rows) {
    const goes = needsAnswer(row.type) ? row.status === 'in' : row.status !== 'out';
    if (!goes) continue;
    const existing = events.get(row.id);
    if (existing) {
      existing.children.push(row.first_name);
      continue;
    }
    events.set(row.id, {
      id: row.id,
      type: row.type,
      title: row.title,
      children: [row.first_name],
      start: new Date(row.starts_at),
      meetAt: row.meet_at && new Date(row.meet_at),
      end: row.ends_at && new Date(row.ends_at),
      location: row.location_name,
      locationUrl: row.location_url,
      coachNote: row.coach_note,
      cancelled: row.cancelled,
      cancelReason: row.cancel_reason,
    });
  }
  return [...events.values()];
}

// Without an end time: trainings 1:30, everything else (games, tournaments) 3 hours
const DEFAULT_MINUTES: Record<string, number> = { training: 90 };

function stamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escape(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 bytes continue on the next line, starting with a space (RFC 5545). */
function fold(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    if (encoder.encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
    }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function toICal(events: CalendarEvent[], origin: string, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bretten Kangaroos//Teamplaner//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Bretten Kangaroos',
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    // Games start at the meeting time – that is when the family has to be there
    const start = e.meetAt ?? e.start;
    const end = e.end ?? new Date(e.start.getTime() + (DEFAULT_MINUTES[e.type] ?? 180) * 60_000);
    const who = e.children.join(', ');
    const description = [
      e.cancelled && `Fällt aus${e.cancelReason ? `: ${e.cancelReason}` : ''}`,
      e.meetAt &&
        `Treffpunkt ${time(e.meetAt.toISOString())}, Beginn ${time(e.start.toISOString())}`,
      e.coachNote && `Hinweis vom Trainer: ${e.coachNote}`,
      e.locationUrl,
      `Zu- und Absagen: ${origin}/`,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@teamplaner`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(`${e.cancelled ? 'Abgesagt: ' : ''}${e.title} (${who})`)}`,
      `DESCRIPTION:${escape(description)}`,
      `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    );
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
