import type { APIRoute } from 'astro';
import { CertificateService } from '../../../lib/certificate-service.js';

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
      return new Response(JSON.stringify({ success: false, message: 'Certificado no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const pdfBuffer = await CertificateService.renderPDFFromRecord(record);

    // Forzar descarga en móviles y mejorar compatibilidad con visores
    const filename = `certificado_${record.id || 'verificacion'}.pdf`;
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
    console.error('Error en GET /api/certificates/download:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
