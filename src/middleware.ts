import { defineMiddleware } from 'astro:middleware';
import { verifyToken } from './lib/auth';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

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
    const possiblePaths = [
      path.join(process.cwd(), decodedPath),                           // Opción 1: uploads/ en raíz (CWD correcto)
      path.join(process.cwd(), 'public', decodedPath),                 // Opción 2: public/uploads/ (Desarrollo)
      path.join(process.cwd(), 'dist', 'client', decodedPath),         // Opción 3: dist/client/uploads/ (Build estático)
      path.resolve(process.cwd(), '..', decodedPath.replace(/^\//, '')), // Opción 4: Un nivel arriba (si CWD está en dist/)
      path.join(process.cwd(), '..', 'public', decodedPath)            // Opción 5: Un nivel arriba en public (raro pero posible)
    ];

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
      // Servir desde R2 como proxy (en lugar de redirigir) para evitar problemas de CORS
      const r2PublicUrl = process.env.R2_PUBLIC_URL || import.meta.env.R2_PUBLIC_URL;
      if (r2PublicUrl) {
        try {
          const baseUrl = r2PublicUrl.endsWith('/') ? r2PublicUrl.slice(0, -1) : r2PublicUrl;
          const fullBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
          let key = decodedPath;
          if (key.startsWith('/')) key = key.substring(1);
          if (key.startsWith('uploads/')) key = key.substring('uploads/'.length);

          const r2Url = `${fullBaseUrl}/${key}`;

          // Fetch desde R2 y servir a través del servidor (proxy)
          const r2Response = await fetch(r2Url);

          if (!r2Response.ok) {
            return new Response('File not found in R2', { status: 404 });
          }

          // Obtener el buffer de la imagen
          const imageBuffer = await r2Response.arrayBuffer();

          // Determinar el Content-Type desde R2 o por extensión
          let contentType = r2Response.headers.get('Content-Type') || 'application/octet-stream';
          if (contentType === 'application/octet-stream') {
            const ext = path.extname(decodedPath).toLowerCase();
            const contentTypes: Record<string, string> = {
              '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
              '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
              '.svg': 'image/svg+xml', '.pdf': 'application/pdf'
            };
            contentType = contentTypes[ext] || 'application/octet-stream';
          }

          // Servir la imagen con headers apropiados (sin CORS porque es same-origin)
          return new Response(imageBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Served-By': 'Astro-Middleware-R2-Proxy'
            }
          });
        } catch (error) {
          console.error('Error fetching from R2:', error);
          return new Response('Error fetching file from R2', { status: 500 });
        }
      }
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