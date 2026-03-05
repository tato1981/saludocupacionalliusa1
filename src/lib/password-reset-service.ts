import { db } from './database';
import { hashPassword } from './auth';
import { MailService } from './mail-service';
import crypto from 'crypto';

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export class PasswordResetService {
  // Generar token seguro
  private static generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Solicitar reset de contraseña
  static async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Verificar si el usuario existe
      const [users] = await db.execute(
        'SELECT id, name, email FROM users WHERE email = ? AND is_active = TRUE',
        [email]
      );

      const userArray = users as any[];
      if (userArray.length === 0) {
        // Por seguridad, no revelamos si el email existe o no
        return {
          success: true,
          message: 'Si el email está registrado, recibirás un enlace de recuperación.'
        };
      }

      const user = userArray[0];

      // Invalidar tokens anteriores para este usuario
      await db.execute(
        'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = ? AND used = FALSE',
        [user.id]
      );

      // Generar nuevo token
      const token = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30); // Válido por 30 minutos

      // Guardar token en la base de datos
      await db.execute(
        `INSERT INTO password_reset_tokens (user_id, token, email, expires_at) 
         VALUES (?, ?, ?, ?)`,
        [user.id, token, email, expiresAt]
      );

      // Enviar email de recuperación
      await this.sendPasswordResetEmail({
        to: email,
        userName: user.name,
        resetToken: token
      });

      return {
        success: true,
        message: 'Si el email está registrado, recibirás un enlace de recuperación.'
      };

    } catch (error: any) {
      console.error('Error en solicitud de reset (PasswordResetService):', error);
      // Log más detalles si es un error de email
      if (error.code || error.response) {
         console.error('Detalles del error de email:', {
             code: error.code,
             response: error.response
         });
      }
      return {
        success: false,
        message: 'Error interno del servidor. Intenta nuevamente.'
      };
    }
  }

  // Verificar validez del token
  static async verifyResetToken(token: string): Promise<{ valid: boolean; email?: string; message: string }> {
    try {
      const [tokens] = await db.execute(
        `SELECT prt.*, u.email, u.name 
         FROM password_reset_tokens prt
         JOIN users u ON prt.user_id = u.id
         WHERE prt.token = ? AND prt.used = FALSE AND prt.expires_at > NOW()`,
        [token]
      );

      const tokenArray = tokens as any[];
      if (tokenArray.length === 0) {
        return {
          valid: false,
          message: 'Token inválido o expirado.'
        };
      }

      return {
        valid: true,
        email: tokenArray[0].email,
        message: 'Token válido.'
      };

    } catch (error) {
      console.error('Error verificando token:', error);
      return {
        valid: false,
        message: 'Error verificando el token.'
      };
    }
  }

  // Confirmar reset de contraseña
  static async confirmPasswordReset(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      // Verificar token
      const tokenVerification = await this.verifyResetToken(token);
      if (!tokenVerification.valid) {
        return {
          success: false,
          message: tokenVerification.message
        };
      }

      // Obtener información del token
      const [tokens] = await db.execute(
        `SELECT prt.*, u.id as user_id, u.name 
         FROM password_reset_tokens prt
         JOIN users u ON prt.user_id = u.id
         WHERE prt.token = ? AND prt.used = FALSE`,
        [token]
      );

      const tokenArray = tokens as any[];
      if (tokenArray.length === 0) {
        return {
          success: false,
          message: 'Token no encontrado.'
        };
      }

      const tokenData = tokenArray[0];

      // Validar contraseña
      if (!newPassword || newPassword.length < 6) {
        return {
          success: false,
          message: 'La contraseña debe tener al menos 6 caracteres.'
        };
      }

      // Hash de la nueva contraseña
      const passwordHash = await hashPassword(newPassword);

      // Actualizar contraseña del usuario
      await db.execute(
        'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [passwordHash, tokenData.user_id]
      );

      // Marcar token como usado
      await db.execute(
        'UPDATE password_reset_tokens SET used = TRUE WHERE token = ?',
        [token]
      );

      // Enviar notificación de cambio exitoso
      await this.sendPasswordChangeNotification({
        to: tokenData.email,
        userName: tokenData.name
      });

      return {
        success: true,
        message: 'Contraseña actualizada exitosamente.'
      };

    } catch (error) {
      console.error('Error confirmando reset:', error);
      return {
        success: false,
        message: 'Error interno del servidor.'
      };
    }
  }

  // Enviar email de recuperación
  private static async sendPasswordResetEmail(opts: {
    to: string;
    userName: string;
    resetToken: string;
  }) {
    const { to, userName, resetToken } = opts;

    // URL base desde variables de entorno o localhost
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:4321';
    const resetUrl = `${baseUrl}/auth/reset-password?token=${resetToken}`;

    const subject = `Recuperación de Contraseña - Sistema de Salud Ocupacional`;
    
    // Versión texto plano
    const text = `
Hola ${userName},

Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en el Sistema de Salud Ocupacional.

Para crear una nueva contraseña, visita el siguiente enlace:
${resetUrl}

Este enlace es válido por 30 minutos.

Si no solicitaste este cambio, por favor ignora este mensaje.

Sistema de Salud Ocupacional
    `.trim();

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Recuperación de Contraseña</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .content { padding: 30px 20px; }
        .btn-container { text-align: center; margin: 30px 0; }
        .btn { display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff !important; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px; }
        .btn:hover { background-color: #0056b3; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #eee; }
        .link-text { word-break: break-all; color: #007bff; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Recuperación de Contraseña</h1>
        </div>
        
        <div class="content">
          <p>Hola <strong>${userName}</strong>,</p>
          
          <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>

          <div class="btn-container">
            <a href="${resetUrl}" class="btn">Restablecer Contraseña</a>
          </div>

          <p>Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
          <p><a href="${resetUrl}" class="link-text">${resetUrl}</a></p>

          <p style="margin-top: 30px; font-size: 14px; color: #666;">
            <strong>Nota:</strong> Este enlace expirará en 30 minutos por seguridad. Si no solicitaste este cambio, puedes ignorar este correo.
          </p>
        </div>

        <div class="footer">
          <p>Sistema de Salud Ocupacional</p>
          <p>Este es un mensaje automático, por favor no responder.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    await MailService.sendMail({
      to: [to],
      subject,
      html,
      text, // Enviamos también texto plano
      fromName: 'Sistema de Salud Ocupacional' // Sin emojis
    });
  }

  // Enviar notificación de cambio exitoso
  private static async sendPasswordChangeNotification(opts: {
    to: string;
    userName: string;
  }) {
    const { to, userName } = opts;

    const subject = `Contraseña Actualizada - Sistema de Salud Ocupacional`;
    
    // Versión texto plano
    const text = `
Hola ${userName},

Tu contraseña ha sido actualizada correctamente en el Sistema de Salud Ocupacional.

Si no realizaste este cambio, contacta inmediatamente al administrador del sistema.

Sistema de Salud Ocupacional
    `.trim();

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Contraseña Actualizada</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .content { padding: 30px 20px; }
        .alert-box { background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 4px; text-align: center; margin-bottom: 20px; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Contraseña Actualizada</h1>
        </div>
        
        <div class="content">
          <p>Hola <strong>${userName}</strong>,</p>
          
          <div class="alert-box">
            <strong>¡Éxito!</strong> Tu contraseña ha sido actualizada correctamente.
          </div>

          <p>Si no realizaste este cambio, por favor contacta inmediatamente al administrador del sistema.</p>
        </div>

        <div class="footer">
          <p>Sistema de Salud Ocupacional</p>
        </div>
      </div>
    </body>
    </html>
    `;

    await MailService.sendMail({
      to: [to],
      subject,
      html,
      text,
      fromName: 'Sistema de Salud Ocupacional' // Sin emojis
    });
  }

  // Limpiar tokens expirados (función de mantenimiento)
  static async cleanupExpiredTokens(): Promise<number> {
    try {
      const [result] = await db.execute(
        'DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE'
      );
      
      const deleteResult = result as any;
      return deleteResult.affectedRows || 0;
    } catch (error) {
      console.error('Error limpiando tokens expirados:', error);
      return 0;
    }
  }
}
