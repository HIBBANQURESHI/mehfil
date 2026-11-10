import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64 encoded'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY_HOPS: z.coerce.number().default(1),
  INTERNAL_API_KEY: z.string().optional(),
  SMS_PROVIDER: z.enum(['console', 'twilio', 'http', 'textbee']).default('console'),
  TEXTBEE_API_KEY: z.string().optional(),
  // For local gateways: a URL template using {to}, {message}, {sender} and {key}.
  SMS_HTTP_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER: z.string().optional(),
  SMS_HTTP_SUCCESS_TEXT: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Mehfil <no-reply@mehfil.local>'),
  PUSH_ENABLED: bool.default('true'),
  PAYMENT_PROVIDER: z.enum(['none', 'sandbox']).default('none'),
  SANDBOX_WEBHOOK_SECRET: z.string().default('sandbox-secret-not-for-production'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_BUCKET: z.string().optional(),
  S3_PRIVATE_BUCKET: z.string().optional(),
  PUBLIC_FILES_URL: z.string().optional(),
  JOBS_ENABLED: bool.default('true'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (env.SMS_PROVIDER === 'console') fail('SMS_PROVIDER=console would print OTP codes to the logs in production');
  if (env.SMS_PROVIDER === 'twilio' && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM)) fail('Twilio credentials are required');
  if (env.PAYMENT_PROVIDER === 'sandbox') fail('PAYMENT_PROVIDER=sandbox accepts fake payments and cannot run in production');
  if (env.SMS_PROVIDER === 'textbee' && !env.TEXTBEE_API_KEY) fail('TEXTBEE_API_KEY is required');
  if (env.SMS_PROVIDER === 'http') {
    if (!env.SMS_HTTP_URL?.includes('{to}') || !env.SMS_HTTP_URL.includes('{message}')) fail('SMS_HTTP_URL must be a URL containing {to} and {message}');
    if (env.SMS_HTTP_URL?.includes('{key}') && !env.SMS_API_KEY) fail('SMS_API_KEY is required');
    if (env.SMS_HTTP_URL?.includes('{sender}') && !env.SMS_SENDER) fail('SMS_SENDER is required');
  }
  if (!env.RESEND_API_KEY && !env.SMTP_URL) fail('RESEND_API_KEY or SMTP_URL is required in production');
  if (env.STORAGE_DRIVER === 's3' && !(env.S3_ACCESS_KEY && env.S3_SECRET_KEY && env.S3_PUBLIC_BUCKET && env.S3_PRIVATE_BUCKET && env.PUBLIC_FILES_URL)) fail('S3 settings are incomplete');
  // Plain http is allowed only on this machine, for testing a production build locally.
  const local = (u: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);
  if (!env.WEB_URL.startsWith('https://') && !local(env.WEB_URL)) fail('WEB_URL must be https in production');
  if (!env.API_PUBLIC_URL.startsWith('https://') && !local(env.API_PUBLIC_URL)) fail('API_PUBLIC_URL must be https in production');
  if (!env.INTERNAL_API_KEY || env.INTERNAL_API_KEY.length < 32) fail('INTERNAL_API_KEY (32+ characters) is required in production');
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.') || 'config'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const env: Env = load();
