-- Web Push (docs/tech.md, "Benachrichtigungen"): one row per device and person. A phone shared by a
-- coach who is also a parent has one endpoint for both, so the endpoint is unique per person only.
-- Rows the push service answers 404/410 for are deleted (lib/push.ts).
CREATE TABLE push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid REFERENCES guardian ON DELETE CASCADE,
  coach_id uuid REFERENCES coach ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  CHECK ((guardian_id IS NULL) <> (coach_id IS NULL))
);
CREATE UNIQUE INDEX push_subscription_guardian ON push_subscription (guardian_id, endpoint);
CREATE UNIQUE INDEX push_subscription_coach ON push_subscription (coach_id, endpoint);
