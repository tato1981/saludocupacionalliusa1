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

async function checkPatientsCompanies() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    console.log('Pacientes con historiales médicos recientes:\n');
    const [rows] = await connection.query(`
      SELECT
        p.id as patient_id,
        p.name,
        p.document_number,
        p.company_id,
        c.name as company_name,
        COUNT(mh.id) as num_histories,
        MAX(mh.id) as last_history_id,
        MAX(mh.aptitude_status) as last_aptitude
      FROM patients p
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN medical_histories mh ON p.id = mh.patient_id
      GROUP BY p.id
      HAVING num_histories > 0
      ORDER BY last_history_id DESC
      LIMIT 10
    `);

    console.log(`Total: ${rows.length} pacientes con historiales\n`);
    rows.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name} (${r.document_number})`);
      console.log(`   Company ID: ${r.company_id} - ${r.company_name || 'Sin empresa'}`);
      console.log(`   Historiales: ${r.num_histories}`);
      console.log(`   Último historial ID: ${r.last_history_id}`);
      console.log(`   Último concepto: ${r.last_aptitude}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkPatientsCompanies();
