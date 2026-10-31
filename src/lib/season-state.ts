// State changes of the season page, kept pure so the page can update at once and roll back.
import { isoDay, longMonth } from './format.ts';
import type { SeasonChild, SeasonEvent, Status } from './season.ts';

/** Open = needs an answer and has none (cancelled games don't count). */
export function isOpen(event: SeasonEvent) {
  return !event.cancelled && event.status === null;
}

export function openGames(child: SeasonChild) {
  return child.games.filter(isOpen);
}

function withStatus(event: SeasonEvent, status: Status | null) {
  const wasIn = event.status === 'in';
  const isIn = status === 'in';
  return { ...event, status, confirmed: event.confirmed + Number(isIn) - Number(wasIn) };
}

/** Sets the answer of one child for some events; the team count follows. */
export function applyStatus(
  children: SeasonChild[],
  playerId: string,
  statuses: Map<string, Status | null>,
) {
  const update = (events: SeasonEvent[]) =>
    events.map((e) => (statuses.has(e.id) ? withStatus(e, statuses.get(e.id) ?? null) : e));
  return children.map((child) =>
    child.playerId === playerId
      ? { ...child, games: update(child.games), trainings: update(child.trainings) }
      : child,
  );
}

/** The current answers of a child for some events, to roll back a failed save. */
export function currentStatuses(child: SeasonChild, eventIds: string[]) {
  const all = [...child.games, ...child.trainings];
  return new Map(eventIds.map((id) => [id, all.find((e) => e.id === id)?.status ?? null]));
}

function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The rest of this week (today to Sunday, Berlin days); when nothing is left, next week.
 * Null when neither week has anything.
 */
export function upcomingWeek(child: SeasonChild, today: string) {
  const all = [...child.games, ...child.trainings].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const weeks = [
    { label: 'Diese Woche', from: monday, start: today, to: addDays(monday, 6) },
    {
      label: 'Nächste Woche',
      from: addDays(monday, 7),
      start: addDays(monday, 7),
      to: addDays(monday, 13),
    },
  ] as const;
  for (const { label, from, start, to } of weeks) {
    const events = all.filter((e) => {
      const day = isoDay(e.startsAt);
      return day >= start && day <= to;
    });
    // from, to: YYYY-MM-DD, Monday and Sunday
    if (events.length > 0) return { label, from, to, events };
  }
  return null;
}

/** Trainings grouped by month ("Mai"), for the trainings tab. */
export function trainingsByMonth(child: SeasonChild) {
  const months: { label: string; trainings: SeasonEvent[] }[] = [];
  for (const training of child.trainings) {
    const label = longMonth(training.startsAt);
    const last = months.at(-1);
    if (last?.label === label) last.trainings.push(training);
    else months.push({ label, trainings: [training] });
  }
  return months;
}

export type Week = NonNullable<ReturnType<typeof upcomingWeek>>;
