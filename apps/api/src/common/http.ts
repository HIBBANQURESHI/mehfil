import { ArgumentMetadata, ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Injectable, Logger, PipeTransform } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(private schema: ZodSchema<T>) {}
  transform(value: unknown, _meta: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
    throw new BadRequestException({ message: Object.values(fields)[0] ?? 'Invalid input', code: 'VALIDATION', fields });
  }
}

export const Z = <T>(schema: ZodSchema<T>) => new ZodPipe(schema);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Exception');

  catch(err: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const payload = typeof body === 'string' ? { message: body } : (body as object);
      return res.status(err.getStatus()).json({ statusCode: err.getStatus(), ...payload });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') return res.status(404).json({ statusCode: 404, message: 'Not found' });
      if (err.code === 'P2002') return res.status(409).json({ statusCode: 409, message: 'This already exists', code: 'DUPLICATE' });
    }
    this.log.error(`${req.method} ${req.originalUrl}`, err instanceof Error ? err.stack : String(err));
    return res.status(500).json({ statusCode: 500, message: 'Something went wrong. Please try again.' });
  }
}

export interface PageQuery { page?: string; pageSize?: string }

export function paging(q: PageQuery, maxSize = 100) {
  const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(q.pageSize ?? '20', 10) || 20, 1), maxSize);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export const paged = <T>(items: T[], total: number, p: { page: number; pageSize: number }) => ({ items, total, page: p.page, pageSize: p.pageSize });

export function slugify(v: string) {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'item';
}

export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** The current date in Pakistan (UTC+5, no daylight saving), because event dates are local calendar days. */
export const today = () => dateOnly(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const addHours = (d: Date, n: number) => new Date(d.getTime() + n * 3_600_000);
