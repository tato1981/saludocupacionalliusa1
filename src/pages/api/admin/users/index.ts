import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole } from '../../../../lib/auth';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const query = `
      SELECT
        id,
        name,
        email,
        role,
        phone,
        is_active,
        company_id,
        created_at
      FROM users
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(query);
    const users = rows as any[];

    const formatted = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      is_active: user.is_active !== 0,
      company_id: user.company_id,
      created_at: user.created_at
    }));

    return new Response(JSON.stringify({
      success: true,
      data: formatted
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error en GET /api/admin/users:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

