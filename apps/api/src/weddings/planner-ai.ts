import { Injectable, Logger } from '@nestjs/common';
import { BPS, EventType, labelOf, PLANNING_STATUS, serviceOf, statusLabel, VENUE_PREFERENCES, VENUE_STATUS, WEDDING_STYLES } from '@mehfil/shared';
import { z } from 'zod';
import { env } from '../common/config';
import { PrismaService } from '../common/prisma.service';

const MAX_ATTEMPTS = 3;
const LOCK_MS = 3 * 60_000;

export interface PlanContext {
  today: string;
  latestDate: string | null;
  city: string | null;
  weddingDate: string | null;
  targetMonth: string | null;
  guestCount: number | null;
  planningStatus: string | null;
  budgetRupees: number | null;
  style: string | null;
  venuePreference: string | null;
  services: string[];
  events: { name: string; date: string | null; guestCount: number | null; venue: string | null }[];
  existingTasks: string[];
}

export interface AiPlan {
  welcome: string | null;
  allocation: { service: string; bps: number }[];
  checklist: { title: string; dueDate: string | null }[];
}

const RawPlan = z.object({
  welcome: z.string().optional(),
  allocation: z.array(z.object({ service: z.string(), percent: z.number() })).optional(),
  checklist: z.array(z.object({ title: z.string(), dueDate: z.string().optional() })).optional(),
});

const URL = /https?:\/\/\S+|www\.\S+/gi;
// The model is told not to claim availability or prices; anything that does anyway is dropped rather than shown.
const FORBIDDEN = /availab|discount|guarantee|\bPKR\b|\bRs\.?\s?\d/i;

/**
 * Model output is untrusted. Everything is checked and narrowed here, so a bad or unexpected answer can only
 * remove extras, never put something wrong in front of the customer.
 */
export function sanitizeAiPlan(raw: unknown, ctx: { services: string[]; today: string; latestDate: string | null; existingTasks: string[] }): AiPlan | null {
  const parsed = RawPlan.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;

  let welcome = p.welcome?.replace(URL, '').replace(/\s+/g, ' ').trim() ?? '';
  if (welcome.length > 420) welcome = welcome.slice(0, 420).replace(/[^.!?]*$/, '').trim();
  if (welcome.length < 20 || FORBIDDEN.test(welcome)) welcome = '';

  const seen = new Set<string>();
  const rows = (p.allocation ?? []).filter((a) => ctx.services.includes(a.service) && Number.isFinite(a.percent) && a.percent > 0 && a.percent <= 100 && !seen.has(a.service) && seen.add(a.service));
  const sum = rows.reduce((s, a) => s + a.percent, 0);
  let allocation: AiPlan['allocation'] = [];
  // Close to 100% is rescaled to exactly 100%; anything further off is not trusted at all.
  if (rows.length === ctx.services.length && sum >= 90 && sum <= 110) {
    let used = 0;
    allocation = rows.map((a, i) => {
      const bps = i === rows.length - 1 ? BPS - used : Math.round((a.percent / sum) * BPS);
      used += bps;
      return { service: a.service, bps };
    });
    if (allocation.some((a) => a.bps <= 0)) allocation = [];
  }

  const last = ctx.latestDate ?? addYears(ctx.today, 2);
  const existing = new Set(ctx.existingTasks.map((t) => t.toLowerCase()));
  const checklist: AiPlan['checklist'] = [];
  for (const item of p.checklist ?? []) {
    const title = item.title.replace(URL, '').replace(/\s+/g, ' ').trim();
    const key = title.toLowerCase();
    if (title.length < 4 || title.length > 120 || existing.has(key) || FORBIDDEN.test(title)) continue;
    existing.add(key);
    const d = item.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) && !Number.isNaN(Date.parse(item.dueDate)) ? item.dueDate : null;
    checklist.push({ title, dueDate: d && d >= ctx.today && d <= last ? d : null });
    if (checklist.length >= 15) break;
  }

  if (!welcome && !allocation.length && !checklist.length) return null;
  return { welcome: welcome || null, allocation, checklist };
}

function addYears(iso: string, years: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

const SYSTEM = [
  'You help couples in Pakistan plan their weddings on Mehfil, a wedding marketplace.',
  'Be warm, practical and brief, and write in English.',
  'Never name or invent vendors, venues, brands or prices. Never say anything is available, booked or discounted.',
  'Use only the details you are given.',
].join(' ');

@Injectable()
export class GeminiClient {
  private log = new Logger('Gemini');

  get enabled() { return !!env.GEMINI_API_KEY; }

  /** Only what is needed to plan goes to Google: no names, phone numbers or emails. */
  async plan(ctx: PlanContext): Promise<unknown> {
    const props: Record<string, unknown> = {
      welcome: { type: 'STRING' },
      checklist: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, dueDate: { type: 'STRING' } }, required: ['title', 'dueDate'] } },
    };
    if (ctx.services.length) props.allocation = { type: 'ARRAY', items: { type: 'OBJECT', properties: { service: { type: 'STRING', enum: ctx.services }, percent: { type: 'INTEGER' } }, required: ['service', 'percent'] } };
    const { existingTasks, ...details } = ctx;
    const prompt = [
      `Today is ${ctx.today}. Wedding details: ${JSON.stringify(details)}`,
      'Return JSON with:',
      '- welcome: two short sentences (at most 55 words) to the couple about their plan, mentioning their events and city if known.',
      ctx.services.length ? `- allocation: a sensible starting split of their total budget across exactly these services: ${ctx.services.join(', ')}. Whole percentages totalling 100.` : '',
      `- checklist: 8 to 14 concrete planning tasks in a sensible order, each with dueDate as YYYY-MM-DD between ${ctx.today} and ${ctx.latestDate ?? 'the wedding'}, or an empty string when no date is known. Fit them to the chosen events and services.`,
      `Do not repeat these existing tasks: ${JSON.stringify(existingTasks)}`,
    ].filter(Boolean).join('\n');

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: props, required: Object.keys(props) } },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    try { return JSON.parse(text); } catch { this.log.warn('Gemini returned text that is not JSON'); return null; }
  }
}

@Injectable()
export class WeddingPersonalizer {
  private log = new Logger('WeddingPersonalizer');
  constructor(private prisma: PrismaService, public gemini: GeminiClient) {}

  async context(weddingId: string): Promise<PlanContext> {
    const w = await this.prisma.wedding.findUniqueOrThrow({ where: { id: weddingId }, include: { city: true, events: { orderBy: { date: 'asc' } }, checklist: true } });
    const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
    const dates = w.events.map((e) => iso(e.date)).filter(Boolean) as string[];
    const monthEnd = w.targetMonth ? new Date(Date.UTC(+w.targetMonth.slice(0, 4), +w.targetMonth.slice(5, 7), 0)).toISOString().slice(0, 10) : null;
    return {
      today: new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10),
      latestDate: dates.length ? dates[dates.length - 1] : iso(w.dateTo) ?? iso(w.dateFrom) ?? monthEnd,
      city: w.city?.name ?? null,
      weddingDate: iso(w.dateFrom), targetMonth: w.targetMonth, guestCount: w.guestCount,
      planningStatus: labelOf(PLANNING_STATUS, w.planningStatus), budgetRupees: w.budget === null ? null : Math.round(Number(w.budget) / 100),
      style: labelOf(WEDDING_STYLES, w.style), venuePreference: labelOf(VENUE_PREFERENCES, w.venuePreference),
      services: w.services.filter((s) => serviceOf(s)),
      events: w.events.map((e) => ({ name: e.name ?? statusLabel(e.type as (typeof EventType)[number]), date: iso(e.date), guestCount: e.guestCount, venue: labelOf(VENUE_STATUS, e.venueStatus) })),
      existingTasks: w.checklist.map((c) => c.title),
    };
  }

  /** Claims the wedding first, so two API servers or a retry can never personalise it twice at the same time. */
  async personalize(weddingId: string) {
    if (!this.gemini.enabled) return;
    const claimed = await this.prisma.wedding.updateMany({
      where: { id: weddingId, aiStatus: 'PENDING', OR: [{ aiLockedUntil: null }, { aiLockedUntil: { lt: new Date() } }] },
      data: { aiLockedUntil: new Date(Date.now() + LOCK_MS), aiAttempts: { increment: 1 } },
    });
    if (!claimed.count) return;
    try {
      const ctx = await this.context(weddingId);
      const plan = sanitizeAiPlan(await this.gemini.plan(ctx), ctx);
      if (!plan) throw new Error('No usable plan in the response');
      await this.prisma.$transaction(async (tx) => {
        const count = await tx.checklistItem.count({ where: { weddingId } });
        if (plan.checklist.length) await tx.checklistItem.createMany({ data: plan.checklist.map((c, i) => ({ weddingId, title: c.title, dueDate: c.dueDate ? new Date(`${c.dueDate}T00:00:00Z`) : null, source: 'AI', sortOrder: count + i })) });
        await tx.wedding.update({ where: { id: weddingId }, data: { aiStatus: 'READY', aiNote: plan.welcome, aiAllocation: plan.allocation.length ? plan.allocation : undefined, aiLockedUntil: null } });
      });
    } catch (e) {
      const w = await this.prisma.wedding.findUnique({ where: { id: weddingId }, select: { aiAttempts: true } });
      const attempts = w?.aiAttempts ?? MAX_ATTEMPTS;
      // Google is often briefly overloaded, so failures wait longer each time before the next try.
      await this.prisma.wedding.update({ where: { id: weddingId }, data: attempts >= MAX_ATTEMPTS ? { aiStatus: 'FAILED', aiLockedUntil: null } : { aiLockedUntil: new Date(Date.now() + 2 ** attempts * 60_000) } });
      this.log.warn(`Personalising wedding ${weddingId} failed (attempt ${attempts}): ${(e as Error).message}`);
    }
  }

  /** Picks up plans whose first attempt was interrupted or is due a retry. */
  async runDue() {
    if (!this.gemini.enabled) return;
    const due = await this.prisma.wedding.findMany({ where: { aiStatus: 'PENDING', OR: [{ aiLockedUntil: null }, { aiLockedUntil: { lt: new Date() } }] }, select: { id: true }, take: 5, orderBy: { createdAt: 'asc' } });
    for (const w of due) await this.personalize(w.id);
  }
}
