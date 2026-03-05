import type { APIRoute } from 'astro';
import { db } from '../../../../lib/database';
import { hasRole, hashPassword, requireAuth } from '../../../../lib/auth';
import { MigrationService } from '../../../../lib/migration-service';
import { R2StorageService } from '@/lib/r2-storage-service';

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  try {
    let user = locals.user;
    
    // Fallback: Si locals no tiene el usuario, intentar obtenerlo de las cookies
    if (!user) {
      console.log('⚠️ Doctor Update: No user in locals, trying cookies...');
      const authUser = requireAuth(cookies);
      if (authUser) {
        user = authUser;
        console.log('✅ Doctor Update: User recovered from cookies:', user.email);
      }
    }

    if (!user) {
      console.error('❌ Doctor Update: No authenticated user found in locals');
      return new Response(JSON.stringify({ success: false, message: 'No autenticado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Asegurar que la base de datos esté actualizada
    await MigrationService.runMigrations();

    // Cambiar a FormData para soportar archivos
    const formData = await request.formData();

    const id = formData.get('id') as string;

    // Log para diagnóstico
    console.log(`🔍 Doctor Update: User ${user.email} (role: ${user.role}, id: ${user.id}) attempting to update doctor ID ${id}`);

    // Verificar permisos: Admin/Superadmin o el mismo doctor
    const isAdmin = hasRole(user, 'admin');
    const isSameDoctor = user.role === 'doctor' && String(user.id) === String(id);
    const isAuthorized = isAdmin || isSameDoctor;

    console.log(`🔍 Authorization check: isAdmin=${isAdmin}, isSameDoctor=${isSameDoctor}, isAuthorized=${isAuthorized}`);

    if (!isAuthorized) {
      console.error(`❌ Doctor Update: User ${user.email} (role: ${user.role}, id: ${user.id}) is NOT authorized to update doctor ${id}`);
      return new Response(JSON.stringify({
        success: false,
        message: `No autorizado. Tu rol: ${user.role}, Tu ID: ${user.id}, Doctor a editar: ${id}, isAdmin: ${isAdmin}, isSameDoctor: ${isSameDoctor}`
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`✅ Doctor Update: Authorization granted for ${user.email}`);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const document_number = formData.get('document_number') as string;
    const phone = formData.get('phone') as string;
    const specialization = formData.get('specialization') as string;
    const professional_license = formData.get('professional_license') as string;
    const password = formData.get('password') as string;
    const is_active = formData.get('is_active') === '1';
    const signatureFile = formData.get('signature') as File | null;
    const existingSignaturePath = formData.get('existing_signature_path') as string;
    const removeSignature = formData.get('remove_signature') === '1';

    // Validaciones
    if (!id || !name || !email || !document_number) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID, nombre, email y documento son requeridos'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el doctor existe
    const [existingDoctor] = await db.execute(
      'SELECT id FROM users WHERE id = ? AND role = "doctor"',
      [id]
    );

    if ((existingDoctor as any[]).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Doctor no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el email ya existe (excepto el doctor actual)
    const [existingUser] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, id]
    );

    if ((existingUser as any[]).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe otro usuario con este email'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el documento ya existe (excepto el doctor actual)
    const [existingDoc] = await db.execute(
      'SELECT id FROM users WHERE document_number = ? AND id != ?',
      [document_number, id]
    );

    if ((existingDoc as any[]).length > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe otro usuario con este número de documento'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Procesar firma
    let signaturePath: string | null = existingSignaturePath || null;

    // Si se solicita eliminar la firma
    if (removeSignature && existingSignaturePath) {
      await R2StorageService.deleteFile(existingSignaturePath);
      signaturePath = null;
      console.log(`✅ Firma de doctor eliminada`);
    }
    // Si se subió una nueva firma
    else if (signatureFile && signatureFile.size > 0) {
      // Validar tamaño (2 MB máximo)
      if (signatureFile.size > 2 * 1024 * 1024) {
        return new Response(JSON.stringify({
          success: false,
          message: 'La imagen de firma no debe superar 2 MB'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Eliminar firma anterior si existe
      if (existingSignaturePath) {
        await R2StorageService.deleteFile(existingSignaturePath);
      }

      // Subir nueva firma
      const timestamp = Date.now();
      const fileExtension = signatureFile.name.split('.').pop() || 'png';
      const key = `doctors/${id}/signature_${timestamp}.${fileExtension}`;

      const arrayBuffer = await signatureFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      signaturePath = await R2StorageService.uploadFile(buffer, key, signatureFile.type);

      console.log(`✅ Firma de doctor actualizada: ${signaturePath}`);
    }

    // Preparar la actualización
    let updateQuery = `
      UPDATE users SET
        name = ?,
        email = ?,
        document_number = ?,
        phone = ?,
        specialization = ?,
        professional_license = ?,
        is_active = ?,
        signature_path = ?
    `;
    let updateParams: any[] = [
      name,
      email,
      document_number,
      phone || null,
      specialization || 'Medicina General',
      professional_license || null,
      is_active ? 1 : 0,
      signaturePath
    ];

    // Si se proporcionó una nueva contraseña, incluirla en la actualización
    if (password && password.trim() !== '') {
      const passwordHash = await hashPassword(password);
      updateQuery += ', password_hash = ?';
      updateParams.push(passwordHash);
    }

    updateQuery += ' WHERE id = ?';
    updateParams.push(id);

    await db.execute(updateQuery, updateParams);

    return new Response(JSON.stringify({
      success: true,
      message: 'Doctor actualizado correctamente'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error actualizando doctor:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error al actualizar doctor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
