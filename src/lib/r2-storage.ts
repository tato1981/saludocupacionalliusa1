import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'node:crypto';
import sharp from 'sharp';

type R2ImageFormat = 'webp' | 'avif';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno: ${name}`);
  return value;
}

function getR2Client(): S3Client {
  const endpoint = requireEnv('R2_ENDPOINT');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');

  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function safePathPart(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

function safeKeyPrefix(input: string): string {
  return input
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(safePathPart)
    .join('/');
}

function getImageFormat(): R2ImageFormat {
  const raw = (process.env.R2_IMAGE_FORMAT || 'webp').toLowerCase();
  return raw === 'avif' ? 'avif' : 'webp';
}

function contentTypeForFormat(format: R2ImageFormat): string {
  return format === 'avif' ? 'image/avif' : 'image/webp';
}

async function convertToFormat(input: Buffer, format: R2ImageFormat): Promise<Buffer> {
  const base = sharp(input).rotate();
  if (format === 'avif') return await base.avif({ quality: 80 }).toBuffer();
  return await base.webp({ quality: 80 }).toBuffer();
}

export async function uploadImageToR2(opts: {
  folder: string;
  filenameBase?: string;
  input: { buffer: Buffer; contentType?: string; originalName?: string };
}): Promise<{ key: string; url: string; contentType: string }> {
  const bucket = requireEnv('R2_BUCKET_NAME');
  const publicUrlBase = requireEnv('R2_PUBLIC_URL').replace(/\/+$/, '');

  const format = getImageFormat();
  const outputContentType = contentTypeForFormat(format);
  const outputBuffer = await convertToFormat(opts.input.buffer, format);

  const random = crypto.randomBytes(12).toString('hex');
  const timestamp = Date.now();
  const folder = safeKeyPrefix(opts.folder);
  const nameBase = safePathPart(opts.filenameBase || opts.input.originalName || 'image');
  const key = `${folder}/${nameBase}-${timestamp}-${random}.${format}`;

  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: outputBuffer,
      ContentType: outputContentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return { key, url: `${publicUrlBase}/${key}`, contentType: outputContentType };
}
