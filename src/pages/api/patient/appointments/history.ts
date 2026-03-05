import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/database';

export const GET: APIRoute = async ({ cookies }) => {
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

    // Buscar el paciente por email o ID de usuario
    const [patientRows] = await db.execute(`
      SELECT id FROM patients 
      WHERE email = ? OR created_by_user_id = ?
    `, [user.email, user.id]);

    const patients = patientRows as any[];
    
    if (patients.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        data: []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const patientId = patients[0].id;

    // Obtener historial completo de citas
    const [rows] = await db.execute(`
      SELECT a.*, 
             u.name as doctor_name
      FROM appointments a
      LEFT JOIN users u ON a.doctor_id = u.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC
    `, [patientId]);

    return new Response(JSON.stringify({
      success: true,
      data: rows
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/patient/appointments/history:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};