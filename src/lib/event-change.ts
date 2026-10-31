// Coaches change dates in the coach area (docs/features.md, "Trainer"). When a game moves – other
// day, time, meeting time or place – families whose child said "Dabei" get a mail with
// "passt es noch?" buttons (lib/answer-link.ts), so a changed plan doesn't go unnoticed.
import { answerUrl } from './answer-link.ts';
import type { CoachEvent } from './coach.ts';
import type { Db } from './db/client.ts';
import { longDate, time } from './format.ts';
import {
  answerButtons,
  escapeHtml,
  familyPageUrl,
  mailFrame,
  primaryButton,
  smallPrint,
} from './mail-html.ts';
import type { Mail } from './mail.ts';
import { needsAnswer } from './season.ts';

type Moved = Pick<CoachEvent, 'type' | 'startsAt' | 'meetAt' | 'locationName' | 'cancelled'>;

/** A game the families have to hear about: still on, and day, time or place changed. */
export function isMoved(before: Moved, after: Moved, now = new Date()) {
  if (!needsAnswer(after.type) || after.cancelled || new Date(after.startsAt) <= now) return false;
  return (
    before.startsAt !== after.startsAt ||
    before.meetAt !== after.meetAt ||
    (before.locationName ?? '') !== (after.locationName ?? '')
  );
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

/** Mails every family with a "Dabei" for the event. A failing mail doesn't stop the others. */
export async function notifyMoved(
  db: Db,
  event: CoachEvent,
  teamName: string,
  deps: { origin: string; key: string | undefined; send: (mail: Mail) => Promise<void> },
) {
  let sent = 0;
  let failed = 0;
  for (const family of await confirmedFamilies(db, event.id)) {
    try {
      await deps.send(movedMail(family, event, teamName, deps.origin, deps.key));
      sent++;
    } catch (error) {
      failed++;
      // The code only (e.g. EAUTH): SMTP messages can contain the address
      console.error('moved game: mail failed', (error as { code?: string }).code ?? 'unknown');
    }
  }
  return { sent, failed };
}
