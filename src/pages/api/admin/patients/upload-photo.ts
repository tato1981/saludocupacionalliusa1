
import type { APIRoute } from 'astro';
import { ImageProcessingService } from '@/lib/image-processing-service';
import { StorageService } from '@/lib/storage-service';
import { hasRole } from '@/lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    
    // Debug log
    if (!user) {
        console.error('❌ Upload Photo: No authenticated user found in locals');
    } else {
        // console.log(`✅ Upload Photo: User authenticated: ${user.email} (${user.role})`);
    }

    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autenticado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar permisos: Superadmin, Admin, Staff y Doctor tienen permiso
    if (!hasRole(user, 'staff') && !hasRole(user, 'doctor') && !hasRole(user, 'admin') && !hasRole(user, 'superadmin')) {
      console.error(`❌ Upload Photo: User ${user.email} with role ${user.role} is not authorized`);
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const formData = await request.formData();
    const photoFile = formData.get('photo') as File;
    const patientId = formData.get('patientId') as string;

    if (!photoFile || photoFile.size === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No se proporcionó ninguna foto'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar que sea una imagen
    const allowedTypes = ['image/avif', 'image/webp', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(photoFile.type)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Formato de imagen no válido. Se permiten: AVIF, WebP, JPEG, PNG'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (photoFile.size > maxSize) {
      return new Response(JSON.stringify({
        success: false,
        message: 'La imagen es demasiado grande. Máximo 5MB'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar nombre único para la imagen
    const timestamp = Date.now();
    // Usar estructura de carpetas por paciente
    const key = `patients/${patientId}/photo_${timestamp}.webp`;
    
    // Convertir el archivo a buffer para procesamiento
    const bytes = await photoFile.arrayBuffer();
    const originalBuffer = Buffer.from(bytes);

    // Procesar imagen con optimización (sin guardar en disco local)
    const processingResult = await ImageProcessingService.processImage(
      originalBuffer,
      null,
      'patient'
    );

    if (!processingResult.success || !processingResult.buffer) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Error al procesar la imagen: ' + processingResult.error
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Subir imagen principal a storage local
    // Asegurar que key no tenga slashes iniciales duplicados
    const cleanKey = key.replace(/^\/+/, '');
    const publicUrl = await StorageService.uploadFile(processingResult.buffer, cleanKey, 'image/webp');
    console.log(`✅ Foto subida: ${publicUrl}`);

    // Crear y subir versión para certificados
    const certResult = await ImageProcessingService.processImage(originalBuffer, null, 'certificate');
    if (certResult.success && certResult.buffer) {
      const certKey = `patients/${patientId}/certificate_${timestamp}.webp`;
      await StorageService.uploadFile(certResult.buffer, certKey, 'image/webp');
      console.log(`✅ Versión certificado subida`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Foto subida exitosamente',
      data: {
        fileName: `photo_${timestamp}.webp`,
        path: publicUrl,
        size: photoFile.size,
        type: photoFile.type
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });


  } catch (error) {
    console.error('Error al subir foto:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor al subir la foto'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
