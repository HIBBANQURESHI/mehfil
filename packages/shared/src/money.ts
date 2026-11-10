/**
 * All money is an integer number of paisa (1 PKR = 100 paisa) and all rates are basis
 * points (1% = 100 bps). Nothing here uses floats for stored values, so totals always
 * add up exactly. MAX_AMOUNT keeps `amount * bps` inside Number.MAX_SAFE_INTEGER.
 */
export const MAX_AMOUNT = 100_000_000_000; // PKR 1bn in paisa
export const BPS = 10_000;

export function assertAmount(n: number, label = 'amount'): number {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_AMOUNT) throw new RangeError(`Invalid ${label}: ${n}`);
  return n;
}

/** Round-half-up percentage of an integer amount. */
export function applyBps(amount: number, bps: number): number {
  assertAmount(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS) throw new RangeError(`Invalid bps: ${bps}`);
  return Math.floor((amount * bps + BPS / 2) / BPS);
}

export const rupeesToPaisa = (rupees: number): number => Math.round(rupees * 100);
export const paisaToRupees = (paisa: number): number => paisa / 100;

export function formatPKR(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return '—';
  const rupees = paisa / 100;
  return `Rs. ${rupees.toLocaleString('en-PK', { maximumFractionDigits: Number.isInteger(rupees) ? 0 : 2 })}`;
}

export const formatBps = (bps: number): string => `${(bps / 100).toLocaleString('en-PK', { maximumFractionDigits: 2 })}%`;

export interface LineInput { quantity: number; unitPrice: number }
export interface QuotationTotals { subtotal: number; discount: number; tax: number; total: number; lineAmounts: number[] }

export function computeQuotationTotals(lines: LineInput[], discount: number, taxBps: number): QuotationTotals {
  const lineAmounts = lines.map((l) => assertAmount(l.quantity * l.unitPrice, 'line amount'));
  const subtotal = assertAmount(lineAmounts.reduce((a, b) => a + b, 0), 'subtotal');
  if (discount > subtotal) throw new RangeError('Discount cannot exceed the subtotal');
  const tax = applyBps(subtotal - discount, taxBps);
  return { subtotal, discount, tax, total: assertAmount(subtotal - discount + tax, 'total'), lineAmounts };
}

/** Splits `total` across shares (bps summing to 10000). The last share absorbs rounding, so parts sum exactly. */
export function splitByBps(total: number, shares: number[]): number[] {
  if (shares.reduce((a, b) => a + b, 0) !== BPS) throw new RangeError('Shares must total 100%');
  let allocated = 0;
  return shares.map((share, i) => {
    if (i === shares.length - 1) return total - allocated;
    const part = applyBps(total, share);
    allocated += part;
    return part;
  });
}

/**
 * Commission due on one collected instalment. Each instalment is charged pro rata, and the
 * instalment that completes the booking takes whatever is left, so commissions always sum
 * to exactly `commissionTotal`.
 */
export function commissionForPayment(args: {
  paymentAmount: number; bookingTotal: number; commissionTotal: number;
  alreadyCollected: number; commissionAlreadyCharged: number;
}): number {
  const { paymentAmount, bookingTotal, commissionTotal, alreadyCollected, commissionAlreadyCharged } = args;
  if (alreadyCollected + paymentAmount >= bookingTotal) return Math.max(commissionTotal - commissionAlreadyCharged, 0);
  if (bookingTotal === 0) return 0;
  return Math.floor((paymentAmount * commissionTotal + Math.floor(bookingTotal / 2)) / bookingTotal);
}

/** Commission to reverse for a refund. A refund emptying the payment reverses all the remainder. */
export function commissionReversalForRefund(args: {
  refundAmount: number; paymentAmount: number; paymentCommission: number;
  alreadyRefunded: number; commissionAlreadyReversed: number;
}): number {
  const { refundAmount, paymentAmount, paymentCommission, alreadyRefunded, commissionAlreadyReversed } = args;
  if (alreadyRefunded + refundAmount >= paymentAmount) return Math.max(paymentCommission - commissionAlreadyReversed, 0);
  return Math.floor((refundAmount * paymentCommission + Math.floor(paymentAmount / 2)) / paymentAmount);
}

export interface CancellationTier { daysBefore: number; refundBps: number }

/** Picks the refund share for a cancellation `daysBefore` the event: the highest tier the customer still qualifies for. */
export function refundBpsForCancellation(tiers: CancellationTier[], daysBefore: number): number {
  const eligible = tiers.filter((t) => daysBefore >= t.daysBefore).sort((a, b) => b.daysBefore - a.daysBefore);
  return eligible[0]?.refundBps ?? 0;
}
