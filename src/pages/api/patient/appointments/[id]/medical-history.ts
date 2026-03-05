import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth.js';
import { db } from '@/lib/database.js';

export const GET: APIRoute = async ({ params, cookies }) => {
  try {
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
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

    // Verificar que la cita pertenece al paciente
    const appointmentQuery = `
      SELECT a.*, p.id as patient_id 
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.id = ? AND p.user_id = ?
    `;

    const [appointmentResult] = await db.execute(appointmentQuery, [appointmentId, user.id]);
    const appointment = (appointmentResult as any[])[0];

    if (!appointment) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Cita no encontrada o sin acceso'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Buscar historia médica asociada a la cita
    const medicalHistoryQuery = `
      SELECT 
        mh.*,
        CONCAT(u.name) as doctor_name
      FROM medical_histories mh
      LEFT JOIN users u ON mh.doctor_id = u.id
      WHERE mh.appointment_id = ?
    `;

    const [historyResult] = await db.execute(medicalHistoryQuery, [appointmentId]);
    const medicalHistory = (historyResult as any[])[0];

    if (!medicalHistory) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No se encontró historia médica para esta cita'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: medicalHistory
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error obteniendo historia médica:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};