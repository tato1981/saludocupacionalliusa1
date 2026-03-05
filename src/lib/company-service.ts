import { db } from './database.js';

export type Company = {
  id: number;
  name: string;
  nit?: string | null;
  address?: string | null;
  phone?: string | null;
  responsible_name?: string | null;
  email?: string | null;
  status?: 'active' | 'inactive';
  contact_count?: number;
  created_at?: string;
};

export type CompanyContact = {
  id: number;
  company_id: number;
  name?: string | null;
  email: string;
  active: number;
};

export type CompanyCreateData = {
  name: string;
  nit?: string;
  address?: string;
  phone?: string;
  responsible_name?: string;
  email?: string;
  status?: 'active' | 'inactive';
};

export type CompanyUpdateData = Partial<CompanyCreateData>;

export class CompanyService {
  // Listar empresas con información completa
  static async listCompanies(search?: string): Promise<Company[]> {
    try {
      let query = `
        SELECT 
          c.id, c.name, c.nit, c.address, c.phone, c.responsible_name, c.email, c.status, c.created_at,
          COUNT(cc.id) as contact_count
        FROM companies c
        LEFT JOIN company_contacts cc ON c.id = cc.company_id AND cc.active = 1
      `;
      
      const params: any[] = [];
      
      if (search) {
        query += ` WHERE c.name LIKE ? OR c.responsible_name LIKE ? OR c.email LIKE ?`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }
      
      query += ` GROUP BY c.id ORDER BY c.name ASC`;
      
      const [rows] = await db.execute(query, params);
      return rows as Company[];
    } catch (error) {
      console.error('Error listando empresas:', error);
      return [];
    }
  }

  // Obtener empresa por ID
  static async getCompanyById(id: number): Promise<Company | null> {
    try {
      const [rows] = await db.execute(`
        SELECT 
          c.id, c.name, c.nit, c.address, c.phone, c.responsible_name, c.email, c.status, c.created_at,
          COUNT(cc.id) as contact_count
        FROM companies c
        LEFT JOIN company_contacts cc ON c.id = cc.company_id AND cc.active = 1
        WHERE c.id = ?
        GROUP BY c.id
      `, [id]);
      
      const companies = rows as Company[];
      return companies.length > 0 ? companies[0] : null;
    } catch (error) {
      console.error('Error obteniendo empresa:', error);
      return null;
    }
  }

  // Crear empresa
  static async createCompany(data: CompanyCreateData): Promise<{ success: boolean; id?: number; message?: string }> {
    try {
      const [result] = await db.execute(
        `INSERT INTO companies (name, nit, address, phone, responsible_name, email, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name, 
          data.nit || null, 
          data.address || null, 
          data.phone || null,
          data.responsible_name || null,
          data.email || null,
          data.status || 'active'
        ]
      );
      
      const companyId = (result as any).insertId;
      
      // Si se proporciona email y nombre del responsable, crear contacto automáticamente
      if (data.email && data.responsible_name) {
        await this.addCompanyContact(companyId, data.email, data.responsible_name);
      }
      
      return { success: true, id: companyId };
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return { success: false, message: 'La empresa ya existe' };
      }
      console.error('Error creando empresa:', error);
      return { success: false, message: 'Error creando empresa' };
    }
  }

  // Actualizar empresa
  static async updateCompany(id: number, data: CompanyUpdateData): Promise<{ success: boolean; message?: string }> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      
      if (data.name !== undefined) {
        fields.push('name = ?');
        values.push(data.name);
      }
      if (data.nit !== undefined) {
        fields.push('nit = ?');
        values.push(data.nit || null);
      }
      if (data.address !== undefined) {
        fields.push('address = ?');
        values.push(data.address || null);
      }
      if (data.phone !== undefined) {
        fields.push('phone = ?');
        values.push(data.phone || null);
      }
      if (data.responsible_name !== undefined) {
        fields.push('responsible_name = ?');
        values.push(data.responsible_name || null);
      }
      if (data.email !== undefined) {
        fields.push('email = ?');
        values.push(data.email || null);
      }
      if (data.status !== undefined) {
        fields.push('status = ?');
        values.push(data.status);
      }
      
      if (fields.length === 0) {
        return { success: false, message: 'No hay campos para actualizar' };
      }
      
      values.push(id);
      
      await db.execute(
        `UPDATE companies SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      
      return { success: true };
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return { success: false, message: 'Ya existe una empresa con ese nombre' };
      }
      console.error('Error actualizando empresa:', error);
      return { success: false, message: 'Error actualizando empresa' };
    }
  }

  // Eliminar empresa
  static async deleteCompany(id: number): Promise<{ success: boolean; message?: string }> {
    try {
      // Verificar si la empresa tiene pacientes asociados
      const [patientRows] = await db.execute(
        'SELECT COUNT(*) as count FROM patients WHERE company_id = ?',
        [id]
      );
      
      const patientCount = (patientRows as any[])[0].count;
      if (patientCount > 0) {
        return { 
          success: false, 
          message: `No se puede eliminar la empresa porque tiene ${patientCount} paciente(s) asociado(s)` 
        };
      }
      
      await db.execute('DELETE FROM companies WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      console.error('Error eliminando empresa:', error);
      return { success: false, message: 'Error eliminando empresa' };
    }
  }

  // Obtener estadísticas de empresas
  static async getCompanyStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    contacts: number;
  }> {
    try {
      const [totalRows] = await db.execute('SELECT COUNT(*) as count FROM companies');
      const [activeRows] = await db.execute('SELECT COUNT(*) as count FROM companies WHERE status = "active"');
      const [inactiveRows] = await db.execute('SELECT COUNT(*) as count FROM companies WHERE status = "inactive"');
      const [contactRows] = await db.execute('SELECT COUNT(*) as count FROM company_contacts WHERE active = 1');
      
      return {
        total: (totalRows as any[])[0].count,
        active: (activeRows as any[])[0].count,
        inactive: (inactiveRows as any[])[0].count,
        contacts: (contactRows as any[])[0].count
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas de empresas:', error);
      return { total: 0, active: 0, inactive: 0, contacts: 0 };
    }
  }

  // Métodos existentes para contactos
  static async getCompanyContacts(companyId: number): Promise<CompanyContact[]> {
    try {
      const [rows] = await db.execute(
        `SELECT id, company_id, name, email, active FROM company_contacts WHERE company_id = ? ORDER BY created_at DESC`,
        [companyId]
      );
      return rows as CompanyContact[];
    } catch (error) {
      console.error('Error obteniendo contactos de empresa:', error);
      return [];
    }
  }

  static async getActiveCompanyContacts(companyId: number): Promise<CompanyContact[]> {
    try {
      const [rows] = await db.execute(
        `SELECT id, company_id, name, email FROM company_contacts WHERE company_id = ? AND active = 1`,
        [companyId]
      );
      return rows as CompanyContact[];
    } catch (error) {
      console.error('Error obteniendo contactos activos de empresa:', error);
      return [];
    }
  }

  static async addCompanyContact(companyId: number, email: string, name?: string): Promise<{ success: boolean; id?: number; message?: string }> {
    try {
      const [result] = await db.execute(
        `INSERT INTO company_contacts (company_id, name, email, active) VALUES (?, ?, ?, 1)`,
        [companyId, name || null, email]
      );
      return { success: true, id: (result as any).insertId };
    } catch (error) {
      console.error('Error agregando contacto de empresa:', error);
      return { success: false, message: 'Error agregando contacto' };
    }
  }
}