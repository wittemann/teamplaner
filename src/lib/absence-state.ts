// What the season page shows about absences, kept pure so it is testable: which events a period
// covers (the preview before saving) and which school holidays to ask about.
import type { Absence, ChangedAnswer } from './absence.ts';
import { isoDay } from './format.ts';
import type { SeasonChild, SeasonEvent, Status } from './season.ts';

export type Holiday = { name: string; from: string; to: string };

/** Upcoming, not cancelled events of a child on the days from–to (Berlin time). */
export function eventsInPeriod(child: SeasonChild, from: string, to: string) {
  const inside = (e: SeasonEvent) =>
    !e.cancelled && isoDay(e.startsAt) >= from && isoDay(e.startsAt) <= to;
  return { games: child.games.filter(inside), trainings: child.trainings.filter(inside) };
}

/** Covered from today on – the rest of a holiday that already started counts */
function covered(absences: Absence[], playerId: string, holiday: Holiday, today: string) {
  const start = holiday.from < today ? today : holiday.from;
  return absences.some((a) => a.playerId === playerId && a.from <= start && a.to >= holiday.to);
}

/**
 * Holidays worth asking "Seid ihr da weg?": not over yet, with events of a child in them,
 * and not already covered by an absence of every such child.
 */
export function holidayQuestions(
  holidays: Holiday[],
  children: SeasonChild[],
  absences: Absence[],
  today: string,
) {
  return holidays.filter((h) => {
    if (h.to < today) return false;
    const affected = children.filter((c) => {
      const { games, trainings } = eventsInPeriod(c, h.from, h.to);
      return games.length + trainings.length > 0;
    });
    return affected.length > 0 && affected.some((c) => !covered(absences, c.playerId, h, today));
  });
}

/** Turns the answers an absence changed into status updates per child. */
export function changesByPlayer(changed: ChangedAnswer[], status: Status | null) {
  const byPlayer = new Map<string, Map<string, Status | null>>();
  for (const { playerId, eventId } of changed) {
    const statuses = byPlayer.get(playerId) ?? new Map<string, Status | null>();
    statuses.set(eventId, status);
    byPlayer.set(playerId, statuses);
  }
  return byPlayer;
}
