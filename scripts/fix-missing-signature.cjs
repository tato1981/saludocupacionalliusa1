/**
 * Script para limpiar referencias a firmas faltantes en doctores
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixMissingSignature() {
  console.log('🔧 Iniciando limpieza de firmas faltantes...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    // 1. Buscar el doctor con documento 31656315
    console.log('🔍 Buscando doctor con documento 31656315...');
    const [doctors] = await connection.execute(
      `SELECT id, name, email, document_number, signature_path
       FROM users
       WHERE document_number = ? AND role = 'doctor'`,
      ['31656315']
    );

    if (doctors.length === 0) {
      console.log('❌ No se encontró ningún doctor con ese documento.');

      // Buscar en pacientes también por si acaso
      console.log('\n🔍 Buscando en pacientes...');
      const [patients] = await connection.execute(
        `SELECT id, name, document_number, signature_path
         FROM patients
         WHERE document_number = ?`,
        ['31656315']
      );

      if (patients.length > 0) {
        console.log(`✅ Encontrado en PACIENTES:`);
        patients.forEach(p => {
          console.log(`   - ID: ${p.id}, Nombre: ${p.name}`);
          console.log(`   - Firma: ${p.signature_path || 'Sin firma'}`);
        });

        // Preguntar si quiere limpiar la referencia
        if (patients[0].signature_path && patients[0].signature_path.includes('signature_31656315')) {
          console.log('\n🧹 Limpiando referencia de firma rota en pacientes...');
          await connection.execute(
            'UPDATE patients SET signature_path = NULL WHERE document_number = ?',
            ['31656315']
          );
          console.log('✅ Referencia limpiada exitosamente en pacientes.');
        }
      } else {
        console.log('❌ Tampoco se encontró en pacientes.');
      }

      await connection.end();
      return;
    }

    const doctor = doctors[0];
    console.log(`✅ Doctor encontrado:`);
    console.log(`   - ID: ${doctor.id}`);
    console.log(`   - Nombre: ${doctor.name}`);
    console.log(`   - Email: ${doctor.email}`);
    console.log(`   - Documento: ${doctor.document_number}`);
    console.log(`   - Firma actual: ${doctor.signature_path || 'Sin firma'}`);

    // 2. Si tiene una referencia a firma que parece estar rota
    if (doctor.signature_path && doctor.signature_path.includes('signature_31656315')) {
      console.log('\n⚠️ La firma actual parece estar rota (archivo no existe en Storage).');
      console.log('🧹 Limpiando referencia de firma...');

      await connection.execute(
        'UPDATE users SET signature_path = NULL WHERE id = ?',
        [doctor.id]
      );

      console.log('✅ Referencia de firma limpiada exitosamente.');
      console.log('ℹ️  El doctor puede volver a subir su firma desde el panel de administración.');
    } else if (!doctor.signature_path) {
      console.log('\n✅ El doctor no tiene firma configurada. No hay nada que limpiar.');
    } else {
      console.log('\n✅ La firma actual parece estar bien. No se requiere acción.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.end();
    console.log('\n✅ Proceso completado.');
  }
}

fixMissingSignature().catch(console.error);
