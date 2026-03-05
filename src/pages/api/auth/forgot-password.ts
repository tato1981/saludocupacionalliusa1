import type { APIRoute } from 'astro';
import { PasswordResetService } from '../../../lib/password-reset-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email } = await request.json();

    if (!email) {
      return new Response(JSON.stringify({
        success: false,
        message: 'El correo electrónico es requerido.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validación básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Por favor proporciona un correo electrónico válido.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await PasswordResetService.requestPasswordReset(email);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en forgot-password API:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};