import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/auth';
import { db } from '../../../lib/database';

export const GET: APIRoute = async ({ cookies, url }) => {
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

    let doctorId;
    
    // Si es admin, puede ver todas las citas, si es doctor solo las suyas
    if (user.role === 'admin') {
      // Para admin, podemos recibir un parámetro de doctor específico
      const selectedDoctorId = url.searchParams.get('doctorId');
      doctorId = selectedDoctorId ? parseInt(selectedDoctorId) : null;
    } else if (user.role === 'doctor') {
      doctorId = user.id;
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: 'Sin permisos para ver citas'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Construir query según permisos
    let query = `
      SELECT a.*, 
             p.name as patient_name,
             p.document_number as patient_document,
             p.phone as patient_phone,
             COALESCE(c.name, p.company) as patient_company,
             p.photo_path as patient_photo_path,
             u.name as doctor_name,
             (SELECT id FROM work_certificates WHERE appointment_id = a.id ORDER BY id DESC LIMIT 1) as certificate_id,
             (SELECT verification_code FROM work_certificates WHERE appointment_id = a.id ORDER BY id DESC LIMIT 1) as verification_code
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN users u ON a.doctor_id = u.id
    `;

    const params: any[] = [];

    if (doctorId) {
      query += ' WHERE a.doctor_id = ?';
      params.push(doctorId);
    }

    query += ' ORDER BY a.appointment_date DESC LIMIT 10';

    const [rows] = await db.execute(query, params);

    return new Response(JSON.stringify({
      success: true,
      data: rows
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en GET /api/doctor/appointments:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};