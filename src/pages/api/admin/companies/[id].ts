import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '../../../../lib/auth.js';
import { CompanyService } from '../../../../lib/company-service.js';

export const GET: APIRoute = async ({ params, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'doctor')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const id = parseInt(params.id as string);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ success: false, message: 'ID inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const company = await CompanyService.getCompanyById(id);
    if (!company) {
      return new Response(JSON.stringify({ success: false, message: 'Empresa no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, data: company }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error en GET /api/admin/companies/[id]:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const id = parseInt(params.id as string);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ success: false, message: 'ID inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    const result = await CompanyService.updateCompany(id, {
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
        message: 'Empresa actualizada exitosamente'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message || 'Error actualizando empresa'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en PUT /api/admin/companies/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'admin')) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const id = parseInt(params.id as string);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ success: false, message: 'ID inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await CompanyService.deleteCompany(id);
    
    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Empresa eliminada exitosamente'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message || 'Error eliminando empresa'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en DELETE /api/admin/companies/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
