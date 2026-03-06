// Servicio para manejar pacientes
import { db } from './database.js';
import type { Patient, Appointment, MedicalRecord } from '../types/index.js';
import { StorageService } from './storage-service.js';
import fs from 'fs';
import path from 'path';

export class PatientService {
  
  // Crear nuevo paciente
  static async createPatient(patientData: {
    name: string;
    email?: string;
    phone?: string;
    documentType: string;
    documentNumber: string;
    dateOfBirth: string;
    gender: string;
    address?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    photoPath?: string;
    signaturePath?: string;
    occupation?: string;
    company?: string;
    companyId?: number | null; // ✅ nuevo: relación opcional a companies
    insuranceProvider?: string;
    insuranceNumber?: string;
    bloodType?: string;
    allergies?: string;
    medications?: string;
    medicalConditions?: string;
    createdBy: number;
  }): Promise<{ success: boolean; message: string; patient?: any }> {
    try {
      console.log('🏥 PatientService.createPatient - Iniciando...');
      console.log('📋 Datos recibidos:', JSON.stringify(patientData, null, 2));
      console.log('🔍 documentNumber:', patientData.documentNumber);
      console.log('🏢 Company Info - ID:', patientData.companyId, 'Text:', patientData.company);
      
      // Verificar si ya existe un paciente con ese documento
      const [existing] = await db.execute(
        'SELECT id FROM patients WHERE document_number = ?',
        [patientData.documentNumber]
      );

      if ((existing as any[]).length > 0) {
        return {
          success: false,
          message: 'Ya existe un paciente con ese número de documento'
        };
      }

      // Verificar si existe el campo identification_number en la tabla
      console.log('🔍 Verificando estructura de tabla...');
      const [tableStructure] = await db.execute(
        "SHOW COLUMNS FROM patients WHERE Field LIKE '%document%' OR Field LIKE '%identification%'"
      );
      
      const hasIdentificationNumber = (tableStructure as any[]).some(
        col => col.Field === 'identification_number'
      );
      
      console.log(`📋 Campo identification_number existe: ${hasIdentificationNumber ? '✅ SÍ' : '❌ NO'}`);

      // Construir query dinámicamente basado en la estructura de la tabla
      let query, values;
      
      if (hasIdentificationNumber) {
        console.log('📝 Insertando en ambos campos (document_number e identification_number)');
        query = `
          INSERT INTO patients (
            name, email, phone, document_type, document_number, identification_number,
            date_of_birth, gender, address, emergency_contact_name, emergency_contact_phone,
            photo_path, signature_path, occupation, company, company_id, blood_type, allergies, medications,
            medical_conditions, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        values = [
          patientData.name,
          patientData.email || null,
          patientData.phone || null,
          patientData.documentType,
          patientData.documentNumber,
          patientData.documentNumber, // Mismo valor para identification_number
          patientData.dateOfBirth,
          patientData.gender,
          patientData.address || null,
          patientData.emergencyContactName || null,
          patientData.emergencyContactPhone || null,
          patientData.photoPath || null,
          patientData.signaturePath || null,
          patientData.occupation || null,
          patientData.company || null,
          patientData.companyId, // Quitamos || null para permitir 0 si fuera válido, aunque null es el default
          patientData.bloodType || null,
          patientData.allergies || null,
          patientData.medications || null,
          patientData.medicalConditions || null,
          patientData.createdBy
        ];
      } else {
        console.log('📝 Insertando solo en document_number');
        query = `
          INSERT INTO patients (
            name, email, phone, document_type, document_number, date_of_birth,
            gender, address, emergency_contact_name, emergency_contact_phone,
            photo_path, signature_path, occupation, company, company_id, blood_type, allergies, medications,
            medical_conditions, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        values = [
          patientData.name,
          patientData.email || null,
          patientData.phone || null,
          patientData.documentType,
          patientData.documentNumber,
          patientData.dateOfBirth,
          patientData.gender,
          patientData.address || null,
          patientData.emergencyContactName || null,
          patientData.emergencyContactPhone || null,
          patientData.photoPath || null,
          patientData.signaturePath || null,
          patientData.occupation || null,
          patientData.company || null,
          patientData.companyId, // Quitamos || null
          patientData.bloodType || null,
          patientData.allergies || null,
          patientData.medications || null,
          patientData.medicalConditions || null,
          patientData.createdBy
        ];
      }
      
      console.log('💾 Ejecutando query:', query);
      console.log('📝 Valores:', values);

      const [result] = await db.execute(query, values);

      const patientId = (result as any).insertId;
      console.log('✅ Paciente insertado con ID:', patientId);

      return {
        success: true,
        message: 'Paciente registrado exitosamente',
        patient: { 
          id: patientId, 
          ...patientData
        }
      };

    } catch (error) {
      console.error('❌ Error creando paciente:', error);
      return {
        success: false,
        message: 'Error al registrar paciente'
      };
    }
  }

  // Obtener todos los pacientes
  static async getAllPatients(limit?: number, offset?: number): Promise<Patient[]> {
    try {
      let query = `
        SELECT p.*, u.name as created_by_name,
               COALESCE(c.name, p.company) as company,
               la.appointment_date as last_appointment_date,
               TIME(la.appointment_date) as last_appointment_time,
               la.status as last_appointment_status,
               la.appointment_type as last_appointment_type,
               doc.name as last_appointment_doctor
        FROM patients p
        LEFT JOIN users u ON p.created_by_user_id = u.id
        LEFT JOIN companies c ON p.company_id = c.id
        LEFT JOIN (
          SELECT a1.patient_id, a1.appointment_date, a1.status, a1.appointment_type, a1.doctor_id
          FROM appointments a1
          INNER JOIN (
            SELECT patient_id, MAX(appointment_date) as max_date
            FROM appointments
            GROUP BY patient_id
          ) a2 ON a1.patient_id = a2.patient_id AND a1.appointment_date = a2.max_date
        ) la ON p.id = la.patient_id
        LEFT JOIN users doc ON la.doctor_id = doc.id
        ORDER BY p.created_at DESC
      `;
      
      const params: any[] = [];
      if (limit) {
        query += ' LIMIT ?';
        params.push(limit);
        if (offset) {
          query += ' OFFSET ?';
          params.push(offset);
        }
      }

      const [rows] = await db.execute(query, params);
      return rows as Patient[];
    } catch (error) {
      console.error('Error obteniendo pacientes:', error);
      return [];
    }
  }

  // Buscar pacientes
  static async searchPatients(searchTerm: string): Promise<Patient[]> {
    try {
      const query = `
        SELECT p.*, u.name as created_by_name,
               COALESCE(c.name, p.company) as company
        FROM patients p
        LEFT JOIN users u ON p.created_by_user_id = u.id
        LEFT JOIN companies c ON p.company_id = c.id
        WHERE p.name LIKE ? 
        OR p.document_number LIKE ? 
        OR p.email LIKE ?
        ORDER BY p.name ASC
        LIMIT 50
      `;
      
      const searchPattern = `%${searchTerm}%`;
      const [rows] = await db.execute(query, [searchPattern, searchPattern, searchPattern]);
      return rows as Patient[];
    } catch (error) {
      console.error('Error buscando pacientes:', error);
      return [];
    }
  }

  // Obtener paciente por ID
  static async getPatientById(id: number): Promise<any | null> {
    try {
      const query = `
        SELECT p.*, u.name as created_by_name, d.name as doctor_name,
               COALESCE(c.name, p.company) as company
        FROM patients p
        LEFT JOIN users u ON p.created_by_user_id = u.id
        LEFT JOIN companies c ON p.company_id = c.id
        LEFT JOIN users d ON p.assigned_doctor_id = d.id
        WHERE p.id = ?
      `;
      
      const [rows] = await db.execute(query, [id]);
      const patients = rows as any[];
      return patients.length > 0 ? patients[0] : null;
    } catch (error) {
      console.error('Error obteniendo paciente:', error);
      return null;
    }
  }

  // Actualizar paciente
  static async updatePatient(id: number, updates: Partial<Patient>): Promise<boolean> {
    try {
      const setClause = Object.keys(updates)
        .filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at')
        .map(key => `${key} = ?`)
        .join(', ');
      
      const values = Object.keys(updates)
        .filter(key => key !== 'id' && key !== 'created_at' && key !== 'updated_at')
        .map(key => (updates as any)[key]);
      
      values.push(id);

      const query = `UPDATE patients SET ${setClause} WHERE id = ?`;
      await db.execute(query, values);
      return true;
    } catch (error) {
      console.error('Error actualizando paciente:', error);
      return false;
    }
  }

  // Eliminar paciente
  static async deletePatient(id: number): Promise<boolean> {
    try {
      await db.execute('DELETE FROM patients WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Error eliminando paciente:', error);
      return false;
    }
  }

  // Obtener estadísticas de pacientes
  static async getPatientStats(): Promise<{
    totalPatients: number;
    newThisMonth: number;
    byGender: { masculino: number; femenino: number; otro: number };
    byAgeGroup: { [key: string]: number };
  }> {
    try {
      // Total de pacientes
      const [totalResult] = await db.execute('SELECT COUNT(*) as count FROM patients');
      const totalPatients = (totalResult as any[])[0].count;

      // Nuevos este mes
      const [newThisMonthResult] = await db.execute(`
        SELECT COUNT(*) as count FROM patients 
        WHERE YEAR(created_at) = YEAR(CURDATE()) 
        AND MONTH(created_at) = MONTH(CURDATE())
      `);
      const newThisMonth = (newThisMonthResult as any[])[0].count;

      // Por género
      const [genderResult] = await db.execute(`
        SELECT gender, COUNT(*) as count 
        FROM patients 
        GROUP BY gender
      `);
      const byGender = { masculino: 0, femenino: 0, otro: 0 };
      (genderResult as any[]).forEach(row => {
        byGender[row.gender as keyof typeof byGender] = row.count;
      });

      // Por grupo de edad
      const [ageResult] = await db.execute(`
        SELECT 
          CASE 
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) < 18 THEN 'Menor de 18'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 18 AND 30 THEN '18-30'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 31 AND 50 THEN '31-50'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 51 AND 65 THEN '51-65'
            ELSE 'Mayor de 65'
          END as age_group,
          COUNT(*) as count
        FROM patients
        GROUP BY age_group
      `);
      const byAgeGroup: { [key: string]: number } = {};
      (ageResult as any[]).forEach(row => {
        byAgeGroup[row.age_group] = row.count;
      });

      return {
        totalPatients,
        newThisMonth,
        byGender,
        byAgeGroup
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return {
        totalPatients: 0,
        newThisMonth: 0,
        byGender: { masculino: 0, femenino: 0, otro: 0 },
        byAgeGroup: {}
      };
    }
  }

  // Mover archivo temporal a ubicación permanente
  static async moveTempFileToPermanent(tempUrl: string, patientId: number, type: 'photo' | 'signature'): Promise<string | null> {
    if (!tempUrl || !tempUrl.includes('temp_')) return tempUrl;

    try {
      console.log(`🔄 Moviendo archivo temp ${type}: ${tempUrl} para paciente ${patientId}`);

      const extension = tempUrl.split('.').pop() || (type === 'photo' ? 'webp' : 'png');
      const timestamp = Date.now();
      const destinationKey = `patients/${patientId}/${type}_${timestamp}.${extension}`;
      
      // Copiar archivo a ubicación final
      const newUrl = await StorageService.copyFile(tempUrl, destinationKey);

      // Eliminar archivo temporal
      try {
        await StorageService.deleteFile(tempUrl);
      } catch (e) {
        console.warn(`⚠️ No se pudo eliminar archivo temp ${tempUrl}:`, e);
      }

      // Si es foto, mover también versión certificado
      if (type === 'photo' && tempUrl.endsWith('.webp')) {
        const tempCertUrl = tempUrl.replace('.webp', '_cert.webp');
        const destCertKey = destinationKey.replace('.webp', '_cert.webp');

        try {
          await StorageService.copyFile(tempCertUrl, destCertKey);
          await StorageService.deleteFile(tempCertUrl);
          console.log('✅ Versión certificado movida exitosamente');
        } catch (e) {
          console.log('ℹ️ No se encontró versión certificado o falló al mover');
        }
      }

      return newUrl;
    } catch (error) {
      console.error(`❌ Error moviendo archivo temp ${tempUrl}:`, error);
      return tempUrl;
    }
  }

  // Métodos específicos para el API Admin
  static async updatePatientAdmin(id: number, patientData: {
    name: string;
    email?: string;
    phone?: string;
    documentType: string;
    documentNumber: string;
    dateOfBirth: string;
    gender: string;
    address?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    photoPath?: string;
    signaturePath?: string;
    occupation?: string;
    company?: string;
    companyId?: number | null;
    bloodType?: string;
    allergies?: string;
    medications?: string;
    medicalConditions?: string;
    assignedDoctorId?: number;
    updatedBy: number;
  }): Promise<{ success: boolean; message: string; patient?: any }> {
    try {
      // Verificar si el paciente existe
      const existingPatient = await this.getPatientById(id);
      if (!existingPatient) {
        return {
          success: false,
          message: 'Paciente no encontrado'
        };
      }

      // Verificar si otro paciente ya tiene ese documento (excluyendo el actual)
      const [existing] = await db.execute(
        'SELECT id FROM patients WHERE document_number = ? AND id != ?',
        [patientData.documentNumber, id]
      );

      if ((existing as any[]).length > 0) {
        return {
          success: false,
          message: 'Ya existe otro paciente con ese número de documento'
        };
      }

      // Verificar si la tabla tiene el campo identification_number
      const [tableStructure] = await db.execute('SHOW COLUMNS FROM patients WHERE Field IN ("identification_number", "document_number")');
      const columns = (tableStructure as any[]).map(row => row.Field);
      const hasIdentificationNumber = columns.includes('identification_number');
      const hasDocumentNumber = columns.includes('document_number');

      // Eliminar archivos antiguos si hay cambios
      if (patientData.photoPath && patientData.photoPath !== existingPatient.photo_path) {
        if (existingPatient.photo_path) {
          await StorageService.deleteFile(existingPatient.photo_path);

          // Eliminar también versión certificado
          if (existingPatient.photo_path.endsWith('.webp')) {
            const certPath = existingPatient.photo_path.replace('.webp', '_cert.webp');
            await StorageService.deleteFile(certPath);
          }
          console.log(`✅ Foto antigua eliminada`);
        }
      }

      if (patientData.signaturePath && patientData.signaturePath !== existingPatient.signature_path) {
        if (existingPatient.signature_path) {
          await StorageService.deleteFile(existingPatient.signature_path);
          console.log(`✅ Firma antigua eliminada`);
        }
      }

      console.log('🏗️ Estructura de tabla para UPDATE:', { hasIdentificationNumber, hasDocumentNumber });
      console.log('🏢 Company Info para UPDATE - ID:', patientData.companyId, 'Text:', patientData.company);

      let query = `
        UPDATE patients SET
          name = ?, email = ?, phone = ?, document_type = ?, date_of_birth = ?,
          gender = ?, address = ?, emergency_contact_name = ?,
          emergency_contact_phone = ?, photo_path = ?, signature_path = ?, occupation = ?, company = ?, blood_type = ?,
          allergies = ?, medications = ?, medical_conditions = ?, assigned_doctor_id = ?`;

      const params: any[] = [
        patientData.name,
        patientData.email || null,
        patientData.phone || null,
        patientData.documentType,
        patientData.dateOfBirth,
        patientData.gender,
        patientData.address || null,
        patientData.emergencyContactName || null,
        patientData.emergencyContactPhone || null,
        patientData.photoPath !== undefined ? patientData.photoPath : existingPatient.photo_path, // Mantener foto si no se envía nueva
        patientData.signaturePath !== undefined ? patientData.signaturePath : existingPatient.signature_path, // Mantener firma si no se envía nueva
        patientData.occupation || null,
        patientData.company || null,
        patientData.bloodType || null,
        patientData.allergies || null,
        patientData.medications || null,
        patientData.medicalConditions || null,
        patientData.assignedDoctorId || null
      ];

      // Actualizar company_id si se proporciona
      if (typeof patientData.companyId !== 'undefined') {
        query += `, company_id = ?`;
        params.push(patientData.companyId);
      }

      // Agregar campos de documento según la estructura de la tabla
      if (hasDocumentNumber) {
        query += `, document_number = ?`;
        params.push(patientData.documentNumber);
      }

      if (hasIdentificationNumber) {
        query += `, identification_number = ?`;
        params.push(patientData.documentNumber); // Usar el mismo valor
      }

      query += `, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      params.push(id);

      console.log('📝 Query UPDATE final:', query);
      console.log('📦 Parámetros UPDATE:', params);

      console.log('📝 Query UPDATE final:', query);
      console.log('📦 Parámetros UPDATE:', params);

      await db.execute(query, params);

      // Obtener el paciente actualizado
      const updatedPatient = await this.getPatientById(id);

      return {
        success: true,
        message: 'Paciente actualizado exitosamente',
        patient: updatedPatient
      };

    } catch (error) {
      console.error('Error actualizando paciente:', error);
      return {
        success: false,
        message: 'Error al actualizar paciente'
      };
    }
  }

  static async deletePatientAdmin(id: number): Promise<{ success: boolean; message: string }> {
    try {
      // Verificar si el paciente existe
      const existingPatient = await this.getPatientById(id);
      if (!existingPatient) {
        return {
          success: false,
          message: 'Paciente no encontrado'
        };
      }

      // Verificar si tiene citas programadas
      const [appointments] = await db.execute(
        'SELECT COUNT(*) as count FROM appointments WHERE patient_id = ? AND status IN ("programada", "en_progreso")',
        [id]
      );

      const appointmentCount = (appointments as any[])[0].count;
      if (appointmentCount > 0) {
        return {
          success: false,
          message: 'No se puede eliminar el paciente porque tiene citas programadas'
        };
      }

      // Eliminar registros relacionados antes de eliminar al paciente
      
      // 1. Eliminar certificados laborales (vinculados a citas)
      await db.execute(`
        DELETE wc FROM work_certificates wc
        INNER JOIN appointments a ON wc.appointment_id = a.id
        WHERE a.patient_id = ?
      `, [id]);

      // 2. Eliminar historias médicas
      await db.execute('DELETE FROM medical_histories WHERE patient_id = ?', [id]);

      // 3. Eliminar citas (todas, ya que verificamos que no hay activas)
      await db.execute('DELETE FROM appointments WHERE patient_id = ?', [id]);

      // Eliminar archivos de Storage si existen
      if (existingPatient.photo_path) {
        await StorageService.deleteFile(existingPatient.photo_path);

        // Eliminar también versión certificado
        if (existingPatient.photo_path.endsWith('.webp')) {
          const certPath = existingPatient.photo_path.replace('.webp', '_cert.webp');
          await StorageService.deleteFile(certPath);
        }
        console.log(`✅ Foto del paciente eliminada de Storage`);
      }

      if (existingPatient.signature_path) {
        await StorageService.deleteFile(existingPatient.signature_path);
        console.log(`✅ Firma del paciente eliminada de Storage`);
      }

      // 4. Eliminar el paciente
      await db.execute('DELETE FROM patients WHERE id = ?', [id]);

      return {
        success: true,
        message: 'Paciente eliminado exitosamente'
      };

    } catch (error) {
      console.error('Error eliminando paciente:', error);
      return {
        success: false,
        message: 'Error al eliminar paciente'
      };
    }
  }
}