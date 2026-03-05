import type { APIRoute } from 'astro';
import { db } from '../../../../../lib/database';
import { requireAuth, hasRole } from '../../../../../lib/auth';

export const GET: APIRoute = async ({ params, cookies }) => {
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

    const { id } = params;

    if (!id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de paciente requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener el documento del paciente
    const [patientRows] = await db.execute(
      'SELECT document_number FROM patients WHERE id = ?',
      [id]
    );

    const patients = patientRows as any[];
    if (patients.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Paciente no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const documentNumber = patients[0].document_number;

    // Verificar si existe una solicitud activa (pending o scheduled)
    // Excluir solicitudes que tengan citas completadas
    const [requestRows] = await db.execute(
      `SELECT
        er.id,
        er.status,
        er.exam_type,
        er.created_at,
        er.appointment_id,
        c.name as company_name,
        a.status as appointment_status
       FROM exam_requests er
       LEFT JOIN companies c ON er.company_id = c.id
       LEFT JOIN appointments a ON er.appointment_id = a.id
       WHERE er.patient_document = ?
       AND er.status IN ('pending', 'scheduled')
       AND (a.id IS NULL OR a.status NOT IN ('completada', 'cancelada', 'no_asistio'))
       ORDER BY er.created_at DESC
       LIMIT 1`,
      [documentNumber]
    );

    const requests = requestRows as any[];
    let hasActiveRequest = requests.length > 0;

    if (hasActiveRequest) {
      const activeRequest = requests[0] as any;
      if (!activeRequest.appointment_id) {
        const [completedApptRows] = await db.execute(
          `SELECT COUNT(*) as count
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           WHERE p.document_number = ?
           AND a.status IN ('completada', 'cancelada', 'no_asistio')
           AND a.appointment_date >= ?`,
          [documentNumber, activeRequest.created_at]
        );

        const completedCount = (completedApptRows as any[])[0]?.count || 0;

        if (completedCount > 0) {
          await db.execute(
            `UPDATE exam_requests
             SET status = 'completed', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [activeRequest.id]
          );
          hasActiveRequest = false;
        }
      }
    }

    // Auto-corrección: si encontramos solicitudes con citas completadas, actualizarlas
    const [oldRequests] = await db.execute(
      `SELECT er.id
       FROM exam_requests er
       LEFT JOIN appointments a ON er.appointment_id = a.id
       WHERE er.patient_document = ?
       AND er.status IN ('pending', 'scheduled')
       AND a.status IN ('completada', 'cancelada', 'no_asistio')`,
      [documentNumber]
    );

    if ((oldRequests as any[]).length > 0) {
      const ids = (oldRequests as any[]).map((r: any) => r.id);
      await db.execute(
        `UPDATE exam_requests
         SET status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${ids.join(',')})`,
        []
      );
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        hasActiveRequest,
        request: hasActiveRequest ? requests[0] : null
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error al verificar solicitudes activas:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al verificar solicitudes activas'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
