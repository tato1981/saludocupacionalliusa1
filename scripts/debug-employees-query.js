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

async function debugEmployeesQuery() {
  const connection = await mysql.createConnection(dbConfig);

  try {
    // Primero obtener un company_id válido
    const [companies] = await connection.query('SELECT id FROM companies LIMIT 1');

    if (companies.length === 0) {
      console.log('No hay empresas en la base de datos');
      return;
    }

    const companyId = companies[0].id;
    console.log(`Testing con company_id: ${companyId}\n`);

    // Exactamente la misma query que usa employees.astro
    const [employees] = await connection.execute(
      `SELECT p.*,
              p.occupation as position,
              mh.aptitude_status as last_exam_concept,
              mh.id as last_history_id
       FROM patients p
       LEFT JOIN (
           SELECT patient_id, aptitude_status, id
           FROM medical_histories
           WHERE id IN (
               SELECT MAX(id)
               FROM medical_histories
               GROUP BY patient_id
           )
       ) mh ON p.id = mh.patient_id
       WHERE p.company_id = ?
       ORDER BY p.name ASC`,
      [companyId]
    );

    console.log(`Se encontraron ${employees.length} empleados\n`);
    console.log('='.repeat(80));

    employees.forEach((emp, index) => {
      console.log(`\n${index + 1}. ${emp.name} (${emp.document_number})`);
      console.log(`   patient_id: ${emp.id}`);
      console.log(`   last_history_id: ${emp.last_history_id}`);
      console.log(`   last_exam_concept: "${emp.last_exam_concept}"`);
      console.log(`   Valor es NULL: ${emp.last_exam_concept === null}`);
      console.log(`   Tipo: ${typeof emp.last_exam_concept}`);

      if (emp.last_history_id) {
        console.log(`   ✓ Tiene historial médico (ID: ${emp.last_history_id})`);
      } else {
        console.log(`   ✗ NO tiene historial médico`);
      }

      if (emp.last_exam_concept) {
        console.log(`   ✓ Concepto: ${emp.last_exam_concept}`);
      } else if (emp.last_history_id) {
        console.log(`   ⚠️  PROBLEMA: Tiene historial pero aptitude_status es NULL`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('\nVerificando todos los historiales médicos para estos pacientes:\n');

    // Obtener todos los historiales de estos pacientes
    const patientIds = employees.map(e => e.id).filter(id => id);

    if (patientIds.length > 0) {
      const [allHistories] = await connection.query(
        `SELECT
          mh.id,
          mh.patient_id,
          mh.aptitude_status,
          mh.created_at,
          p.name as patient_name
         FROM medical_histories mh
         LEFT JOIN patients p ON mh.patient_id = p.id
         WHERE mh.patient_id IN (?)
         ORDER BY mh.patient_id, mh.id DESC`,
        [patientIds]
      );

      console.log(`Total de historiales encontrados: ${allHistories.length}\n`);

      let currentPatientId = null;
      allHistories.forEach(h => {
        if (h.patient_id !== currentPatientId) {
          currentPatientId = h.patient_id;
          console.log(`\n--- Paciente: ${h.patient_name} (ID: ${h.patient_id}) ---`);
        }
        console.log(`  Historia ID ${h.id}: aptitude_status="${h.aptitude_status}" (${new Date(h.created_at).toLocaleString('es-ES')})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

console.log('🔍 Debugging consulta de empleados...\n');
debugEmployeesQuery();
