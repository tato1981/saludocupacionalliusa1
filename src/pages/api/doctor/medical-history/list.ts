// API endpoint para obtener todas las historias médicas de un paciente
import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth.js';
import { MedicalHistoryService } from '../../../../lib/medical-history-service.js';

export const GET: APIRoute = async ({ url, cookies }) => {
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

    const urlParams = new URL(url).searchParams;
    const patientId = urlParams.get('patient_id');

    if (!patientId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'patient_id es requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Obtener las historias médicas del paciente
    const result = await MedicalHistoryService.getPatientMedicalHistories(parseInt(patientId));

    if (result.success) {
      return new Response(JSON.stringify({
        success: true,
        data: result.data || []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: result.message || 'Error al obtener historias médicas'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error en GET /api/doctor/medical-history/list:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};