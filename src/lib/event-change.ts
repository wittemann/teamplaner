// Coaches change dates in the coach area (docs/features.md, "Trainer"). When an event moves – other
// day, time, meeting time or place – the families taking part get a push. For games, families the
// push didn't reach get a mail with "passt es noch?" buttons (lib/answer-link.ts) instead, so a
// changed plan doesn't go unnoticed. The Admin API asks for the same news with `notify`.
import { answerUrl } from './answer-link.ts';
import type { CoachEvent } from './coach.ts';
import type { Db } from './db/client.ts';
import { longDate, shortDate, time, weekday } from './format.ts';
import {
  answerButtons,
  escapeHtml,
  familyPageUrl,
  mailFrame,
  primaryButton,
  smallPrint,
} from './mail-html.ts';
import type { Mail } from './mail.ts';
import { pushCancelled, pushCoachNote, pushEventNews, type PushSender } from './push.ts';
import { needsAnswer } from './season.ts';

type Moved = Pick<CoachEvent, 'type' | 'startsAt' | 'meetAt' | 'locationName' | 'cancelled'>;

/** An event the families have to hear about: still on, and day, time or place changed. */
export function isRescheduled(before: Moved, after: Moved, now = new Date()) {
  if (after.cancelled || new Date(after.startsAt) <= now) return false;
  return (
    before.startsAt !== after.startsAt ||
    before.meetAt !== after.meetAt ||
    (before.locationName ?? '') !== (after.locationName ?? '')
  );
}

/** A moved game: families also get the mail with answer buttons */
export function isMoved(before: Moved, after: Moved, now = new Date()) {
  return needsAnswer(after.type) && isRescheduled(before, after, now);
}

export type MovedRecipient = {
  guardianId: string;
  name: string;
  email: string;
  accessTokenHash: string;
  accessTokenSealed: string | null;
  children: { playerId: string; firstName: string }[];
};

/** Parents of children who said yes to the event (every parent, not only the one who answered). */
export async function confirmedFamilies(db: Db, eventId: string) {
  const rows = await db.query<{
    guardian_id: string;
    name: string;
    email: string;
    access_token_hash: string;
    access_token_sealed: string | null;
    player_id: string;
    first_name: string;
  }>(
    `SELECT g.id AS guardian_id, g.name, g.email, g.access_token_hash, g.access_token_sealed,
            p.id AS player_id, p.first_name
       FROM response r
       JOIN event e ON e.id = r.event_id
       JOIN team_member m ON m.team_id = e.team_id AND m.player_id = r.player_id AND m.active
       JOIN player p ON p.id = r.player_id
       JOIN guardianship gs ON gs.player_id = p.id
       JOIN guardian g ON g.id = gs.guardian_id
      WHERE r.event_id = $1 AND r.status = 'in'
      ORDER BY g.name, g.id, p.first_name`,
    [eventId],
  );
  const families = new Map<string, MovedRecipient>();
  for (const row of rows) {
    let family = families.get(row.guardian_id);
    if (!family) {
      family = {
        guardianId: row.guardian_id,
        name: row.name,
        email: row.email,
        accessTokenHash: row.access_token_hash,
        accessTokenSealed: row.access_token_sealed,
        children: [],
      };
      families.set(row.guardian_id, family);
    }
    family.children.push({ playerId: row.player_id, firstName: row.first_name });
  }
  return [...families.values()];
}

/** "Samstag, 15. Mai 2027 · Treffpunkt 9:30 · Beginn 11:00 · Kangaroos Ballpark" */
function when(event: CoachEvent) {
  return [
    longDate(event.startsAt),
    event.meetAt && `Treffpunkt ${time(event.meetAt)}`,
    `Beginn ${time(event.startsAt)}`,
    event.locationName,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function movedMail(
  family: MovedRecipient,
  event: CoachEvent,
  teamName: string,
  origin: string,
  key: string | undefined,
) {
  const subject = `Geändert: ${event.title} – bitte prüfen`;
  const intro = `beim Termin „${event.title}“ hat sich etwas geändert. Jetzt gilt:`;
  const pageUrl = familyPageUrl(family.accessTokenSealed, key, origin);
  const footer = 'Ihr müsst nur antworten, wenn es nicht mehr passt.';

  const text = [`Hallo ${family.name},`, '', intro, when(event), ''];
  const html = [
    `<p style="margin:0 0 6px">Hallo ${escapeHtml(family.name)},</p>`,
    `<p style="margin:0 0 8px">${escapeHtml(intro)}</p>`,
    `<p style="margin:0 0 16px;font-weight:bold">${escapeHtml(when(event))}</p>`,
  ];
  for (const child of family.children) {
    const answer = (status: 'in' | 'out') =>
      answerUrl(
        origin,
        { guardianId: family.guardianId, playerId: child.playerId, eventId: event.id, status },
        family.accessTokenHash,
        key,
      );
    const question = `${child.firstName} hat zugesagt – passt es noch?`;
    const yes = answer('in');
    const no = answer('out');
    text.push(question);
    if (yes && no) text.push(`Ja, dabei: ${yes}`, `Nein, nicht mehr dabei: ${no}`);
    text.push('');
    html.push(
      '<div style="border:1px solid #E3E3DE;border-radius:6px;padding:14px;margin:0 0 10px">',
      `<div style="font-weight:bold">${escapeHtml(question)}</div>`,
    );
    if (yes && no) {
      html.push(
        answerButtons({ url: yes, label: 'Ja, dabei' }, { url: no, label: 'Nicht mehr dabei' }),
      );
    }
    html.push('</div>');
  }
  text.push(
    `Alle Termine ansehen: ${pageUrl}`,
    '',
    footer,
    '',
    'Viele Grüße',
    'Bretten Kangaroos',
    '',
  );
  html.push(primaryButton(pageUrl, 'Alle Termine ansehen'), smallPrint(footer));
  return {
    to: family.email,
    subject,
    text: text.join('\n'),
    html: mailFrame(`Bretten Kangaroos · ${teamName}`, html),
  } satisfies Mail;
}

/**
 * Pushes the new plan to the families taking part; for a game, every family with a "Dabei" the
 * push didn't reach gets the mail. A failing mail doesn't stop the others.
 */
export async function notifyMoved(
  db: Db,
  event: CoachEvent,
  teamName: string,
  deps: {
    origin: string;
    key: string | undefined;
    send: (mail: Mail) => Promise<void>;
    push?: PushSender;
  },
) {
  const { reachedIds, reached, missed } = await pushEventNews(
    db,
    event.id,
    {
      title: `Geändert: ${event.title}`,
      body: when(event),
      tag: `event-${event.id}`,
      news: 'geaendert',
    },
    deps.push,
  );
  let sent = 0;
  let failed = 0;
  const families = needsAnswer(event.type) ? await confirmedFamilies(db, event.id) : [];
  for (const family of families) {
    if (reachedIds.has(`guardian:${family.guardianId}`)) continue;
    try {
      await deps.send(movedMail(family, event, teamName, deps.origin, deps.key));
      sent++;
    } catch (error) {
      failed++;
      // The code only (e.g. EAUTH): SMTP messages can contain the address
      console.error('moved game: mail failed', (error as { code?: string }).code ?? 'unknown');
    }
  }
  return { pushed: reached, missed, sent, failed };
}

/**
 * Tells the families what changed between two states of an event, as the coach area does: taken
 * back or cancelled, else moved, plus a new note (not on a cancelled event). `missed` = families
 * without a device for the push.
 */
export async function notifyEventChange(
  db: Db,
  before: CoachEvent,
  after: CoachEvent,
  deps: {
    origin: string;
    key: string | undefined;
    send: (mail: Mail) => Promise<void>;
    push?: PushSender;
  },
) {
  const day = `${weekday(after.startsAt)} ${shortDate(after.startsAt)}`;
  const result = { pushed: 0, missed: 0, mailed: 0, failed: 0 };
  if (before.cancelled !== after.cancelled) {
    const { reached, missed } = await pushCancelled(db, after, after.cancelReason, day, deps.push);
    result.pushed += reached;
    result.missed = missed;
  } else if (isRescheduled(before, after)) {
    const [team] = await db.query<{ name: string }>('SELECT name FROM team WHERE id = $1', [
      after.teamId,
    ]);
    const { pushed, missed, sent, failed } = await notifyMoved(db, after, team.name, deps);
    result.pushed += pushed;
    result.missed = missed;
    result.mailed = sent;
    result.failed = failed;
  }
  if (after.coachNote && after.coachNote !== before.coachNote && !after.cancelled) {
    const { reached, missed } = await pushCoachNote(db, after, after.coachNote, day, deps.push);
    result.pushed += reached;
    result.missed = Math.max(result.missed, missed);
  }
  return result;
}
