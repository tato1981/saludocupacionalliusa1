import type { APIRoute } from 'astro';
import { db } from '../../../../../lib/database';

export const GET: APIRoute = async ({ params }) => {
  try {
    const patientId = params.id;

    if (!patientId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID del paciente requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el paciente existe
    const [patientCheck] = await db.execute(
      'SELECT id FROM patients WHERE id = ?',
      [patientId]
    );

    if (!Array.isArray(patientCheck) || patientCheck.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Paciente no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener historial de citas del paciente con información del doctor
    const [appointments] = await db.execute(`
      SELECT 
        a.id,
        a.appointment_date,
        TIME(a.appointment_date) as appointment_time,
        a.appointment_type,
        a.status,
        a.reason,
        a.notes,
        a.created_at,
        a.updated_at,
        u.name as doctor_name,
        u.specialization as doctor_specialization,
        CASE 
          WHEN a.status = 'completada' THEN 'Completada'
          WHEN a.status = 'cancelada' THEN 'Cancelada'
          WHEN a.status = 'no_asistio' THEN 'No asistió'
          WHEN a.status = 'programada' AND DATE(a.appointment_date) < CURDATE() THEN 'Perdida'
          WHEN a.status = 'programada' AND DATE(a.appointment_date) = CURDATE() AND TIME(a.appointment_date) < CURTIME() THEN 'Perdida'
          WHEN a.status = 'programada' THEN 'Programada'
          WHEN a.status = 'en_progreso' THEN 'En progreso'
          ELSE a.status
        END as status_display,
        -- Verificar si hay certificado médico asociado
        (SELECT COUNT(*) FROM work_certificates wc WHERE wc.patient_id = a.patient_id AND DATE(wc.created_at) = DATE(a.appointment_date)) as has_certificate
      FROM appointments a
      LEFT JOIN users u ON a.doctor_id = u.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC
    `, [patientId]);

    // Obtener estadísticas del historial
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_appointments,
        SUM(CASE WHEN status = 'completada' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN status = 'programada' AND appointment_date >= NOW() THEN 1 ELSE 0 END) as upcoming_count,
        SUM(CASE WHEN status = 'programada' AND appointment_date < NOW() THEN 1 ELSE 0 END) as missed_count,
        SUM(CASE WHEN status = 'no_asistio' THEN 1 ELSE 0 END) as no_show_count,
        MIN(appointment_date) as first_appointment,
        MAX(CASE WHEN status = 'completada' THEN appointment_date END) as last_completed_appointment
      FROM appointments 
      WHERE patient_id = ?
    `, [patientId]);

    const appointmentStats = Array.isArray(stats) && stats.length > 0 ? stats[0] as any : {};

    return new Response(JSON.stringify({
      success: true,
      data: {
        appointments: appointments,
        statistics: {
          total: appointmentStats.total_appointments || 0,
          completed: appointmentStats.completed_count || 0,
          cancelled: appointmentStats.cancelled_count || 0,
          upcoming: appointmentStats.upcoming_count || 0,
          missed: appointmentStats.missed_count || 0,
          firstAppointment: appointmentStats.first_appointment || null,
          lastCompletedAppointment: appointmentStats.last_completed_appointment || null
        }
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error obteniendo historial de citas:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};