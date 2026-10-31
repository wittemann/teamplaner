// The form coaches use to create and change a date (/trainer/termin/neu, …/bearbeiten). Day and
// times are entered in Berlin time and become timestamps for the same fields the Admin API takes.
import type { z } from 'astro/zod';
import type { eventInput } from './admin/data.ts';
import type { CoachEvent } from './coach.ts';
import { berlinIso, isoDay, timeInput } from './format.ts';

export type EventFormValues = {
  type: CoachEvent['type'];
  title: string;
  homeAway: '' | 'home' | 'away';
  day: string;
  meetTime: string;
  startTime: string;
  endTime: string;
  respondDay: string;
  respondTime: string;
  locationName: string;
  locationUrl: string;
  minPlayers: string;
};

export type EventFormErrors = Partial<Record<keyof EventFormValues, string>>;

/** Without a deadline time the deadline is at 20:00, as the coaches are used to */
const DEFAULT_RESPOND_TIME = '20:00';

export const EVENT_TYPES: Record<CoachEvent['type'], string> = {
  game: 'Spiel',
  tournament: 'Turnier',
  training: 'Training',
  other: 'Sonstiges',
};

export function emptyEventForm(type: CoachEvent['type'] = 'game') {
  return {
    type,
    title: '',
    homeAway: '',
    day: '',
    meetTime: '',
    startTime: '',
    endTime: '',
    respondDay: '',
    respondTime: DEFAULT_RESPOND_TIME,
    locationName: '',
    locationUrl: '',
    minPlayers: '',
  } satisfies EventFormValues;
}

export function eventFormValues(event: CoachEvent) {
  return {
    type: event.type,
    title: event.title,
    homeAway: event.homeAway ?? '',
    day: isoDay(event.startsAt),
    meetTime: event.meetAt ? timeInput(event.meetAt) : '',
    startTime: timeInput(event.startsAt),
    endTime: event.endsAt ? timeInput(event.endsAt) : '',
    respondDay: event.respondBy ? isoDay(event.respondBy) : '',
    respondTime: event.respondBy ? timeInput(event.respondBy) : DEFAULT_RESPOND_TIME,
    locationName: event.locationName ?? '',
    locationUrl: event.locationUrl ?? '',
    minPlayers: event.minPlayers?.toString() ?? '',
  } satisfies EventFormValues;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function text(form: FormData, name: string) {
  return String(form.get(name) ?? '').trim();
}

type EventFields = Omit<z.infer<typeof eventInput>, 'seriesId' | 'bsmMatchId' | 'opponent'>;

/**
 * Reads the posted form. Empty fields become null, so clearing a field clears it in the database.
 * The type is taken from the form only for new dates (`allowType`).
 */
export function parseEventForm(form: FormData, current: CoachEvent['type'], allowType: boolean) {
  const typeText = text(form, 'type');
  const type = allowType && typeText in EVENT_TYPES ? (typeText as CoachEvent['type']) : current;
  const values: EventFormValues = {
    type,
    title: text(form, 'title'),
    homeAway: (['home', 'away'].includes(text(form, 'homeAway'))
      ? text(form, 'homeAway')
      : '') as EventFormValues['homeAway'],
    day: text(form, 'day'),
    meetTime: text(form, 'meetTime'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    respondDay: text(form, 'respondDay'),
    respondTime: text(form, 'respondTime') || DEFAULT_RESPOND_TIME,
    locationName: text(form, 'locationName'),
    locationUrl: text(form, 'locationUrl'),
    minPlayers: text(form, 'minPlayers'),
  };

  const errors: EventFormErrors = {};
  if (!values.title) errors.title = 'Bitte einen Titel eingeben, z. B. „vs. Heidelberg“.';
  if (values.title.length > 120) errors.title = 'Höchstens 120 Zeichen.';
  if (!DAY.test(values.day)) errors.day = 'Bitte das Datum angeben.';
  if (!TIME.test(values.startTime)) errors.startTime = 'Bitte die Uhrzeit angeben.';
  for (const field of ['meetTime', 'endTime', 'respondTime'] as const) {
    if (values[field] && !TIME.test(values[field])) errors[field] = 'Uhrzeit wie 09:30.';
  }
  if (values.respondDay && !DAY.test(values.respondDay)) errors.respondDay = 'Ungültiges Datum.';
  if (values.locationUrl && !URL.canParse(values.locationUrl)) {
    errors.locationUrl = 'Bitte einen vollständigen Link (https://…).';
  }
  const minPlayers = values.minPlayers ? Number(values.minPlayers) : null;
  if (minPlayers !== null && !(Number.isInteger(minPlayers) && minPlayers > 0 && minPlayers < 50)) {
    errors.minPlayers = 'Eine Zahl wie 9.';
  }
  if (Object.keys(errors).length === 0 && values.endTime && values.endTime <= values.startTime) {
    errors.endTime = 'Das Ende liegt vor dem Beginn.';
  }
  if (Object.keys(errors).length > 0) return { ok: false as const, values, errors };

  const isTraining = type === 'training';
  const at = (time: string) => (time ? berlinIso(values.day, time) : null);
  const fields: EventFields = {
    type,
    title: values.title,
    homeAway: type === 'game' ? values.homeAway || null : null,
    meetAt: at(values.meetTime),
    startsAt: berlinIso(values.day, values.startTime),
    endsAt: at(values.endTime),
    // Trainings need no answer, so no deadline
    respondBy:
      !isTraining && values.respondDay ? berlinIso(values.respondDay, values.respondTime) : null,
    locationName: values.locationName || null,
    locationUrl: values.locationUrl || null,
    minPlayers: isTraining ? null : minPlayers,
  };
  return { ok: true as const, values, fields };
}
