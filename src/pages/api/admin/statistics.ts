import type { APIRoute } from 'astro';
import { InvitationService } from '@/lib/invitation-service';
import { requireAuth, hasRole } from '@/lib/auth';
import { apiResponse } from '@/lib/utils';
import { db } from '@/lib/database';

export const GET: APIRoute = async (context) => {
  try {
    const user = requireAuth(context.cookies);
    if (!hasRole(user, 'admin')) {
      return new Response(
        JSON.stringify(apiResponse(false, 'Acceso denegado')),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obtener estadísticas
    const [activeCodesResult] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM invitation_codes 
      WHERE is_active = TRUE 
      AND current_uses < max_uses 
      AND (expires_at IS NULL OR expires_at > NOW())
    `);
    
    const [usedCodesResult] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM invitation_codes 
      WHERE current_uses >= max_uses
    `);
    
    const [expiringSoonResult] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM invitation_codes 
      WHERE is_active = TRUE 
      AND expires_at IS NOT NULL 
      AND expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY)
    `);
    
    const [totalUsersResult] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM users
    `);

    const statistics = {
      activeCodes: (activeCodesResult as any[])[0].count,
      usedCodes: (usedCodesResult as any[])[0].count,
      expiringSoon: (expiringSoonResult as any[])[0].count,
      totalUsers: (totalUsersResult as any[])[0].count
    };

    return new Response(
      JSON.stringify(apiResponse(true, 'Estadísticas obtenidas exitosamente', statistics)),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error obteniendo estadísticas:', error);
    return new Response(
      JSON.stringify(apiResponse(false, 'Error interno del servidor')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
