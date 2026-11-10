import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from './config';

const key = () => Buffer.from(env.ENCRYPTION_KEY, 'base64');

/** AES-256-GCM for data we must read back later (TOTP secrets, IBANs). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decrypt(blob: string): string {
  const [, iv, tag, data] = blob.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const hmac = (v: string, secret = env.JWT_SECRET) => createHmac('sha256', secret).update(v).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const maskIban = (iban: string) => `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;
export function maskPhone(phone?: string | null) {
  return phone ? `${phone.slice(0, 6)}•••••${phone.slice(-2)}` : null;
}
