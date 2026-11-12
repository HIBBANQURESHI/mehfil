import { defaultAllocation, workingBudget } from './planning';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBps, commissionForPayment, commissionReversalForRefund, computeQuotationTotals, refundBpsForCancellation, splitByBps } from './money';

test('applyBps rounds half up on integers', () => {
  assert.equal(applyBps(10_000_000, 800), 800_000);
  assert.equal(applyBps(1, 5000), 1);
  assert.throws(() => applyBps(100, 10_001));
});

test('quotation totals apply discount before tax', () => {
  const t = computeQuotationTotals([{ quantity: 1, unitPrice: 30_000_000 }, { quantity: 2, unitPrice: 2_500_000 }], 1_000_000, 1300);
  assert.deepEqual(t, { subtotal: 35_000_000, discount: 1_000_000, tax: 4_420_000, total: 38_420_000, lineAmounts: [30_000_000, 5_000_000] });
  assert.throws(() => computeQuotationTotals([{ quantity: 1, unitPrice: 100 }], 200, 0));
});

test('splitByBps always sums exactly', () => {
  for (const total of [1, 99, 100_003, 37_500_001]) {
    const parts = splitByBps(total, [3333, 3333, 3334]);
    assert.equal(parts.reduce((a, b) => a + b, 0), total);
  }
  assert.throws(() => splitByBps(100, [5000, 4000]));
});

test('instalment commissions sum exactly to the booking commission', () => {
  const bookingTotal = 10_000_033, commissionTotal = applyBps(bookingTotal, 777);
  const instalments = splitByBps(bookingTotal, [3000, 5000, 2000]);
  let collected = 0, charged = 0;
  for (const paymentAmount of instalments) {
    charged += commissionForPayment({ paymentAmount, bookingTotal, commissionTotal, alreadyCollected: collected, commissionAlreadyCharged: charged });
    collected += paymentAmount;
  }
  assert.equal(charged, commissionTotal);
});

test('partial refunds reverse commission exactly once in total', () => {
  const paymentAmount = 3_000_001, paymentCommission = 240_001;
  let refunded = 0, reversed = 0;
  for (const refundAmount of [1_000_000, 1_000_000, 1_000_001]) {
    reversed += commissionReversalForRefund({ refundAmount, paymentAmount, paymentCommission, alreadyRefunded: refunded, commissionAlreadyReversed: reversed });
    refunded += refundAmount;
  }
  assert.equal(reversed, paymentCommission);
});

test('cancellation refund uses the best tier still reachable', () => {
  const tiers = [{ daysBefore: 30, refundBps: 9000 }, { daysBefore: 7, refundBps: 5000 }, { daysBefore: 0, refundBps: 0 }];
  assert.equal(refundBpsForCancellation(tiers, 45), 9000);
  assert.equal(refundBpsForCancellation(tiers, 30), 9000);
  assert.equal(refundBpsForCancellation(tiers, 10), 5000);
  assert.equal(refundBpsForCancellation(tiers, 3), 0);
});

test('default budget split always totals exactly 100%', () => {
  for (const services of [['venue'], ['venue', 'catering', 'decoration'], ['venue', 'catering', 'decoration', 'photography', 'makeup', 'planner', 'outfits', 'jewellery', 'other']]) {
    assert.equal(defaultAllocation(services).reduce((a, x) => a + x.bps, 0), 10_000);
  }
  assert.deepEqual(defaultAllocation([]), []);
  assert.equal(workingBudget('20_40L'), 300_000_000);
  assert.equal(workingBudget('UNDER_10L'), 100_000_000);
  assert.equal(workingBudget('UNDECIDED'), null);
});
