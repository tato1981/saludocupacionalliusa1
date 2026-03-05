import type { APIRoute } from 'astro';
import { AppointmentService } from '../../../../lib/appointment-service';
import { requireAuth, hasRole } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request, cookies }) => {
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

    // Obtener todas las citas con información detallada, evitando duplicados por múltiples certificados
    const { db } = await import('../../../../lib/database');
    const query = `
      SELECT 
        a.*,
        p.name as patient_name,
        p.document_number as patient_document,
        COALESCE(c.name, p.company) as patient_company,
        u.name as doctor_name,
        u.specialization as doctor_specialization,
        wc.id as certificate_id,
        wc.aptitude_status,
        wc.verification_code
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN users u ON a.doctor_id = u.id
      LEFT JOIN (
          SELECT id, appointment_id, aptitude_status, verification_code
          FROM work_certificates
          WHERE id IN (
              SELECT MAX(id) FROM work_certificates GROUP BY appointment_id
          )
      ) wc ON a.id = wc.appointment_id
      ORDER BY a.appointment_date DESC
    `;

    const [rows] = await db.execute(query);
    const appointments = rows as any[];

    return new Response(JSON.stringify({
      success: true,
      data: appointments
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/admin/appointments:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
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

    const body = await request.json();
    
    // Validar campos requeridos
    const requiredFields = ['patientId', 'doctorId', 'appointmentDate', 'appointmentTime', 'appointmentType'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(JSON.stringify({
          success: false,
          message: `El campo ${field} es requerido`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Crear la cita
    const appointmentData = {
      patientId: parseInt(body.patientId),
      doctorId: parseInt(body.doctorId), // Doctor es obligatorio, ya no hay valor por defecto
      appointmentDate: `${body.appointmentDate} ${body.appointmentTime}`,
      appointmentType: body.appointmentType,
      reason: body.reason || undefined,
      durationMinutes: body.durationMinutes || 30,
      createdBy: user.id
    };

    const newAppointment = await AppointmentService.createAppointment(appointmentData);

    return new Response(JSON.stringify({
      success: true,
      data: newAppointment,
      message: 'Cita agendada exitosamente'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error en POST /api/admin/appointments:', error);
    
    // Manejar errores específicos
    if (error.message?.includes('conflicto de horario')) {
      return new Response(JSON.stringify({
        success: false,
        message: error.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      message: 'Error al agendar la cita'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
