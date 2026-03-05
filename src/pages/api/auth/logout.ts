import type { APIRoute } from 'astro';
import { apiResponse } from '@/lib/utils';

export const POST: APIRoute = async () => {
  return new Response(
    JSON.stringify(apiResponse(true, 'Logout exitoso')),
    { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': 'auth-token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' // Eliminar cookie
      } 
    }
  );
};