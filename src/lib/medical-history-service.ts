// Servicio para manejo de Historias Médicas Ocupacionales
// Basado en estándares de la OMS para Salud Ocupacional
import { db } from './database.js';
import dayjs from 'dayjs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface VitalSigns {
  // Signos vitales básicos
  systolic_pressure?: number;
  diastolic_pressure?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  temperature?: number;
  oxygen_saturation?: number;
  
  // Medidas antropométricas
  height?: number; // cm
  weight?: number; // kg
  bmi?: number;
  
  // Medidas adicionales ocupacionales
  waist_circumference?: number; // cm
  hip_circumference?: number; // cm
  body_fat_percentage?: number;
}

export interface OccupationalAssessment {
  // Evaluación ocupacional específica
  work_environment_risk?: string;
  exposure_to_chemicals?: boolean;
  exposure_to_noise?: boolean;
  exposure_to_radiation?: boolean;
  ergonomic_risks?: boolean;
  psychological_stress_level?: 'bajo' | 'moderado' | 'alto' | 'muy_alto';
  
  // Capacidad laboral
  physical_capacity?: 'normal' | 'limitada' | 'muy_limitada';
  fitness_for_work?: 'apto' | 'apto_con_restricciones' | 'no_apto' | 'apto_temporal';
  work_restrictions?: string[];
  
  // Recomendaciones preventivas
  occupational_recommendations?: string[];
}

export interface MedicalHistoryData {
  patient_id: number;
  doctor_id: number;
  appointment_id?: number;
  
  // Motivo de consulta
  symptoms: string;
  current_illness?: string;
  chief_complaint?: string;
  
  // Antecedentes
  personal_history?: string;
  family_history?: string;
  surgical_history?: string;
  occupational_history?: string;
  
  // Examen físico
  physical_exam?: string;
  vital_signs?: VitalSigns;
  
  // Evaluación ocupacional
  occupational_assessment?: OccupationalAssessment;
  
  // Diagnóstico
  diagnosis: string;
  cie10_code?: string;
  aptitude_status?: 'apto' | 'apto_con_restricciones' | 'no_apto' | 'aplazado';
  restrictions?: string;
  
  // Tratamiento
  treatment: string;
  medications?: string;
  recommendations?: string;
  
  // Seguimiento
  next_appointment_date?: string;
  notes?: string;
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');
}

function baseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.URL) {
    return process.env.URL;
  }

  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    const host = process.env.HOST || 'localhost';
    const port = process.env.PORT || '4321';

    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `https://${host}`;
    }

    return `http://${host}:${port}`;
  }

  return 'http://localhost:4321';
}

export class MedicalHistoryService {

  private static resolvePublicPath(relativePath: string): string {
    if (!relativePath) return '';
    
    // Si ya es una URL completa (http/https), retornarla tal cual
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }

    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

    const possiblePaths = [
      path.join(process.cwd(), cleanPath),
      path.join(process.cwd(), 'dist', 'client', cleanPath),
      path.join(process.cwd(), 'public', cleanPath),
      path.join(process.cwd(), '..', cleanPath),
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        console.log('✅ Archivo encontrado en:', possiblePath);
        return possiblePath;
      }
    }

    console.error('❌ Archivo no encontrado en ninguna ubicación:');
    possiblePaths.forEach(p => console.error('   -', p));
    return possiblePaths[0];
  }

  private static async convertImageForPDF(imagePath: string): Promise<Buffer | null> {
    try {
      console.log('📁 Intentando cargar imagen desde:', imagePath);

      // Manejar URLs remotas (R2)
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        console.log('🌐 Descargando imagen remota:', imagePath);
        const response = await fetch(imagePath);
        if (!response.ok) {
          console.error('❌ Error descargando imagen remota:', response.statusText);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        console.log('🔄 Procesando imagen remota con Sharp...');
        // Asegurar formato compatible (JPEG/PNG) y optimizar
        return await sharp(buffer)
          .jpeg({ quality: 85 })
          .toBuffer();
      }

      if (!fs.existsSync(imagePath)) {
        console.error('❌ El archivo no existe:', imagePath);
        console.error('   process.cwd():', process.cwd());
        return null;
      }

      const ext = path.extname(imagePath).toLowerCase();
      console.log('📝 Extensión del archivo:', ext);

      if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        console.log('✅ Leyendo imagen directamente (formato compatible)');
        return fs.readFileSync(imagePath);
      }

      console.log('🔄 Convirtiendo imagen a formato compatible con PDF...');
      const jpegBuffer = await sharp(imagePath)
        .jpeg({ quality: 85 })
        .toBuffer();

      console.log('✅ Imagen convertida exitosamente');
      return jpegBuffer;
    } catch (error) {
      console.error('❌ Error convirtiendo imagen:', error);
      console.error('   Ruta intentada:', imagePath);
      return null;
    }
  }
  
  // Calcular IMC y clasificación según OMS
  static calculateBMI(weight: number, height: number): { bmi: number; classification: string; risk: string; recommendations: string[] } {
    const heightInMeters = height / 100;
    const bmi = Number((weight / (heightInMeters * heightInMeters)).toFixed(1));
    
    let classification = '';
    let risk = '';
    let recommendations: string[] = [];
    
    if (bmi < 18.5) {
      classification = 'Bajo peso';
      risk = 'Riesgo de desnutrición';
      recommendations = [
        'Evaluación nutricional detallada',
        'Consulta con nutricionista',
        'Incremento gradual de ingesta calórica',
        'Evaluación de causas subyacentes',
        'Seguimiento médico regular'
      ];
    } else if (bmi >= 18.5 && bmi < 25) {
      classification = 'Peso normal';
      risk = 'Riesgo normal';
      recommendations = [
        'Mantener peso actual',
        'Dieta balanceada y ejercicio regular',
        'Controles médicos anuales',
        'Promoción de hábitos saludables'
      ];
    } else if (bmi >= 25 && bmi < 30) {
      classification = 'Sobrepeso';
      risk = 'Riesgo aumentado';
      recommendations = [
        'Reducción de peso gradual (5-10%)',
        'Plan nutricional personalizado',
        'Ejercicio aeróbico 150 min/semana',
        'Control de comorbilidades',
        'Seguimiento médico cada 6 meses'
      ];
    } else if (bmi >= 30 && bmi < 35) {
      classification = 'Obesidad grado I';
      risk = 'Riesgo alto';
      recommendations = [
        'Pérdida de peso estructurada (10-15%)',
        'Intervención nutricional intensiva',
        'Programa de ejercicio supervisado',
        'Evaluación cardiovascular',
        'Control de diabetes e hipertensión',
        'Seguimiento médico mensual'
      ];
    } else if (bmi >= 35 && bmi < 40) {
      classification = 'Obesidad grado II';
      risk = 'Riesgo muy alto';
      recommendations = [
        'Pérdida de peso significativa (15-20%)',
        'Manejo multidisciplinario',
        'Evaluación psicológica',
        'Consideración de farmacoterapia',
        'Evaluación quirúrgica si es necesario',
        'Seguimiento médico quincenal'
      ];
    } else {
      classification = 'Obesidad grado III (mórbida)';
      risk = 'Riesgo extremo';
      recommendations = [
        'Pérdida de peso urgente',
        'Manejo hospitalario si es necesario',
        'Evaluación para cirugía bariátrica',
        'Control estricto de comorbilidades',
        'Soporte psicológico intensivo',
        'Seguimiento médico semanal'
      ];
    }
    
    return { bmi, classification, risk, recommendations };
  }
  
  // Evaluar presión arterial según JNC 8 y AHA 2017
  static evaluateBloodPressure(systolic: number, diastolic: number): { 
    classification: string; 
    risk: string; 
    recommendations: string[];
    occupational_fitness: string;
  } {
    let classification = '';
    let risk = '';
    let recommendations: string[] = [];
    let occupational_fitness = '';
    
    if (systolic < 120 && diastolic < 80) {
      classification = 'Presión arterial normal';
      risk = 'Riesgo cardiovascular bajo';
      occupational_fitness = 'Apto para todas las actividades laborales';
      recommendations = [
        'Mantener estilo de vida saludable',
        'Control anual de presión arterial',
        'Ejercicio regular',
        'Dieta balanceada baja en sodio'
      ];
    } else if ((systolic >= 120 && systolic <= 129) && diastolic < 80) {
      classification = 'Presión arterial elevada';
      risk = 'Riesgo cardiovascular moderado';
      occupational_fitness = 'Apto con recomendaciones preventivas';
      recommendations = [
        'Modificaciones de estilo de vida',
        'Control cada 6 meses',
        'Reducción de peso si es necesario',
        'Limitación de sodio (<2.3g/día)',
        'Ejercicio aeróbico regular',
        'Manejo del estrés laboral'
      ];
    } else if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
      classification = 'Hipertensión arterial estadio 1';
      risk = 'Riesgo cardiovascular alto';
      occupational_fitness = 'Apto con restricciones específicas';
      recommendations = [
        'Inicio de tratamiento farmacológico',
        'Control mensual hasta estabilización',
        'Evaluación de daño a órganos blanco',
        'Restricción de trabajos de alto estrés',
        'Evitar exposición a calor extremo',
        'Evaluación cardiológica anual'
      ];
    } else if (systolic >= 140 || diastolic >= 90) {
      classification = 'Hipertensión arterial estadio 2';
      risk = 'Riesgo cardiovascular muy alto';
      occupational_fitness = 'Apto con restricciones importantes';
      recommendations = [
        'Tratamiento farmacológico inmediato',
        'Control semanal inicial',
        'Evaluación cardiológica urgente',
        'Restricción de trabajos físicos intensos',
        'Evitar trabajos en alturas',
        'Programa de rehabilitación cardiovascular'
      ];
    }
    
    if (systolic >= 180 || diastolic >= 110) {
      classification = 'Crisis hipertensiva';
      risk = 'Riesgo cardiovascular crítico';
      occupational_fitness = 'No apto temporalmente';
      recommendations = [
        'Derivación inmediata a emergencias',
        'Evaluación de encefalopatía hipertensiva',
        'Suspensión temporal de actividades laborales',
        'Hospitalización si es necesario'
      ];
    }
    
    return { classification, risk, recommendations, occupational_fitness };
  }
  
  // Evaluar frecuencia cardíaca
  static evaluateHeartRate(heartRate: number, age: number): {
    classification: string;
    recommendations: string[];
    occupational_fitness: string;
  } {
    let classification = '';
    let recommendations: string[] = [];
    let occupational_fitness = '';
    
    const maxHeartRate = 220 - age;
    const targetLow = maxHeartRate * 0.5;
    const targetHigh = maxHeartRate * 0.85;
    
    if (heartRate < 60) {
      classification = 'Bradicardia';
      occupational_fitness = 'Requiere evaluación cardiológica';
      recommendations = [
        'Evaluación cardiológica completa',
        'Electrocardiograma',
        'Evaluación de medicamentos',
        'Considerar Holter de 24 horas',
        'Restricción temporal de actividades intensas'
      ];
    } else if (heartRate >= 60 && heartRate <= 100) {
      classification = 'Frecuencia cardíaca normal';
      occupational_fitness = 'Apto para actividades normales';
      recommendations = [
        'Mantener actividad física regular',
        'Control anual de función cardiovascular'
      ];
    } else if (heartRate > 100 && heartRate <= 120) {
      classification = 'Taquicardia leve';
      occupational_fitness = 'Apto con recomendaciones';
      recommendations = [
        'Evaluación de causas subyacentes',
        'Control de ansiedad y estrés',
        'Limitación de cafeína',
        'Evaluación tiroidea',
        'Seguimiento médico'
      ];
    } else {
      classification = 'Taquicardia significativa';
      occupational_fitness = 'Requiere evaluación inmediata';
      recommendations = [
        'Evaluación cardiológica urgente',
        'Electrocardiograma inmediato',
        'Control de signos vitales',
        'Suspensión temporal de esfuerzos intensos'
      ];
    }
    
    return { classification, recommendations, occupational_fitness };
  }
  
  // Crear nueva historia médica ocupacional
  static async createMedicalHistory(data: MedicalHistoryData): Promise<{ 
    success: boolean; 
    message: string; 
    medical_history?: any;
    calculated_data?: any;
  }> {
    try {
      // Generar código de verificación
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let verificationCode = '';
      for (let i = 0; i < 32; i++) verificationCode += chars[Math.floor(Math.random() * chars.length)];

      // Calcular y agregar datos automáticos si hay signos vitales
      let calculatedData: any = {};
      
      if (data.vital_signs) {
        // Calcular IMC si hay peso y altura
        if (data.vital_signs.weight && data.vital_signs.height) {
          const bmiData = this.calculateBMI(data.vital_signs.weight, data.vital_signs.height);
          data.vital_signs.bmi = bmiData.bmi;
          calculatedData.bmi_analysis = bmiData;
        }
        
        // Evaluar presión arterial
        if (data.vital_signs.systolic_pressure && data.vital_signs.diastolic_pressure) {
          calculatedData.blood_pressure_analysis = this.evaluateBloodPressure(
            data.vital_signs.systolic_pressure,
            data.vital_signs.diastolic_pressure
          );
        }
        
        // Evaluar frecuencia cardíaca (necesitamos la edad del paciente)
        if (data.vital_signs.heart_rate) {
          // Obtener edad del paciente
          const [patientRows] = await db.execute(
            'SELECT date_of_birth FROM patients WHERE id = ?',
            [data.patient_id]
          );
          
          if ((patientRows as any[]).length > 0) {
            const birthDate = new Date((patientRows as any[])[0].date_of_birth);
            const age = new Date().getFullYear() - birthDate.getFullYear();
            
            calculatedData.heart_rate_analysis = this.evaluateHeartRate(
              data.vital_signs.heart_rate,
              age
            );
          }
        }
      }
      
      // Agregar recomendaciones automáticas basadas en los análisis
      const autoRecommendations: string[] = [];
      
      if (calculatedData.bmi_analysis) {
        autoRecommendations.push(`IMC: ${calculatedData.bmi_analysis.classification} (${calculatedData.bmi_analysis.bmi})`);
        autoRecommendations.push(...calculatedData.bmi_analysis.recommendations);
      }
      
      if (calculatedData.blood_pressure_analysis) {
        autoRecommendations.push(`Presión arterial: ${calculatedData.blood_pressure_analysis.classification}`);
        autoRecommendations.push(...calculatedData.blood_pressure_analysis.recommendations);
      }
      
      if (calculatedData.heart_rate_analysis) {
        autoRecommendations.push(`Frecuencia cardíaca: ${calculatedData.heart_rate_analysis.classification}`);
        autoRecommendations.push(...calculatedData.heart_rate_analysis.recommendations);
      }
      
      // Combinar recomendaciones manuales con automáticas
      const finalRecommendations = [
        ...(data.recommendations ? [data.recommendations] : []),
        ...autoRecommendations
      ].join('\n\n');
      
      // Insertar en base de datos
      const [result] = await db.execute(`
        INSERT INTO medical_histories (
          patient_id, doctor_id, appointment_id, symptoms, current_illness,
          personal_history, family_history, surgical_history, physical_exam,
          vital_signs, occupational_assessment, diagnosis, cie10_code, treatment, medications,
          recommendations, next_appointment_date, notes, aptitude_status, restrictions, verification_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        data.patient_id,
        data.doctor_id,
        data.appointment_id || null,
        data.symptoms,
        data.current_illness || null,
        data.personal_history || null,
        data.family_history || null,
        data.surgical_history || null,
        data.physical_exam || null,
        JSON.stringify(data.vital_signs) || null,
        JSON.stringify(data.occupational_assessment) || null,
        data.diagnosis,
        data.cie10_code || null,
        data.treatment,
        data.medications || null,
        finalRecommendations || null,
        data.next_appointment_date || null,
        data.notes || null,
        data.aptitude_status || null,
        data.restrictions || null,
        verificationCode
      ]);
      
      const medicalHistoryId = (result as any).insertId;
      
      return {
        success: true,
        message: 'Historia médica ocupacional creada exitosamente',
        medical_history: {
          id: medicalHistoryId,
          ...data,
          recommendations: finalRecommendations
        },
        calculated_data: calculatedData
      };
      
    } catch (error) {
      console.error('Error creando historia médica:', error);
      return {
        success: false,
        message: 'Error al crear la historia médica'
      };
    }
  }
  
  // Obtener historias médicas de un paciente
  static async getPatientMedicalHistories(patientId: number): Promise<{
    success: boolean;
    data?: any[];
    message?: string;
  }> {
    try {
      const [rows] = await db.execute(`
        SELECT 
          mh.*,
          u.name as doctor_name,
          u.signature_path as doctor_signature_path,
          u.professional_license as doctor_professional_license,
          p.name as patient_name,
          a.appointment_date,
          a.appointment_type
        FROM medical_histories mh
        LEFT JOIN users u ON mh.doctor_id = u.id
        LEFT JOIN patients p ON mh.patient_id = p.id
        LEFT JOIN appointments a ON mh.appointment_id = a.id
        WHERE mh.patient_id = ?
        ORDER BY mh.created_at DESC
      `, [patientId]);
      
      return {
        success: true,
        data: rows as any[]
      };
      
    } catch (error) {
      console.error('Error obteniendo historias médicas:', error);
      return {
        success: false,
        message: 'Error al obtener las historias médicas'
      };
    }
  }
  
  static async getMedicalHistoryByVerificationCode(code: string): Promise<any | null> {
    const [rows] = await db.execute(
      `SELECT 
        mh.*,
        u.name as doctor_name,
        u.specialization as doctor_specialization,
        u.professional_license as doctor_professional_license,
        p.name as patient_name,
        p.document_type,
        p.document_number,
        COALESCE(c.name, p.company) as company,
        c.responsible_name as company_responsible,
        p.date_of_birth as patient_birth_date,
        p.gender as patient_gender,
        a.appointment_date,
        a.appointment_type
       FROM medical_histories mh
       LEFT JOIN users u ON mh.doctor_id = u.id
       LEFT JOIN patients p ON mh.patient_id = p.id
       LEFT JOIN companies c ON p.company_id = c.id
       LEFT JOIN appointments a ON mh.appointment_id = a.id
       WHERE mh.verification_code = ?`,
      [code]
    );
    const arr = rows as any[];
    return arr.length > 0 ? arr[0] : null;
  }
  
  // Obtener una historia médica específica
  static async getMedicalHistoryById(id: number): Promise<{
    success: boolean;
    data?: any;
    message?: string;
  }> {
    try {
      const [rows] = await db.execute(`
        SELECT 
          mh.*,
          u.name as doctor_name,
          u.specialization as doctor_specialization,
          u.signature_path as doctor_signature_path,
          u.professional_license as doctor_professional_license,
          p.name as patient_name,
          p.date_of_birth as patient_birth_date,
          p.gender as patient_gender,
          a.appointment_date,
          a.appointment_type
        FROM medical_histories mh
        LEFT JOIN users u ON mh.doctor_id = u.id
        LEFT JOIN patients p ON mh.patient_id = p.id
        LEFT JOIN appointments a ON mh.appointment_id = a.id
        WHERE mh.id = ?
      `, [id]);
      
      if ((rows as any[]).length === 0) {
        return {
          success: false,
          message: 'Historia médica no encontrada'
        };
      }
      
      const history = (rows as any[])[0];
      
      // Parsear signos vitales si existen
      if (history.vital_signs) {
        try {
          history.vital_signs = JSON.parse(history.vital_signs);
        } catch (e) {
          console.error('Error parseando signos vitales:', e);
        }
      }
      
      return {
        success: true,
        data: history
      };
      
    } catch (error) {
      console.error('Error obteniendo historia médica:', error);
      return {
        success: false,
        message: 'Error al obtener la historia médica'
      };
    }
  }
  
  // Actualizar historia médica
  static async updateMedicalHistory(id: number, data: Partial<MedicalHistoryData>): Promise<{
    success: boolean;
    message: string;
    medical_history?: any;
  }> {
    try {
      const setClause: string[] = [];
      const values: any[] = [];
      
      if (data.symptoms !== undefined) {
        setClause.push('symptoms = ?');
        values.push(data.symptoms);
      }
      
      if (data.current_illness !== undefined) {
        setClause.push('current_illness = ?');
        values.push(data.current_illness);
      }
      
      if (data.personal_history !== undefined) {
        setClause.push('personal_history = ?');
        values.push(data.personal_history);
      }
      
      if (data.family_history !== undefined) {
        setClause.push('family_history = ?');
        values.push(data.family_history);
      }
      
      if (data.surgical_history !== undefined) {
        setClause.push('surgical_history = ?');
        values.push(data.surgical_history);
      }
      
      if (data.physical_exam !== undefined) {
        setClause.push('physical_exam = ?');
        values.push(data.physical_exam);
      }
      
      if (data.vital_signs !== undefined) {
        setClause.push('vital_signs = ?');
        values.push(JSON.stringify(data.vital_signs));
      }
      
      if (data.diagnosis !== undefined) {
        setClause.push('diagnosis = ?');
        values.push(data.diagnosis);
      }
      
      if (data.cie10_code !== undefined) {
        setClause.push('cie10_code = ?');
        values.push(data.cie10_code);
      }
      
      if (data.treatment !== undefined) {
        setClause.push('treatment = ?');
        values.push(data.treatment);
      }
      
      if (data.medications !== undefined) {
        setClause.push('medications = ?');
        values.push(data.medications);
      }
      
      if (data.recommendations !== undefined) {
        setClause.push('recommendations = ?');
        values.push(data.recommendations);
      }
      
      if (data.next_appointment_date !== undefined) {
        setClause.push('next_appointment_date = ?');
        values.push(data.next_appointment_date);
      }
      
      if (data.notes !== undefined) {
        setClause.push('notes = ?');
        values.push(data.notes);
      }

      if (data.aptitude_status !== undefined) {
        setClause.push('aptitude_status = ?');
        values.push(data.aptitude_status);
      }

      if (data.restrictions !== undefined) {
        setClause.push('restrictions = ?');
        values.push(data.restrictions);
      }
      
      if (setClause.length === 0) {
        return {
          success: false,
          message: 'No hay datos para actualizar'
        };
      }
      
      setClause.push('updated_at = NOW()');
      values.push(id);
      
      await db.execute(
        `UPDATE medical_histories SET ${setClause.join(', ')} WHERE id = ?`,
        values
      );
      
      // Obtener la historia médica actualizada
      const updatedHistory = await this.getMedicalHistoryById(id);
      
      return {
        success: true,
        message: 'Historia médica actualizada exitosamente',
        medical_history: updatedHistory.data
      };
      
    } catch (error) {
      console.error('Error actualizando historia médica:', error);
      return {
        success: false,
        message: 'Error al actualizar la historia médica'
      };
    }
  }

  // Generar PDF de Historia Médica con diseño profesional
  static async generatePDF(medicalHistoryId: number): Promise<Buffer | null> {
    try {
      console.log('📋 Generando PDF de Historia Médica ID:', medicalHistoryId);

      // Obtener datos de la historia médica
      const historyResult = await this.getMedicalHistoryById(medicalHistoryId);
      if (!historyResult.success || !historyResult.data) {
        console.error('❌ Historia médica no encontrada');
        return null;
      }

      const history = historyResult.data;

      // Obtener datos adicionales del paciente y doctor
      const [patientRows] = await db.execute(`
        SELECT p.*, COALESCE(c.name, p.company) as company, c.responsible_name as company_responsible
        FROM patients p
        LEFT JOIN companies c ON p.company_id = c.id
        WHERE p.id = ?
      `, [history.patient_id]);

      const [doctorRows] = await db.execute(`
        SELECT * FROM users WHERE id = ?
      `, [history.doctor_id]);

      if ((patientRows as any[]).length === 0 || (doctorRows as any[]).length === 0) {
        console.error('❌ Datos del paciente o doctor no encontrados');
        return null;
      }

      const patient = (patientRows as any[])[0];
      const doctor = (doctorRows as any[])[0];

      // Crear documento PDF (A4 - 210mm x 297mm) - Optimizado para 2 páginas
      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        bufferPages: true
      });
      const chunks: Buffer[] = [];

      return await new Promise(async (resolve, reject) => {
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const pageWidth = doc.page.width - 60;
        const contentWidth = doc.page.width - 60;

        // ENCABEZADO ULTRA COMPACTO
        const headerY = 30;
        const headerHeight = 45;
        doc.rect(30, headerY, pageWidth, headerHeight).fill('#059669').stroke('#047857');

        doc.fillColor('#FFFFFF');
        doc.font('Helvetica-Bold').fontSize(14).text(
          cleanText('HISTORIA MÉDICA OCUPACIONAL'),
          30, headerY + 14,
          { align: 'center', width: pageWidth }
        );

        doc.font('Helvetica').fontSize(8).text(
          cleanText('Sistema de Salud Ocupacional'),
          30, headerY + 30,
          { align: 'center', width: pageWidth }
        );

        // Línea decorativa
        doc.strokeColor('#fbbf24').lineWidth(1);
        doc.moveTo(130, headerY + 40).lineTo(pageWidth - 50, headerY + 40).stroke();

        doc.y = headerY + headerHeight + 10;
        doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

        // Código CIE-10 al inicio (si existe)
        if (history.cie10_code) {
          const cie10BoxY = doc.y;
          doc.rect(30, cie10BoxY, pageWidth, 18).fill('#d1fae5').stroke('#10b981');
          doc.fillColor('#059669');
          doc.font('Helvetica-Bold').fontSize(7.5).text(cleanText('CÓDIGO CIE-10'), 38, cie10BoxY + 4);
          doc.fillColor('#000000');
          doc.font('Helvetica-Bold').fontSize(9).text(
            cleanText(history.cie10_code),
            38, cie10BoxY + 11
          );
          doc.y = cie10BoxY + 20;
        }

        // Fecha de consulta compacta
        if (history.appointment_date || history.created_at) {
          const consultDate = history.appointment_date || history.created_at;
          const infoBoxY = doc.y;

          doc.rect(30, infoBoxY, pageWidth, 18).fill('#ecfeff').stroke('#06b6d4');
          doc.fillColor('#0e7490');
          doc.font('Helvetica-Bold').fontSize(7.5).text(cleanText('FECHA DE CONSULTA'), 38, infoBoxY + 4);
          doc.fillColor('#000000');
          doc.font('Helvetica').fontSize(8).text(
            cleanText(dayjs(consultDate).format('DD/MM/YYYY HH:mm')),
            38, infoBoxY + 11
          );

          doc.y = infoBoxY + 20;
        }

        // DATOS DEL PACIENTE - COMPACTO
        doc.moveDown(0.1);
        const patientSectionY = doc.y;

        doc.rect(30, patientSectionY, 3, 38).fill('#3b82f6');

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a8a').text(
          cleanText('DATOS DEL PACIENTE'),
          38, patientSectionY + 1
        );

        const patientTableY = patientSectionY + 10;
        doc.rect(30, patientTableY, contentWidth, 32).fill('#ffffff').stroke('#e2e8f0');
        doc.fillColor('#000000');

        const col1X = 38;
        const col2X = 200;
        const col3X = 370;

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Nombre'), col1X, patientTableY + 4);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.name), col1X, patientTableY + 10, { width: 150 });

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Documento'), col2X, patientTableY + 4);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(`${patient.document_type || ''} ${patient.document_number || ''}`), col2X, patientTableY + 10);

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('F. Nacimiento'), col1X, patientTableY + 20);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.date_of_birth ? dayjs(patient.date_of_birth).format('DD/MM/YYYY') : 'N/A'), col1X, patientTableY + 26);

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Empresa'), col2X, patientTableY + 20);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.company || 'N/A'), col2X, patientTableY + 26, { width: 160 });

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Ocupación'), col3X, patientTableY + 20);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.occupation || 'N/A'), col3X, patientTableY + 26, { width: 150 });

        // DATOS DEL PROFESIONAL - COMPACTO
        doc.y = patientTableY + 35;
        const doctorSectionY = doc.y;

        doc.rect(30, doctorSectionY, 3, 32).fill('#10b981');

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#065f46').text(
          cleanText('PROFESIONAL'),
          38, doctorSectionY + 1
        );

        const doctorTableY = doctorSectionY + 10;
        doc.rect(30, doctorTableY, contentWidth, 26).fill('#ffffff').stroke('#e2e8f0');
        doc.fillColor('#000000');

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Médico'), col1X, doctorTableY + 4);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor.name), col1X, doctorTableY + 10, { width: 150 });

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Especialidad'), col2X, doctorTableY + 4);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor.specialization || 'N/A'), col2X, doctorTableY + 10, { width: 160 });

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(cleanText('Registro'), col3X, doctorTableY + 4);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor.professional_license || 'N/A'), col3X, doctorTableY + 10);

        doc.y = doctorTableY + 28;
        doc.fillColor('#000000');

        doc.moveDown(0.1);

        // Continúa en la siguiente parte...
        await this.addMedicalContentSections(doc, history, patient, doctor, contentWidth);

        doc.end();
      });
    } catch (error) {
      console.error('❌ Error generando PDF de Historia Médica:', error);
      return null;
    }
  }

  private static async addMedicalContentSections(doc: PDFKit.PDFDocument, history: any, patient: any, doctor: any, contentWidth: number) {
    const startX = 30;

    // SIGNOS VITALES - ULTRA COMPACTO
    if (history.vital_signs) {
      const vitalSectionY = doc.y;
      doc.rect(startX, vitalSectionY, 3, 22).fill('#8b5cf6');

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#6d28d9').text(
        cleanText('SIGNOS VITALES'),
        startX + 8, vitalSectionY + 1
      );

      const vitalBoxY = vitalSectionY + 10;
      doc.rect(startX, vitalBoxY, contentWidth, 32).fill('#faf5ff').stroke('#e9d5ff');
      doc.fillColor('#000000');

      let yPos = vitalBoxY + 4;
      const col1 = startX + 6;
      const col2 = startX + 190;
      const col3 = startX + 380;

      doc.font('Helvetica').fontSize(7.5);

      if (history.vital_signs.systolic_pressure && history.vital_signs.diastolic_pressure) {
        doc.fillColor('#64748b').text('Presión Arterial:', col1, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.systolic_pressure}/${history.vital_signs.diastolic_pressure} mmHg`, col1 + 80, yPos);
      }

      if (history.vital_signs.heart_rate) {
        doc.fillColor('#64748b').text('Frecuencia Cardíaca:', col2, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.heart_rate} lpm`, col2 + 85, yPos);
      }

      yPos += 8;

      if (history.vital_signs.temperature) {
        doc.fillColor('#64748b').text('Temperatura:', col1, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.temperature}°C`, col1 + 65, yPos);
      }

      if (history.vital_signs.respiratory_rate) {
        doc.fillColor('#64748b').text('Frecuencia Respiratoria:', col2, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.respiratory_rate} rpm`, col2 + 100, yPos);
      }

      yPos += 8;

      if (history.vital_signs.weight) {
        doc.fillColor('#64748b').text('Peso:', col1, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.weight} kg`, col1 + 30, yPos);
      }

      if (history.vital_signs.height) {
        doc.fillColor('#64748b').text('Altura:', col2, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.height} cm`, col2 + 35, yPos);
      }

      if (history.vital_signs.bmi) {
        doc.fillColor('#64748b').text('IMC:', col3, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.bmi}`, col3 + 25, yPos);
      }

      yPos += 8;

      if (history.vital_signs.oxygen_saturation) {
        doc.fillColor('#64748b').text('Saturación O2:', col1, yPos);
        doc.fillColor('#000000').text(`${history.vital_signs.oxygen_saturation}%`, col1 + 65, yPos);
      }

      doc.y = vitalBoxY + 34;
    }

    // MOTIVO DE CONSULTA Y ENFERMEDAD ACTUAL
    doc.moveDown(0.05);
    const symptomsSectionY = doc.y;
    doc.rect(startX, symptomsSectionY, 3, 22).fill('#f59e0b');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#d97706').text(
      cleanText('MOTIVO DE CONSULTA'),
      startX + 8, symptomsSectionY + 1
    );

    const symptomsBoxY = symptomsSectionY + 10;
    doc.rect(startX, symptomsBoxY, contentWidth, 28).fill('#fffbeb').stroke('#fef3c7');

    doc.font('Helvetica').fontSize(8).fillColor('#000000').text(
      cleanText(history.symptoms || 'No especificado'),
      startX + 8, symptomsBoxY + 5,
      { align: 'justify', width: contentWidth - 20 }
    );

    doc.y = symptomsBoxY + 30;

    // ANTECEDENTES
    if (history.personal_history || history.family_history || history.surgical_history) {
      doc.moveDown(0.05);
      const historySectionY = doc.y;
      doc.rect(startX, historySectionY, 3, 22).fill('#ef4444');

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#dc2626').text(
        cleanText('ANTECEDENTES MÉDICOS'),
        startX + 10, historySectionY + 1
      );

      const historyBoxY = historySectionY + 10;
      let boxHeight = 18;

      if (history.personal_history) boxHeight += 14;
      if (history.family_history) boxHeight += 14;
      if (history.surgical_history) boxHeight += 14;

      doc.rect(startX, historyBoxY, contentWidth, boxHeight).fill('#fef2f2').stroke('#fecaca');

      let yPosHistory = historyBoxY + 6;
      doc.font('Helvetica').fontSize(8);

      if (history.personal_history) {
        doc.fillColor('#64748b').text('Pers:', startX + 8, yPosHistory);
        doc.fillColor('#000000').text(cleanText(history.personal_history), startX + 32, yPosHistory, { width: contentWidth - 45 });
        yPosHistory += 14;
      }

      if (history.family_history) {
        doc.fillColor('#64748b').text('Fam:', startX + 8, yPosHistory);
        doc.fillColor('#000000').text(cleanText(history.family_history), startX + 32, yPosHistory, { width: contentWidth - 45 });
        yPosHistory += 14;
      }

      if (history.surgical_history) {
        doc.fillColor('#64748b').text('Quir:', startX + 8, yPosHistory);
        doc.fillColor('#000000').text(cleanText(history.surgical_history), startX + 32, yPosHistory, { width: contentWidth - 45 });
      }

      doc.y = historyBoxY + boxHeight + 3;
    }

    // EXAMEN FÍSICO
    if (history.physical_exam) {
      doc.moveDown(0.05);
      const examSectionY = doc.y;
      doc.rect(startX, examSectionY, 3, 22).fill('#06b6d4');

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0891b2').text(
        cleanText('EXAMEN FÍSICO'),
        startX + 10, examSectionY + 1
      );

      const examBoxY = examSectionY + 10;
      doc.rect(startX, examBoxY, contentWidth, 34).fill('#ecfeff').stroke('#a5f3fc');

      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(
        cleanText(history.physical_exam),
        startX + 8, examBoxY + 5,
        { align: 'justify', width: contentWidth - 20 }
      );

      doc.y = examBoxY + 36;
    }

    // DIAGNÓSTICO
    doc.moveDown(0.05);
    const diagnosisSectionY = doc.y;
    doc.rect(startX, diagnosisSectionY, 3, 22).fill('#10b981');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#059669').text(
      cleanText('DIAGNÓSTICO'),
      startX + 10, diagnosisSectionY + 1
    );

    const diagnosisBoxY = diagnosisSectionY + 10;
    doc.rect(startX, diagnosisBoxY, contentWidth, 25).fill('#d1fae5').stroke('#6ee7b7');

    doc.font('Helvetica').fontSize(9).fillColor('#000000').text(
      cleanText(history.diagnosis),
      startX + 8, diagnosisBoxY + 5,
      { align: 'left', width: contentWidth - 20 }
    );

    doc.y = diagnosisBoxY + 27;

    // TRATAMIENTO
    doc.moveDown(0.05);
    const treatmentSectionY = doc.y;
    doc.rect(startX, treatmentSectionY, 3, 22).fill('#ec4899');

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#db2777').text(
      cleanText('TRATAMIENTO'),
      startX + 10, treatmentSectionY + 1
    );

    const treatmentBoxY = treatmentSectionY + 10;
    doc.rect(startX, treatmentBoxY, contentWidth, 28).fill('#fce7f3').stroke('#fbcfe8');

    doc.font('Helvetica').fontSize(8).fillColor('#000000').text(
      cleanText(history.treatment),
      startX + 8, treatmentBoxY + 5,
      { align: 'justify', width: contentWidth - 20 }
    );

    doc.y = treatmentBoxY + 30;

    // RECOMENDACIONES
    if (history.recommendations) {
      doc.moveDown(0.05);
      const recSectionY = doc.y;
      doc.rect(startX, recSectionY, 3, 22).fill('#8b5cf6');

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#7c3aed').text(
        cleanText('RECOMENDACIONES'),
        startX + 10, recSectionY + 1
      );

      const recBoxY = recSectionY + 10;
      doc.rect(startX, recBoxY, contentWidth, 34).fill('#f5f3ff').stroke('#ddd6fe');

      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(
        cleanText(history.recommendations),
        startX + 8, recBoxY + 5,
        { align: 'justify', width: contentWidth - 20 }
      );

      doc.y = recBoxY + 36;
    }

    // Nota legal ultra compacta
    doc.moveDown(0.05);
    const noteY = doc.y;
    doc.rect(startX, noteY, contentWidth, 12).fill('#f8fafc').stroke('#cbd5e1');
    doc.font('Helvetica').fontSize(6.5).fillColor('#475569').text(
      cleanText('Nota: Esta historia médica ocupacional se emite siguiendo estándares de la OMS y normativa vigente en salud ocupacional.'),
      startX + 6, noteY + 3,
      { align: 'justify', width: contentWidth - 12, lineGap: 0.5 }
    );

    doc.y = noteY + 14;
    doc.fillColor('#000000');

    // SECCIÓN DE FIRMAS COMPACTA
    doc.moveDown(0.05);
    const signatureY = doc.y + 8;
    const fullPageWidth = doc.page.width;

    doc.font('Helvetica').fontSize(8.5);

    // Firma Izquierda: Profesional (compacta)
    const leftSigX = 40;
    if (doctor.signature_path) {
      try {
        const signaturePath = this.resolvePublicPath(doctor.signature_path);
        const signBuffer = await this.convertImageForPDF(signaturePath);
        if (signBuffer) {
          doc.image(signBuffer, leftSigX, signatureY - 8, { width: 110, height: 28, align: 'left' });
          doc.text(cleanText(doctor.name), leftSigX, signatureY + 24, { width: 110 });
          doc.fontSize(7.5).text(cleanText(`Reg: ${doctor.professional_license || 'N/A'}`), leftSigX, signatureY + 32);
        } else {
          doc.text('_______________________', leftSigX, signatureY);
          doc.text(cleanText(doctor.name), leftSigX, signatureY + 10, { width: 110 });
          doc.fontSize(7.5).text(cleanText(`Reg: ${doctor.professional_license || 'N/A'}`), leftSigX, signatureY + 18);
        }
      } catch (error) {
        doc.text('_______________________', leftSigX, signatureY);
        doc.text(cleanText(doctor.name), leftSigX, signatureY + 10, { width: 110 });
        doc.fontSize(7.5).text(cleanText(`Reg: ${doctor.professional_license || 'N/A'}`), leftSigX, signatureY + 18);
      }
    } else {
      doc.text('_______________________', leftSigX, signatureY);
      doc.text(cleanText(doctor.name), leftSigX, signatureY + 10, { width: 110 });
      doc.fontSize(7.5).text(cleanText(`Reg: ${doctor.professional_license || 'N/A'}`), leftSigX, signatureY + 18);
    }

    // Firma Derecha: Paciente (compacta)
    const rightSigX = 350;
    doc.fontSize(8.5);

    if (patient.signature_path) {
      try {
        const patientSignaturePath = this.resolvePublicPath(patient.signature_path);
        const patientSigBuffer = await this.convertImageForPDF(patientSignaturePath);
        if (patientSigBuffer) {
          doc.image(patientSigBuffer, rightSigX, signatureY - 8, { width: 110, height: 28, align: 'left' });
          doc.text(cleanText(patient.name), rightSigX, signatureY + 24, { width: 110 });
          doc.fontSize(7.5).text(cleanText('Paciente'), rightSigX, signatureY + 32);
        } else {
          doc.text('_______________________', rightSigX, signatureY);
          doc.text(cleanText(patient.name), rightSigX, signatureY + 10, { width: 110 });
          doc.fontSize(7.5).text(cleanText('Paciente'), rightSigX, signatureY + 18);
        }
      } catch (error) {
        doc.text('_______________________', rightSigX, signatureY);
        doc.text(cleanText(patient.name), rightSigX, signatureY + 10, { width: 110 });
        doc.fontSize(7.5).text(cleanText('Paciente'), rightSigX, signatureY + 18);
      }
    } else {
      doc.text('_______________________', rightSigX, signatureY);
      doc.text(cleanText(patient.name), rightSigX, signatureY + 10, { width: 110 });
      doc.fontSize(7.5).text(cleanText('Paciente'), rightSigX, signatureY + 18);
    }

    doc.fillColor('#000000');
  }
}
