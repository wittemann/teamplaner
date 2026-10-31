// Sends mail through the club's IONOS mailbox (docs/tech.md, "Mail"). Without SMTP_HOST, locally,
// the mail goes to the server console instead – it contains personal links, so never in production.
import { MAIL_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from 'astro:env/server';
import nodemailer, { type Transporter } from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html: string };

let transport: Transporter | undefined;

export async function sendMail(mail: Mail) {
  if (!SMTP_HOST) {
    if (import.meta.env.PROD) throw new Error('SMTP_HOST is not set, cannot send mail');
    console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return;
  }
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 = TLS from the start, 587 = STARTTLS
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({ from: MAIL_FROM ?? `Bretten Kangaroos <${SMTP_USER}>`, ...mail });
}
