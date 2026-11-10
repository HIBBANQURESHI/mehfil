import '../src/common/bigint';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma.service';
import { JobsService } from '../src/jobs/jobs.module';
import { SmsSender } from '../src/notifications/senders';
import { SandboxProvider } from '../src/payments/providers';

export class Harness {
  app!: INestApplication;
  prisma!: PrismaService;
  jobs!: JobsService;
  private pg: any;
  private dir!: string;
  private phoneSeq = 1000000;

  async start() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mehfil-pg-'));
    this.pg = spawn(process.execPath, [path.join(__dirname, 'postgres.mjs'), this.dir, '54329'], { stdio: ['pipe', 'pipe', 'inherit'] });
    await new Promise<void>((resolve, reject) => {
      this.pg.stdout.on('data', (d: Buffer) => { if (d.toString().includes('READY')) resolve(); });
      this.pg.on('exit', (code: number) => reject(new Error(`Postgres exited with ${code}`)));
    });
    execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '..'), env: process.env, stdio: 'pipe' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    this.app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(this.app);
    await this.app.init();
    this.prisma = this.app.get(PrismaService);
    this.jobs = this.app.get(JobsService);
  }

  async stop() {
    await this.app?.close();
    this.pg?.stdin.end();
    await new Promise((r) => setTimeout(r, 1500));
  }

  http() { return request(this.app.getHttpServer()); }
  api(method: 'get' | 'post' | 'patch' | 'delete', url: string, token?: string) {
    const r = this.http()[method](`/v1${url}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  }

  newPhone() { return `030${this.phoneSeq++}`.padEnd(11, '0').slice(0, 11); }

  lastOtp(phone: string) {
    const e164 = `+92${phone.slice(-10)}`;
    const msg = [...SmsSender.outbox].reverse().find((m) => m.to === e164);
    return msg!.body.slice(0, 6);
  }

  async customer(name = 'Ali Ahmed') {
    const phone = this.newPhone();
    await this.api('post', '/auth/register').send({ name, phone, password: 'password1234', acceptTerms: true }).expect(201);
    const res = await this.api('post', '/auth/verify-phone').send({ phone, code: this.lastOtp(phone) }).expect(200);
    return { token: res.body.accessToken as string, refresh: res.body.refreshToken as string, phone };
  }

  async superAdmin(email = 'root@mehfil.test') {
    const role = await this.prisma.adminRole.upsert({ where: { name: 'Super Admin' }, create: { name: 'Super Admin', permissions: [], isSystem: true }, update: {} });
    const user = await this.prisma.user.create({ data: { name: 'Root', email, passwordHash: await argon2.hash('password1234') } });
    await this.prisma.adminMember.create({ data: { userId: user.id, roleId: role.id, isSuper: true } });
    const first = await this.api('post', '/auth/admin/login').send({ email, password: 'password1234' }).expect(200);
    expect(first.body.status).toBe('ENROLL_TOTP');
    const res = await this.api('post', '/auth/admin/enroll').send({ enrollToken: first.body.enrollToken, code: authenticator.generate(first.body.secret) }).expect(200);
    return { token: res.body.accessToken as string, secret: first.body.secret as string, userId: user.id };
  }

  async reference() {
    const city = await this.prisma.city.create({ data: { name: `Karachi`, slug: 'karachi' } });
    const hall = await this.prisma.category.create({ data: { name: 'Banquet Halls', slug: 'banquet-halls', availabilityMode: 'EXCLUSIVE', commissionBps: 500 } });
    const caterer = await this.prisma.category.create({ data: { name: 'Catering', slug: 'catering', availabilityMode: 'CAPACITY', commissionBps: 700 } });
    const policy = await this.prisma.cancellationPolicy.create({ data: { name: 'Standard', body: 'Tiers apply', tiers: [{ daysBefore: 30, refundBps: 9000 }, { daysBefore: 7, refundBps: 5000 }, { daysBefore: 0, refundBps: 0 }] } });
    return { city, hall, caterer, policy };
  }

  /** Runs the real onboarding and approval journey, so each vendor in a test got there the way a real one would. */
  async vendor(adminToken: string, refs: { city: { id: string } }, category: { id: string }, opts: { name?: string; dailyCapacity?: number } = {}) {
    const name = opts.name ?? 'ABC Banquet';
    const owner = await this.customer(`${name} Owner`);
    const t = owner.token;
    const { body: vendor } = await this.api('post', '/vendor/start', t).send({ businessName: name }).expect(201);
    const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#8F3048' } }).png().toBuffer();
    const { body: upload } = await this.api('post', '/uploads/image', t).attach('file', img, 'a.png').expect(201);
    await this.api('patch', '/vendor/me', t).send({ businessName: name, primaryCategoryId: category.id, description: 'Lovely', phone: owner.phone, cityId: refs.city.id, address: 'Main road', logoUrl: upload.url }).expect(200);
    const docs = [];
    for (const type of ['CNIC_FRONT', 'CNIC_BACK']) {
      const { body } = await this.api('post', '/vendor/documents', t).field('type', type).attach('file', img, 'cnic.png').expect(201);
      docs.push(body.id);
    }
    await this.api('patch', '/vendor/payout-details', t).send({ bankName: 'HBL', accountTitle: name, iban: 'PK36SCBL0000001123456702' }).expect(200);
    const { body: listing } = await this.api('post', '/vendor/listings', t).send({ categoryId: category.id, title: `${name} Royal Hall`, description: 'Great', cityId: refs.city.id, startingPrice: 30000000, priceUnit: 'FLAT', amenities: [], capacityMax: 500, dailyCapacity: opts.dailyCapacity ?? 1 }).expect(201);
    await this.api('post', `/vendor/listings/${listing.id}/media`, t).send({ url: upload.url }).expect(201);
    await this.api('post', '/vendor/submit', t).send({ acceptTerms: true }).expect(201);
    for (const id of docs) await this.api('post', `/admin/vendor-documents/${id}/review`, adminToken).send({ status: 'APPROVED' }).expect(200);
    await this.api('post', `/admin/vendors/${vendor.id}/decision`, adminToken).send({ decision: 'APPROVE' }).expect(200);
    // Membership and approval are read per request, so the same token now has vendor access.
    return { token: t, vendorId: vendor.id as string, listingId: listing.id as string, listingSlug: listing.slug as string, phone: owner.phone };
  }

  /** Enquiry then quotation, using amounts given by the test. */
  async quote(customer: string, vendor: string, listingId: string, policyId: string, eventDate: string, total = 37500000, slot = 'FULL_DAY') {
    const { body: enq } = await this.api('post', '/enquiries', customer).send({ listingIds: [listingId], eventDate, slot, guestCount: 400, requirements: 'Hall and stage' }).expect(201);
    const enquiryId = enq.enquiries[0].id;
    const { body: q } = await this.api('post', '/vendor/quotations', vendor).send({
      enquiryId, lines: [{ description: 'Hall', quantity: 1, unitPrice: total }], cancellationPolicyId: policyId, send: true,
      milestones: [{ label: 'Advance', shareBps: 3000, dueRule: 'ON_BOOKING' }, { label: 'Pre-event', shareBps: 5000, dueRule: 'DAYS_BEFORE_EVENT', dueDays: 7 }, { label: 'Final', shareBps: 2000, dueRule: 'ON_COMPLETION' }],
    }).expect(201);
    return { enquiryId, quotationId: q.id as string };
  }

  sendWebhook(evt: object) {
    const body = JSON.stringify(evt);
    const signature = this.app.get(SandboxProvider).sign(body);
    return this.http().post('/v1/webhooks/payments/sandbox').set('Content-Type', 'application/json').set('x-sandbox-signature', signature).send(body);
  }

  async pay(customer: string, bookingId: string, milestoneId: string) {
    await this.api('post', `/bookings/${bookingId}/pay`, customer).send({ milestoneId }).expect(200);
    const payment = await this.prisma.payment.findFirstOrThrow({ where: { milestoneId, status: 'INITIATED' } });
    await this.sendWebhook({ eventId: `evt_${payment.id}`, providerRef: payment.providerRef, status: 'SUCCEEDED', amount: Number(payment.amount) }).expect(200);
    return payment;
  }
}

export const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
