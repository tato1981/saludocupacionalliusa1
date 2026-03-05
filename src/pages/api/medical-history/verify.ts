import type { APIRoute } from 'astro';
import { MedicalHistoryService } from '../../../lib/medical-history-service.js';

export const GET: APIRoute = async ({ url }) => {
  try {
    const rawCode = new URL(url).searchParams.get('code');
    const code = rawCode ? rawCode.trim() : '';
    if (!code || code === '') {
      return new Response(JSON.stringify({ success: false, message: 'code es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const record = await MedicalHistoryService.getMedicalHistoryByVerificationCode(code);
    if (!record) {
      return new Response(JSON.stringify({ success: false, message: 'Historia médica no encontrada', verification_status: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      verification_status: 'valid',
      data: {
        id: record.id,
        patient_id: record.patient_id,
        patient_name: record.patient_name,
        document_type: record.document_type,
        document_number: record.document_number,
        company: record.company,
        patient_birth_date: record.patient_birth_date,
        doctor_id: record.doctor_id,
        doctor_name: record.doctor_name,
        doctor_specialization: record.doctor_specialization,
        doctor_professional_license: record.doctor_professional_license,
        appointment_id: record.appointment_id,
        appointment_type: record.appointment_type,
        appointment_date: record.appointment_date,
        symptoms: record.symptoms,
        diagnosis: record.diagnosis,
        cie10_code: record.cie10_code,
        treatment: record.treatment,
        medications: record.medications,
        recommendations: record.recommendations,
        aptitude_status: record.aptitude_status,
        restrictions: record.restrictions,
        next_appointment_date: record.next_appointment_date,
        notes: record.notes,
        created_at: record.created_at,
        verification_code: record.verification_code
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error en GET /api/medical-history/verify:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
