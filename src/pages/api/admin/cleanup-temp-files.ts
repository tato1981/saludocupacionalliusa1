/**
 * Endpoint de limpieza de archivos temporales en R2
 *
 * Este script elimina archivos temporales huérfanos (sin referencias en BD)
 * con más de 24 horas de antigüedad.
 *
 * IMPORTANTE: NO elimina archivos permanentes en patients/ o doctors/
 *
 * Acceso: GET /api/admin/cleanup-temp-files
 */

import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { db } from '@/lib/database';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    // Solo superadmin puede ejecutar limpieza
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado. Solo superadmin puede ejecutar limpieza.'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar configuración de R2
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
      return new Response(JSON.stringify({
        success: false,
        message: 'R2 no está configurado correctamente'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Crear cliente S3
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Listar todos los objetos que empiecen con "temp_"
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'temp_',
    });

    const listResponse = await client.send(listCommand);
    const tempFiles = listResponse.Contents || [];

    if (tempFiles.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No hay archivos temporales para limpiar',
        stats: {
          found: 0,
          checked: 0,
          deleted: 0,
          protected: 0,
          errors: 0
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener URLs de archivos en uso en la BD
    const [patientPhotos] = await db.execute(
      'SELECT photo_path, signature_path FROM patients WHERE photo_path LIKE "%temp_%" OR signature_path LIKE "%temp_%"'
    );
    const [doctorSignatures] = await db.execute(
      'SELECT signature_path FROM users WHERE role = "doctor" AND signature_path LIKE "%temp_%"'
    );

    const filesInUse = new Set<string>();
    (patientPhotos as any[]).forEach(row => {
      if (row.photo_path && row.photo_path.includes('temp_')) {
        filesInUse.add(row.photo_path.replace(`${publicUrl}/`, ''));
      }
      if (row.signature_path && row.signature_path.includes('temp_')) {
        filesInUse.add(row.signature_path.replace(`${publicUrl}/`, ''));
      }
    });
    (doctorSignatures as any[]).forEach(row => {
      if (row.signature_path && row.signature_path.includes('temp_')) {
        filesInUse.add(row.signature_path.replace(`${publicUrl}/`, ''));
      }
    });

    // Procesar archivos temporales
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 horas atrás

    const stats = {
      found: tempFiles.length,
      checked: 0,
      deleted: 0,
      protected: 0,
      tooNew: 0,
      errors: 0
    };

    const deletedFiles: string[] = [];
    const protectedFiles: string[] = [];
    const tooNewFiles: string[] = [];
    const errorFiles: string[] = [];

    for (const file of tempFiles) {
      if (!file.Key) continue;

      stats.checked++;

      // Verificar si está en uso en la BD
      if (filesInUse.has(file.Key)) {
        stats.protected++;
        protectedFiles.push(file.Key);
        console.log(`🛡️ Archivo protegido (en uso en BD): ${file.Key}`);
        continue;
      }

      // Verificar antigüedad (más de 24 horas)
      if (file.LastModified && file.LastModified > cutoffTime) {
        stats.tooNew++;
        tooNewFiles.push(file.Key);
        console.log(`⏰ Archivo muy reciente (< 24h): ${file.Key}`);
        continue;
      }

      // Eliminar archivo temporal huérfano
      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: file.Key,
        });
        await client.send(deleteCommand);

        stats.deleted++;
        deletedFiles.push(file.Key);
        console.log(`🗑️ Archivo temporal eliminado: ${file.Key}`);
      } catch (error: any) {
        stats.errors++;
        errorFiles.push(file.Key);
        console.error(`❌ Error eliminando ${file.Key}:`, error.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Limpieza completada. ${stats.deleted} archivos eliminados, ${stats.protected} protegidos.`,
      stats,
      details: {
        deleted: deletedFiles,
        protected: protectedFiles,
        tooNew: tooNewFiles,
        errors: errorFiles
      },
      recommendations: stats.protected > 0 ? [
        `Hay ${stats.protected} archivo(s) temporal(es) en uso en la BD.`,
        'Esto puede indicar que falló el proceso de mover archivos temporales a permanentes.',
        'Revisa los registros afectados y considera mover manualmente los archivos.'
      ] : []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error en limpieza de archivos temporales:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error ejecutando limpieza',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
