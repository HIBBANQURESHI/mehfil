import { BadRequestException, Controller, Global, Injectable, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { fromBuffer } from 'file-type';
import sharp from 'sharp';
import { env } from '../common/config';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const s3 = env.STORAGE_DRIVER === 's3' ? new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT, forcePathStyle: !!env.S3_ENDPOINT, credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! } }) : null;

@Injectable()
export class StorageService {
  private localPath(scope: 'public' | 'private', key: string) {
    const root = path.resolve(env.STORAGE_LOCAL_DIR, scope);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new BadRequestException('Invalid file path');
    return full;
  }

  /** Re-encoding drops EXIF data (including GPS) and anything hidden inside a crafted image. */
  async saveImage(buffer: Buffer): Promise<{ url: string }> {
    const detected = await fromBuffer(buffer);
    if (!detected || !IMAGE_TYPES.includes(detected.mime)) throw new BadRequestException('Please upload a JPG, PNG or WebP image.');
    let output: Buffer;
    try {
      output = await sharp(buffer, { limitInputPixels: 50_000_000 }).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch { throw new BadRequestException('That file is not a valid image.'); }
    const key = `images/${randomUUID()}.webp`;
    await this.put('public', key, output, 'image/webp');
    return { url: env.STORAGE_DRIVER === 's3' ? `${env.PUBLIC_FILES_URL}/${key}` : `${env.API_PUBLIC_URL}/files/${key}` };
  }

  async savePrivate(buffer: Buffer, ext: string, contentType: string): Promise<string> {
    const key = `documents/${randomUUID()}.${ext}`;
    await this.put('private', key, buffer, contentType);
    return key;
  }

  private async put(scope: 'public' | 'private', key: string, body: Buffer, contentType: string) {
    if (s3) { await s3.send(new PutObjectCommand({ Bucket: scope === 'public' ? env.S3_PUBLIC_BUCKET : env.S3_PRIVATE_BUCKET, Key: key, Body: body, ContentType: contentType })); return; }
    const file = this.localPath(scope, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async readPrivate(key: string): Promise<Buffer> {
    if (s3) {
      const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_PRIVATE_BUCKET, Key: key }));
      const chunks: Buffer[] = [];
      for await (const c of res.Body as Readable) chunks.push(c as Buffer);
      return Buffer.concat(chunks);
    }
    return fs.readFile(this.localPath('private', key));
  }
}

@Controller('uploads')
export class UploadsController {
  constructor(private storage: StorageService) {}

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please choose an image.');
    return this.storage.saveImage(file.buffer);
  }
}

@Global()
@Module({ controllers: [UploadsController], providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
