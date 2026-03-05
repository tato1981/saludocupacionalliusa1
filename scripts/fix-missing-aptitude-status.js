import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'occupational_health'
};

async function fixMissingAptitudeStatus() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('🔍 Buscando historiales médicos sin concepto de aptitud...\n');

    // Obtener todos los historiales con aptitude_status NULL
    const [histories] = await connection.query(`
      SELECT
        mh.id,
        mh.patient_id,
        mh.created_at,
        p.name as patient_name,
        p.document_number,
        mh.restrictions,
        mh.diagnosis
      FROM medical_histories mh
      LEFT JOIN patients p ON mh.patient_id = p.id
      WHERE mh.aptitude_status IS NULL
      ORDER BY mh.created_at DESC
    `);

    if (histories.length === 0) {
      console.log('✅ No se encontraron historiales sin concepto de aptitud.');
      return;
    }

    console.log(`📋 Encontrados ${histories.length} historiales sin concepto de aptitud:\n`);

    // Mostrar los historiales encontrados
    histories.forEach((history, index) => {
      console.log(`${index + 1}. ID: ${history.id}`);
      console.log(`   Paciente: ${history.patient_name} (${history.document_number})`);
      console.log(`   Fecha: ${new Date(history.created_at).toLocaleDateString('es-ES')}`);
      console.log(`   Diagnóstico: ${history.diagnosis ? history.diagnosis.substring(0, 50) + '...' : 'N/A'}`);
      console.log(`   Restricciones: ${history.restrictions || 'Ninguna'}`);
      console.log('');
    });

    console.log('\n🔧 Aplicando corrección automática...\n');
    console.log('Estrategia:');
    console.log('  - Si tiene restricciones → "apto_con_restricciones"');
    console.log('  - Si NO tiene restricciones → "apto"\n');

    let updatedCount = 0;
    let aptosCount = 0;
    let aptosConRestriccionesCount = 0;

    for (const history of histories) {
      let newStatus;

      // Si tiene restricciones, marcar como "apto_con_restricciones"
      // Si no tiene restricciones, marcar como "apto"
      if (history.restrictions && history.restrictions.trim().length > 0) {
        newStatus = 'apto_con_restricciones';
        aptosConRestriccionesCount++;
      } else {
        newStatus = 'apto';
        aptosCount++;
      }

      // Actualizar el registro
      await connection.execute(
        'UPDATE medical_histories SET aptitude_status = ? WHERE id = ?',
        [newStatus, history.id]
      );

      updatedCount++;
      console.log(`✓ ID ${history.id}: ${history.patient_name} → ${newStatus}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migración completada exitosamente\n');
    console.log(`📊 Resumen:`);
    console.log(`   Total actualizado: ${updatedCount}`);
    console.log(`   Marcados como "apto": ${aptosCount}`);
    console.log(`   Marcados como "apto_con_restricciones": ${aptosConRestriccionesCount}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

// Ejecutar la migración
console.log('🚀 Iniciando migración de aptitude_status...\n');
fixMissingAptitudeStatus()
  .then(() => {
    console.log('\n✅ Proceso completado correctamente.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });
