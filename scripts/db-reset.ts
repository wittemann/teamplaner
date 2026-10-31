// Recreates the local database (.pglite/) with the schema and made-up test data:
// season 2027, Schüler + Jugend, games, trainings and some answers.
// Local only: refuses to run when DATABASE_URL points to a real database.
import { rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { LOCAL_DB_DIR } from '../src/lib/db/client.ts';
import { hashToken } from '../src/lib/token.ts';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set: db:reset only resets the local database. Aborting.');
  process.exit(1);
}

rmSync(LOCAL_DB_DIR, { recursive: true, force: true });
const pg = new PGlite(LOCAL_DB_DIR);
await pg.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));

async function insert(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pg.query<{ id: string }>(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    Object.values(row),
  );
  return rows[0];
}

// The whole season is in summer time (CEST), so a fixed offset is fine for test data
function berlin(date: string, time: string) {
  return `${date}T${time}:00+02:00`;
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMinutes(date: string, time: string, minutes: number) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return berlin(
    date,
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
  );
}

// Deterministic "random" answers, so every reset gives the same data
let seed = 42;
function random() {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
}

const BALLPARK = {
  location_name: 'Kangaroos Ballpark',
  location_url: 'https://maps.google.com/?q=Kangaroos+Ballpark+Bretten',
};

type TeamSetup = {
  name: string;
  /** Families: last name → children's first names */
  kids: [string, string, number][];
  games: {
    date: string;
    time: string;
    title: string;
    opponent?: string;
    home_away?: 'home' | 'away';
    type?: 'tournament';
  }[];
  trainings: { weekdays: number[]; time: string; minutes: number; from: string; to: string };
};

const SCHUELER: TeamSetup = {
  name: 'Schüler',
  kids: [
    ['Ella', 'Müller', 2015],
    ['Noah', 'Schmidt', 2015],
    ['Mia', 'Schneider', 2016],
    ['Luca', 'Fischer', 2015],
    ['Emma', 'Weber', 2016],
    ['Finn', 'Meyer', 2015],
    ['Lina', 'Wagner', 2016],
    ['Paul', 'Becker', 2015],
    ['Clara', 'Hoffmann', 2016],
    ['Jonas', 'Schäfer', 2015],
    ['Lea', 'Koch', 2016],
    ['Elias', 'Bauer', 2015],
    ['Ida', 'Richter', 2016],
    ['Felix', 'Klein', 2015],
  ],
  games: [
    {
      date: '2027-04-17',
      time: '11:00',
      title: 'vs. Heidelberg',
      opponent: 'Heidelberg Hedgehogs',
      home_away: 'home',
    },
    {
      date: '2027-04-24',
      time: '11:30',
      title: 'bei Mannheim',
      opponent: 'Mannheim Tornados',
      home_away: 'away',
    },
    {
      date: '2027-05-08',
      time: '11:00',
      title: 'vs. Karlsruhe',
      opponent: 'Karlsruhe Cougars',
      home_away: 'home',
    },
    {
      date: '2027-05-22',
      time: '11:00',
      title: 'bei Pforzheim',
      opponent: 'Pforzheim Wilddogs',
      home_away: 'away',
    },
    { date: '2027-06-05', time: '10:00', title: 'Schüler-Cup', type: 'tournament' },
    {
      date: '2027-06-19',
      time: '11:00',
      title: 'vs. Mannheim',
      opponent: 'Mannheim Tornados',
      home_away: 'home',
    },
    {
      date: '2027-06-26',
      time: '11:00',
      title: 'bei Heidelberg',
      opponent: 'Heidelberg Hedgehogs',
      home_away: 'away',
    },
    {
      date: '2027-07-10',
      time: '11:00',
      title: 'vs. Pforzheim',
      opponent: 'Pforzheim Wilddogs',
      home_away: 'home',
    },
  ],
  // Tuesday + Thursday
  trainings: { weekdays: [2, 4], time: '17:30', minutes: 90, from: '2027-04-13', to: '2027-07-15' },
};

const JUGEND: TeamSetup = {
  name: 'Jugend',
  kids: [
    ['Ben', 'Müller', 2012],
    ['Leon', 'Schulz', 2011],
    ['Hanna', 'Zimmermann', 2012],
    ['Tim', 'Braun', 2011],
    ['Sophie', 'Krüger', 2012],
    ['Max', 'Hartmann', 2011],
    ['Lena', 'Lange', 2012],
    ['David', 'Werner', 2011],
    ['Nele', 'Krause', 2012],
    ['Moritz', 'Lehmann', 2011],
    ['Jana', 'Köhler', 2012],
    ['Erik', 'Maier', 2011],
  ],
  games: [
    {
      date: '2027-04-18',
      time: '12:00',
      title: 'vs. Stuttgart',
      opponent: 'Stuttgart Reds',
      home_away: 'home',
    },
    {
      date: '2027-05-02',
      time: '13:00',
      title: 'bei Tübingen',
      opponent: 'Tübingen Hawks',
      home_away: 'away',
    },
    {
      date: '2027-05-16',
      time: '12:00',
      title: 'vs. Ulm',
      opponent: 'Ulm Falcons',
      home_away: 'home',
    },
    {
      date: '2027-06-13',
      time: '12:00',
      title: 'bei Stuttgart',
      opponent: 'Stuttgart Reds',
      home_away: 'away',
    },
    {
      date: '2027-06-27',
      time: '12:00',
      title: 'vs. Tübingen',
      opponent: 'Tübingen Hawks',
      home_away: 'home',
    },
    {
      date: '2027-07-11',
      time: '12:00',
      title: 'bei Ulm',
      opponent: 'Ulm Falcons',
      home_away: 'away',
    },
  ],
  // Monday + Wednesday
  trainings: { weekdays: [1, 3], time: '18:00', minutes: 90, from: '2027-04-12', to: '2027-07-14' },
};

const HOLIDAYS: Record<string, string> = { '2027-05-06': 'Christi Himmelfahrt' };

const families = new Map<string, { id: string; token: string }>();

async function family(lastName: string) {
  let found = families.get(lastName);
  if (!found) {
    // Readable tokens for local testing; real ones come from newAccessToken()
    const token = `dev-${lastName.toLowerCase().replace('ü', 'ue').replace('ä', 'ae').replace('ö', 'oe')}`;
    const guardian = await insert('guardian', {
      name: `Familie ${lastName}`,
      email: `${token}@example.org`,
      access_token_hash: hashToken(token),
    });
    found = { id: guardian.id, token };
    families.set(lastName, found);
  }
  return found;
}

for (const setup of [SCHUELER, JUGEND]) {
  const team = await insert('team', { name: setup.name, season: 2027 });

  const players: { id: string; lastName: string }[] = [];
  for (const [firstName, lastName, birthYear] of setup.kids) {
    const player = await insert('player', {
      first_name: firstName,
      last_name_initial: lastName[0],
      birth_year: birthYear,
    });
    await insert('team_member', { team_id: team.id, player_id: player.id });
    await insert('guardianship', {
      guardian_id: (await family(lastName)).id,
      player_id: player.id,
    });
    players.push({ id: player.id, lastName });
  }

  for (const [i, game] of setup.games.entries()) {
    const event = await insert('event', {
      team_id: team.id,
      type: game.type ?? 'game',
      title: game.title,
      opponent: game.opponent,
      home_away: game.home_away,
      meet_at: addMinutes(game.date, game.time, -90),
      starts_at: berlin(game.date, game.time),
      respond_by: berlin(addDays(game.date, -2), '20:00'),
      min_players: 9,
      ...(game.home_away === 'away'
        ? { location_name: 'Abfahrt am Ballpark', location_url: BALLPARK.location_url }
        : BALLPARK),
      coach_note: i === 0 ? 'Bitte weiße Hosen mitbringen.' : null,
    });
    for (const player of players) {
      // The Müller kids: Ella has a few open games, Ben has answered everything
      const roll = random();
      let status: 'in' | 'out' | null = roll < 0.55 ? 'in' : roll < 0.7 ? 'out' : null;
      if (player.lastName === 'Müller') {
        status = setup === JUGEND ? 'in' : i < 2 ? 'in' : i === 6 ? 'out' : null;
      }
      if (status) {
        await insert('response', {
          event_id: event.id,
          player_id: player.id,
          status,
          responded_by: 'seed',
        });
      }
    }
  }

  const { weekdays, time, minutes, from, to } = setup.trainings;
  const seriesId = crypto.randomUUID();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    const event = await insert('event', {
      team_id: team.id,
      type: 'training',
      series_id: seriesId,
      title: 'Training',
      starts_at: berlin(date, time),
      ends_at: addMinutes(date, time, minutes),
      ...BALLPARK,
      cancelled: date in HOLIDAYS,
      cancel_reason: HOLIDAYS[date] ?? null,
    });
    for (const player of players) {
      const out = player.lastName === 'Müller' ? date === '2027-04-29' : random() < 0.08;
      if (out) {
        await insert('response', {
          event_id: event.id,
          player_id: player.id,
          status: 'out',
          responded_by: 'seed',
        });
      }
    }
  }
}

await pg.close();
console.log('Local database reset. Parent links, e.g.:');
for (const name of ['Müller', 'Schmidt', 'Schulz']) {
  console.log(`  http://localhost:4321/f/${families.get(name)?.token}`);
}
