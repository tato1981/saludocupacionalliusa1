/**
 * Endpoint para listar archivos temporales en almacenamiento local
 *
 * Permite ver qué archivos temporales existen, su antigüedad,
 * y si están siendo usados en la base de datos.
 *
 * Acceso: GET /api/admin/list-temp-files
 */

import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '@/lib/auth';
import { db } from '@/lib/database';
import { StorageService } from '@/lib/storage-service';
import fs from 'fs';
import path from 'path';

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

    const uploadDir = StorageService.getUploadDir();
    const publicUrlBase = '/uploads';

    if (!fs.existsSync(uploadDir)) {
       return new Response(JSON.stringify({
        success: true,
        message: 'No existe el directorio de uploads',
        files: [],
        stats: { total: 0, inUse: 0, orphan: 0, oldOrphan: 0 }
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
            LastModified: stats.mtime,
            Size: stats.size
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
                 LastModified: stats.mtime,
                 Size: stats.size
               });
             });
          }
        }
      });
    }

    if (tempFiles.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: '✅ No hay archivos temporales',
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

    const normalizeKey = (url: string) => {
        if (!url) return '';
        return url.replace(`${publicUrlBase}/`, '').replace(/^\//, '');
    };

    (patientFiles as any[]).forEach(row => {
      if (row.photo_path && row.photo_path.includes('temp_')) {
        const key = normalizeKey(row.photo_path);
        filesInUseMap.set(key, {
          type: 'patient_photo',
          recordId: row.id,
          recordName: row.name,
          url: row.photo_path
        });
      }
      if (row.signature_path && row.signature_path.includes('temp_')) {
        const key = normalizeKey(row.signature_path);
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
        const key = normalizeKey(row.signature_path);
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
        url: `${publicUrlBase}/${file.Key}`,
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
      console.error('Error listing temp files:', error);
      return new Response(JSON.stringify({
        success: false,
        message: 'Error al listar archivos',
        error: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
  }
};
