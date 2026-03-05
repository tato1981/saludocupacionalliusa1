import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Id es requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const [existingUser] = await db.execute(
      'SELECT id, name, email FROM users WHERE id = ?',
      [id]
    );

    if ((existingUser as any[]).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Usuario no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await db.execute('DELETE FROM users WHERE id = ?', [id]);

    return new Response(JSON.stringify({
      success: true,
      message: 'Usuario eliminado correctamente'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error en POST /api/admin/users/delete:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

