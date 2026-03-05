// API endpoint para crear nueva historia médica ocupacional
import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth.js';
import { MedicalHistoryService } from '../../../../lib/medical-history-service.js';
import { db } from '../../../../lib/database.js';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!user || user.role !== 'doctor') {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener datos del cuerpo de la petición (manejo robusto de JSON)
    let data: any;
    try {
      data = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        message: 'JSON inválido o cuerpo vacío'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar datos requeridos
    if (!data.patient_id || !data.symptoms || !data.diagnosis || !data.treatment) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Faltan datos requeridos: patient_id, symptoms, diagnosis, treatment'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Asegurar que el doctor_id sea el usuario autenticado
    data.doctor_id = user.id;

    // Auto-link: Si no viene appointment_id, buscar si hay una cita activa para este paciente y doctor
    if (!data.appointment_id) {
      try {
        const [activeAppts] = await db.execute(
          `SELECT id FROM appointments 
           WHERE patient_id = ? AND doctor_id = ? 
           AND status IN ('programada', 'en_progreso') 
           ORDER BY appointment_date DESC LIMIT 1`,
          [data.patient_id, user.id]
        );
        
        const appts = activeAppts as any[];
        if (appts.length > 0) {
          data.appointment_id = appts[0].id;
          console.log(`🔗 Auto-linking medical history to appointment ${data.appointment_id}`);
        }
      } catch (dbError) {
        console.warn('Error trying to auto-link appointment:', dbError);
        // No fallamos, simplemente seguimos sin vincular
      }
    }

    // Crear la historia médica usando el servicio
    const result = await MedicalHistoryService.createMedicalHistory(data);

    if (result.success) {
      // Actualizar solicitud de examen a completada cuando se crea la historia médica
      try {
        const [patientRows] = await db.execute(
          'SELECT document_number FROM patients WHERE id = ?',
          [data.patient_id]
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
      } catch (updateError) {
        console.warn('Error actualizando solicitud de examen:', updateError);
        // No fallamos, solo registramos el error
      }

      return new Response(JSON.stringify({
        success: true,
        message: result.message,
        data: result.medical_history,
        calculated_data: result.calculated_data
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message || 'Error al crear la historia médica'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en POST /api/doctor/medical-history/create:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};