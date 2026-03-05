/**
 * Endpoint de diagnóstico para verificar autenticación del usuario actual
 *
 * Acceso: GET /api/admin/check-auth
 */

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, cookies }) => {
  try {
    const user = locals.user;
    const token = cookies.get('auth-token')?.value;

    return new Response(JSON.stringify({
      success: true,
      diagnostics: {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
        hasUser: !!user,
        user: user ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        } : null,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'unknown'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al verificar autenticación',
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
