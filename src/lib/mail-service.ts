import nodemailer from 'nodemailer';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export class MailService {
  private static transporter: nodemailer.Transporter | null = null;

  static ensureConfigured() {
    if (this.transporter) return;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '465');
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    console.log('Configurando servicio de correo con:', {
      host,
      port,
      secure,
      user: user ? '***' : 'missing',
    });

    if (!host || !user || !pass) {
      throw new Error('Faltan variables de entorno SMTP (SMTP_HOST, SMTP_USER, SMTP_PASSWORD)');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        // Necesario cuando se usa IP en vez de dominio para evitar error de certificado
        servername: 'smtp.hostinger.com'
      }
    });
  }

  static async sendMail(opts: {
    to: string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: MailAttachment[];
    fromEmail?: string;
    fromName?: string;
  }) {
    const { to, subject, html, text, attachments, fromEmail, fromName } = opts;

    if (!to || to.length === 0) {
      throw new Error('No se proporcionaron destinatarios');
    }

    this.ensureConfigured();

    const defaultFromEmail = process.env.SMTP_FROM_EMAIL || 'no-reply@localhost';
    const defaultFromName = process.env.SMTP_FROM_NAME || 'Salud Ocupacional';

    const senderEmail = fromEmail || defaultFromEmail;
    const senderName = fromName || defaultFromName;
    const from = `"${senderName}" <${senderEmail}>`;

    const mailOptions = {
      from,
      to, // Nodemailer accepts array of strings
      subject,
      html,
      text, // Versión en texto plano para mejorar entregabilidad
      attachments: (attachments || []).map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))
    };

    try {
      if (!this.transporter) {
        throw new Error("Transporter not initialized");
      }
      
      console.log(`Intentando enviar correo a: ${to.join(', ')}`);
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email enviado correctamente:', info.messageId);
      return info;
    } catch (error: any) {
      console.error('Error enviando email:', {
        message: error.message,
        code: error.code,
        response: error.response,
      });
      throw error;
    }
  }

  static async sendLoginNotification(opts: {
    to: string;
    userName: string;
    loginTime: string;
    userRole: string;
    ipAddress: string;
  }) {
    const { to, userName, loginTime, userRole, ipAddress } = opts;

    const subject = `Nuevo Inicio de Sesión Detectado - Sistema de Salud Ocupacional`;

    // Versión texto plano
    const text = `
Hola ${userName},

Se ha detectado un nuevo inicio de sesión en tu cuenta del Sistema de Salud Ocupacional.

Detalles del inicio de sesión:
- Fecha y Hora: ${loginTime}
- Rol: ${userRole}
- IP: ${ipAddress}

Si fuiste tú, puedes ignorar este mensaje.
Si no reconoces esta actividad, por favor contacta inmediatamente al administrador del sistema.

Sistema de Salud Ocupacional
    `.trim();

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nuevo Inicio de Sesión</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        .header { background-color: #6c757d; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .content { padding: 30px 20px; }
        .info-box { background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; margin: 20px 0; }
        .info-item { margin-bottom: 10px; }
        .info-item:last-child { margin-bottom: 0; }
        .info-label { font-weight: bold; color: #555; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid #eee; }
        .warning-text { color: #856404; font-size: 14px; margin-top: 20px; padding: 10px; background-color: #fff3cd; border-left: 4px solid #ffeeba; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Nuevo Inicio de Sesión</h1>
        </div>

        <div class="content">
          <p>Hola <strong>${userName}</strong>,</p>
          <p>Se ha detectado un nuevo inicio de sesión en tu cuenta.</p>

          <div class="info-box">
            <div class="info-item">
              <span class="info-label">📅 Fecha y Hora:</span> ${loginTime}
            </div>
            <div class="info-item">
              <span class="info-label">👤 Rol:</span> ${userRole}
            </div>
            <div class="info-item">
              <span class="info-label">🌐 Dirección IP:</span> ${ipAddress}
            </div>
          </div>

          <div class="warning-text">
            <strong>¿No fuiste tú?</strong><br>
            Si no reconoces esta actividad, por favor contacta inmediatamente al administrador del sistema para asegurar tu cuenta.
          </div>
        </div>

        <div class="footer">
          <p>Sistema de Salud Ocupacional</p>
          <p>Este es un mensaje de seguridad automático.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    return this.sendMail({
      to: [to],
      subject,
      html,
      text,
      fromName: 'Sistema de Salud Ocupacional'
    });
  }

  static async sendInvitationEmail(opts: {
    to: string;
    invitationCode: string;
    expiresAt?: Date | null;
    assignedRole?: string;
    description?: string;
  }) {
    const { to, invitationCode, expiresAt, assignedRole, description } = opts;

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4321';
    const registerUrl = `${baseUrl}/auth/register?code=${encodeURIComponent(invitationCode)}`;

    const roleNames: Record<string, string> = {
      'admin': 'Administrador',
      'staff': 'Personal',
      'doctor': 'Médico',
      'company': 'Empresa',
      'superadmin': 'Super Administrador'
    };

    const roleName = assignedRole ? roleNames[assignedRole] || assignedRole : 'Personal';

    const subject = 'Invitación al Sistema de Salud Ocupacional';

    // Versión texto plano
    let text = `
¡Bienvenido al Sistema de Salud Ocupacional!

Has sido invitado a unirte a nuestra plataforma. Utiliza el siguiente código de invitación para completar tu registro.

Código de Invitación: ${invitationCode}
Rol asignado: ${roleName}
`;

    if (description) {
      text += `Descripción: ${description}\n`;
    }

    if (expiresAt) {
      const expirationDate = new Date(expiresAt).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      text += `Válido hasta: ${expirationDate}\n`;
    }

    text += `\nPara registrarte, accede al siguiente enlace:\n${registerUrl}\n\nSistema de Salud Ocupacional`;

    // Versión HTML moderna y profesional
    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invitación al Sistema</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 0;
          background-color: #f5f7fa;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 30px auto;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.5px;
        }
        .header p {
          margin: 10px 0 0 0;
          font-size: 16px;
          opacity: 0.95;
        }
        .content {
          padding: 40px 30px;
        }
        .greeting {
          font-size: 18px;
          color: #2d3748;
          margin-bottom: 20px;
        }
        .invitation-code-box {
          background: linear-gradient(135deg, #f6f8fb 0%, #e9ecef 100%);
          border: 2px dashed #667eea;
          border-radius: 8px;
          padding: 25px;
          margin: 30px 0;
          text-align: center;
        }
        .code-label {
          font-size: 14px;
          color: #6c757d;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .invitation-code {
          font-size: 32px;
          font-weight: 700;
          color: #667eea;
          letter-spacing: 2px;
          font-family: 'Courier New', monospace;
          word-break: break-all;
        }
        .info-grid {
          display: table;
          width: 100%;
          margin: 25px 0;
        }
        .info-row {
          display: table-row;
        }
        .info-label {
          display: table-cell;
          padding: 12px 0;
          font-weight: 600;
          color: #4a5568;
          width: 40%;
        }
        .info-value {
          display: table-cell;
          padding: 12px 0;
          color: #2d3748;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white !important;
          text-decoration: none;
          padding: 16px 40px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
          text-align: center;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          transition: all 0.3s ease;
        }
        .cta-container {
          text-align: center;
          margin: 30px 0;
        }
        .expiration-notice {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #856404;
          font-size: 14px;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 30px 20px;
          text-align: center;
          color: #6c757d;
          font-size: 13px;
          border-top: 1px solid #e9ecef;
        }
        .footer p {
          margin: 5px 0;
        }
        .divider {
          height: 1px;
          background: linear-gradient(to right, transparent, #e9ecef, transparent);
          margin: 25px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>¡Has sido invitado!</h1>
          <p>Sistema de Salud Ocupacional</p>
        </div>

        <div class="content">
          <p class="greeting">Estimado/a usuario/a,</p>

          <p>Nos complace informarte que has sido invitado a formar parte del <strong>Sistema de Salud Ocupacional</strong>. Este sistema te permitirá gestionar de manera eficiente todos los procesos relacionados con la salud ocupacional.</p>

          <div class="invitation-code-box">
            <div class="code-label">Tu código de invitación</div>
            <div class="invitation-code">${invitationCode}</div>
          </div>

          <div class="divider"></div>

          <div class="info-grid">
            <div class="info-row">
              <div class="info-label">👤 Rol asignado:</div>
              <div class="info-value"><strong>${roleName}</strong></div>
            </div>
            ${description ? `
            <div class="info-row">
              <div class="info-label">📝 Descripción:</div>
              <div class="info-value">${description}</div>
            </div>
            ` : ''}
            ${expiresAt ? `
            <div class="info-row">
              <div class="info-label">⏰ Válido hasta:</div>
              <div class="info-value">${new Date(expiresAt).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</div>
            </div>
            ` : ''}
          </div>

          ${expiresAt ? `
          <div class="expiration-notice">
            <strong>⚠️ Nota importante:</strong> Este código de invitación tiene una fecha de expiración. Por favor, completa tu registro antes de la fecha indicada.
          </div>
          ` : ''}

          <div class="cta-container">
            <a href="${registerUrl}" class="cta-button">Completar mi registro</a>
          </div>

          <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">
            Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:
          </p>
          <p style="color: #667eea; font-size: 13px; word-break: break-all;">
            ${registerUrl}
          </p>
        </div>

        <div class="footer">
          <p><strong>Sistema de Salud Ocupacional</strong></p>
          <p>Este es un mensaje automático, por favor no responder a este correo.</p>
          <p style="margin-top: 15px; color: #adb5bd; font-size: 12px;">
            Si tienes alguna pregunta o necesitas ayuda, contacta al administrador del sistema.
          </p>
        </div>
      </div>
    </body>
    </html>
    `.trim();

    return this.sendMail({
      to: [to],
      subject,
      html,
      text,
      fromName: 'Sistema de Salud Ocupacional'
    });
  }
}
