/**
 * Script para encontrar referencias a firmas antiguas
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function findOldSignatureReferences() {
  console.log('🔍 Buscando referencias a firma antigua signature_1772567783579.png...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const oldSignature = 'signature_1772567783579.png';
    const oldSignaturePattern = '%signature_1772567783579%';

    // Buscar en users (doctores)
    console.log('📋 Buscando en tabla users...');
    const [users] = await connection.execute(
      `SELECT id, name, role, signature_path
       FROM users
       WHERE signature_path LIKE ?`,
      [oldSignaturePattern]
    );

    if (users.length > 0) {
      console.log(`✅ Encontradas ${users.length} referencias en users:`);
      users.forEach(u => {
        console.log(`   - ID: ${u.id}, Nombre: ${u.name}, Rol: ${u.role}`);
        console.log(`     Firma: ${u.signature_path}`);
      });
    } else {
      console.log('✅ No se encontraron referencias en users.');
    }

    // Buscar en patients
    console.log('\n📋 Buscando en tabla patients...');
    const [patients] = await connection.execute(
      `SELECT id, name, signature_path
       FROM patients
       WHERE signature_path LIKE ?`,
      [oldSignaturePattern]
    );

    if (patients.length > 0) {
      console.log(`✅ Encontradas ${patients.length} referencias en patients:`);
      patients.forEach(p => {
        console.log(`   - ID: ${p.id}, Nombre: ${p.name}`);
        console.log(`     Firma: ${p.signature_path}`);
      });
    } else {
      console.log('✅ No se encontraron referencias en patients.');
    }

    // Buscar en appointments
    console.log('\n📋 Buscando en tabla appointments...');
    const [appointments] = await connection.execute(
      `SELECT id, patient_id, doctor_id, appointment_date, notes
       FROM appointments
       WHERE notes LIKE ?`,
      [oldSignaturePattern]
    );

    if (appointments.length > 0) {
      console.log(`✅ Encontradas ${appointments.length} referencias en appointments (campo notes):`);
      appointments.forEach(a => {
        console.log(`   - ID: ${a.id}, Paciente: ${a.patient_id}, Doctor: ${a.doctor_id}`);
        console.log(`     Fecha: ${a.appointment_date}`);
      });
    } else {
      console.log('✅ No se encontraron referencias en appointments.');
    }

    // Buscar en medical_histories
    console.log('\n📋 Buscando en tabla medical_histories...');
    const [histories] = await connection.execute(
      `SELECT id, patient_id, doctor_id, diagnosis, treatment, notes
       FROM medical_histories
       WHERE diagnosis LIKE ? OR treatment LIKE ? OR notes LIKE ?`,
      [oldSignaturePattern, oldSignaturePattern, oldSignaturePattern]
    );

    if (histories.length > 0) {
      console.log(`✅ Encontradas ${histories.length} referencias en medical_histories:`);
      histories.forEach(h => {
        console.log(`   - ID: ${h.id}, Paciente: ${h.patient_id}, Doctor: ${h.doctor_id}`);
      });
    } else {
      console.log('✅ No se encontraron referencias en medical_histories.');
    }

    // Buscar en work_certificates (nota: esta tabla no almacena URLs de firmas directamente)
    console.log('\n📋 Verificando tabla work_certificates...');
    const [certificates] = await connection.execute(
      `SELECT id, patient_id, doctor_id, certificate_date, verification_code
       FROM work_certificates
       WHERE doctor_id = 31
       ORDER BY certificate_date DESC
       LIMIT 10`
    );

    if (certificates.length > 0) {
      console.log(`ℹ️  Últimos ${certificates.length} certificados del doctor 31:`);
      certificates.forEach(c => {
        console.log(`   - ID: ${c.id}, Fecha: ${c.certificate_date}`);
        console.log(`     Paciente: ${c.patient_id}, Código: ${c.verification_code}`);
      });
      console.log('ℹ️  Las firmas en certificados se obtienen dinámicamente del perfil del doctor.');
    } else {
      console.log('✅ No se encontraron certificados del doctor 31.');
    }

    console.log('\n📊 Resumen:');
    console.log(`   - Users: ${users.length}`);
    console.log(`   - Patients: ${patients.length}`);
    console.log(`   - Appointments: ${appointments.length}`);
    console.log(`   - Medical Histories: ${histories.length}`);
    console.log(`   - Work Certificates: ${certificates.length}`);
    console.log(`   Total: ${users.length + patients.length + appointments.length + histories.length + certificates.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.end();
    console.log('\n✅ Búsqueda completada.');
  }
}

findOldSignatureReferences().catch(console.error);
