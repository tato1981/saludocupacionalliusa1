import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, isAdmin } from '../../../../lib/auth';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!user || !isAdmin(user)) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Consulta para obtener códigos de invitación
    const query = `
      SELECT
        ic.id,
        ic.code,
        ic.email,
        ic.max_uses,
        ic.current_uses,
        ic.is_active,
        ic.expires_at,
        ic.used_at,
        ic.created_at,
        ic.description,
        ic.assigned_role,
        u.name as created_by_name
      FROM invitation_codes ic
      LEFT JOIN users u ON ic.created_by = u.id
      ORDER BY ic.created_at DESC
    `;

    const [codesResult] = await db.execute(query);
    const codes = codesResult as any[];
    
    const formattedCodes = codes.map((code: any) => ({
      id: code.id,
      code: code.code,
      email: code.email,
      max_uses: code.max_uses || 1,
      current_uses: code.current_uses || 0,
      is_active: code.is_active !== 0,
      expires_at: code.expires_at,
      used_at: code.used_at,
      created_at: code.created_at,
      description: code.description,
      assigned_role: code.assigned_role || 'staff',
      created_by_name: code.created_by_name
    }));

    return new Response(JSON.stringify({
      success: true,
      data: formattedCodes,
      message: `Se encontraron ${codes.length} códigos de invitación`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error obteniendo códigos de invitación:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
