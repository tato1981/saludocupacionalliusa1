import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth.js';
import { CertificateService } from '../../../../lib/certificate-service.js';
import { PatientService } from '../../../../lib/patient-service.js';
import { CompanyService } from '../../../../lib/company-service.js';
import { MailService } from '../../../../lib/mail-service.js';
import { db } from '../../../../lib/database.js';
import { isValidEmail } from '../../../../lib/utils.js';

const ALLOWED_STATUS = ['apto', 'apto_con_restricciones', 'apto_manipulacion_alimentos', 'apto_trabajo_alturas', 'apto_espacios_confinados', 'apto_conduccion'];

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!user) {
      return new Response(JSON.stringify({ success: false, message: 'No autenticado' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Admins y doctores pueden generar certificados
    if (user.role !== 'admin' && user.role !== 'doctor') {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado: requiere rol admin o doctor' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const {
      patient_id,
      appointment_id,
      aptitude_status,
      restrictions,
      recommendations,
      validity_start,
      validity_end
    } = body || {};

    // Validaciones mínimas
    if (!patient_id || !aptitude_status) {
      return new Response(JSON.stringify({ success: false, message: 'patient_id y aptitude_status son requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!ALLOWED_STATUS.includes(aptitude_status)) {
      return new Response(JSON.stringify({ success: false, message: 'aptitude_status inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Para admins, appointment_id es obligatorio para determinar el médico firmante
    if (!appointment_id) {
      return new Response(JSON.stringify({ success: false, message: 'appointment_id es requerido para emitir el certificado' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validar cita y obtener el médico evaluador de esa cita
    const [rows] = await db.execute('SELECT id, doctor_id, patient_id FROM appointments WHERE id = ?', [parseInt(appointment_id)]);
    const appts = rows as any[];
    if (appts.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Cita no encontrada' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const appt = appts[0];
    if (appt.patient_id !== parseInt(patient_id)) {
      return new Response(JSON.stringify({ success: false, message: 'La cita no corresponde al paciente especificado' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Si es un doctor, verificar que solo pueda emitir certificados de sus propias citas
    if (user.role === 'doctor' && appt.doctor_id !== user.id) {
      return new Response(JSON.stringify({ success: false, message: 'No autorizado: solo puede emitir certificados de sus propias citas' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Seguridad: exigir historia médica del paciente asociada a esta cita específica.
    let hasHistory = false;
    try {
      const [mhRowsAppt] = await db.execute('SELECT id FROM medical_histories WHERE patient_id = ? AND appointment_id = ? LIMIT 1', [parseInt(patient_id), parseInt(appointment_id)]);
      hasHistory = (mhRowsAppt as any[]).length > 0;
      
      if (!hasHistory) {
         return new Response(JSON.stringify({ 
           success: false, 
           message: 'No se puede generar el certificado porque no existe una historia médica asociada a esta cita.' 
         }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      hasHistory = false;
      console.error('Error verificando historia médica:', e);
      return new Response(JSON.stringify({ success: false, message: 'Error verificando historia médica' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!hasHistory) {
      return new Response(JSON.stringify({ success: false, message: 'No se puede emitir el certificado sin una historia médica registrada.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const signingDoctorId = appt.doctor_id; // el médico que atendió la cita

    // Emitir certificado firmado por el médico de la cita (no por el admin)
    console.log('🏥 Iniciando emisión de certificado...');
    const result = await CertificateService.issueCertificate({
      patientId: parseInt(patient_id),
      doctorId: signingDoctorId,
      appointmentId: parseInt(appointment_id),
      aptitudeStatus: aptitude_status,
      restrictions: restrictions || undefined,
      recommendations: recommendations || undefined,
      validityStart: validity_start || undefined,
      validityEnd: validity_end || undefined
    });
    console.log('✅ Certificado emitido exitosamente');

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, message: result.message || 'Error al emitir certificado' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Actualizar estado de la cita a 'completada' automáticamente
    try {
        await db.execute('UPDATE appointments SET status = ? WHERE id = ?', ['completada', parseInt(appointment_id)]);

        // Actualizar solicitud de examen a completada
        const [patientRows] = await db.execute(
          'SELECT document_number FROM patients WHERE id = ?',
          [parseInt(patient_id)]
        );

        if ((patientRows as any[]).length > 0) {
          const patientDocument = (patientRows as any[])[0].document_number;

          // Actualizar solicitudes de examen pendientes o agendadas a completadas
          await db.execute(
            `UPDATE exam_requests
             SET status = 'completed', updated_at = CURRENT_TIMESTAMP
             WHERE patient_document = ?
             AND status IN ('pending', 'scheduled')`,
            [patientDocument]
          );

          console.log(`✅ Solicitudes de examen actualizadas a 'completed' para paciente: ${patientDocument}`);
        }
    } catch (dbErr) {
        console.warn('⚠️ Error actualizando estado de cita/solicitud al emitir certificado:', dbErr);
        // No fallamos la request completa, pero logueamos
    }

    const pdfBase64 = result.pdfBuffer ? result.pdfBuffer.toString('base64') : undefined;

    // Enviar por email a la empresa si el paciente tiene company_id y contactos activos
    let emailStatus: { attempted: boolean; recipients?: string[]; sent?: boolean; error?: string } = { attempted: false };
    try {
      const patient = await PatientService.getPatientById(parseInt(patient_id));
      if (patient && patient.company_id) {
        const contacts = await CompanyService.getActiveCompanyContacts(patient.company_id);
        let emails = contacts.map((c: any) => c.email).filter((e: string) => !!e);

        // También incluir el email principal de la empresa
        const company = await CompanyService.getCompanyById(patient.company_id);
        if (company && company.email) {
          emails.push(company.email);
        }

        // NOTA: No se incluye el email del paciente por política de confidencialidad
        // Solo se envía a los contactos de la empresa
        emails = Array.from(new Set(emails));
        emailStatus.attempted = true;
        emailStatus.recipients = emails;
        if (emails.length > 0 && result.pdfBuffer) {
          const subject = `Certificado médico ocupacional - ${patient.name}`;
          const statusMap: Record<string, string> = {
            'apto': 'APTO PARA EL TRABAJO',
            'apto_con_restricciones': 'APTO CON RESTRICCIONES',
            'apto_manipulacion_alimentos': 'APTO PARA MANIPULACIÓN DE ALIMENTOS',
            'apto_trabajo_alturas': 'APTO PARA TRABAJO EN ALTURAS',
            'apto_espacios_confinados': 'APTO PARA ESPACIOS CONFINADOS',
            'apto_conduccion': 'APTO PARA CONDUCCIÓN'
          };
          const displayStatus = statusMap[aptitude_status] || aptitude_status;
          const html = `
            <div style="font-family: Arial, sans-serif; color:#1f2937; line-height:1.5;">
              <div style="max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <div style="background:#0e7490;color:#fff;padding:16px 20px;">
                  <h1 style="margin:0;font-size:18px;">Certificado de Aptitud Laboral</h1>
                </div>
                <div style="padding:20px;background:#fff;">
                  <p style="margin:0 0 12px 0;">Se ha emitido un certificado médico ocupacional para el trabajador <strong>${patient.name}</strong>.</p>
                  <p style="margin:0 0 12px 0;">Estado de aptitud: <strong>${displayStatus}</strong>.</p>
                  <p style="margin:0 0 12px 0;">Puede verificar la autenticidad en el siguiente enlace:</p>
                  <p style="margin:0 0 16px 0;"><a href="${result.verificationUrl}" style="color:#0ea5e9;text-decoration:underline;" target="_blank">${result.verificationUrl}</a></p>
                  <a href="${result.verificationUrl}" target="_blank" style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Verificar certificado</a>
                  <p style="margin:16px 0 0 0;font-size:12px;color:#6b7280;">Se adjunta el certificado en formato PDF.</p>
                </div>
                <div style="padding:12px 20px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
                  <p style="margin:0;">Este mensaje es automático. Si no corresponde, por favor ignore o contacte soporte.</p>
                </div>
              </div>
            </div>
          `;
          try {
            const sendResp = await MailService.sendMail({
              to: emails,
              subject,
              html,
              attachments: [{ filename: 'certificado.pdf', content: result.pdfBuffer, contentType: 'application/pdf' }]
            });
            emailStatus.sent = sendResp?.statusCode ? (sendResp.statusCode >= 200 && sendResp.statusCode < 300) : true;
          } catch (e: any) {
            emailStatus.error = e?.message || String(e);
            console.warn('⚠️ Error enviando correo de certificado:', e);
          }
        }
      }
    } catch (mailErr: any) {
      emailStatus.error = mailErr?.message || String(mailErr);
      console.warn('⚠️ No se pudo enviar el certificado por email:', mailErr);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Certificado emitido',
      data: {
        certificate_id: result.certificateId,
        verification_url: result.verificationUrl,
        pdf_base64: pdfBase64,
        email_status: emailStatus
      }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error en POST /api/doctor/certificates/create:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};