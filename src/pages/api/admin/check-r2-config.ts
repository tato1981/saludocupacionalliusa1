/**
 * Endpoint de diagnóstico para verificar configuración de R2 en producción
 *
 * Acceso: GET /api/admin/check-r2-config
 */

import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { R2StorageService } from '@/lib/r2-storage-service';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!hasRole(user, 'admin')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar variables de entorno
    const envVars = {
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ? '✅ Configurado' : '❌ NO configurado',
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ? '✅ Configurado' : '❌ NO configurado',
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? '✅ Configurado' : '❌ NO configurado',
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || '❌ NO configurado',
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || '❌ NO configurado',
      R2_IMAGE_FORMAT: process.env.R2_IMAGE_FORMAT || 'webp (default)',
    };

    // Verificar estado del servicio
    const r2Status = R2StorageService.getStatus();

    // Intentar operación de prueba
    let testResult = {
      canUpload: false,
      error: null as string | null
    };

    if (r2Status.configured) {
      try {
        const testBuffer = Buffer.from(`Test de configuración - ${new Date().toISOString()}`);
        const testKey = `test/config-check-${Date.now()}.txt`;
        const uploadUrl = await R2StorageService.uploadFile(testBuffer, testKey, 'text/plain');

        // Intentar eliminar
        await R2StorageService.deleteFile(uploadUrl);

        testResult.canUpload = true;
      } catch (error: any) {
        testResult.error = error.message;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      environment: process.env.NODE_ENV || 'development',
      envVars,
      r2Status,
      testResult,
      recommendations: !r2Status.configured ? [
        '⚠️ R2 NO está configurado correctamente',
        'Verifica que todas las variables de entorno estén configuradas en tu servidor de producción',
        'Las variables deben estar en el archivo .env del servidor o en las variables de entorno del sistema'
      ] : testResult.canUpload ? [
        '✅ R2 está configurado y funcionando correctamente'
      ] : [
        `⚠️ R2 está configurado pero falló la prueba: ${testResult.error}`,
        'Verifica que las credenciales sean correctas',
        'Verifica que el bucket exista y tenga los permisos correctos'
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al verificar configuración',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
