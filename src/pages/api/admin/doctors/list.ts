import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole } from '../../../../lib/auth';
import { MigrationService } from '../../../../lib/migration-service';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Asegurar que la base de datos esté actualizada
    await MigrationService.runMigrations();

    const [signatureColumn] = await db.execute('SHOW COLUMNS FROM users WHERE Field = "signature_url"');
    const hasSignatureUrl = Array.isArray(signatureColumn) && signatureColumn.length > 0;

    // Consulta para obtener doctores con información adicional
    const query = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.document_number,
        u.phone,
        u.specialization,
        u.professional_license,
        ${hasSignatureUrl ? 'u.signature_url,' : ''}
        u.is_active,
        u.created_at,
        COUNT(DISTINCT a.patient_id) as patient_count
      FROM users u
      LEFT JOIN appointments a ON u.id = a.doctor_id
      WHERE u.role = 'doctor'
      GROUP BY u.id, u.name, u.email, u.document_number, u.phone, u.specialization, u.professional_license${hasSignatureUrl ? ', u.signature_url' : ''}, u.is_active, u.created_at
      ORDER BY u.name ASC
    `;

    const [doctorsResult] = await db.execute(query);
    const doctors = doctorsResult as any[];

    const formattedDoctors = doctors.map((doctor: any) => ({
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      document_number: doctor.document_number,
      phone: doctor.phone,
      specialization: doctor.specialization || 'Medicina General',
      professional_license: doctor.professional_license,
      signature_url: doctor.signature_url || null,
      is_active: doctor.is_active !== 0,
      patient_count: doctor.patient_count,
      created_at: doctor.created_at
    }));

    return new Response(JSON.stringify({
      success: true,
      data: formattedDoctors,
      message: `Se encontraron ${doctors.length} doctores`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error obteniendo doctores:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
