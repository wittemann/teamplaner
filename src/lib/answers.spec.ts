import { describe, expect, it } from 'vitest';
import {
  confirmedPlayers,
  eventWhatsAppText,
  groupByStatus,
  joinNames,
  whatsAppShareUrl,
} from './answers.ts';
import type { Answer, CoachEvent } from './coach.ts';

function event(id: string, type: CoachEvent['type'], extra: Partial<CoachEvent> = {}) {
  return {
    id,
    teamId: 't',
    type,
    title: 'vs. Heidelberg',
    homeAway: 'home',
    meetAt: '2027-04-17T07:30:00.000Z',
    startsAt: '2027-04-17T09:00:00.000Z',
    endsAt: null,
    respondBy: null,
    locationName: 'Kangaroos Ballpark',
    locationUrl: null,
    minPlayers: 9,
    coachNote: null,
    cancelled: false,
    cancelReason: null,
    opponent: null,
    seriesId: null,
    bsmMatchId: null,
    ...extra,
  } satisfies CoachEvent;
}

const ella = { id: 'ella', name: 'Ella M.' };
const noah = { id: 'noah', name: 'Noah S.' };
const mia = { id: 'mia', name: 'Mia K.' };
const players = [ella, noah, mia];

function answer(eventId: string, playerId: string, status: Answer['status']) {
  return {
    eventId,
    playerId,
    status,
    updatedAt: '2027-04-01T10:00:00.000Z',
    late: false,
  } satisfies Answer;
}

describe('answers', () => {
  it('counts no answer as open for games and as in for trainings', () => {
    const answers = [answer('g', 'ella', 'in'), answer('t', 'noah', 'out')];
    expect(groupByStatus(event('g', 'game'), players, answers)).toEqual({
      in: [ella],
      out: [],
      open: [noah, mia],
    });
    expect(groupByStatus(event('t', 'training'), players, answers)).toEqual({
      in: [ella, mia],
      out: [noah],
      open: [],
    });
  });

  it('counts children who answered all games, ignoring cancelled ones', () => {
    const games = [event('g1', 'game'), event('g2', 'game', { cancelled: true })];
    const answers = [answer('g1', 'ella', 'in'), answer('g1', 'noah', 'out')];
    expect(confirmedPlayers(games, players, answers)).toEqual([ella, noah]);
  });

  it('joins names in German', () => {
    expect(joinNames(['Mia'])).toBe('Mia');
    expect(joinNames(['Mia', 'Lea'])).toBe('Mia und Lea');
    expect(joinNames(['Mia', 'Lea', 'Ben'])).toBe('Mia, Lea und Ben');
  });

  it('writes the WhatsApp text of an event', () => {
    const text = eventWhatsAppText(event('g', 'game', { coachNote: 'Weiße Hosen.' }), [mia, noah]);
    expect(text).toBe(
      'Sa 17.04. vs. Heidelberg\n' +
        'Treffpunkt 9:30, Beginn 11:00 · Kangaroos Ballpark\n' +
        'Weiße Hosen.\n' +
        'Mia und Noah: bitte noch zu- oder absagen!',
    );
  });

  it('builds wa.me links, with German numbers in international form', () => {
    expect(whatsAppShareUrl('Hi du')).toBe('https://wa.me/?text=Hi%20du');
    expect(whatsAppShareUrl('Hi', '0171 234567')).toBe('https://wa.me/49171234567?text=Hi');
    expect(whatsAppShareUrl('Hi', '+49 171 234567')).toBe('https://wa.me/49171234567?text=Hi');
  });
});
