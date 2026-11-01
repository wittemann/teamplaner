import { describe, expect, it } from 'vitest';
import type { CoachEvent } from './coach.ts';
import { eventFormValues, parseEventForm } from './event-form.ts';
import { berlinIso, timeInput } from './format.ts';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const game: CoachEvent = {
  id: 'e',
  teamId: 't',
  type: 'game',
  title: 'vs. Karlsruhe',
  homeAway: 'home',
  meetAt: '2027-05-08T07:30:00.000Z',
  startsAt: '2027-05-08T09:00:00.000Z',
  endsAt: null,
  respondBy: '2027-05-06T18:00:00.000Z',
  locationName: 'Kangaroos Ballpark',
  locationUrl: null,
  minPlayers: 9,
  coachNote: null,
  cancelled: false,
  cancelReason: null,
  opponent: null,
  seriesId: null,
  bsmMatchId: null,
};

describe('berlinIso / timeInput', () => {
  it('converts Berlin summer and winter time', () => {
    expect(berlinIso('2027-05-08', '11:00')).toBe('2027-05-08T09:00:00.000Z');
    expect(berlinIso('2027-01-16', '11:00')).toBe('2027-01-16T10:00:00.000Z');
    // The day the clocks go forward (28 March 2027)
    expect(berlinIso('2027-03-28', '12:00')).toBe('2027-03-28T10:00:00.000Z');
    expect(timeInput('2027-05-08T07:30:00.000Z')).toBe('09:30');
  });
});

describe('parseEventForm', () => {
  it('round-trips an existing game', () => {
    const values = eventFormValues(game);
    expect(values).toMatchObject({ day: '2027-05-08', meetTime: '09:30', startTime: '11:00' });
    const result = parseEventForm(form(values), 'game', false);
    expect(result.ok && result.fields).toEqual({
      type: 'game',
      title: 'vs. Karlsruhe',
      homeAway: 'home',
      meetAt: game.meetAt,
      startsAt: game.startsAt,
      endsAt: null,
      respondBy: game.respondBy,
      locationName: 'Kangaroos Ballpark',
      locationUrl: null,
      minPlayers: 9,
    });
  });

  it('clears empty fields and keeps the type of an existing date', () => {
    const result = parseEventForm(
      form({ type: 'tournament', title: 'vs. Karlsruhe', day: '2027-05-15', startTime: '14:00' }),
      'game',
      false,
    );
    expect(result.ok && result.fields).toMatchObject({
      type: 'game',
      meetAt: null,
      respondBy: null,
      minPlayers: null,
      locationName: null,
    });
  });

  it('drops deadline and minimum for trainings, home/away for non-games', () => {
    const result = parseEventForm(
      form({
        type: 'training',
        title: 'Training',
        homeAway: 'home',
        day: '2027-05-11',
        startTime: '17:30',
        respondDay: '2027-05-10',
        minPlayers: '9',
      }),
      'tournament',
      true,
    );
    expect(result.ok && result.fields).toMatchObject({
      type: 'training',
      homeAway: null,
      respondBy: null,
      minPlayers: null,
    });
  });

  it('uses 20:00 as deadline time when none is given', () => {
    const result = parseEventForm(
      form({ title: 'Cup', day: '2027-06-05', startTime: '10:00', respondDay: '2027-06-03' }),
      'tournament',
      true,
    );
    expect(result.ok && result.fields.respondBy).toBe('2027-06-03T18:00:00.000Z');
  });

  it('reports missing and invalid fields', () => {
    const result = parseEventForm(
      form({
        title: '',
        day: '',
        startTime: '11:00',
        endTime: '10:00',
        minPlayers: 'neun',
        locationUrl: 'maps',
      }),
      'game',
      false,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'day',
      'locationUrl',
      'minPlayers',
      'title',
    ]);
  });
});
