import type { APIRoute } from 'astro';
import { requireAuth } from '@/lib/auth.js';
import { MedicalHistoryService } from '@/lib/medical-history-service.js';

export const GET: APIRoute = async ({ params, cookies }) => {
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

    // Verificar que el usuario sea doctor
    if (user.role !== 'doctor') {
      return new Response(JSON.stringify({
        success: false,
        message: 'Solo los médicos pueden generar PDFs de historias médicas'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const medicalHistoryId = params.id;

    if (!medicalHistoryId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de historia médica requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('📄 Generando PDF para historia médica ID:', medicalHistoryId);

    // Generar PDF usando el servicio
    const pdfBuffer = await MedicalHistoryService.generatePDF(parseInt(medicalHistoryId));

    if (!pdfBuffer) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Error al generar el PDF'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ PDF generado exitosamente');

    // Retornar el PDF
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="historia_medica_${medicalHistoryId}.pdf"`,
        'Content-Length': pdfBuffer.length.toString()
      }
    });

  } catch (error) {
    console.error('❌ Error generando PDF de historia médica:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor al generar el PDF'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
