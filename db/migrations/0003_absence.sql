-- Absence periods (docs/data-model.md): all events of the child in the period count as "out".
-- Answers set by an absence carry responded_by 'absence:<id>', so removing the absence can take
-- exactly those back. New events (Admin API) get "out" for children with a matching absence.
CREATE TABLE absence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES player ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  note text,
  created_by text NOT NULL,                -- guardian:<id> | claude
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX absence_player ON absence (player_id, to_date);
