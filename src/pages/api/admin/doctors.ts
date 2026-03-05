import type { APIRoute } from 'astro';
import { db } from '../../../lib/database';

interface Doctor {
  id: number;
  name: string;
  email: string;
  specialization?: string;
  phone?: string;
  is_active?: number;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    // Consulta para obtener todos los doctores activos con sus especialidades
    const query = `
      SELECT 
        id,
        name,
        email,
        specialization,
        phone,
        is_active
      FROM users 
      WHERE role = 'doctor' 
        AND (is_active = 1 OR is_active IS NULL)
      ORDER BY name ASC
    `;

    const [doctorsResult] = await db.execute(query);
    const doctors = doctorsResult as Doctor[];
    
    // Formatear la respuesta para el frontend
    const formattedDoctors = doctors.map((doctor: Doctor) => ({
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      specialization: doctor.specialization || 'Medicina General',
      phone: doctor.phone,
      isActive: doctor.is_active !== 0
    }));

    return new Response(JSON.stringify({
      success: true,
      data: formattedDoctors,
      message: `Se encontraron ${doctors.length} doctores disponibles`
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo doctores:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Error interno del servidor',
      details: errorMessage
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};