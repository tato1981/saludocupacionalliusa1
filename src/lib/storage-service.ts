import { writeFile, mkdir, unlink, copyFile as fsCopyFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Local Storage Service
 *
 * Servicio para manejar la subida, eliminación y gestión de archivos
 * usando almacenamiento local del servidor.
 *
 * @author Sistema de Salud Ocupacional
 * @version 5.0.0
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class LocalStorage {
  private uploadDir: string;
  private publicPath: string;
  private baseUrl: string;

  constructor() {
    // Directorio donde se guardarán los archivos
    // Prioridad:
    // 1. Variable de entorno UPLOADS_DIR (para producción/Docker)
    // 2. public/uploads (para desarrollo)
    const uploadsDir = process.env.UPLOADS_DIR;

    if (uploadsDir) {
      // Producción: usar ruta absoluta desde variable de entorno
      this.uploadDir = uploadsDir;
    } else {
      // Desarrollo: usar public/uploads relativo al código fuente
      this.uploadDir = join(__dirname, '../../public/uploads');
    }

    this.publicPath = '/uploads';

    // URL base de la aplicación
    this.baseUrl = process.env.APP_BASE_URL || 'http://localhost:4321';

    // Asegurar que el directorio de uploads existe
    this.ensureUploadDir();
  }

  /**
   * Asegura que el directorio de uploads existe
   */
  private async ensureUploadDir(): Promise<void> {
    try {
      await access(this.uploadDir);
    } catch {
      await mkdir(this.uploadDir, { recursive: true });
      console.log('✅ Local Storage: Upload directory created');
    }
  }

  /**
   * Sube un archivo al almacenamiento local
   */
  async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    console.log(`📤 Upload Starting: key=${key}, contentType=${contentType}`);

    try {
      // Normalizar key (quitar slash inicial si existe)
      const cleanKey = key.replace(/^\/+/, '');

      // Ruta completa del archivo
      const filePath = join(this.uploadDir, cleanKey);

      // Crear directorios necesarios
      const fileDir = dirname(filePath);
      await mkdir(fileDir, { recursive: true });

      // Guardar el archivo
      await writeFile(filePath, buffer);

      // URL pública del archivo
      const publicUrl = `${this.baseUrl}${this.publicPath}/${cleanKey}`;
      console.log(`   ✅ Upload Success: ${cleanKey} -> ${publicUrl}`);

      return publicUrl;
    } catch (error: any) {
      console.error(`   ❌ Upload Error for key="${key}":`, error);
      throw error;
    }
  }

  /**
   * Elimina un archivo del almacenamiento local
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      // Extraer el path relativo de la URL
      let filePath = fileUrl;

      if (fileUrl.startsWith(this.baseUrl)) {
        filePath = fileUrl.replace(this.baseUrl + this.publicPath + '/', '');
      } else if (fileUrl.startsWith(this.publicPath)) {
        filePath = fileUrl.replace(this.publicPath + '/', '');
      } else if (fileUrl.startsWith('/')) {
        filePath = fileUrl.substring(1);
      }

      console.log(`🗑️ Deleting file: ${filePath}`);

      // Ruta completa del archivo
      const fullPath = join(this.uploadDir, filePath);

      try {
        await unlink(fullPath);
        console.log(`   ✅ Delete Success: ${filePath}`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.log(`   ⚠️ File not found: ${filePath}`);
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Delete Error for url="${fileUrl}":`, error);
      // No lanzamos error para no romper flujos si el archivo ya no existe
    }
  }

  /**
   * Copia un archivo en el almacenamiento local (usado para mover de temp a permanente)
   */
  async copyFile(sourceUrl: string, destinationKey: string): Promise<string> {
    try {
      // Extraer path de origen
      let sourcePath = sourceUrl;

      if (sourceUrl.startsWith(this.baseUrl)) {
        sourcePath = sourceUrl.replace(this.baseUrl + this.publicPath + '/', '');
      } else if (sourceUrl.startsWith(this.publicPath)) {
        sourcePath = sourceUrl.replace(this.publicPath + '/', '');
      } else if (sourceUrl.startsWith('/')) {
        sourcePath = sourceUrl.substring(1);
      }

      const cleanDestKey = destinationKey.replace(/^\/+/, '');

      console.log(`📋 Copying: ${sourcePath} -> ${cleanDestKey}`);

      // Rutas completas
      const sourceFullPath = join(this.uploadDir, sourcePath);
      const destFullPath = join(this.uploadDir, cleanDestKey);

      // Crear directorios necesarios
      const destDir = dirname(destFullPath);
      await mkdir(destDir, { recursive: true });

      // Copiar archivo
      await fsCopyFile(sourceFullPath, destFullPath);

      // URL pública del archivo copiado
      const publicUrl = `${this.baseUrl}${this.publicPath}/${cleanDestKey}`;
      console.log(`   ✅ Copy Success: ${publicUrl}`);

      return publicUrl;
    } catch (error: any) {
      console.error('❌ Copy Error:', error);
      throw new Error(`Error al copiar archivo: ${error.message}`);
    }
  }

  /**
   * Verifica si un archivo existe y retorna su URL pública
   */
  async getImageUrl(filePath: string): Promise<string | null> {
    try {
      // Si es una URL completa que empieza con la base URL, retornarla
      if (filePath.startsWith(this.baseUrl)) {
        return filePath;
      }

      // Si es una URL completa de otro origen, retornarla
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
      }

      // Limpiar el path
      let path = filePath;
      if (filePath.startsWith(this.publicPath)) {
        path = filePath.replace(this.publicPath + '/', '');
      } else if (filePath.startsWith('/')) {
        path = filePath.substring(1);
      }

      // Verificar si el archivo existe
      const fullPath = join(this.uploadDir, path);

      try {
        await access(fullPath);
        return `${this.baseUrl}${this.publicPath}/${path}`;
      } catch {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  getStatus() {
    return {
      configured: true,
      uploadDir: this.uploadDir,
      publicPath: this.publicPath,
      baseUrl: this.baseUrl,
      type: 'LocalStorage'
    };
  }
}

export const StorageService = new LocalStorage();
