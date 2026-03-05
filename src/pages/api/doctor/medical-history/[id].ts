// API endpoint para obtener detalles de una historia médica específica
import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth.js';
import { MedicalHistoryService } from '../../../../lib/medical-history-service.js';

export const GET: APIRoute = async ({ params, cookies }) => {
  try {
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!user || user.role !== 'doctor') {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const historyId = params.id;

    if (!historyId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de historia médica requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener la historia médica
    const result = await MedicalHistoryService.getMedicalHistoryById(parseInt(historyId));

    if (result.success) {
      // En salud ocupacional, los doctores pueden ver historias de otros doctores
      // Solo verificamos que sea un doctor autorizado
      return new Response(JSON.stringify({
        success: true,
        data: result.data
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en GET /api/doctor/medical-history/[id]:', error);
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
    // Verificar autenticación
    const user = requireAuth(cookies);
    if (!user || user.role !== 'doctor') {
      return new Response(JSON.stringify({
        success: false,
        message: 'No autorizado'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const historyId = params.id;

    if (!historyId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de historia médica requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener datos del cuerpo de la petición
    const data = await request.json();

    // Verificar que la historia médica existe y pertenece al doctor
    const existingHistory = await MedicalHistoryService.getMedicalHistoryById(parseInt(historyId));
    
    if (!existingHistory.success) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Historia médica no encontrada'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (existingHistory.data.doctor_id !== user.id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No tiene acceso para editar esta historia médica'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Actualizar la historia médica
    const result = await MedicalHistoryService.updateMedicalHistory(parseInt(historyId), data);

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        message: result.message,
        data: result.medical_history
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en PUT /api/doctor/medical-history/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};