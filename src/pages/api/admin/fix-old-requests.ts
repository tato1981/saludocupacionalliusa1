import type { APIRoute } from 'astro';
import { db } from '../../../lib/database';
import { requireAuth, hasRole } from '../../../lib/auth';

// Endpoint temporal para corregir solicitudes antiguas
export const POST: APIRoute = async ({ cookies }) => {
  try {
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('🔧 Iniciando corrección de solicitudes antiguas...');

    // 1. Actualizar solicitudes con citas completadas
    const [result1] = await db.execute(
      `UPDATE exam_requests er
       INNER JOIN appointments a ON er.appointment_id = a.id
       SET er.status = 'completed', er.updated_at = CURRENT_TIMESTAMP
       WHERE er.status IN ('pending', 'scheduled')
       AND a.status IN ('completada', 'cancelada', 'no_asistio')`
    );

    const updated1 = (result1 as any).affectedRows || 0;
    console.log(`✅ Actualizadas ${updated1} solicitudes con citas completadas/canceladas`);

    // 2. Actualizar solicitudes que tienen historias médicas pero están en pending/scheduled
    const [result2] = await db.execute(
      `UPDATE exam_requests er
       INNER JOIN patients p ON er.patient_document = p.document_number
       INNER JOIN medical_histories mh ON p.id = mh.patient_id
       SET er.status = 'completed', er.updated_at = CURRENT_TIMESTAMP
       WHERE er.status IN ('pending', 'scheduled')
       AND mh.created_at >= er.created_at
       AND NOT EXISTS (
         SELECT 1 FROM exam_requests er2
         WHERE er2.patient_document = er.patient_document
         AND er2.id = er.id
         AND er2.appointment_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM appointments a2
           WHERE a2.id = er2.appointment_id
           AND a2.status NOT IN ('completada', 'cancelada', 'no_asistio')
         )
       )`
    );

    const updated2 = (result2 as any).affectedRows || 0;
    console.log(`✅ Actualizadas ${updated2} solicitudes con historias médicas registradas`);

    // 3. Obtener resumen de solicitudes restantes
    const [remaining] = await db.execute(
      `SELECT COUNT(*) as count
       FROM exam_requests
       WHERE status IN ('pending', 'scheduled')`
    );

    const remainingCount = (remaining as any[])[0]?.count || 0;

    return new Response(JSON.stringify({
      success: true,
      message: 'Corrección completada',
      data: {
        updatedWithCompletedAppointments: updated1,
        updatedWithMedicalHistories: updated2,
        totalUpdated: updated1 + updated2,
        remainingActiveRequests: remainingCount
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error corrigiendo solicitudes:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al corregir solicitudes',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
