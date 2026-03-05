import type { APIRoute } from 'astro';
import { UserService } from '@/lib/user-service';
import { MailService } from '@/lib/mail-service';
import { apiResponse } from '@/lib/utils';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { email, password } = data;

    // Validaciones
    if (!email || !password) {
      return new Response(
        JSON.stringify(apiResponse(false, 'Email y contraseña son requeridos')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Login de usuario
    const { user, token } = await UserService.login({ email: email.trim(), password });

    // Enviar notificación de seguridad por email (sin bloquear el login)
    if (user.role === 'doctor' || user.role === 'admin') {
      try {
        const now = new Date();
        const timeZone = 'America/Bogota'; // Ajusta según tu zona horaria
        const formatter = new Intl.DateTimeFormat('es-CO', {
          timeZone,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        const loginTime = formatter.format(now);

        // Enviar email de notificación de forma asíncrona
        MailService.sendLoginNotification({
          to: user.email,
          userName: user.name,
          loginTime,
          userRole: user.role,
          ipAddress: request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'IP no disponible'
        }).catch((error: any) => {
          console.warn('⚠️ Error al enviar notificación de login:', error.message);
        });
      } catch (error) {
        console.warn('⚠️ Error al procesar notificación de login:', error);
      }
    }

    return new Response(
      JSON.stringify(apiResponse(true, 'Login exitoso', { user, token })),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': `auth-token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800` // 7 días
        } 
      }
    );
  } catch (error: any) {
    console.error('Error en login:', error);

    const message = error?.message || '';
    const isAuthError =
      message.includes('Credenciales inválidas') ||
      message.includes('Usuario inactivo');

    if (isAuthError) {
      return new Response(
        JSON.stringify(apiResponse(false, message || 'Credenciales inválidas')),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(apiResponse(false, 'Error interno del servidor. Intenta nuevamente.')),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
