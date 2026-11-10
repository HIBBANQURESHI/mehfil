import { INestApplication, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import * as path from 'path';
import { env } from './common/config';

export function configureApp(app: INestApplication) {
  const server = app as NestExpressApplication;
  server.set('trust proxy', env.TRUST_PROXY_HOPS);
  server.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());
  const origins = [env.WEB_URL, ...env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)];
  app.enableCors({ origin: origins, credentials: false, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  server.useBodyParser('json', { limit: '256kb' });
  if (env.STORAGE_DRIVER === 'local') app.use('/files', express.static(path.resolve(env.STORAGE_LOCAL_DIR, 'public'), { index: false, dotfiles: 'deny', maxAge: '30d', immutable: true }));
  app.enableShutdownHooks();
}
