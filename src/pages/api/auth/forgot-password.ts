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
        status: 200,
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
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener la URL base de forma dinámica a partir de la petición
    const url = new URL(request.url);
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
    const proto = request.headers.get('x-forwarded-proto') || (url.protocol.replace(':', ''));
    const origin = `${proto}://${host}`;

    const result = await PasswordResetService.requestPasswordReset(email, origin);

    return new Response(JSON.stringify(result), {
      status: 200,
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