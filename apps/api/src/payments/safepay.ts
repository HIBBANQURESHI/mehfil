import { HttpException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { env } from '../common/config';
import { safeEqual } from '../common/crypto';
import { PaymentProvider, WebhookEventData } from './providers';

const HOSTS = {
  sandbox: { api: 'https://sandbox.api.getsafepay.com', checkout: 'https://sandbox.api.getsafepay.com/embedded/' },
  production: { api: 'https://api.getsafepay.com', checkout: 'https://getsafepay.com/embedded/' },
} as const;

/** Tracker states after which the money has been captured (a refund later doesn't undo that it was paid). */
const PAID = ['TRACKER_ENDED', 'TRACKER_REFUNDED', 'TRACKER_PARTIAL_REFUND'];

/** Adds query parameters to a URL that may already have some. */
export const withQuery = (url: string, params: Record<string, string>) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

/**
 * Safepay (Pakistan). The customer pays on Safepay's hosted page; Mehfil never sees card details.
 * Amounts are sent in paisa, the same unit Mehfil stores, so nothing is converted.
 * A payment is only marked paid from Safepay itself: a signed webhook, or Mehfil asking Safepay server to server.
 */
@Injectable()
export class SafepayProvider implements PaymentProvider {
  readonly name = 'safepay';
  private log = new Logger('Safepay');

  private get host() { return HOSTS[env.SAFEPAY_ENV]; }

  private async call<T = any>(method: 'GET' | 'POST', path: string, body?: object, bearer?: string): Promise<T> {
    const res = await fetch(`${this.host.api}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-SFPY-MERCHANT-SECRET': env.SAFEPAY_SECRET_KEY ?? '', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* reported below */ }
    if (!res.ok) {
      const detail = json?.status?.errors?.join?.('; ') || json?.message || text.slice(0, 200);
      this.log.error(`${method} ${path} failed (${res.status}): ${detail}`);
      throw new HttpException({ message: 'The payment service is not responding right now. Please try again in a moment.', code: 'GATEWAY_ERROR' }, 502);
    }
    return json as T;
  }

  /** A short-lived token (1 hour) that lets the hosted checkout, and refunds, act on our behalf. */
  private async passport(): Promise<string> {
    const r = await this.call<{ data: string }>('POST', '/client/passport/v1/token');
    if (!r?.data) throw new HttpException({ message: 'The payment service is not responding right now.', code: 'GATEWAY_ERROR' }, 502);
    return r.data;
  }

  async createCheckout(args: { paymentCode: string; amount: number; description: string; returnUrl: string }) {
    const created = await this.call('POST', '/order/payments/v3/', {
      merchant_api_key: env.SAFEPAY_API_KEY, intent: 'CYBERSOURCE', mode: 'payment', currency: 'PKR', amount: args.amount,
      metadata: { order_id: args.paymentCode },
    });
    const tracker: string | undefined = created?.data?.tracker?.token;
    if (!tracker) throw new HttpException({ message: 'The payment service is not responding right now.', code: 'GATEWAY_ERROR' }, 502);
    const tbt = await this.passport();
    // Safepay sends the customer back with ?tracker=...; our return route checks the result with Safepay before showing anything.
    const back = `${env.API_PUBLIC_URL}/v1/payments/safepay/return?to=${encodeURIComponent(args.returnUrl)}`;
    const q = new URLSearchParams({ environment: env.SAFEPAY_ENV, tracker, tbt, source: 'hosted', redirect_url: back, cancel_url: withQuery(args.returnUrl, { payment: 'cancelled' }) });
    return { providerRef: tracker, checkoutUrl: `${this.host.checkout}?${q}` };
  }

  /** Asks Safepay directly how a payment stands. Returns null while it is still in progress. */
  async verify(tracker: string): Promise<WebhookEventData | null> {
    const r = await this.call('GET', `/reporter/api/v1/payments/${encodeURIComponent(tracker)}`);
    const t = r?.data?.tracker && typeof r.data.tracker === 'object' ? r.data.tracker : r?.data;
    if (!t || t.token !== tracker || (t.client?.api_key && t.client.api_key !== env.SAFEPAY_API_KEY)) return null;
    if (!PAID.includes(t.state)) return null;
    const amount = Number(t.purchase_totals?.quote_amount?.amount ?? t.charge?.amount);
    if (!Number.isFinite(amount)) return null;
    return { eventId: `verify:${tracker}`, providerRef: tracker, status: 'SUCCEEDED', amount };
  }

  /**
   * Safepay signs each webhook with HMAC-SHA512 (hex) using the endpoint's shared secret from the dashboard.
   * Their docs describe the signed text loosely, so the accepted forms are tried in turn; each one still needs the secret.
   */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEventData | null {
    const secret = env.SAFEPAY_WEBHOOK_SECRET;
    const given = String(headers['x-sfpy-signature'] ?? '').trim().toLowerCase();
    if (!secret || !given) throw new UnauthorizedException('Invalid webhook signature');
    const raw = rawBody.toString('utf8');
    let body: any;
    try { body = JSON.parse(raw); } catch { throw new UnauthorizedException('Invalid webhook signature'); }
    const sign = (s: string) => createHmac('sha512', secret).update(s).digest('hex');
    const candidates = [raw, JSON.stringify(body), body?.data !== undefined ? JSON.stringify(body.data) : null].filter((x): x is string => x !== null);
    if (!candidates.some((c) => safeEqual(given, sign(c)))) throw new UnauthorizedException('Invalid webhook signature');
    if (body.merchant_api_key && body.merchant_api_key !== env.SAFEPAY_API_KEY) throw new UnauthorizedException('Webhook is for another account');

    const data = body.data ?? {};
    const tracker = typeof data.tracker === 'string' ? data.tracker : data.tracker?.token;
    if (!body.token || !tracker) return null;
    if (body.type === 'payment.succeeded') return { eventId: body.token, providerRef: tracker, status: 'SUCCEEDED', amount: Number(data.amount), fee: data.fee === undefined ? undefined : Number(data.fee) };
    if (body.type === 'payment.failed') return { eventId: body.token, providerRef: tracker, status: 'FAILED', amount: 0, failureReason: String(data.message ?? 'Declined').slice(0, 200) };
    return null; // Other event types (refunds, subscriptions...) are acknowledged and ignored.
  }

  async refund(args: { providerRef: string; amount: number; reason: string; idempotencyKey: string }) {
    const bearer = await this.passport();
    await this.call('POST', `/order/payments/v3/${encodeURIComponent(args.providerRef)}/refund`, { currency: 'PKR', amount: args.amount }, bearer);
    return { providerRef: args.providerRef };
  }
}
