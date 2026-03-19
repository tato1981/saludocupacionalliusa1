import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { db } from '../../../../lib/database';
import { CertificateService } from '../../../../lib/certificate-service';

export const GET: APIRoute = async ({ params, cookies }) => {
  const { id } = params;
  const user = requireAuth(cookies);

  if (!user || user.role !== 'company' || !user.company_id) {
    return new Response('No autorizado', { status: 401 });
  }

  if (!id) {
    return new Response('ID de historia médica requerido', { status: 400 });
  }

  try {
    // Verificar que la historia médica pertenezca a un empleado de la empresa
    const [rows] = await db.execute(
      `SELECT mh.*, p.company_id 
       FROM medical_histories mh
       JOIN patients p ON mh.patient_id = p.id
       WHERE mh.id = ? AND p.company_id = ?`,
      [id, user.company_id]
    );

    const records = rows as any[];

    if (records.length === 0) {
      return new Response('Historia médica no encontrada o no pertenece a su empresa', { status: 404 });
    }

    const record = records[0];

    // Si no tiene código de verificación, generarlo (para compatibilidad)
    if (!record.verification_code) {
      // Generar código temporal para visualización
      record.verification_code = `VIEW-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    // Generar PDF usando el servicio existente
    const pdfBuffer = await CertificateService.renderPDFFromRecord(record);

    return new Response(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="concepto_medico_${id}.pdf"`
      }
    });

  } catch (error) {
    console.error('Error generando PDF:', error);
    return new Response('Error interno del servidor al generar el PDF', { status: 500 });
  }
};
