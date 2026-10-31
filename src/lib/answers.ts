// Counting answers for the coach area. Same rules as for parents: no answer = open for games,
// "in" for trainings. Cancelled events count nothing.
import type { Answer, CoachEvent, TeamPlayer } from './coach.ts';
import { needsAnswer, type Status } from './season.ts';
import { shortDate, time, weekday } from './format.ts';

// eslint-disable-next-line no-restricted-syntax -- keeps the literal union, 'in' would widen to string
export function statusOf(event: CoachEvent, playerId: string, answers: Answer[]): Status | null {
  const answer = answers.find((a) => a.eventId === event.id && a.playerId === playerId);
  return answer?.status ?? (needsAnswer(event.type) ? null : 'in');
}

/** Children per answer: in, out and open (open only for games) */
export function groupByStatus(event: CoachEvent, players: TeamPlayer[], answers: Answer[]) {
  const groups = { in: [] as TeamPlayer[], out: [] as TeamPlayer[], open: [] as TeamPlayer[] };
  if (event.cancelled) return groups;
  for (const player of players) {
    groups[statusOf(event, player.id, answers) ?? 'open'].push(player);
  }
  return groups;
}

/** Children who answered every upcoming game ("Saison bestätigt") */
export function confirmedPlayers(games: CoachEvent[], players: TeamPlayer[], answers: Answer[]) {
  return players.filter((p) =>
    games.every((g) => g.cancelled || statusOf(g, p.id, answers) !== null),
  );
}

/** "Ella M., Noah S. und Mia K." */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

/** First names only, for texts in the WhatsApp group (no initials needed there) */
function firstNames(players: TeamPlayer[]) {
  return players.map((p) => p.name.split(' ')[0]);
}

/** WhatsApp text for one event, as in the mockup (Trainer-Termin) */
export function eventWhatsAppText(event: CoachEvent, open: TeamPlayer[]) {
  const day = `${weekday(event.startsAt)} ${shortDate(event.startsAt)}`;
  const lines = [`${day} ${event.title}`];
  if (event.cancelled) {
    lines.push(`Fällt aus${event.cancelReason ? ` (${event.cancelReason})` : ''}.`);
    return lines.join('\n');
  }
  const meet = event.meetAt ? `Treffpunkt ${time(event.meetAt)}` : null;
  const place = event.locationName ? ` · ${event.locationName}` : '';
  lines.push([meet, `Beginn ${time(event.startsAt)}`].filter(Boolean).join(', ') + place);
  if (event.coachNote) lines.push(event.coachNote);
  if (open.length > 0) {
    lines.push(`${joinNames(firstNames(open))}: bitte noch zu- oder absagen!`);
  }
  return lines.join('\n');
}

/** WhatsApp text for the whole season (Trainer-Übersicht) */
export function seasonWhatsAppText(teamName: string, season: number, openCount: number) {
  return [
    `${teamName}: Bitte für die Saison ${season} zu- oder absagen!`,
    openCount > 0 ? `Noch offen: ${openCount} ${openCount === 1 ? 'Kind' : 'Kinder'}.` : null,
    'Euren persönlichen Link habt ihr vom Trainer bekommen.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function whatsAppShareUrl(text: string, phone?: string) {
  const to = phone ? phone.replace(/[^\d]/g, '').replace(/^0/, '49') : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
