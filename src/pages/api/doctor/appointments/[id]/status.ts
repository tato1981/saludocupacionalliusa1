import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../../lib/auth';
import { db } from '../../../../../lib/database';

// PUT - Cambiar estado de una cita
export const PUT: APIRoute = async ({ params, request, cookies }) => {
  try {
    console.log('🔄 PUT /api/doctor/appointments/[id]/status - Iniciando...');
    
    // Debug de autenticación
    const token = cookies.get('auth-token')?.value;
    console.log('🍪 Token presente:', !!token);
    
    // Verificar autenticación
    const user = requireAuth(cookies);
    console.log('👤 Usuario autenticado:', user ? `${user.name} (${user.role})` : 'NO USER');
    
    if (!user || user.role !== 'doctor') {
      console.log('❌ Acceso denegado - User:', user, 'Role:', user?.role);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No autorizado',
        debug: {
          hasUser: !!user,
          userRole: user?.role,
          isDoctor: user?.role === 'doctor'
        }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const appointmentId = params.id;
    if (!appointmentId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de cita requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { status } = body;

    // Validar estado
    const validStatuses = ['programada', 'en_progreso', 'completada', 'cancelada', 'no_asistio'];
    if (!status || !validStatuses.includes(status)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Estado inválido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que la cita existe y pertenece a este doctor
    const [appointmentRows] = await db.execute(
      'SELECT * FROM appointments WHERE id = ? AND doctor_id = ?',
      [appointmentId, user.id]
    );

    const appointments = appointmentRows as any[];
    if (appointments.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Cita no encontrada o no tienes permisos para modificarla'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Restricción: No permitir completar cita si no tiene historia médica asociada
    if (status === 'completada') {
      let [historyRows] = await db.execute(
        'SELECT id FROM medical_histories WHERE appointment_id = ? LIMIT 1',
        [appointmentId]
      );
      
      let histories = historyRows as any[];

      // Auto-correction: Si no hay historia vinculada, buscar una huérfana reciente del mismo paciente y doctor
      // Esto sucede si el doctor creó la historia desde el perfil del paciente en lugar de la cita
      if (histories.length === 0) {
        const appointment = appointments[0];
        const [orphanRows] = await db.execute(
          `SELECT id FROM medical_histories 
           WHERE patient_id = ? 
           AND doctor_id = ? 
           AND appointment_id IS NULL 
           AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) 
           ORDER BY created_at DESC LIMIT 1`,
          [appointment.patient_id, user.id]
        );
        
        const orphans = orphanRows as any[];
        if (orphans.length > 0) {
            // Vincular la historia encontrada a esta cita
            await db.execute('UPDATE medical_histories SET appointment_id = ? WHERE id = ?', [appointmentId, orphans[0].id]);
            histories = orphans; // Considerarla encontrada para pasar la validación
            console.log(`✅ Historia médica ${orphans[0].id} vinculada automáticamente a la cita ${appointmentId}`);
        }
      }

      if (histories.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          message: 'No se puede completar la cita sin una historia médica registrada. La cita permanecerá en progreso.',
          code: 'MISSING_MEDICAL_HISTORY'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Actualizar el estado de la cita
    await db.execute(
      'UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, appointmentId]
    );

    // Si la cita se completa, actualizar también la solicitud de examen asociada
    if (status === 'completada') {
      const appointment = appointments[0];

      // Obtener el documento del paciente
      const [patientRows] = await db.execute(
        'SELECT document_number FROM patients WHERE id = ?',
        [appointment.patient_id]
      );

      if ((patientRows as any[]).length > 0) {
        const patientDocument = (patientRows as any[])[0].document_number;

        // Actualizar solicitudes de examen pendientes o agendadas a completadas
        await db.execute(
          `UPDATE exam_requests
           SET status = 'completed', updated_at = CURRENT_TIMESTAMP
           WHERE patient_document = ?
           AND status IN ('pending', 'scheduled')`,
          [patientDocument]
        );

        console.log(`✅ Solicitudes de examen actualizadas a 'completed' para paciente: ${patientDocument}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Estado de la cita actualizado correctamente',
      data: { appointmentId, newStatus: status }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en PUT /api/doctor/appointments/[id]/status:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
