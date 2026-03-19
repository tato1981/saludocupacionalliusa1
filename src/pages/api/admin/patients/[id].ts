import type { APIRoute } from 'astro';
import { PatientService } from '@/lib/patient-service';
import { requireAuth, hasRole } from '@/lib/auth';
import { MigrationService } from '@/lib/migration-service';


export const GET: APIRoute = async ({ params, cookies }) => {
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

    const patientId = params.id;
    if (!patientId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de paciente requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const patient = await PatientService.getPatientById(parseInt(patientId));

    if (!patient) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Paciente no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: patient
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/admin/patients/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request, cookies }) => {
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

    const patientId = params.id;
    if (!patientId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de paciente requerido'
      }), {
        status: 400,
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
    let formattedBirthDate = birthDateStr;
    
    if (birthDateStr.includes('T')) {
      formattedBirthDate = birthDateStr.split('T')[0];
    }
    
    const birthDate = new Date(formattedBirthDate + 'T00:00:00.000Z');
    const currentDate = new Date();
    currentDate.setHours(23, 59, 59, 999);
    
    if (birthDate > currentDate) {
      return new Response(JSON.stringify({
        success: false,
        message: 'La fecha de nacimiento no puede ser mayor a la fecha actual'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Preparar datos para actualización
    const parsedPatientId = parseInt(patientId);

    const patientData = {
      name: body.name,
      email: body.email || undefined,
      phone: body.phone || undefined,
      profilePhotoUrl: body.profilePhotoUrl || undefined,
      signatureUrl: body.signatureUrl || undefined,
      documentType: body.documentType,
      documentNumber: body.documentNumber,
      dateOfBirth: formattedBirthDate,
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
      updatedBy: user.id
    };

    const result = await PatientService.updatePatientAdmin(parsedPatientId, patientData);

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        data: result.patient,
        message: 'Paciente actualizado exitosamente'
      }), {
        status: 200,
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
    console.error('Error en PUT /api/admin/patients/[id]:', error);
    
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
    if (!hasRole(user, 'staff')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No autorizado' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const patientId = params.id;
    if (!patientId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de paciente requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await PatientService.deletePatientAdmin(parseInt(patientId));

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Paciente eliminado exitosamente'
      }), {
        status: 200,
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

  } catch (error) {
    console.error('Error en DELETE /api/admin/patients/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
