import type { APIRoute } from 'astro';
import { hasRole } from '@/lib/auth';
import path from 'path';
import { R2StorageService } from '@/lib/r2-storage-service';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;

    if (!user) {
      console.error('❌ Upload Signature: No authenticated user found in locals');
      return new Response(JSON.stringify({ success: false, message: 'No autenticado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar permisos: Superadmin, Admin, Staff y Doctor tienen permiso
    if (!hasRole(user, 'staff') && !hasRole(user, 'doctor') && !hasRole(user, 'admin') && !hasRole(user, 'superadmin')) {
      console.error(`❌ Upload Signature: User ${user.email} with role ${user.role} is not authorized`);
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const formData = await request.formData();
    const signatureFile = formData.get('signature') as File;
    const patientId = formData.get('patientId') as string;

    if (!signatureFile) {
      return new Response(JSON.stringify({ success: false, message: 'No se recibió archivo de firma' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar tipo de archivo
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(signatureFile.type)) {
      return new Response(JSON.stringify({ success: false, message: 'Tipo de archivo no válido. Solo PNG, JPG, JPEG y WebP son permitidos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar tamaño de archivo (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (signatureFile.size > maxSize) {
      return new Response(JSON.stringify({ success: false, message: 'El archivo es demasiado grande. Máximo 2MB' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const ext = path.extname(signatureFile.name);
    // Usar estructura de carpetas por paciente
    const key = `patients/${patientId}/signature_${timestamp}${ext}`;

    // Convertir a buffer
    const buffer = Buffer.from(await signatureFile.arrayBuffer());

    // Verificar configuración de R2 antes de intentar subir
    console.log('🔍 Verificando configuración de R2 para firma...');
    console.log('   R2_ACCOUNT_ID:', process.env.R2_ACCOUNT_ID ? '✅ Configurado' : '❌ No configurado');
    console.log('   R2_BUCKET_NAME:', process.env.R2_BUCKET_NAME ? '✅ Configurado' : '❌ No configurado');
    console.log('   R2_PUBLIC_URL:', process.env.R2_PUBLIC_URL ? '✅ Configurado' : '❌ No configurado');
    console.log('   Key generado:', key);

    // Subir a R2
    const publicUrl = await R2StorageService.uploadFile(buffer, key, signatureFile.type);
    console.log('   Public URL retornada por R2StorageService:', publicUrl);

    console.log('✅ Firma subida exitosamente a R2:', publicUrl);

    return new Response(JSON.stringify({
      success: true,
      message: 'Firma subida exitosamente',
      data: {
        path: publicUrl,
        filename: `signature_${timestamp}${ext}`
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('❌ Error subiendo firma a R2:', error);
    console.error('   Error message:', error?.message);
    console.error('   Error stack:', error?.stack);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al subir firma: ' + (error?.message || 'Error desconocido')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
