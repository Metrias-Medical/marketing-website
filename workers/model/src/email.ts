/**
 * Email transport for the magic link. Two implementations behind one interface:
 *   resend  POST https://api.resend.com/emails with RESEND_API_KEY, from EMAIL_FROM
 *   log     console.log the message, for local development and tests
 */

import type { Env } from './env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTransport {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}

export class ResendTransport implements EmailTransport {
  readonly name = 'resend';
  constructor(
    private apiKey: string | undefined,
    private from: string,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    if (!this.apiKey) throw new Error('RESEND_API_KEY is not set');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!r.ok) throw new Error(`resend send failed: ${r.status} ${await r.text()}`);
  }
}

export class LogTransport implements EmailTransport {
  readonly name = 'log';
  async send(msg: EmailMessage): Promise<void> {
    console.log(`[email:log] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  }
}

export function createTransport(env: Env): EmailTransport {
  return (env.EMAIL_TRANSPORT || 'resend').toLowerCase() === 'log'
    ? new LogTransport()
    : new ResendTransport(env.RESEND_API_KEY, env.EMAIL_FROM);
}

export const MAGIC_LINK_SUBJECT = 'Your Metrias model access link';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function magicLinkEmail(to: string, firstName: string, link: string, ttlSeconds: number): EmailMessage {
  const minutes = Math.round(ttlSeconds / 60);
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const text = [
    greeting,
    '',
    'Here is your link to the Metrias model:',
    '',
    link,
    '',
    `It works once and expires in ${minutes} minutes. If it expires, request a new one from the same page.`,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');
  const html = [
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">',
    `<p>${escapeHtml(greeting)}</p>`,
    '<p>Here is your link to the Metrias model:</p>',
    `<p><a href="${escapeHtml(link)}">Open the Metrias model</a></p>`,
    `<p>It works once and expires in ${minutes} minutes. If it expires, request a new one from the same page.</p>`,
    '<p>If you did not request this, you can ignore this email.</p>',
    '</body></html>',
  ].join('');
  return { to, subject: MAGIC_LINK_SUBJECT, text, html };
}
