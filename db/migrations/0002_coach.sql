-- Coaches (docs/data-model.md): never players. Like parents they get a personal link for now;
-- the token is stored as a SHA-256 hash only. Magic link by mail follows with the mail setup.
CREATE TABLE coach (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  access_token_hash text NOT NULL UNIQUE
);

CREATE TABLE coach_team (
  coach_id uuid NOT NULL REFERENCES coach ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES team ON DELETE CASCADE,
  PRIMARY KEY (coach_id, team_id)
);
