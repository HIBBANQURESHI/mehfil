import { BadgeCheck, CalendarDays, FileText, Inbox, Wallet } from 'lucide-react';
import { LinkButton } from '@/components/ui';
export const metadata = { title: 'List your wedding business', description: 'Reach couples planning weddings in Karachi. Manage enquiries, quotations, bookings and payments in one place.' };
const POINTS = [[Inbox, 'Receive real enquiries', 'Date, guests, budget and requirements arrive in one inbox.'], [FileText, 'Send proper quotations', 'Itemised prices, payment schedule and terms, with revisions tracked.'], [CalendarDays, 'Never double-book', 'Your calendar updates by itself as bookings come in.'], [Wallet, 'See what you earn', 'Every payment, commission and payout on a clear statement.']] as const;
const STEPS = ['Create your account and verify your phone', 'Add your business, location and CNIC', 'Add a listing with photos and packages', 'We verify your details and your listing goes live'];
export default function ListYourBusiness() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="max-w-2xl text-4xl md:text-5xl">Your next booking is already looking for you</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">Joining Mehfil is free. A commission applies only to bookings that are paid, and you will always see it before it is charged.</p>
      <LinkButton href="/register?type=vendor" className="mt-6">Start your application</LinkButton>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">{POINTS.map(([I, t, b]) => <div key={t} className="rounded-2xl border border-line bg-white p-5"><I className="size-6 text-ruby" aria-hidden /><h2 className="mt-3 text-lg">{t}</h2><p className="mt-1 text-sm text-muted">{b}</p></div>)}</div>
      <h2 className="mt-14 text-3xl">Getting listed</h2>
      <ol className="mt-5 space-y-3">{STEPS.map((s, i) => <li key={s} className="flex items-center gap-3"><BadgeCheck className="size-5 shrink-0 text-gold" aria-hidden /><span><span className="tnum font-medium">Step {i + 1}: </span>{s}</span></li>)}</ol>
    </div>
  );
}
