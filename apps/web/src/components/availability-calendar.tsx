'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { QUOTE_DATE_EVENT } from './listing-actions';

const key = (d: Date) => d.toISOString().slice(0, 10);
// Pakistan time, so "today" matches the customer's calendar rather than UTC.
const todayPk = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const MAX_MONTHS_AHEAD = 24;

/**
 * Public availability for one listing. It shows only whether lunch, dinner or the whole day is taken
 * (booked, held or closed by the vendor), never who booked or why.
 */
export function AvailabilityCalendar({ listingId }: { listingId: string }) {
  const start = todayPk().slice(0, 7);
  const [month, setMonth] = useState(start);
  const { data, isLoading, error } = useApi<{ unavailable: Record<string, { LUNCH: boolean; DINNER: boolean }> }>(`/listings/${listingId}/availability?month=${month}`);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (y - Number(start.slice(0, 4))) * 12 + (m - Number(start.slice(5, 7)));
  const shift = (n: number) => setMonth(key(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7));
  const today = todayPk();
  const taken = data?.unavailable ?? {};

  return (
    <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={offset <= 0} aria-label="Previous month" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-blush disabled:opacity-30"><ChevronLeft className="size-4" /></button>
        <p className="font-medium" aria-live="polite">{first.toLocaleDateString('en-PK', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
        <button type="button" onClick={() => shift(1)} disabled={offset >= MAX_MONTHS_AHEAD} aria-label="Next month" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-blush disabled:opacity-30"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      {error ? <p className="py-8 text-center text-sm text-muted">Availability could not be loaded. Please try again.</p> : (
        <div className={`grid grid-cols-7 gap-1 transition-opacity ${isLoading ? 'opacity-50' : ''}`}>
          {Array.from({ length: first.getUTCDay() }, (_, i) => <div key={`pad${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const d = key(new Date(Date.UTC(y, m - 1, i + 1)));
            const past = d < today;
            const t = taken[d];
            const lunch = !!t && !t.LUNCH;
            const dinner = !!t && !t.DINNER;
            const tag = lunch && dinner ? 'Full day' : lunch ? 'Lunch' : dinner ? 'Dinner' : null;
            const label = past ? `${d}: past` : lunch && dinner ? `${d}: fully booked` : lunch ? `${d}: lunch booked, dinner available` : dinner ? `${d}: dinner booked, lunch available` : `${d}: available`;
            const pickable = !past && !(lunch && dinner);
            const Cell = pickable ? 'button' : 'div';
            return (
              <Cell key={d} {...(pickable ? { type: 'button' as const, onClick: () => window.dispatchEvent(new CustomEvent(QUOTE_DATE_EVENT, { detail: d })), 'aria-label': `${label}. Request a quote for this date` } : { role: 'img', 'aria-label': label })} title={past ? undefined : pickable ? `${label.slice(12)}. Click to request a quote` : label.slice(12)} className={`relative aspect-square overflow-hidden rounded-lg border text-sm ${past ? 'border-transparent text-muted/50' : 'border-line'} ${pickable ? 'cursor-pointer transition hover:border-ruby hover:shadow-[0_0_0_2px_rgba(143,48,72,.15)] focus-visible:outline-2 focus-visible:outline-ruby' : ''}`}>
                {!past && lunch && <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-ruby" />}
                {!past && dinner && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-ruby" />}
                <span className="relative flex h-full flex-col items-center justify-center gap-0.5 leading-none">
                  <span className={`tnum ${!past && lunch && dinner ? 'font-medium text-white' : ''} ${!past && lunch && !dinner ? 'font-medium text-white' : ''}`}>{i + 1}</span>
                  {!past && tag && <span className={`max-w-full truncate px-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] ${dinner ? 'text-white' : 'text-ink'}`}>{tag}</span>}
                </span>
              </Cell>
            );
          })}
        </div>
      )}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded border border-line bg-white" />Available</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded bg-ruby" />Booked</li>
        <li>Top half lunch, bottom half dinner</li>
      </ul>
      <p className="mt-2 text-xs text-muted">Tap an open date to request a quote. The vendor confirms your date when you send it.</p>
    </div>
  );
}
