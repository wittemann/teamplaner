// What the push box (components/PushSetup.tsx) shows on this device (docs/tech.md, "Web Push").

export type Device = {
  /** iPhone or iPad: push only from the home screen (iOS 16.4+) */
  ios: boolean;
  /** Opened from the home screen, not in the browser */
  standalone: boolean;
  /** Service worker and PushManager exist */
  supported: boolean;
  permission: NotificationPermission;
  /** This device is signed up */
  subscribed: boolean;
};

export type PushStep =
  /** iPhone in the browser: add to the home screen first, push comes after that */
  | 'install'
  /** Push possible but not on yet */
  | 'ask'
  | 'on'
  /** The person said no in the browser; only the settings can undo that */
  | 'blocked'
  /** This browser can't do push – mails only, nothing to show */
  | 'none';

export function pushStep(device: Device) {
  if (device.ios && !device.standalone) return 'install';
  if (!device.supported) return 'none';
  if (device.permission === 'denied') return 'blocked';
  return device.permission === 'granted' && device.subscribed ? 'on' : 'ask';
}

/** The VAPID public key (base64url) as `pushManager.subscribe()` wants it */
export function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
