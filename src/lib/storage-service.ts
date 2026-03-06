import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/**
 * ImageKit Storage Service
 *
 * Servicio para manejar la subida, eliminación y gestión de archivos
 * usando ImageKit CDN.
 *
 * @author Sistema de Salud Ocupacional
 * @version 4.0.0
 */

let ImageKitInstance: any = null;

function getImageKit() {
  if (ImageKitInstance) {
    return ImageKitInstance;
  }

  // Importar usando require para módulo CommonJS
  const ImageKit = require('@imagekit/nodejs');

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

  if (!publicKey || !privateKey || !urlEndpoint) {
    console.error('❌ ImageKit Storage: Missing environment variables');
    console.error('publicKey:', publicKey ? 'SET' : 'MISSING');
    console.error('privateKey:', privateKey ? 'SET' : 'MISSING');
    console.error('urlEndpoint:', urlEndpoint ? 'SET' : 'MISSING');
    throw new Error('ImageKit configuration is incomplete');
  }

  try {
    // Inicialización para ImageKit Node.js SDK v7.x+
    // Nota: NO establecer baseURL con urlEndpoint (CDN), usar el default (api.imagekit.io)
    // urlEndpoint se pasa como propiedad adicional para generación de URLs
    ImageKitInstance = new ImageKit({
      publicKey: publicKey,
      privateKey: privateKey,
      urlEndpoint: urlEndpoint
    });

    console.log('✅ ImageKit Storage: Initialized');
    // console.log('✅ ImageKit instance type:', typeof ImageKitInstance);
    // console.log('✅ ImageKit methods:', Object.keys(ImageKitInstance).slice(0, 10));

    return ImageKitInstance;
  } catch (error) {
    console.error('❌ Error initializing ImageKit:', error);
    throw error;
  }
}

class ImageKitStorage {
  private urlEndpoint: string;

  constructor() {
    const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
    if (!urlEndpoint) {
      throw new Error('IMAGEKIT_URL_ENDPOINT is required');
    }
    this.urlEndpoint = urlEndpoint;
  }

  /**
   * Sube un archivo a ImageKit
   */
  async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    console.log(`📤 Upload Starting: key=${key}, contentType=${contentType}`);

    try {
      const imagekit = getImageKit();

      // Normalizar key (quitar slash inicial si existe)
      const cleanKey = key.replace(/^\/+/, '');

      // Extraer el nombre del archivo y la carpeta
      const fileName = cleanKey.split('/').pop() || cleanKey;
      const folder = cleanKey.substring(0, cleanKey.lastIndexOf('/')) || '';

      // ImageKit Node.js SDK v7.x usa imagekit.files.upload
      // Nota: Convertir buffer a base64 para evitar problemas con FormData en el SDK
      const fileBase64 = buffer.toString('base64');
      
      const uploadResponse = await imagekit.files.upload({
        file: fileBase64,
        fileName: fileName,
        folder: folder || undefined,
        useUniqueFileName: false // Mantener el nombre del archivo
      });

      const publicUrl = uploadResponse.url;
      console.log(`   ✅ Upload Success: ${cleanKey} -> ${publicUrl}`);

      return publicUrl;
    } catch (error: any) {
      console.error(`   ❌ Upload Error for key="${key}":`, error);
      throw error;
    }
  }

  /**
   * Elimina un archivo de ImageKit
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const imagekit = getImageKit();

      // Extraer el path relativo
      let filePath = fileUrl;
      if (fileUrl.startsWith(this.urlEndpoint)) {
        filePath = fileUrl.replace(this.urlEndpoint + '/', '');
      } else if (fileUrl.startsWith('/')) {
        filePath = fileUrl.substring(1);
      }

      console.log(`🗑️ Deleting file: ${filePath}`);

      // Primero, buscar el archivo para obtener su fileId
      // ImageKit Node.js SDK v7.x usa imagekit.assets.list para listar archivos
      const listResponse = await imagekit.assets.list({
        path: filePath
      });

      if (listResponse && listResponse.length > 0) {
        const fileId = listResponse[0].fileId;
        // ImageKit Node.js SDK v7.x usa imagekit.files.delete
        await imagekit.files.delete(fileId);
        console.log(`   ✅ Delete Success: ${filePath}`);
      } else {
        console.log(`   ⚠️ File not found: ${filePath}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Delete Error for url="${fileUrl}":`, error);
      // No lanzamos error para no romper flujos si el archivo ya no existe
    }
  }

  /**
   * Copia un archivo en ImageKit (usado para mover de temp a permanente)
   */
  async copyFile(sourceUrl: string, destinationKey: string): Promise<string> {
    try {
      const imagekit = getImageKit();

      let sourcePath = sourceUrl;
      if (sourceUrl.startsWith(this.urlEndpoint)) {
        sourcePath = sourceUrl.replace(this.urlEndpoint + '/', '');
      }

      const cleanDestKey = destinationKey.replace(/^\/+/, '');

      console.log(`📋 Copying: ${sourcePath} -> ${cleanDestKey}`);

      // Buscar el archivo de origen para obtener su fileId
      console.log(`🔍 Searching for source file: ${sourcePath}`);
      
      const listResponse = await imagekit.assets.list({
        path: sourcePath
      });
      
      let sourceFilePath = '';

      if (listResponse && listResponse.length > 0) {
        // Encontrado directamente
        sourceFilePath = listResponse[0].filePath;
        console.log(`✅ File found direct: ${sourceFilePath}`);
      } else {
        // Fallback: Intentar buscar por nombre de archivo y carpeta contenedora
        const fileName = sourcePath.split('/').pop();
        const folderPath = sourcePath.substring(0, sourcePath.lastIndexOf('/')) || '/';
        
        console.log(`⚠️ Direct lookup failed for ${sourcePath}, trying search by name: "${fileName}" in folder "${folderPath}"`);
        
        // ImageKit search query syntax
        const searchResponse = await imagekit.assets.list({
          searchQuery: `name="${fileName}"`,
          path: folderPath
        });

        if (searchResponse && searchResponse.length > 0) {
           sourceFilePath = searchResponse[0].filePath;
           console.log(`✅ File found via search: ${sourceFilePath}`);
        } else {
           console.error(`❌ File absolutely not found: ${sourcePath}`);
           throw new Error(`Source file not found: ${sourcePath}`);
        }
      }

      // cleanDestKey ya fue declarado arriba
      // const cleanDestKey = destinationKey.replace(/^\/+/, '');
      const folder = cleanDestKey.substring(0, cleanDestKey.lastIndexOf('/')) || '';

      // Copiar archivo usando la función de copia de ImageKit
      // ImageKit Node.js SDK v7.x usa imagekit.files.copy
      console.log(`📋 Executing copy: ${sourceFilePath} -> /${cleanDestKey}`);
      
      const copyResponse = await imagekit.files.copy({
        sourceFilePath: sourceFilePath,
        destinationPath: folder ? `/${folder}` : '/',
        includeFileVersions: false
      });

      const publicUrl = `${this.urlEndpoint}/${cleanDestKey}`;
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
      const imagekit = getImageKit();

      let path = filePath;

      // Si es una URL completa de ImageKit, retornarla
      if (filePath.startsWith(this.urlEndpoint)) {
        return filePath;
      }

      // Si es una URL completa de otro origen, retornarla
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
      }

      // Limpiar el path
      if (filePath.startsWith('/')) {
        path = filePath.substring(1);
      }

      // Buscar el archivo en ImageKit
      const listResponse = await imagekit.assets.list({
        path: path
      });

      if (listResponse && listResponse.length > 0) {
        return listResponse[0].url;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  getStatus() {
    return {
      configured: true,
      urlEndpoint: this.urlEndpoint,
      type: 'ImageKit'
    };
  }
}

export const StorageService = new ImageKitStorage();
