// Changes after the deadline (docs/tech.md, "Benachrichtigungen"): families may still change their
// answer, but the coaches of the team hear about it at once – by push, or by mail to coaches
// without a device signed up (or when no device got it).
// Every place that saves a parent's answer takes a snapshot of the "late window" (games past their
// deadline that haven't started) before and after; the difference is what changed late. That
// covers single taps, "Bei allen dabei", absences and the mail buttons alike.
import type { Db } from './db/client.ts';
import { deadline, shortDate, weekday } from './format.ts';
import { escapeHtml, mailFrame, primaryButton, smallPrint } from './mail-html.ts';
import type { Mail } from './mail.ts';
import { pushTo, type PushMessage, type PushSender } from './push.ts';
import type { Status } from './season.ts';

type WindowRow = {
  event_id: string;
  player_id: string;
  status: Status | null;
};

/** Answers of the family's children for games past their deadline: "event|player" → status. */
export async function lateWindow(db: Db, guardianId: string, now = new Date()) {
  const rows = await db.query<WindowRow>(
    `SELECT e.id AS event_id, p.id AS player_id, r.status
       FROM guardianship g
       JOIN player p ON p.id = g.player_id
       JOIN team_member m ON m.player_id = p.id AND m.active
       JOIN event e ON e.team_id = m.team_id
       LEFT JOIN response r ON r.event_id = e.id AND r.player_id = p.id
      WHERE g.guardian_id = $1 AND NOT e.cancelled
        AND e.respond_by IS NOT NULL AND e.respond_by < $2 AND e.starts_at > $2`,
    [guardianId, now],
  );
  return new Map(rows.map((row) => [`${row.event_id}|${row.player_id}`, row.status]));
}

export type LateChange = {
  eventId: string;
  playerId: string;
  before: Status | null;
  after: Status | null;
};

export function diffLateWindow(
  before: Map<string, Status | null>,
  after: Map<string, Status | null>,
) {
  const changes: LateChange[] = [];
  for (const [key, was] of before) {
    const now = after.has(key) ? after.get(key)! : was;
    if (now === was) continue;
    const [eventId, playerId] = key.split('|');
    changes.push({ eventId, playerId, before: was, after: now });
  }
  return changes;
}

type DetailRow = {
  event_id: string;
  team_id: string;
  team_name: string;
  title: string;
  starts_at: Date;
  respond_by: Date;
  min_players: number | null;
  confirmed: number;
  player_id: string;
  player_name: string;
};

type Recipient = { coachId: string; name: string; email: string; teamIds: string[] };

/** Coaches of the teams; a team without its own coach goes to the admins. */
async function coachesFor(db: Db, teamIds: string[]) {
  const rows = await db.query<{ id: string; name: string; email: string; team_id: string }>(
    `SELECT c.id, c.name, c.email, t.id AS team_id
       FROM team t
       JOIN coach c ON c.id IN (SELECT coach_id FROM coach_team WHERE team_id = t.id)
                    OR (c.is_admin AND NOT EXISTS (SELECT 1 FROM coach_team WHERE team_id = t.id))
      WHERE t.id = ANY($1::uuid[])
      ORDER BY c.name`,
    [teamIds],
  );
  const coaches = new Map<string, Recipient>();
  for (const row of rows) {
    const coach = coaches.get(row.id) ?? {
      coachId: row.id,
      name: row.name,
      email: row.email,
      teamIds: [],
    };
    coach.teamIds.push(row.team_id);
    coaches.set(row.id, coach);
  }
  return [...coaches.values()];
}

const WORD: Record<'in' | 'out' | 'open', string> = {
  in: 'dabei',
  out: 'nicht dabei',
  open: 'offen',
};

function word(status: Status | null) {
  return WORD[status ?? 'open'];
}

export type LateItem = LateChange & {
  playerName: string;
  title: string;
  startsAt: string;
  respondBy: string;
  minPlayers: number | null;
  confirmed: number;
  teamId: string;
  teamName: string;
};

export function lateChangeMail(
  coachName: string,
  email: string,
  items: LateItem[],
  origin: string,
) {
  const first = items[0];
  const kind = items.every((i) => i.after === 'out') ? 'Späte Absage' : 'Späte Änderung';
  const subject =
    items.length === 1
      ? `${kind}: ${first.playerName} – ${first.title} (${weekday(first.startsAt)} ${shortDate(first.startsAt)})`
      : `${kind}: ${items.length} Änderungen nach dem Stichtag`;
  const teams = [...new Set(items.map((i) => i.teamName))].join(' + ');
  const text = [`Hallo ${coachName},`, '', 'nach dem Stichtag hat sich etwas geändert:', ''];
  const html = [
    `<p style="margin:0 0 6px">Hallo ${escapeHtml(coachName)},</p>`,
    '<p style="margin:0 0 16px">nach dem Stichtag hat sich etwas geändert:</p>',
  ];
  for (const item of items) {
    const when = `${weekday(item.startsAt)} ${shortDate(item.startsAt)}`;
    const line = `${item.playerName} ist jetzt ${word(item.after)} (vorher ${word(item.before)})`;
    const count = item.minPlayers
      ? `Jetzt ${item.confirmed} von min. ${item.minPlayers} dabei`
      : `Jetzt ${item.confirmed} dabei`;
    const url = new URL(`/trainer/termin/${item.eventId}`, origin).href;
    text.push(
      `${when} · ${item.title}`,
      line,
      `${count} · Stichtag war ${deadline(item.respondBy)}`,
      url,
      '',
    );
    html.push(
      '<div style="border:1px solid #E3E3DE;border-radius:6px;padding:14px;margin:0 0 10px">',
      `<div style="font-weight:bold">${escapeHtml(`${when} · ${item.title}`)}</div>`,
      `<div>${escapeHtml(line)}</div>`,
      `<div style="color:#6B6F68;font-size:14px">${escapeHtml(`${count} · Stichtag war ${deadline(item.respondBy)}`)}</div>`,
      `<div style="margin-top:6px"><a href="${escapeHtml(url)}" style="color:#1E7B3C;font-weight:bold">Zum Termin</a></div>`,
      '</div>',
    );
  }
  const overview = new URL(`/trainer?team=${first.teamId}`, origin).href;
  const footer = 'Diese Mail kommt bei jeder Änderung nach dem Stichtag.';
  text.push(`Übersicht: ${overview}`, '', footer, '');
  html.push(primaryButton(overview, 'Zur Übersicht'), smallPrint(footer));
  return {
    to: email,
    subject,
    text: text.join('\n'),
    html: mailFrame(`Teamplaner · ${teams}`, html),
  } satisfies Mail;
}

/** The same as a push: one line per change, a click opens the event (or the overview). */
export function lateChangePush(items: LateItem[]) {
  const first = items[0];
  const kind = items.every((i) => i.after === 'out') ? 'Späte Absage' : 'Späte Änderung';
  const lines = items.map((item) => {
    const count = item.minPlayers
      ? `${item.confirmed} von min. ${item.minPlayers}`
      : `${item.confirmed} dabei`;
    return `${item.playerName} ${word(item.after)} · ${weekday(item.startsAt)} ${shortDate(item.startsAt)} ${item.title} (${count})`;
  });
  const oneEvent = items.every((i) => i.eventId === first.eventId);
  return {
    title:
      items.length === 1 ? `${kind}: ${first.playerName}` : `${kind}: ${items.length} Änderungen`,
    body: lines.join('\n'),
    url: oneEvent ? `/trainer/termin/${first.eventId}` : `/trainer?team=${first.teamId}`,
  } satisfies PushMessage;
}

export type LateDeps = {
  origin: string;
  send: (mail: Mail) => Promise<void>;
  /** Without one (no VAPID keys), every coach gets a mail */
  push?: PushSender;
};

/**
 * Tells the coaches what changed late between the two snapshots: by push, by mail if no device
 * got it. Never throws: a failing notice must not undo or block the family's answer.
 */
export async function reportLateChanges(
  db: Db,
  before: Map<string, Status | null>,
  after: Map<string, Status | null>,
  deps: LateDeps,
) {
  const changes = diffLateWindow(before, after);
  if (changes.length === 0) return { changes: 0, pushed: 0, sent: 0, failed: 0 };
  let pushed = 0;
  let sent = 0;
  let failed = 0;
  try {
    const rows = await db.query<DetailRow>(
      `SELECT e.id AS event_id, e.team_id, t.name AS team_name, e.title, e.starts_at, e.respond_by,
              e.min_players, p.id AS player_id,
              p.first_name || ' ' || p.last_name_initial || '.' AS player_name,
              (SELECT count(*)::int FROM response c
                 JOIN team_member cm ON cm.player_id = c.player_id AND cm.team_id = e.team_id AND cm.active
                WHERE c.event_id = e.id AND c.status = 'in') AS confirmed
         FROM event e JOIN team t ON t.id = e.team_id, player p
        WHERE e.id = ANY($1::uuid[]) AND p.id = ANY($2::uuid[])`,
      [changes.map((c) => c.eventId), changes.map((c) => c.playerId)],
    );
    const items: LateItem[] = [];
    for (const change of changes) {
      const row = rows.find(
        (r) => r.event_id === change.eventId && r.player_id === change.playerId,
      );
      if (!row) continue;
      items.push({
        ...change,
        playerName: row.player_name,
        title: row.title,
        startsAt: new Date(row.starts_at).toISOString(),
        respondBy: new Date(row.respond_by).toISOString(),
        minPlayers: row.min_players,
        confirmed: row.confirmed,
        teamId: row.team_id,
        teamName: row.team_name,
      });
    }
    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (const coach of await coachesFor(db, [...new Set(items.map((i) => i.teamId))])) {
      const mine = items.filter((i) => coach.teamIds.includes(i.teamId));
      if (mine.length === 0) continue;
      const reached = await pushTo(
        db,
        { coachIds: [coach.coachId] },
        lateChangePush(mine),
        deps.push,
      );
      if (reached.size > 0) {
        pushed++;
        continue;
      }
      try {
        await deps.send(lateChangeMail(coach.name, coach.email, mine, deps.origin));
        sent++;
      } catch (error) {
        failed++;
        console.error('late change: mail failed', (error as { code?: string }).code ?? 'unknown');
      }
    }
  } catch (error) {
    console.error('late change: lookup failed', error instanceof Error ? error.name : 'unknown');
  }
  return { changes: changes.length, pushed, sent, failed };
}

/** Runs a parent's save between two snapshots and reports what changed late. */
export async function withLateReport<T>(
  db: Db,
  guardianId: string,
  deps: LateDeps,
  save: () => Promise<T>,
) {
  const before = await lateWindow(db, guardianId);
  const result = await save();
  if (before.size > 0) await reportLateChanges(db, before, await lateWindow(db, guardianId), deps);
  return result;
}
