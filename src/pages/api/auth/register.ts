import type { APIRoute } from 'astro';
import { UserService } from '@/lib/user-service';
import { InvitationService } from '@/lib/invitation-service';
import { isValidEmail, isValidPassword, apiResponse } from '@/lib/utils';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const data = await request.json();
    const { email, password, name, role, phone, invitationCode } = data;
    
    // Obtener información de la request
    const ipAddress = clientAddress || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Verificar si el registro está habilitado
    const registrationStatus = await InvitationService.isRegistrationEnabled();
    
    if (!registrationStatus.enabled) {
      await InvitationService.logRegistrationAttempt({
        email: email || 'unknown',
        invitationCode,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Registro deshabilitado'
      });
      
      return new Response(
        JSON.stringify(apiResponse(false, registrationStatus.message)),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validaciones básicas
    if (!email || !password || !name) {
      await InvitationService.logRegistrationAttempt({
        email: email || 'unknown',
        invitationCode,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Campos requeridos faltantes'
      });
      
      return new Response(
        JSON.stringify(apiResponse(false, 'Todos los campos son requeridos')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidEmail(email)) {
      await InvitationService.logRegistrationAttempt({
        email,
        invitationCode,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Email inválido'
      });
      
      return new Response(
        JSON.stringify(apiResponse(false, 'Email inválido')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidPassword(password)) {
      await InvitationService.logRegistrationAttempt({
        email,
        invitationCode,
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Contraseña muy corta'
      });
      
      return new Response(
        JSON.stringify(apiResponse(false, 'La contraseña debe tener al menos 6 caracteres')),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validar código de invitación si el modo no es público
    let assignedRole = role; // Por defecto usar el rol del body
    let invitationCompanyId: number | undefined;

    if (registrationStatus.mode !== 'public') {
      if (!invitationCode) {
        await InvitationService.logRegistrationAttempt({
          email,
          invitationCode,
          ipAddress,
          userAgent,
          success: false,
          errorMessage: 'Código de invitación requerido'
        });

        return new Response(
          JSON.stringify(apiResponse(false, 'Código de invitación requerido')),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const validation = await InvitationService.validateInvitationCode(invitationCode, email);

      if (!validation.valid) {
        await InvitationService.logRegistrationAttempt({
          email,
          invitationCode,
          ipAddress,
          userAgent,
          success: false,
          errorMessage: validation.message
        });

        return new Response(
          JSON.stringify(apiResponse(false, validation.message)),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Si el código de invitación tiene un rol asignado, usarlo
      if (validation.invitation?.assigned_role) {
        assignedRole = validation.invitation.assigned_role;
      }

      // Capturar company_id del creador para asignarlo si no es una nueva empresa
      if (validation.invitation?.created_by_company_id) {
        invitationCompanyId = validation.invitation.created_by_company_id;
      }
    }

    // Si el rol es 'company', crear la empresa automáticamente
    let companyId: number | undefined;
    
    if (assignedRole === 'company') {
      const { CompanyService } = await import('@/lib/company-service');
      
      // Intentar crear la empresa usando el nombre del usuario
      const companyResult = await CompanyService.createCompany({
        name: name,
        email: email,
        responsible_name: name,
        status: 'active'
      });

      if (companyResult.success && companyResult.id) {
        companyId = companyResult.id;
      } else if (companyResult.message === 'La empresa ya existe') {
        // Si ya existe, intentar con un nombre alternativo para no bloquear el registro
        const uniqueName = `${name} (${new Date().getFullYear()})`;
        const retryResult = await CompanyService.createCompany({
          name: uniqueName,
          email: email,
          responsible_name: name,
          status: 'active'
        });
        
        if (retryResult.success && retryResult.id) {
          companyId = retryResult.id;
        }
      }
    } else if (invitationCompanyId) {
      // Si no es un registro de nueva empresa, pero la invitación viene de una empresa, asignar al usuario a esa empresa
      companyId = invitationCompanyId;
    }

    // Registrar usuario con el rol del código de invitación (o el rol del body si no hay código)
    const { user, token } = await UserService.register({
      email,
      password,
      name,
      role: assignedRole,
      phone: phone || undefined, // Asegurar que sea undefined si es falsy
      company_id: companyId
    });

    // Marcar código de invitación como usado si se proporcionó
    if (invitationCode && registrationStatus.mode !== 'public') {
      await InvitationService.markCodeAsUsed(invitationCode, user.id);
    }

    // Registrar intento exitoso
    await InvitationService.logRegistrationAttempt({
      email,
      invitationCode,
      ipAddress,
      userAgent,
      success: true
    });

    return new Response(
      JSON.stringify(apiResponse(true, 'Usuario registrado exitosamente', { user, token })),
      { 
        status: 201, 
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': `auth-token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800` // 7 días
        } 
      }
    );
  } catch (error: any) {
    console.error('Error en registro:', error);
    
    // Registrar error si tenemos datos básicos
    try {
      const data = await request.clone().json().catch(() => ({}));
      await InvitationService.logRegistrationAttempt({
        email: data.email || 'unknown',
        invitationCode: data.invitationCode,
        ipAddress: clientAddress || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: false,
        errorMessage: error.message
      });
    } catch (e) {
      console.error('Error logging failure:', e);
    }

    // Determinar código de estado basado en el mensaje de error
    let status = 500;
    let message = error.message || 'Error interno del servidor';

    if (message.includes('El usuario ya existe') || message.includes('Duplicate entry')) {
      status = 409;
      message = 'El correo electrónico ya está registrado';
    } else if (message.includes('inválid') || message.includes('requerido')) {
      status = 400;
    }
    
    return new Response(
      JSON.stringify(apiResponse(false, message)),
      { status: status, headers: { 'Content-Type': 'application/json' } }
    );
  }
};