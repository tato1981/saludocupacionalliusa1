import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 Storage Service
 *
 * Servicio para manejar la subida, eliminación y gestión de archivos
 * en Cloudflare R2 (S3-compatible).
 *
 * @author Sistema de Salud Ocupacional
 * @version 2.0.0
 */
class R2Storage {
  private s3: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor() {
    const accountId = import.meta.env.R2_ACCOUNT_ID;
    const accessKeyId = import.meta.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = import.meta.env.R2_SECRET_ACCESS_KEY;
    
    this.bucket = import.meta.env.R2_BUCKET_NAME;
    this.publicUrlBase = import.meta.env.R2_PUBLIC_URL;

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucket || !this.publicUrlBase) {
      console.error('❌ R2 Storage: Missing environment variables');
    }

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!
      }
    });
    
    console.log('✅ R2 Storage: Initialized');
  }

  /**
   * Sube un archivo a R2
   */
  async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    console.log(`📤 Upload Starting: key=${key}, contentType=${contentType}`);

    try {
      // Normalizar key (quitar slash inicial si existe)
      const cleanKey = key.replace(/^\/+/, '');

      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType
      }));

      const publicUrl = `${this.publicUrlBase}/${cleanKey}`;
      console.log(`   ✅ Upload Success: ${cleanKey} -> ${publicUrl}`);

      return publicUrl;
    } catch (error: any) {
      console.error(`   ❌ Upload Error for key="${key}":`, error);
      throw error;
    }
  }

  /**
   * Elimina un archivo de R2
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      let key = fileUrl;
      // Remover el prefijo de URL pública si existe
      if (fileUrl.startsWith(this.publicUrlBase)) {
        key = fileUrl.replace(`${this.publicUrlBase}/`, '');
      } else if (fileUrl.startsWith('/')) {
        key = fileUrl.substring(1);
      }
      
      // Remover 'uploads/' si está al inicio (por si acaso se pasa así de la versión anterior)
      // Aunque en R2 no usaremos 'uploads/' como prefijo obligatorio, si la key lo trae, lo mantenemos o quitamos según estructura?
      // La estructura pedida es "patients/..." o "doctors/...". 
      // Si viene "uploads/patients/...", tal vez deberíamos limpiarlo si migramos de local.
      // Pero asumiremos que las keys nuevas ya vienen limpias.
      
      console.log(`🗑️ Deleting file: ${key}`);

      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key
      }));
      
      console.log(`   ✅ Delete Success: ${key}`);
    } catch (error: any) {
      console.error(`   ❌ Delete Error for url="${fileUrl}":`, error);
      // No lanzamos error para no romper flujos si el archivo ya no existe
    }
  }

  /**
   * Copia un archivo en R2 (usado para mover de temp a permanente)
   */
  async copyFile(sourceUrl: string, destinationKey: string): Promise<string> {
    try {
       let sourceKey = sourceUrl;
       if (sourceUrl.startsWith(this.publicUrlBase)) {
         sourceKey = sourceUrl.replace(`${this.publicUrlBase}/`, '');
       }
       
       const cleanDestKey = destinationKey.replace(/^\/+/, '');

       console.log(`📋 Copying: ${sourceKey} -> ${cleanDestKey}`);

       // CopyObjectCommand requiere el source como "Bucket/Key"
       // Ojo: En algunos SDK/providers, CopySource debe ser "bucket/key"
       // En AWS S3 standard es así. En R2 debería ser igual.
       
       await this.s3.send(new CopyObjectCommand({
         Bucket: this.bucket,
         CopySource: `${this.bucket}/${sourceKey}`,
         Key: cleanDestKey
       }));

       const publicUrl = `${this.publicUrlBase}/${cleanDestKey}`;
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
  async getImageUrl(path: string): Promise<string | null> {
    try {
      const key = path.replace(this.publicUrlBase + '/', '');
      await this.s3.send(new HeadObjectCommand({ 
        Bucket: this.bucket, 
        Key: key 
      }));
      return path;
    } catch (e) {
      return null;
    }
  }

  getStatus() {
    return {
      configured: true,
      bucket: this.bucket,
      publicUrl: this.publicUrlBase,
      type: 'R2'
    };
  }
}

export const StorageService = new R2Storage();
