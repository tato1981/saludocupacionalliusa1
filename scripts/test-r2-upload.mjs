import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

async function testR2Upload() {
  console.log('🧪 Probando subida a Cloudflare R2...\n');

  // Verificar variables de entorno
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  console.log('📋 Configuración:');
  console.log(`   Account ID: ${accountId ? '✅ ' + accountId.substring(0, 8) + '...' : '❌ Faltante'}`);
  console.log(`   Access Key ID: ${accessKeyId ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`   Secret Access Key: ${secretAccessKey ? '✅ Configurado' : '❌ Faltante'}`);
  console.log(`   Bucket Name: ${bucketName || '❌ Faltante'}`);
  console.log(`   Public URL: ${publicUrl || '❌ Faltante'}`);

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error('\n❌ Faltan variables de entorno necesarias');
    console.error('   Revisa que .env tenga: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
    process.exit(1);
  }

  try {
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    console.log(`\n🔗 Endpoint: ${endpoint}`);

    const client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    // Crear un archivo de prueba
    const testContent = `Test upload at ${new Date().toISOString()}`;
    const testKey = `test/upload-test-${Date.now()}.txt`;

    console.log(`\n📤 Intentando subir archivo de prueba: ${testKey}`);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain',
    });

    await client.send(command);

    const testUrl = `${publicUrl}/${testKey}`;
    console.log(`\n✅ ¡Subida exitosa!`);
    console.log(`📍 URL pública: ${testUrl}`);
    console.log(`\n🔍 Verifica que el archivo existe:`);
    console.log(`   curl "${testUrl}"`);

  } catch (error) {
    console.error('\n❌ Error al subir a R2:');
    console.error('   Mensaje:', error.message);
    console.error('   Código:', error.code || 'N/A');
    console.error('   Nombre:', error.name || 'N/A');
    if (error.$metadata) {
      console.error('   HTTP Status:', error.$metadata.httpStatusCode);
    }
    if (error.$response) {
      console.error('   Response:', error.$response);
    }
    process.exit(1);
  }
}

testR2Upload();
