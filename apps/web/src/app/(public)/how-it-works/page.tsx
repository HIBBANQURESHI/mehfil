export const metadata = { title: 'How it works' };
const STEPS = [
  ['Search and shortlist', 'Browse verified vendors by date, guest count, area and price. You can browse without an account.'],
  ['Request quotations', 'Send your requirements to one vendor or several at once. Each replies with their own itemised quotation.'],
  ['Compare and accept', 'See price, terms and cancellation policy side by side. Accepting a quotation does not confirm the booking yet.'],
  ['Vendor reconfirms', 'The vendor reconfirms your date and it is held for you for a limited time.'],
  ['Pay the advance', 'Your booking is confirmed once the agreed advance is received. Your receipt and schedule stay in your account.'],
  ['Celebrate and review', 'After the event, confirm it went well and leave a review. Only customers with a completed booking can review.'],
];
export default function HowItWorks() {
  return <div className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-4xl">How Mehfil works</h1><ol className="mt-8 space-y-5">{STEPS.map(([t, b], i) => <li key={t} className="flex gap-4 rounded-2xl border border-line bg-white p-5"><span className="tnum grid size-9 shrink-0 place-items-center rounded-full bg-ruby font-semibold text-white">{i + 1}</span><div><h2 className="text-lg">{t}</h2><p className="mt-1 text-sm leading-6 text-muted">{b}</p></div></li>)}</ol></div>;
}
