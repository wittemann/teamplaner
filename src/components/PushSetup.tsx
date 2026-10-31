// Push box for parents and coaches (docs/tech.md, "Web Push"): on an iPhone in the browser it
// explains "Zum Home-Bildschirm" (push only works from there), elsewhere it turns notifications on.
// Stays visible until the device is signed up; afterwards a quiet line with "Ausschalten".
import { useEffect, useState } from 'preact/hooks';
import { keyBytes, pushStep, type PushStep } from '../lib/push-state.ts';

type Props = {
  as: 'family' | 'coach';
  /** VAPID public key; without it push is off on the server */
  publicKey: string;
  /** Spacing around the box; nothing is rendered when there's nothing to show */
  class?: string;
};

const WHAT = {
  family:
    'Dann sagen wir dir sofort Bescheid, wenn der Trainer einen Hinweis schreibt (z. B. „Treffpunkt geändert“).',
  coach: 'Dann kommen späte Absagen als Benachrichtigung aufs Handy statt per Mail.',
};

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function tellServer(as: Props['as'], subscription: PushSubscription, method = 'POST') {
  const response = await fetch('/api/push', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ as, subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error(`push sign-up ${response.status}`);
}

export default function PushSetup({ as, publicKey, class: className }: Props) {
  // Decided in the browser after the first render, so server and browser render the same
  const [step, setStep] = useState<PushStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ios = isIos();
    const standalone = isStandalone();
    if (!supported()) {
      setStep(
        pushStep({ ios, standalone, supported: false, permission: 'default', subscribed: false }),
      );
      return;
    }
    (async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      const permission = Notification.permission;
      // Signed up before: tell the server again (it may have dropped the device, or this is
      // another family's link now)
      if (subscription && permission === 'granted') {
        await tellServer(as, subscription).catch(() => undefined);
      }
      setStep(
        pushStep({ ios, standalone, supported: true, permission, subscribed: !!subscription }),
      );
    })().catch(() => setStep('none'));
  }, [as]);

  async function turnOn() {
    setBusy(true);
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStep(permission === 'denied' ? 'blocked' : 'ask');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe(options);
      } catch {
        // Signed up with another key before: start over
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        subscription = await registration.pushManager.subscribe(options);
      }
      await tellServer(as, subscription);
      setStep('on');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await tellServer(as, subscription, 'DELETE');
        await subscription.unsubscribe();
      }
      setStep('ask');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'install') {
    return (
      <div
        class={`flex flex-col gap-2 rounded-md border-2 border-jersey bg-white p-4 ${className ?? ''}`}
      >
        <strong class="text-lg text-ink">Zum Home-Bildschirm hinzufügen</strong>
        <span class="text-[15px]">
          Dann öffnest du die Termine mit einem Tipp – und kannst Benachrichtigungen einschalten.{' '}
          {WHAT[as]}
        </span>
        <ol class="list-decimal pl-5 text-[15px]">
          <li>
            Unten auf <strong class="text-ink">Teilen</strong> tippen (Viereck mit Pfeil nach oben)
          </li>
          <li>
            <strong class="text-ink">„Zum Home-Bildschirm“</strong> wählen, dann „Hinzufügen“
          </li>
          <li>Die Termine ab jetzt über das neue Symbol öffnen</li>
        </ol>
      </div>
    );
  }

  if (step === 'ask') {
    return (
      <div
        class={`flex flex-col gap-2 rounded-md border-2 border-jersey bg-white p-4 ${className ?? ''}`}
      >
        <strong class="text-lg text-ink">Benachrichtigungen einschalten</strong>
        <span class="text-[15px]">{WHAT[as]}</span>
        <button
          type="button"
          disabled={busy}
          onClick={turnOn}
          class="min-h-12 rounded border-2 border-jersey bg-jersey text-[17px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Einen Moment …' : 'Einschalten'}
        </button>
        {failed && (
          <span role="alert" class="text-[15px] font-semibold text-rust-dark">
            Das hat nicht geklappt. Bitte später noch einmal versuchen – bis dahin kommt alles per
            Mail.
          </span>
        )}
      </div>
    );
  }

  if (step === 'blocked') {
    return (
      <p class={`text-[15px] text-text-light ${className ?? ''}`}>
        Benachrichtigungen sind für diese Seite blockiert – wir schreiben dir per Mail. Ändern
        kannst du das in den Einstellungen des Browsers.
      </p>
    );
  }

  if (step === 'on') {
    return (
      <p class={`text-[15px] text-text-light ${className ?? ''}`}>
        Benachrichtigungen auf diesem Gerät sind an ✓{' '}
        <button
          type="button"
          disabled={busy}
          onClick={turnOff}
          class="font-semibold text-jersey underline"
        >
          Ausschalten
        </button>
      </p>
    );
  }

  return null;
}
