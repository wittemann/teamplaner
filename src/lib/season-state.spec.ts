import { describe, expect, it } from 'vitest';
import type { SeasonChild, SeasonEvent } from './season.ts';
import { applyStatus, currentStatuses, openGames } from './season-state.ts';

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
