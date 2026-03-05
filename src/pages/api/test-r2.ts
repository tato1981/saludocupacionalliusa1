import type { APIRoute } from 'astro';
import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Endpoint de prueba para verificar la configuración y conectividad de R2
 * Acceder en: /api/test-r2
 */
export const GET: APIRoute = async () => {
  const config = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ? '✅ Configurado' : '❌ NO configurado',
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ? '✅ Configurado' : '❌ NO configurado',
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? '✅ Configurado' : '❌ NO configurado',
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME ? `✅ ${process.env.R2_BUCKET_NAME}` : '❌ NO configurado',
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL ? `✅ ${process.env.R2_PUBLIC_URL}` : '❌ NO configurado',
    R2_PUBLIC_URL_VALID: process.env.R2_PUBLIC_URL && process.env.R2_PUBLIC_URL.startsWith('http') ? '✅ OK' : '⚠️ Puede faltar https://',
    NODE_ENV: process.env.NODE_ENV,
  };

  const results: any = {
    config,
    connection: '⏳ Pending',
    listBuckets: '⏳ Pending',
    listObjects: '⏳ Pending',
    uploadTest: '⏳ Pending',
    publicUrlTest: '⏳ Pending',
    deleteTest: '⏳ Pending',
    errors: []
  };

  try {
    // 1. Verificar credenciales
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('Faltan credenciales de R2');
    }

    // 2. Crear cliente
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    results.connection = '✅ Cliente creado';

    // 3. Listar buckets (para verificar permisos generales)
    try {
      const { Buckets } = await client.send(new ListBucketsCommand({}));
      results.listBuckets = Buckets?.map(b => b.Name) || [];
    } catch (e: any) {
      results.listBuckets = `❌ Error: ${e.message}`;
      results.errors.push({ step: 'listBuckets', error: e.message });
    }

    // 4. Verificar bucket específico
    const bucketName = process.env.R2_BUCKET_NAME;
    if (bucketName) {
      try {
        const { Contents } = await client.send(new ListObjectsV2Command({
          Bucket: bucketName,
          MaxKeys: 5
        }));
        results.listObjects = Contents?.map(o => o.Key) || '✅ Bucket vacío o accesible';
      } catch (e: any) {
        results.listObjects = `❌ Error: ${e.message}`;
        results.errors.push({ step: 'listObjects', error: e.message });
      }

      // 5. Prueba de subida
      const testKey = `test-connectivity-${Date.now()}.txt`;
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: testKey,
          Body: 'R2 Connectivity Test',
          ContentType: 'text/plain'
        }));
        results.uploadTest = `✅ Archivo subido: ${testKey}`;
        
        // 6. Generar URL pública
        if (process.env.R2_PUBLIC_URL) {
            const baseUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
            results.publicUrlTest = `${baseUrl}/${testKey}`;
        }

        // 7. Limpieza (borrar archivo de prueba)
        // Comentado para permitir verificar manualmente la URL
        // await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
        // results.deleteTest = '✅ Archivo borrado (o mantenido para verificación)';

      } catch (e: any) {
        results.uploadTest = `❌ Error: ${e.message}`;
        results.errors.push({ step: 'uploadTest', error: e.message });
      }
    } else {
        results.listObjects = '⚠️ No R2_BUCKET_NAME defined';
    }

  } catch (error: any) {
    results.connection = `❌ Error general: ${error.message}`;
    results.errors.push({ step: 'general', error: error.message });
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: results.errors.length > 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
