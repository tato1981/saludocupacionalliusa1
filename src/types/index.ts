export interface User {
  id: number;
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'doctor' | 'staff' | 'user' | 'moderator' | 'company';
  password_hash?: string;
  is_active?: boolean | number;
  company_id?: number | null;
  created_at: Date;
}

export interface Patient {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  profile_photo_url?: string;
  signature_url?: string;
  document_type: 'cedula' | 'pasaporte' | 'tarjeta_identidad';
  document_number: string;
  date_of_birth: Date;
  gender: 'masculino' | 'femenino' | 'otro';
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  occupation?: string;
  company?: string;
  insurance_provider?: string;
  insurance_number?: string;
  blood_type?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  medications?: string;
  medical_conditions?: string;
  created_by: number;
  created_by_name?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name?: string;
  doctor_id: number;
  doctor_name?: string;
  appointment_date: Date;
  appointment_type: 'consulta_general' | 'examen_ocupacional' | 'seguimiento' | 'emergencia' | 'vacunacion';
  status: 'programada' | 'confirmada' | 'en_progreso' | 'completada' | 'cancelada' | 'no_asistio';
  duration_minutes: number;
  reason?: string;
  notes?: string;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

export interface MedicalRecord {
  id: number;
  patient_id: number;
  patient_name?: string;
  appointment_id?: number;
  doctor_id: number;
  doctor_name?: string;
  visit_date: Date;
  chief_complaint?: string;
  symptoms?: string;
  physical_examination?: string;
  vital_signs?: {
    blood_pressure?: string;
    heart_rate?: number;
    temperature?: number;
    weight?: number;
    height?: number;
    oxygen_saturation?: number;
  };
  diagnosis?: string;
  treatment_plan?: string;
  medications_prescribed?: string;
  recommendations?: string;
  follow_up_date?: Date;
  follow_up_notes?: string;
  attachments?: any[];
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

// Tipos para Historia Médica Ocupacional
export interface VitalSigns {
  systolic_pressure?: number;
  diastolic_pressure?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  temperature?: number;
  oxygen_saturation?: number;
  height?: number;
  weight?: number;
  bmi?: number;
  waist_circumference?: number;
  hip_circumference?: number;
  body_fat_percentage?: number;
}

export interface OccupationalAssessment {
  work_environment_risk?: string;
  exposure_to_chemicals?: boolean;
  exposure_to_noise?: boolean;
  exposure_to_radiation?: boolean;
  ergonomic_risks?: boolean;
  psychological_stress_level?: 'bajo' | 'moderado' | 'alto' | 'muy_alto';
  physical_capacity?: 'normal' | 'limitada' | 'muy_limitada';
  fitness_for_work?: 'apto' | 'apto_con_restricciones' | 'no_apto' | 'apto_temporal';
  work_restrictions?: string[];
  occupational_recommendations?: string[];
}

export interface MedicalHistory {
  id: number;
  patient_id: number;
  patient_name?: string;
  doctor_id: number;
  doctor_name?: string;
  appointment_id?: number;
  
  // Motivo de consulta
  symptoms: string;
  current_illness?: string;
  
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
  
  // Diagnóstico y tratamiento
  diagnosis: string;
  cie10_code?: string;
  treatment: string;
  medications?: string;
  recommendations?: string;
  
  // Seguimiento
  next_appointment_date?: Date;
  notes?: string;
  
  created_at: Date;
  updated_at: Date;
}

export interface BMIAnalysis {
  bmi: number;
  classification: string;
  risk: string;
  recommendations: string[];
}

export interface BloodPressureAnalysis {
  classification: string;
  risk: string;
  recommendations: string[];
  occupational_fitness: string;
}

export interface HeartRateAnalysis {
  classification: string;
  recommendations: string[];
  occupational_fitness: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: string;
  phone?: string;
  invitationCode?: string;
  company_id?: number;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: any;
  timestamp: string;
}

// Tipos para el sistema de invitaciones
export interface InvitationCode {
  id: number;
  code: string;
  email?: string;
  created_by: number;
  created_by_name?: string;
  created_at: Date;
  used_at?: Date;
  used_by?: number;
  used_by_name?: string;
  used_by_email?: string;
  expires_at?: Date;
  is_active: boolean;
  max_uses: number;
  current_uses: number;
  description?: string;
}

export interface SystemSettings {
  id: number;
  setting_key: string;
  setting_value: string;
  description?: string;
  updated_at: Date;
  updated_by?: number;
}

export interface RegistrationAttempt {
  id: number;
  email: string;
  invitation_code?: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  created_at: Date;
}

// Tipos para validación de invitaciones
export interface InvitationValidation {
  valid: boolean;
  message: string;
  invitation?: InvitationCode;
}

export interface RegistrationStatus {
  enabled: boolean;
  mode: 'public' | 'invitation_only' | 'closed';
  message: string;
}

// Extender el namespace de Astro
declare global {
  namespace App {
    interface Locals {
      user?: {
        id: number;
        email: string;
        name: string;
        role: string;
      };
    }
  }
}
