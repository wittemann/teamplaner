import { describe, expect, it } from 'vitest';
import { changesByPlayer, eventsInPeriod, holidayQuestions } from './absence-state.ts';
import { dayRange, isoDay } from './format.ts';
import type { SeasonChild, SeasonEvent } from './season.ts';

function event(id: string, startsAt: string, extra: Partial<SeasonEvent> = {}) {
  return {
    id,
    type: 'game',
    title: id,
    homeAway: null,
    meetAt: null,
    startsAt,
    endsAt: null,
    respondBy: null,
    locationName: null,
    locationUrl: null,
    minPlayers: null,
    coachNote: null,
    cancelled: false,
    cancelReason: null,
    status: null,
    confirmed: 0,
    ...extra,
  } satisfies SeasonEvent;
}

const ella: SeasonChild = {
  playerId: 'ella',
  firstName: 'Ella',
  teamName: 'Schüler',
  season: 2027,
  games: [
    event('night', '2027-05-17T22:30:00Z'), // Tue 18.05. 00:30 in Berlin
    event('cancelled', '2027-05-20T09:00:00Z', { cancelled: true }),
    event('june', '2027-06-05T09:00:00Z'),
  ],
  trainings: [event('training', '2027-05-25T16:00:00Z', { type: 'training' })],
};

const pfingsten = { name: 'Pfingstferien', from: '2027-05-18', to: '2027-05-29' };

describe('format days', () => {
  it('gives the Berlin day and short ranges', () => {
    expect(isoDay('2027-05-17T22:30:00Z')).toBe('2027-05-18');
    expect(dayRange('2027-05-18', '2027-05-29')).toBe('18.05.–29.05.');
    expect(dayRange('2027-05-18', '2027-05-18')).toBe('18.05.');
  });
});

describe('eventsInPeriod', () => {
  it('takes the events on the days of the period, without cancelled ones', () => {
    const { games, trainings } = eventsInPeriod(ella, pfingsten.from, pfingsten.to);
    expect(games.map((g) => g.id)).toEqual(['night']);
    expect(trainings.map((t) => t.id)).toEqual(['training']);
  });
});

describe('holidayQuestions', () => {
  const sommer = { name: 'Sommerferien', from: '2027-07-29', to: '2027-09-11' };

  it('asks about upcoming holidays with events', () => {
    expect(holidayQuestions([pfingsten, sommer], [ella], [], '2027-05-01')).toEqual([pfingsten]);
  });

  it('skips past holidays and those an absence covers', () => {
    expect(holidayQuestions([pfingsten], [ella], [], '2027-05-30')).toEqual([]);
    const absence = { id: 'a', playerId: 'ella', from: '2027-05-15', to: '2027-05-30', note: null };
    expect(holidayQuestions([pfingsten], [ella], [absence], '2027-05-01')).toEqual([]);
    // Entered while the holidays were already on: covers the rest
    const rest = { ...absence, from: '2027-05-20', to: '2027-05-29' };
    expect(holidayQuestions([pfingsten], [ella], [rest], '2027-05-20')).toEqual([]);
  });
});

describe('changesByPlayer', () => {
  it('groups changed answers per child', () => {
    const map = changesByPlayer(
      [
        { playerId: 'ella', eventId: 'a' },
        { playerId: 'ben', eventId: 'b' },
        { playerId: 'ella', eventId: 'c' },
      ],
      'out',
    );
    expect([...map.get('ella')!.entries()]).toEqual([
      ['a', 'out'],
      ['c', 'out'],
    ]);
    expect(map.get('ben')!.get('b')).toBe('out');
  });
});
