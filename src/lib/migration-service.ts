import { db } from './database.js';

export class MigrationService {
  // Verificar si una columna existe en una tabla
  static async columnExists(tableName: string, columnName: string): Promise<boolean> {
    try {
      const [rows] = await db.execute(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ? 
          AND COLUMN_NAME = ?
      `, [tableName, columnName]);
      
      const result = (rows as any[])[0];
      return result.count > 0;
    } catch (error) {
      console.error(`Error verificando columna ${columnName} en tabla ${tableName}:`, error);
      return false;
    }
  }

  // Agregar columna photo_path a la tabla patients si no existe
  static async addPhotoPathColumn(): Promise<boolean> {
    try {
      const exists = await this.columnExists('patients', 'photo_path');
      
      if (exists) {
        return true;
      }

      await db.execute(`
        ALTER TABLE patients 
        ADD COLUMN photo_path VARCHAR(255) NULL 
        AFTER emergency_contact_phone
      `);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error agregando columna photo_path:', error);
      return false;
    }
  }

  // Crear tabla de certificados de aptitud si no existe
  static async createWorkCertificatesTable(): Promise<boolean> {
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS work_certificates (
          id INT AUTO_INCREMENT PRIMARY KEY,
          patient_id INT NOT NULL,
          doctor_id INT NOT NULL,
          appointment_id INT NULL,
          certificate_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          aptitude_status ENUM('apto','apto_con_restricciones','no_apto') NOT NULL,
          restrictions TEXT NULL,
          recommendations TEXT NULL,
          validity_start DATE NULL,
          validity_end DATE NULL,
          verification_code VARCHAR(64) NOT NULL UNIQUE,
          verified_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_verification_code (verification_code),
          CONSTRAINT fk_work_cert_patient FOREIGN KEY (patient_id) REFERENCES patients(id),
          CONSTRAINT fk_work_cert_doctor FOREIGN KEY (doctor_id) REFERENCES users(id),
          CONSTRAINT fk_work_cert_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      return true;
    } catch (error) {
      console.error('❌ Error creando tabla work_certificates:', error);
      return false;
    }
  }

  // Crear tablas de empresas y contactos si no existen
  static async createCompaniesTables(): Promise<boolean> {
    try {

      await db.execute(`
        CREATE TABLE IF NOT EXISTS companies (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          nit VARCHAR(100) NULL,
          address VARCHAR(255) NULL,
          phone VARCHAR(100) NULL,
          responsible_name VARCHAR(255) NULL,
          email VARCHAR(255) NULL,
          status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS company_contacts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          company_id INT NOT NULL,
          name VARCHAR(255) NULL,
          email VARCHAR(255) NOT NULL,
          active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_company (company_id),
          CONSTRAINT fk_company_contacts_company FOREIGN KEY (company_id) REFERENCES companies(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Agregar company_id a patients si no existe
      const hasCompanyId = await this.columnExists('patients', 'company_id');
      if (!hasCompanyId) {
        await db.execute(`
          ALTER TABLE patients
          ADD COLUMN company_id INT NULL AFTER occupation,
          ADD CONSTRAINT fk_patients_company FOREIGN KEY (company_id) REFERENCES companies(id)
        `);
      }

      return true;
    } catch (error) {
      console.error('❌ Error creando tablas de empresas:', error);
      return false;
    }
  }

  // Actualizar tabla companies con campos adicionales
  static async updateCompaniesTable(): Promise<boolean> {
    try {

      // Verificar y agregar responsible_name
      const hasResponsibleName = await this.columnExists('companies', 'responsible_name');
      if (!hasResponsibleName) {
        await db.execute(`
          ALTER TABLE companies 
          ADD COLUMN responsible_name VARCHAR(255) NULL AFTER phone
        `);
      }

      // Verificar y agregar email
      const hasEmail = await this.columnExists('companies', 'email');
      if (!hasEmail) {
        await db.execute(`
          ALTER TABLE companies 
          ADD COLUMN email VARCHAR(255) NULL AFTER responsible_name
        `);
      }

      // Verificar y agregar status
      const hasStatus = await this.columnExists('companies', 'status');
      if (!hasStatus) {
        await db.execute(`
          ALTER TABLE companies 
          ADD COLUMN status ENUM('active', 'inactive') NOT NULL DEFAULT 'active' AFTER email
        `);
      }

      return true;
    } catch (error) {
      console.error('❌ Error actualizando tabla companies:', error);
      return false;
    }
  }

  // Agregar columna professional_license a la tabla users si no existe
  static async addProfessionalLicenseColumn(): Promise<boolean> {
    try {
      const exists = await this.columnExists('users', 'professional_license');
      
      if (exists) {
        return true;
      }

      await db.execute(`
        ALTER TABLE users 
        ADD COLUMN professional_license VARCHAR(100) NULL 
        AFTER specialization
      `);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error agregando columna professional_license:', error);
      return false;
    }
  }

  // Ejecutar todas las migraciones necesarias
  static async runMigrations(): Promise<void> {
    try {
      // Migración 1: Agregar columna photo_path
      await this.addPhotoPathColumn();
      // Migración 2: Crear tabla de certificados de aptitud
      await this.createWorkCertificatesTable();
      // Migración 3: Crear tablas de empresas y contactos + patients.company_id
      await this.createCompaniesTables();
      // Migración 4: Actualizar tabla companies con campos adicionales
      await this.updateCompaniesTable();
      // Migración 5: Agregar columna professional_license a users
      await this.addProfessionalLicenseColumn();
      
    } catch (error) {
      console.error('❌ Error ejecutando migraciones:', error);
      throw error;
    }
  }
}