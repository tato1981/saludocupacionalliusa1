import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { getObjectFromR2 } from '@/lib/r2-storage';

function contentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export const GET: APIRoute = async ({ url, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'staff')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawKey = url.searchParams.get('key');
    if (!rawKey) {
      return new Response(JSON.stringify({ success: false, message: 'Parámetro key requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const key = rawKey.trim().replace(/^\/+/, '');
    if (key.startsWith('blob:') || key.startsWith('data:') || key.startsWith('http://') || key.startsWith('https://')) {
      return new Response(JSON.stringify({ success: false, message: 'Key inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (key.includes('..') || key.includes('\\')) {
      return new Response(JSON.stringify({ success: false, message: 'Key inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!(key.startsWith('patients/') || key.startsWith('doctors/'))) {
      return new Response(JSON.stringify({ success: false, message: 'Key no permitido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const obj = await getObjectFromR2({ key });
    const body = obj.buffer.buffer.slice(obj.buffer.byteOffset, obj.buffer.byteOffset + obj.buffer.byteLength);
    return new Response(body as any, {
      status: 200,
      headers: {
        'Content-Type': obj.contentType || contentTypeFromKey(key),
        'Cache-Control': obj.cacheControl || 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    const name = String(error?.name || '');
    const status = Number(error?.$metadata?.httpStatusCode || 0);
    if (status === 404 || name.includes('NoSuchKey') || name.includes('NotFound')) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('Error', { status: 500 });
  }
};
