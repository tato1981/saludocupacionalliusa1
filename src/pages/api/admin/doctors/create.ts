import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { requireAuth, hasRole, hashPassword } from '../../../../lib/auth';
import { MigrationService } from '../../../../lib/migration-service';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin') && !hasRole(user, 'admin')) {
      return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Asegurar que la base de datos esté actualizada
    await MigrationService.runMigrations();

    // Cambiar a FormData para soportar archivos
    const formData = await request.formData();

    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const document_number = formData.get('document_number') as string;
    const phone = formData.get('phone') as string;
    const specialization = formData.get('specialization') as string;
    const professional_license = formData.get('professional_license') as string;
    const password = formData.get('password') as string;
    const is_active = formData.get('is_active') === '1';
    const signatureUrl = formData.get('signatureUrl') as string;

    // Validaciones
    if (!name || !email || !document_number || !password) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Nombre, email, documento y contraseña son requeridos'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el email ya existe
    const [existingUser] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if ((existingUser as any[]).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe un usuario con este email'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el documento ya existe
    const [existingDoc] = await db.execute(
      'SELECT id FROM users WHERE document_number = ?',
      [document_number]
    );

    if ((existingDoc as any[]).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe un usuario con este número de documento'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Hash de la contraseña
    const passwordHash = await hashPassword(password);

    const [signatureColumn] = await db.execute('SHOW COLUMNS FROM users WHERE Field = "signature_url"');
    const hasSignatureUrl = Array.isArray(signatureColumn) && signatureColumn.length > 0;

    // Insertar nuevo doctor primero para obtener ID
    const [result] = await db.execute(
      `INSERT INTO users (
        name, email, password_hash, document_number, phone,
        specialization, professional_license${hasSignatureUrl ? ', signature_url' : ''}, role, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?${hasSignatureUrl ? ', ?' : ''}, 'doctor', ?)`,
      [
        name,
        email,
        passwordHash,
        document_number,
        phone || null,
        specialization || 'Medicina General',
        professional_license || null,
        ...(hasSignatureUrl ? [signatureUrl || null] : []),
        is_active ? 1 : 0
      ]
    );

    const doctorId = (result as any).insertId;

    return new Response(JSON.stringify({
      success: true,
      message: 'Doctor creado correctamente',
      data: { id: doctorId }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error creando doctor:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
