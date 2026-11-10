import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { password as passwordRule } from '@mehfil/shared';

/** Admins cannot register publicly. The first Super Admin comes from here; everyone else is invited by them. */
async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME) in the environment.');
  const rule = passwordRule.safeParse(ADMIN_PASSWORD);
  if (!rule.success) throw new Error(rule.error.issues[0].message);
  const prisma = new PrismaClient();
  const role = await prisma.adminRole.upsert({ where: { name: 'Super Admin' }, create: { name: 'Super Admin', permissions: [], isSystem: true }, update: {} });
  const email = ADMIN_EMAIL.toLowerCase();
  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.upsert({ where: { email }, create: { email, name: ADMIN_NAME ?? 'Super Admin', passwordHash, termsAcceptedAt: new Date() }, update: { passwordHash } });
  await prisma.adminMember.upsert({ where: { userId: user.id }, create: { userId: user.id, roleId: role.id, isSuper: true }, update: { isSuper: true, active: true, roleId: role.id } });
  console.log(`Super Admin ready: ${email}. Two-factor setup happens at first sign-in.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
