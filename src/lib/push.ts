// Web Push (docs/tech.md, "Benachrichtigungen"): devices sign up per person (parent or coach), the
// server sends with the `web-push` library and VAPID keys from the environment. Without the keys
// nothing is sent and callers fall back to mail where there is one.
import type { Db } from './db/client.ts';

export type Owner = { guardianId: string } | { coachId: string };

/** What the browser hands over after `pushManager.subscribe()` */
export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Shown by the service worker (public/sw.js); a click opens `url` */
export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Sends one message to one device; throws with `statusCode` like `web-push` does. */
export type PushSender = (subscription: Subscription, payload: string) => Promise<void>;

function ownerColumn(owner: Owner) {
  return 'guardianId' in owner
    ? { column: 'guardian_id', id: owner.guardianId }
    : { column: 'coach_id', id: owner.coachId };
}

/**
 * Remembers a device. A device belongs to one family (and one coach): if another family signed
 * up on it before (a new personal link on the same phone), their pushes stop coming here.
 */
export async function saveSubscription(
  db: Db,
  owner: Owner,
  subscription: Subscription,
  userAgent: string | null,
) {
  const { column, id } = ownerColumn(owner);
  await db.query(
    `DELETE FROM push_subscription WHERE endpoint = $1 AND ${column} IS NOT NULL AND ${column} <> $2`,
    [subscription.endpoint, id],
  );
  await db.query(
    `INSERT INTO push_subscription (${column}, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (${column}, endpoint) DO UPDATE
       SET p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent],
  );
}

export async function removeSubscription(db: Db, owner: Owner, endpoint: string) {
  const { column, id } = ownerColumn(owner);
  await db.query(`DELETE FROM push_subscription WHERE ${column} = $1 AND endpoint = $2`, [
    id,
    endpoint,
  ]);
}

type SubscriptionRow = {
  id: string;
  guardian_id: string | null;
  coach_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Sends the message to every device of the given people. Returns who got it on at least one
 * device ("guardian:<id>" / "coach:<id>"). Devices the push service no longer knows are removed.
 * Never throws: a failed push must not block the save that caused it.
 */
export async function pushTo(
  db: Db,
  to: { guardianIds?: string[]; coachIds?: string[] },
  message: PushMessage,
  send: PushSender | undefined,
) {
  const reached = new Set<string>();
  const guardianIds = to.guardianIds ?? [];
  const coachIds = to.coachIds ?? [];
  if (guardianIds.length === 0 && coachIds.length === 0) return reached;
  if (!send) {
    if (!import.meta.env.PROD) console.info(`[push] ${message.title}: ${message.body}`);
    return reached;
  }
  try {
    const rows = await db.query<SubscriptionRow>(
      `SELECT id, guardian_id, coach_id, endpoint, p256dh, auth FROM push_subscription
        WHERE guardian_id = ANY($1::uuid[]) OR coach_id = ANY($2::uuid[])`,
      [guardianIds, coachIds],
    );
    const payload = JSON.stringify(message);
    await Promise.all(
      rows.map(async (row) => {
        try {
          await send(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            payload,
          );
          reached.add(row.guardian_id ? `guardian:${row.guardian_id}` : `coach:${row.coach_id}`);
          await db.query('UPDATE push_subscription SET last_success_at = now() WHERE id = $1', [
            row.id,
          ]);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // Unsubscribed, app removed or permission withdrawn
          if (status === 404 || status === 410) {
            await db.query('DELETE FROM push_subscription WHERE id = $1', [row.id]);
          } else {
            console.error(
              'push failed',
              status ?? (error instanceof Error ? error.name : 'unknown'),
            );
          }
        }
      }),
    );
  } catch (error) {
    console.error('push: lookup failed', error instanceof Error ? error.name : 'unknown');
  }
  return reached;
}

/** Children of a team none of whose parents has a device signed up – they only get mails. */
export async function playersWithoutPush(db: Db, teamId: string) {
  const rows = await db.query<{ id: string }>(
    `SELECT p.id FROM player p
       JOIN team_member m ON m.player_id = p.id AND m.active AND m.team_id = $1
      WHERE NOT EXISTS (
        SELECT 1 FROM guardianship g JOIN push_subscription s ON s.guardian_id = g.guardian_id
         WHERE g.player_id = p.id)`,
    [teamId],
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Families whose child takes part: games = said yes, trainings = didn't opt out. A cancelled event
 * counts only for the news that it was cancelled.
 */
async function guardiansTakingPart(db: Db, eventId: string, includeCancelled: boolean) {
  return db.query<{ id: string }>(
    `SELECT DISTINCT g.guardian_id AS id
       FROM event e
       JOIN team_member m ON m.team_id = e.team_id AND m.active
       JOIN guardianship g ON g.player_id = m.player_id
       LEFT JOIN response r ON r.event_id = e.id AND r.player_id = m.player_id
      WHERE e.id = $1 AND ($2 OR NOT e.cancelled) AND e.starts_at > now()
        AND (r.status = 'in' OR (e.type = 'training' AND r.status IS NULL))`,
    [eventId, includeCancelled],
  );
}

/**
 * News about one event as a push to the families taking part. Returns who got it, and how many
 * families have no device for it.
 */
export async function pushEventNews(
  db: Db,
  eventId: string,
  message: Omit<PushMessage, 'url'>,
  send: PushSender | undefined,
  { includeCancelled = false } = {},
) {
  const guardians = (await guardiansTakingPart(db, eventId, includeCancelled)).map((g) => g.id);
  const reached = await pushTo(db, { guardianIds: guardians }, { url: '/', ...message }, send);
  return { reachedIds: reached, reached: reached.size, missed: guardians.length - reached.size };
}

/** The coach note (docs/tech.md: push only, no mail – the note is on the page for everyone). */
export function pushCoachNote(
  db: Db,
  event: { id: string; title: string },
  note: string,
  when: string,
  send: PushSender | undefined,
) {
  return pushEventNews(
    db,
    event.id,
    { title: `Hinweis: ${event.title} (${when})`, body: note, tag: `note-${event.id}` },
    send,
  );
}

/** Cancelled, or taken back: "Fällt aus" / "Findet doch statt" */
export function pushCancelled(
  db: Db,
  event: { id: string; title: string; startsAt: string; cancelled: boolean },
  reason: string | null,
  when: string,
  send: PushSender | undefined,
) {
  const message = event.cancelled
    ? { title: `Fällt aus: ${event.title} (${when})`, body: reason || 'Der Termin fällt aus.' }
    : {
        title: `Findet doch statt: ${event.title} (${when})`,
        body: 'Die Absage ist zurückgenommen.',
      };
  return pushEventNews(db, event.id, { ...message, tag: `event-${event.id}` }, send, {
    includeCancelled: true,
  });
}
