import type { APIRoute } from 'astro';
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

    // Obtener todas las empresas
    const { db } = await import('../../../../lib/database');
    const query = 'SELECT id, name, nit, email, phone FROM companies ORDER BY name ASC';
    const [rows] = await db.execute(query);

    return new Response(JSON.stringify({
      success: true,
      data: rows
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/admin/companies/list:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
