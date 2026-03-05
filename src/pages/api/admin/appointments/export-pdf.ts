import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '../../../../lib/auth';
import PDFDocument from 'pdfkit';
import { db } from '../../../../lib/database';

export const GET: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const doctorId = url.searchParams.get('doctorId');
    const companyId = url.searchParams.get('companyId');
    const date = url.searchParams.get('date');

    let query = `
      SELECT 
        a.*,
        p.name as patient_name,
        p.document_number as patient_document,
        COALESCE(c.name, p.company) as patient_company,
        u.name as doctor_name,
        u.specialization as doctor_specialization
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN companies c ON p.company_id = c.id
      LEFT JOIN users u ON a.doctor_id = u.id
      WHERE 1=1
    `;
    
    const params: any[] = [];

    if (status) {
      query += ` AND a.status = ?`;
      params.push(status);
    }
    
    if (doctorId) {
      query += ` AND a.doctor_id = ?`;
      params.push(doctorId);
    }

    if (date) {
      query += ` AND DATE(a.appointment_date) = ?`;
      params.push(date);
    }

    if (companyId) {
      query += ` AND p.company_id = ?`;
      params.push(companyId);
    }

    query += ` ORDER BY a.appointment_date DESC`;

    const [rows] = await db.execute(query, params);
    const appointments = rows as any[];

    // Create PDF
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    
    // Header
    doc.fontSize(18).text('Reporte de Citas', { align: 'center' });
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-ES')}`, { align: 'right' });
    doc.moveDown();

    // Table configuration
    const tableTop = 100;
    const itemHeight = 20;
    const cols = {
      date: 30,
      patient: 130,
      document: 280,
      company: 380,
      doctor: 530,
      status: 680
    };

    let y = tableTop;

    // Draw Header
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Fecha/Hora', cols.date, y);
    doc.text('Paciente', cols.patient, y);
    doc.text('Documento', cols.document, y);
    doc.text('Empresa', cols.company, y);
    doc.text('Doctor', cols.doctor, y);
    doc.text('Estado', cols.status, y);

    y += itemHeight;
    doc.moveTo(30, y - 5).lineTo(800, y - 5).stroke();

    // Draw Rows
    doc.font('Helvetica').fontSize(9);

    appointments.forEach((app, i) => {
      // Check for new page
      if (y > 550) {
        doc.addPage({ layout: 'landscape', margin: 30 });
        y = 50;
        
        // Header on new page
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Fecha/Hora', cols.date, y);
        doc.text('Paciente', cols.patient, y);
        doc.text('Documento', cols.document, y);
        doc.text('Empresa', cols.company, y);
        doc.text('Doctor', cols.doctor, y);
        doc.text('Estado', cols.status, y);
        y += itemHeight;
        doc.moveTo(30, y - 5).lineTo(800, y - 5).stroke();
        doc.font('Helvetica').fontSize(9);
      }

      const dateStr = new Date(app.appointment_date).toLocaleDateString('es-ES');
      const timeStr = app.appointment_time || '';
      
      doc.text(`${dateStr} ${timeStr}`, cols.date, y, { width: 90 });
      doc.text(app.patient_name || '', cols.patient, y, { width: 140, ellipsis: true });
      doc.text(app.patient_document || '', cols.document, y, { width: 90 });
      doc.text(app.patient_company || '-', cols.company, y, { width: 140, ellipsis: true });
      doc.text(app.doctor_name || '', cols.doctor, y, { width: 140, ellipsis: true });
      doc.text(getStatusText(app.status), cols.status, y);

      y += itemHeight;
      // Light gray line between rows
      doc.save()
         .strokeColor('#eeeeee')
         .moveTo(30, y - 5)
         .lineTo(800, y - 5)
         .stroke()
         .restore();
    });

    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        const result = Buffer.concat(chunks);
        resolve(new Response(result, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="reporte_citas_${new Date().toISOString().split('T')[0]}.pdf"`
          }
        }));
      });
      doc.on('error', reject);
    });

  } catch (error) {
    console.error('Error creating PDF:', error);
    return new Response('Error creating PDF', { status: 500 });
  }
};

function getStatusText(status: string): string {
  switch (status) {
    case 'programada': return 'Programada';
    case 'en_progreso': return 'En progreso';
    case 'completada': return 'Completada';
    case 'cancelada': return 'Cancelada';
    case 'no_asistio': return 'No asistió';
    default: return status;
  }
}
