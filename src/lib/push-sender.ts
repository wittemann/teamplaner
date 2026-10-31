// The real push sender (lib/push.ts): `web-push` with the VAPID keys from the environment.
// Without the keys there is no sender – push is off and mails go out instead.
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from 'astro:env/server';
import webpush from 'web-push';
import type { PushSender } from './push.ts';

export function pushSender() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return undefined;
  const vapidDetails = {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  };
  const send: PushSender = async (subscription, payload) => {
    // A day is enough: a note or late change older than that is old news
    await webpush.sendNotification(subscription, payload, { vapidDetails, TTL: 60 * 60 * 24 });
  };
  return send;
}
