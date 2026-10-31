// The season of a family on one page (mockup: Main.dc.html, Eltern-Training.dc.html):
// one tab per child, games with Dabei / Nicht dabei, "Bei allen offenen Spielen dabei" and the
// trainings (in by default, parents only opt out). Taps show at once; if saving fails, the
// answer goes back and a message says so. Below: absences and the question about the next
// school holidays (components/Absences.tsx).
import { actions } from 'astro:actions';
import { useEffect, useState } from 'preact/hooks';
import type { Absence, ChangedAnswer } from '../lib/absence.ts';
import { changesByPlayer, holidayQuestions, type Holiday } from '../lib/absence-state.ts';
import { dayOfMonth, deadline, month, shortDate, time, weekday } from '../lib/format.ts';
import type { SeasonChild, SeasonEvent, Status } from '../lib/season.ts';
import { applyStatus, currentStatuses, isOpen, openGames } from '../lib/season-state.ts';
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
}: Props) {
  const [children, setChildren] = useState(initialChildren);
  const [absences, setAbsences] = useState(initialAbsences);
  const [selectedId, setSelectedId] = useState(initialChildren[0]?.playerId);
  const [error, setError] = useState<string | null>(null);
  // Read after the first render, so server and browser render the same
  const [saidNo, setSaidNo] = useState<string[] | null>(null);
  useEffect(() => setSaidNo(readNo()), []);
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

      <div class="flex flex-col gap-3.5 px-4 pt-5 pb-2">
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

      <section class="px-4 pt-4">
        <h2 class="heading mb-3 text-[26px]">Spiele</h2>
        <div class="flex flex-col gap-3">
          {child.games.map((g) => (
            <GameCard key={g.id} game={g} onAnswer={(status) => save([g.id], status)} />
          ))}
          {child.games.length === 0 && <p>Noch keine Spiele eingetragen.</p>}
        </div>
      </section>

      <Trainings child={child} onAnswer={(id, status) => save([id], status)} />

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

function GameCard({ game, onAnswer }: { game: SeasonEvent; onAnswer: (s: Status) => void }) {
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
      class={`rounded-md bg-white p-4 ${open ? 'border-2 border-rust' : 'border border-line'} ${
        game.cancelled ? 'opacity-60' : ''
      }`}
    >
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

      {game.coachNote && !game.cancelled && (
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
            <strong class="text-ink">Hinweis vom Trainer:</strong> {game.coachNote}
          </span>
        </div>
      )}

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

function Trainings({
  child,
  onAnswer,
}: {
  child: SeasonChild;
  onAnswer: (eventId: string, status: Status) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const optedOut = child.trainings.filter((t) => !t.cancelled && t.status === 'out').length;
  const count = plural(optedOut, '1 Abmeldung', '# Abmeldungen').replace(
    /^0 Abmeldungen$/,
    'Keine Abmeldung',
  );

  return (
    <section class="px-4 pt-7">
      <h2 class="heading mb-3 text-[26px]">Trainings</h2>
      <div class="flex flex-col gap-1.5 rounded-md border border-line p-4">
        <span class="text-[15px] leading-snug">
          {child.firstName} ist bei jedem Training automatisch dabei. Tippe nur auf{' '}
          <strong class="text-ink">Abmelden</strong>, wenn {child.firstName} nicht kommen kann.
        </span>
        <strong class="text-[15px] text-rust">{count}</strong>
        {child.trainings.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            class="mt-1 self-start text-base font-semibold text-jersey hover:text-forest"
          >
            {expanded
              ? 'Trainings ausblenden ↑'
              : `Alle ${child.trainings.length} Trainings ansehen →`}
          </button>
        )}
      </div>
      {expanded && (
        <ul class="mt-2">
          {child.trainings.map((t) => (
            <li key={t.id} class="flex min-h-16 items-center gap-3 border-b border-line py-2">
              <div class="flex w-24 shrink-0 flex-col leading-tight">
                <strong class="text-ink">
                  {weekday(t.startsAt)} {shortDate(t.startsAt)}
                </strong>
                <span class="text-sm text-text-light">{time(t.startsAt)}</span>
              </div>
              <div class="min-w-0 flex-1 text-[15px]">
                {t.cancelled ? (
                  <span class="text-text-light">
                    Fällt aus{t.cancelReason && ` · ${t.cancelReason}`}
                  </span>
                ) : t.status === 'out' ? (
                  <span class="font-semibold text-rust">Abgemeldet</span>
                ) : (
                  <span class="font-semibold text-jersey">Dabei</span>
                )}
              </div>
              {!t.cancelled &&
                (t.status === 'out' ? (
                  <button
                    type="button"
                    onClick={() => onAnswer(t.id, 'in')}
                    class="min-h-11 rounded border-2 border-jersey bg-white px-3.5 text-base font-semibold text-jersey"
                  >
                    Doch dabei
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAnswer(t.id, 'out')}
                    class="min-h-11 rounded border-2 border-pill bg-white px-3.5 text-base font-semibold text-ink"
                  >
                    Abmelden
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
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
