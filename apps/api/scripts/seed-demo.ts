import * as argon2 from 'argon2';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

/**
 * Sample data for trying Mehfil on your own computer: fictional vendors, placeholder images and test
 * accounts. All of it is fake, so it refuses to run against production.
 */
const NAMES = ['Noor Mahal Banquet', 'Gulshan Marquee', 'Zaiqa Caterers', 'Rang Decor Studio', 'Lamha Photography', 'Roop Bridal Studio'];
const SLUGS = ['banquet-halls', 'marquees', 'catering', 'decoration', 'photography', 'makeup-artists'];
const PALETTE = [['#8F3048', '#D98C9D'], ['#76263B', '#D4AD63'], ['#D4AD63', '#F8E9E9'], ['#D98C9D', '#F8E9E9'], ['#49343A', '#8F3048'], ['#8F3048', '#F8E9E9']];

async function image(i: number) {
  const [a, b] = PALETTE[i];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><path d="M350 900V470C350 330 520 270 600 150C680 270 850 330 850 470V900Z" fill="#FFFDF9" opacity=".22"/></svg>`;
  const dir = path.resolve(process.env.STORAGE_LOCAL_DIR ?? './uploads', 'public/images');
  await fs.mkdir(dir, { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(path.join(dir, `demo-${i}.webp`));
  return `${process.env.API_PUBLIC_URL ?? 'http://localhost:4000'}/files/images/demo-${i}.webp`;
}

async function main() {
  require('dotenv/config');
  if (process.env.NODE_ENV === 'production') throw new Error('The demo seed must never run in production.');
  const prisma = new PrismaClient();
  const passwordHash = await argon2.hash('Mehfil12345', { type: argon2.argon2id });
  const city = await prisma.city.findUniqueOrThrow({ where: { slug: 'karachi' }, include: { areas: true } });

  // Demo-only rates, so the booking flow can be tried end to end. Real rates are set in Admin > Categories.
  for (const [slug, commissionBps] of [['banquet-halls', 500], ['marquees', 500], ['catering', 600], ['decoration', 900], ['photography', 900], ['makeup-artists', 900], ['videography', 900], ['wedding-planners', 700]] as const) await prisma.category.update({ where: { slug }, data: { commissionBps } });
  if (!(await prisma.cancellationPolicy.count())) await prisma.cancellationPolicy.create({ data: { name: 'Demo policy', body: 'Sample policy for local testing only.', tiers: [{ daysBefore: 30, refundBps: 9000 }, { daysBefore: 7, refundBps: 5000 }, { daysBefore: 0, refundBps: 0 }] } });

  for (const [i, name] of NAMES.entries()) {
    const phone = `+92300000010${i}`;
    if (await prisma.user.findUnique({ where: { phone } })) continue;
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: SLUGS[i] } });
    const url = await image(i);
    const owner = await prisma.user.create({ data: { name: `${name} Owner`, phone, email: `vendor${i}@mehfil.test`, passwordHash, phoneVerifiedAt: new Date(), termsAcceptedAt: new Date() } });
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const area = city.areas[i % city.areas.length];
    await prisma.vendor.create({ data: {
      businessName: name, slug, description: 'Sample vendor for local testing.', primaryCategoryId: category.id, phone, cityId: city.id, areaId: area.id, address: `${area.name}, Karachi`, logoUrl: url, status: 'APPROVED', approvedAt: new Date(), submittedAt: new Date(), identityVerifiedAt: new Date(), termsAcceptedAt: new Date(),
      featuredUntil: i < 2 ? new Date(Date.now() + 90 * 86_400_000) : null, members: { create: { userId: owner.id, role: 'OWNER' } },
      listings: { create: { categoryId: category.id, slug, title: name, description: 'A sample listing showing how a real vendor page looks. Everything here is placeholder content.', cityId: city.id, areaId: area.id, address: `${area.name}, Karachi`, capacityMin: 100, capacityMax: 300 + i * 100, indoorOutdoor: 'INDOOR', amenities: category.amenityOptions.slice(0, 4), startingPrice: (15 + i * 12) * 1_000_000, priceUnit: 'FLAT', dailyCapacity: category.availabilityMode === 'EXCLUSIVE' ? 1 : 3, status: 'PUBLISHED', publishedAt: new Date(),
        media: { create: [{ url, sortOrder: 0 }] }, packages: { create: [{ name: 'Standard', price: (15 + i * 12) * 1_000_000, inclusions: ['Sample inclusion one', 'Sample inclusion two'] }, { name: 'Premium', price: (25 + i * 15) * 1_000_000, inclusions: ['Everything in Standard', 'Sample extra'] }] } } },
    } });
  }
  if (!(await prisma.user.findUnique({ where: { phone: '+923000000200' } }))) await prisma.user.create({ data: { name: 'Test Customer', phone: '+923000000200', email: 'customer@mehfil.test', passwordHash, phoneVerifiedAt: new Date(), termsAcceptedAt: new Date() } });
  console.log('Demo data ready. Password for all: Mehfil12345\n  Customer: 03000000200\n  Vendor:   03000000100');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
