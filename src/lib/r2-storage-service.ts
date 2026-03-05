import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
// import dotenv from 'dotenv';
// dotenv.config();

export class R2StorageService {
  private static client: S3Client;
  private static bucketName = process.env.R2_BUCKET_NAME || '';
  private static publicUrl = process.env.R2_PUBLIC_URL || '';

  private static getClient(): S3Client {
    if (!this.client) {
      const accountId = process.env.R2_ACCOUNT_ID;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      
      if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 credentials are not configured');
      }

      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    }
    return this.client;
  }

  /**
   * Sube un archivo a R2
   * @param buffer Buffer del archivo
   * @param key Ruta/Nombre del archivo en el bucket (ej: patients/foto.webp)
   * @param contentType Tipo MIME del archivo
   */
  static async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    try {
      // Validación CRÍTICA: Verificar que TODAS las variables estén configuradas
      if (!this.bucketName) {
        throw new Error('❌ CRÍTICO: R2_BUCKET_NAME no está configurado. Verifica las variables de entorno.');
      }
      if (!this.publicUrl) {
        throw new Error('❌ CRÍTICO: R2_PUBLIC_URL no está configurado. Verifica las variables de entorno.');
      }

      const client = this.getClient();
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      console.log('📤 Subiendo a R2...');
      console.log('   Bucket:', this.bucketName);
      console.log('   Key:', key);
      console.log('   ContentType:', contentType);

      await client.send(command);

      const finalUrl = `${this.publicUrl}/${key}`;
      console.log('✅ R2 Upload Success. URL:', finalUrl);
      return finalUrl;
    } catch (error) {
      console.error('❌ Error uploading file to R2:', error);
      console.error('   Bucket Name:', this.bucketName || '❌ NO CONFIGURADO');
      console.error('   Public URL:', this.publicUrl || '❌ NO CONFIGURADO');
      throw error;
    }
  }

  /**
   * Elimina un archivo de R2
   * @param key Ruta/Nombre del archivo en el bucket
   */
  static async deleteFile(key: string): Promise<void> {
    try {
      // Si recibimos la URL completa, extraemos la key
      if (key.startsWith(this.publicUrl)) {
        key = key.replace(`${this.publicUrl}/`, '');
      } else if (key.startsWith('http')) {
        // Si es otra URL (ej: localhost), intentamos extraer la ruta relativa
        // Esto es para compatibilidad con archivos antiguos
        try {
          const url = new URL(key);
          // Eliminar la barra inicial si existe
          const pathname = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
          // Si la ruta empieza con uploads/, usar eso como key
          if (pathname.startsWith('uploads/')) {
            key = pathname; 
          }
        } catch (e) {
          // Si no es URL válida, asumimos que es la key o un path local
        }
      }

      // Si es un path local de windows, normalizar
      key = key.replace(/\\/g, '/');
      
      const client = this.getClient();
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await client.send(command);
    } catch (error) {
      console.error('Error deleting file from R2:', error);
      // No lanzamos error para no interrumpir flujos si el archivo no existe
    }
  }

  /**
   * Copia un archivo existente en R2 a una nueva ubicación
   * @param sourceKey Ruta origen (ej: patients/temp_123.webp)
   * @param destinationKey Ruta destino (ej: patients/123/photo.webp)
   */
  static async copyFile(sourceKey: string, destinationKey: string): Promise<string> {
    try {
      // Normalizar sourceKey
      if (sourceKey.startsWith(this.publicUrl)) {
        sourceKey = sourceKey.replace(`${this.publicUrl}/`, '');
      } else if (sourceKey.startsWith('http')) {
        try {
          const url = new URL(sourceKey);
          const pathname = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
          // Si la ruta empieza con uploads/, usar eso como key (legacy)
          // O si es una ruta normal de R2, usar el pathname
          sourceKey = pathname;
        } catch (e) {
          // keep as is
        }
      }
      
      // Normalizar destinationKey
      destinationKey = destinationKey.replace(/\\/g, '/');

      const client = this.getClient();
      // Nota: Para R2 y S3, CopySource debe ser "BucketName/Key"
      const copySource = `${this.bucketName}/${sourceKey}`;

      const command = new CopyObjectCommand({
        Bucket: this.bucketName,
        CopySource: copySource,
        Key: destinationKey,
      });

      await client.send(command);

      const finalUrl = `${this.publicUrl}/${destinationKey}`;
      console.log(`✅ R2 Copy Success: ${sourceKey} -> ${destinationKey}`);
      return finalUrl;
    } catch (error) {
      console.error('Error copying file in R2:', error);
      throw error;
    }
  }
}
