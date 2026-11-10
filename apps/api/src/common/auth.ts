import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { VENDOR_ROLE_AREAS, VendorArea, VendorRole, AdminPermission } from '@mehfil/shared';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';

export interface AuthCtx {
  userId: string;
  sessionId: string;
  name: string;
  admin?: { id: string; isSuper: boolean; permissions: string[] };
  vendor?: { id: string; role: VendorRole; status: string; areas: VendorArea[] };
}

export type AuthedRequest = Request & { auth?: AuthCtx };

const PUBLIC = 'isPublic', ADMIN = 'adminPerm', VENDOR = 'vendorArea';

/** No token needed. If a valid token is sent, `@Auth()` is still populated. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Admin session that passed 2FA, and holding this permission. */
export const AdminOnly = (permission?: AdminPermission) => SetMetadata(ADMIN, permission ?? 'any');
/** Active member of a vendor business, whose role covers this area. */
export const VendorOnly = (area: VendorArea | 'any' = 'any') => SetMetadata(VENDOR, area);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().auth);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  private meta<T>(key: string, ctx: ExecutionContext) {
    return this.reflector.getAllAndOverride<T | undefined>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const isPublic = this.meta<boolean>(PUBLIC, ctx);
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    const auth = token ? await this.resolve(token) : undefined;
    if (isPublic) { req.auth = auth; return true; }
    if (!auth) throw new UnauthorizedException({ message: 'Please sign in', code: 'UNAUTHENTICATED' });
    req.auth = auth;

    const adminPerm = this.meta<string>(ADMIN, ctx);
    if (adminPerm) {
      if (!auth.admin) throw new ForbiddenException('Admin access required');
      if (adminPerm !== 'any' && !auth.admin.isSuper && !auth.admin.permissions.includes(adminPerm)) throw new ForbiddenException('You do not have permission for this action');
    }
    const area = this.meta<string>(VENDOR, ctx);
    if (area) {
      if (!auth.vendor) throw new ForbiddenException('Vendor access required');
      if (area !== 'any' && !auth.vendor.areas.includes(area as VendorArea)) throw new ForbiddenException('Your role does not include this area');
    }
    return true;
  }

  /** Reads the session on every request, so logout, suspension and role changes apply immediately. */
  private async resolve(token: string): Promise<AuthCtx | undefined> {
    let claims: { sub: string; sid: string; typ?: string };
    try { claims = await this.jwt.verifyAsync(token); } catch { return undefined; }
    if (claims.typ !== 'access') return undefined;
    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      include: { user: { include: { admin: { include: { role: true } }, vendorMembers: { where: { active: true }, include: { vendor: true }, take: 1, orderBy: { createdAt: 'asc' } } } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== claims.sub) return undefined;
    const { user } = session;
    if (user.status !== 'ACTIVE') return undefined;
    const member = user.vendorMembers[0];
    return {
      userId: user.id, sessionId: session.id, name: user.name,
      admin: user.admin?.active && session.adminMfa ? { id: user.admin.id, isSuper: user.admin.isSuper, permissions: user.admin.role.permissions } : undefined,
      vendor: member ? { id: member.vendorId, role: member.role as VendorRole, status: member.vendor.status, areas: VENDOR_ROLE_AREAS[member.role as VendorRole] } : undefined,
    };
  }
}
