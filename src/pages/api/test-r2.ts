/**
 * Endpoint de prueba para verificar la configuración de R2 Storage
 *
 * Acceso: GET /api/test-r2
 */

import type { APIRoute } from 'astro';
import { R2StorageService } from '@/lib/r2-storage-service';

export const GET: APIRoute = async () => {
  try {
    const status = R2StorageService.getStatus();

    if (!status.configured) {
      return new Response(JSON.stringify({
        success: false,
        message: 'R2 Storage no está configurado correctamente',
        status: status,
        instructions: {
          step1: 'Ve a https://dash.cloudflare.com',
          step2: 'Accede a R2 Object Storage',
          step3: 'Crea un bucket o usa uno existente',
          step4: 'Genera un API Token con permisos de lectura/escritura',
          step5: 'Configura las siguientes variables en tu archivo .env:',
          variables: [
            'R2_ACCOUNT_ID',
            'R2_ACCESS_KEY_ID',
            'R2_SECRET_ACCESS_KEY',
            'R2_BUCKET_NAME',
            'R2_PUBLIC_URL'
          ]
        }
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intentar subir un archivo de prueba
    const testBuffer = Buffer.from('Test file for R2 configuration');
    const testKey = `test/verification_${Date.now()}.txt`;

    try {
      const uploadUrl = await R2StorageService.uploadFile(testBuffer, testKey, 'text/plain');

      // Eliminar el archivo de prueba
      await R2StorageService.deleteFile(uploadUrl);

      return new Response(JSON.stringify({
        success: true,
        message: '✅ R2 Storage está configurado correctamente y funcionando',
        status: status,
        test: {
          upload: 'OK',
          delete: 'OK',
          testFileUrl: uploadUrl
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (uploadError: any) {
      return new Response(JSON.stringify({
        success: false,
        message: 'R2 Storage configurado pero falló la prueba de subida/eliminación',
        status: status,
        error: uploadError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al verificar R2 Storage',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
