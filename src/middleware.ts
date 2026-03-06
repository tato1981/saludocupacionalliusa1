import { defineMiddleware } from 'astro:middleware';
import { verifyToken } from './lib/auth';
import fs from 'fs';
import path from 'path';
// dotenv no es necesario aquí - Astro ya carga las variables de entorno automáticamente

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  // 1. Manejo de CORS (Prepara headers pero NO retorna aún, salvo OPTIONS)
  let corsHeaders: Record<string, string> = {};
  const isApiRoute = url.pathname.startsWith('/api/');
  
  if (isApiRoute) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://saludocupacional.online',
      'http://localhost:4321',
      'http://localhost:3000'
    ];
    
    if (process.env.ALLOWED_ORIGINS) {
        const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
        allowedOrigins.push(...envOrigins);
    }

    const isAllowed = origin && allowedOrigins.includes(origin);
    
    corsHeaders = {
      'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Credentials': 'true'
    };

    // Manejar preflight OPTIONS inmediatamente
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
  }

  // 2. Servir archivos estáticos de uploads/ (carpeta persistente fuera de dist/)
  // Esto debe ir ANTES de la autenticación si son públicos, o DESPUÉS si son protegidos.
  // Asumimos públicos por ahora, pero si requieren auth, mover abajo.
  if (url.pathname.startsWith('/uploads/')) {
    // ... (lógica existente de uploads) ...
    // Decodificar la URL para manejar espacios y caracteres especiales
    const decodedPath = decodeURIComponent(url.pathname);

    // Intentar múltiples ubicaciones en orden de prioridad
    const possiblePaths = [];

    // Prioridad 1: Si existe UPLOADS_DIR (producción/Docker), usar esa ruta
    if (process.env.UPLOADS_DIR) {
      const relativePath = decodedPath.replace('/uploads/', '');
      possiblePaths.push(path.join(process.env.UPLOADS_DIR, relativePath));
    }

    // Otras ubicaciones de fallback
    possiblePaths.push(
      path.join(process.cwd(), decodedPath),                           // Opción 2: uploads/ en raíz (CWD correcto)
      path.join(process.cwd(), 'public', decodedPath),                 // Opción 3: public/uploads/ (Desarrollo)
      path.join(process.cwd(), 'dist', 'client', decodedPath),         // Opción 4: dist/client/uploads/ (Build estático)
      path.resolve(process.cwd(), '..', decodedPath.replace(/^\//, '')), // Opción 5: Un nivel arriba (si CWD está en dist/)
      path.join(process.cwd(), '..', 'public', decodedPath)            // Opción 6: Un nivel arriba en public (raro pero posible)
    );

    let filePath: string | null = null;

    // Buscar el archivo en las ubicaciones posibles
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        const stat = fs.statSync(possiblePath);
        if (stat.isFile()) {
          filePath = possiblePath;
          break;
        }
      }
    }

    if (filePath) {
      try {
        const file = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
          '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
          '.svg': 'image/svg+xml', '.pdf': 'application/pdf'
        };
        const contentType = contentTypes[ext] || 'application/octet-stream';

        return new Response(file, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Served-By': 'Astro-Middleware'
          }
        });
      } catch (err) {
        console.error(`❌ Error al leer archivo ${filePath}:`, err);
        return new Response('Error reading file', { status: 500 });
      }
    } else {
      return new Response('File not found', { status: 404 });
    }
  }

  // 3. Autenticación (Mover lógica aquí para que se ejecute ANTES de next())
  const publicPaths = [
    '/auth/login', '/auth/register', '/api/auth/login', '/api/auth/register',
    '/api/certificates/verify', '/api/certificates/download',
    '/certificates/verify', '/certificates/mobile'
  ];
  
  // Permitir rutas públicas exactamente o con query params
  const pathname = url.pathname;
  const isPublic = publicPaths.includes(pathname);

  // Verificar autenticación para rutas protegidas
  const isProtected = (
    pathname.startsWith('/dashboard') || 
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/doctor/') ||
    pathname.startsWith('/patient/') ||
    pathname.startsWith('/company/') ||
    (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/'))
  );
  
  if (!isPublic && isProtected) {
    const token = context.cookies.get('auth-token')?.value;
    
    // Si no hay token o es inválido
    if (!token) {
      if (isApiRoute) {
        // Para API, devolver 401 JSON en lugar de redirigir
        const response = new Response(JSON.stringify({ success: false, message: 'No autenticado' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
        // Agregar headers CORS si es necesario
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
        return response;
      } else {
        return context.redirect('/auth/login');
      }
    }

    const user = verifyToken(token);
    if (!user) {
      // Token inválido
      context.cookies.delete('auth-token');
      if (isApiRoute) {
         const response = new Response(JSON.stringify({ success: false, message: 'Sesión inválida' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
        return response;
      } else {
        return context.redirect('/auth/login');
      }
    }

    // Agregar usuario al contexto
    context.locals.user = user;
  }

  // 4. Continuar con la petición (Ejecuta el endpoint)
  const response = await next();
  
  // 5. Agregar headers CORS a la respuesta final si es API
  if (isApiRoute) {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
  
  return response;
});