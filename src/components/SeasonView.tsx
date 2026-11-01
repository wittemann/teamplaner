// The season of a family on one page (mockup: Eltern-Diese-Woche.dc.html): one button per
// child, "Diese Woche" with the next games and trainings, then tabs for all games (Dabei /
// Nicht dabei, "Bei allen offenen Spielen dabei") and all trainings (in by default, parents
// only opt out). Taps show at once; if saving fails, the answer goes back and a message says
// so. Below: absences and the question about the next school holidays (components/Absences.tsx).
import { actions } from 'astro:actions';
import { useEffect, useState } from 'preact/hooks';
import type { Absence, ChangedAnswer } from '../lib/absence.ts';
import { changesByPlayer, holidayQuestions, type Holiday } from '../lib/absence-state.ts';
import { dayOfMonth, dayRange, deadline, month, shortDate, time, weekday } from '../lib/format.ts';
import type { SeasonChild, SeasonEvent, Status } from '../lib/season.ts';
import {
  applyStatus,
  currentStatuses,
  EVENT_NEWS,
  findEvent,
  isOpen,
  openGames,
  trainingsByMonth,
  upcomingWeek,
  type Week,
} from '../lib/season-state.ts';
import { AbsenceSection, HolidayQuestion, type NewAbsence } from './Absences.tsx';
import PushSetup from './PushSetup.tsx';

type Props = {
  guardianName: string;
  initialChildren: SeasonChild[];
  initialAbsences: Absence[];
  holidays: Holiday[];
  /** YYYY-MM-DD in Berlin */
  today: string;
  /** https URL of the family's calendar (lib/calendar.ts) */
  calendarUrl?: string;
  /** VAPID public key; without it there are no notifications to offer */
  pushKey?: string;
  /** The event a tapped notification is about: it is shown, scrolled to and marked */
  focusEventId?: string;
  /** What is new about it (EVENT_NEWS); anything else shows no text */
  focusNews?: string;
};

const TAGS: Record<string, string> = { home: 'Heim', away: 'Auswärts', tournament: 'Turnier' };

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many.replace('#', String(n));
}

const NOT_SAVED =
  'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuch es noch einmal.';

// "Nein, wir sind da" is remembered in the browser only; storage may be blocked
const NO_KEY = 'ferien-nein';
function readNo() {
  try {
    return JSON.parse(localStorage.getItem(NO_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function holidayKey(h: Holiday) {
  return `${h.name}:${h.from}`;
}

export default function SeasonView({
  guardianName,
  initialChildren,
  initialAbsences,
  holidays,
  today,
  calendarUrl,
  pushKey,
  focusEventId,
  focusNews,
}: Props) {
  const [children, setChildren] = useState(initialChildren);
  const [absences, setAbsences] = useState(initialAbsences);
  const focused = focusEventId ? findEvent(initialChildren, focusEventId) : undefined;
  const [selectedId, setSelectedId] = useState(focused?.playerId ?? initialChildren[0]?.playerId);
  const [tab, setTab] = useState<'games' | 'trainings' | null>(focused?.tab ?? null);
  const [error, setError] = useState<string | null>(null);
  // Read after the first render, so server and browser render the same
  const [saidNo, setSaidNo] = useState<string[] | null>(null);
  useEffect(() => setSaidNo(readNo()), []);
  useEffect(() => {
    if (!focusEventId) return;
    document.getElementById(`termin-${focusEventId}`)?.scrollIntoView({ block: 'center' });
    // A reload shows the plain page again
    history.replaceState(null, '', '/');
  }, []);
  const news =
    focusNews && Object.hasOwn(EVENT_NEWS, focusNews)
      ? EVENT_NEWS[focusNews as keyof typeof EVENT_NEWS]
      : undefined;
  const marked = (eventId: string) => (eventId === focusEventId ? { news } : undefined);
  const child = children.find((c) => c.playerId === selectedId) ?? children[0];

  if (!child) {
    return (
      <div class="bg-chalk px-4 py-7">
        <h1 class="heading text-4xl">Keine Termine</h1>
        <p class="mt-3">Für deine Kinder stehen gerade keine Termine an.</p>
      </div>
    );
  }

  async function save(eventIds: string[], status: Status) {
    const playerId = child.playerId;
    const before = currentStatuses(child, eventIds);
    setError(null);
    setChildren((all) => applyStatus(all, playerId, new Map(eventIds.map((id) => [id, status]))));
    const { error } = await actions.setResponses({ playerId, eventIds, status });
    if (error) {
      setChildren((all) => applyStatus(all, playerId, before));
      setError(NOT_SAVED);
    }
  }

  function applyChanges(changed: ChangedAnswer[], status: Status | null) {
    setChildren((all) =>
      [...changesByPlayer(changed, status)].reduce(
        (result, [playerId, statuses]) => applyStatus(result, playerId, statuses),
        all,
      ),
    );
  }

  async function addAbsence(absence: NewAbsence) {
    setError(null);
    const { data, error } = await actions.addAbsence(absence);
    if (error) {
      setError(NOT_SAVED);
      return false;
    }
    setAbsences((all) => [...all, ...data.absences].sort((a, b) => a.from.localeCompare(b.from)));
    applyChanges(data.changed, 'out');
    return true;
  }

  async function removeAbsence(absenceId: string) {
    setError(null);
    const { data, error } = await actions.removeAbsence({ absenceId });
    if (error) {
      setError(NOT_SAVED);
      return;
    }
    setAbsences((all) => all.filter((a) => a.id !== absenceId));
    applyChanges(data.changed, null);
  }

  function sayNo(holiday: Holiday) {
    const next = [...(saidNo ?? []), holidayKey(holiday)];
    setSaidNo(next);
    try {
      localStorage.setItem(NO_KEY, JSON.stringify(next));
    } catch {
      // Not remembered – the question comes back next time
    }
  }

  const question =
    saidNo &&
    holidayQuestions(holidays, children, absences, today).find(
      (h) => !saidNo.includes(holidayKey(h)),
    );

  const open = openGames(child);
  const answerable = child.games.filter((g) => !g.cancelled);
  const answered = answerable.length - open.length;
  const week = upcomingWeek(child, today);
  // Without games (winter) the trainings come first
  const shownTab = tab ?? (child.games.length === 0 ? 'trainings' : 'games');

  return (
    <>
      <div class="border-b border-line bg-chalk px-4 pt-7 pb-5.5">
        <p class="label mb-1.5">
          Saison {child.season}
          {/* With several children the buttons below name them */}
          {children.length === 1 && ` · ${child.firstName} · ${child.teamName}`}
        </p>
        <h1 class="heading text-4xl leading-tight">Unsere Termine</h1>
        {children.length > 1 && (
          <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Kind auswählen">
            {children.map((c) => (
              <button
                key={c.playerId}
                type="button"
                aria-pressed={c.playerId === child.playerId}
                onClick={() => setSelectedId(c.playerId)}
                class={`min-h-11 rounded-full border-2 px-4.5 text-base font-semibold ${
                  c.playerId === child.playerId
                    ? 'border-forest bg-forest text-white'
                    : 'border-pill bg-white text-ink'
                }`}
              >
                {c.firstName} · {c.teamName}
                {openGames(c).length === 0 && ' ✓'}
              </button>
            ))}
          </div>
        )}
      </div>

      {focusEventId && !focused && (
        <p role="status" class="mx-4 mt-4 rounded-md bg-note-bg px-4 py-3 text-[15px] text-ink">
          Dieser Termin ist schon vorbei.
        </p>
      )}

      {week && <ThisWeek week={week} onAnswer={(id, status) => save([id], status)} />}

      <div class="flex flex-col gap-3.5 px-4 pt-6 pb-2">
        <div class="flex items-baseline justify-between">
          <strong class="text-lg text-ink">
            {open.length > 0
              ? plural(open.length, 'Noch 1 Spiel offen', 'Noch # Spiele offen')
              : 'Saison bestätigt ✓'}
          </strong>
          <span class="text-[15px] text-text-light">
            {answered} von {answerable.length} beantwortet
          </span>
        </div>
        <div
          class="h-2.5 overflow-hidden rounded-full bg-line"
          role="img"
          aria-label={`${answered} von ${answerable.length} beantwortet`}
        >
          <div
            class="h-2.5 bg-jersey transition-[width]"
            style={{ width: `${answerable.length ? (answered / answerable.length) * 100 : 100}%` }}
          />
        </div>
        {open.length > 0 && (
          <button
            type="button"
            onClick={() =>
              save(
                open.map((g) => g.id),
                'in',
              )
            }
            class="min-h-13 w-full rounded bg-rust font-condensed text-xl font-semibold tracking-[0.04em] text-white uppercase hover:bg-rust-dark"
          >
            Bei allen offenen Spielen dabei
          </button>
        )}
      </div>

      {pushKey && <PushSetup as="family" publicKey={pushKey} class="mx-4 mt-4" />}

      {question && (
        <HolidayQuestion
          holiday={question}
          onNo={() => sayNo(question)}
          onYes={() =>
            addAbsence({
              playerIds: children.map((c) => c.playerId),
              from: question.from < today ? today : question.from,
              to: question.to,
              note: question.name,
            })
          }
        />
      )}

      {error && (
        <p
          role="alert"
          class="mx-4 mt-3 rounded-md bg-note-bg px-4 py-3 text-[15px] font-semibold text-rust-dark"
        >
          {error}
        </p>
      )}

      <section class="px-4 pt-5">
        <div role="tablist" aria-label="Termine" class="grid grid-cols-2 border-b-2 border-line">
          <Tab
            id="games"
            selected={shownTab === 'games'}
            onSelect={() => setTab('games')}
            label="Spiele"
            badge={open.length > 0 ? `${open.length} offen` : 'alle ✓'}
            warn={open.length > 0}
          />
          <Tab
            id="trainings"
            selected={shownTab === 'trainings'}
            onSelect={() => setTab('trainings')}
            label="Trainings"
            badge={String(child.trainings.filter((t) => !t.cancelled).length)}
          />
        </div>
        <div role="tabpanel" id={`panel-${shownTab}`} aria-labelledby={`tab-${shownTab}`}>
          {shownTab === 'games' ? (
            <div class="flex flex-col gap-3 pt-4">
              {child.games.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  mark={marked(g.id)}
                  onAnswer={(status) => save([g.id], status)}
                />
              ))}
              {child.games.length === 0 && <p>Noch keine Spiele eingetragen.</p>}
            </div>
          ) : (
            <Trainings
              child={child}
              marked={marked}
              onAnswer={(id, status) => save([id], status)}
            />
          )}
        </div>
      </section>

      <AbsenceSection
        children={children}
        absences={absences}
        holidays={holidays}
        today={today}
        onAdd={addAbsence}
        onRemove={removeAbsence}
      />

      <div class="flex flex-col gap-2.5 px-4 pt-7 pb-10 text-[15px]">
        {calendarUrl && <CalendarLink url={calendarUrl} />}
        <span class="text-text-light">
          Dieser Link ist nur für {guardianName}. Bitte nicht weitergeben.
        </span>
      </div>
    </>
  );
}

/** A notification led to this event; `news` says why, for those who didn't read it. */
type Mark = { news?: string };

function NewsLabel({ mark }: { mark: Mark }) {
  if (!mark.news) return null;
  return (
    <p class="mb-2 text-sm font-semibold tracking-[0.06em] text-jersey uppercase">
      Neu: {mark.news}
    </p>
  );
}

function CoachNote({ note }: { note: string }) {
  return (
    <div class="mt-3 flex gap-2 rounded bg-note-bg px-3 py-2.5 text-[15px] leading-snug text-[#3A3F38]">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#A3500F"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="mt-px shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span>
        <strong class="text-ink">Hinweis vom Trainer:</strong> {note}
      </span>
    </div>
  );
}

function GameCard({
  game,
  mark,
  onAnswer,
}: {
  game: SeasonEvent;
  mark?: Mark;
  onAnswer: (s: Status) => void;
}) {
  const open = isOpen(game);
  const late = game.respondBy !== null && new Date(game.respondBy) < new Date();
  const tag = TAGS[game.type === 'tournament' ? 'tournament' : (game.homeAway ?? '')];
  const missing = game.minPlayers ? game.minPlayers - game.confirmed : 0;
  const choice = (status: Status) =>
    `min-h-12 rounded border-2 text-[17px] font-semibold ${
      game.status === status
        ? status === 'in'
          ? 'border-jersey bg-jersey text-white'
          : 'border-rust bg-rust text-white'
        : 'border-pill bg-white text-ink'
    }`;

  return (
    <article
      id={`termin-${game.id}`}
      class={`rounded-md bg-white p-4 ${open ? 'border-2 border-rust' : 'border border-line'} ${
        game.cancelled && !mark ? 'opacity-60' : ''
      } ${mark ? 'ring-3 ring-jersey' : ''}`}
    >
      {mark && <NewsLabel mark={mark} />}
      <div class="flex gap-3.5">
        <div class="flex w-14 shrink-0 flex-col rounded bg-chalk py-1.5 text-center leading-tight">
          <span class="text-[13px] font-semibold text-text-light uppercase">
            {weekday(game.startsAt)}
          </span>
          <span class="font-condensed text-[28px] font-bold text-ink">
            {dayOfMonth(game.startsAt)}
          </span>
          <span class="text-[13px] font-semibold text-text-light uppercase">
            {month(game.startsAt)}
          </span>
        </div>
        <div class="flex min-w-0 flex-col gap-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="text-lg text-ink">{game.title}</strong>
            {tag && (
              <span class="rounded-full bg-line px-2 py-px text-[13px] font-semibold text-[#3A3F38]">
                {tag}
              </span>
            )}
          </div>
          {game.cancelled ? (
            <span class="text-[15px] font-semibold text-rust">
              Fällt aus{game.cancelReason && ` · ${game.cancelReason}`}
            </span>
          ) : (
            <>
              <span class="text-[15px]">
                {game.meetAt && `Treffpunkt ${time(game.meetAt)} · `}
                {game.type === 'tournament' ? 'Beginn' : 'Spielbeginn'} {time(game.startsAt)}
              </span>
              {game.locationName &&
                (game.locationUrl ? (
                  <a href={game.locationUrl} target="_blank" rel="noreferrer" class="text-[15px]">
                    {game.locationName}
                  </a>
                ) : (
                  <span class="text-[15px] text-text-light">{game.locationName}</span>
                ))}
              {game.minPlayers !== null && (
                <span
                  class={`text-[15px] font-semibold ${missing > 0 ? 'text-rust' : 'text-jersey'}`}
                >
                  {missing > 0
                    ? plural(
                        missing,
                        `Noch 1 Zusage bis ${game.minPlayers} Spieler`,
                        `Noch # Zusagen bis ${game.minPlayers} Spieler`,
                      )
                    : `${game.confirmed} dabei – genug Spieler`}
                </span>
              )}
              {game.respondBy && (
                <span class="text-sm text-text-light">
                  {late
                    ? `Stichtag war ${weekday(game.respondBy)} ${shortDate(game.respondBy)}`
                    : `Antwort bis ${deadline(game.respondBy)}`}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {game.coachNote && !game.cancelled && <CoachNote note={game.coachNote} />}

      {!game.cancelled && (
        <>
          {open && (
            <p class="mt-3 text-sm font-semibold tracking-[0.06em] text-rust uppercase">
              Noch offen – bitte zu- oder absagen
            </p>
          )}
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={game.status === 'in'}
              class={choice('in')}
              onClick={() => onAnswer('in')}
            >
              Dabei
            </button>
            <button
              type="button"
              aria-pressed={game.status === 'out'}
              class={choice('out')}
              onClick={() => onAnswer('out')}
            >
              Nicht dabei
            </button>
          </div>
          {late && (
            <p class="mt-2 text-sm text-text-light">
              Stichtag vorbei – Änderungen gehen direkt an den Trainer.
            </p>
          )}
        </>
      )}
    </article>
  );
}

function Tab(props: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  label: string;
  badge: string;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${props.id}`}
      aria-selected={props.selected}
      aria-controls={`panel-${props.id}`}
      onClick={props.onSelect}
      class={`-mb-0.5 flex min-h-13 items-center justify-center gap-2 border-b-3 font-condensed text-xl font-bold tracking-[0.04em] uppercase ${
        props.selected ? 'border-jersey text-ink' : 'border-transparent text-text-light'
      }`}
    >
      {props.label}
      <span
        class={`rounded-full px-2 py-px font-sans text-[13px] font-semibold tracking-normal normal-case ${
          props.warn ? 'bg-rust text-white' : 'bg-line text-[#3A3F38]'
        }`}
      >
        {props.badge}
      </span>
    </button>
  );
}

/** The next games and trainings, each with its one quick answer. */
function ThisWeek({
  week,
  onAnswer,
}: {
  week: Week;
  onAnswer: (eventId: string, status: Status) => void;
}) {
  return (
    <section class="flex flex-col gap-2 px-4 pt-5">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="heading text-[26px]">{week.label}</h2>
        <span class="text-sm text-text-light">{dayRange(week.from, week.to)}</span>
      </div>
      {week.events.map((e) => {
        const training = e.type === 'training';
        const out = e.status === 'out';
        const open = !training && isOpen(e);
        return (
          <div
            key={e.id}
            class={`rounded-md px-3 py-2.5 ${
              training
                ? out
                  ? 'bg-note-bg'
                  : 'bg-chalk'
                : `border-2 bg-white ${open ? 'border-rust' : 'border-line'}`
            } ${e.cancelled ? 'opacity-60' : ''}`}
          >
            <div class="flex min-h-11 items-center gap-3">
              <div class="flex w-13 shrink-0 flex-col rounded bg-white py-1 text-center leading-tight">
                <span class="text-[13px] font-semibold text-text-light uppercase">
                  {weekday(e.startsAt)}
                </span>
                <span class="font-condensed text-2xl font-bold text-ink">
                  {dayOfMonth(e.startsAt)}
                </span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col leading-snug">
                <strong class="text-[17px] text-ink">{e.title}</strong>
                <span class="text-sm">
                  {e.meetAt ? `Treffpunkt ${time(e.meetAt)}` : time(e.startsAt)}
                  {e.endsAt && !e.meetAt && `–${time(e.endsAt)}`}
                  {e.locationName && ` · ${e.locationName}`}
                </span>
                <span
                  class={`text-sm font-semibold ${
                    e.cancelled ? 'text-text-light' : out || open ? 'text-rust' : 'text-jersey'
                  }`}
                >
                  {e.cancelled
                    ? `Fällt aus${e.cancelReason ? ` · ${e.cancelReason}` : ''}`
                    : open
                      ? 'Noch offen'
                      : out
                        ? training
                          ? 'Abgemeldet'
                          : 'Nicht dabei'
                        : 'Dabei ✓'}
                </span>
              </div>
              {!e.cancelled &&
                (training ? (
                  <AnswerButton
                    positive={out}
                    onClick={() => onAnswer(e.id, out ? 'in' : 'out')}
                    label={out ? 'Doch dabei' : 'Abmelden'}
                  />
                ) : (
                  e.status !== 'in' && (
                    <AnswerButton positive onClick={() => onAnswer(e.id, 'in')} label="Dabei" />
                  )
                ))}
            </div>
            {e.coachNote && !e.cancelled && <CoachNote note={e.coachNote} />}
          </div>
        );
      })}
    </section>
  );
}

function AnswerButton(props: { positive: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`min-h-11 shrink-0 rounded border-2 bg-white px-3 text-[15px] font-semibold ${
        props.positive ? 'border-jersey text-jersey' : 'border-pill text-ink'
      }`}
    >
      {props.label}
    </button>
  );
}

function Trainings({
  child,
  marked,
  onAnswer,
}: {
  child: SeasonChild;
  marked: (eventId: string) => Mark | undefined;
  onAnswer: (eventId: string, status: Status) => void;
}) {
  if (child.trainings.length === 0) return <p class="pt-4">Noch keine Trainings eingetragen.</p>;
  return (
    <div class="pt-4">
      <p class="rounded-md bg-[#EEF4E8] px-3.5 py-3 text-[15px] leading-snug text-ink">
        {child.firstName} ist bei jedem Training automatisch dabei. Tippe nur auf{' '}
        <strong>Abmelden</strong>, wenn {child.firstName} nicht kommen kann.
      </p>
      {trainingsByMonth(child).map((m) => (
        <div key={m.label}>
          <h3 class="heading mt-5 mb-1 text-xl">{m.label}</h3>
          <ul>
            {m.trainings.map((t) => {
              const mark = marked(t.id);
              return (
                <li
                  key={t.id}
                  id={`termin-${t.id}`}
                  class={`border-b border-line py-2 ${
                    mark ? 'my-2 rounded-md border-b-0 px-3 ring-3 ring-jersey' : ''
                  }`}
                >
                  {mark && <NewsLabel mark={mark} />}
                  <div class="flex min-h-12 items-center gap-3">
                    <div class="flex w-24 shrink-0 flex-col leading-tight">
                      <strong class="text-ink">
                        {weekday(t.startsAt)} {shortDate(t.startsAt)}
                      </strong>
                      <span class="text-sm text-text-light">
                        {time(t.startsAt)}
                        {t.endsAt && `–${time(t.endsAt)}`}
                      </span>
                    </div>
                    <div class="min-w-0 flex-1 text-[15px]">
                      {t.cancelled ? (
                        <span class="text-text-light">
                          Fällt aus{t.cancelReason && ` · ${t.cancelReason}`}
                        </span>
                      ) : t.status === 'out' ? (
                        <span class="font-semibold text-rust">Abgemeldet</span>
                      ) : (
                        <span class="font-semibold text-jersey">Dabei ✓</span>
                      )}
                    </div>
                    {!t.cancelled && (
                      <AnswerButton
                        positive={t.status === 'out'}
                        onClick={() => onAnswer(t.id, t.status === 'out' ? 'in' : 'out')}
                        label={t.status === 'out' ? 'Doch dabei' : 'Abmelden'}
                      />
                    )}
                  </div>
                  {t.coachNote && !t.cancelled && <CoachNote note={t.coachNote} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** webcal:// opens the subscription dialog on iPhone and Mac; Google Calendar needs the link. */
function CalendarLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="flex flex-col gap-1">
      <a href={url.replace(/^https?:/, 'webcal:')} class="font-semibold">
        Termine im Kalender abonnieren
      </a>
      <span class="text-text-light">
        Nur Termine, bei denen deine Kinder dabei sind. Für Google Kalender:{' '}
        <button
          type="button"
          class="font-semibold text-jersey underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              window.prompt('Kalender-Link', url);
            }
          }}
        >
          {copied ? 'Link kopiert ✓' : 'Link kopieren'}
        </button>{' '}
        und unter „Weitere Kalender → Per URL“ einfügen.
      </span>
    </div>
  );
}
