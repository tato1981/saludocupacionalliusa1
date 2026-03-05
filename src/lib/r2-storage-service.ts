/**
 * Cloudflare R2 Storage Service
 *
 * Servicio para manejar la subida, eliminación y gestión de archivos
 * en Cloudflare R2 (compatible con S3).
 *
 * @author Sistema de Salud Ocupacional
 * @version 2.0.0
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';

class R2Storage {
  private client: S3Client | null = null;
  private bucketName: string;
  private publicUrl: string;
  private isConfigured: boolean = false;

  constructor() {
    this.bucketName = process.env.R2_BUCKET_NAME || '';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';

    this.initializeClient();
  }

  /**
   * Inicializa el cliente de S3/R2
   */
  private initializeClient(): void {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    // Verificar que todas las credenciales estén configuradas
    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName || !this.publicUrl) {
      console.warn('⚠️ R2 Storage: Credenciales no configuradas completamente');
      console.warn('   Variables requeridas: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL');
      this.isConfigured = false;
      return;
    }

    try {
      // Crear el endpoint de R2
      const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

      this.client = new S3Client({
        region: 'auto',
        endpoint: endpoint,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      });

      this.isConfigured = true;
      console.log('✅ R2 Storage: Cliente inicializado correctamente');
      console.log(`   Bucket: ${this.bucketName}`);
      console.log(`   URL pública: ${this.publicUrl}`);
    } catch (error) {
      console.error('❌ R2 Storage: Error al inicializar cliente', error);
      this.isConfigured = false;
    }
  }

  /**
   * Verifica si el servicio está configurado correctamente
   */
  private checkConfiguration(): void {
    if (!this.isConfigured || !this.client) {
      throw new Error('R2 Storage no está configurado. Verifica las variables de entorno.');
    }
  }

  /**
   * Sube un archivo a R2
   *
   * @param buffer - Buffer del archivo
   * @param key - Ruta/nombre del archivo en R2 (ej: "patients/123/photo.webp")
   * @param contentType - Tipo MIME del archivo
   * @returns URL pública del archivo subido
   */
  async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    this.checkConfiguration();

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.client!.send(command);

      const publicUrl = `${this.publicUrl}/${key}`;
      console.log(`✅ R2 Upload Success: ${key} -> ${publicUrl}`);

      return publicUrl;
    } catch (error: any) {
      console.error('❌ R2 Upload Error:', error);
      throw error; // Re-throw to be handled by caller
    }
  }

  /**
   * Elimina un archivo de R2
   *
   * @param fileUrl - URL completa del archivo o key relativa
   */
  async deleteFile(fileUrl: string): Promise<void> {
    this.checkConfiguration();

    try {
      // Extraer el key de la URL si es una URL completa
      const key = fileUrl.includes(this.publicUrl)
        ? fileUrl.replace(`${this.publicUrl}/`, '')
        : fileUrl;

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client!.send(command);
      console.log(`✅ R2 Delete: ${key}`);
    } catch (error: any) {
      console.error('❌ R2 Delete Error:', error);
      // No lanzar error si el archivo no existe
      if (error.name !== 'NoSuchKey') {
        console.warn(`⚠️ Error al eliminar archivo de R2 (continuando): ${error.message}`);
      }
    }
  }

  /**
   * Copia un archivo dentro de R2
   *
   * @param sourceUrl - URL o key del archivo origen
   * @param destinationKey - Key del archivo destino
   * @returns URL pública del archivo copiado
   */
  async copyFile(sourceUrl: string, destinationKey: string): Promise<string> {
    this.checkConfiguration();

    try {
      // Extraer el key de la URL si es una URL completa
      const sourceKey = sourceUrl.includes(this.publicUrl)
        ? sourceUrl.replace(`${this.publicUrl}/`, '')
        : sourceUrl;

      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey,
      });

      await this.client!.send(command);

      const publicUrl = `${this.publicUrl}/${destinationKey}`;
      console.log(`✅ R2 Copy: ${sourceKey} -> ${destinationKey}`);

      return publicUrl;
    } catch (error: any) {
      console.error('❌ R2 Copy Error:', error);
      throw new Error(`Error al copiar archivo en R2: ${error.message}`);
    }
  }

  /**
   * Obtiene el estado del servicio
   */
  getStatus(): { configured: boolean; bucket: string; publicUrl: string } {
    return {
      configured: this.isConfigured,
      bucket: this.bucketName,
      publicUrl: this.publicUrl,
    };
  }
}

// Exportar instancia única (singleton)
export const R2StorageService = new R2Storage();
