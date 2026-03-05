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

async function checkLatestHistory() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    console.log('Verificando el último historial médico creado:\n');

    const [rows] = await connection.query(`
      SELECT
        mh.id,
        mh.patient_id,
        p.name as patient_name,
        p.document_number,
        mh.aptitude_status,
        mh.restrictions,
        mh.created_at
      FROM medical_histories mh
      LEFT JOIN patients p ON mh.patient_id = p.id
      ORDER BY mh.created_at DESC
      LIMIT 1
    `);

    if (rows.length > 0) {
      const history = rows[0];
      console.log('Último historial médico:');
      console.log('='.repeat(60));
      console.log(`ID: ${history.id}`);
      console.log(`Paciente: ${history.patient_name} (${history.document_number})`);
      console.log(`Fecha creación: ${new Date(history.created_at).toLocaleString('es-ES')}`);
      console.log(`aptitude_status: "${history.aptitude_status}" (tipo: ${typeof history.aptitude_status})`);
      console.log(`Valor es null: ${history.aptitude_status === null}`);
      console.log(`Valor es vacío: ${history.aptitude_status === ''}`);
      console.log(`Restricciones: ${history.restrictions || 'Ninguna'}`);
      console.log('='.repeat(60));
    } else {
      console.log('No se encontraron historiales médicos.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkLatestHistory();
