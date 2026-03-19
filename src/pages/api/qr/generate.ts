import type { APIRoute } from 'astro';
import QRCode from 'qrcode';

export const GET: APIRoute = async ({ url }) => {
  try {
    const text = new URL(url).searchParams.get('text');
    const size = parseInt(new URL(url).searchParams.get('size') || '400');
    const mobile = new URL(url).searchParams.get('mobile') === 'true';
    
    if (!text) {
      return new Response(JSON.stringify({ success: false, message: 'text parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Configuración optimizada para móviles
    const options = {
      type: 'png' as const,
      width: mobile ? Math.max(size, 400) : size,
      errorCorrectionLevel: 'H' as const,  // Máxima corrección de errores para móviles
      margin: mobile ? 6 : 4,  // Margen mayor para móviles
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      scale: mobile ? 6 : 4  // Mayor escala para móviles
    };

    const qrBuffer = await QRCode.toBuffer(text, options);

    return new Response(qrBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000', // Cache 1 año
        'Content-Disposition': 'inline; filename="qr-code.png"'
      }
    });

  } catch (error) {
    console.error('Error generating QR code:', error);
    return new Response(JSON.stringify({ success: false, message: 'Error generating QR code' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
