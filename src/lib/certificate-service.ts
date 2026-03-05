import { db } from './database.js';
import dayjs from 'dayjs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export type AptitudeStatus = 'apto' | 'apto_con_restricciones' | 'apto_manipulacion_alimentos' | 'apto_trabajo_alturas' | 'apto_espacios_confinados' | 'apto_conduccion';

export interface IssueCertificateParams {
  patientId: number;
  doctorId: number;
  appointmentId?: number;
  aptitudeStatus: AptitudeStatus;
  restrictions?: string;
  recommendations?: string;
  validityStart?: string; // YYYY-MM-DD
  validityEnd?: string;   // YYYY-MM-DD
}

function generateCode(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function baseUrl(): string {
  // 1. Prioridad a APP_BASE_URL configurada explícitamente
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  // 2. Detectar URLs comunes en plataformas de hosting
  // Vercel
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Netlify
  if (process.env.URL) {
    return process.env.URL;
  }

  // Railway, Render, Heroku
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }

  // 3. Detectar NODE_ENV para decidir entre producción y desarrollo
  if (process.env.NODE_ENV === 'production') {
    // En producción sin URL configurada, intentar construir desde HOST y PORT
    const host = process.env.HOST || 'localhost';
    const port = process.env.PORT || '4321';

    // Si el host no es localhost, asumir que es producción con HTTPS
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return `https://${host}`;
    }

    return `http://${host}:${port}`;
  }

  // 4. Fallback para desarrollo local
  return 'http://localhost:4321';
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    // Reemplazar caracteres problemáticos comunes que no están en WinAnsi
    .replace(/[\u2018\u2019]/g, "'") // Comillas simples curvas
    .replace(/[\u201C\u201D]/g, '"') // Comillas dobles curvas
    .replace(/[\u2013\u2014]/g, '-') // Guiones largos
    .replace(/\u2026/g, '...')       // Puntos suspensivos
    .replace(/\u00A0/g, ' ');        // Espacio de no separación
}

export class CertificateService {
  /**
   * Resolver ruta de archivo estático tanto en desarrollo como en producción
   */
  private static resolvePublicPath(relativePath: string): string {
    if (!relativePath) return '';

    // Si ya es una URL completa (http/https), retornarla tal cual
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }

    // Remover el slash inicial si existe
    const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

    // Buscar en múltiples ubicaciones:
    // 1. uploads/ (carpeta persistente - RECOMENDADO para producción)
    // 2. dist/client/ (archivos del build)
    // 3. public/ (desarrollo)
    const possiblePaths = [
      path.join(process.cwd(), cleanPath),                    // uploads/ (persistente)
      path.join(process.cwd(), 'dist', 'client', cleanPath),  // Producción (build)
      path.join(process.cwd(), 'public', cleanPath),          // Desarrollo
      path.join(process.cwd(), '..', cleanPath),              // Server en subdirectorio
    ];

    // Buscar el archivo en las rutas posibles
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        console.log('✅ Archivo encontrado en:', possiblePath);
        return possiblePath;
      }
    }

    // Si no se encuentra, retornar la primera opción y dejar que falle
    console.error('❌ Archivo no encontrado en ninguna ubicación:');
    possiblePaths.forEach(p => console.error('   -', p));
    return possiblePaths[0];
  }

  /**
   * Convertir imagen a formato compatible con PDFKit
   */
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

      // Verificar si el archivo existe
      if (!fs.existsSync(imagePath)) {
        console.error('❌ El archivo no existe:', imagePath);
        console.error('   process.cwd():', process.cwd());
        return null;
      }

      // Si la imagen ya es JPEG o PNG, leerla directamente
      const ext = path.extname(imagePath).toLowerCase();
      console.log('📝 Extensión del archivo:', ext);

      if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        console.log('✅ Leyendo imagen directamente (formato compatible)');
        return fs.readFileSync(imagePath);
      }

      // Si es WebP u otro formato, convertir a JPEG
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

  private static addGeneralObservations(doc: PDFKit.PDFDocument, contentWidth: number) {
    const startX = 50;

    doc.moveDown(0.5);

    // OBSERVACIONES GENERALES PARA EL TRABAJADOR
    const header1Y = doc.y;

    // Barra lateral púrpura
    doc.rect(startX, header1Y, 4, 20).fill('#8b5cf6');

    // Encabezado moderno
    doc.rect(startX, header1Y, contentWidth, 18).fill('#f5f3ff').stroke('#c4b5fd');
    doc.fillColor('#5b21b6');
    doc.font('Helvetica-Bold').fontSize(7).text(
      cleanText('OBSERVACIONES GENERALES PARA EL TRABAJADOR'),
      startX + 10, header1Y + 6,
      { width: contentWidth - 20, align: 'left' }
    );

    doc.y = header1Y + 23;
    doc.font('Helvetica').fontSize(6).fillColor('#1f2937');

    const workerObs = [
      'Atender las recomendaciones y/o restricciones emitidas en este concepto, tanto en el ámbito intralaboral como extralaboral',
      'Cumplir las normas, reglamentos e instrucciones del SG-SST, incluyendo el uso correcto de los EPP cuando aplique',
      'Participar en las actividades de capacitación definidas en el SG-SST',
      'Estilos de vida saludable: Realizar ejercicio mínimo 3 veces a la semana, dieta equilibrada, consumo de agua, procurar adecuada higiene del sueño, evitar consumo de tabaco y alcohol',
      'Otras Recomendaciones: Uso de EPP de acuerdo al riesgo de exposición, pausas activas de acuerdo a las normas de la empresa, alternar tareas con el fin de disminuir posiciones prolongadas y movimientos repetitivos, estilo de vida saludable, alimentación balanceada, ejercicio diario mínimo 1 hora, higiene postural, valoración médico ocupacional periódica. Participar en las actividades del SG-SST. Levantamiento adecuado de peso'
    ];

    workerObs.forEach(obs => {
        const currentY = doc.y;
        const bulletX = startX + 8;
        const textX = startX + 15;
        const textWidth = contentWidth - 20;

        doc.fillColor('#8b5cf6').text('*', bulletX, currentY);
        doc.fillColor('#1f2937').text(cleanText(obs), textX, currentY, { width: textWidth, align: 'justify' });
        doc.moveDown(0.15);
    });

    doc.moveDown(0.3);
    doc.fillColor('#000000');

    // OBSERVACIONES GENERALES PARA LA EMPRESA
    const header2Y = doc.y;

    // Barra lateral naranja
    doc.rect(startX, header2Y, 4, 20).fill('#f97316');

    // Encabezado moderno
    doc.rect(startX, header2Y, contentWidth, 18).fill('#fff7ed').stroke('#fed7aa');
    doc.fillColor('#c2410c');
    doc.font('Helvetica-Bold').fontSize(7).text(
      cleanText('OBSERVACIONES GENERALES PARA LA EMPRESA'),
      startX + 10, header2Y + 6,
      { width: contentWidth - 20, align: 'left' }
    );

    doc.y = header2Y + 23;
    doc.font('Helvetica').fontSize(6).fillColor('#1f2937');

    const companyObs = [
      'Comunicar al trabajador el concepto y recomendaciones emitidas en este documento',
      'Realizar periódicamente todos los exámenes definidos según perfil del cargo',
      'Inducción y capacitación periódica, acordes a las funciones y riesgos del cargo'
    ];

    companyObs.forEach(obs => {
        const currentY = doc.y;
        const bulletX = startX + 8;
        const textX = startX + 15;
        const textWidth = contentWidth - 20;

        doc.fillColor('#f97316').text('*', bulletX, currentY);
        doc.fillColor('#1f2937').text(cleanText(obs), textX, currentY, { width: textWidth, align: 'justify' });
        doc.moveDown(0.15);
    });

    doc.fillColor('#000000');
  }

  static async getPatientSummary(patientId: number) {
    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.document_type, p.document_number, p.email, p.phone, p.occupation, COALESCE(c.name, p.company) as company, c.responsible_name as company_responsible, p.date_of_birth, p.photo_path, p.signature_path
       FROM patients p
       LEFT JOIN companies c ON p.company_id = c.id
       WHERE p.id = ?`,
      [patientId]
    );
    const arr = rows as any[];
    return arr.length > 0 ? arr[0] : null;
  }

  static async getDoctorSummary(doctorId: number) {
    const [rows] = await db.execute(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.specialization, u.professional_license, u.document_number, u.signature_path
       FROM users u WHERE u.id = ?`,
      [doctorId]
    );
    const arr = rows as any[];
    return arr.length > 0 ? arr[0] : null;
  }

  static async getAppointmentInfo(appointmentId: number) {
    const [rows] = await db.execute(
      `SELECT id, appointment_type, appointment_date FROM appointments WHERE id = ?`,
      [appointmentId]
    );
    const arr = rows as any[];
    return arr.length > 0 ? arr[0] : null;
  }

  static async issueCertificate(params: IssueCertificateParams): Promise<{ success: boolean; message?: string; certificateId?: number; pdfBuffer?: Buffer; verificationUrl?: string; }>{
    try {
      console.log('📋 Obteniendo datos del paciente y doctor...');

      // Ejecutar consultas en paralelo para mejorar rendimiento
      const [patient, doctor, appointmentInfo] = await Promise.all([
        this.getPatientSummary(params.patientId),
        this.getDoctorSummary(params.doctorId),
        params.appointmentId ? this.getAppointmentInfo(params.appointmentId) : Promise.resolve(null)
      ]);

      if (!patient) return { success: false, message: 'Paciente no encontrado' };

      if (!doctor || doctor.role !== 'doctor') {
        return { success: false, message: 'Doctor no autorizado: solo médicos pueden emitir certificados' };
      }

      // Generar código de verificación único
      const verificationCode = generateCode(32);

      // Usar fecha de inicio de vigencia como fecha de certificado si existe, sino usar fecha actual
      // Si params.validityStart viene en formato YYYY-MM-DD, MySQL lo aceptará correctamente en columna DATETIME
      const certificateDate = params.validityStart ? params.validityStart : dayjs().format('YYYY-MM-DD HH:mm:ss');

      // Insertar registro de certificado
      const [result] = await db.execute(
        `INSERT INTO work_certificates (
          patient_id, doctor_id, appointment_id, aptitude_status, restrictions, recommendations,
          validity_start, validity_end, verification_code, certificate_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.patientId,
          params.doctorId,
          params.appointmentId || null,
          params.aptitudeStatus,
          params.restrictions || null,
          params.recommendations || null,
          params.validityStart || null,
          params.validityEnd || null,
          verificationCode,
          certificateDate
        ]
      );

      const certificateId = (result as any).insertId as number;
      const verificationUrl = `${baseUrl()}/certificates/verify?code=${encodeURIComponent(verificationCode)}`;

      // Actualizar medical_histories con el aptitude_status del certificado
      try {
        console.log('📝 Actualizando historial médico con concepto de aptitud...');

        // Buscar el historial médico asociado a esta cita
        if (params.appointmentId) {
          const [historyRows] = await db.execute(
            'SELECT id FROM medical_histories WHERE appointment_id = ? AND patient_id = ? LIMIT 1',
            [params.appointmentId, params.patientId]
          );

          if ((historyRows as any[]).length > 0) {
            const historyId = (historyRows as any[])[0].id;
            await db.execute(
              'UPDATE medical_histories SET aptitude_status = ?, restrictions = ? WHERE id = ?',
              [params.aptitudeStatus, params.restrictions || null, historyId]
            );
            console.log(`✅ Historial médico ID ${historyId} actualizado con aptitude_status: ${params.aptitudeStatus}`);
          } else {
            // Si no hay historial asociado a la cita, buscar el más reciente del paciente
            const [latestHistory] = await db.execute(
              'SELECT id FROM medical_histories WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1',
              [params.patientId]
            );

            if ((latestHistory as any[]).length > 0) {
              const historyId = (latestHistory as any[])[0].id;
              await db.execute(
                'UPDATE medical_histories SET aptitude_status = ?, restrictions = ? WHERE id = ?',
                [params.aptitudeStatus, params.restrictions || null, historyId]
              );
              console.log(`✅ Historial médico más reciente ID ${historyId} actualizado con aptitude_status: ${params.aptitudeStatus}`);
            } else {
              console.warn('⚠️ No se encontró historial médico para actualizar aptitude_status');
            }
          }
        } else {
          // Si no hay appointment_id, actualizar el historial más reciente del paciente
          const [latestHistory] = await db.execute(
            'SELECT id FROM medical_histories WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1',
            [params.patientId]
          );

          if ((latestHistory as any[]).length > 0) {
            const historyId = (latestHistory as any[])[0].id;
            await db.execute(
              'UPDATE medical_histories SET aptitude_status = ?, restrictions = ? WHERE id = ?',
              [params.aptitudeStatus, params.restrictions || null, historyId]
            );
            console.log(`✅ Historial médico más reciente ID ${historyId} actualizado con aptitude_status: ${params.aptitudeStatus}`);
          } else {
            console.warn('⚠️ No se encontró historial médico para actualizar aptitude_status');
          }
        }
      } catch (updateError) {
        console.error('❌ Error actualizando historial médico con aptitude_status:', updateError);
        // No fallar la emisión del certificado por este error
      }

      console.log('🔗 Generando código QR...');
      // Generar QR con configuración optimizada para rendimiento
      const qrBuffer = await QRCode.toBuffer(verificationUrl, { 
        type: 'png', 
        width: 250,  // Reducido aún más para mejor rendimiento
        errorCorrectionLevel: 'L',  // Corrección baja para máximo rendimiento
        margin: 2,  // Margen mínimo
        color: { 
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      console.log('✅ QR generado');

      // Construir PDF (Oficio/Legal - 8.5" x 14")
      const doc = new PDFDocument({ size: 'LEGAL', margin: 50 });
      const chunks: Buffer[] = [];
      return await new Promise(async (resolve, reject) => {
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve({ success: true, certificateId, pdfBuffer, verificationUrl });
        });
        doc.on('error', (err) => reject(err));

        // ENCABEZADO MODERNO CON BANNER
      const pageWidth = doc.page.width - 100;
      const contentWidth = doc.page.width - 100;

      // Banner superior con gradiente
      const headerY = 50;
      const headerHeight = 70;
      doc.rect(50, headerY, pageWidth, headerHeight).fill('#1e3a8a').stroke('#1e40af');

      // Título principal en el banner
      doc.fillColor('#FFFFFF');
      doc.font('Helvetica-Bold').fontSize(14).text(
        cleanText('CERTIFICADO DE APTITUD LABORAL'),
        50, headerY + 20,
        { align: 'center', width: pageWidth }
      );

      doc.font('Helvetica').fontSize(8).text(
        cleanText('Sistema de Salud Ocupacional'),
        50, headerY + 42,
        { align: 'center', width: pageWidth }
      );

      // Línea decorativa dorada
      doc.strokeColor('#fbbf24').lineWidth(2);
      doc.moveTo(150, headerY + 58).lineTo(pageWidth - 50, headerY + 58).stroke();

      doc.y = headerY + headerHeight + 20;
      doc.fillColor('#000000').strokeColor('#000000');

      // Información de vigencia (si existe)
      if (params.validityStart || params.validityEnd) {
        const infoBoxY = doc.y;

        // Fondo con sombra
        doc.rect(50, infoBoxY, pageWidth, 35).fill('#f8fafc').stroke('#cbd5e1');

        doc.fillColor('#334155');
        doc.font('Helvetica-Bold').fontSize(7).text(cleanText('VIGENCIA'), 60, infoBoxY + 10);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(
          cleanText(`${params.validityStart ? dayjs(params.validityStart).format('DD/MM/YYYY') : '-'} a ${params.validityEnd ? dayjs(params.validityEnd).format('DD/MM/YYYY') : '-'}`),
          60, infoBoxY + 22
        );

        doc.y = infoBoxY + 40;
        doc.fillColor('#000000');
      }

      // Fecha de emisión y Tipo de cita en una sola fila (2 columnas)
      const appointmentInfoY = doc.y;
      const colWidth = pageWidth / 2;

      // Fecha de emisión
      const emissionX = 50;
      doc.rect(emissionX, appointmentInfoY, colWidth - 5, 28).fill('#f0fdf4').stroke('#86efac');
      doc.fillColor('#166534');
      doc.font('Helvetica-Bold').fontSize(6).text(cleanText('FECHA DE EMISIÓN'), emissionX + 10, appointmentInfoY + 6);
      doc.fillColor('#000000');
      doc.font('Helvetica').fontSize(7).text(cleanText(dayjs(certificateDate).format('DD/MM/YYYY')), emissionX + 10, appointmentInfoY + 16);

      // Tipo de cita (si existe)
      if (appointmentInfo?.appointment_type) {
        const appointmentTypeMap: Record<string, string> = {
          'examen_periodico': 'Examen Médico Periódico',
          'examen_ingreso': 'Examen de Ingreso',
          'examen_egreso': 'Examen de Egreso',
          'examen_reintegro': 'Examen de Reintegro',
          'consulta_general': 'Consulta General',
          'consulta_especializada': 'Consulta Especializada',
          'seguimiento': 'Seguimiento',
          'urgencias': 'Urgencias'
        };
        const appointmentTypeText = appointmentTypeMap[appointmentInfo.appointment_type] || appointmentInfo.appointment_type;

        const typeBoxX = 50 + colWidth;
        doc.rect(typeBoxX, appointmentInfoY, colWidth - 5, 28).fill('#dbeafe').stroke('#3b82f6');
        doc.fillColor('#1e3a8a');
        doc.font('Helvetica-Bold').fontSize(6).text(cleanText('TIPO DE CITA'), typeBoxX + 10, appointmentInfoY + 6);
        doc.fillColor('#000000');
        doc.font('Helvetica').fontSize(7).text(cleanText(appointmentTypeText), typeBoxX + 10, appointmentInfoY + 16, { width: colWidth - 25 });
      }

      doc.y = appointmentInfoY + 35;
      doc.fillColor('#000000');

      // DATOS DEL PACIENTE - Diseño moderno con barra lateral
      doc.moveDown(0.3);
      const patientSectionY = doc.y;

      // Barra lateral azul
      doc.rect(50, patientSectionY, 4, 60).fill('#3b82f6');

      // Título
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a8a').text(
        cleanText('DATOS DEL PACIENTE'),
        60, patientSectionY + 2
      );

      const patientTableY = patientSectionY + 15;

      // Fondo blanco con borde
      doc.rect(50, patientTableY, contentWidth, 50).fill('#ffffff').stroke('#e2e8f0');
      doc.fillColor('#000000');

      // Grid de información - 3 columnas
      const col1X = 60;
      const col2X = 220;
      const col3X = 380;

      // Fila 1
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Nombre Completo'), col1X, patientTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.name), col1X, patientTableY + 18, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Documento'), col2X, patientTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(`${patient.document_type || ''} ${patient.document_number || ''}`), col2X, patientTableY + 18);

      // Fila 2
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Fecha de Nacimiento'), col1X, patientTableY + 32);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.date_of_birth ? dayjs(patient.date_of_birth).format('DD/MM/YYYY') : 'N/A'), col1X, patientTableY + 42);

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Empresa'), col2X, patientTableY + 32);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.company || 'N/A'), col2X, patientTableY + 42, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Ocupación'), col3X, patientTableY + 32);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient.occupation || 'N/A'), col3X, patientTableY + 42, { width: 130 });

      // DATOS DEL PROFESIONAL - Diseño moderno
      doc.y = patientTableY + 60;
      const doctorSectionY = doc.y;

      // Barra lateral verde
      doc.rect(50, doctorSectionY, 4, 50).fill('#10b981');

      // Título
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#065f46').text(
        cleanText('PROFESIONAL EVALUADOR'),
        60, doctorSectionY + 2
      );

      const doctorTableY = doctorSectionY + 15;

      doc.rect(50, doctorTableY, contentWidth, 40).fill('#ffffff').stroke('#e2e8f0');
      doc.fillColor('#000000');

      // Grid de información
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Nombre Completo'), col1X, doctorTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor.name), col1X, doctorTableY + 18, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Especialidad'), col2X, doctorTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor.specialization || 'N/A'), col2X, doctorTableY + 18, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Registro Profesional'), col3X, doctorTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor.professional_license || 'N/A'), col3X, doctorTableY + 18);

      doc.y = doctorTableY + 45;
      doc.fillColor('#000000');

      // RESULTADO DE APTITUD - Diseño destacado
      doc.moveDown(0.4);
      const aptitudeSectionY = doc.y;

      const statusMap: Record<AptitudeStatus, string> = {
        'apto': 'APTO PARA EL TRABAJO',
        'apto_con_restricciones': 'APTO CON RESTRICCIONES',
        'apto_manipulacion_alimentos': 'APTO PARA MANIPULACIÓN DE ALIMENTOS',
        'apto_trabajo_alturas': 'APTO PARA TRABAJO EN ALTURAS',
        'apto_espacios_confinados': 'APTO PARA ESPACIOS CONFINADOS',
        'apto_conduccion': 'APTO PARA CONDUCCIÓN'
      };

      // Colores según estado
      let bgColor = '#d1fae5'; // verde claro
      let borderColor = '#10b981'; // verde
      let textColor = '#065f46'; // verde oscuro
      let barColor = '#10b981'; // verde

      if (params.aptitudeStatus === 'apto_con_restricciones') {
        bgColor = '#fef3c7'; // amarillo claro
        borderColor = '#f59e0b'; // amarillo
        textColor = '#92400e'; // amarillo oscuro
        barColor = '#f59e0b'; // amarillo
      }

      // Barra lateral de estado
      doc.rect(50, aptitudeSectionY, 6, 45).fill(barColor);

      // Título
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(
        cleanText('RESULTADO DE APTITUD'),
        62, aptitudeSectionY + 2
      );

      const resultY = aptitudeSectionY + 15;

      // Caja de resultado con diseño moderno
      doc.rect(50, resultY, contentWidth, 35).fill(bgColor).stroke(borderColor);
      doc.lineWidth(2);

      // Texto del resultado centrado y destacado
      doc.font('Helvetica-Bold').fontSize(11).fillColor(textColor).text(
        cleanText(statusMap[params.aptitudeStatus as AptitudeStatus] || 'NO DEFINIDO'),
        60, resultY + 12,
        { align: 'center', width: contentWidth - 20 }
      );

      doc.y = resultY + 40;
      doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      // RESTRICCIONES (si aplica)
      if (params.aptitudeStatus === 'apto_con_restricciones') {
        doc.moveDown(0.3);
        const restrictionsSectionY = doc.y;

        // Barra lateral naranja
        doc.rect(50, restrictionsSectionY, 4, 30).fill('#f97316');

        // Título
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ea580c').text(
          cleanText('RESTRICCIONES / LIMITACIONES'),
          60, restrictionsSectionY + 2
        );

        const restrictionsBoxY = restrictionsSectionY + 15;

        // Fondo de restricciones
        doc.rect(50, restrictionsBoxY, contentWidth, 40).fillAndStroke('#fff7ed', '#fed7aa');

        doc.font('Helvetica').fontSize(7).fillColor('#000000').text(
          cleanText(params.restrictions || 'Ninguna registrada'),
          60, restrictionsBoxY + 10,
          { align: 'justify', width: contentWidth - 20 }
        );

        doc.moveDown(0.5);
      }

      // RECOMENDACIONES (si aplica)
      if (params.recommendations) {
        doc.moveDown(0.3);
        const recommendationsSectionY = doc.y;

        // Barra lateral azul claro
        doc.rect(50, recommendationsSectionY, 4, 30).fill('#06b6d4');

        // Título
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0891b2').text(
          cleanText('RECOMENDACIONES'),
          60, recommendationsSectionY + 2
        );

        const recommendationsBoxY = recommendationsSectionY + 15;

        // Fondo de recomendaciones
        doc.rect(50, recommendationsBoxY, contentWidth, 40).fillAndStroke('#ecfeff', '#a5f3fc');

        doc.font('Helvetica').fontSize(7).fillColor('#000000').text(
          cleanText(params.recommendations),
          60, recommendationsBoxY + 10,
          { align: 'justify', width: contentWidth - 20 }
        );

        doc.moveDown(0.5);
      }

      // Observaciones generales (nuevo)
      this.addGeneralObservations(doc, contentWidth);

      doc.moveDown(0.5);

      // Nota legal con diseño moderno
      const noteY = doc.y;
      doc.rect(50, noteY, contentWidth, 25).fill('#f8fafc').stroke('#cbd5e1');
      doc.font('Helvetica').fontSize(5).fillColor('#475569').text(
        cleanText(footerNote()),
        60, noteY + 5,
        { align: 'justify', width: contentWidth - 20, lineGap: 1 }
      );

      doc.moveDown(0.5);
      doc.fillColor('#000000');

      // SECCIÓN DE FIRMAS - Diseño moderno
      const signatureY = doc.y + 20;
      const fullPageWidth = doc.page.width;

      // Firma Izquierda: Profesional
      doc.font('Helvetica').fontSize(8);

      // Si el doctor tiene firma digital, insertarla
      if (doctor.signature_path) {
        try {
          console.log('✍️ Doctor tiene firma digital configurada:', doctor.signature_path);
          const signaturePath = this.resolvePublicPath(doctor.signature_path);
          console.log('🔍 Ruta completa construida:', signaturePath);

          const signBuffer = await this.convertImageForPDF(signaturePath);
          if (signBuffer) {
            console.log('✅ Firma del médico cargada exitosamente, insertando en PDF');
            doc.image(signBuffer, 60, signatureY - 10, { width: 150, height: 40, align: 'left' });
            doc.text(cleanText(doctor.name), 60, signatureY + 35);
            doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 48);
            doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 61);
          } else {
            // Fallback si no se pudo cargar la imagen
            console.warn('⚠️ No se pudo cargar la firma del médico, usando fallback de texto');
            doc.text('____________________________', 60, signatureY);
            doc.text(cleanText(doctor.name), 60, signatureY + 15);
            doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 28);
            doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 41);
          }
        } catch (error) {
          console.error('❌ Error cargando firma del médico:', error);
          // Fallback a texto si hay error
          doc.text('____________________________', 60, signatureY);
          doc.text(cleanText(doctor.name), 60, signatureY + 15);
          doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 28);
          doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 41);
        }
      } else {
        // Sin firma digital, usar línea tradicional
        console.log('ℹ️ Doctor sin firma digital configurada');
        doc.text('____________________________', 60, signatureY);
        doc.text(cleanText(doctor.name), 60, signatureY + 15);
        doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 28);
        doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 41);
      }
      
      // Firma Derecha: Firma del Paciente
      const rightSigX = fullPageWidth - 250;

      // Si el paciente tiene firma digital, insertarla
      if (patient.signature_path) {
        try {
          const patientSignaturePath = this.resolvePublicPath(patient.signature_path);
          const patientSigBuffer = await this.convertImageForPDF(patientSignaturePath);
          if (patientSigBuffer) {
            doc.image(patientSigBuffer, rightSigX, signatureY - 10, { width: 150, height: 40, align: 'left' });
            doc.text(cleanText(patient.name), rightSigX, signatureY + 35);
            doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 48);
            doc.text(cleanText('Paciente'), rightSigX, signatureY + 61);
          } else {
            // Fallback si no se pudo cargar la imagen
            doc.text('____________________________', rightSigX, signatureY);
            doc.text(cleanText(patient.name), rightSigX, signatureY + 15);
            doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 28);
            doc.text(cleanText('Paciente'), rightSigX, signatureY + 41);
          }
        } catch (error) {
          console.error('Error cargando firma del paciente:', error);
          // Fallback a texto si hay error
          doc.text('____________________________', rightSigX, signatureY);
          doc.text(cleanText(patient.name), rightSigX, signatureY + 15);
          doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 28);
          doc.text(cleanText('Paciente'), rightSigX, signatureY + 41);
        }
      } else {
        // Sin firma digital, usar línea tradicional
        doc.text('____________________________', rightSigX, signatureY);
        doc.text(cleanText(patient.name), rightSigX, signatureY + 15);
        doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 28);
        doc.text(cleanText('Paciente'), rightSigX, signatureY + 41);
      }

      // CÓDIGO QR Y VERIFICACIÓN - Diseño moderno
      doc.y = signatureY + 110;

      const qrSectionY = doc.y;

      // Fondo para sección QR
      doc.rect(50, qrSectionY, contentWidth, 75).fill('#fafafa').stroke('#e5e7eb');

      // QR a la izquierda
      const qrX = 70;
      const qrSize = 60;
      doc.image(qrBuffer, qrX, qrSectionY + 8, { fit: [qrSize, qrSize] });

      // Información de verificación a la derecha
      const textX = qrX + qrSize + 20;
      const textWidth = contentWidth - (qrSize + 50);

      doc.font('Helvetica-Bold').fontSize(7).fillColor('#1e3a8a').text(
        cleanText('VERIFICACIÓN DEL CERTIFICADO'),
        textX, qrSectionY + 12
      );

      doc.font('Helvetica').fontSize(6).fillColor('#374151').text(
        cleanText('Escanee el código QR para verificar la autenticidad de este certificado'),
        textX, qrSectionY + 24,
        { width: textWidth }
      );

      doc.fontSize(5).fillColor('#6b7280').text(
        cleanText(`URL de verificación:`),
        textX, qrSectionY + 40
      );

      doc.fontSize(5).fillColor('#3b82f6').text(
        cleanText(`${verificationUrl}`),
        textX, qrSectionY + 48,
        { width: textWidth, link: verificationUrl }
      );

      doc.fontSize(5).fillColor('#6b7280').text(
        cleanText(`Versión móvil: ${baseUrl()}/certificates/mobile?code=${encodeURIComponent(verificationCode)}`),
        textX, qrSectionY + 58,
        { width: textWidth }
      );

      doc.fillColor('#000000');

        doc.end();
      });
    } catch (error: any) {
      console.error('Error emitiendo certificado:', error);
      return { success: false, message: 'Error al emitir certificado' };
    }
  }

  static async getCertificateByCode(code: string) {
    const [rows] = await db.execute(
      `SELECT wc.*,
              p.name as patient_name,
              p.document_type,
              p.document_number,
              COALESCE(c.name, p.company) as company,
              c.responsible_name as company_responsible,
              p.occupation,
              p.date_of_birth,
              p.signature_path as patient_signature_path,
              u.name as doctor_name,
              a.appointment_type,
              a.appointment_date
       FROM work_certificates wc
       LEFT JOIN patients p ON wc.patient_id = p.id
       LEFT JOIN companies c ON p.company_id = c.id
       LEFT JOIN users u ON wc.doctor_id = u.id
       LEFT JOIN appointments a ON wc.appointment_id = a.id
       WHERE wc.verification_code = ?`,
      [code]
    );
    const arr = rows as any[];
    return arr.length > 0 ? arr[0] : null;
  }

  static async renderPDFFromRecord(record: any): Promise<Buffer> {
    const patient = await this.getPatientSummary(record.patient_id);
    const doctor = await this.getDoctorSummary(record.doctor_id);
    const verificationUrl = `${baseUrl()}/certificates/verify?code=${encodeURIComponent(record.verification_code)}`;
    const qrBuffer = await QRCode.toBuffer(verificationUrl, { 
      type: 'png', 
      width: 300,  // Optimizado para rendimiento
      errorCorrectionLevel: 'M',  // Corrección media para mejor rendimiento
      margin: 4,  // Margen estándar
      color: { 
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const doc = new PDFDocument({ size: 'LEGAL', margin: 50 });
    const chunks: Buffer[] = [];

    return await new Promise(async (resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // ENCABEZADO MODERNO CON BANNER
      const pageWidth = doc.page.width - 100;
      const contentWidth = doc.page.width - 100;

      // Banner superior con gradiente
      const headerY = 50;
      const headerHeight = 70;
      doc.rect(50, headerY, pageWidth, headerHeight).fill('#1e3a8a').stroke('#1e40af');

      // Título principal en el banner
      doc.fillColor('#FFFFFF');
      doc.font('Helvetica-Bold').fontSize(14).text(
        cleanText('CERTIFICADO DE APTITUD LABORAL'),
        50, headerY + 20,
        { align: 'center', width: pageWidth }
      );

      doc.font('Helvetica').fontSize(8).text(
        cleanText('Sistema de Salud Ocupacional'),
        50, headerY + 42,
        { align: 'center', width: pageWidth }
      );

      // Línea decorativa dorada
      doc.strokeColor('#fbbf24').lineWidth(2);
      doc.moveTo(150, headerY + 58).lineTo(pageWidth - 50, headerY + 58).stroke();

      doc.y = headerY + headerHeight + 20;
      doc.fillColor('#000000').strokeColor('#000000');

      // Información de vigencia (si existe)
      if (record.validity_start || record.validity_end) {
        const infoBoxY = doc.y;

        // Fondo con sombra
        doc.rect(50, infoBoxY, pageWidth, 35).fill('#f8fafc').stroke('#cbd5e1');

        doc.fillColor('#334155');
        doc.font('Helvetica-Bold').fontSize(7).text(cleanText('VIGENCIA'), 60, infoBoxY + 10);
        doc.font('Helvetica').fontSize(8).fillColor('#000000').text(
          cleanText(`${record.validity_start ? dayjs(record.validity_start).format('DD/MM/YYYY') : '-'} a ${record.validity_end ? dayjs(record.validity_end).format('DD/MM/YYYY') : '-'}`),
          60, infoBoxY + 22
        );

        doc.y = infoBoxY + 40;
        doc.fillColor('#000000');
      }

      // Fecha de emisión y Tipo de cita en una sola fila (2 columnas)
      const appointmentInfoY = doc.y;
      const colWidth = pageWidth / 2;

      // Fecha de emisión
      const certificateDate = record.certificate_date || record.created_at || new Date();
      const emissionX = 50;
      doc.rect(emissionX, appointmentInfoY, colWidth - 5, 28).fill('#f0fdf4').stroke('#86efac');
      doc.fillColor('#166534');
      doc.font('Helvetica-Bold').fontSize(6).text(cleanText('FECHA DE EMISIÓN'), emissionX + 10, appointmentInfoY + 6);
      doc.fillColor('#000000');
      doc.font('Helvetica').fontSize(7).text(cleanText(dayjs(certificateDate).format('DD/MM/YYYY')), emissionX + 10, appointmentInfoY + 16);

      // Tipo de cita (si existe)
      if (record.appointment_type) {
        const appointmentTypeMap: Record<string, string> = {
          'examen_periodico': 'Examen Médico Periódico',
          'examen_ingreso': 'Examen de Ingreso',
          'examen_egreso': 'Examen de Egreso',
          'examen_reintegro': 'Examen de Reintegro',
          'consulta_general': 'Consulta General',
          'consulta_especializada': 'Consulta Especializada',
          'seguimiento': 'Seguimiento',
          'urgencias': 'Urgencias'
        };
        const appointmentTypeText = appointmentTypeMap[record.appointment_type] || record.appointment_type;

        const typeBoxX = 50 + colWidth;
        doc.rect(typeBoxX, appointmentInfoY, colWidth - 5, 28).fill('#dbeafe').stroke('#3b82f6');
        doc.fillColor('#1e3a8a');
        doc.font('Helvetica-Bold').fontSize(6).text(cleanText('TIPO DE CITA'), typeBoxX + 10, appointmentInfoY + 6);
        doc.fillColor('#000000');
        doc.font('Helvetica').fontSize(7).text(cleanText(appointmentTypeText), typeBoxX + 10, appointmentInfoY + 16, { width: colWidth - 25 });
      }

      doc.y = appointmentInfoY + 35;
      doc.fillColor('#000000');

      // DATOS DEL PACIENTE - Diseño moderno con barra lateral
      doc.moveDown(0.3);
      const patientSectionY = doc.y;

      // Barra lateral azul
      doc.rect(50, patientSectionY, 4, 60).fill('#3b82f6');

      // Título
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a8a').text(
        cleanText('DATOS DEL PACIENTE'),
        60, patientSectionY + 2
      );

      const patientTableY = patientSectionY + 15;

      // Fondo blanco con borde
      doc.rect(50, patientTableY, contentWidth, 50).fill('#ffffff').stroke('#e2e8f0');
      doc.fillColor('#000000');

      // Grid de información - 3 columnas
      const col1X = 60;
      const col2X = 220;
      const col3X = 380;

      // Fila 1
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Nombre Completo'), col1X, patientTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient?.name || 'N/D'), col1X, patientTableY + 18, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Documento'), col2X, patientTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(`${patient?.document_type || ''} ${patient?.document_number || ''}`), col2X, patientTableY + 18);

      // Fila 2
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Fecha de Nacimiento'), col1X, patientTableY + 32);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient?.date_of_birth ? dayjs(patient.date_of_birth).format('DD/MM/YYYY') : 'N/A'), col1X, patientTableY + 42);

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Empresa'), col2X, patientTableY + 32);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient?.company || 'N/A'), col2X, patientTableY + 42, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Ocupación'), col3X, patientTableY + 32);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(patient?.occupation || 'N/A'), col3X, patientTableY + 42, { width: 130 });

      // DATOS DEL PROFESIONAL - Diseño moderno
      doc.y = patientTableY + 60;
      const doctorSectionY = doc.y;

      // Barra lateral verde
      doc.rect(50, doctorSectionY, 4, 50).fill('#10b981');

      // Título
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#065f46').text(
        cleanText('PROFESIONAL EVALUADOR'),
        60, doctorSectionY + 2
      );

      const doctorTableY = doctorSectionY + 15;

      doc.rect(50, doctorTableY, contentWidth, 40).fill('#ffffff').stroke('#e2e8f0');
      doc.fillColor('#000000');

      // Grid de información
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Nombre Completo'), col1X, doctorTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor?.name || 'N/D'), col1X, doctorTableY + 18, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Especialidad'), col2X, doctorTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor?.specialization || 'N/A'), col2X, doctorTableY + 18, { width: 150 });

      doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text(cleanText('Registro Profesional'), col3X, doctorTableY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#000000').text(cleanText(doctor?.professional_license || 'N/A'), col3X, doctorTableY + 18);

      doc.y = doctorTableY + 45;
      doc.fillColor('#000000');

      // RESULTADO DE APTITUD - Diseño destacado
      doc.moveDown(0.4);
      const aptitudeSectionY = doc.y;

      const statusMap: Record<AptitudeStatus, string> = {
        'apto': 'APTO PARA EL TRABAJO',
        'apto_con_restricciones': 'APTO CON RESTRICCIONES',
        'apto_manipulacion_alimentos': 'APTO PARA MANIPULACIÓN DE ALIMENTOS',
        'apto_trabajo_alturas': 'APTO PARA TRABAJO EN ALTURAS',
        'apto_espacios_confinados': 'APTO PARA ESPACIOS CONFINADOS',
        'apto_conduccion': 'APTO PARA CONDUCCIÓN'
      };

      // Colores según estado
      let bgColor = '#d1fae5'; // verde claro
      let borderColor = '#10b981'; // verde
      let textColor = '#065f46'; // verde oscuro
      let barColor = '#10b981'; // verde

      if (record.aptitude_status === 'apto_con_restricciones') {
        bgColor = '#fef3c7'; // amarillo claro
        borderColor = '#f59e0b'; // amarillo
        textColor = '#92400e'; // amarillo oscuro
        barColor = '#f59e0b'; // amarillo
      }

      // Barra lateral de estado
      doc.rect(50, aptitudeSectionY, 6, 45).fill(barColor);

      // Título
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(
        cleanText('RESULTADO DE APTITUD'),
        62, aptitudeSectionY + 2
      );

      const resultY = aptitudeSectionY + 15;

      // Caja de resultado con diseño moderno
      doc.rect(50, resultY, contentWidth, 35).fill(bgColor).stroke(borderColor);
      doc.lineWidth(2);

      // Texto del resultado centrado y destacado
      doc.font('Helvetica-Bold').fontSize(11).fillColor(textColor).text(
        cleanText(statusMap[record.aptitude_status as AptitudeStatus] || 'NO DEFINIDO'),
        60, resultY + 12,
        { align: 'center', width: contentWidth - 20 }
      );

      doc.y = resultY + 40;
      doc.fillColor('#000000').strokeColor('#000000').lineWidth(1);

      // RESTRICCIONES (si aplica)
      if (record.aptitude_status === 'apto_con_restricciones') {
        doc.moveDown(0.3);
        const restrictionsSectionY = doc.y;

        // Barra lateral naranja
        doc.rect(50, restrictionsSectionY, 4, 30).fill('#f97316');

        // Título
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ea580c').text(
          cleanText('RESTRICCIONES / LIMITACIONES'),
          60, restrictionsSectionY + 2
        );

        const restrictionsBoxY = restrictionsSectionY + 15;

        // Fondo de restricciones
        doc.rect(50, restrictionsBoxY, contentWidth, 40).fillAndStroke('#fff7ed', '#fed7aa');

        doc.font('Helvetica').fontSize(7).fillColor('#000000').text(
          cleanText(record.restrictions || 'Ninguna registrada'),
          60, restrictionsBoxY + 10,
          { align: 'justify', width: contentWidth - 20 }
        );

        doc.moveDown(0.5);
      }

      // RECOMENDACIONES (si aplica)
      if (record.recommendations) {
        doc.moveDown(0.3);
        const recommendationsSectionY = doc.y;

        // Barra lateral azul claro
        doc.rect(50, recommendationsSectionY, 4, 30).fill('#06b6d4');

        // Título
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0891b2').text(
          cleanText('RECOMENDACIONES'),
          60, recommendationsSectionY + 2
        );

        const recommendationsBoxY = recommendationsSectionY + 15;

        // Fondo de recomendaciones
        doc.rect(50, recommendationsBoxY, contentWidth, 40).fillAndStroke('#ecfeff', '#a5f3fc');

        doc.font('Helvetica').fontSize(7).fillColor('#000000').text(
          cleanText(record.recommendations),
          60, recommendationsBoxY + 10,
          { align: 'justify', width: contentWidth - 20 }
        );

        doc.moveDown(0.5);
      }

      // Observaciones generales (nuevo)
      this.addGeneralObservations(doc, contentWidth);

      doc.moveDown(0.5);

      // Nota legal con diseño moderno
      const noteY = doc.y;
      doc.rect(50, noteY, contentWidth, 25).fill('#f8fafc').stroke('#cbd5e1');
      doc.font('Helvetica').fontSize(5).fillColor('#475569').text(
        cleanText(footerNote()),
        60, noteY + 5,
        { align: 'justify', width: contentWidth - 20, lineGap: 1 }
      );

      doc.moveDown(0.5);
      doc.fillColor('#000000');

      // SECCIÓN DE FIRMAS - Diseño moderno
      const signatureY = doc.y + 20;
      const fullPageWidth = doc.page.width;

      // Firma Izquierda: Profesional
      doc.font('Helvetica').fontSize(8);

      // Si el doctor tiene firma digital, insertarla
      if (doctor?.signature_path) {
        try {
          console.log('✍️ [renderPDFFromRecord] Doctor tiene firma digital configurada:', doctor.signature_path);
          const signaturePath = this.resolvePublicPath(doctor.signature_path);
          console.log('🔍 [renderPDFFromRecord] Ruta completa construida:', signaturePath);

          const signBuffer = await this.convertImageForPDF(signaturePath);
          if (signBuffer) {
            console.log('✅ [renderPDFFromRecord] Firma del médico cargada exitosamente, insertando en PDF');
            doc.image(signBuffer, 60, signatureY - 10, { width: 150, height: 40, align: 'left' });
            doc.text(cleanText(doctor.name || ''), 60, signatureY + 35);
            doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 48);
            doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 61);
          } else {
            // Fallback si no se pudo cargar la imagen
            console.warn('⚠️ [renderPDFFromRecord] No se pudo cargar la firma del médico, usando fallback de texto');
            doc.text('____________________________', 60, signatureY);
            doc.text(cleanText(doctor.name || ''), 60, signatureY + 15);
            doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 28);
            doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 41);
          }
        } catch (error) {
          console.error('❌ [renderPDFFromRecord] Error cargando firma del médico:', error);
          // Fallback a texto si hay error
          doc.text('____________________________', 60, signatureY);
          doc.text(cleanText(doctor.name || ''), 60, signatureY + 15);
          doc.text(cleanText(`C.C. ${doctor.document_number || 'N/A'}`), 60, signatureY + 28);
          doc.text(cleanText(`Registro No: ${doctor.professional_license || 'N/A'}`), 60, signatureY + 41);
        }
      } else {
        // Sin firma digital, usar línea tradicional
        console.log('ℹ️ [renderPDFFromRecord] Doctor sin firma digital configurada');
        doc.text('____________________________', 60, signatureY);
        doc.text(cleanText(doctor?.name || ''), 60, signatureY + 15);
        doc.text(cleanText(`C.C. ${doctor?.document_number || 'N/A'}`), 60, signatureY + 28);
        doc.text(cleanText(`Registro No: ${doctor?.professional_license || 'N/A'}`), 60, signatureY + 41);
      }

      // Firma Derecha: Firma del Paciente
      const rightSigX = fullPageWidth - 250;

      // Si el paciente tiene firma digital, insertarla
      if (patient?.signature_path) {
        try {
          const patientSignaturePath = this.resolvePublicPath(patient.signature_path);
          const patientSigBuffer = await this.convertImageForPDF(patientSignaturePath);
          if (patientSigBuffer) {
            doc.image(patientSigBuffer, rightSigX, signatureY - 10, { width: 150, height: 40, align: 'left' });
            doc.text(cleanText(patient.name || ''), rightSigX, signatureY + 35);
            doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 48);
            doc.text(cleanText('Paciente'), rightSigX, signatureY + 61);
          } else {
            // Fallback si no se pudo cargar la imagen
            doc.text('____________________________', rightSigX, signatureY);
            doc.text(cleanText(patient.name || ''), rightSigX, signatureY + 15);
            doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 28);
            doc.text(cleanText('Paciente'), rightSigX, signatureY + 41);
          }
        } catch (error) {
          console.error('Error cargando firma del paciente:', error);
          // Fallback a texto si hay error
          doc.text('____________________________', rightSigX, signatureY);
          doc.text(cleanText(patient.name || ''), rightSigX, signatureY + 15);
          doc.text(cleanText(`${patient.document_type || 'C.C.'} ${patient.document_number || 'N/A'}`), rightSigX, signatureY + 28);
          doc.text(cleanText('Paciente'), rightSigX, signatureY + 41);
        }
      } else {
        // Sin firma digital, usar línea tradicional
        doc.text('____________________________', rightSigX, signatureY);
        doc.text(cleanText(patient?.name || ''), rightSigX, signatureY + 15);
        doc.text(cleanText(`${patient?.document_type || 'C.C.'} ${patient?.document_number || 'N/A'}`), rightSigX, signatureY + 28);
        doc.text(cleanText('Paciente'), rightSigX, signatureY + 41);
      }

      // CÓDIGO QR Y VERIFICACIÓN - Diseño moderno
      doc.y = signatureY + 110;

      const qrSectionY = doc.y;

      // Fondo para sección QR
      doc.rect(50, qrSectionY, contentWidth, 75).fill('#fafafa').stroke('#e5e7eb');

      // QR a la izquierda
      const qrX = 70;
      const qrSize = 60;
      doc.image(qrBuffer, qrX, qrSectionY + 8, { fit: [qrSize, qrSize] });

      // Información de verificación a la derecha
      const textX = qrX + qrSize + 20;
      const textWidth = contentWidth - (qrSize + 50);

      doc.font('Helvetica-Bold').fontSize(7).fillColor('#1e3a8a').text(
        cleanText('VERIFICACIÓN DEL CERTIFICADO'),
        textX, qrSectionY + 12
      );

      doc.font('Helvetica').fontSize(6).fillColor('#374151').text(
        cleanText('Escanee el código QR para verificar la autenticidad de este certificado'),
        textX, qrSectionY + 24,
        { width: textWidth }
      );

      doc.fontSize(5).fillColor('#6b7280').text(
        cleanText(`Código de verificación:`),
        textX, qrSectionY + 40
      );

      doc.fontSize(6).fillColor('#3b82f6').text(
        cleanText(`${record.verification_code}`),
        textX, qrSectionY + 48,
        { width: textWidth }
      );

      doc.fontSize(5).fillColor('#6b7280').text(
        cleanText(`Este certificado puede ser validado en línea escaneando el código QR`),
        textX, qrSectionY + 58,
        { width: textWidth }
      );

      doc.fillColor('#000000');

      doc.end();
    });
  }
}

function footerNote(): string {
  return process.env.OMS_FOOTER_NOTE || 'Nota: Este certificado se emite siguiendo prácticas de salud ocupacional y principios de evaluación de aptitud laboral, considerando recomendaciones generales de la OMS y la OIT, e información clínico-laboral disponible al momento de la evaluación.';
}
