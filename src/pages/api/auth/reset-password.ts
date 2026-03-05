import type { APIRoute } from 'astro';
import { PasswordResetService } from '../../../lib/password-reset-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token, newPassword } = await request.json();

    if (!token || !newPassword) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Token y nueva contraseña son requeridos.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validación de contraseña
    if (newPassword.length < 6) {
      return new Response(JSON.stringify({
        success: false,
        message: 'La contraseña debe tener al menos 6 caracteres.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await PasswordResetService.confirmPasswordReset(token, newPassword);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en reset-password API:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};