import type { APIRoute } from 'astro';
import { PasswordResetService } from '../../../lib/password-reset-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token } = await request.json();

    if (!token) {
      return new Response(JSON.stringify({
        valid: false,
        message: 'Token no proporcionado.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await PasswordResetService.verifyResetToken(token);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en verify-reset-token API:', error);
    return new Response(JSON.stringify({
      valid: false,
      message: 'Error interno del servidor.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};