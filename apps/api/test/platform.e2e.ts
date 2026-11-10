import { applyBps } from '@mehfil/shared';
import { authenticator } from 'otplib';
import { futureDate, Harness } from './harness';

const h = new Harness();
let admin: { token: string; secret: string; userId: string };
let refs: Awaited<ReturnType<Harness['reference']>>;
let v: Awaited<ReturnType<Harness['vendor']>>;
let c: Awaited<ReturnType<Harness['customer']>>;

beforeAll(async () => {
  await h.start();
  refs = await h.reference();
  admin = await h.superAdmin();
  v = await h.vendor(admin.token, refs, refs.hall);
  c = await h.customer();
});
afterAll(() => h.stop());

async function acceptedBooking(date: string, total?: number, customer = c.token, vendor = v, policy = refs.policy.id) {
  const { quotationId } = await h.quote(customer, vendor.token, vendor.listingId, policy, date, total);
  const { body } = await h.api('post', `/quotations/${quotationId}/accept`, customer).expect(200);
  return body.id as string;
}
async function confirmedBooking(date: string, total?: number) {
  const id = await acceptedBooking(date, total);
  await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
  const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
  await h.pay(c.token, id, b.body.milestones[0].id);
  return id;
}

describe('accounts and sessions', () => {
  it('rejects weak passwords and bad phone numbers', async () => {
    await h.api('post', '/auth/register').send({ name: 'X', phone: '12345', password: 'short', acceptTerms: true }).expect(400);
  });

  it('locks an OTP after repeated wrong guesses, even if the right code follows', async () => {
    const phone = h.newPhone();
    await h.api('post', '/auth/register').send({ name: 'Otp', phone, password: 'password1234', acceptTerms: true }).expect(201);
    const code = h.lastOtp(phone);
    const wrong = code === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await h.api('post', '/auth/verify-phone').send({ phone, code: wrong }).expect(400);
    await h.api('post', '/auth/verify-phone').send({ phone, code }).expect(400);
  });

  it('stores OTPs and passwords hashed only', async () => {
    const row = await h.prisma.otpCode.findFirstOrThrow();
    expect(row.codeHash).toHaveLength(64);
    const u = await h.prisma.user.findFirstOrThrow({ where: { phone: `+92${c.phone.slice(-10)}` } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const u = await h.customer('Rotator');
    const { body: first } = await h.api('post', '/auth/refresh').send({ refreshToken: u.refresh }).expect(200);
    expect(first.refreshToken).not.toBe(u.refresh);
    const session = u.refresh.split('.')[0];
    // Move past the short grace window that allows two tabs to refresh at once.
    await h.prisma.session.update({ where: { id: session }, data: { rotatedAt: new Date(Date.now() - 60_000) } });
    await h.api('post', '/auth/refresh').send({ refreshToken: u.refresh }).expect(401);
    await h.api('post', '/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await h.api('get', '/auth/me', first.accessToken).expect(401);
  });

  it('ends access immediately on logout', async () => {
    const u = await h.customer('Leaver');
    await h.api('get', '/auth/me', u.token).expect(200);
    await h.api('post', '/auth/logout', u.token).expect(200);
    await h.api('get', '/auth/me', u.token).expect(401);
  });

  it('never returns the password hash', async () => {
    const { body } = await h.api('get', '/auth/me', c.token).expect(200);
    expect(JSON.stringify(body)).not.toContain('argon2');
  });

  it('erases personal data on account deletion', async () => {
    const u = await h.customer('Going Away');
    await h.api('post', '/auth/delete-account', u.token).send({ password: 'password1234' }).expect(200);
    await h.api('get', '/auth/me', u.token).expect(401);
    expect(await h.prisma.user.count({ where: { phone: `+92${u.phone.slice(-10)}` } })).toBe(0);
  });
});

describe('secure routes', () => {
  it('requires a token', async () => {
    for (const url of ['/auth/me', '/bookings', '/vendor/me', '/admin/overview']) await h.api('get', url).expect(401);
  });

  it('keeps customers out of vendor and admin routes', async () => {
    await h.api('get', '/vendor/me', c.token).expect(403);
    for (const url of ['/admin/overview', '/admin/users', '/admin/ledger', '/admin/audit-logs']) await h.api('get', url, c.token).expect(403);
  });

  it('keeps vendors out of admin routes', async () => {
    await h.api('get', '/admin/overview', v.token).expect(403);
    await h.api('patch', `/admin/vendors/${v.vendorId}/commission`, v.token).send({ commissionBpsOverride: 0, reason: 'x' }).expect(403);
  });

  it('gives an admin no admin power from the normal customer login', async () => {
    const { body } = await h.api('post', '/auth/login').send({ identifier: 'root@mehfil.test', password: 'password1234' }).expect(200);
    await h.api('get', '/admin/overview', body.accessToken).expect(403);
  });

  it('requires a valid one-time code for admin login and refuses replay', async () => {
    const creds = { email: 'root@mehfil.test', password: 'password1234' };
    const stepOne = await h.api('post', '/auth/admin/login').send(creds).expect(200);
    expect(stepOne.body.status).toBe('TOTP_REQUIRED');
    expect(stepOne.body.accessToken).toBeUndefined();
    await h.api('post', '/auth/admin/login').send({ ...creds, totp: '000000' }).expect(401);
    await h.prisma.adminMember.update({ where: { userId: admin.userId }, data: { lastTotpStep: null } });
    const code = authenticator.generate(admin.secret);
    await h.api('post', '/auth/admin/login').send({ ...creds, totp: code }).expect(200);
    await h.api('post', '/auth/admin/login').send({ ...creds, totp: code }).expect(401);
  });

  it('does not reveal staff status to someone who is not an admin', async () => {
    const { body } = await h.api('post', '/auth/admin/login').send({ email: 'nobody@mehfil.test', password: 'password1234' }).expect(401);
    expect(body.message).toContain('Incorrect');
  });

  it('enforces per-permission admin roles', async () => {
    const { body: role } = await h.api('post', '/admin/roles', admin.token).send({ name: 'Ops', permissions: ['vendors.review'] }).expect(201);
    const { body: inv } = await h.api('post', '/admin/staff/invite', admin.token).send({ email: 'ops@mehfil.test', roleId: role.id }).expect(201);
    await h.api('post', '/auth/invites/accept').send({ token: inv.token, name: 'Ops', password: 'password1234' }).expect(200);
    await h.api('post', '/auth/invites/accept').send({ token: inv.token, name: 'Ops', password: 'password1234' }).expect(400);
    const first = await h.api('post', '/auth/admin/login').send({ email: 'ops@mehfil.test', password: 'password1234' }).expect(200);
    const { body: session } = await h.api('post', '/auth/admin/enroll').send({ enrollToken: first.body.enrollToken, code: authenticator.generate(first.body.secret) }).expect(200);
    await h.api('get', '/admin/vendors', session.accessToken).expect(200);
    await h.api('get', '/admin/ledger', session.accessToken).expect(403);
    await h.api('get', '/admin/staff', session.accessToken).expect(403);
  });

  it('applies vendor team roles', async () => {
    const { body: inv } = await h.api('post', '/vendor/team/invite', v.token).send({ email: 'sales@abc.test', role: 'SALES' }).expect(201);
    await h.api('post', '/auth/invites/accept').send({ token: inv.token, name: 'Sales', password: 'password1234', phone: h.newPhone() }).expect(200);
    const user = await h.prisma.user.update({ where: { email: 'sales@abc.test' }, data: { phoneVerifiedAt: new Date() } });
    const { body } = await h.api('post', '/auth/login').send({ identifier: user.email, password: 'password1234' }).expect(200);
    await h.api('get', '/vendor/enquiries', body.accessToken).expect(200);
    await h.api('get', '/vendor/earnings', body.accessToken).expect(403);
    await h.api('patch', '/vendor/payout-details', body.accessToken).send({ bankName: 'X', accountTitle: 'Y', iban: 'PK36SCBL0000001123456702' }).expect(403);
  });

  it('stops one customer reading another customer\'s records', async () => {
    const date = futureDate(90);
    const id = await acceptedBooking(date);
    const stranger = await h.customer('Stranger');
    await h.api('get', `/bookings/${id}`, stranger.token).expect(404);
    await h.api('post', `/bookings/${id}/cancel`, stranger.token).send({ reason: 'x' }).expect(404);
    const q = await h.prisma.booking.findUniqueOrThrow({ where: { id } });
    await h.api('get', `/quotations/${q.quotationId}`, stranger.token).expect(404);
    await h.api('post', `/quotations/${q.quotationId}/accept`, stranger.token).expect(404);
  });

  it('isolates each vendor\'s data', async () => {
    const other = await h.vendor(admin.token, refs, refs.caterer, { name: 'Rival Catering', dailyCapacity: 2 });
    const id = await acceptedBooking(futureDate(91));
    await h.api('get', `/vendor/bookings/${id}`, other.token).expect(404);
    await h.api('post', `/vendor/bookings/${id}/confirm`, other.token).expect(404);
    await h.api('get', `/vendor/listings/${v.listingId}`, other.token).expect(404);
    await h.api('patch', `/vendor/listings/${v.listingId}`, other.token).send({ categoryId: refs.hall.id, title: 'Hacked', description: 'x', cityId: refs.city.id, startingPrice: 1, priceUnit: 'FLAT' }).expect(404);
    await h.api('post', `/vendor/listings/${v.listingId}/block`, other.token).send({ dates: [futureDate(120)] }).expect(404);
  });

  it('never shows competing quotes to vendors', async () => {
    const other = await h.vendor(admin.token, refs, refs.hall, { name: 'Pearl Banquet' });
    const { body } = await h.api('post', '/enquiries', c.token).send({ listingIds: [v.listingId, other.listingId], eventDate: futureDate(92), slot: 'FULL_DAY', guestCount: 300, requirements: 'Compare' }).expect(201);
    expect(body.enquiries).toHaveLength(2);
    const mine = await h.api('get', '/vendor/enquiries', other.token).expect(200);
    expect(mine.body.items.every((e: any) => e.vendorId === other.vendorId)).toBe(true);
  });

  it('hides customer phone numbers from vendors until a booking is confirmed', async () => {
    const id = await acceptedBooking(futureDate(93));
    const before = await h.api('get', `/vendor/bookings/${id}`, v.token).expect(200);
    expect(before.body.customer.phone).toContain('•');
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    await h.pay(c.token, id, b.body.milestones[0].id);
    const after = await h.api('get', `/vendor/bookings/${id}`, v.token).expect(200);
    expect(after.body.customer.phone).toBe(`+92${c.phone.slice(-10)}`);
  });

  it('keeps commission internals away from customers', async () => {
    const id = await confirmedBooking(futureDate(94));
    const { body } = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    expect(body.commissionTotal).toBeUndefined();
    expect(body.payments[0].commission).toBeUndefined();
  });

  it('keeps identity documents private and logs who opens them', async () => {
    const vendor = await h.prisma.vendorDocument.findFirstOrThrow({ where: { vendorId: v.vendorId } });
    await h.api('get', `/admin/vendor-documents/${vendor.id}/file`, c.token).expect(403);
    await h.api('get', `/admin/vendor-documents/${vendor.id}/file`, admin.token).expect(200);
    expect(await h.prisma.auditLog.count({ where: { action: 'vendor_document.viewed', entityId: vendor.id } })).toBe(1);
  });

  it('rejects a document that only claims to be a PDF', async () => {
    await h.api('post', '/vendor/documents', v.token).field('type', 'OTHER').attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
  });

  it('rejects a non-image upload', async () => {
    await h.api('post', '/uploads/image', c.token).attach('file', Buffer.from('not an image'), 'a.png').expect(400);
  });

  it('rejects unknown fields in request bodies from reaching the database', async () => {
    await h.api('patch', '/auth/me', c.token).send({ name: 'Ali', status: 'BLOCKED', role: 'admin' }).expect(200);
    const u = await h.prisma.user.findFirstOrThrow({ where: { phone: `+92${c.phone.slice(-10)}` } });
    expect(u.status).toBe('ACTIVE');
  });
});

describe('vendor verification', () => {
  it('keeps unverified vendors out of search', async () => {
    const owner = await h.customer('Hidden Owner');
    const { body: vendor } = await h.api('post', '/vendor/start', owner.token).send({ businessName: 'Hidden Hall' }).expect(201);
    const { body: l } = await h.api('post', '/vendor/listings', owner.token).send({ categoryId: refs.hall.id, title: 'Hidden Hall', description: 'x', cityId: refs.city.id, startingPrice: 100, priceUnit: 'FLAT' }).expect(201);
    await h.api('get', `/listings/${l.slug}`).expect(404);
    const search = await h.api('get', '/listings?q=Hidden').expect(200);
    expect(search.body.total).toBe(0);
    await h.api('post', '/vendor/submit', owner.token).send({ acceptTerms: true }).expect(400);
    await h.api('post', `/admin/vendors/${vendor.id}/decision`, admin.token).send({ decision: 'APPROVE' }).expect(409);
  });

  it('refuses quotations from unapproved vendors', async () => {
    const owner = await h.customer('Unapproved');
    await h.api('post', '/vendor/start', owner.token).send({ businessName: 'Unapproved Co' }).expect(201);
    await h.api('post', '/vendor/quotations', owner.token).send({ enquiryId: '00000000-0000-4000-8000-000000000000', lines: [{ description: 'x', quantity: 1, unitPrice: 100 }], cancellationPolicyId: refs.policy.id, milestones: [{ label: 'A', shareBps: 10000, dueRule: 'ON_BOOKING' }] }).expect(403);
  });

  it('removes a suspended vendor from search straight away', async () => {
    const s = await h.vendor(admin.token, refs, refs.hall, { name: 'Soon Suspended' });
    await h.api('get', `/listings/${s.listingSlug}`).expect(200);
    await h.api('post', `/admin/vendors/${s.vendorId}/decision`, admin.token).send({ decision: 'SUSPEND', reason: 'Complaint' }).expect(200);
    await h.api('get', `/listings/${s.listingSlug}`).expect(404);
    await h.api('post', `/admin/vendors/${s.vendorId}/decision`, admin.token).send({ decision: 'REACTIVATE' }).expect(200);
    await h.api('get', `/listings/${s.listingSlug}`).expect(200);
  });

  it('encrypts bank details and masks them in responses', async () => {
    const row = await h.prisma.vendor.findUniqueOrThrow({ where: { id: v.vendorId } });
    expect(row.iban).not.toContain('PK36');
    const { body } = await h.api('get', '/vendor/me', v.token).expect(200);
    expect(body.iban).toBeUndefined();
    expect(body.ibanMasked).toContain('••••');
  });
});

describe('quotations', () => {
  it('computes totals on the server and ignores client figures', async () => {
    const { body: enq } = await h.api('post', '/enquiries', c.token).send({ listingIds: [v.listingId], eventDate: futureDate(100), slot: 'FULL_DAY', guestCount: 100, requirements: 'x' }).expect(201);
    const { body: q } = await h.api('post', '/vendor/quotations', v.token).send({
      enquiryId: enq.enquiries[0].id, total: 1, subtotal: 1,
      lines: [{ description: 'Hall', quantity: 1, unitPrice: 30000000 }, { description: 'Stage', quantity: 2, unitPrice: 2500000 }], discount: 1000000, taxBps: 1300, cancellationPolicyId: refs.policy.id,
      milestones: [{ label: 'A', shareBps: 3333, dueRule: 'ON_BOOKING' }, { label: 'B', shareBps: 6667, dueRule: 'ON_COMPLETION' }],
    }).expect(201);
    expect(q.total).toBe(38420000);
    expect(q.tax).toBe(4420000);
    expect(q.milestones.reduce((s: number, m: any) => s + m.amount, 0)).toBe(q.total);
    expect(q.commissionPreview).toEqual({ bps: 500, amount: applyBps(38420000, 500), net: 38420000 - applyBps(38420000, 500) });
  });

  it('rejects a payment schedule that does not add to 100%', async () => {
    await h.api('post', '/vendor/quotations', v.token).send({ enquiryId: '00000000-0000-4000-8000-000000000000', lines: [{ description: 'x', quantity: 1, unitPrice: 100 }], cancellationPolicyId: refs.policy.id, milestones: [{ label: 'A', shareBps: 5000, dueRule: 'ON_BOOKING' }] }).expect(400);
  });

  it('refuses to send a quotation in a category with no commission set', async () => {
    const unpriced = await h.prisma.category.create({ data: { name: 'Unpriced', slug: 'unpriced', availabilityMode: 'CAPACITY' } });
    const u = await h.vendor(admin.token, refs, unpriced, { name: 'Unpriced Vendor', dailyCapacity: 3 });
    const { body: enq } = await h.api('post', '/enquiries', c.token).send({ listingIds: [u.listingId], eventDate: futureDate(101), slot: 'FULL_DAY', guestCount: 100, requirements: 'x' }).expect(201);
    const res = await h.api('post', '/vendor/quotations', u.token).send({ enquiryId: enq.enquiries[0].id, lines: [{ description: 'x', quantity: 1, unitPrice: 100000 }], cancellationPolicyId: refs.policy.id, milestones: [{ label: 'A', shareBps: 10000, dueRule: 'ON_BOOKING' }], send: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('COMMISSION_NOT_CONFIGURED');
  });

  it('will not accept an expired quotation', async () => {
    const { quotationId } = await h.quote(c.token, v.token, v.listingId, refs.policy.id, futureDate(102));
    await h.prisma.quotation.update({ where: { id: quotationId }, data: { validUntil: new Date(Date.now() - 1000) } });
    const res = await h.api('post', `/quotations/${quotationId}/accept`, c.token);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTE_EXPIRED');
  });

  it('accepts a quotation only once under concurrent taps', async () => {
    const { quotationId } = await h.quote(c.token, v.token, v.listingId, refs.policy.id, futureDate(103));
    const results = await Promise.all(Array.from({ length: 6 }, () => h.api('post', `/quotations/${quotationId}/accept`, c.token)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await h.prisma.booking.count({ where: { quotationId } })).toBe(1);
  });

  it('does not confirm a booking when a quotation is merely accepted', async () => {
    const id = await acceptedBooking(futureDate(104));
    const { body } = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    expect(body.status).toBe('PENDING_VENDOR_CONFIRMATION');
    expect(await h.prisma.occupancy.count({ where: { bookingId: id } })).toBe(0);
  });

  it('snapshots commission so later rate changes never alter an agreed booking', async () => {
    const id = await acceptedBooking(futureDate(105), 10000000);
    await h.prisma.category.update({ where: { id: refs.hall.id }, data: { commissionBps: 900 } });
    const b = await h.prisma.booking.findUniqueOrThrow({ where: { id } });
    expect(b.commissionBps).toBe(500);
    expect(Number(b.commissionTotal)).toBe(500000);
    await h.prisma.category.update({ where: { id: refs.hall.id }, data: { commissionBps: 500 } });
  });
});

describe('double booking', () => {
  it('lets only one of many concurrent confirmations take a hall on a date', async () => {
    const date = futureDate(110);
    const bookings = [];
    for (let i = 0; i < 8; i++) {
      const cust = await h.customer(`Racer ${i}`);
      bookings.push(await acceptedBooking(date, undefined, cust.token));
    }
    const results = await Promise.all(bookings.map((id) => h.api('post', `/vendor/bookings/${id}/confirm`, v.token)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409 && r.body.code === 'DATE_TAKEN')).toHaveLength(7);
    expect(await h.prisma.occupancy.count({ where: { listingId: v.listingId, date: new Date(`${date}T00:00:00Z`) } })).toBe(2);
  });

  it('never oversells a capacity vendor', async () => {
    const cat = await h.vendor(admin.token, refs, refs.caterer, { name: 'Capacity Caterer', dailyCapacity: 3 });
    const date = futureDate(111);
    const bookings = [];
    for (let i = 0; i < 6; i++) {
      const cust = await h.customer(`Cap ${i}`);
      bookings.push(await acceptedBooking(date, undefined, cust.token, cat));
    }
    const results = await Promise.all(bookings.map((id) => h.api('post', `/vendor/bookings/${id}/confirm`, cat.token)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
  });

  it('lets lunch and dinner be sold separately but not alongside a full day', async () => {
    const date = futureDate(112);
    const make = async (slot: string) => {
      const cust = await h.customer(`Slot ${slot}`);
      const { quotationId } = await h.quote(cust.token, v.token, v.listingId, refs.policy.id, date, 1000000, slot);
      return (await h.api('post', `/quotations/${quotationId}/accept`, cust.token).expect(200)).body.id as string;
    };
    await h.api('post', `/vendor/bookings/${await make('LUNCH')}/confirm`, v.token).expect(200);
    await h.api('post', `/vendor/bookings/${await make('DINNER')}/confirm`, v.token).expect(200);
    await h.api('post', `/vendor/bookings/${await make('FULL_DAY')}/confirm`, v.token).expect(409);
  });

  it('reuses a date once an unpaid hold has expired', async () => {
    const date = futureDate(113);
    const first = await acceptedBooking(date);
    await h.api('post', `/vendor/bookings/${first}/confirm`, v.token).expect(200);
    await h.prisma.booking.update({ where: { id: first }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await h.prisma.occupancy.updateMany({ where: { bookingId: first }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await h.jobs.runAll();
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id: first } })).status).toBe('CANCELLED');
    const other = await h.customer('Next In Line');
    const second = await acceptedBooking(date, undefined, other.token);
    await h.api('post', `/vendor/bookings/${second}/confirm`, v.token).expect(200);
  });

  it('respects dates the vendor blocked by hand', async () => {
    const date = futureDate(114);
    await h.api('post', `/vendor/listings/${v.listingId}/block`, v.token).send({ dates: [date] }).expect(200);
    const id = await acceptedBooking(date);
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(409);
    const avail = await h.api('get', `/listings?date=${date}&category=banquet-halls&q=ABC`).expect(200);
    expect(avail.body.items.find((l: any) => l.id === v.listingId)).toBeUndefined();
  });
});

describe('payments', () => {
  it('cannot be faked with an unsigned or wrongly signed webhook', async () => {
    const id = await acceptedBooking(futureDate(120));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: b.body.milestones[0].id }).expect(200);
    const p = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    const evt = JSON.stringify({ eventId: 'forged', providerRef: p.providerRef, status: 'SUCCEEDED', amount: Number(p.amount) });
    await h.http().post('/v1/webhooks/payments/sandbox').set('Content-Type', 'application/json').send(evt).expect(401);
    await h.http().post('/v1/webhooks/payments/sandbox').set('Content-Type', 'application/json').set('x-sandbox-signature', 'a'.repeat(64)).send(evt).expect(401);
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_PAYMENT');
  });

  it('applies a webhook once even when delivered many times at once', async () => {
    const id = await acceptedBooking(futureDate(121));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: b.body.milestones[0].id }).expect(200);
    const p = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    const evt = { eventId: `dup_${p.id}`, providerRef: p.providerRef, status: 'SUCCEEDED', amount: Number(p.amount) };
    await Promise.all(Array.from({ length: 8 }, () => h.sendWebhook(evt)));
    expect(await h.prisma.ledgerEntry.count({ where: { paymentId: p.id, type: 'PAYMENT_RECEIVED' } })).toBe(1);
    expect(await h.prisma.settlement.count({ where: { paymentId: p.id } })).toBe(1);
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');
  });

  it('does not create a second checkout on a double tap', async () => {
    const id = await acceptedBooking(futureDate(122));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    const milestoneId = b.body.milestones[0].id;
    const [one, two] = await Promise.all([h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId }), h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId })]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(await h.prisma.payment.count({ where: { bookingId: id } })).toBe(1);
  });

  it('flags a wrong amount instead of confirming', async () => {
    const id = await acceptedBooking(futureDate(123));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: b.body.milestones[0].id }).expect(200);
    const p = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    await h.sendWebhook({ eventId: `mm_${p.id}`, providerRef: p.providerRef, status: 'SUCCEEDED', amount: 1 }).expect(200);
    expect((await h.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('RECONCILIATION_REQUIRED');
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_PAYMENT');
  });

  it('flags money that arrives after a booking was cancelled', async () => {
    const id = await acceptedBooking(futureDate(124));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: b.body.milestones[0].id }).expect(200);
    const p = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    await h.api('post', `/bookings/${id}/cancel`, c.token).send({ reason: 'Changed plans' }).expect(200);
    await h.sendWebhook({ eventId: `late_${p.id}`, providerRef: p.providerRef, status: 'SUCCEEDED', amount: Number(p.amount) }).expect(200);
    expect((await h.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('RECONCILIATION_REQUIRED');
    expect(await h.prisma.ledgerEntry.count({ where: { paymentId: p.id } })).toBe(0);
  });

  it('forces instalments to be paid in order', async () => {
    const id = await confirmedBooking(futureDate(125));
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    const res = await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: b.body.milestones[2].id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MILESTONE_ORDER');
  });

  it('computes commission exactly across all instalments, from stored rates', async () => {
    const total = 37500001;
    const date = futureDate(126);
    const id = await confirmedBooking(date, total);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    await h.pay(c.token, id, b.body.milestones[1].id);
    await h.pay(c.token, id, b.body.milestones[2].id);
    const payments = await h.prisma.payment.findMany({ where: { bookingId: id, status: 'SUCCEEDED' } });
    expect(payments.reduce((s, p) => s + Number(p.amount), 0)).toBe(total);
    expect(payments.reduce((s, p) => s + Number(p.commission), 0)).toBe(applyBps(total, 500));
    const settlements = await h.prisma.settlement.findMany({ where: { bookingId: id } });
    expect(settlements.reduce((s, x) => s + Number(x.payable), 0)).toBe(total - applyBps(total, 500));
  });

  it('refuses checkout clearly when no gateway is configured', async () => {
    const svc: any = h.app.get(require('../src/payments/payments.service').PaymentsService);
    const original = svc.provider;
    svc.provider = h.app.get(require('../src/payments/providers').NoProvider);
    const id = await acceptedBooking(futureDate(127));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    const res = await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: b.body.milestones[0].id });
    svc.provider = original;
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });

  it('keeps the ledger append-only at the database level', async () => {
    const entry = await h.prisma.ledgerEntry.findFirstOrThrow();
    await expect(h.prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amount: 1 } })).rejects.toThrow();
    await expect(h.prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
  });
});

describe('cancellations and refunds', () => {
  it('applies the policy agreed at booking and refunds exactly', async () => {
    const id = await confirmedBooking(futureDate(45), 10000000);
    await h.api('post', `/bookings/${id}/cancel`, c.token).send({ reason: 'Date moved' }).expect(200);
    const res = await h.api('post', `/admin/bookings/${id}/cancel`, admin.token).send({ reason: 'Approved under policy' }).expect(200);
    expect(res.body.refundBps).toBe(9000);
    const refunds = await h.prisma.refund.findMany({ where: { payment: { bookingId: id } } });
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(2700000);
    await h.api('post', `/admin/refunds/${refunds[0].id}/decision`, admin.token).send({ approve: true, reason: 'Policy' }).expect(200);
    const payment = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect(payment.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(payment.commissionReversed)).toBe(applyBps(3000000, 500) - Math.round(applyBps(3000000, 500) * 0.1));
    const s = await h.prisma.settlement.findFirstOrThrow({ where: { paymentId: payment.id } });
    expect(Number(s.gross)).toBe(300000);
    expect(Number(s.payable)).toBe(Number(s.gross) - Number(s.commission));
    expect(await h.prisma.occupancy.count({ where: { bookingId: id } })).toBe(0);
  });

  it('refunds everything when the vendor backs out', async () => {
    const id = await confirmedBooking(futureDate(2), 10000000);
    await h.api('post', `/vendor/bookings/${id}/cancel`, v.token).send({ reason: 'Hall flooded' }).expect(200);
    const refunds = await h.prisma.refund.findMany({ where: { payment: { bookingId: id } } });
    expect(refunds.reduce((s, r) => s + Number(r.amount), 0)).toBe(3000000);
  });

  it('will not process the same refund twice', async () => {
    const id = await confirmedBooking(futureDate(3), 10000000);
    await h.api('post', `/vendor/bookings/${id}/cancel`, v.token).send({ reason: 'x' }).expect(200);
    const r = await h.prisma.refund.findFirstOrThrow({ where: { payment: { bookingId: id } } });
    const results = await Promise.all(Array.from({ length: 5 }, () => h.api('post', `/admin/refunds/${r.id}/decision`, admin.token).send({ approve: true, reason: 'x' })));
    expect(results.filter((x) => x.status === 200).length).toBe(1);
    expect(await h.prisma.ledgerEntry.count({ where: { refundId: r.id, type: 'REFUND_ISSUED' } })).toBe(1);
  });

  it('blocks refunds larger than the payment', async () => {
    const id = await confirmedBooking(futureDate(130), 10000000);
    const p = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    await h.api('post', '/refunds', c.token).send({ paymentId: p.id, amount: Number(p.amount) + 1, reason: 'greedy' }).expect(400);
    await h.api('post', '/refunds', c.token).send({ paymentId: p.id, amount: Number(p.amount), reason: 'ok' }).expect(201);
    await h.api('post', '/refunds', c.token).send({ paymentId: p.id, amount: 1, reason: 'more' }).expect(400);
  });

  it('records every admin override with a reason in the audit log', async () => {
    const id = await confirmedBooking(futureDate(131), 10000000);
    await h.api('post', `/admin/bookings/${id}/cancel`, admin.token).send({ reason: 'Goodwill', refundBps: 10000 }).expect(200);
    const log = await h.prisma.auditLog.findFirstOrThrow({ where: { action: 'booking.cancel', entityId: id } });
    expect(log.reason).toBe('Goodwill');
    expect((log.after as any).overridden).toBe(true);
  });
});

describe('full journey to payout', () => {
  it('runs from completed event to verified review and vendor payout, with exact figures', async () => {
    const id = await acceptedBooking(futureDate(1), 50000000);
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    let b = (await h.api('get', `/bookings/${id}`, c.token).expect(200)).body;
    for (const m of b.milestones) await h.pay(c.token, id, m.id);
    await h.api('post', `/vendor/bookings/${id}/complete`, v.token).expect(409); // the event is still in the future
    await h.prisma.booking.update({ where: { id }, data: { eventDate: new Date(Date.now() - 86_400_000) } });
    await h.api('post', `/bookings/${id}/review`, c.token).send({ rating: 5, comment: 'Too early' }).expect(409);
    await h.api('post', `/vendor/bookings/${id}/complete`, v.token).expect(200);
    await h.api('post', `/bookings/${id}/confirm-completion`, c.token).expect(200);
    await h.api('post', `/bookings/${id}/confirm-completion`, c.token).expect(409);

    const stranger = await h.customer('Fake Reviewer');
    await h.api('post', `/bookings/${id}/review`, stranger.token).send({ rating: 1, comment: 'Fake' }).expect(404);
    await h.api('post', `/bookings/${id}/review`, c.token).send({ rating: 4, comment: 'Lovely evening' }).expect(201);
    await h.api('post', `/bookings/${id}/review`, c.token).send({ rating: 5, comment: 'Again' }).expect(409);
    const vendorRow = await h.prisma.vendor.findUniqueOrThrow({ where: { id: v.vendorId } });
    expect(vendorRow.reviewCount).toBe(1);
    expect(vendorRow.avgRating).toBe(4);

    await h.prisma.booking.update({ where: { id }, data: { settlementDueAt: new Date(Date.now() - 1000) } });
    await h.jobs.runAll();
    const before = (await h.api('get', '/vendor/earnings', v.token).expect(200)).body;
    const net = 50000000 - applyBps(50000000, 500);
    expect(before.due).toBeGreaterThanOrEqual(net);

    const results = await Promise.all([h.api('post', '/vendor/payouts', v.token), h.api('post', '/vendor/payouts', v.token)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const payout = results.find((r) => r.status === 201)!.body;
    expect(payout.amount).toBe(before.availableForPayout);

    await h.api('post', `/admin/payouts/${payout.id}/decision`, admin.token).send({ action: 'MARK_PAID', reference: 'X' }).expect(409);
    await h.api('post', `/admin/payouts/${payout.id}/decision`, admin.token).send({ action: 'APPROVE' }).expect(200);
    await h.api('post', `/admin/payouts/${payout.id}/decision`, admin.token).send({ action: 'MARK_PAID', reference: 'HBL-991' }).expect(200);
    const after = (await h.api('get', '/vendor/earnings', v.token).expect(200)).body;
    expect(after.paidOut).toBe(payout.amount);
    expect(after.due).toBe(0);

    const { body: kpi } = await h.api('get', '/admin/overview', admin.token).expect(200);
    expect(kpi.kpis.platformRevenue).toBeGreaterThanOrEqual(applyBps(50000000, 500));
    const { body: month } = await h.api('get', '/vendor/overview', v.token).expect(200);
    expect(month.monthRevenue).toBeGreaterThanOrEqual(50000000);
  });

  it('recovers a post-payout refund from the next payout', async () => {
    const vendor = await h.vendor(admin.token, refs, refs.hall, { name: 'Clawback Hall' });
    const customer = await h.customer('Claw');
    const run = async (days: number) => {
      const id = await acceptedBooking(futureDate(days), 10000000, customer.token, vendor);
      await h.api('post', `/vendor/bookings/${id}/confirm`, vendor.token).expect(200);
      const b = (await h.api('get', `/bookings/${id}`, customer.token).expect(200)).body;
      for (const m of b.milestones) await h.pay(customer.token, id, m.id);
      await h.prisma.booking.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), settlementDueAt: new Date(Date.now() - 1000) } });
      await h.jobs.runAll();
      return id;
    };
    const first = await run(200);
    const { body: p1 } = await h.api('post', '/vendor/payouts', vendor.token).expect(201);
    await h.api('post', `/admin/payouts/${p1.id}/decision`, admin.token).send({ action: 'APPROVE' }).expect(200);
    await h.api('post', `/admin/payouts/${p1.id}/decision`, admin.token).send({ action: 'MARK_PAID', reference: 'A' }).expect(200);
    expect(p1.amount).toBe(9500000);

    const pay = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: first, status: 'SUCCEEDED' }, orderBy: { amount: 'desc' } });
    const { body: rf } = await h.api('post', '/refunds', customer.token).send({ paymentId: pay.id, amount: 1000000, reason: 'Service issue' }).expect(201);
    await h.api('post', `/admin/refunds/${rf.id}/decision`, admin.token).send({ approve: true, reason: 'ok' }).expect(200);

    await run(201);
    const { body: earnings } = await h.api('get', '/vendor/earnings', vendor.token).expect(200);
    expect(earnings.clawback).toBe(950000);
    const { body: p2 } = await h.api('post', '/vendor/payouts', vendor.token).expect(201);
    expect(p2.amount).toBe(9500000 - 950000);
    const { body: end } = await h.api('get', '/vendor/earnings', vendor.token).expect(200);
    expect(end.clawback).toBe(0);
  });

  it('freezes payout while a booking is in dispute', async () => {
    const id = await confirmedBooking(futureDate(140), 10000000);
    await h.api('post', `/bookings/${id}/dispute`, c.token).send({ reason: 'Vendor not responding' }).expect(200);
    const s = await h.prisma.settlement.findFirstOrThrow({ where: { bookingId: id } });
    expect(s.status).toBe('ON_HOLD');
    await h.api('post', `/admin/bookings/${id}/resolve-dispute`, admin.token).send({ outcome: 'CONFIRMED', reason: 'Vendor replied' }).expect(200);
    expect((await h.prisma.settlement.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('NOT_DUE');
  });

  it('supports the pilot flow where the vendor collected the money directly', async () => {
    const vendor = await h.vendor(admin.token, refs, refs.hall, { name: 'Direct Hall' });
    const id = await acceptedBooking(futureDate(150), 10000000, c.token, vendor);
    await h.api('post', `/vendor/bookings/${id}/confirm`, vendor.token).expect(200);
    const b = (await h.api('get', `/bookings/${id}`, c.token).expect(200)).body;
    await h.api('post', `/admin/bookings/${id}/manual-payment`, admin.token).send({ milestoneId: b.milestones[0].id, reference: 'BANK-1', reason: 'Proof received' }).expect(200);
    const { body } = await h.api('get', '/vendor/earnings', vendor.token).expect(200);
    expect(body.commissionOwed).toBe(150000);
    expect(body.availableForPayout + body.pending).toBe(0);
    await h.api('post', '/admin/commission-receipts', admin.token).send({ vendorId: vendor.vendorId, amount: 150000, reference: 'RCPT' }).expect(201);
    expect((await h.api('get', '/vendor/earnings', vendor.token).expect(200)).body.commissionOwed).toBe(0);
  });
});

describe('wedding planning', () => {
  it('computes budget and spend from real bookings', async () => {
    const { body: w } = await h.api('post', '/weddings', c.token).send({ title: 'Ali & Ayesha', budget: 150000000, eventTypes: ['MEHNDI', 'BARAAT', 'WALIMA'] }).expect(201);
    expect(w.events).toHaveLength(3);
    await h.api('post', `/weddings/${w.id}/budget`, c.token).send({ label: 'Hall', categoryId: refs.hall.id, planned: 50000000 }).expect(201);
    const { body: enq } = await h.api('post', '/enquiries', c.token).send({ listingIds: [v.listingId], weddingId: w.id, eventDate: futureDate(160), slot: 'FULL_DAY', guestCount: 400, requirements: 'Hall' }).expect(201);
    const { body: q } = await h.api('post', '/vendor/quotations', v.token).send({ enquiryId: enq.enquiries[0].id, lines: [{ description: 'Hall', quantity: 1, unitPrice: 40000000 }], cancellationPolicyId: refs.policy.id, send: true, milestones: [{ label: 'Advance', shareBps: 2500, dueRule: 'ON_BOOKING' }, { label: 'Rest', shareBps: 7500, dueRule: 'ON_COMPLETION' }] }).expect(201);
    const { body: booking } = await h.api('post', `/quotations/${q.id}/accept`, c.token).expect(200);
    await h.api('post', `/vendor/bookings/${booking.id}/confirm`, v.token).expect(200);
    const b = (await h.api('get', `/bookings/${booking.id}`, c.token).expect(200)).body;
    await h.pay(c.token, booking.id, b.milestones[0].id);
    const { body: d } = await h.api('get', `/weddings/${w.id}`, c.token).expect(200);
    expect(d.summary).toEqual({ budget: 150000000, planned: 50000000, booked: 40000000, paid: 10000000, remainingToPay: 30000000, remainingBudget: 110000000 });
    expect(d.budgetItems[0].actual).toBe(40000000);
    const stranger = await h.customer('Peeker');
    await h.api('get', `/weddings/${w.id}`, stranger.token).expect(404);
  });
});

describe('notifications and messaging', () => {
  it('creates in-app notifications with the event that caused them', async () => {
    const { body } = await h.api('get', '/notifications', c.token).expect(200);
    expect(body.items.some((n: any) => n.type === 'QUOTATION_RECEIVED')).toBe(true);
    expect(body.items.some((n: any) => n.type === 'PAYMENT_SUCCEEDED')).toBe(true);
  });

  it('retries failed deliveries with backoff, then gives up', async () => {
    const notifications: any = h.app.get(require('../src/notifications/notifications.module').NotificationsService);
    while (await notifications.processOutbox()) { /* clear earlier test traffic */ }
    const d = await h.prisma.delivery.create({ data: { channel: 'PUSH', recipient: 'tok', subject: 's', body: 'b' } });
    const original = notifications.push.send;
    notifications.push.send = async () => { throw new Error('boom'); };
    await notifications.processOutbox();
    let row = await h.prisma.delivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await h.prisma.delivery.update({ where: { id: d.id }, data: { attempts: 5, nextAttemptAt: new Date(0) } });
    await notifications.processOutbox();
    row = await h.prisma.delivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.status).toBe('FAILED');
    notifications.push.send = original;
  });

  it('keeps conversations between their two parties', async () => {
    const { body: conv } = await h.api('post', '/conversations', c.token).send({ vendorId: v.vendorId, body: 'Salam, is parking included?' }).expect(201);
    await h.api('post', `/conversations/${conv.id}/messages`, v.token).send({ body: 'Yes' }).expect(201);
    const { body } = await h.api('get', `/conversations/${conv.id}/messages`, c.token).expect(200);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1].fromVendor).toBe(true);
    const stranger = await h.customer('Eavesdropper');
    await h.api('get', `/conversations/${conv.id}/messages`, stranger.token).expect(404);
  });

  it('hides internal staff notes from customers on support tickets', async () => {
    const { body: t } = await h.api('post', '/support/tickets', c.token).send({ category: 'OTHER', subject: 'Help', body: 'Please help' }).expect(201);
    await h.api('post', `/admin/tickets/${t.id}/messages`, admin.token).send({ body: 'Customer seems upset', internal: true }).expect(201);
    await h.api('post', `/admin/tickets/${t.id}/messages`, admin.token).send({ body: 'We are on it' }).expect(201);
    const { body } = await h.api('get', `/support/tickets/${t.id}`, c.token).expect(200);
    expect(body.messages.map((m: any) => m.body)).toEqual(['Please help', 'We are on it']);
  });
});

describe('search', () => {
  it('filters by category, city, guests and price using stored data', async () => {
    const hit = await h.api('get', `/listings?category=banquet-halls&city=karachi&guests=400&minPrice=1000&maxPrice=40000000`).expect(200);
    expect(hit.body.items.some((l: any) => l.id === v.listingId)).toBe(true);
    const tooBig = await h.api('get', `/listings?category=banquet-halls&guests=9999`).expect(200);
    expect(tooBig.body.items.some((l: any) => l.id === v.listingId)).toBe(false);
    const wrongCategory = await h.api('get', `/listings?category=catering&q=ABC`).expect(200);
    expect(wrongCategory.body.total).toBe(0);
  });

  it('does not expose vendor contact details on public pages', async () => {
    const { body } = await h.api('get', `/listings/${v.listingSlug}`).expect(200);
    expect(body.vendor.phone).toBeUndefined();
    expect(body.vendor.iban).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(c.phone.slice(-7));
  });

  it('guards CSV exports against formula injection', async () => {
    const u = await h.customer('=HYPERLINK("http://evil")');
    const id = await acceptedBooking(futureDate(170), undefined, u.token);
    expect(id).toBeTruthy();
    const res = await h.api('get', '/admin/reports/bookings.csv', admin.token).expect(200);
    expect(res.text).toContain(`"'=HYPERLINK`);
  });
});

describe('security regressions', () => {
  it('refuses javascript: links on listings', async () => {
    await h.api('post', `/vendor/listings/${v.listingId}/media`, v.token).send({ url: 'javascript:alert(document.domain)', type: 'VIDEO' }).expect(400);
  });

  it('rejects SVG uploads', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await h.api('post', '/uploads/image', c.token).attach('file', svg, 'a.svg').expect(400);
  });

  it('does not let a vendor lift a pause placed by staff', async () => {
    const s = await h.vendor(admin.token, refs, refs.caterer, { name: 'Paused Vendor', dailyCapacity: 2 });
    await h.api('post', `/vendor/listings/${s.listingId}/state/pause`, s.token).expect(200);
    await h.api('post', `/vendor/listings/${s.listingId}/state/resume`, s.token).expect(200);
    await h.api('post', `/admin/listings/${s.listingId}/decision`, admin.token).send({ decision: 'PAUSE', reason: 'Fake photos' }).expect(200);
    await h.api('post', `/vendor/listings/${s.listingId}/state/resume`, s.token).expect(403);
    await h.api('get', `/listings/${s.listingSlug}`).expect(404);
  });

  it('lets only the owner change where payouts go', async () => {
    const { body: inv } = await h.api('post', '/vendor/team/invite', v.token).send({ email: 'finance@abc.test', role: 'FINANCE' }).expect(201);
    await h.api('post', '/auth/invites/accept').send({ token: inv.token, name: 'Finance', password: 'password1234', phone: h.newPhone() }).expect(200);
    await h.prisma.user.update({ where: { email: 'finance@abc.test' }, data: { phoneVerifiedAt: new Date() } });
    const { body } = await h.api('post', '/auth/login').send({ identifier: 'finance@abc.test', password: 'password1234' }).expect(200);
    await h.api('get', '/vendor/earnings', body.accessToken).expect(200);
    await h.api('patch', '/vendor/payout-details', body.accessToken).send({ bankName: 'X', accountTitle: 'Y', iban: 'PK36SCBL0000001123456702' }).expect(403);
  });

  it('stops staff granting permissions they do not hold', async () => {
    const { body: role } = await h.api('post', '/admin/roles', admin.token).send({ name: 'HR', permissions: ['admins.manage'] }).expect(201);
    const { body: inv } = await h.api('post', '/admin/staff/invite', admin.token).send({ email: 'hr@mehfil.test', roleId: role.id }).expect(201);
    await h.api('post', '/auth/invites/accept').send({ token: inv.token, name: 'HR', password: 'password1234' }).expect(200);
    const first = await h.api('post', '/auth/admin/login').send({ email: 'hr@mehfil.test', password: 'password1234' }).expect(200);
    const { body: s } = await h.api('post', '/auth/admin/enroll').send({ enrollToken: first.body.enrollToken, code: authenticator.generate(first.body.secret) }).expect(200);
    await h.api('post', '/admin/roles', s.accessToken).send({ name: 'Backdoor', permissions: ['finance.manage'] }).expect(403);
    await h.api('patch', `/admin/roles/${role.id}`, s.accessToken).send({ name: 'HR', permissions: ['admins.manage', 'finance.manage'] }).expect(403);
    await h.api('post', '/admin/roles', s.accessToken).send({ name: 'Helper', permissions: ['admins.manage'] }).expect(201);
  });

  it('cannot beat the OTP guess limit by sending guesses at once', async () => {
    const phone = h.newPhone();
    await h.api('post', '/auth/register').send({ name: 'Racer', phone, password: 'password1234', acceptTerms: true }).expect(201);
    const code = h.lastOtp(phone);
    const wrong = code === '111111' ? '222222' : '111111';
    await Promise.all(Array.from({ length: 20 }, () => h.api('post', '/auth/verify-phone').send({ phone, code: wrong })));
    const row = await h.prisma.otpCode.findFirstOrThrow({ where: { target: `+92${phone.slice(-10)}` }, orderBy: { createdAt: 'desc' } });
    expect(row.attempts).toBe(5);
    await h.api('post', '/auth/verify-phone').send({ phone, code }).expect(400);
  });

  it('does not let a stranger overwrite an invited team member', async () => {
    const memberPhone = h.newPhone();
    const { body: inv } = await h.api('post', '/vendor/team/invite', v.token).send({ email: 'coord@abc.test', role: 'COORDINATOR' }).expect(201);
    await h.api('post', '/auth/invites/accept').send({ token: inv.token, name: 'Coord', password: 'password1234', phone: memberPhone }).expect(200);
    await h.api('post', '/auth/register').send({ name: 'Attacker', phone: memberPhone, password: 'attacker12345', acceptTerms: true }).expect(409);
  });

  it('delivers notifications to people using the mobile app', async () => {
    const notifications: any = h.app.get(require('../src/notifications/notifications.module').NotificationsService);
    while (await notifications.processOutbox()) { /* clear earlier test traffic */ }
    const u = await h.customer('App User');
    await h.api('post', '/notifications/push-tokens', u.token).send({ token: 'ExponentPushToken[abc]', platform: 'android' }).expect(201);
    const { body: conv } = await h.api('post', '/conversations', u.token).send({ vendorId: v.vendorId, body: 'Salam' }).expect(201);
    await h.api('post', `/conversations/${conv.id}/messages`, v.token).send({ body: 'Walaikum salam' }).expect(201);
    const sent: any[] = [];
    const original = notifications.push.send;
    notifications.push.send = async (...args: any[]) => { sent.push(args); };
    await notifications.processOutbox();
    notifications.push.send = original;
    expect(sent).toHaveLength(1);
    expect(sent[0][2]).toBe('Walaikum salam');
    expect(sent[0][3]).toBe(`/account/messages/${conv.id}`);
  });
});
