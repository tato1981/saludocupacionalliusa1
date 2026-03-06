/**
 * Endpoint de limpieza de archivos temporales locales
 *
 * Este script elimina archivos temporales huérfanos (sin referencias en BD)
 * con más de 24 horas de antigüedad.
 *
 * Acceso: GET /api/admin/cleanup-temp-files
 */

import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { db } from '@/lib/database';
import { StorageService } from '@/lib/storage-service';
import fs from 'fs';
import path from 'path';

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

    const uploadDir = StorageService.getUploadDir();
    const publicUrlBase = '/uploads';

    if (!fs.existsSync(uploadDir)) {
       return new Response(JSON.stringify({
        success: true,
        message: 'No hay directorio de uploads para limpiar',
        stats: { found: 0, deleted: 0 }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Listar archivos temporales en raíz y en subdirectorios de pacientes
    let tempFiles: any[] = [];

    // 1. Buscar en raíz (uploads/)
    if (fs.existsSync(uploadDir)) {
      const rootFiles = fs.readdirSync(uploadDir);
      const rootTempFiles = rootFiles
        .filter(file => file.startsWith('temp_') && fs.statSync(path.join(uploadDir, file)).isFile())
        .map(file => {
          const filePath = path.join(uploadDir, file);
          const stats = fs.statSync(filePath);
          return {
            Key: file,
            LastModified: stats.mtime
          };
        });
      tempFiles = [...tempFiles, ...rootTempFiles];
    }

    // 2. Buscar en patients/ (uploads/patients/)
    const patientsDir = path.join(uploadDir, 'patients');
    if (fs.existsSync(patientsDir)) {
      const patientFolders = fs.readdirSync(patientsDir);
      
      patientFolders.forEach(folder => {
        // Buscar carpetas que empiecen con temp_
        if (folder.startsWith('temp_')) {
          const folderPath = path.join(patientsDir, folder);
          if (fs.statSync(folderPath).isDirectory()) {
             const files = fs.readdirSync(folderPath);
             files.forEach(file => {
               const filePath = path.join(folderPath, file);
               const stats = fs.statSync(filePath);
               tempFiles.push({
                 Key: `patients/${folder}/${file}`,
                 LastModified: stats.mtime
               });
             });
          }
        }
      });
    }

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

    const normalizeKey = (url: string) => {
        if (!url) return '';
        return url.replace(`${publicUrlBase}/`, '').replace(/^\//, '');
    };

    const filesInUse = new Set<string>();
    (patientPhotos as any[]).forEach(row => {
      if (row.photo_path && row.photo_path.includes('temp_')) {
        filesInUse.add(normalizeKey(row.photo_path));
      }
      if (row.signature_path && row.signature_path.includes('temp_')) {
        filesInUse.add(normalizeKey(row.signature_path));
      }
    });
    (doctorSignatures as any[]).forEach(row => {
      if (row.signature_path && row.signature_path.includes('temp_')) {
        filesInUse.add(normalizeKey(row.signature_path));
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
        const filePath = path.join(uploadDir, file.Key);
        fs.unlinkSync(filePath);

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
