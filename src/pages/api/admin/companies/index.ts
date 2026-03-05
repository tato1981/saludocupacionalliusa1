import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '../../../../lib/auth.js';
import { CompanyService } from '../../../../lib/company-service.js';
import { MigrationService } from '../../../../lib/migration-service.js';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!user || (!hasRole(user, 'staff') && user.role !== 'doctor')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Asegurar migraciones para tablas de empresas
    try {
      await MigrationService.runMigrations();
    } catch (migrationError) {
      console.warn('⚠️ Error en migraciones (GET companies, continuando):', migrationError);
    }

    // Obtener parámetros de búsqueda
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || undefined;

    const companies = await CompanyService.listCompanies(search);
    return new Response(JSON.stringify({ success: true, data: companies }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error en GET /api/admin/companies:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Verificar autenticación y rol de admin
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Asegurar migraciones para tablas de empresas
    try {
      await MigrationService.runMigrations();
    } catch (migrationError) {
      console.warn('⚠️ Error en migraciones (POST companies, continuando):', migrationError);
    }

    // Obtener datos del cuerpo de la petición
    const body = await request.json();
    const { name, nit, address, phone, responsible_name, email, status } = body;

    // Validar campos requeridos
    if (!name || name.trim() === '') {
      return new Response(JSON.stringify({
        success: false,
        message: 'El nombre de la empresa es requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar email si se proporciona
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'El formato del email no es válido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Crear empresa
    const result = await CompanyService.createCompany({
      name: name.trim(),
      nit: nit?.trim() || undefined,
      address: address?.trim() || undefined,
      phone: phone?.trim() || undefined,
      responsible_name: responsible_name?.trim() || undefined,
      email: email?.trim() || undefined,
      status: status || 'active'
    });

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Empresa creada exitosamente',
        data: { id: result.id }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message || 'Error creando empresa'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en POST /api/admin/companies:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
