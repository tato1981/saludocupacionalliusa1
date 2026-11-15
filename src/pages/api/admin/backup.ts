import type { APIRoute } from 'astro';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { generateSqlDump } from '@/lib/backup-service';
import { uploadFileToR2 } from '@/lib/r2-storage';

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    const user = requireAuth(cookies);
    if (!user || !isSuperAdmin(user)) {
      return json({ success: false, message: 'No autorizado' }, 401);
    }

    let action = 'download';
    try {
      const body = await request.json();
      if (body && body.action === 'upload') action = 'upload';
    } catch {
      // Sin body: por defecto descarga local
    }

    const { filename, content } = await generateSqlDump();
    const buffer = Buffer.from(content, 'utf-8');

    if (action === 'upload') {
      const key = `backups/${filename}`;
      const result = await uploadFileToR2({
        key,
        body: buffer,
        contentType: 'application/sql',
      });
      return json(
        {
          success: true,
          message: 'Respaldo subido al servidor R2 correctamente',
          data: { filename: result.key, url: result.url },
        },
        200,
      );
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('Error en POST /api/admin/backup:', error);
    return json({ success: false, message: 'No se pudo generar el respaldo. Intente nuevamente.' }, 500);
  }
};
