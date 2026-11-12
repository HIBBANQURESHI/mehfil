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
  // No host: Node listens on IPv6 and IPv4 together where available (else IPv4 only). Browsers often resolve
  // "localhost" to ::1, and phones on the same Wi-Fi still reach the machine's IPv4 address.
  await app.listen(env.PORT);
  new Logger('Mehfil').log(`API listening on :${env.PORT} (${env.NODE_ENV}, payments: ${env.PAYMENT_PROVIDER})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
