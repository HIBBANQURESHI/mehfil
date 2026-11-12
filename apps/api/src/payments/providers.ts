import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { env } from '../common/config';
import { hmac, randomToken, safeEqual } from '../common/crypto';

export interface WebhookEventData { eventId: string; providerRef: string; status: 'SUCCEEDED' | 'FAILED'; amount: number; fee?: number; failureReason?: string }

/**
 * What a real gateway must implement. Mehfil never handles card details: the customer pays on the gateway's
 * hosted page, and only a signed server-to-server webhook can mark a payment as paid.
 */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(args: { paymentCode: string; amount: number; description: string; returnUrl: string }): Promise<{ providerRef: string; checkoutUrl: string }>;
  /** null means a genuine event that Mehfil doesn't act on (it is still acknowledged). */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEventData | null;
  /** Optional: ask the gateway directly how a payment stands. null while it is still in progress. */
  verify?(providerRef: string): Promise<WebhookEventData | null>;
  /** idempotencyKey is the same on a retry, and must be passed to the gateway so it can't pay out twice. */
  refund(args: { providerRef: string; amount: number; reason: string; idempotencyKey: string }): Promise<{ providerRef: string }>;
}

@Injectable()
export class SandboxProvider implements PaymentProvider {
  readonly name = 'sandbox';

  async createCheckout(args: { paymentCode: string; returnUrl: string }) {
    const providerRef = `sbx_${randomToken(12)}`;
    return { providerRef, checkoutUrl: `${env.API_PUBLIC_URL}/v1/sandbox/pay/${providerRef}?returnUrl=${encodeURIComponent(args.returnUrl)}` };
  }

  sign(body: string) { return hmac(body, env.SANDBOX_WEBHOOK_SECRET); }

  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEventData {
    const given = String(headers['x-sandbox-signature'] ?? '');
    if (!safeEqual(given, this.sign(rawBody.toString('utf8')))) throw new UnauthorizedException('Invalid webhook signature');
    return JSON.parse(rawBody.toString('utf8'));
  }

  async refund() { return { providerRef: `sbx_rf_${randomToken(8)}` }; }
}

/** Active until a gateway contract is signed. Checkout is refused clearly rather than appearing to take money. */
@Injectable()
export class NoProvider implements PaymentProvider {
  readonly name = 'none';
  private unavailable(): never { throw new HttpException({ message: 'Online payment is not available yet. Mehfil will contact you to arrange payment.', code: 'PAYMENTS_NOT_CONFIGURED' }, 503); }
  async createCheckout(): Promise<never> { this.unavailable(); }
  parseWebhook(): never { this.unavailable(); }
  async refund(): Promise<never> { this.unavailable(); }
}
