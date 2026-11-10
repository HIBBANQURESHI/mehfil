import './common/bigint';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env } from './common/config';

async function main() {
  // rawBody keeps the exact bytes the payment gateway signed.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Mehfil').log(`API listening on :${env.PORT} (${env.NODE_ENV}, payments: ${env.PAYMENT_PROVIDER})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
