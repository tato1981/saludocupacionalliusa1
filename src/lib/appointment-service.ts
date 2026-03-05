// Servicio para manejar citas médicas
import { db } from './database.js';
import type { Appointment } from '../types/index.js';

export class AppointmentService {

  // Crear nueva cita
  static async createAppointment(appointmentData: {
    patientId: number;
    doctorId: number;
    appointmentDate: string;
    appointmentType: string;
    reason?: string;
    durationMinutes?: number;
    createdBy: number;
  }): Promise<{ success: boolean; message: string; appointment?: any }> {
    try {
      // Verificar que el paciente existe
      const [patientCheck] = await db.execute(
        'SELECT id FROM patients WHERE id = ?',
        [appointmentData.patientId]
      );

      if ((patientCheck as any[]).length === 0) {
        return {
          success: false,
          message: 'El paciente especificado no existe'
        };
      }

      // Verificar que el doctor existe
      const [doctorCheck] = await db.execute(
        'SELECT id FROM users WHERE id = ? AND role IN ("admin", "doctor")',
        [appointmentData.doctorId]
      );

      if ((doctorCheck as any[]).length === 0) {
        return {
          success: false,
          message: 'El doctor especificado no existe o no tiene permisos'
        };
      }

      // Verificar disponibilidad (no hay otra cita en el mismo horario para el mismo doctor)
      const appointmentDateTime = new Date(appointmentData.appointmentDate);
      const endTime = new Date(appointmentDateTime.getTime() + (appointmentData.durationMinutes || 30) * 60000);

      const [conflicts] = await db.execute(`
        SELECT id FROM appointments 
        WHERE doctor_id = ? 
        AND status NOT IN ('cancelada', 'no_asistio')
        AND (
          (appointment_date <= ? AND DATE_ADD(appointment_date, INTERVAL duration_minutes MINUTE) > ?) OR
          (appointment_date < ? AND DATE_ADD(appointment_date, INTERVAL duration_minutes MINUTE) >= ?)
        )
      `, [appointmentData.doctorId, appointmentDateTime, appointmentDateTime, endTime, endTime]);

      if ((conflicts as any[]).length > 0) {
        return {
          success: false,
          message: 'El doctor ya tiene una cita programada en ese horario'
        };
      }

      const query = `
        INSERT INTO appointments (
          patient_id, doctor_id, appointment_date, appointment_type, 
          reason, duration_minutes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.execute(query, [
        appointmentData.patientId,
        appointmentData.doctorId,
        appointmentData.appointmentDate,
        appointmentData.appointmentType,
        appointmentData.reason || null,
        appointmentData.durationMinutes || 30,
        appointmentData.createdBy
      ]);

      const appointmentId = (result as any).insertId;

      return {
        success: true,
        message: 'Cita agendada exitosamente',
        appointment: { id: appointmentId, ...appointmentData }
      };

    } catch (error) {
      console.error('Error creando cita:', error);
      return {
        success: false,
        message: 'Error al agendar la cita'
      };
    }
  }

  // Obtener citas por fecha
  static async getAppointmentsByDate(date: string, doctorId?: number): Promise<Appointment[]> {
    try {
      let query = `
        SELECT a.*, 
               p.name as patient_name, p.document_number, p.phone as patient_phone,
               u.name as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN users u ON a.doctor_id = u.id
        WHERE DATE(a.appointment_date) = ?
      `;
      
      const params: any[] = [date];
      
      if (doctorId) {
        query += ' AND a.doctor_id = ?';
        params.push(doctorId);
      }
      
      query += ' ORDER BY a.appointment_date ASC';

      const [rows] = await db.execute(query, params);
      return rows as Appointment[];
    } catch (error) {
      console.error('Error obteniendo citas por fecha:', error);
      return [];
    }
  }

  // Obtener todas las citas (para admin)
  static async getAllAppointments(): Promise<Appointment[]> {
    try {
      const [rows] = await db.execute(`
        SELECT a.*, 
               p.name as patient_name,
               p.document_number as patient_document,
               u.name as doctor_name
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN users u ON a.doctor_id = u.id
        ORDER BY a.appointment_date DESC, a.appointment_time DESC
      `);

      return rows as Appointment[];
    } catch (error) {
      console.error('Error obteniendo todas las citas:', error);
      return [];
    }
  }

  // Obtener citas por rango de fechas
  static async getAppointmentsByDateRange(startDate: string, endDate: string, doctorId?: number): Promise<Appointment[]> {
    try {
      let query = `
        SELECT a.*, 
               p.name as patient_name, p.document_number, p.phone as patient_phone,
               u.name as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN users u ON a.doctor_id = u.id
        WHERE DATE(a.appointment_date) BETWEEN ? AND ?
      `;
      
      const params: any[] = [startDate, endDate];
      
      if (doctorId) {
        query += ' AND a.doctor_id = ?';
        params.push(doctorId);
      }
      
      query += ' ORDER BY a.appointment_date ASC';

      const [rows] = await db.execute(query, params);
      return rows as Appointment[];
    } catch (error) {
      console.error('Error obteniendo citas por rango:', error);
      return [];
    }
  }

  // Obtener citas de un paciente
  static async getAppointmentsByPatient(patientId: number): Promise<Appointment[]> {
    try {
      const query = `
        SELECT a.*, 
               p.name as patient_name,
               u.name as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN users u ON a.doctor_id = u.id
        WHERE a.patient_id = ?
        ORDER BY a.appointment_date DESC
      `;

      const [rows] = await db.execute(query, [patientId]);
      return rows as Appointment[];
    } catch (error) {
      console.error('Error obteniendo citas del paciente:', error);
      return [];
    }
  }

  // Obtener citas de un doctor
  static async getAppointmentsByDoctor(doctorId: number, limit?: number): Promise<Appointment[]> {
    try {
      let query = `
        SELECT a.*, 
               p.name as patient_name, p.document_number, p.phone as patient_phone,
               u.name as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN users u ON a.doctor_id = u.id
        WHERE a.doctor_id = ?
        ORDER BY a.appointment_date ASC
      `;
      
      const params: any[] = [doctorId];
      
      if (limit) {
        query += ' LIMIT ?';
        params.push(limit);
      }

      const [rows] = await db.execute(query, params);
      return rows as Appointment[];
    } catch (error) {
      console.error('Error obteniendo citas del doctor:', error);
      return [];
    }
  }

  static async getAppointmentById(id: number): Promise<any | null> {
    try {
      const query = `
        SELECT a.*,
               p.name as patient_name,
               p.document_number as patient_document,
               u.name as doctor_name,
               u.specialization as doctor_specialization
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN users u ON a.doctor_id = u.id
        WHERE a.id = ?
      `;

      const [rows] = await db.execute(query, [id]);
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return (rows as any[])[0];
    } catch (error) {
      console.error('Error obteniendo cita por id:', error);
      return null;
    }
  }

  static async updateAppointment(
    id: number,
    updateData: {
      doctorId?: number;
      appointmentDate?: string;
      appointmentTime?: string;
      appointmentType?: string;
      reason?: string;
      durationMinutes?: number;
      status?: string;
    }
  ): Promise<{ success: boolean; message: string; appointment?: any }> {
    try {
      const [existingRows] = await db.execute('SELECT * FROM appointments WHERE id = ?', [id]);
      if (!Array.isArray(existingRows) || existingRows.length === 0) {
        return {
          success: false,
          message: 'Cita no encontrada'
        };
      }

      const existing = (existingRows as any[])[0];

      const doctorId = updateData.doctorId ?? existing.doctor_id;
      const appointmentType = updateData.appointmentType ?? existing.appointment_type;
      const durationMinutes = updateData.durationMinutes ?? existing.duration_minutes ?? 30;
      const status = updateData.status ?? existing.status;
      const reason =
        typeof updateData.reason === 'string'
          ? updateData.reason
          : existing.reason ?? null;

      const existingDate = new Date(existing.appointment_date);
      const pad = (n: number) => n.toString().padStart(2, '0');

      const datePart =
        updateData.appointmentDate ||
        `${existingDate.getFullYear()}-${pad(existingDate.getMonth() + 1)}-${pad(existingDate.getDate())}`;

      const timePart =
        updateData.appointmentTime ||
        `${pad(existingDate.getHours())}:${pad(existingDate.getMinutes())}`;

      const appointmentDateTimeString = `${datePart} ${timePart}`;
      const appointmentDateTime = new Date(appointmentDateTimeString);
      const endTime = new Date(appointmentDateTime.getTime() + durationMinutes * 60000);

      const [conflicts] = await db.execute(
        `
        SELECT id FROM appointments 
        WHERE doctor_id = ? 
        AND id != ?
        AND status NOT IN ('cancelada', 'no_asistio')
        AND (
          (appointment_date <= ? AND DATE_ADD(appointment_date, INTERVAL duration_minutes MINUTE) > ?) OR
          (appointment_date < ? AND DATE_ADD(appointment_date, INTERVAL duration_minutes MINUTE) >= ?)
        )
      `,
        [doctorId, id, appointmentDateTime, appointmentDateTime, endTime, endTime]
      );

      if (Array.isArray(conflicts) && conflicts.length > 0) {
        return {
          success: false,
          message: 'El doctor ya tiene una cita programada en ese horario'
        };
      }

      const [doctorCheck] = await db.execute(
        'SELECT id FROM users WHERE id = ? AND role IN ("admin", "doctor")',
        [doctorId]
      );

      if (!Array.isArray(doctorCheck) || doctorCheck.length === 0) {
        return {
          success: false,
          message: 'El doctor especificado no existe o no tiene permisos'
        };
      }

      await db.execute(
        `
        UPDATE appointments
        SET doctor_id = ?, appointment_date = ?, appointment_type = ?, reason = ?, duration_minutes = ?, status = ?
        WHERE id = ?
      `,
        [doctorId, appointmentDateTimeString, appointmentType, reason, durationMinutes, status, id]
      );

      return {
        success: true,
        message: 'Cita actualizada exitosamente',
        appointment: {
          id,
          patientId: existing.patient_id,
          doctorId,
          appointmentDate: appointmentDateTimeString,
          appointmentType,
          reason,
          durationMinutes,
          status
        }
      };
    } catch (error) {
      console.error('Error actualizando cita:', error);
      return {
        success: false,
        message: 'Error al actualizar la cita'
      };
    }
  }

  static async updateAppointmentStatus(id: number, status: string, notes?: string): Promise<boolean> {
    try {
      let query = 'UPDATE appointments SET status = ?';
      const params: any[] = [status];
      
      if (notes) {
        query += ', notes = ?';
        params.push(notes);
      }
      
      query += ' WHERE id = ?';
      params.push(id);

      await db.execute(query, params);
      return true;
    } catch (error) {
      console.error('Error actualizando estado de cita:', error);
      return false;
    }
  }

  // Cancelar cita
  static async cancelAppointment(id: number, reason?: string): Promise<boolean> {
    try {
      const notes = reason ? `Cancelada: ${reason}` : 'Cita cancelada';
      await db.execute(
        'UPDATE appointments SET status = "cancelada", notes = ? WHERE id = ?',
        [notes, id]
      );
      return true;
    } catch (error) {
      console.error('Error cancelando cita:', error);
      return false;
    }
  }

  // Obtener próximas citas (hoy y siguientes días)
  static async getUpcomingAppointments(doctorId?: number, days: number = 7): Promise<Appointment[]> {
    try {
      let query = `
        SELECT a.*, 
               p.name as patient_name, p.document_number, p.phone as patient_phone,
               u.name as doctor_name
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN users u ON a.doctor_id = u.id
        WHERE a.appointment_date >= NOW() 
        AND a.appointment_date <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND a.status IN ('programada', 'confirmada')
      `;
      
      const params: any[] = [days];
      
      if (doctorId) {
        query += ' AND a.doctor_id = ?';
        params.push(doctorId);
      }
      
      query += ' ORDER BY a.appointment_date ASC';

      const [rows] = await db.execute(query, params);
      return rows as Appointment[];
    } catch (error) {
      console.error('Error obteniendo próximas citas:', error);
      return [];
    }
  }

  // Obtener estadísticas de citas
  static async getAppointmentStats(doctorId?: number): Promise<{
    todayTotal: number;
    todayCompleted: number;
    weekTotal: number;
    monthTotal: number;
    byStatus: { [key: string]: number };
    byType: { [key: string]: number };
  }> {
    try {
      let baseWhere = '';
      const params: any[] = [];
      
      if (doctorId) {
        baseWhere = 'WHERE doctor_id = ?';
        params.push(doctorId);
      }

      // Citas de hoy
      const [todayResult] = await db.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completada' THEN 1 ELSE 0 END) as completed
        FROM appointments 
        ${baseWhere ? baseWhere + ' AND' : 'WHERE'} DATE(appointment_date) = CURDATE()
      `, params);
      
      const todayStats = (todayResult as any[])[0];

      // Citas de esta semana
      const [weekResult] = await db.execute(`
        SELECT COUNT(*) as count 
        FROM appointments 
        ${baseWhere ? baseWhere + ' AND' : 'WHERE'} YEARWEEK(appointment_date) = YEARWEEK(CURDATE())
      `, params);
      
      const weekTotal = (weekResult as any[])[0].count;

      // Citas de este mes
      const [monthResult] = await db.execute(`
        SELECT COUNT(*) as count 
        FROM appointments 
        ${baseWhere ? baseWhere + ' AND' : 'WHERE'} YEAR(appointment_date) = YEAR(CURDATE()) 
        AND MONTH(appointment_date) = MONTH(CURDATE())
      `, params);
      
      const monthTotal = (monthResult as any[])[0].count;

      // Por estado
      const [statusResult] = await db.execute(`
        SELECT status, COUNT(*) as count 
        FROM appointments 
        ${baseWhere}
        GROUP BY status
      `, params);
      
      const byStatus: { [key: string]: number } = {};
      (statusResult as any[]).forEach(row => {
        byStatus[row.status] = row.count;
      });

      // Por tipo
      const [typeResult] = await db.execute(`
        SELECT appointment_type, COUNT(*) as count 
        FROM appointments 
        ${baseWhere}
        GROUP BY appointment_type
      `, params);
      
      const byType: { [key: string]: number } = {};
      (typeResult as any[]).forEach(row => {
        byType[row.appointment_type] = row.count;
      });

      return {
        todayTotal: todayStats.total,
        todayCompleted: todayStats.completed,
        weekTotal,
        monthTotal,
        byStatus,
        byType
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas de citas:', error);
      return {
        todayTotal: 0,
        todayCompleted: 0,
        weekTotal: 0,
        monthTotal: 0,
        byStatus: {},
        byType: {}
      };
    }
  }
}
