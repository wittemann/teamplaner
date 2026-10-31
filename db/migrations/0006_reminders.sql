-- Reminder mails to families with open games (docs/tech.md, "Automatische Erinnerungen").
-- One row per mail sent: which children it was about decides who gets the next one (first
-- reminder to one parent, later ones to all), sent_at keeps it to one mail a day.
CREATE TABLE reminder_mail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid NOT NULL REFERENCES guardian ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('due', 'manual')),  -- due = before a deadline (cron)
  player_ids uuid[] NOT NULL,
  event_ids uuid[] NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminder_mail_guardian ON reminder_mail (guardian_id, sent_at);
