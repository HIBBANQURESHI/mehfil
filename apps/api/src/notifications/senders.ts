import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { env } from '../common/config';

@Injectable()
export class SmsSender {
  private log = new Logger('SMS');
  /** Populated only under test, so e2e tests can read OTP codes without a real SMS gateway. */
  static outbox: { to: string; body: string }[] = [];

  async send(to: string, body: string) {
    if (env.NODE_ENV === 'test') { SmsSender.outbox.push({ to, body }); return; }
    if (env.SMS_PROVIDER === 'console') { this.log.warn(`[dev only] to ${to}: ${body}`); return; }
    if (env.SMS_PROVIDER === 'http') return this.sendHttp(to, body);
    if (env.SMS_PROVIDER === 'textbee') return this.sendTextbee(to, body);
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: env.TWILIO_FROM!, Body: body }),
    });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
  }

  /** Sends from an Android phone's own SIM. A 200 only means the phone has it queued, not that it was delivered. */
  private async sendTextbee(to: string, message: string) {
    const res = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
      method: 'POST',
      headers: { 'x-api-key': env.TEXTBEE_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: [to], message }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
  }

  /** Local gateways want 92XXXXXXXXXX with no plus. The URL can hold the API key, so it must never be logged. */
  private async sendHttp(to: string, body: string) {
    const values: Record<string, string> = { to: to.replace(/^\+/, ''), message: body, sender: env.SMS_SENDER ?? '', key: env.SMS_API_KEY ?? '' };
    const url = env.SMS_HTTP_URL!.replace(/\{(to|message|sender|key)\}/g, (_, name: string) => encodeURIComponent(values[name]));
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
    // Many gateways answer 200 even when the message was refused, so the body has to confirm it.
    if (env.SMS_HTTP_SUCCESS_TEXT && !(await res.text()).includes(env.SMS_HTTP_SUCCESS_TEXT)) throw new Error('SMS provider did not confirm the message');
  }
}

@Injectable()
export class EmailSender {
  private log = new Logger('Email');
  private transport = env.RESEND_API_KEY
    ? nodemailer.createTransport({ host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: env.RESEND_API_KEY } })
    : env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;
  static outbox: { to: string; subject: string; body: string }[] = [];

  async send(to: string, subject: string, body: string) {
    if (env.NODE_ENV === 'test') { EmailSender.outbox.push({ to, subject, body }); return; }
    if (!this.transport) { this.log.warn(`[dev only] to ${to}: ${subject}\n${body}`); return; }
    await this.transport.sendMail({ from: env.MAIL_FROM, to, subject, text: body });
  }
}

@Injectable()
export class PushSender {
  async send(token: string, title: string, body: string, link?: string) {
    if (!env.PUSH_ENABLED || env.NODE_ENV === 'test') return;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title, body, sound: 'default', data: { link } }),
    });
    if (!res.ok) throw new Error(`Push service returned ${res.status}`);
  }
}
