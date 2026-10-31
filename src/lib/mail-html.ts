// Building blocks for the HTML mails (reminder, moved game): inline styles only, since mail
// programs ignore style sheets. Colors as on the site (docs/design.md).
import { openToken } from './token.ts';

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Chalk background, white card with the green header "Bretten Kangaroos · Schüler" */
export function mailFrame(header: string, body: string[]) {
  return [
    '<div style="background:#F7F6F1;padding:16px 0;font-family:Arial,sans-serif;font-size:16px;line-height:1.45;color:#1D231B">',
    '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:6px;overflow:hidden">',
    `<div style="background:#23461E;color:#FFFFFF;padding:14px 20px;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(header)}</div>`,
    '<div style="padding:20px">',
    ...body,
    '</div></div></div>',
  ].join('\n');
}

/** Green "yes" and white "no" button side by side */
export function answerButtons(
  yes: { url: string; label: string },
  no: { url: string; label: string },
) {
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:10px;width:100%"><tr>',
    `<td style="padding-right:4px;width:50%"><a href="${escapeHtml(yes.url)}" style="display:block;padding:11px 0;text-align:center;background:#1E7B3C;color:#FFFFFF;border-radius:4px;font-weight:bold;text-decoration:none">${escapeHtml(yes.label)}</a></td>`,
    `<td style="padding-left:4px;width:50%"><a href="${escapeHtml(no.url)}" style="display:block;padding:9px 0;text-align:center;border:2px solid #C9C9C2;color:#1D231B;border-radius:4px;font-weight:bold;text-decoration:none">${escapeHtml(no.label)}</a></td>`,
    '</tr></table>',
  ].join('\n');
}

/** The rust call-to-action, e.g. "Alle Termine ansehen" */
export function primaryButton(url: string, label: string) {
  return `<p style="margin:20px 0 12px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#A3500F;color:#FFFFFF;border-radius:4px;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a></p>`;
}

export function smallPrint(text: string) {
  return `<p style="margin:0;color:#6B6F68;font-size:14px">${escapeHtml(text)}</p>`;
}

/** The family's own page: the personal link if it can be read, otherwise the start page */
export function familyPageUrl(sealed: string | null, key: string | undefined, origin: string) {
  const token = sealed && openToken(sealed, key);
  return new URL(token ? `/f/${token}` : '/', origin).href;
}
