import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth.js';
import { db } from '@/lib/database.js';

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

    // Obtener todas las historias médicas del paciente ordenadas por fecha
    const query = `
      SELECT 
        mh.*,
        CONCAT(u.name) as doctor_name
      FROM medical_histories mh
      LEFT JOIN users u ON mh.doctor_id = u.id
      LEFT JOIN patients p ON mh.patient_id = p.id
      WHERE p.user_id = ?
      ORDER BY mh.created_at DESC
    `;

    const [result] = await db.execute(query, [user.id]);
    const medicalHistories = result as any[];

    return new Response(JSON.stringify({
      success: true,
      data: medicalHistories
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error obteniendo historial médico completo:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};