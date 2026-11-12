import { Body, Controller, Get, HttpCode, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Auth, AuthCtx, Public } from '../common/auth';
import { dateOnly, paged, PageQuery, paging, Z } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { ContactSchema } from '@mehfil/shared';

interface SearchQuery extends PageQuery { q?: string; category?: string; city?: string; area?: string; date?: string; slot?: string; guests?: string; minPrice?: string; maxPrice?: string; rating?: string; indoorOutdoor?: string; amenities?: string; sort?: string }

export const CARD = {
  id: true, slug: true, title: true, startingPrice: true, priceUnit: true, capacityMin: true, capacityMax: true, avgRating: true, reviewCount: true,
  category: { select: { id: true, name: true, slug: true } }, city: { select: { name: true } }, area: { select: { name: true } },
  vendor: { select: { id: true, businessName: true, slug: true, identityVerifiedAt: true, businessVerifiedAt: true, featuredUntil: true, logoUrl: true } },
  media: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { url: true, type: true } },
} satisfies Prisma.ListingSelect;

const int = (v?: string) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) ? n : undefined; };

@Controller()
export class CatalogController {
  constructor(private prisma: PrismaService) {}

  @Public() @Get('cities')
  cities() { return this.prisma.city.findMany({ where: { active: true }, include: { areas: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }); }

  @Public() @Get('categories')
  async categories() {
    const rows = await this.prisma.category.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, description: true, iconKey: true, imageUrl: true, availabilityMode: true, amenityOptions: true } });
    const counts = await this.prisma.listing.groupBy({ by: ['categoryId'], where: { status: 'PUBLISHED', vendor: { status: 'APPROVED' } }, _count: true });
    return rows.map((c) => ({ ...c, listingCount: counts.find((x) => x.categoryId === c.id)?._count ?? 0 }));
  }

  @Public() @Get('listings')
  async search(@Query() q: SearchQuery) {
    const p = paging(q, 48);
    const guests = int(q.guests), min = int(q.minPrice), max = int(q.maxPrice), rating = int(q.rating);
    const where: Prisma.ListingWhereInput = {
      status: 'PUBLISHED', vendor: { status: 'APPROVED' },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.city ? { city: { slug: q.city } } : {}),
      ...(q.area ? { area: { slug: q.area } } : {}),
      ...(guests ? { OR: [{ capacityMax: null }, { capacityMax: { gte: guests } }] } : {}),
      ...(min !== undefined || max !== undefined ? { startingPrice: { gte: min, lte: max } } : {}),
      ...(rating ? { avgRating: { gte: rating } } : {}),
      ...(q.indoorOutdoor === 'INDOOR' || q.indoorOutdoor === 'OUTDOOR' ? { indoorOutdoor: { in: [q.indoorOutdoor, 'BOTH'] } } : {}),
      ...(q.amenities ? { amenities: { hasEvery: q.amenities.split(',').filter(Boolean) } } : {}),
      ...(q.q?.trim() ? { AND: [{ OR: [{ title: { contains: q.q.trim(), mode: 'insensitive' } }, { description: { contains: q.q.trim(), mode: 'insensitive' } }, { vendor: { businessName: { contains: q.q.trim(), mode: 'insensitive' } } }] }] } : {}),
    };
    if (q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      const slots = q.slot === 'LUNCH' ? ['LUNCH'] : q.slot === 'DINNER' ? ['DINNER'] : ['LUNCH', 'DINNER'];
      const full = await this.prisma.$queryRaw<{ listingId: string }[]>`
        SELECT o."listingId" FROM "Occupancy" o JOIN "Listing" l ON l."id" = o."listingId"
        WHERE o."date" = ${dateOnly(q.date)}::date AND o."slot"::text = ANY(${slots}) AND (o."expiresAt" IS NULL OR o."expiresAt" > now())
        GROUP BY o."listingId", o."slot", l."dailyCapacity" HAVING COUNT(*) >= l."dailyCapacity"`;
      if (full.length) where.id = { notIn: full.map((r) => r.listingId) };
    }
    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      q.sort === 'price_asc' ? [{ startingPrice: 'asc' }] :
      q.sort === 'rating' ? [{ avgRating: 'desc' }, { reviewCount: 'desc' }] :
      q.sort === 'popular' ? [{ viewCount: 'desc' }] :
      q.sort === 'newest' ? [{ publishedAt: 'desc' }] :
      [{ vendor: { featuredUntil: { sort: 'desc', nulls: 'last' } } }, { avgRating: 'desc' }, { publishedAt: 'desc' }];
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({ where, orderBy, select: CARD, skip: p.skip, take: p.take }),
      this.prisma.listing.count({ where }),
    ]);
    return paged(items.map(withFeatured), total, p);
  }

  @Public() @Get('listings/slugs')
  async slugs() {
    const rows = await this.prisma.listing.findMany({ where: { status: 'PUBLISHED', vendor: { status: 'APPROVED' } }, select: { slug: true, updatedAt: true }, take: 5000 });
    return rows;
  }

  @Public() @Get('listings/:slug')
  async detail(@Param('slug') slug: string, @Auth() auth?: AuthCtx) {
    const listing = await this.prisma.listing.findFirst({
      where: { slug, status: 'PUBLISHED', vendor: { status: 'APPROVED' } },
      include: {
        category: { select: { id: true, name: true, slug: true, availabilityMode: true } }, city: { select: { name: true, slug: true } }, area: { select: { name: true } },
        media: { orderBy: { sortOrder: 'asc' } }, packages: { where: { active: true }, orderBy: { price: 'asc' } }, addOns: true,
        // Contact details stay private until there is a booking, which keeps both sides protected by the platform.
        vendor: { select: { id: true, slug: true, businessName: true, description: true, logoUrl: true, coverUrl: true, yearEstablished: true, identityVerifiedAt: true, businessVerifiedAt: true, avgRating: true, reviewCount: true, workingHours: true, serviceAreas: true } },
        reviews: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, rating: true, comment: true, photos: true, reply: true, repliedAt: true, createdAt: true, customer: { select: { name: true } } } },
      },
    });
    if (!listing) throw new NotFoundException('This listing is not available');
    await this.prisma.listing.update({ where: { id: listing.id }, data: { viewCount: { increment: 1 } } });
    const saved = auth ? !!(await this.prisma.savedListing.findUnique({ where: { userId_listingId: { userId: auth.userId, listingId: listing.id } } })) : false;
    return { ...listing, saved };
  }

  @Public() @Get('listings/:id/availability')
  async availability(@Param('id') id: string, @Query('month') month: string) {
    if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new NotFoundException('Invalid month');
    return this.monthAvailability(this.prisma, id, month);
  }

  async monthAvailability(prisma: PrismaService, id: string, month: string) {
    const listing = await prisma.listing.findUniqueOrThrow({ where: { id }, select: { dailyCapacity: true } });
    const from = dateOnly(`${month}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const rows = await prisma.occupancy.groupBy({ by: ['date', 'slot'], where: { listingId: id, date: { gte: from, lt: to }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, _count: true });
    const days: Record<string, { LUNCH: boolean; DINNER: boolean }> = {};
    for (const r of rows) {
      const key = r.date.toISOString().slice(0, 10);
      days[key] ??= { LUNCH: true, DINNER: true };
      if (r._count >= listing.dailyCapacity) days[key][r.slot] = false;
    }
    return { month, unavailable: days };
  }

  @Public() @Get('featured')
  async featured(@Query('city') city?: string) {
    const items = await this.prisma.listing.findMany({
      where: { status: 'PUBLISHED', vendor: { status: 'APPROVED', featuredUntil: { gt: new Date() } }, ...(city ? { city: { slug: city } } : {}) },
      select: CARD, orderBy: { avgRating: 'desc' }, take: 8,
    });
    return items.map(withFeatured);
  }

  @Public() @Get('top-rated')
  async topRated(@Query('city') city?: string) {
    const items = await this.prisma.listing.findMany({
      where: { status: 'PUBLISHED', vendor: { status: 'APPROVED' }, ...(city ? { city: { slug: city } } : {}) },
      select: CARD, orderBy: [{ avgRating: 'desc' }, { reviewCount: 'desc' }, { publishedAt: 'desc' }], take: 8,
    });
    return items.map(withFeatured);
  }

  @Get('saved')
  async saved(@Auth() auth: AuthCtx) {
    const rows = await this.prisma.savedListing.findMany({ where: { userId: auth.userId, listing: { status: 'PUBLISHED', vendor: { status: 'APPROVED' } } }, orderBy: { createdAt: 'desc' }, select: { listing: { select: CARD } } });
    return rows.map((r) => withFeatured(r.listing));
  }

  @HttpCode(200) @Post('saved/:listingId/toggle')
  async toggle(@Auth() auth: AuthCtx, @Param('listingId') listingId: string) {
    const key = { userId_listingId: { userId: auth.userId, listingId } };
    const existing = await this.prisma.savedListing.findUnique({ where: key });
    if (existing) { await this.prisma.savedListing.delete({ where: key }); return { saved: false }; }
    await this.prisma.savedListing.create({ data: { userId: auth.userId, listingId } });
    return { saved: true };
  }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('contact')
  async contact(@Body(Z(ContactSchema)) body: any) {
    await this.prisma.contactMessage.create({ data: body });
    return { ok: true };
  }
}

function withFeatured<T extends { vendor: { featuredUntil: Date | null } }>(l: T) {
  return { ...l, featured: !!l.vendor.featuredUntil && l.vendor.featuredUntil > new Date() };
}

@Module({ controllers: [CatalogController], providers: [], exports: [] })
export class CatalogModule {}
