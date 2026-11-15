import { db } from './database';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

// Nombre del archivo con la fecha/hora exacta de la descarga
export function buildBackupFilename(date: Date = new Date()): string {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `backup_${stamp}.sql`;
}

// Genera un respaldo general (.sql) con estructura y datos de todas las tablas
export async function generateSqlDump(): Promise<{ filename: string; content: string }> {
  const now = new Date();
  const filename = buildBackupFilename(now);
  const parts: string[] = [];

  parts.push('-- ------------------------------------------------------------');
  parts.push('-- Respaldo general de base de datos');
  parts.push(`-- Base de datos: ${process.env.DB_NAME || 'database'}`);
  parts.push(`-- Generado: ${now.toISOString()}`);
  parts.push('-- ------------------------------------------------------------');
  parts.push('');
  parts.push('SET NAMES utf8mb4;');
  parts.push('SET FOREIGN_KEY_CHECKS = 0;');
  parts.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
  parts.push('');

  const [tableRows] = await db.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  const tables = (tableRows as any[]).map((row) => String(Object.values(row)[0]));

  for (const table of tables) {
    const [createRows] = await db.query(`SHOW CREATE TABLE \`${table}\``);
    const createSql = (createRows as any[])[0]?.['Create Table'] as string | undefined;
    if (!createSql) continue;

    parts.push(`-- Estructura de la tabla \`${table}\``);
    parts.push(`DROP TABLE IF EXISTS \`${table}\`;`);
    parts.push(`${createSql};`);
    parts.push('');

    const [rows] = await db.query(`SELECT * FROM \`${table}\``);
    const rowList = rows as any[];
    if (rowList.length > 0) {
      const columns = Object.keys(rowList[0]);
      const columnList = columns.map((c) => `\`${c}\``).join(', ');
      parts.push(`-- Datos de la tabla \`${table}\``);
      for (const row of rowList) {
        const values = columns.map((col) => db.escape(row[col])).join(', ');
        parts.push(`INSERT INTO \`${table}\` (${columnList}) VALUES (${values});`);
      }
      parts.push('');
    }
  }

  parts.push('SET FOREIGN_KEY_CHECKS = 1;');
  parts.push('');

  return { filename, content: parts.join('\n') };
}
