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
      return new Response(JSON.stringify({ success: false, message: 'Historia médica no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const pdfBuffer = await MedicalHistoryService.generatePDF(record.id);

    if (!pdfBuffer) {
      return new Response(JSON.stringify({ success: false, message: 'No se pudo generar el PDF de la historia médica' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const filename = `historia_medica_${record.id || 'verificacion'}.pdf`;
    return new Response(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
        'Cache-Control': 'no-store'
      }
    });
  } catch (error: any) {
    console.error('Error en GET /api/medical-history/download:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
