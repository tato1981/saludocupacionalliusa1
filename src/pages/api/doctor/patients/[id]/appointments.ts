import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../../lib/auth';
import { db } from '../../../../../lib/database';

// GET - Obtener citas de un paciente específico con este doctor
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

    // Obtener citas del paciente con este doctor
    const query = `
      SELECT 
        a.*,
        p.name as patient_name,
        p.document_number as patient_document
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.patient_id = ? AND a.doctor_id = ?
      ORDER BY a.appointment_date DESC
    `;

    const [rows] = await db.execute(query, [patientId, user.id]);
    const appointments = rows as any[];

    return new Response(JSON.stringify({
      success: true,
      data: appointments
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/doctor/patients/[id]/appointments:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};