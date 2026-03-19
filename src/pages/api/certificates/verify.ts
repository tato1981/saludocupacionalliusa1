import type { APIRoute } from 'astro';
import { CertificateService } from '../../../lib/certificate-service.js';

function asDateOnlyString(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const str = value.trim();
    if (!str) return null;
    return str.includes('T') ? str.split('T')[0] : str;
  }
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return null;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const code = new URL(url).searchParams.get('code');
    if (!code) {
      return new Response(JSON.stringify({ success: false, message: 'code es requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const record = await CertificateService.getCertificateByCode(code);
    if (!record) {
      return new Response(JSON.stringify({ success: false, message: 'Certificado no encontrado', verification_status: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      verification_status: 'valid',
      data: {
        patient_id: record.patient_id,
        patient_name: record.patient_name,
        document_type: record.document_type,
        document_number: record.document_number,
        company: record.company,
        occupation: record.occupation,
        date_of_birth: asDateOnlyString(record.date_of_birth),
        doctor_id: record.doctor_id,
        doctor_name: record.doctor_name,
        appointment_id: record.appointment_id,
        appointment_type: record.appointment_type,
        aptitude_status: record.aptitude_status,
        restrictions: record.restrictions,
        recommendations: record.recommendations,
        validity_start: asDateOnlyString(record.validity_start),
        validity_end: asDateOnlyString(record.validity_end),
        certificate_date: record.certificate_date,
        created_at: record.created_at,
        verification_code: record.verification_code
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error en GET /api/certificates/verify:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
