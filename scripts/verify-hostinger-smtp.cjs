require('dotenv').config();
const nodemailer = require('nodemailer');

async function verify() {
    console.log('--- Verificando Configuración SMTP de Hostinger ---');

    const config = {
        host: '172.65.255.143', // Usamos IP directa para evitar problemas de DNS
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        },
        tls: {
            servername: 'smtp.hostinger.com' // Necesario para verificar el certificado SSL correctamente
        },
        debug: true, // Mostrar logs de depuración
        // logger: true // Mostrar logs de conexión
    };

    console.log('Configuración cargada (sin contraseña):', {
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.auth.user
    });

    if (!config.host || !config.auth.user || !config.auth.pass) {
        console.error('❌ Error: Faltan variables de entorno. Asegúrate de que .env tiene SMTP_HOST, SMTP_USER y SMTP_PASSWORD.');
        process.exit(1);
    }

    try {
        const transporter = nodemailer.createTransport(config);

        console.log('1. Verificando conexión con el servidor SMTP...');
        await transporter.verify();
        console.log('✅ Conexión SMTP exitosa.');

        console.log('2. Intentando enviar un correo de prueba...');
        const info = await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'Test'}" <${process.env.SMTP_FROM_EMAIL || config.auth.user}>`,
            to: config.auth.user, // Enviarse a sí mismo para probar
            subject: 'Prueba de Verificación SMTP Hostinger',
            text: 'Si recibes este correo, la configuración SMTP de Hostinger está funcionando correctamente.',
            html: '<b>Si recibes este correo, la configuración SMTP de Hostinger está funcionando correctamente.</b>'
        });

        console.log('✅ Correo enviado correctamente.');
        console.log('Message ID:', info.messageId);
        console.log('Respuesta del servidor:', info.response);

    } catch (error) {
        console.error('❌ Error durante la verificación:');
        console.error(error);
        if (error.code === 'EAUTH') {
            console.error('⚠️  Error de autenticación: Verifica tu usuario y contraseña.');
        } else if (error.code === 'ESOCKET') {
            console.error('⚠️  Error de conexión: Verifica el host y el puerto (465 para SSL/TLS).');
        }
        process.exit(1);
    }
}

verify();
