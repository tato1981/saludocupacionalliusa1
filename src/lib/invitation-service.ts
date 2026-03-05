// Servicio para manejar códigos de invitación
import { db } from './database.js';
import type { InvitationCode, SystemSettings } from '../types/index.js';

export class InvitationService {
  
  // Validar código de invitación
  static async validateInvitationCode(code: string, email?: string): Promise<{
    valid: boolean;
    message: string;
    invitation?: InvitationCode & { assigned_role?: string; created_by_company_id?: number };
  }> {
    try {
      const query = `
        SELECT ic.*, u.name as created_by_name, u.company_id as created_by_company_id
        FROM invitation_codes ic
        LEFT JOIN users u ON ic.created_by = u.id
        WHERE ic.code = ? AND ic.is_active = TRUE
      `;
      
      const [rows] = await db.execute(query, [code]);
      const invitation = (rows as any[])[0];

      if (!invitation) {
        return {
          valid: false,
          message: 'Código de invitación inválido o no existe'
        };
      }

      // Verificar si el código ha expirado
      if (invitation.expires_at && new Date() > new Date(invitation.expires_at)) {
        return {
          valid: false,
          message: 'Código de invitación expirado'
        };
      }

      // Verificar si ya se usó el máximo de veces
      if (invitation.current_uses >= invitation.max_uses) {
        return {
          valid: false,
          message: 'Código de invitación ya utilizado'
        };
      }

      // Si el código está asociado a un email específico, validar
      if (invitation.email && email && invitation.email !== email) {
        return {
          valid: false,
          message: 'Este código de invitación está reservado para otro email'
        };
      }

      return {
        valid: true,
        message: 'Código de invitación válido',
        invitation
      };

    } catch (error) {
      console.error('Error validando código de invitación:', error);
      return {
        valid: false,
        message: 'Error al validar código de invitación'
      };
    }
  }

  // Marcar código como usado
  static async markCodeAsUsed(code: string, userId: number): Promise<boolean> {
    try {
      const query = `
        UPDATE invitation_codes 
        SET current_uses = current_uses + 1,
            used_at = CURRENT_TIMESTAMP,
            used_by = ?
        WHERE code = ?
      `;
      
      await db.execute(query, [userId, code]);
      return true;
    } catch (error) {
      console.error('Error marcando código como usado:', error);
      return false;
    }
  }

  // Generar nuevo código de invitación
  static async generateInvitationCode(params: {
    createdBy: number;
    email?: string;
    description?: string;
    expiresIn?: number; // días
    maxUses?: number;
  }): Promise<{ success: boolean; code?: string; message: string }> {
    try {
      // Generar código único
      const code = this.generateUniqueCode();
      
      // Calcular fecha de expiración
      const expiresAt = params.expiresIn 
        ? new Date(Date.now() + (params.expiresIn * 24 * 60 * 60 * 1000))
        : null;

      const query = `
        INSERT INTO invitation_codes 
        (code, email, created_by, description, expires_at, max_uses)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      await db.execute(query, [
        code,
        params.email || null,
        params.createdBy,
        params.description || null,
        expiresAt,
        params.maxUses || 1
      ]);

      return {
        success: true,
        code,
        message: 'Código de invitación generado exitosamente'
      };

    } catch (error) {
      console.error('Error generando código de invitación:', error);
      return {
        success: false,
        message: 'Error al generar código de invitación'
      };
    }
  }

  // Obtener códigos de invitación de un usuario
  static async getInvitationCodes(createdBy: number): Promise<InvitationCode[]> {
    try {
      const query = `
        SELECT ic.*, 
               u1.name as created_by_name,
               u2.name as used_by_name,
               u2.email as used_by_email
        FROM invitation_codes ic
        LEFT JOIN users u1 ON ic.created_by = u1.id
        LEFT JOIN users u2 ON ic.used_by = u2.id
        WHERE ic.created_by = ?
        ORDER BY ic.created_at DESC
      `;

      const [rows] = await db.execute(query, [createdBy]);
      return rows as InvitationCode[];
    } catch (error) {
      console.error('Error obteniendo códigos de invitación:', error);
      return [];
    }
  }

  // Listar todos los códigos (solo admins)
  static async getAllInvitationCodes(): Promise<InvitationCode[]> {
    try {
      const query = `
        SELECT ic.*, 
               u1.name as created_by_name,
               u2.name as used_by_name,
               u2.email as used_by_email
        FROM invitation_codes ic
        LEFT JOIN users u1 ON ic.created_by = u1.id
        LEFT JOIN users u2 ON ic.used_by = u2.id
        ORDER BY ic.created_at DESC
      `;

      const [rows] = await db.execute(query);
      return rows as InvitationCode[];
    } catch (error) {
      console.error('Error obteniendo todos los códigos:', error);
      return [];
    }
  }

  // Desactivar código
  static async deactivateCode(code: string): Promise<boolean> {
    try {
      await db.execute('UPDATE invitation_codes SET is_active = FALSE WHERE code = ?', [code]);
      return true;
    } catch (error) {
      console.error('Error desactivando código:', error);
      return false;
    }
  }

  // Obtener configuración del sistema
  static async getSystemSettings(): Promise<Record<string, string>> {
    try {
      const [rows] = await db.execute('SELECT setting_key, setting_value FROM system_settings');
      const settings: Record<string, string> = {};
      
      (rows as any[]).forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });

      return settings;
    } catch (error) {
      console.error('Error obteniendo configuración:', error);
      return {
        registration_mode: 'invitation_only',
        require_email_verification: 'false',
        auto_approve_registrations: 'false',
        max_login_attempts: '5'
      };
    }
  }

  // Actualizar configuración del sistema
  static async updateSystemSetting(key: string, value: string, updatedBy: number): Promise<boolean> {
    try {
      const query = `
        INSERT INTO system_settings (setting_key, setting_value, updated_by)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        setting_value = VALUES(setting_value),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
      `;
      
      await db.execute(query, [key, value, updatedBy]);
      return true;
    } catch (error) {
      console.error('Error actualizando configuración:', error);
      return false;
    }
  }

  // Registrar intento de registro
  static async logRegistrationAttempt(params: {
    email: string;
    invitationCode?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO registration_attempts 
        (email, invitation_code, ip_address, user_agent, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      await db.execute(query, [
        params.email,
        params.invitationCode || null,
        params.ipAddress || null,
        params.userAgent || null,
        params.success,
        params.errorMessage || null
      ]);
    } catch (error) {
      console.error('Error registrando intento:', error);
    }
  }

  // Generar código único
  private static generateUniqueCode(): string {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `INV-${timestamp}-${randomStr}`.toUpperCase();
  }

  // Verificar si el registro está habilitado
  static async isRegistrationEnabled(): Promise<{
    enabled: boolean;
    mode: 'public' | 'invitation_only' | 'closed';
    message: string;
  }> {
    try {
      const settings = await this.getSystemSettings();
      const mode = settings.registration_mode as 'public' | 'invitation_only' | 'closed';

      switch (mode) {
        case 'public':
          return {
            enabled: true,
            mode,
            message: 'Registro público habilitado'
          };
        case 'invitation_only':
          return {
            enabled: true,
            mode,
            message: 'Registro solo con código de invitación'
          };
        case 'closed':
          return {
            enabled: false,
            mode,
            message: 'Registro cerrado temporalmente'
          };
        default:
          return {
            enabled: true,
            mode: 'invitation_only',
            message: 'Registro solo con código de invitación'
          };
      }
    } catch (error) {
      return {
        enabled: false,
        mode: 'closed',
        message: 'Error verificando estado del registro'
      };
    }
  }
}