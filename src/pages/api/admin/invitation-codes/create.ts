import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, isSuperAdmin } from '../../../../lib/auth';
import { MailService } from '../../../../lib/mail-service';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    console.log('🎫 API: Creando código de invitación...');
    const user = requireAuth(cookies);
    if (!user || !isSuperAdmin(user)) {
      console.log('❌ Usuario no autorizado:', user);
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    console.log('📝 Datos recibidos:', body);
    const { code, email, max_uses, expires_at, description, assigned_role } = body;

    // Validaciones
    if (!code) {
      return new Response(JSON.stringify({
        success: false,
        message: 'El código es requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el código ya existe
    const [existingCode] = await db.execute(
      'SELECT id FROM invitation_codes WHERE code = ?',
      [code]
    );

    if ((existingCode as any[]).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe un código con ese nombre'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insertar nuevo código de invitación
    const [result] = await db.execute(
      `INSERT INTO invitation_codes (
        code, email, max_uses, expires_at, description, created_by, is_active, assigned_role
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        code,
        email || null,
        parseInt(max_uses) || 1,
        expires_at || null,
        description || null,
        user.id,
        assigned_role || 'staff'
      ]
    );

    // Enviar email de invitación si se proporcionó un email
    if (email) {
      console.log('📧 Enviando email de invitación a:', email);
      try {
        await MailService.sendInvitationEmail({
          to: email,
          invitationCode: code,
          expiresAt: expires_at ? new Date(expires_at) : null,
          assignedRole: assigned_role || 'staff',
          description: description || undefined
        });
        console.log('✅ Email de invitación enviado correctamente');
      } catch (emailError) {
        console.error('❌ Error enviando email de invitación:', emailError);
        // No fallar la creación del código si el email falla
        // El código se creó correctamente, solo log el error
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: email
        ? 'Código de invitación creado y email enviado correctamente'
        : 'Código de invitación creado correctamente',
      data: { id: (result as any).insertId }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error creando código de invitación:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
