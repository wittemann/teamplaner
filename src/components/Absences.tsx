// Absence periods on the season page (docs/features.md, "Abwesenheit"): the question about the
// next school holidays, the list of entered absences and the form with the holiday quick-pick.
// Saving and the answer updates live in SeasonView; this file only shows and asks.
import { useState } from 'preact/hooks';
import type { Absence } from '../lib/absence.ts';
import { eventsInPeriod, type Holiday } from '../lib/absence-state.ts';
import { dayRange, shortDate, weekday } from '../lib/format.ts';
import type { SeasonChild } from '../lib/season.ts';

export type NewAbsence = { playerIds: string[]; from: string; to: string; note?: string };

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many.replace('#', String(n));
}

function names(children: SeasonChild[]) {
  const first = children.map((c) => c.firstName);
  return first.length > 1 ? `${first.slice(0, -1).join(', ')} und ${first.at(-1)}` : first[0];
}

/** "Seid ihr in den Pfingstferien weg?" – Ja enters the holidays for all children. */
export function HolidayQuestion({
  holiday,
  onYes,
  onNo,
}: {
  holiday: Holiday;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div class="mx-4 mt-4 flex flex-col gap-3 rounded-md border-2 border-jersey bg-white p-4">
      <div class="flex flex-col gap-0.5">
        <strong class="text-lg text-ink">Seid ihr in den {holiday.name} weg?</strong>
        <span class="text-[15px] text-text-light">
          {dayRange(holiday.from, holiday.to)} – dann tragen wir für alle Termine in der Zeit „Nicht
          dabei“ ein.
        </span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onYes}
          class="min-h-12 rounded border-2 border-jersey bg-jersey text-[17px] font-semibold text-white"
        >
          Ja, wir sind weg
        </button>
        <button
          type="button"
          onClick={onNo}
          class="min-h-12 rounded border-2 border-pill bg-white text-[17px] font-semibold text-ink"
        >
          Nein, wir sind da
        </button>
      </div>
    </div>
  );
}

export function AbsenceSection({
  children,
  absences,
  holidays,
  today,
  onAdd,
  onRemove,
}: {
  children: SeasonChild[];
  absences: Absence[];
  holidays: Holiday[];
  today: string;
  onAdd: (absence: NewAbsence) => Promise<boolean>;
  onRemove: (absenceId: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const childName = (id: string) => children.find((c) => c.playerId === id)?.firstName ?? '';

  return (
    <section class="px-4 pt-7">
      <h2 class="heading mb-3 text-[26px]">Abwesenheiten</h2>
      {absences.length > 0 ? (
        <ul class="mb-3 flex flex-col gap-2">
          {absences.map((a) => (
            <li
              key={a.id}
              class="flex min-h-16 items-center gap-3 rounded-md border border-line px-4 py-2"
            >
              <div class="flex min-w-0 flex-1 flex-col leading-snug">
                <strong class="text-ink">
                  {childName(a.playerId)} · {dayRange(a.from, a.to)}
                </strong>
                {a.note && <span class="text-[15px] text-text-light">{a.note}</span>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                class="min-h-11 rounded border-2 border-pill bg-white px-3.5 text-base font-semibold text-ink"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !formOpen && (
          <p class="mb-3 text-[15px] leading-snug">
            Im Urlaub? Trag die Zeit einmal ein – dann steht bei allen Spielen und Trainings in der
            Zeit „Nicht dabei“.
          </p>
        )
      )}
      {formOpen ? (
        <AbsenceForm
          children={children}
          holidays={holidays.filter((h) => h.to >= today)}
          today={today}
          onCancel={() => setFormOpen(false)}
          onSave={async (absence) => {
            if (await onAdd(absence)) setFormOpen(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          class="min-h-12 w-full rounded border-2 border-forest bg-white text-[17px] font-semibold text-forest"
        >
          Abwesenheit eintragen
        </button>
      )}
    </section>
  );
}

function AbsenceForm({
  children,
  holidays,
  today,
  onCancel,
  onSave,
}: {
  children: SeasonChild[];
  holidays: Holiday[];
  today: string;
  onCancel: () => void;
  onSave: (absence: NewAbsence) => Promise<void>;
}) {
  const [playerIds, setPlayerIds] = useState(children.map((c) => c.playerId));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = playerIds.length > 0 && from !== '' && to !== '' && to >= from;
  const chosen = children.filter((c) => playerIds.includes(c.playerId));
  const affected = valid ? chosen.map((c) => ({ child: c, ...eventsInPeriod(c, from, to) })) : [];
  const toggle = (id: string) =>
    setPlayerIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  const field = 'min-h-12 w-full rounded border-2 border-pill bg-white px-3 text-base text-ink';

  return (
    <form
      class="flex flex-col gap-4 rounded-md border border-line bg-chalk p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setSaving(true);
        await onSave({ playerIds, from, to, note: note.trim() || undefined });
        setSaving(false);
      }}
    >
      {children.length > 1 && (
        <fieldset class="flex flex-col gap-2">
          <legend class="label mb-2">Wer ist weg?</legend>
          {children.map((c) => (
            <label key={c.playerId} class="flex min-h-11 items-center gap-3 text-base">
              <input
                type="checkbox"
                checked={playerIds.includes(c.playerId)}
                onChange={() => toggle(c.playerId)}
                class="size-5 accent-forest"
              />
              {c.firstName} · {c.teamName}
            </label>
          ))}
        </fieldset>
      )}

      {holidays.length > 0 && (
        <div class="flex flex-col gap-2">
          <span class="label">Schulferien</span>
          <div class="flex flex-wrap gap-2">
            {holidays.map((h) => {
              const active = from === h.from && to === h.to;
              return (
                <button
                  key={h.name + h.from}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFrom(h.from < today ? today : h.from);
                    setTo(h.to);
                  }}
                  class={`min-h-11 rounded-full border-2 px-4 text-[15px] font-semibold ${
                    active ? 'border-forest bg-forest text-white' : 'border-pill bg-white text-ink'
                  }`}
                >
                  {h.name} {dayRange(h.from, h.to)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1">
          <span class="label">Von</span>
          <input
            type="date"
            required
            min={today}
            value={from}
            onInput={(e) => {
              const value = e.currentTarget.value;
              setFrom(value);
              if (!to || to < value) setTo(value);
            }}
            class={field}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="label">Bis</span>
          <input
            type="date"
            required
            min={from || today}
            value={to}
            onInput={(e) => setTo(e.currentTarget.value)}
            class={field}
          />
        </label>
      </div>

      <label class="flex flex-col gap-1">
        <span class="label">Notiz für den Trainer (optional)</span>
        <input
          type="text"
          maxLength={200}
          placeholder="z. B. Urlaub"
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
          class={field}
        />
      </label>

      {valid && (
        <div class="flex flex-col gap-1 text-[15px] leading-snug">
          {affected.map(({ child, games, trainings }) => (
            <span key={child.playerId}>
              {games.length + trainings.length === 0 ? (
                <>{child.firstName} hat in der Zeit keine Termine.</>
              ) : (
                <>
                  <strong class="text-ink">{child.firstName}</strong> fehlt dann bei{' '}
                  {[
                    games.length > 0 &&
                      `${plural(games.length, '1 Spiel', '# Spielen')} (${games
                        .map((g) => `${weekday(g.startsAt)} ${shortDate(g.startsAt)}`)
                        .join(', ')})`,
                    trainings.length > 0 && plural(trainings.length, '1 Training', '# Trainings'),
                  ]
                    .filter(Boolean)
                    .join(' und ')}
                  .
                </>
              )}
            </span>
          ))}
        </div>
      )}

      <div class="flex flex-col gap-2">
        <button
          type="submit"
          disabled={!valid || saving}
          class="min-h-13 w-full rounded bg-rust font-condensed text-xl font-semibold tracking-[0.04em] text-white uppercase hover:bg-rust-dark disabled:opacity-50"
        >
          {saving
            ? 'Wird gespeichert …'
            : chosen.length > 1
              ? `Für ${names(chosen)} eintragen`
              : 'Eintragen'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          class="min-h-11 text-base font-semibold text-jersey"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
