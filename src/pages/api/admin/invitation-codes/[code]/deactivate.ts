import type { APIRoute } from 'astro';
import { InvitationService } from '@/lib/invitation-service';
import { requireAuth, isSuperAdmin } from '@/lib/auth';
import { apiResponse } from '@/lib/utils';

export const POST: APIRoute = async (context) => {
  try {
    // Verificar autenticación y permisos
    const user = requireAuth(context.cookies);
    if (!user || !isSuperAdmin(user)) {
      return new Response(
        JSON.stringify(apiResponse(false, 'Acceso denegado')),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obtener el código desde la URL
    const code = context.params.code;
    if (!code) {
      return new Response(
        JSON.stringify(apiResponse(false, 'Código requerido')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Desactivar código
    const success = await InvitationService.deactivateCode(code);

    if (success) {
      return new Response(
        JSON.stringify(apiResponse(true, 'Código desactivado exitosamente')),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify(apiResponse(false, 'No se pudo desactivar el código')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Error desactivando código:', error);
    return new Response(
      JSON.stringify(apiResponse(false, 'Error interno del servidor')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
