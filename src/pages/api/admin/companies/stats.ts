import type { APIRoute } from 'astro';
import { requireAuth, isAdmin, hasRole } from '../../../../lib/auth.js';
import { CompanyService } from '../../../../lib/company-service.js';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!user || (!isAdmin(user) && !hasRole(user, 'doctor'))) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const stats = await CompanyService.getCompanyStats();
    return new Response(JSON.stringify({ success: true, data: stats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error en GET /api/admin/companies/stats:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
