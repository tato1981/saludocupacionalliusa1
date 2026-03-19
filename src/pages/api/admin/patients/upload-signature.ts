import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { uploadImageToR2 } from '@/lib/r2-storage';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'staff')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const formData = await request.formData();
    const signature = formData.get('signature');
    const rawEntity = String(formData.get('entity') || 'patients').toLowerCase();
    const entityPrefix = rawEntity === 'doctor' || rawEntity === 'doctors' ? 'doctors' : 'patients';
    const entityId = String(formData.get('entityId') || formData.get('patientId') || 'temp');

    if (!(signature instanceof File)) {
      return new Response(JSON.stringify({ success: false, message: 'Archivo de firma requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (signature.size <= 0) {
      return new Response(JSON.stringify({ success: false, message: 'Archivo de firma vacío' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (signature.size > 6 * 1024 * 1024) {
      return new Response(JSON.stringify({ success: false, message: 'La firma excede el tamaño permitido' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = Buffer.from(await signature.arrayBuffer());
    const upload = await uploadImageToR2({
      folder: `${entityPrefix}/${entityId}/signatures`,
      filenameBase: 'signature',
      input: { buffer, contentType: signature.type || undefined, originalName: signature.name || undefined },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Firma subida correctamente',
        data: {
          key: upload.key,
          url: upload.url,
          path: upload.url,
          contentType: upload.contentType,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, message: error?.message || 'Error al subir firma' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
