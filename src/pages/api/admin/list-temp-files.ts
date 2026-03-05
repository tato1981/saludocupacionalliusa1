/**
 * Endpoint para listar archivos temporales en R2
 *
 * Permite ver qué archivos temporales existen, su antigüedad,
 * y si están siendo usados en la base de datos.
 *
 * Acceso: GET /api/admin/list-temp-files
 */

import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { db } from '@/lib/database';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    // Solo superadmin y admin pueden ver
    const user = requireAuth(cookies);
    if (!hasRole(user, 'admin')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado. Solo admin/superadmin pueden ver archivos temporales.'
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

    // Listar archivos temporales
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: 'temp_',
    });

    const listResponse = await client.send(listCommand);
    const tempFiles = listResponse.Contents || [];

    if (tempFiles.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: '✅ No hay archivos temporales en R2',
        files: [],
        stats: {
          total: 0,
          inUse: 0,
          orphan: 0,
          oldOrphan: 0
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener archivos en uso en la BD
    const [patientFiles] = await db.execute(`
      SELECT id, name, photo_path, signature_path
      FROM patients
      WHERE photo_path LIKE "%temp_%" OR signature_path LIKE "%temp_%"
    `);
    const [doctorFiles] = await db.execute(`
      SELECT id, name, signature_path
      FROM users
      WHERE role = "doctor" AND signature_path LIKE "%temp_%"
    `);

    const filesInUseMap = new Map<string, any>();

    (patientFiles as any[]).forEach(row => {
      if (row.photo_path && row.photo_path.includes('temp_')) {
        const key = row.photo_path.replace(`${publicUrl}/`, '');
        filesInUseMap.set(key, {
          type: 'patient_photo',
          recordId: row.id,
          recordName: row.name,
          url: row.photo_path
        });
      }
      if (row.signature_path && row.signature_path.includes('temp_')) {
        const key = row.signature_path.replace(`${publicUrl}/`, '');
        filesInUseMap.set(key, {
          type: 'patient_signature',
          recordId: row.id,
          recordName: row.name,
          url: row.signature_path
        });
      }
    });

    (doctorFiles as any[]).forEach(row => {
      if (row.signature_path && row.signature_path.includes('temp_')) {
        const key = row.signature_path.replace(`${publicUrl}/`, '');
        filesInUseMap.set(key, {
          type: 'doctor_signature',
          recordId: row.id,
          recordName: row.name,
          url: row.signature_path
        });
      }
    });

    // Analizar archivos
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 horas

    const stats = {
      total: tempFiles.length,
      inUse: 0,
      orphan: 0,
      oldOrphan: 0
    };

    const fileDetails = tempFiles.map(file => {
      if (!file.Key) return null;

      const inUse = filesInUseMap.get(file.Key);
      const ageHours = file.LastModified
        ? Math.floor((now.getTime() - file.LastModified.getTime()) / (1000 * 60 * 60))
        : 0;
      const isOld = file.LastModified && file.LastModified < cutoffTime;

      if (inUse) {
        stats.inUse++;
      } else {
        stats.orphan++;
        if (isOld) stats.oldOrphan++;
      }

      return {
        key: file.Key,
        url: `${publicUrl}/${file.Key}`,
        size: file.Size,
        sizeKB: file.Size ? Math.round(file.Size / 1024) : 0,
        lastModified: file.LastModified,
        ageHours,
        status: inUse
          ? '🛡️ EN USO (protegido)'
          : isOld
            ? '⚠️ HUÉRFANO ANTIGUO (>24h - se puede eliminar)'
            : '🕐 HUÉRFANO RECIENTE (<24h - esperar)',
        canDelete: !inUse && isOld,
        inUse: inUse ? {
          type: inUse.type,
          recordId: inUse.recordId,
          recordName: inUse.recordName,
          warning: '⚠️ Este archivo está referenciado en la BD. NO eliminar sin mover primero.'
        } : null
      };
    }).filter(f => f !== null);

    return new Response(JSON.stringify({
      success: true,
      message: `Se encontraron ${stats.total} archivo(s) temporal(es)`,
      stats,
      files: fileDetails,
      actions: {
        cleanup: stats.oldOrphan > 0
          ? `Puedes eliminar ${stats.oldOrphan} archivo(s) huérfano(s) antiguo(s) usando: GET /api/admin/cleanup-temp-files`
          : 'No hay archivos antiguos para limpiar',
        warnings: stats.inUse > 0
          ? [
              `⚠️ Hay ${stats.inUse} archivo(s) temporal(es) en uso en la BD.`,
              'Esto indica que el proceso de mover archivos falló.',
              'Contacta al administrador para revisar estos registros.'
            ]
          : []
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error listando archivos temporales:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error listando archivos',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
