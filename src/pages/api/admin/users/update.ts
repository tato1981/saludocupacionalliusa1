import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, isAdmin } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { id, name, email, role, phone } = body;

    if (!id || !email || !name || !role) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Id, nombre, email y rol son requeridos'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const [existing] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, id]
    );

    if ((existing as any[]).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe otro usuario con ese email'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await db.execute(
      'UPDATE users SET name = ?, email = ?, role = ?, phone = ? WHERE id = ?',
      [name, email, role, phone || null, id]
    );

    return new Response(JSON.stringify({
      success: true,
      message: 'Usuario actualizado correctamente'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error en POST /api/admin/users/update:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

