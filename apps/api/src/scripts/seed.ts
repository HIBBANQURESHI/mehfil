import { PrismaClient } from '@prisma/client';
import { slugify } from '../common/http';

/** Reference data only: places and service types. Commission, prices and policies are entered by admins in the dashboard. */
const CATEGORIES = [
  { name: 'Banquet Halls', iconKey: 'landmark', availabilityMode: 'EXCLUSIVE' as const, amenityOptions: ['Parking', 'Air conditioning', 'Generator', 'Stage', 'Sound system', 'Bridal room', 'Valet', 'Wheelchair access'] },
  { name: 'Marquees', iconKey: 'tent', availabilityMode: 'EXCLUSIVE' as const, amenityOptions: ['Parking', 'Air conditioning', 'Generator', 'Stage', 'Sound system', 'Garden', 'Bridal room'] },
  { name: 'Catering', iconKey: 'utensils', availabilityMode: 'CAPACITY' as const, amenityOptions: ['Serving staff', 'Live stations', 'Crockery included', 'Tasting session', 'Halal certified'] },
  { name: 'Decoration', iconKey: 'flower', availabilityMode: 'CAPACITY' as const, amenityOptions: ['Stage decor', 'Entrance decor', 'Fresh flowers', 'Lighting', 'Table setup'] },
  { name: 'Photography', iconKey: 'camera', availabilityMode: 'CAPACITY' as const, amenityOptions: ['Drone', 'Album included', 'Same-day edit', 'Female photographer'] },
  { name: 'Videography', iconKey: 'video', availabilityMode: 'CAPACITY' as const, amenityOptions: ['Drone', 'Cinematic film', 'Live streaming', 'Same-day edit'] },
  { name: 'Makeup Artists', iconKey: 'sparkles', availabilityMode: 'CAPACITY' as const, amenityOptions: ['Home service', 'Trial session', 'Hair styling', 'Family makeup'] },
  { name: 'Wedding Planners', iconKey: 'clipboard', availabilityMode: 'CAPACITY' as const, amenityOptions: ['Full planning', 'Day-of coordination', 'Vendor management', 'Guest management'] },
];
const KARACHI_AREAS = ['Clifton', 'DHA', 'Gulshan-e-Iqbal', 'Gulistan-e-Johar', 'North Nazimabad', 'PECHS', 'Bahadurabad', 'Saddar', 'Malir', 'Korangi', 'Federal B Area', 'Nazimabad'];

async function main() {
  const prisma = new PrismaClient();
  const city = await prisma.city.upsert({ where: { slug: 'karachi' }, create: { name: 'Karachi', slug: 'karachi' }, update: {} });
  for (const name of KARACHI_AREAS) await prisma.area.upsert({ where: { cityId_slug: { cityId: city.id, slug: slugify(name) } }, create: { name, slug: slugify(name), cityId: city.id }, update: {} });
  for (const [sortOrder, c] of CATEGORIES.entries()) await prisma.category.upsert({ where: { slug: slugify(c.name) }, create: { ...c, slug: slugify(c.name), sortOrder }, update: {} });
  await prisma.adminRole.upsert({ where: { name: 'Super Admin' }, create: { name: 'Super Admin', permissions: [], isSystem: true }, update: {} });
  console.log('Seeded reference data: 1 city, areas, categories, Super Admin role.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
