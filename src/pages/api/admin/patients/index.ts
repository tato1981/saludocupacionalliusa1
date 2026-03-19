import type { APIRoute } from 'astro';
import { PatientService } from '@/lib/patient-service';
import { requireAuth, hasRole } from '@/lib/auth';
import { MigrationService } from '@/lib/migration-service';


export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'staff')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      await MigrationService.runMigrations();
    } catch (migrationError) {
      console.warn('⚠️ Error en migraciones (continuando):', migrationError);
    }

    // Obtener todos los pacientes
    const patients = await PatientService.getAllPatients();

    return new Response(JSON.stringify({
      success: true,
      data: patients
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/admin/patients:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    
    // Ejecutar migraciones automáticamente
    try {
      await MigrationService.runMigrations();
    } catch (migrationError) {
      console.warn('⚠️ Error en migraciones (continuando):', migrationError);
    }
    
    // Debug de cookies
    const token = cookies.get('auth-token')?.value;
    
    const user = requireAuth(cookies);
    
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No autorizado',
        debug: {
          hasUser: !!user,
          userRole: user?.role,
          isAdmin: user?.role === 'admin'
        }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    
    // Validar campos requeridos
    const requiredFields = ['name', 'documentType', 'documentNumber', 'dateOfBirth', 'gender'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(JSON.stringify({
          success: false,
          message: `El campo ${field} es requerido`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Validar fecha de nacimiento - no puede ser mayor a la fecha actual
    const birthDateStr = body.dateOfBirth;
    // Asegurar que sea una fecha en formato YYYY-MM-DD
    let formattedBirthDate = birthDateStr;
    
    if (birthDateStr.includes('T')) {
      // Si viene en formato ISO, extraer solo la fecha
      formattedBirthDate = birthDateStr.split('T')[0];
    }
    
    const birthDate = new Date(formattedBirthDate + 'T00:00:00.000Z');
    const currentDate = new Date();
    currentDate.setHours(23, 59, 59, 999); // Final del día actual
    
    if (birthDate > currentDate) {
      return new Response(JSON.stringify({
        success: false,
        message: 'La fecha de nacimiento no puede ser mayor a la fecha actual'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Crear el paciente
    const patientData = {
      name: body.name,
      email: body.email || undefined,
      phone: body.phone || undefined,
      profilePhotoUrl: body.profilePhotoUrl || undefined,
      signatureUrl: body.signatureUrl || undefined,
      documentType: body.documentType,
      documentNumber: body.documentNumber, // Ya está correcto
      dateOfBirth: formattedBirthDate, // Usar la fecha formateada
      gender: body.gender,
      bloodType: body.bloodType || undefined,
      address: body.address || undefined,
      occupation: body.occupation || undefined,
      company: body.company || undefined,
      companyId: body.companyId === '' ? null : (body.companyId ? parseInt(body.companyId) : undefined),
      emergencyContactName: body.emergencyContactName || undefined,
      emergencyContactPhone: body.emergencyContactPhone || undefined,
      allergies: body.allergies || undefined,
      medications: body.medications || undefined,
      medicalConditions: body.medicalConditions || undefined,
      createdBy: user.id
    };

    const result = await PatientService.createPatient(patientData);
    
    if (result.success && result.patient) {
      return new Response(JSON.stringify({
        success: true,
        data: result.patient,
        message: result.message
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error('Error en POST /api/admin/patients:', error);
    
    // Manejar errores específicos
    if (error.message?.includes('UNIQUE constraint failed') || 
        error.message?.includes('Duplicate entry')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Ya existe un paciente con este número de documento'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      message: 'Error al crear el paciente'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
