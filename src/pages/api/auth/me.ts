import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { UserService } from '@/lib/user-service';
import { apiResponse } from '@/lib/utils';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    
    if (!user) {
      return new Response(
        JSON.stringify(apiResponse(false, 'No autenticado')),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userData = await UserService.getUserById(user.id);
    
    if (!userData) {
      return new Response(
        JSON.stringify(apiResponse(false, 'Usuario no encontrado')),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(apiResponse(true, 'Usuario obtenido', { user: userData })),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error obteniendo usuario:', error);
    return new Response(
      JSON.stringify(apiResponse(false, 'Error interno del servidor')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};