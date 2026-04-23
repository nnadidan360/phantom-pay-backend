import fs from 'fs';
import path from 'path';
import { pool } from './client';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Ensure the tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Read all up migration files (exclude .down.sql)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();

    for (const filename of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename]
      );

      if (rows.length > 0) {
        continue; // already applied
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`[migrate] Applied: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`[migrate] Failed to apply ${filename}: ${err}`);
      }
    }
  } finally {
    client.release();
  }
}
