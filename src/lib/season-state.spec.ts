import { describe, expect, it } from 'vitest';
import type { SeasonChild, SeasonEvent } from './season.ts';
import {
  applyStatus,
  currentStatuses,
  eventLink,
  findEvent,
  openGames,
  trainingsByMonth,
  upcomingWeek,
} from './season-state.ts';

function game(id: string, status: SeasonEvent['status'], confirmed = 5) {
  return {
    id,
    type: 'game',
    title: id,
    homeAway: 'home',
    meetAt: null,
    startsAt: '2027-04-17T09:00:00.000Z',
    endsAt: null,
    respondBy: null,
    locationName: null,
    locationUrl: null,
    minPlayers: 9,
    coachNote: null,
    cancelled: false,
    cancelReason: null,
    status,
    confirmed,
  } satisfies SeasonEvent;
}

const ella: SeasonChild = {
  playerId: 'ella',
  firstName: 'Ella',
  teamName: 'Schüler',
  season: 2027,
  games: [game('g1', 'in', 10), game('g2', null, 7), game('g3', 'out', 4)],
  trainings: [],
};

describe('season state', () => {
  it('finds the child and tab that show an event', () => {
    const noah = { ...ella, playerId: 'noah', games: [], trainings: [game('t1', null)] };
    expect(findEvent([ella, noah], 'g2')).toEqual({ playerId: 'ella', tab: 'games' });
    expect(findEvent([ella, noah], 't1')).toEqual({ playerId: 'noah', tab: 'trainings' });
    expect(findEvent([ella, noah], 'vorbei')).toBeUndefined();
  });

  it('links a push to its event', () => {
    expect(eventLink('g1', 'abgesagt')).toBe('/?termin=g1&neu=abgesagt');
  });

  it('lists open games, without cancelled ones', () => {
    const child = { ...ella, games: [...ella.games, { ...game('g4', null), cancelled: true }] };
    expect(openGames(child).map((g) => g.id)).toEqual(['g2']);
  });

  it('keeps the team count in step with the answer', () => {
    const [after] = applyStatus(
      [ella],
      'ella',
      new Map([
        ['g1', 'out'],
        ['g2', 'in'],
        ['g3', 'in'],
      ]),
    );
    expect(after.games.map((g) => [g.status, g.confirmed])).toEqual([
      ['out', 9],
      ['in', 8],
      ['in', 5],
    ]);
  });

  it('rolls back to the answers from before', () => {
    const before = currentStatuses(ella, ['g1', 'g2']);
    const [changed] = applyStatus([ella], 'ella', new Map([['g2', 'in']]));
    const [back] = applyStatus([changed], 'ella', before);
    expect(back.games).toEqual(ella.games);
  });

  it('leaves other children alone', () => {
    const ben = { ...ella, playerId: 'ben' };
    const [, benAfter] = applyStatus([ella, ben], 'ella', new Map([['g2', 'in']]));
    expect(benAfter).toBe(ben);
  });
});

describe('upcoming week', () => {
  // Di 20.04., Do 22.04., Di 27.04. (17:30 Berlin = 15:30 UTC), game Sa 24.04.
  const at = (day: string) =>
    ({
      ...game(day, null),
      type: 'training',
      startsAt: `${day}T15:30:00.000Z`,
    }) satisfies SeasonEvent;
  const child: SeasonChild = {
    ...ella,
    games: [{ ...game('g', null), startsAt: '2027-04-24T09:00:00.000Z' }],
    trainings: [at('2027-04-20'), at('2027-04-22'), at('2027-04-27')],
  };

  it('shows the rest of this week, games and trainings in time order', () => {
    const week = upcomingWeek(child, '2027-04-21');
    expect(week?.label).toBe('Diese Woche');
    expect([week?.from, week?.to]).toEqual(['2027-04-19', '2027-04-25']);
    expect(week?.events.map((e) => e.id)).toEqual(['2027-04-22', 'g']);
  });

  it('falls back to next week when this one has nothing left', () => {
    const week = upcomingWeek(child, '2027-04-25');
    expect(week?.label).toBe('Nächste Woche');
    expect(week?.events.map((e) => e.id)).toEqual(['2027-04-27']);
  });

  it('is empty when both weeks are', () => {
    expect(upcomingWeek(child, '2027-06-01')).toBeNull();
  });

  it('groups trainings by month', () => {
    const months = trainingsByMonth({ ...child, trainings: [at('2027-04-29'), at('2027-05-04')] });
    expect(months.map((m) => [m.label, m.trainings.length])).toEqual([
      ['April', 1],
      ['Mai', 1],
    ]);
  });
});
