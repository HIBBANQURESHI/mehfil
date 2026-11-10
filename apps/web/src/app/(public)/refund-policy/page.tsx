import { Legal, SUPPORT } from '@/components/legal';
export const metadata = { title: 'Refund and cancellation policy' };
export default function Refunds() {
  return <Legal title="Refund and cancellation policy">
    <p>Every booking shows its cancellation policy before you pay, and that policy stays attached to your booking even if it changes later.</p>
    <h2>If you cancel</h2><p>The refund depends on how many days remain before your event, under the policy on your booking. Your booking page shows the amount before you confirm a cancellation.</p>
    <h2>If the vendor cancels</h2><p>If a vendor cancels a confirmed booking, the amounts you paid for that booking are refunded in full.</p>
    <h2>If something goes wrong</h2><p>You can raise a dispute from your booking page. Payouts to the vendor for that booking are paused while our team looks into it.</p>
    <h2>How refunds are paid</h2><p>Approved refunds go back through the original payment method. Timing depends on your bank or wallet provider.</p>
    <h2>Contact</h2><p>For help with a refund, open a support ticket in your account or contact {SUPPORT}.</p>
  </Legal>;
}
