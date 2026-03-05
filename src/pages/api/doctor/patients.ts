import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/auth';
import { db } from '../../../lib/database';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    // Verificar autenticación y rol de doctor
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

    // Para salud ocupacional, los doctores pueden ver todos los pacientes
    // Pero podemos mostrar primero sus pacientes asignados
    const [rows] = await db.execute(`
      SELECT 
        p.*,
        u.name as assigned_doctor_name,
        COUNT(mh.id) as total_consultations,
        MAX(mh.created_at) as last_consultation_date,
        COUNT(CASE WHEN mh.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as recent_consultations
      FROM patients p
      LEFT JOIN users u ON p.assigned_doctor_id = u.id
      LEFT JOIN medical_histories mh ON p.id = mh.patient_id
      GROUP BY p.id
      ORDER BY 
        CASE WHEN p.assigned_doctor_id = ? THEN 0 ELSE 1 END,
        p.name ASC
    `, [user.id]);

    const patients = rows as any[];

    return new Response(JSON.stringify({
      success: true,
      data: patients
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/doctor/patients:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};