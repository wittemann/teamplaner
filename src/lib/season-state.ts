// State changes of the season page, kept pure so the page can update at once and roll back.
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
