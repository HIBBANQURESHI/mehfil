import { BPS } from './money';

/**
 * What a couple can say they need. `categories` links a service to marketplace categories (by slug) for
 * recommendations. `weight` is only a starting point for splitting a budget; the customer edits it freely.
 */
export const WEDDING_SERVICES = [
  { key: 'venue', label: 'Wedding venue', categories: ['banquet-halls', 'marquees'], weight: 25 },
  { key: 'catering', label: 'Catering', categories: ['catering'], weight: 30 },
  { key: 'decoration', label: 'Decoration', categories: ['decoration'], weight: 15 },
  { key: 'photography', label: 'Photography and videography', categories: ['photography', 'videography'], weight: 10 },
  { key: 'makeup', label: 'Makeup artist', categories: ['makeup-artists'], weight: 5 },
  { key: 'planner', label: 'Wedding planner', categories: ['wedding-planners'], weight: 6 },
  { key: 'outfits', label: 'Bridal and groom outfits', categories: [], weight: 5 },
  { key: 'jewellery', label: 'Jewellery', categories: [], weight: 4 },
  { key: 'other', label: 'Other services', categories: [], weight: 10 },
] as const;
export type ServiceKey = (typeof WEDDING_SERVICES)[number]['key'];
export const SERVICE_KEYS = WEDDING_SERVICES.map((s) => s.key) as [ServiceKey, ...ServiceKey[]];
export const serviceOf = (key: string) => WEDDING_SERVICES.find((s) => s.key === key);

const LAKH = 10_000_000; // PKR 100,000 in paisa
export const BUDGET_BANDS = [
  { key: 'UNDER_10L', label: 'Under PKR 10 lakh', min: null, max: 10 * LAKH },
  { key: '10_20L', label: 'PKR 10–20 lakh', min: 10 * LAKH, max: 20 * LAKH },
  { key: '20_40L', label: 'PKR 20–40 lakh', min: 20 * LAKH, max: 40 * LAKH },
  { key: '40_70L', label: 'PKR 40–70 lakh', min: 40 * LAKH, max: 70 * LAKH },
  { key: '70L_1CR', label: 'PKR 70 lakh – 1 crore', min: 70 * LAKH, max: 100 * LAKH },
  { key: 'ABOVE_1CR', label: 'Above PKR 1 crore', min: 100 * LAKH, max: null },
  { key: 'UNDECIDED', label: 'Not decided yet', min: null, max: null },
  { key: 'CUSTOM', label: 'Enter an exact amount', min: null, max: null },
] as const;
export type BudgetBand = (typeof BUDGET_BANDS)[number]['key'];
export const BUDGET_BAND_KEYS = BUDGET_BANDS.map((b) => b.key) as [BudgetBand, ...BudgetBand[]];

/** The figure a range stands for until the customer gives an exact amount: the middle of a range, or its one edge. */
export function workingBudget(band: string | null | undefined): number | null {
  const b = BUDGET_BANDS.find((x) => x.key === band);
  if (!b || (b.min === null && b.max === null)) return null;
  if (b.min !== null && b.max !== null) return Math.round((b.min + b.max) / 2);
  return (b.max ?? b.min) as number;
}

/** Splits 100% across the chosen services by their weights. Parts are whole basis points and always sum to exactly 100%. */
export function defaultAllocation(services: readonly string[]): { service: ServiceKey; bps: number }[] {
  const chosen = WEDDING_SERVICES.filter((s) => services.includes(s.key));
  if (!chosen.length) return [];
  const total = chosen.reduce((a, s) => a + s.weight, 0);
  let used = 0;
  return chosen.map((s, i) => {
    const bps = i === chosen.length - 1 ? BPS - used : Math.round((s.weight / total) * BPS);
    used += bps;
    return { service: s.key, bps };
  });
}

export const PLANNING_STATUS = [
  { key: 'JUST_STARTED', label: 'Just started' },
  { key: 'ALREADY_PLANNING', label: 'Already planning' },
  { key: 'URGENT', label: 'Need vendors urgently' },
] as const;
export const WEDDING_STYLES = [
  { key: 'TRADITIONAL', label: 'Traditional' },
  { key: 'MODERN', label: 'Modern' },
  { key: 'ELEGANT', label: 'Elegant and classic' },
  { key: 'GRAND', label: 'Grand and lavish' },
  { key: 'INTIMATE', label: 'Small and intimate' },
  { key: 'NOT_SURE', label: 'Not sure yet' },
] as const;
export const VENUE_PREFERENCES = [
  { key: 'BANQUET_HALL', label: 'Banquet hall' },
  { key: 'MARQUEE', label: 'Marquee' },
  { key: 'OUTDOOR', label: 'Outdoor or lawn' },
  { key: 'HOME', label: 'At home' },
  { key: 'NOT_SURE', label: 'No preference' },
] as const;
export const VENUE_STATUS = [
  { key: 'NEED_VENUE', label: 'Need a venue' },
  { key: 'BOOKED', label: 'Already booked' },
  { key: 'NOT_SURE', label: 'Not sure yet' },
] as const;
export const GUEST_PRESETS = [100, 200, 300, 500, 1000] as const;

export const keysOf = <T extends readonly { key: string }[]>(list: T) => list.map((x) => x.key) as [T[number]['key'], ...T[number]['key'][]];
export const labelOf = (list: readonly { key: string; label: string }[], key?: string | null) => list.find((x) => x.key === key)?.label ?? null;

export function planningStage(percent: number) {
  if (percent >= 90) return 'Almost ready';
  if (percent >= 60) return 'Well on your way';
  if (percent >= 25) return 'Making progress';
  return 'Getting started';
}
