import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole } from '../../../../lib/auth';
import { AppointmentService } from '../../../../lib/appointment-service';
import { PatientService } from '../../../../lib/patient-service';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { requestId, doctorId, appointmentDate, appointmentTime, duration, dateOfBirth, gender } = body;

    if (!requestId || !doctorId || !appointmentDate || !appointmentTime) {
      return new Response(JSON.stringify({ success: false, message: 'Faltan datos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Obtener detalles de la solicitud
    const [requests] = await db.execute(
      'SELECT * FROM exam_requests WHERE id = ?',
      [requestId]
    );

    if ((requests as any[]).length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Solicitud no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const examRequest = (requests as any[])[0];

    // 2. Buscar o crear paciente
    let patientId;
    const [patients] = await db.execute(
      'SELECT id FROM patients WHERE document_number = ?',
      [examRequest.patient_document]
    );

    if ((patients as any[]).length > 0) {
      patientId = (patients as any[])[0].id;
    } else {
      // Validar datos adicionales para nuevo paciente
      if (!dateOfBirth || !gender) {
        return new Response(JSON.stringify({ success: false, message: 'Fecha de nacimiento y género son requeridos para nuevos pacientes' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Crear nuevo paciente usando el servicio centralizado
      const createResult = await PatientService.createPatient({
        name: examRequest.patient_name,
        documentNumber: examRequest.patient_document,
        documentType: examRequest.patient_document_type,
        companyId: examRequest.company_id,
        occupation: examRequest.position,
        dateOfBirth: dateOfBirth,
        gender: gender,
        createdBy: user.id
      });

      if (!createResult.success) {
        throw new Error(createResult.message || 'Error al crear el paciente');
      }
      
      patientId = createResult.patient.id;
    }

    // Mapeo de tipos de examen
    const examTypeMap: Record<string, string> = {
      'ingreso': 'examen_ingreso',
      'periodico': 'examen_periodico',
      'retiro': 'examen_egreso',
      'post_incapacidad': 'examen_reintegro',
      'reubicacion': 'consulta_especializada'
    };

    // 3. Crear la cita
    const appointmentResult = await AppointmentService.createAppointment({
      patientId,
      doctorId: parseInt(doctorId),
      appointmentDate: `${appointmentDate} ${appointmentTime}`,
      appointmentType: examTypeMap[examRequest.exam_type] || examRequest.exam_type,
      reason: 'Solicitud de examen ocupacional',
      durationMinutes: parseInt(duration) || 30,
      createdBy: user.id
    });

    if (!appointmentResult.success) {
      return new Response(JSON.stringify({ success: false, message: appointmentResult.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Actualizar estado de la solicitud y vincular la cita creada
    const createdAppointmentId = appointmentResult.appointment?.id;
    await db.execute(
      'UPDATE exam_requests SET status = "scheduled", appointment_id = ? WHERE id = ?',
      [createdAppointmentId || null, requestId]
    );

    return new Response(JSON.stringify({ success: true, message: 'Doctor asignado y cita creada exitosamente' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en assign request:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
