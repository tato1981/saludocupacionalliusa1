import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { PatientService } from '../../../../lib/patient-service';

// GET - Obtener información de un paciente específico (solo para doctores)
export const GET: APIRoute = async ({ params, cookies }) => {
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

    const patientId = params.id;
    if (!patientId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de paciente requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener información del paciente
    const patient = await PatientService.getPatientById(parseInt(patientId));

    if (!patient) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Paciente no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el doctor tenga acceso a este paciente
    // (el paciente debe estar asignado a este doctor o tener citas con él)
    if (patient.assigned_doctor_id !== user.id) {
      // Verificar si tiene citas con este doctor
      const { db } = await import('../../../../lib/database');
      const [appointments] = await db.execute(
        'SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND doctor_id = ?',
        [patientId, user.id]
      );
      
      const appointmentCount = (appointments as any[])[0].count;
      if (appointmentCount === 0) {
        return new Response(JSON.stringify({
          success: false,
          message: 'No tienes acceso a este paciente'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: patient
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/doctor/patients/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};