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

    const historyId = params.id;

    if (!historyId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de historia médica requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener historia médica y verificar acceso
    const query = `
      SELECT 
        mh.*,
        CONCAT(u.name) as doctor_name,
        p.id as patient_id
      FROM medical_histories mh
      LEFT JOIN users u ON mh.doctor_id = u.id
      LEFT JOIN patients p ON mh.patient_id = p.id
      WHERE mh.id = ? AND p.user_id = ?
    `;

    const [result] = await db.execute(query, [historyId, user.id]);
    const medicalHistory = (result as any[])[0];

    if (!medicalHistory) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Historia médica no encontrada o sin acceso'
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