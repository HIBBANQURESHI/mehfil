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
    // Two days out: one day in UTC can already be today in Karachi after midnight there.
    const id = await acceptedBooking(futureDate(2), 50000000);
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

describe('plan my wedding', () => {
  const { sanitizeAiPlan, WeddingPersonalizer, GeminiClient } = require('../src/weddings/planner-ai');
  const plan = (token: string, body: object) => h.api('post', '/weddings/plan', token).send(body);
  const waitFor = async (fn: () => Promise<boolean>) => { for (let i = 0; i < 50; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timed out'); };

  it('builds a full workspace from the wizard answers', async () => {
    const u = await h.customer('Planner');
    const { body: w } = await plan(u.token, {
      partnerOne: 'Ali', partnerTwo: 'Ayesha', cityId: refs.city.id, guestCount: 500, planningStatus: 'JUST_STARTED', targetMonth: futureDate(400).slice(0, 7),
      events: [{ type: 'MEHNDI', date: futureDate(398), guestCount: 250 }, { type: 'BARAAT', date: futureDate(400) }],
      budgetBand: '20_40L', services: ['venue', 'catering', 'decoration', 'photography'], style: 'ELEGANT', venuePreference: 'BANQUET_HALL',
    }).expect(201);
    expect(w.title).toBe('Ali & Ayesha');
    expect(w.events.map((e: any) => [e.name, e.guestCount, e.cityId])).toEqual([['Mehndi', 250, refs.city.id], ['Baraat', 500, refs.city.id]]);
    expect(w.summary.budget).toBe(300_000_000);
    expect(w.budgetItems.map((b: any) => b.serviceKey).sort()).toEqual(['catering', 'decoration', 'photography', 'venue']);
    expect(Math.abs(w.budgetItems.reduce((s: number, b: any) => s + b.planned, 0) - 300_000_000)).toBeLessThan(4);
    expect(w.checklist.length).toBeGreaterThan(5);
    expect(w.checklist.every((c: any) => c.source === 'AUTO')).toBe(true);
    expect(w.checklist.every((c: any) => !c.dueDate || c.dueDate.slice(0, 10) >= futureDate(0))).toBe(true);
    expect(w.progress).toMatchObject({ percent: 0, stage: 'Getting started', servicesNeeded: 4 });
    expect(Object.values(w.eventStatus)).toEqual(['NOT_PLANNED', 'NOT_PLANNED']);
    expect(w.aiStatus).toBe('NONE');
    expect(w.aiAllocation).toBeUndefined();
  });

  it('accepts a rough draft with almost nothing filled in', async () => {
    const u = await h.customer('Drafter');
    const { body } = await plan(u.token, {}).expect(201);
    expect(body.title).toBe('Our wedding');
    expect(body.summary.budget).toBeNull();
  });

  it('rejects dates in the past and a custom budget with no amount', async () => {
    const u = await h.customer('Late');
    await plan(u.token, { weddingDate: '2020-01-01' }).expect(400);
    await plan(u.token, { budgetBand: 'CUSTOM' }).expect(400);
  });

  it('recommends real listings that fit the city, guests, budget and date', async () => {
    const u = await h.customer('Recs');
    const make = async (body: object) => (await plan(u.token, { cityId: refs.city.id, services: ['venue'], ...body }).expect(201)).body.id as string;
    const recs = async (id: string) => (await h.api('get', `/weddings/${id}/recommendations`, u.token).expect(200)).body;
    const has = (r: any) => r.groups[0].listings.some((l: any) => l.id === v.listingId);
    // Other tests add similar halls; a clear rating lead keeps this one in the top picks so the filters are what's tested.
    await h.prisma.listing.update({ where: { id: v.listingId }, data: { avgRating: 5, reviewCount: 40 } });

    const fits = await recs(await make({ guestCount: 400, budgetBand: 'CUSTOM', budget: 2_000_000_000 }));
    expect(has(fits)).toBe(true);
    expect(fits.groups[0]).toMatchObject({ service: 'venue', explore: { category: 'banquet-halls', city: 'karachi', guests: 400 } });
    expect(has(await recs(await make({ guestCount: 400, budgetBand: 'CUSTOM', budget: 1_000_000 })))).toBe(false);
    expect(has(await recs(await make({ guestCount: 99999 })))).toBe(false);

    const date = futureDate(300);
    await h.api('post', `/vendor/listings/${v.listingId}/block`, v.token).send({ dates: [date] }).expect(200);
    const blocked = await recs(await make({ events: [{ type: 'BARAAT', date }] }));
    expect(blocked.dateChecked).toBe(date);
    expect(has(blocked)).toBe(false);
  });

  it('keeps every plan private to its owner', async () => {
    const u = await h.customer('Owner');
    const { body: w } = await plan(u.token, { services: ['venue'] }).expect(201);
    const other = await h.customer('Snoop');
    await h.api('get', `/weddings/${w.id}`, other.token).expect(404);
    await h.api('get', `/weddings/${w.id}/recommendations`, other.token).expect(404);
    await h.api('post', `/weddings/${w.id}/budget/apply-suggestion`, other.token).expect(404);
    await h.api('patch', `/weddings/${w.id}/budget/${w.budgetItems[0].id}`, other.token).send({ planned: 1 }).expect(404);
  });

  it('filters anything unsafe or malformed out of the AI answer', () => {
    const ctx = { services: ['venue', 'catering'], today: '2027-01-01', latestDate: '2027-12-31', existingTasks: ['Send invitations'] };
    const out = sanitizeAiPlan({
      welcome: 'Your Karachi Baraat is going to be beautiful. Here is a plan to get you there.',
      allocation: [{ service: 'venue', percent: 40 }, { service: 'catering', percent: 58 }, { service: 'hacked', percent: 2 }],
      checklist: [
        { title: 'Visit three venues', dueDate: '2027-03-01' }, { title: 'send invitations', dueDate: '' },
        { title: 'Book Royal Hall, available now', dueDate: '2027-02-01' }, { title: 'Read the guide at https://evil.example', dueDate: '' },
        { title: 'Taste menus', dueDate: '2026-05-01' }, { title: 'Confirm caterer', dueDate: 'not a date' },
      ],
    }, ctx)!;
    expect(out.welcome).toContain('Karachi');
    expect(out.allocation).toEqual([{ service: 'venue', bps: 4082 }, { service: 'catering', bps: 5918 }]);
    expect(out.checklist).toEqual([
      { title: 'Visit three venues', dueDate: '2027-03-01' }, { title: 'Read the guide at', dueDate: null },
      { title: 'Taste menus', dueDate: null }, { title: 'Confirm caterer', dueDate: null },
    ]);
    expect(sanitizeAiPlan({ welcome: 'Venue X is available for Rs. 300000 on your date.' }, ctx)).toBeNull();
    expect(sanitizeAiPlan('not json', ctx)).toBeNull();
    expect(sanitizeAiPlan({ allocation: [{ service: 'venue', percent: 10 }, { service: 'catering', percent: 10 }] }, ctx)).toBeNull();
  });

  it('personalises in the background and lets the customer apply the suggested split', async () => {
    const gemini = h.app.get(GeminiClient);
    Object.defineProperty(gemini, 'enabled', { get: () => true, configurable: true });
    const original = gemini.plan;
    let calls = 0;
    gemini.plan = async (ctx: any) => {
      calls++;
      expect(JSON.stringify(ctx)).not.toContain('Zara');
      return { welcome: 'Your Mehndi and Baraat in Karachi are taking shape beautifully.', allocation: [{ service: 'venue', percent: 45 }, { service: 'catering', percent: 55 }], checklist: [{ title: 'Pick a colour palette for the Mehndi', dueDate: '' }] };
    };
    try {
      const u = await h.customer('AI Couple');
      const { body: w } = await plan(u.token, { partnerOne: 'Zara', cityId: refs.city.id, budgetBand: 'CUSTOM', budget: 100_000_000, services: ['venue', 'catering'], events: [{ type: 'MEHNDI' }, { type: 'BARAAT' }] }).expect(201);
      expect(w.aiStatus).toBe('PENDING');
      await waitFor(async () => (await h.prisma.wedding.findUniqueOrThrow({ where: { id: w.id } })).aiStatus === 'READY');
      await h.app.get(WeddingPersonalizer).personalize(w.id);
      expect(calls).toBe(1);
      const { body: d } = await h.api('get', `/weddings/${w.id}`, u.token).expect(200);
      expect(d.aiNote).toContain('Karachi');
      expect(d.checklist.filter((c: any) => c.source === 'AI').map((c: any) => c.title)).toEqual(['Pick a colour palette for the Mehndi']);
      expect(d.suggestion.map((s: any) => [s.service, s.amount])).toEqual([['venue', 45_000_000], ['catering', 55_000_000]]);
      const { body: applied } = await h.api('post', `/weddings/${w.id}/budget/apply-suggestion`, u.token).expect(200);
      expect(applied.budgetItems.map((b: any) => [b.serviceKey, b.planned]).sort()).toEqual([['catering', 55_000_000], ['venue', 45_000_000]]);
    } finally {
      gemini.plan = original;
      delete (gemini as any).enabled;
    }
  });

  it('retries when Gemini is busy, then gives up without breaking the plan', async () => {
    const gemini = h.app.get(GeminiClient);
    const personalizer = h.app.get(WeddingPersonalizer);
    Object.defineProperty(gemini, 'enabled', { get: () => true, configurable: true });
    const original = gemini.plan;
    gemini.plan = async () => { throw new Error('Gemini returned 503'); };
    try {
      const u = await h.customer('Busy');
      const { body: w } = await plan(u.token, { services: ['venue'] }).expect(201);
      // The attempt counter moves when the work is claimed; the failure is handled once the lock drops to the 2-minute backoff.
      await waitFor(async () => { const r = await h.prisma.wedding.findUniqueOrThrow({ where: { id: w.id } }); return r.aiAttempts === 1 && !!r.aiLockedUntil && r.aiLockedUntil.getTime() < Date.now() + 150_000; });
      let row = await h.prisma.wedding.findUniqueOrThrow({ where: { id: w.id } });
      expect(row.aiStatus).toBe('PENDING');
      expect(row.aiLockedUntil!.getTime()).toBeGreaterThan(Date.now());
      for (let i = 0; i < 2; i++) {
        await h.prisma.wedding.update({ where: { id: w.id }, data: { aiLockedUntil: new Date(0) } });
        await personalizer.runDue();
      }
      row = await h.prisma.wedding.findUniqueOrThrow({ where: { id: w.id } });
      expect(row).toMatchObject({ aiStatus: 'FAILED', aiAttempts: 3 });
      await h.api('get', `/weddings/${w.id}`, u.token).expect(200);
    } finally {
      gemini.plan = original;
      delete (gemini as any).enabled;
    }
  });
});

describe('cash payments and vendor commission', () => {
  // Hall commission is 5%. The default quote is Rs 375,000 with a 30% advance of Rs 112,500, so Rs 5,625 commission.
  const ADVANCE = 11250000;
  const COMMISSION = applyBps(ADVANCE, 500);

  async function cashBooking(day: number, name: string) {
    const vendor = await h.vendor(admin.token, refs, refs.hall, { name });
    const id = await acceptedBooking(futureDate(day), undefined, c.token, vendor);
    await h.api('post', `/vendor/bookings/${id}/confirm`, vendor.token).expect(200);
    const b = (await h.api('get', `/bookings/${id}`, c.token).expect(200)).body;
    return { vendor, id, milestoneId: b.milestones[0].id as string };
  }
  const record = (vendor: { token: string }, id: string, milestoneId: string) =>
    h.api('post', `/vendor/bookings/${id}/cash`, vendor.token).send({ milestoneId, receivedOn: new Date().toISOString().slice(0, 10), note: 'Paid at the office' });

  it('confirms a booking only once the customer confirms the cash, and makes the commission owed', async () => {
    const { vendor, id, milestoneId } = await cashBooking(300, 'Cash Hall One');
    await h.api('post', `/bookings/${id}/milestones/${milestoneId}/method`, c.token).send({ method: 'CASH' }).expect(200);
    const { body: receipt } = await record(vendor, id, milestoneId).expect(201);
    expect(receipt.amount).toBe(ADVANCE);
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_PAYMENT');

    const stranger = await h.customer('Stranger');
    await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, stranger.token).expect(404);
    await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, vendor.token).expect(404);

    await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, c.token).expect(200);
    await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, c.token).expect(409);
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');
    const payment = await h.prisma.payment.findFirstOrThrow({ where: { bookingId: id } });
    expect([payment.collectedBy, payment.provider, Number(payment.commission)]).toEqual(['VENDOR', 'cash', COMMISSION]);
    expect(await h.prisma.settlement.count({ where: { bookingId: id } })).toBe(0);

    const { body: st } = await h.api('get', '/vendor/commission', vendor.token).expect(200);
    expect(st.totals).toMatchObject({ owed: COMMISSION, outstanding: COMMISSION, overdue: 0 });
    expect(st.restricted).toBe(false);
    const { body: detail } = await h.api('get', `/bookings/${id}`, c.token).expect(200);
    expect(detail.cashReceipts[0].status).toBe('CONFIRMED');
  });

  it('lets only one of several simultaneous cash records through', async () => {
    const { vendor, id, milestoneId } = await cashBooking(301, 'Cash Hall Two');
    const results = await Promise.all([1, 2, 3].map(() => record(vendor, id, milestoneId)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await h.prisma.cashReceipt.count({ where: { bookingId: id } })).toBe(1);
  });

  it('can require the advance to be paid online', async () => {
    const { vendor, id, milestoneId } = await cashBooking(302, 'Cash Hall Three');
    await h.api('patch', '/admin/settings', admin.token).send({ requireOnlineDeposit: true }).expect(200);
    try {
      expect((await h.api('post', `/bookings/${id}/milestones/${milestoneId}/method`, c.token).send({ method: 'CASH' }).expect(409)).body.code).toBe('ONLINE_DEPOSIT_REQUIRED');
      expect((await record(vendor, id, milestoneId).expect(409)).body.code).toBe('ONLINE_DEPOSIT_REQUIRED');
    } finally {
      await h.api('patch', '/admin/settings', admin.token).send({ requireOnlineDeposit: false }).expect(200);
    }
  });

  it('sends a disputed receipt to admin, who can reject it without moving the booking', async () => {
    const { vendor, id, milestoneId } = await cashBooking(303, 'Cash Hall Four');
    const { body: receipt } = await record(vendor, id, milestoneId).expect(201);
    await h.api('post', `/bookings/${id}/cash/${receipt.id}/dispute`, c.token).send({ reason: 'I paid only half' }).expect(200);
    await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, c.token).expect(409);
    expect((await record(vendor, id, milestoneId)).status).toBe(409);
    const { body: queue } = await h.api('get', '/admin/cash-receipts', admin.token).expect(200);
    expect(queue.some((r: any) => r.id === receipt.id && r.status === 'DISPUTED')).toBe(true);
    await h.api('post', `/admin/cash-receipts/${receipt.id}/resolve`, admin.token).send({ action: 'REJECT', reason: 'Customer showed half was paid' }).expect(200);
    expect((await h.prisma.cashReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status).toBe('REJECTED');
    expect(await h.prisma.payment.count({ where: { bookingId: id } })).toBe(0);
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_PAYMENT');
    expect(await h.prisma.auditLog.count({ where: { entityId: receipt.id, action: 'cash.rejected' } })).toBe(1);
    await record(vendor, id, milestoneId).expect(201);
  });

  it('confirms cash automatically after the window, and never releases a date while cash awaits confirmation', async () => {
    const { vendor, id, milestoneId } = await cashBooking(304, 'Cash Hall Five');
    const { body: receipt } = await record(vendor, id, milestoneId).expect(201);
    await h.prisma.booking.update({ where: { id }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } });
    await h.jobs.runAll();
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_PAYMENT');
    await h.prisma.cashReceipt.update({ where: { id: receipt.id }, data: { createdAt: new Date(Date.now() - 4 * 86_400_000) } });
    await h.jobs.autoConfirmCash();
    const r = await h.prisma.cashReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect([r.status, r.autoConfirmed]).toEqual(['CONFIRMED', true]);
    expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');
  });

  it('pauses new quotations while commission is overdue, and lifts it once the vendor pays online', async () => {
    const { vendor, id, milestoneId } = await cashBooking(305, 'Cash Hall Six');
    const { body: receipt } = await record(vendor, id, milestoneId).expect(201);
    await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, c.token).expect(200);
    await h.prisma.payment.updateMany({ where: { bookingId: id }, data: { commissionDueAt: new Date(Date.now() - 86_400_000) } });

    const { body: st } = await h.api('get', '/vendor/commission', vendor.token).expect(200);
    expect(st.totals.overdue).toBe(COMMISSION);
    expect(st.restricted).toBe(true);
    await h.jobs.commissionReminders();
    expect(await h.prisma.payment.count({ where: { bookingId: id, commissionOverdueAt: { not: null } } })).toBe(1);

    const { body: enq } = await h.api('post', '/enquiries', c.token).send({ listingIds: [vendor.listingId], eventDate: futureDate(306), slot: 'FULL_DAY', guestCount: 300, requirements: 'Hall' }).expect(201);
    const quote = { enquiryId: enq.enquiries[0].id, lines: [{ description: 'Hall', quantity: 1, unitPrice: 20000000 }], cancellationPolicyId: refs.policy.id, milestones: [{ label: 'Full', shareBps: 10000, dueRule: 'ON_BOOKING' }] };
    expect((await h.api('post', '/vendor/quotations', vendor.token).send({ ...quote, send: true }).expect(403)).body.code).toBe('COMMISSION_OVERDUE');
    await h.api('post', '/vendor/quotations', vendor.token).send({ ...quote, send: false }).expect(201);

    await h.api('post', '/vendor/commission/pay', vendor.token).send({ amount: COMMISSION + 1 }).expect(400);
    const { body: checkout } = await h.api('post', '/vendor/commission/pay', vendor.token).send({}).expect(200);
    expect(checkout.checkoutUrl).toBeTruthy();
    const cp = await h.prisma.commissionPayment.findUniqueOrThrow({ where: { id: checkout.id } });
    const evt = { eventId: `cm_${cp.id}`, providerRef: cp.providerRef, status: 'SUCCEEDED', amount: Number(cp.amount) };
    await Promise.all([1, 2, 3].map(() => h.sendWebhook(evt).expect(200)));
    await h.sendWebhook({ ...evt, eventId: `cm2_${cp.id}` }).expect(200);
    expect(await h.prisma.ledgerEntry.count({ where: { vendorId: vendor.vendorId, type: 'COMMISSION_RECEIVED' } })).toBe(1);

    const { body: after } = await h.api('get', '/vendor/commission', vendor.token).expect(200);
    expect(after.totals).toMatchObject({ outstanding: 0, overdue: 0 });
    expect(after.restricted).toBe(false);
    await h.api('post', '/vendor/quotations', vendor.token).send({ ...quote, send: true }).expect(201);
  });

  it('reverses the commission when cash is refunded, without calling the gateway', async () => {
    const { vendor, id, milestoneId } = await cashBooking(307, 'Cash Hall Seven');
    const { body: receipt } = await record(vendor, id, milestoneId).expect(201);
    const { body: done } = await h.api('post', `/bookings/${id}/cash/${receipt.id}/confirm`, c.token).expect(200);
    const svc: any = h.app.get(require('../src/payments/payments.service').PaymentsService);
    const spy = jest.spyOn(svc.provider, 'refund');
    const { body: refund } = await h.api('post', '/refunds', c.token).send({ paymentId: done.paymentId, reason: 'Vendor returned the cash' }).expect(201);
    await h.api('post', `/admin/refunds/${refund.id}/decision`, admin.token).send({ approve: true, reason: 'Vendor confirmed return' }).expect(200);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect((await h.api('get', '/vendor/commission', vendor.token).expect(200)).body.totals.outstanding).toBe(0);
  });

  it('lists vendors by overdue commission for admins only', async () => {
    const { body } = await h.api('get', '/admin/commission-statements', admin.token).expect(200);
    expect(body.length).toBeGreaterThan(0);
    await h.api('get', '/admin/commission-statements', c.token).expect(403);
  });
});

describe('plan results', () => {
  const plan = (token: string, body: object) => h.api('post', '/weddings/plan', token).send(body);

  it('shows the best real vendors per service with honest reasons, and tracks quote requests', async () => {
    const u = await h.customer('Results');
    const { body: w } = await plan(u.token, { cityId: refs.city.id, guestCount: 400, events: [{ type: 'BARAAT', date: futureDate(410) }], budgetBand: '20_40L', services: ['venue', 'photography'] }).expect(201);
    const { body: r } = await h.api('get', `/weddings/${w.id}/results`, u.token).expect(200);
    expect(r.events).toHaveLength(1);
    expect(r.budgetSplit.map((b: any) => b.service).sort()).toEqual(['photography', 'venue']);
    const venue = r.services.find((s: any) => s.service === 'venue');
    expect(venue.picks.length).toBeGreaterThan(0);
    expect(venue.picks.length).toBeLessThanOrEqual(3);
    expect(venue.overBudget).toBe(false);
    expect(venue.progress).toBe('OPEN');
    const pick = venue.picks[0];
    expect(pick.estimate).toBeLessThanOrEqual(venue.allocation);
    expect(pick.reasons.some((x: string) => x.startsWith('Within your'))).toBe(true);
    expect(pick.reasons.some((x: string) => x.startsWith('Not booked on Mehfil for'))).toBe(true);
    expect(pick.reasons.join(' ')).not.toMatch(/available/i);
    expect(r.nextSteps.length).toBeLessThanOrEqual(5);

    await h.api('post', '/enquiries', u.token).send({ listingIds: venue.picks.map((p: any) => p.id), weddingId: w.id, eventId: r.events[0].id, eventDate: r.events[0].date, guestCount: 400, requirements: 'Hall for our baraat' }).expect(201);
    const { body: after } = await h.api('get', `/weddings/${w.id}/results`, u.token).expect(200);
    expect(after.services.find((s: any) => s.service === 'venue').progress).toBe('QUOTES_REQUESTED');

    const other = await h.customer('Nosy');
    await h.api('get', `/weddings/${w.id}/results`, other.token).expect(404);
  });

  it('still shows options, clearly marked, when nothing fits the budget', async () => {
    const u = await h.customer('Tight');
    const { body: w } = await plan(u.token, { cityId: refs.city.id, guestCount: 100, budgetBand: 'CUSTOM', budget: 1_000_000, services: ['venue'] }).expect(201);
    const { body: r } = await h.api('get', `/weddings/${w.id}/results`, u.token).expect(200);
    const venue = r.services[0];
    expect(venue.overBudget).toBe(true);
    expect(venue.matches).toBe(0);
    expect(venue.picks[0].reasons[0]).toMatch(/^From .* above your/);
  });
});

describe('safepay', () => {
  const { SafepayProvider } = require('../src/payments/safepay');
  const { PaymentsService } = require('../src/payments/payments.service');
  const crypto = require('crypto');
  const KEY = process.env.SAFEPAY_API_KEY!;
  const sign = (s: string) => crypto.createHmac('sha512', process.env.SAFEPAY_WEBHOOK_SECRET!).update(s).digest('hex');
  const json = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) }) as unknown as Response;

  /** Stands in for Safepay's API: records calls and answers like the real sandbox did. */
  function fakeSafepay(state: { tracker: string; trackerState: string; amount: number }) {
    const calls: { method: string; url: string; headers: any; body: any }[] = [];
    const spy = jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any = {}) => {
      const u = String(url);
      calls.push({ method: init.method ?? 'GET', url: u, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
      if (u.endsWith('/order/payments/v3/')) return json(201, { data: { tracker: { token: state.tracker, state: 'TRACKER_STARTED' } }, status: { errors: [], message: 'success' } });
      if (u.endsWith('/client/passport/v1/token')) return json(200, { data: 'tbt-token==' });
      if (u.includes('/reporter/api/v1/payments/')) return json(200, { ok: true, data: { token: state.tracker, state: state.trackerState, client: { api_key: KEY }, purchase_totals: { quote_amount: { currency: 'PKR', amount: state.amount } } } });
      if (u.includes('/refund')) return json(200, { data: { tracker: { token: state.tracker, state: 'TRACKER_REFUNDED' } } });
      return json(404, {});
    });
    return { calls, restore: () => spy.mockRestore() };
  }

  /** Runs a test with Safepay as the live provider, then puts the sandbox back. */
  async function withSafepay(fn: (svc: any) => Promise<void>) {
    const svc = h.app.get(PaymentsService);
    const original = svc.provider;
    const cfg = require('../src/common/config').env;
    const before = cfg.PAYMENT_PROVIDER;
    svc.provider = h.app.get(SafepayProvider);
    cfg.PAYMENT_PROVIDER = 'safepay';
    try { await fn(svc); } finally { svc.provider = original; cfg.PAYMENT_PROVIDER = before; }
  }

  it('accepts only webhooks signed with the shared secret, and maps the events Mehfil uses', () => {
    const p = h.app.get(SafepayProvider);
    const evt = { token: 'evt_1', version: '2.0.0', merchant_api_key: KEY, type: 'payment.succeeded', data: { tracker: 'track_abc', state: 'TRACKER_ENDED', amount: 45000, fee: 1475 } };
    const raw = JSON.stringify(evt);
    expect(p.parseWebhook(Buffer.from(raw), { 'x-sfpy-signature': sign(raw) })).toEqual({ eventId: 'evt_1', providerRef: 'track_abc', status: 'SUCCEEDED', amount: 45000, fee: 1475 });
    expect(() => p.parseWebhook(Buffer.from(raw), { 'x-sfpy-signature': 'a'.repeat(128) })).toThrow();
    expect(() => p.parseWebhook(Buffer.from(raw), {})).toThrow();
    const other = JSON.stringify({ ...evt, merchant_api_key: 'sec_someone_else' });
    expect(() => p.parseWebhook(Buffer.from(other), { 'x-sfpy-signature': sign(other) })).toThrow();
    const refunded = JSON.stringify({ ...evt, type: 'payment.refunded' });
    expect(p.parseWebhook(Buffer.from(refunded), { 'x-sfpy-signature': sign(refunded) })).toBeNull();
    const failed = JSON.stringify({ ...evt, type: 'payment.failed', data: { tracker: 'track_abc', message: 'Card declined' } });
    expect(p.parseWebhook(Buffer.from(failed), { 'x-sfpy-signature': sign(failed) })).toMatchObject({ status: 'FAILED', failureReason: 'Card declined' });
  });

  it('starts a hosted checkout in paisa, and confirms only after asking Safepay directly', async () => {
    const id = await acceptedBooking(futureDate(420));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const b = (await h.api('get', `/bookings/${id}`, c.token).expect(200)).body;
    const m = b.milestones[0];
    const state = { tracker: 'track_11111111-2222-3333-4444-555555555555', trackerState: 'TRACKER_STARTED', amount: m.amount };
    const fake = fakeSafepay(state);
    try {
      await withSafepay(async () => {
        const { body: start } = await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: m.id }).expect(200);
        const url = new URL(start.checkoutUrl);
        expect(url.origin + url.pathname).toBe('https://sandbox.api.getsafepay.com/embedded/');
        expect(url.searchParams.get('tracker')).toBe(state.tracker);
        expect(url.searchParams.get('tbt')).toBe('tbt-token==');
        expect(url.searchParams.get('redirect_url')).toContain('/v1/payments/safepay/return?to=');
        const created = fake.calls.find((x) => x.url.endsWith('/order/payments/v3/'))!;
        expect(created.body).toMatchObject({ merchant_api_key: KEY, currency: 'PKR', amount: m.amount });
        expect(created.headers['X-SFPY-MERCHANT-SECRET']).toBe(process.env.SAFEPAY_SECRET_KEY);

        // Coming back before Safepay has finished must not confirm anything.
        const early = await h.api('get', `/payments/safepay/return?tracker=${state.tracker}&to=${encodeURIComponent(`http://localhost:3000/account/bookings/${id}`)}`);
        expect(early.status).toBe(303);
        expect(early.headers.location).toBe(`http://localhost:3000/account/bookings/${id}?payment=pending`);
        expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('AWAITING_PAYMENT');

        state.trackerState = 'TRACKER_ENDED';
        const back = await h.api('get', `/payments/safepay/return?tracker=${state.tracker}&to=${encodeURIComponent(`http://localhost:3000/account/bookings/${id}`)}`);
        expect(back.headers.location).toBe(`http://localhost:3000/account/bookings/${id}?payment=success`);
        expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');

        // The real webhook arriving afterwards changes nothing.
        const raw = JSON.stringify({ token: 'evt_late', merchant_api_key: KEY, type: 'payment.succeeded', data: { tracker: state.tracker, state: 'TRACKER_ENDED', amount: m.amount } });
        await h.http().post('/v1/webhooks/payments/safepay').set('Content-Type', 'application/json').set('x-sfpy-signature', sign(raw)).send(raw).expect(200);
        const p = await h.prisma.payment.findFirstOrThrow({ where: { providerRef: state.tracker } });
        expect(await h.prisma.ledgerEntry.count({ where: { paymentId: p.id, type: 'PAYMENT_RECEIVED' } })).toBe(1);

        // Refunds go back through Safepay with the checkout token.
        const { body: refund } = await h.api('post', '/refunds', c.token).send({ paymentId: p.id, amount: 1000, reason: 'Testing' }).expect(201);
        await h.api('post', `/admin/refunds/${refund.id}/decision`, admin.token).send({ approve: true, reason: 'ok' }).expect(200);
        const r = fake.calls.find((x) => x.url.includes(`/order/payments/v3/${state.tracker}/refund`))!;
        expect(r.body).toEqual({ currency: 'PKR', amount: 1000 });
        expect(r.headers.Authorization).toBe('Bearer tbt-token==');
      });
    } finally { fake.restore(); }
  });

  it('never redirects outside the site, and ignores trackers it never issued', async () => {
    const fake = fakeSafepay({ tracker: 'track_99999999-0000-0000-0000-000000000000', trackerState: 'TRACKER_ENDED', amount: 1 });
    try {
      await withSafepay(async () => {
        const res = await h.api('get', `/payments/safepay/return?tracker=track_99999999-0000-0000-0000-000000000000&to=${encodeURIComponent('https://evil.example/steal')}`);
        expect(res.headers.location).toBe('http://localhost:3000/?payment=pending');
        expect(fake.calls.length).toBe(0);
      });
    } finally { fake.restore(); }
  });

  it('finds payments whose webhook never arrived', async () => {
    const id = await acceptedBooking(futureDate(421));
    await h.api('post', `/vendor/bookings/${id}/confirm`, v.token).expect(200);
    const m = (await h.api('get', `/bookings/${id}`, c.token).expect(200)).body.milestones[0];
    const state = { tracker: 'track_22222222-2222-3333-4444-555555555555', trackerState: 'TRACKER_STARTED', amount: m.amount };
    const fake = fakeSafepay(state);
    try {
      await withSafepay(async (svc) => {
        await h.api('post', `/bookings/${id}/pay`, c.token).send({ milestoneId: m.id }).expect(200);
        await h.prisma.payment.updateMany({ where: { providerRef: state.tracker }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
        state.trackerState = 'TRACKER_ENDED';
        await svc.reconcileOpenCheckouts();
        expect((await h.prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED');
      });
    } finally { fake.restore(); }
  });
});
