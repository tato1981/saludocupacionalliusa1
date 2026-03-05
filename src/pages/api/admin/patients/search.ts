import type { APIRoute } from 'astro';
import { PatientService } from '@/lib/patient-service';
import { requireAuth, hasRole } from '@/lib/auth';

export const GET: APIRoute = async ({ request, cookies, url }) => {
  try {
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

    const searchQuery = url.searchParams.get('q');
    
    if (!searchQuery || searchQuery.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        message: 'Término de búsqueda requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Buscar pacientes
    const patients = await PatientService.searchPatients(searchQuery.trim());

    return new Response(JSON.stringify({
      success: true,
      data: patients
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/admin/patients/search:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
