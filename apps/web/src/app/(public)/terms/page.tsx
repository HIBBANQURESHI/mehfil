import { Legal, LEGAL_NAME, SUPPORT } from '@/components/legal';
export const metadata = { title: 'Terms of use' };
export default function Terms() {
  return <Legal title="Terms of use">
    <p>These terms apply when you use the {LEGAL_NAME} website and apps (“Mehfil”). By creating an account you agree to them.</p>
    <h2>What Mehfil is</h2><p>Mehfil is a marketplace connecting customers with independent wedding and event vendors. The vendor, not Mehfil, provides the service and is responsible for delivering it.</p>
    <h2>Accounts</h2><p>You must give accurate information and keep your password private. You are responsible for activity on your account.</p>
    <h2>Quotations and bookings</h2><ul><li>A quotation is the vendor’s offer and is valid until the date shown on it.</li><li>Accepting a quotation does not confirm a booking. A booking is confirmed only after the vendor reconfirms the date and the required advance is received.</li><li>The price, payment schedule and cancellation policy shown when you accept apply to that booking.</li></ul>
    <h2>Vendors</h2><p>Vendors must be truthful about their identity, services, prices and availability, must only upload content they have the right to use, and agree to pay the commission shown in their dashboard on amounts collected. Verification confirms the documents reviewed; it is not a guarantee of service quality.</p>
    <h2>Reviews and conduct</h2><p>Reviews must be honest. Harassment, fraud, fake bookings and attempts to misuse the platform may lead to suspension.</p>
    <h2>Liability</h2><p>To the extent permitted by law, Mehfil is not liable for a vendor’s failure to perform, beyond the assistance described in our refund and cancellation policy.</p>
    <h2>Contact</h2><p>Questions can be sent to {SUPPORT}.</p>
  </Legal>;
}
