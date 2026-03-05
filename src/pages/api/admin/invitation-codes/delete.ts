import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'admin')) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID es requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el código existe
    const [existingCode] = await db.execute(
      'SELECT id, code FROM invitation_codes WHERE id = ?',
      [id]
    );

    if ((existingCode as any[]).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Código de invitación no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Eliminar el código
    await db.execute(
      'DELETE FROM invitation_codes WHERE id = ?',
      [id]
    );

    const code = (existingCode as any[])[0];

    return new Response(JSON.stringify({
      success: true,
      message: `Código "${code.code}" eliminado correctamente`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error eliminando código de invitación:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
