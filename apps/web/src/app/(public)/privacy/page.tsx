import { Legal, LEGAL_NAME, SUPPORT } from '@/components/legal';
export const metadata = { title: 'Privacy policy' };
export default function Privacy() {
  return <Legal title="Privacy policy">
    <p>This policy explains how {LEGAL_NAME} handles your information.</p>
    <h2>What we collect</h2><ul><li>Account details: name, phone number, email and password (stored only as a secure hash).</li><li>Wedding plans, enquiries, quotations, bookings, messages and support requests.</li><li>Vendors: business details, identity and business documents, and bank details for payouts.</li><li>Technical data such as IP address and device type, for security.</li></ul>
    <h2>How it is used</h2><p>To run the service, connect customers and vendors, send notifications, prevent fraud and meet legal obligations. We do not sell personal data.</p>
    <h2>What vendors see</h2><p>A vendor sees your name and event requirements when you contact them. Your phone number and email are shared only after a booking with that vendor is confirmed.</p>
    <h2>Payments</h2><p>Payments are handled by our payment partner. We never receive or store your card number.</p>
    <h2>Sensitive documents</h2><p>Vendor identity documents are held in private storage. Only authorised staff can open them, and each access is logged.</p>
    <h2>Keeping and deleting data</h2><p>You can delete your account from your settings. Personal details are then erased, while records of completed transactions are kept as required for accounting and legal purposes.</p>
    <h2>Contact</h2><p>For privacy questions, contact {SUPPORT}.</p>
  </Legal>;
}
