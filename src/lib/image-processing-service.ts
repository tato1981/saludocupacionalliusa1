import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export class ImageProcessingService {
  // Configuraciones por defecto
  static readonly PHOTO_CONFIG = {
    // Para fotos de pacientes
    patient: {
      width: 400,
      height: 400,
      quality: 80,
      format: 'webp', // Formato más eficiente
      maxSizeKB: 200 // Máximo 200KB
    },
    // Para certificados (más pequeña)
    certificate: {
      width: 150,
      height: 150,
      quality: 75,
      format: 'webp',
      maxSizeKB: 50 // Máximo 50KB
    }
  };

  /**
   * Procesa y optimiza una imagen
   */
  static async processImage(
    inputBuffer: Buffer, 
    outputPath: string | null, 
    type: 'patient' | 'certificate' = 'patient'
  ): Promise<{ success: boolean; outputPath?: string; buffer?: Buffer; originalSize?: number; finalSize?: number; error?: string }> {
    try {
      const config = this.PHOTO_CONFIG[type];
      const originalSize = inputBuffer.length;

      // Crear directorio si no existe y si se proporciona outputPath
      if (outputPath) {
        const dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });
      }

      // Procesar imagen con Sharp
      const processedBuffer = await sharp(inputBuffer)
        .resize(config.width, config.height, {
          fit: 'cover', // Mantener proporción, recortar si es necesario
          position: 'center'
        })
        .toFormat(config.format as any, { 
          quality: config.quality,
          effort: 6 // Máximo esfuerzo de compresión
        })
        .toBuffer();

      const finalSize = processedBuffer.length;

      // Si la imagen sigue siendo muy grande, reducir calidad gradualmente
      let optimizedBuffer = processedBuffer;
      let currentQuality = config.quality;
      
      while (optimizedBuffer.length > config.maxSizeKB * 1024 && currentQuality > 30) {
        currentQuality -= 10;
        optimizedBuffer = await sharp(inputBuffer)
          .resize(config.width, config.height, {
            fit: 'cover',
            position: 'center'
          })
          .toFormat(config.format as any, { 
            quality: currentQuality,
            effort: 6
          })
          .toBuffer();
      }

      // Guardar imagen optimizada si hay outputPath
      if (outputPath) {
        await fs.writeFile(outputPath, optimizedBuffer);
        console.log(`📸 Imagen procesada y guardada en ${outputPath}: ${originalSize} bytes → ${optimizedBuffer.length} bytes (${Math.round((1 - optimizedBuffer.length/originalSize) * 100)}% reducción)`);
      } else {
        console.log(`📸 Imagen procesada en memoria: ${originalSize} bytes → ${optimizedBuffer.length} bytes (${Math.round((1 - optimizedBuffer.length/originalSize) * 100)}% reducción)`);
      }

      return {
        success: true,
        outputPath: outputPath || undefined,
        buffer: optimizedBuffer,
        originalSize,
        finalSize: optimizedBuffer.length
      };

    } catch (error: any) {
      console.error('❌ Error procesando imagen:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generar múltiples tamaños de una imagen
   */
  static async generateMultipleSizes(
    inputBuffer: Buffer,
    basePath: string,
    filename: string
  ): Promise<{ patient?: string; certificate?: string; thumbnail?: string }> {
    const results: any = {};
    
    try {
      // Versión para vista de paciente (400x400)
      const patientPath = path.join(basePath, `${filename}_patient.webp`);
      const patientResult = await this.processImage(inputBuffer, patientPath, 'patient');
      if (patientResult.success) results.patient = patientPath;

      // Versión para certificados (150x150)  
      const certPath = path.join(basePath, `${filename}_cert.webp`);
      const certResult = await this.processImage(inputBuffer, certPath, 'certificate');
      if (certResult.success) results.certificate = certPath;

      // Thumbnail muy pequeño (80x80)
      const thumbPath = path.join(basePath, `${filename}_thumb.webp`);
      const thumbBuffer = await sharp(inputBuffer)
        .resize(80, 80, { fit: 'cover', position: 'center' })
        .toFormat('webp', { quality: 60 })
        .toBuffer();
      await fs.writeFile(thumbPath, thumbBuffer);
      results.thumbnail = thumbPath;

      return results;
    } catch (error) {
      console.error('❌ Error generando múltiples tamaños:', error);
      return {};
    }
  }

  /**
   * Limpiar imágenes antiguas
   */
  static async cleanupOldImages(directory: string, daysOld: number = 30): Promise<number> {
    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(directory, file.name);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            deletedCount++;
            console.log(`🗑️ Eliminada imagen antigua: ${file.name}`);
          }
        }
      }
      
      return deletedCount;
    } catch (error) {
      console.error('❌ Error limpiando imágenes:', error);
      return 0;
    }
  }

  /**
   * Obtener estadísticas del directorio
   */
  static async getDirectoryStats(directory: string): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    averageSizeKB: number;
  }> {
    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      let totalSize = 0;
      let fileCount = 0;
      
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(directory, file.name);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileCount++;
        }
      }
      
      return {
        totalFiles: fileCount,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        averageSizeKB: fileCount > 0 ? Math.round(totalSize / fileCount / 1024 * 100) / 100 : 0
      };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return { totalFiles: 0, totalSizeBytes: 0, totalSizeMB: 0, averageSizeKB: 0 };
    }
  }
}