import type { APIRoute } from 'astro';
import { AppointmentService } from '@/lib/appointment-service';
import { requireAuth, hasRole } from '@/lib/auth';

export const GET: APIRoute = async ({ params, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'staff')) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No autorizado'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const appointmentId = params.id;
    if (!appointmentId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'ID de cita requerido'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const appointment = await AppointmentService.getAppointmentById(parseInt(appointmentId));

    if (!appointment) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Cita no encontrada'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: appointment
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error en GET /api/admin/appointments/[id]:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error interno del servidor'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  try {
    const user = requireAuth(cookies);
    if (!hasRole(user, 'staff')) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No autorizado'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const appointmentId = params.id;
    if (!appointmentId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'ID de cita requerido'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const body = await request.json();

    const hasScheduleFields =
      body.appointmentDate ||
      body.appointmentTime ||
      body.doctorId ||
      body.appointmentType ||
      body.reason ||
      body.durationMinutes;

    if (!hasScheduleFields && !body.status) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No se proporcionaron cambios para la cita'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const id = parseInt(appointmentId);

    if (!hasScheduleFields && body.status) {
      const ok = await AppointmentService.updateAppointmentStatus(id, body.status, body.notes);
      if (!ok) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'No se pudo actualizar el estado de la cita'
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Estado de la cita actualizado correctamente'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const updateData = {
      doctorId: body.doctorId ? parseInt(body.doctorId) : undefined,
      appointmentDate: body.appointmentDate || undefined,
      appointmentTime: body.appointmentTime || undefined,
      appointmentType: body.appointmentType || undefined,
      reason: body.reason || undefined,
      durationMinutes: body.durationMinutes ? parseInt(body.durationMinutes) : undefined,
      status: body.status || undefined
    };

    const result = await AppointmentService.updateAppointment(id, updateData);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          message: result.message
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: result.message,
        data: result.appointment
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error en PATCH /api/admin/appointments/[id]:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Error interno del servidor'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

