import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { id, is_active } = body;

    if (!id || is_active === undefined) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID y estado son requeridos'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el doctor existe
    const [existingDoctor] = await db.execute(
      'SELECT id, name FROM users WHERE id = ? AND role = "doctor"',
      [id]
    );

    if ((existingDoctor as any[]).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Doctor no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Actualizar el estado
    await db.execute(
      'UPDATE users SET is_active = ? WHERE id = ? AND role = "doctor"',
      [is_active ? 1 : 0, id]
    );

    const doctor = (existingDoctor as any[])[0];
    const action = is_active ? 'activado' : 'desactivado';

    return new Response(JSON.stringify({
      success: true,
      message: `Doctor ${doctor.name} ${action} correctamente`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error cambiando estado del doctor:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
