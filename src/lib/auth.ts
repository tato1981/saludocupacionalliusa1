import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_key_here';
const JWT_EXPIRES_IN = '7d';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  company_id?: number | null;
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
}

// Generar hash de contraseña
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Verificar contraseña
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

// Generar JWT token
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      role: user.role,
      company_id: user.company_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verificar JWT token
export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    return decoded;
  } catch (error) {
    // Silently fail
    return null;
  }
}

// Middleware para verificar autenticación
export function requireAuth(cookies: any): AuthUser | null {
  const token = cookies.get('auth-token')?.value;
  if (!token) return null;
  
  return verifyToken(token);
}

// Verificar si el usuario tiene el rol requerido
export function hasRole(user: AuthUser | null, requiredRole: string): boolean {
  if (!user) return false;
  const userRole = user.role.toLowerCase();
  if (userRole === 'superadmin' || userRole === 'admin') return true;
  return userRole === requiredRole.toLowerCase();
}

// Verificar si el usuario es admin o superadmin (tienen los mismos privilegios)
export function isAdmin(user: AuthUser | null): boolean {
  if (!user) return false;
  const userRole = user.role.toLowerCase();
  return userRole === 'superadmin' || userRole === 'admin';
}

export function isSuperAdmin(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role.toLowerCase() === 'superadmin';
}
