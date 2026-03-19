import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { uploadImageToR2 } from '@/lib/r2-storage';
import { MigrationService } from '@/lib/migration-service';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'staff')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      await MigrationService.runMigrations();
    } catch (migrationError) {
      console.warn('⚠️ Error en migraciones (continuando):', migrationError);
    }

    const formData = await request.formData();
    const photo = formData.get('photo');
    const patientId = String(formData.get('patientId') || 'temp');

    if (!(photo instanceof File)) {
      return new Response(JSON.stringify({ success: false, message: 'Archivo de foto requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (photo.size <= 0) {
      return new Response(JSON.stringify({ success: false, message: 'Archivo de foto vacío' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (photo.size > 8 * 1024 * 1024) {
      return new Response(JSON.stringify({ success: false, message: 'La foto excede el tamaño permitido' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = Buffer.from(await photo.arrayBuffer());
    const upload = await uploadImageToR2({
      folder: `patients/${patientId}/profile`,
      filenameBase: 'profile-photo',
      input: { buffer, contentType: photo.type || undefined, originalName: photo.name || undefined },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Foto subida correctamente',
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
    return new Response(JSON.stringify({ success: false, message: error?.message || 'Error al subir foto' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
