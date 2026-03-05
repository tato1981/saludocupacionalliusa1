import { db } from './database';
import { hashPassword, verifyPassword, generateToken } from './auth';
import type { User, RegisterData, LoginCredentials } from '../types';

export class UserService {
  // Registrar nuevo usuario
  static async register(userData: RegisterData): Promise<{ user: User; token: string }> {
    try {
      // Verificar si el usuario ya existe
      const [existingUsers] = await db.execute(
        'SELECT id FROM users WHERE email = ?',
        [userData.email]
      );
      
      if (Array.isArray(existingUsers) && existingUsers.length > 0) {
        throw new Error('El usuario ya existe');
      }

      // Hash de la contraseña
      const passwordHash = await hashPassword(userData.password);

      // Insertar nuevo usuario
      const [result] = await db.execute(
        `INSERT INTO users (email, password_hash, name, role, phone, company_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userData.email,
          passwordHash,
          userData.name,
          userData.role || 'staff',
          userData.phone || null,
          userData.company_id || null
        ]
      );

      const insertResult = result as any;
      const userId = insertResult.insertId;

      // Obtener usuario creado
      const [users] = await db.execute(
        'SELECT id, email, name, role, phone, company_id, created_at FROM users WHERE id = ?',
        [userId]
      );

      const userArray = users as User[];
      const user = userArray[0];

      // Generar token
      const token = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_id: user.company_id
      });

      return { user, token };
    } catch (error) {
      console.error('Error en registro:', error);
      throw error;
    }
  }

  // Login de usuario
  static async login(credentials: LoginCredentials): Promise<{ user: User; token: string }> {
    try {
      // Buscar usuario por email
      const [users] = await db.execute(
        `SELECT id, email, password_hash, name, role, phone, is_active, created_at, company_id 
         FROM users WHERE email = ?`,
        [credentials.email]
      );

      const userArray = users as User[];
      if (userArray.length === 0) {
        console.log(`Login failed: User not found for email ${credentials.email}`);
        throw new Error('Credenciales inválidas');
      }

      const user = userArray[0];

      // Verificar si el usuario está activo
      if (!user.is_active) {
        console.log(`Login failed: User ${credentials.email} is inactive`);
        throw new Error('Usuario inactivo');
      }

      // Verificar contraseña
      const isValid = await verifyPassword(credentials.password, user.password_hash);
      if (!isValid) {
        console.log(`Login failed: Invalid password for user ${credentials.email}`);
        throw new Error('Credenciales inválidas');
      }

      // Actualizar último login
      await db.execute(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      // Generar token
      const token = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        company_id: user.company_id
      });

      // Remover password_hash del objeto usuario
      const { password_hash, ...userWithoutPassword } = user;

      return { user: userWithoutPassword as User, token };
    } catch (error) {
      console.error('Error en login:', error);
      throw error;
    }
  }

  // Obtener usuario por ID
  static async getUserById(id: number): Promise<User | null> {
    try {
      const [users] = await db.execute(
        'SELECT id, email, name, role, phone, is_active, created_at FROM users WHERE id = ?',
        [id]
      );

      const userArray = users as User[];
      return userArray.length > 0 ? userArray[0] : null;
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
      return null;
    }
  }
}