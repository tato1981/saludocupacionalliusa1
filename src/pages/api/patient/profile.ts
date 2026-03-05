import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/database';

export const GET: APIRoute = async ({ cookies }) => {
  try {
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!user) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No autorizado' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Buscar el perfil del paciente usando el email del usuario
    const [rows] = await db.execute(`
      SELECT * FROM patients 
      WHERE email = ? OR created_by_user_id = ?
    `, [user.email, user.id]);

    const patients = rows as any[];

    if (patients.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Perfil de paciente no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Devolver información del paciente
    const patient = patients[0];
    
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: patient.id,
        name: patient.name,
        email: patient.email,
        phone: patient.phone,
        document_type: patient.document_type,
        document_number: patient.document_number,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        blood_type: patient.blood_type,
        address: patient.address,
        occupation: patient.occupation,
        company: patient.company,
        emergency_contact_name: patient.emergency_contact_name,
        emergency_contact_phone: patient.emergency_contact_phone,
        allergies: patient.allergies,
        medications: patient.medications,
        medical_conditions: patient.medical_conditions
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/patient/profile:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};