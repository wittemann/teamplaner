// "Link verloren?" (docs/features.md): a parent or coach enters their e-mail address and gets
// their personal link again – the same link, so other devices and the calendar keep working.
// The page always answers the same, whether the address is known or not.
import { rotateToken } from './admin/data.ts';
import type { Db } from './db/client.ts';
import { openToken, sealToken } from './token.ts';

export type LinkOwner = 'guardian' | 'coach';
export type LostLink = { owner: LinkOwner; name: string; token: string };

/** At most one mail per person in this time, so the form can't be used to flood an inbox */
export const MAIL_PAUSE_MINUTES = 10;

const PATH: Record<LinkOwner, string> = { guardian: 'f', coach: 't' };

/** Stores the link encrypted if it isn't yet (links from before 0005, or seeded ones). */
export async function rememberLink(
  db: Db,
  owner: LinkOwner,
  id: string,
  token: string,
  key: string | undefined,
) {
  const sealed = sealToken(token, key);
  if (!sealed) return;
  await db.query(
    `UPDATE ${owner} SET access_token_sealed = $2 WHERE id = $1 AND access_token_sealed IS NULL`,
    [id, sealed],
  );
}

/**
 * The links to mail for an address (parent and/or coach), marked as mailed. Without a readable
 * stored link (never opened since 0005, or no key) a new one is made – the old one could not be sent.
 */
export async function linksToMail(
  db: Db,
  email: string,
  key: string | undefined,
  now = new Date(),
) {
  const pauseStart = new Date(now.getTime() - MAIL_PAUSE_MINUTES * 60_000);
  const links: LostLink[] = [];
  for (const owner of ['guardian', 'coach'] as const) {
    const rows = await db.query<{ id: string; name: string; access_token_sealed: string | null }>(
      `UPDATE ${owner} SET link_mailed_at = $3
        WHERE lower(email) = lower($1) AND (link_mailed_at IS NULL OR link_mailed_at < $2)
        RETURNING id, name, access_token_sealed`,
      [email, pauseStart, now],
    );
    for (const row of rows) {
      const token =
        (row.access_token_sealed && openToken(row.access_token_sealed, key)) ||
        (await rotateToken(db, owner, row.id, key));
      links.push({ owner, name: row.name, token });
    }
  }
  return links;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The mail with the links, as plain text and HTML. */
export function lostLinkMail(links: LostLink[], origin: string) {
  const items = links.map((link) => ({
    label: link.owner === 'coach' ? `Trainerbereich (${link.name})` : link.name,
    url: new URL(`/${PATH[link.owner]}/${link.token}`, origin).href,
  }));
  const one = items.length === 1;
  const subject = one ? 'Dein Link zum Teamplaner' : 'Deine Links zum Teamplaner';
  const greeting = one && links[0].owner === 'guardian' ? `Hallo ${links[0].name},` : 'Hallo,';
  const intro = one
    ? 'hier ist dein persönlicher Link zum Teamplaner der Bretten Kangaroos:'
    : 'hier sind deine persönlichen Links zum Teamplaner der Bretten Kangaroos:';
  const outro = [
    'Einfach antippen – kein Passwort nötig. Bitte gib den Link nicht weiter, er gehört nur dir.',
    'Du hast keinen Link angefordert? Dann kannst du diese Mail ignorieren.',
  ];

  const text = [
    greeting,
    '',
    intro,
    '',
    ...items.map((item) => (one ? item.url : `${item.label}:\n${item.url}`)),
    '',
    ...outro.flatMap((line) => [line, '']),
    'Viele Grüße',
    'Bretten Kangaroos',
    '',
  ].join('\n');

  const button = (item: (typeof items)[number]) =>
    `<p style="margin:16px 0">${one ? '' : `<strong>${escapeHtml(item.label)}</strong><br>`}` +
    `<a href="${escapeHtml(item.url)}" style="display:inline-block;padding:12px 20px;background:#A3500F;color:#FFFFFF;border-radius:4px;font-weight:600;text-decoration:none">Teamplaner öffnen</a></p>`;
  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1D231B">',
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    ...items.map(button),
    ...outro.map((line) => `<p style="color:#6B6F68;font-size:14px">${escapeHtml(line)}</p>`),
    '<p>Viele Grüße<br>Bretten Kangaroos</p>',
    '</div>',
  ].join('\n');

  return { subject, text, html };
}
