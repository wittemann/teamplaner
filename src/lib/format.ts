// German date and time texts, always in Berlin time (the server runs in UTC).
const TIME_ZONE = 'Europe/Berlin';

function parts(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, ...options }).format(
    new Date(iso),
  );
}

/** "Sa" */
export function weekday(iso: string) {
  return parts(iso, { weekday: 'short' }).replace('.', '');
}

/** "17" */
export function dayOfMonth(iso: string) {
  return parts(iso, { day: '2-digit' });
}

/** "Apr" */
export function month(iso: string) {
  return parts(iso, { month: 'short' }).replace('.', '').slice(0, 3);
}

/** "17.04." */
export function shortDate(iso: string) {
  return parts(iso, { day: '2-digit', month: '2-digit' });
}

/** "9:30" */
export function time(iso: string) {
  return parts(iso, { hour: 'numeric', minute: '2-digit' });
}

/** "Do 15.04., 20 Uhr" – full hours without ":00" */
export function deadline(iso: string) {
  const t = time(iso).replace(/:00$/, '');
  return `${weekday(iso)} ${shortDate(iso)}, ${t} Uhr`;
}

/** "Samstag, 17. April 2027" */
export function longDate(iso: string) {
  return parts(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
