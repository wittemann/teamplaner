-- Tables for the parent season view (docs/data-model.md). Coaches, reminders, absences, holidays
-- and push subscriptions follow with the features that need them.

CREATE TABLE team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                      -- Schüler | Jugend
  season int NOT NULL,
  bsm_league_id int,
  UNIQUE (name, season)
);

-- Children: first name, initial of the last name and birth year only (GDPR)
CREATE TABLE player (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name_initial text NOT NULL,
  birth_year int NOT NULL
);

CREATE TABLE team_member (
  team_id uuid NOT NULL REFERENCES team ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (team_id, player_id)
);

-- Parents. The personal link carries a random token; only its SHA-256 hash is stored, so a
-- database leak doesn't leak working links. Rotating = new token, new hash.
CREATE TABLE guardian (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  access_token_hash text NOT NULL UNIQUE
);

CREATE TABLE guardianship (
  guardian_id uuid NOT NULL REFERENCES guardian ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player ON DELETE CASCADE,
  PRIMARY KEY (guardian_id, player_id)
);

CREATE TABLE event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES team ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('game', 'training', 'tournament', 'other')),
  series_id uuid,                          -- training series
  bsm_match_id int,
  title text NOT NULL,
  opponent text,
  home_away text CHECK (home_away IN ('home', 'away')),
  meet_at timestamptz,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  respond_by timestamptz,                  -- deadline (Stichtag); changes after it notify the coach
  location_name text,
  location_url text,
  min_players int,
  coach_note text,
  coach_note_updated_at timestamptz,
  cancelled boolean NOT NULL DEFAULT false,
  cancel_reason text
);
CREATE INDEX event_team_starts_at ON event (team_id, starts_at);

-- No row: open for games, "in" for trainings
CREATE TABLE response (
  event_id uuid NOT NULL REFERENCES event ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES player ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('in', 'out')),
  responded_by text NOT NULL,              -- guardian:<id> | coach:<id> | claude
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);
