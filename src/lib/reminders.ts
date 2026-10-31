// Reminder mails to families with open games (docs/tech.md, "Automatische Erinnerungen").
// - "due" (daily cron): children with an open game whose deadline is tomorrow, or at most 7 days
//   away without a reminder about it yet in that time (a game added late is caught up at once)
// - "all" (Admin API, e.g. 3 days after the season links went out): every child with open games
// The first reminder about a child goes to one parent; if it stays open, later ones go to all
// its parents. At most one reminder per parent a day; nothing once all games are answered.
import { answerUrl } from './answer-link.ts';
import { groupByStatus } from './answers.ts';
import type { Answer, CoachEvent, TeamPlayer } from './coach.ts';
import type { Db } from './db/client.ts';
import { deadline, isoDay, shortDate, weekday } from './format.ts';
import {
  answerButtons,
  escapeHtml,
  familyPageUrl,
  mailFrame,
  primaryButton,
  smallPrint,
} from './mail-html.ts';
import type { Mail } from './mail.ts';
import { isOpen } from './season-state.ts';
import { loadSeason, needsAnswer, type SeasonEvent } from './season.ts';

export type ReminderMode = 'due' | 'all';

export type ReminderChild = {
  playerId: string;
  firstName: string;
  teamName: string;
  games: SeasonEvent[];
};

export type Reminder = {
  guardianId: string;
  name: string;
  email: string;
  accessTokenHash: string;
  accessTokenSealed: string | null;
  children: ReminderChild[];
};

/** First reminder this many days before the deadline (later for late games); last one the day before */
export const FIRST_DAYS = 7;
/** A parent gets no second reminder within this time */
const PAUSE_HOURS = 20;

function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The day the family has to answer by: the deadline, or the game itself without one. */
function answerDay(game: SeasonEvent) {
  return isoDay(game.respondBy ?? game.startsAt);
}

/** Who gets a reminder now, and about which children and games. */
export async function planReminders(
  db: Db,
  options: { mode: ReminderMode; teamId?: string },
  now = new Date(),
) {
  const today = isoDay(now.toISOString());

  const guardians = await db.query<{
    id: string;
    name: string;
    email: string;
    access_token_hash: string;
    access_token_sealed: string | null;
    reminded_recently: boolean;
  }>(
    `SELECT DISTINCT g.id, g.name, g.email, g.access_token_hash, g.access_token_sealed,
            EXISTS (SELECT 1 FROM reminder_mail rm
                     WHERE rm.guardian_id = g.id AND rm.sent_at > $2) AS reminded_recently
       FROM guardian g
       JOIN guardianship gs ON gs.guardian_id = g.id
       JOIN team_member m ON m.player_id = gs.player_id AND m.active
      WHERE $1::uuid IS NULL OR m.team_id = $1
      ORDER BY g.name, g.id`,
    [options.teamId ?? null, new Date(now.getTime() - PAUSE_HOURS * 3_600_000)],
  );
  // Parents per child in a fixed order: the first one gets the first reminder
  const parents = new Map(
    (
      await db.query<{ player_id: string; guardian_ids: string[] }>(
        `SELECT gs.player_id, array_agg(g.id ORDER BY g.name, g.id) AS guardian_ids
           FROM guardianship gs JOIN guardian g ON g.id = gs.guardian_id
          GROUP BY gs.player_id`,
      )
    ).map((row) => [row.player_id, row.guardian_ids]),
  );
  const remindedBefore = new Set(
    (
      await db.query<{ player_id: string }>(
        'SELECT DISTINCT unnest(player_ids) AS player_id FROM reminder_mail',
      )
    ).map((row) => row.player_id),
  );

  // Last reminder day per child and game, to catch up on games that came in late
  const remindedOn = new Map(
    (
      await db.query<{ player_id: string; event_id: string; sent_at: Date }>(
        `SELECT p.player_id, e.event_id, max(rm.sent_at) AS sent_at
           FROM reminder_mail rm, unnest(rm.player_ids) p(player_id), unnest(rm.event_ids) e(event_id)
          GROUP BY p.player_id, e.event_id`,
      )
    ).map((row) => [
      `${row.player_id} ${row.event_id}`,
      isoDay(new Date(row.sent_at).toISOString()),
    ]),
  );
  const isDue = (playerId: string, game: SeasonEvent) => {
    const day = answerDay(game);
    if (day === addDays(today, 1)) return true;
    if (day < today || day > addDays(today, FIRST_DAYS)) return false;
    if (new Date(game.respondBy ?? game.startsAt) <= now) return false;
    const last = remindedOn.get(`${playerId} ${game.id}`);
    return !last || last < addDays(day, -FIRST_DAYS);
  };

  const teams = options.teamId
    ? await db.query<{ name: string; season: number }>(
        'SELECT name, season FROM team WHERE id = $1',
        [options.teamId],
      )
    : undefined;

  const reminders: Reminder[] = [];
  for (const guardian of guardians) {
    if (guardian.reminded_recently) continue;
    const children: ReminderChild[] = [];
    for (const child of await loadSeason(db, guardian.id, now)) {
      if (teams && !teams.some((t) => t.name === child.teamName && t.season === child.season))
        continue;
      const open = child.games.filter((g) => isOpen(g) && new Date(g.startsAt) > now);
      if (open.length === 0) continue;
      if (options.mode === 'due' && !open.some((g) => isDue(child.playerId, g))) continue;
      const first = !remindedBefore.has(child.playerId);
      if (first && parents.get(child.playerId)?.[0] !== guardian.id) continue;
      children.push({
        playerId: child.playerId,
        firstName: child.firstName,
        teamName: child.teamName,
        games: open,
      });
    }
    if (children.length === 0) continue;
    reminders.push({
      guardianId: guardian.id,
      name: guardian.name,
      email: guardian.email,
      accessTokenHash: guardian.access_token_hash,
      accessTokenSealed: guardian.access_token_sealed,
      children,
    });
  }
  return reminders;
}

function joinNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0];
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many.replace('#', String(n));
}

/** "Noch 2 Zusagen bis 9 Spieler", or nothing if the team is complete or has no minimum */
function need(game: SeasonEvent) {
  if (!game.minPlayers || game.confirmed >= game.minPlayers) return undefined;
  return plural(
    game.minPlayers - game.confirmed,
    `Noch 1 Zusage bis ${game.minPlayers} Spieler`,
    `Noch # Zusagen bis ${game.minPlayers} Spieler`,
  );
}

/** The reminder (mockup: Eltern-Mail.dc.html): every open game with Dabei / Nicht dabei. */
export function reminderMail(reminder: Reminder, origin: string, key: string | undefined) {
  const open = reminder.children.reduce((sum, child) => sum + child.games.length, 0);
  const names = joinNames(reminder.children.map((c) => c.firstName));
  const subject = `${names}: noch ${plural(open, '1 Spiel', '# Spiele')} offen`;
  const teams = [...new Set(reminder.children.map((c) => c.teamName))].join(' + ');
  const intro = `für ${names} ${plural(open, 'ist noch 1 Spiel', 'sind noch # Spiele')} offen.`;
  const pageUrl = familyPageUrl(reminder.accessTokenSealed, key, origin);
  const answer = (child: ReminderChild, game: SeasonEvent, status: 'in' | 'out') =>
    answerUrl(
      origin,
      { guardianId: reminder.guardianId, playerId: child.playerId, eventId: game.id, status },
      reminder.accessTokenHash,
      key,
    );
  const several = reminder.children.length > 1;
  const footer =
    'Diese Mail kommt nur, solange Spiele offen sind. Sind alle beantwortet, hören die Erinnerungen von selbst auf.';

  const text: string[] = [
    `Hallo ${reminder.name},`,
    '',
    `${intro} Ein Tipp genügt – ihr müsst nichts weiter öffnen.`,
  ];
  const html: string[] = [
    `<p style="margin:0 0 6px">Hallo ${escapeHtml(reminder.name)},</p>`,
    `<p style="margin:0 0 16px">${escapeHtml(intro)} Ein Tipp genügt – ihr müsst nichts weiter öffnen.</p>`,
  ];
  for (const child of reminder.children) {
    if (several) {
      text.push('', child.firstName.toUpperCase());
      html.push(
        `<p style="margin:20px 0 4px;color:#A3500F;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase">${escapeHtml(child.firstName)}</p>`,
      );
    }
    for (const game of child.games) {
      const date = `${weekday(game.startsAt)} ${shortDate(game.startsAt)}`;
      const notes = [
        need(game),
        game.respondBy && `Antwort bis ${deadline(game.respondBy)}`,
      ].filter((note): note is string => Boolean(note));
      const yes = answer(child, game, 'in');
      const no = answer(child, game, 'out');
      text.push('', `${date} · ${game.title}`, ...notes);
      if (yes && no) text.push(`Dabei: ${yes}`, `Nicht dabei: ${no}`);
      html.push(
        '<div style="border:1px solid #E3E3DE;border-radius:6px;padding:14px;margin:0 0 10px">',
        `<div style="font-weight:bold">${escapeHtml(`${date} · ${game.title}`)}</div>`,
        ...notes.map(
          (note) => `<div style="color:#6B6F68;font-size:14px">${escapeHtml(note)}</div>`,
        ),
      );
      if (yes && no) {
        html.push(answerButtons({ url: yes, label: 'Dabei' }, { url: no, label: 'Nicht dabei' }));
      }
      html.push('</div>');
    }
  }
  text.push(
    '',
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
    to: reminder.email,
    subject,
    text: text.join('\n'),
    html: mailFrame(`Bretten Kangaroos · ${teams}`, html),
  } satisfies Mail;
}

export type ReminderResult = {
  guardian: string;
  children: { name: string; openGames: number }[];
  sent: boolean;
  error?: string;
};

/** Plans, sends and logs the reminders. A failing mail doesn't stop the others. */
export async function sendReminders(
  db: Db,
  options: { mode: ReminderMode; teamId?: string; dryRun?: boolean },
  deps: { origin: string; key: string | undefined; send: (mail: Mail) => Promise<void> },
  now = new Date(),
) {
  const results: ReminderResult[] = [];
  for (const reminder of await planReminders(db, options, now)) {
    const result: ReminderResult = {
      guardian: reminder.name,
      children: reminder.children.map((c) => ({ name: c.firstName, openGames: c.games.length })),
      sent: false,
    };
    results.push(result);
    if (options.dryRun) continue;
    try {
      await deps.send(reminderMail(reminder, deps.origin, deps.key));
      await db.query(
        `INSERT INTO reminder_mail (guardian_id, kind, player_ids, event_ids, sent_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          reminder.guardianId,
          options.mode === 'due' ? 'due' : 'manual',
          reminder.children.map((c) => c.playerId),
          reminder.children.flatMap((c) => c.games.map((g) => g.id)),
          now,
        ],
      );
      result.sent = true;
    } catch (error) {
      // No addresses or links in the log (docs/tech.md, "Datenschutz")
      result.error = error instanceof Error ? error.message : String(error);
    }
  }
  return results;
}

export type PlanEntry = {
  /** Berlin day, YYYY-MM-DD */
  day: string;
  what: string;
  detail: string;
  status: 'sent' | 'planned';
};

/**
 * The reminder plan of one team for the coach area (mockup: Trainer-Uebersicht.dc.html): what went
 * out (per day and kind) and what the cron will send, as long as the children stay open.
 */
export async function teamReminderPlan(
  db: Db,
  teamId: string,
  overview: { players: TeamPlayer[]; events: CoachEvent[]; answers: Answer[] },
  now = new Date(),
) {
  const playerIds = new Set(overview.players.map((p) => p.id));
  const rows = await db.query<{
    guardian_id: string;
    kind: 'due' | 'manual';
    player_ids: string[];
    event_ids: string[];
    sent_at: Date;
  }>(
    `SELECT guardian_id, kind, player_ids, event_ids, sent_at FROM reminder_mail
      WHERE event_ids && ARRAY(SELECT id FROM event WHERE team_id = $1)
      ORDER BY sent_at`,
    [teamId],
  );
  const sent = new Map<
    string,
    { day: string; kind: string; parents: Set<string>; children: Set<string> }
  >();
  // Last reminder day per game, for the first reminder of games that came in late
  const remindedOn = new Map<string, string>();
  for (const row of rows) {
    const day = isoDay(new Date(row.sent_at).toISOString());
    for (const id of row.event_ids) remindedOn.set(id, day);
    const key = `${day} ${row.kind}`;
    const entry = sent.get(key) ?? { day, kind: row.kind, parents: new Set(), children: new Set() };
    entry.parents.add(row.guardian_id);
    for (const id of row.player_ids) if (playerIds.has(id)) entry.children.add(id);
    sent.set(key, entry);
  }

  const entries: PlanEntry[] = [...sent.values()].map((s) => ({
    day: s.day,
    what: s.kind === 'due' ? 'Erinnerung vor dem Stichtag' : 'Erinnerung an alle Offenen',
    detail: `${plural(s.children.size, '1 Kind', '# Kinder')}, ${plural(s.parents.size, '1 Elternteil', '# Eltern')}`,
    status: 'sent',
  }));

  // The cron runs once in the afternoon: today only counts while nothing went out yet
  const today = isoDay(now.toISOString());
  const sentToday = sent.has(`${today} due`);
  const nextRun = sentToday ? addDays(today, 1) : today;
  for (const game of overview.events) {
    if (!needsAnswer(game.type) || game.cancelled || new Date(game.startsAt) <= now) continue;
    const open = groupByStatus(game, overview.players, overview.answers).open.length;
    if (open === 0) continue;
    const by = game.respondBy ? 'Stichtag' : 'Spiel';
    const answerBy = isoDay(game.respondBy ?? game.startsAt);
    const dayBefore = addDays(answerBy, -1);
    const firstFrom = addDays(answerBy, -FIRST_DAYS);
    const last = remindedOn.get(game.id);
    // The first one on the 7th day before, or at the next run if the game came later
    const first = firstFrom > nextRun ? firstFrom : nextRun;
    const days = [
      ...((!last || last < firstFrom) && first !== dayBefore && first <= answerBy ? [first] : []),
      ...(dayBefore >= nextRun ? [dayBefore] : []),
    ];
    for (const day of days) {
      const before = Math.round((Date.parse(answerBy) - Date.parse(day)) / 86_400_000);
      entries.push({
        day,
        what:
          before === 0 ? `Am Tag des ${by}s` : `${plural(before, '1 Tag', '# Tage')} vor dem ${by}`,
        detail: `${weekday(game.startsAt)} ${shortDate(game.startsAt)} ${game.title} · ${open} offen`,
        status: 'planned',
      });
    }
  }
  return entries.sort((a, b) => a.day.localeCompare(b.day));
}
