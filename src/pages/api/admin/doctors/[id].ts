import type { APIRoute } from 'astro';
import { requireAuth, hasRole } from '../../../../lib/auth';
import { db } from '../../../../lib/database';

export const DELETE: APIRoute = async ({ params, cookies }) => {
  try {
    
    const user = requireAuth(cookies);
    if (!hasRole(user, 'superadmin')) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No autorizado' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const doctorId = params.id;
    if (!doctorId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'ID de doctor requerido'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar que el doctor existe y es doctor
    const [doctorRows] = await db.execute(
      'SELECT id, name, email FROM users WHERE id = ? AND role = "doctor"',
      [doctorId]
    );

    if ((doctorRows as any[]).length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Doctor no encontrado'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const doctor = (doctorRows as any[])[0];

    // Verificar si el doctor tiene pacientes asignados
    const [patientRows] = await db.execute(
      'SELECT COUNT(*) as patient_count FROM patients WHERE assigned_doctor_id = ?',
      [doctorId]
    );

    const patientCount = (patientRows as any[])[0].patient_count;

    if (patientCount > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: `No se puede eliminar el doctor porque tiene ${patientCount} paciente(s) asignado(s). Primero debe reasignar los pacientes a otro doctor.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verificar si el doctor tiene citas programadas futuras
    const [appointmentRows] = await db.execute(
      'SELECT COUNT(*) as appointment_count FROM appointments WHERE doctor_id = ? AND appointment_date >= CURDATE() AND status != "cancelada"',
      [doctorId]
    );

    const appointmentCount = (appointmentRows as any[])[0].appointment_count;

    if (appointmentCount > 0) {
      return new Response(JSON.stringify({
        success: false,
        message: `No se puede eliminar el doctor porque tiene ${appointmentCount} cita(s) programada(s). Primero debe cancelar o reasignar las citas.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Eliminar el doctor
    await db.execute('DELETE FROM users WHERE id = ?', [doctorId]);

    return new Response(JSON.stringify({
      success: true,
      message: 'Doctor eliminado correctamente',
      data: { deletedDoctor: doctor }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en DELETE /api/admin/doctors/[id]:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Error interno del servidor'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
