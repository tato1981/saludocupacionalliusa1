// Validar email
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validar contraseña (mínimo 6 caracteres)
export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}

// Formatear respuestas API
export function apiResponse(success: boolean, message: string, data?: any) {
  return {
    success,
    message,
    data: data || null,
    timestamp: new Date().toISOString()
  };
}