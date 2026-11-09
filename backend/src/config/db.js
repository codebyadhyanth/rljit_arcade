import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ALL_SCHEMAS } from '../models/schemas.sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const { Client, Pool } = pg;

const dbConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: String(process.env.PG_PASSWORD ?? 'root'),
  database: process.env.PG_DB || 'rljit_arcade',
};

/**
 * Ensures the target database exists by connecting to the default 'postgres' database
 * and creating 'rljit_arcade' if not present, then initializing core schemas and extensions.
 */
export async function ensureDatabaseExists() {
  const targetDb = dbConfig.database;
  const adminClient = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    const checkQuery = 'SELECT 1 FROM pg_database WHERE datname = $1';
    const res = await adminClient.query(checkQuery, [targetDb]);

    if (res.rowCount === 0) {
      const safeDbName = targetDb.replace(/"/g, '""');
      await adminClient.query(`CREATE DATABASE "${safeDbName}"`);
      console.log(`Database "${targetDb}" created successfully.`);
    }
  } finally {
    await adminClient.end();
  }

  // Ensure extensions and core tables exist
  await initDatabaseTables();
}

/**
 * Initializes required extensions, atomic sequences, and users schemas
 */
export async function initDatabaseTables() {
  const client = await pool.connect();
  try {
    for (const schemaSql of ALL_SCHEMAS) {
      await client.query(schemaSql);
    }
  } catch (err) {
    console.error('Error initializing database tables/extensions:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Connection pool connected to the target database
 */
export const pool = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export default pool;
