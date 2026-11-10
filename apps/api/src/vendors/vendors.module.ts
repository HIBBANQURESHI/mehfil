import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Listing } from '@prisma/client';
import type { Response } from 'express';
import { fromBuffer } from 'file-type';
import { z } from 'zod';
import { AddOnSchema, BlockDatesSchema, DocumentMetaSchema, ListingMediaSchema, ListingSchema, PackageSchema, PayoutDetailsSchema, ReviewReplySchema, SubmitVendorSchema, VendorInviteSchema, VendorProfileSchema, ReasonSchema } from '@mehfil/shared';
import { Auth, AuthCtx, VendorOnly } from '../common/auth';
import { AuditService } from '../common/audit.service';
import { decrypt, encrypt, maskIban } from '../common/crypto';
import { dateOnly, paged, PageQuery, paging, slugify, Z } from '../common/http';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../common/settings.service';
import { NotificationsService } from '../notifications/notifications.module';
import { MAX_DOC_BYTES, StorageService } from '../storage/storage.module';
import { AvailabilityService } from '../availability/availability.service';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';

const DOC_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService, private storage: StorageService, private audit: AuditService, private notifications: NotificationsService, private settings: SettingsService) {}

  private async uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
    const root = slugify(base);
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? root : `${root}-${i + 1}`;
      if (!(await exists(slug))) return slug;
    }
    return `${root}-${Date.now()}`;
  }
  vendorSlug(name: string) { return this.uniqueSlug(name, async (slug) => !!(await this.prisma.vendor.findUnique({ where: { slug } }))); }
  listingSlug(name: string) { return this.uniqueSlug(name, async (slug) => !!(await this.prisma.listing.findUnique({ where: { slug } }))); }

  async start(userId: string, businessName: string) {
    const existing = await this.prisma.vendorMember.findFirst({ where: { userId, active: true } });
    if (existing) throw new ConflictException('You already have a vendor business on this account.');
    return this.prisma.vendor.create({ data: { businessName, slug: await this.vendorSlug(businessName), members: { create: { userId, role: 'OWNER' } } } });
  }

  async profile(vendorId: string) {
    const v = await this.prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      include: {
        primaryCategory: true, city: true, area: true,
        documents: { orderBy: { createdAt: 'desc' }, select: { id: true, type: true, filename: true, mimeType: true, size: true, reviewStatus: true, reviewNote: true, createdAt: true } },
        listings: { where: { status: { not: 'ARCHIVED' } }, select: { id: true, title: true, status: true, _count: { select: { media: true, packages: true } } } },
      },
    });
    const { iban, ...rest } = v;
    return { ...rest, ibanMasked: iban ? maskIban(decrypt(iban)) : null, checklist: this.checklist(v) };
  }

  private checklist(v: { primaryCategoryId: string | null; description: string | null; phone: string | null; cityId: string | null; address: string | null; logoUrl: string | null; documents: { type: string }[]; listings: { _count: { media: number } }[]; iban: string | null }) {
    const types = v.documents.map((d) => d.type);
    return {
      businessInfo: !!(v.primaryCategoryId && v.description && v.phone),
      location: !!(v.cityId && v.address),
      documents: types.includes('CNIC_FRONT') && types.includes('CNIC_BACK'),
      listing: v.listings.some((l) => l._count.media > 0),
      portfolio: !!v.logoUrl,
      payout: !!v.iban,
    };
  }

  async update(auth: AuthCtx, patch: z.output<typeof VendorProfileSchema>) {
    const current = await this.prisma.vendor.findUniqueOrThrow({ where: { id: auth.vendor!.id } });
    if (current.status === 'APPROVED' && patch.businessName && patch.businessName !== current.businessName) throw new ForbiddenException('A verified business name can only be changed by Mehfil support.');
    if (current.status === 'SUBMITTED' || current.status === 'UNDER_REVIEW') throw new ConflictException('Your application is being reviewed and cannot be edited right now.');
    await this.prisma.vendor.update({ where: { id: auth.vendor!.id }, data: patch });
    return this.profile(auth.vendor!.id);
  }

  async setPayout(auth: AuthCtx, body: z.output<typeof PayoutDetailsSchema>) {
    // Only the owner can say where the money goes. Finance staff can see payouts but not redirect them.
    if (auth.vendor!.role !== 'OWNER') throw new ForbiddenException('Only the business owner can change payout details.');
    await this.prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id: auth.vendor!.id }, data: { bankName: body.bankName, accountTitle: body.accountTitle, iban: encrypt(body.iban) } });
      await this.audit.record({ actorId: auth.userId, action: 'vendor.payout_details_changed', entity: 'Vendor', entityId: auth.vendor!.id, after: { bankName: body.bankName, iban: maskIban(body.iban) } }, tx);
      await this.notifications.notifyVendor(tx, auth.vendor!.id, { type: 'PAYOUT_DETAILS_CHANGED', title: 'Payout details changed', body: 'The bank account for your payouts was updated. If this was not you, contact support right away.', link: '/vendor/settings' });
    });
    return this.profile(auth.vendor!.id);
  }

  async addDocument(vendorId: string, type: z.output<typeof DocumentMetaSchema>['type'], file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose a file.');
    // Checks the actual file bytes: the client-supplied filename and content type can say anything.
    const detected = await fromBuffer(file.buffer);
    const ext = detected && DOC_TYPES[detected.mime];
    if (!detected || !ext) throw new BadRequestException('Documents must be a PDF, JPG or PNG.');
    const storageKey = await this.storage.savePrivate(file.buffer, ext, detected.mime);
    return this.prisma.vendorDocument.create({
      data: { vendorId, type, storageKey, filename: file.originalname.slice(0, 200), mimeType: detected.mime, size: file.size },
      select: { id: true, type: true, filename: true, reviewStatus: true, createdAt: true },
    });
  }

  async removeDocument(vendorId: string, id: string) {
    const res = await this.prisma.vendorDocument.deleteMany({ where: { id, vendorId, reviewStatus: { not: 'APPROVED' } } });
    if (!res.count) throw new NotFoundException('Document not found or already approved');
    return { ok: true };
  }

  async documentFile(id: string, vendorId?: string) {
    const doc = await this.prisma.vendorDocument.findFirst({ where: { id, ...(vendorId ? { vendorId } : {}) } });
    if (!doc) throw new NotFoundException('Document not found');
    return { doc, buffer: await this.storage.readPrivate(doc.storageKey) };
  }

  async submit(auth: AuthCtx) {
    const vendorId = auth.vendor!.id;
    const v = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, include: { documents: true, listings: { where: { status: { not: 'ARCHIVED' } }, include: { _count: { select: { media: true } } } } } });
    if (!['DRAFT', 'CHANGES_REQUIRED', 'REJECTED'].includes(v.status)) throw new ConflictException('This application has already been submitted.');
    const c = this.checklist(v);
    const missing = [!c.businessInfo && 'business information', !c.location && 'location', !c.documents && 'CNIC front and back', !c.listing && 'at least one listing with a photo', !c.portfolio && 'a logo'].filter(Boolean);
    if (missing.length) throw new BadRequestException({ message: `Before submitting, please add: ${missing.join(', ')}.`, code: 'INCOMPLETE', missing });
    await this.prisma.$transaction(async (tx) => {
      await tx.vendor.update({ where: { id: vendorId }, data: { status: 'SUBMITTED', submittedAt: new Date(), termsAcceptedAt: new Date(), statusReason: null } });
      await tx.listing.updateMany({ where: { vendorId, status: { in: ['DRAFT', 'REJECTED'] } }, data: { status: 'PENDING_REVIEW' } });
      await this.notifications.notifyAdmins(tx, 'vendors.review', { type: 'VENDOR_SUBMITTED', title: 'New vendor application', body: `${v.businessName} is waiting for verification.`, link: `/admin/vendors/${vendorId}` });
    });
    return this.profile(vendorId);
  }

  // ---- Listings ------------------------------------------------------------

  private async own(vendorId: string, id: string): Promise<Listing> {
    const l = await this.prisma.listing.findFirst({ where: { id, vendorId } });
    if (!l) throw new NotFoundException('Listing not found');
    return l;
  }

  listListings(vendorId: string) {
    return this.prisma.listing.findMany({
      where: { vendorId, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' },
      include: { category: true, city: true, media: { take: 1, orderBy: { sortOrder: 'asc' } }, _count: { select: { packages: true, media: true, enquiries: true, bookings: true } } },
    });
  }

  async getListing(vendorId: string, id: string) {
    await this.own(vendorId, id);
    return this.prisma.listing.findUniqueOrThrow({ where: { id }, include: { category: true, city: true, area: true, media: { orderBy: { sortOrder: 'asc' } }, packages: { orderBy: { createdAt: 'asc' } }, addOns: true } });
  }

  async createListing(vendorId: string, body: z.output<typeof ListingSchema>) {
    const category = await this.prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category?.active) throw new BadRequestException('Please choose a valid category.');
    return this.prisma.listing.create({ data: { ...body, vendorId, slug: await this.listingSlug(body.title), dailyCapacity: category.availabilityMode === 'EXCLUSIVE' ? 1 : body.dailyCapacity } });
  }

  /** A published listing goes back through review when it changes, unless admins have turned that off. */
  private async afterEdit(listing: Listing) {
    const { requireListingReview } = await this.settings.all();
    if (listing.status === 'PUBLISHED' && requireListingReview) await this.prisma.listing.update({ where: { id: listing.id }, data: { status: 'PENDING_REVIEW' } });
  }

  async updateListing(auth: AuthCtx, id: string, body: z.output<typeof ListingSchema>) {
    const listing = await this.own(auth.vendor!.id, id);
    const category = await this.prisma.category.findUniqueOrThrow({ where: { id: body.categoryId } });
    const updated = await this.prisma.listing.update({ where: { id }, data: { ...body, dailyCapacity: category.availabilityMode === 'EXCLUSIVE' ? 1 : body.dailyCapacity } });
    await this.afterEdit(listing);
    return updated;
  }

  async addMedia(vendorId: string, id: string, body: z.output<typeof ListingMediaSchema>) {
    await this.own(vendorId, id);
    const count = await this.prisma.listingMedia.count({ where: { listingId: id } });
    if (count >= 40) throw new BadRequestException('A listing can have up to 40 photos and videos.');
    return this.prisma.listingMedia.create({ data: { ...body, listingId: id, sortOrder: count } });
  }

  async removeMedia(vendorId: string, id: string, mediaId: string) {
    await this.own(vendorId, id);
    await this.prisma.listingMedia.deleteMany({ where: { id: mediaId, listingId: id } });
    return { ok: true };
  }

  async addPackage(vendorId: string, id: string, body: z.output<typeof PackageSchema>) {
    await this.own(vendorId, id);
    return this.prisma.package.create({ data: { ...body, listingId: id } });
  }

  async updatePackage(vendorId: string, id: string, packageId: string, body: z.output<typeof PackageSchema>) {
    await this.own(vendorId, id);
    const res = await this.prisma.package.updateMany({ where: { id: packageId, listingId: id }, data: body });
    if (!res.count) throw new NotFoundException('Package not found');
    return { ok: true };
  }

  async removePackage(vendorId: string, id: string, packageId: string) {
    await this.own(vendorId, id);
    await this.prisma.package.deleteMany({ where: { id: packageId, listingId: id } });
    return { ok: true };
  }

  async addAddOn(vendorId: string, id: string, body: z.output<typeof AddOnSchema>) {
    await this.own(vendorId, id);
    return this.prisma.addOn.create({ data: { ...body, listingId: id } });
  }

  async removeAddOn(vendorId: string, id: string, addOnId: string) {
    await this.own(vendorId, id);
    await this.prisma.addOn.deleteMany({ where: { id: addOnId, listingId: id } });
    return { ok: true };
  }

  async setListingState(auth: AuthCtx, id: string, action: 'submit' | 'pause' | 'resume' | 'archive') {
    const l = await this.own(auth.vendor!.id, id);
    const { requireListingReview } = await this.settings.all();
    if (action === 'archive') {
      const active = await this.prisma.booking.count({ where: { listingId: id, status: { in: ['PENDING_VENDOR_CONFIRMATION', 'AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] } } });
      if (active) throw new ConflictException('This listing has active bookings and cannot be archived.');
      return this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED' } });
    }
    if (action === 'pause') {
      if (l.status !== 'PUBLISHED') throw new ConflictException('Only published listings can be paused.');
      return this.prisma.listing.update({ where: { id }, data: { status: 'PAUSED' } });
    }
    if (action === 'resume') {
      if (l.status !== 'PAUSED') throw new ConflictException('Only paused listings can be resumed.');
      // A pause placed by Mehfil staff carries a reason, and only staff can lift it.
      if (l.statusReason) throw new ForbiddenException('This listing was paused by Mehfil. Please contact support.');
      return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED' } });
    }
    if (!['DRAFT', 'REJECTED'].includes(l.status)) throw new ConflictException('This listing has already been submitted.');
    if (!(await this.prisma.listingMedia.count({ where: { listingId: id } }))) throw new BadRequestException('Add at least one photo first.');
    // Unapproved vendors stay in review regardless: nothing goes public before the business is verified.
    const publish = auth.vendor!.status === 'APPROVED' && !requireListingReview;
    return this.prisma.listing.update({ where: { id }, data: publish ? { status: 'PUBLISHED', publishedAt: new Date(), statusReason: null } : { status: 'PENDING_REVIEW', statusReason: null } });
  }

  async team(vendorId: string) {
    const [members, invites] = await Promise.all([
      this.prisma.vendorMember.findMany({ where: { vendorId }, include: { user: { select: { id: true, name: true, email: true, phone: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.invite.findMany({ where: { vendorId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, vendorRole: true, expiresAt: true } }),
    ]);
    return { members, invites };
  }

  async removeMember(auth: AuthCtx, memberId: string) {
    const m = await this.prisma.vendorMember.findFirst({ where: { id: memberId, vendorId: auth.vendor!.id } });
    if (!m) throw new NotFoundException('Member not found');
    if (m.role === 'OWNER') throw new ForbiddenException('The owner cannot be removed.');
    await this.prisma.vendorMember.update({ where: { id: memberId }, data: { active: false } });
    await this.audit.record({ actorId: auth.userId, action: 'vendor.member_removed', entity: 'VendorMember', entityId: memberId });
    return { ok: true };
  }
}

@Controller('vendor')
export class VendorController {
  constructor(private vendors: VendorsService, private availability: AvailabilityService, private prisma: PrismaService, private authService: AuthService) {}

  @Post('start') start(@Auth() a: AuthCtx, @Body(Z(z.object({ businessName: z.string().trim().min(2).max(120) }))) b: { businessName: string }) { return this.vendors.start(a.userId, b.businessName); }
  @VendorOnly() @Get('me') me(@Auth() a: AuthCtx) { return this.vendors.profile(a.vendor!.id); }
  @VendorOnly('business') @Patch('me') update(@Auth() a: AuthCtx, @Body(Z(VendorProfileSchema)) b: any) { return this.vendors.update(a, b); }
  @VendorOnly('finance') @Patch('payout-details') payout(@Auth() a: AuthCtx, @Body(Z(PayoutDetailsSchema)) b: any) { return this.vendors.setPayout(a, b); }
  @VendorOnly('business') @Post('submit') submit(@Auth() a: AuthCtx, @Body(Z(SubmitVendorSchema)) _b: any) { return this.vendors.submit(a); }

  @VendorOnly('business') @Post('documents') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOC_BYTES, files: 1 } }))
  addDoc(@Auth() a: AuthCtx, @Body(Z(DocumentMetaSchema)) b: any, @UploadedFile() file?: Express.Multer.File) { return this.vendors.addDocument(a.vendor!.id, b.type, file); }
  @VendorOnly('business') @Delete('documents/:id') rmDoc(@Auth() a: AuthCtx, @Param('id') id: string) { return this.vendors.removeDocument(a.vendor!.id, id); }
  @VendorOnly('business') @Get('documents/:id/file') async docFile(@Auth() a: AuthCtx, @Param('id') id: string, @Res() res: Response) {
    const { doc, buffer } = await this.vendors.documentFile(id, a.vendor!.id);
    res.setHeader('Content-Type', doc.mimeType); res.setHeader('Content-Disposition', 'attachment'); res.setHeader('Cache-Control', 'private, no-store'); res.send(buffer);
  }

  @VendorOnly('listings') @Get('listings') listings(@Auth() a: AuthCtx) { return this.vendors.listListings(a.vendor!.id); }
  @VendorOnly('listings') @Post('listings') create(@Auth() a: AuthCtx, @Body(Z(ListingSchema)) b: any) { return this.vendors.createListing(a.vendor!.id, b); }
  @VendorOnly('listings') @Get('listings/:id') get(@Auth() a: AuthCtx, @Param('id') id: string) { return this.vendors.getListing(a.vendor!.id, id); }
  @VendorOnly('listings') @Patch('listings/:id') patch(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ListingSchema)) b: any) { return this.vendors.updateListing(a, id, b); }
  @VendorOnly('listings') @HttpCode(200) @Post('listings/:id/state/:action') state(@Auth() a: AuthCtx, @Param('id') id: string, @Param('action') action: any) {
    if (!['submit', 'pause', 'resume', 'archive'].includes(action)) throw new NotFoundException();
    return this.vendors.setListingState(a, id, action);
  }
  @VendorOnly('listings') @Post('listings/:id/media') media(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ListingMediaSchema)) b: any) { return this.vendors.addMedia(a.vendor!.id, id, b); }
  @VendorOnly('listings') @Delete('listings/:id/media/:mediaId') rmMedia(@Auth() a: AuthCtx, @Param('id') id: string, @Param('mediaId') m: string) { return this.vendors.removeMedia(a.vendor!.id, id, m); }
  @VendorOnly('listings') @Post('listings/:id/packages') pkg(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(PackageSchema)) b: any) { return this.vendors.addPackage(a.vendor!.id, id, b); }
  @VendorOnly('listings') @Patch('listings/:id/packages/:pid') upPkg(@Auth() a: AuthCtx, @Param('id') id: string, @Param('pid') p: string, @Body(Z(PackageSchema)) b: any) { return this.vendors.updatePackage(a.vendor!.id, id, p, b); }
  @VendorOnly('listings') @Delete('listings/:id/packages/:pid') rmPkg(@Auth() a: AuthCtx, @Param('id') id: string, @Param('pid') p: string) { return this.vendors.removePackage(a.vendor!.id, id, p); }
  @VendorOnly('listings') @Post('listings/:id/add-ons') addOn(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(AddOnSchema)) b: any) { return this.vendors.addAddOn(a.vendor!.id, id, b); }
  @VendorOnly('listings') @Delete('listings/:id/add-ons/:aid') rmAddOn(@Auth() a: AuthCtx, @Param('id') id: string, @Param('aid') x: string) { return this.vendors.removeAddOn(a.vendor!.id, id, x); }

  private async ownListing(a: AuthCtx, id: string) {
    const l = await this.prisma.listing.findFirst({ where: { id, vendorId: a.vendor!.id } });
    if (!l) throw new NotFoundException('Listing not found');
    return l;
  }

  @VendorOnly('calendar') @Get('listings/:id/calendar') async calendar(@Auth() a: AuthCtx, @Param('id') id: string, @Query('month') month: string) {
    const listing = await this.ownListing(a, id);
    if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new BadRequestException('Invalid month');
    const from = dateOnly(`${month}-01`);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return { dailyCapacity: listing.dailyCapacity, entries: await this.availability.calendar(id, from, to) };
  }
  @VendorOnly('calendar') @HttpCode(200) @Post('listings/:id/block') async block(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(BlockDatesSchema)) b: any) {
    const l = await this.ownListing(a, id);
    return this.availability.block(id, b.dates.map(dateOnly), b.slot, l.dailyCapacity, b.note);
  }
  @VendorOnly('calendar') @HttpCode(200) @Post('listings/:id/unblock') async unblock(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(BlockDatesSchema)) b: any) {
    await this.ownListing(a, id);
    return this.availability.unblock(id, b.dates.map(dateOnly), b.slot);
  }

  @VendorOnly('team') @Get('team') team(@Auth() a: AuthCtx) { return this.vendors.team(a.vendor!.id); }
  @VendorOnly('team') @Post('team/invite') invite(@Auth() a: AuthCtx, @Body(Z(VendorInviteSchema)) b: any) {
    return this.authService.createInvite({ kind: 'VENDOR', email: b.email, invitedById: a.userId, vendorId: a.vendor!.id, vendorRole: b.role, subject: 'You have been invited to a vendor team on Mehfil', path: '/invite' });
  }
  @VendorOnly('team') @Delete('team/:id') rmMember(@Auth() a: AuthCtx, @Param('id') id: string) { return this.vendors.removeMember(a, id); }

  @VendorOnly('reviews') @Get('reviews') async reviews(@Auth() a: AuthCtx, @Query() q: PageQuery) {
    const p = paging(q); const where = { vendorId: a.vendor!.id };
    const [items, total] = await Promise.all([this.prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take, include: { customer: { select: { name: true } }, listing: { select: { title: true } } } }), this.prisma.review.count({ where })]);
    return paged(items, total, p);
  }
  @VendorOnly('reviews') @HttpCode(200) @Post('reviews/:id/reply') async reply(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReviewReplySchema)) b: { reply: string }) {
    const res = await this.prisma.review.updateMany({ where: { id, vendorId: a.vendor!.id }, data: { reply: b.reply, repliedAt: new Date() } });
    if (!res.count) throw new NotFoundException('Review not found');
    return { ok: true };
  }
  @VendorOnly('reviews') @HttpCode(200) @Post('reviews/:id/report') async report(@Auth() a: AuthCtx, @Param('id') id: string, @Body(Z(ReasonSchema)) b: { reason: string }) {
    const review = await this.prisma.review.findFirst({ where: { id, vendorId: a.vendor!.id } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.reviewReport.upsert({ where: { reviewId_reporterId: { reviewId: id, reporterId: a.userId } }, create: { reviewId: id, reporterId: a.userId, reason: b.reason }, update: { reason: b.reason, resolvedAt: null } });
    return { ok: true };
  }

  /** Only people who actually contacted this vendor. Phone numbers appear once a booking has been confirmed. */
  @VendorOnly('enquiries') @Get('customers') async customers(@Auth() a: AuthCtx) {
    const vendorId = a.vendor!.id;
    const rows = await this.prisma.enquiry.findMany({ where: { vendorId }, distinct: ['customerId'], orderBy: { createdAt: 'desc' }, select: { customerId: true, createdAt: true, customer: { select: { name: true, phone: true, email: true } } } });
    const bookings = await this.prisma.booking.findMany({ where: { vendorId }, select: { customerId: true, status: true, totalAmount: true, confirmedAt: true } });
    return rows.map((r) => {
      const mine = bookings.filter((b) => b.customerId === r.customerId);
      const confirmed = mine.some((b) => b.confirmedAt);
      return { customerId: r.customerId, name: r.customer.name, lastEnquiryAt: r.createdAt, phone: confirmed ? r.customer.phone : null, email: confirmed ? r.customer.email : null, bookings: mine.length, totalValue: mine.filter((b) => b.confirmedAt && b.status !== 'CANCELLED').reduce((s, b) => s + Number(b.totalAmount), 0) };
    });
  }
}

@Module({ imports: [AuthModule], controllers: [VendorController], providers: [VendorsService, AvailabilityService], exports: [VendorsService, AvailabilityService] })
export class VendorsModule {}
